import NetInfo from '@react-native-community/netinfo';
import {GUEST_USER_ID} from '../../src/constants';
import {
  chatStore,
  db,
  initDatabase,
  notesStore,
  tasksStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {syncOutboxStore} from '../../src/storage/syncOutboxStore';
import {syncMetadataStore} from '../../src/storage/syncMetadataStore';
import {parseIcsString} from '../../src/storage/icsHelper';
import * as eventTime from '../../src/storage/eventTime';
import {
  authorizeDataReset,
  resetPersonalData,
} from '../../src/storage/accountDataReset';
import {noteSessionChange} from '../../src/storage/sessionEpoch';
import {cloudClient} from '../../src/cloud/cloudClient';
import {accountLinkService} from '../../src/cloud/accountLinkService';
import {createCallSpeechProvider} from '../../src/cloud/speechService';
import {VoiceConversationController} from '../../src/cloud/voiceConversation/controller';
import {callClosingKind} from '../../src/cloud/voiceConversation/turnPolicy';
import {resolveOnlineMode} from '../../src/cloud/onlineModeGate';
import {requestMeetingSummary} from '../../src/cloud/meetingService';
import {syncWorker} from '../../src/sync/syncWorker';
import {syncStateStore} from '../../src/storage/syncStateStore';
import {CLIENT_SYNC_ENTITY_TYPES} from '../../src/sync/syncEntityTypes';
import type {
  ConversationClock,
  TransportEvent,
  VoiceTransport,
} from '../../src/cloud/voiceConversation/types';

let seq = 0;
const createStudentUser = (label: string): string => {
  seq += 1;
  const id = `c1-${label}-${seq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const createFakeClock = () => {
  let now = 1_700_000_000_000;
  let nextHandle = 1;
  const scheduled = new Map<number, {at: number; fn: () => void}>();
  const clock: ConversationClock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextHandle++;
      scheduled.set(id, {at: now + Math.max(0, ms), fn});
      return id;
    },
    clearTimeout: handle => {
      scheduled.delete(handle as number);
    },
  };
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      let nextEntry: [number, {at: number; fn: () => void}] | null = null;
      for (const entry of scheduled.entries()) {
        if (
          entry[1].at <= target &&
          (!nextEntry || entry[1].at < nextEntry[1].at)
        ) {
          nextEntry = entry;
        }
      }
      if (!nextEntry) break;
      scheduled.delete(nextEntry[0]);
      now = nextEntry[1].at;
      nextEntry[1].fn();
    }
    now = target;
  };
  return {clock, advance};
};

describe('Cycle 1 audit fixes (storage, sync, cloud, voice)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    db.executeSync('DELETE FROM active_session');
    noteSessionChange();
  });

  test('C1-S01: partial reminder upsert coalescing preserves earlier due_time and source_type', () => {
    const uid = createStudentUser('rem-coalesce');
    syncOutboxStore.enqueueMutation(uid, 'reminder', 'rem-1', 'create', {
      id: 'rem-1',
      title: 'Submit Lab',
      due_time: '2026-11-30T09:00:00.000Z',
      source_type: 'task',
      status: 'pending',
    });
    syncOutboxStore.enqueueMutation(uid, 'reminder', 'rem-1', 'update', {
      status: 'acknowledged',
    });
    const pending = syncOutboxStore.getPendingMutations(uid);
    expect(pending).toHaveLength(1);
    expect(pending[0].payload).toMatchObject({
      id: 'rem-1',
      title: 'Submit Lab',
      due_time: '2026-11-30T09:00:00.000Z',
      source_type: 'task',
      status: 'acknowledged',
    });
  });

  test('C1-S01: requeueMutations with refundAttempt=true restores attempts cleanly', () => {
    const uid = createStudentUser('requeue-refund');
    syncOutboxStore.enqueueMutation(uid, 'note', 'note-1', 'create', {
      id: 'note-1',
      title: 'Hi',
      content: 'Body',
    });
    const [queued] = syncOutboxStore.getPendingMutations(uid);
    expect(queued).toBeDefined();
    syncOutboxStore.markMutationsInProgress(uid, [queued.id]);
    syncOutboxStore.requeueMutations(
      uid,
      [queued.id],
      'account',
      uid,
      undefined,
      true,
    );
    const pending = syncOutboxStore.getPendingMutations(uid);
    expect(pending).toHaveLength(1);
    expect(pending[0].attempts).toBe(0);
  });

  test('C1-S03: ICS TZID=Asia/Manila 07:30 weekly BYDAY=MO,WE + UNTIL keeps local weekdays and parses multi-RDATE/EXDATE', () => {
    const tzSpy = jest
      .spyOn(eventTime, 'deviceTimeZone')
      .mockReturnValue('Asia/Manila');
    try {
      // 1. Simple RRULE path: retains BYDAY=MO,WE (must not shift to SU,TU)
      const simpleIcs = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:cs-simple-1',
        'SUMMARY:CS 101 Lecture',
        'DTSTART;TZID=Asia/Manila:20261102T073000',
        'DTEND;TZID=Asia/Manila:20261102T090000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261111T235959Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const parsedSimple = parseIcsString(simpleIcs);
      expect(parsedSimple.blocks).toHaveLength(1);
      expect(parsedSimple.blocks[0].recurrenceRule).toContain('BYDAY=MO,WE');

      // 2. Complex expansion path with comma-separated EXDATE & RDATE
      const complexIcs = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:cs-class-1',
        'SUMMARY:CS 101 Lecture',
        'DTSTART;TZID=Asia/Manila:20261102T073000',
        'DTEND;TZID=Asia/Manila:20261102T090000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261111T235959Z',
        'EXDATE;TZID=Asia/Manila:20261104T073000,20261109T073000',
        'RDATE;TZID=Asia/Manila:20261106T073000,20261113T073000',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const parsed = parseIcsString(complexIcs);
      const dates = parsed.blocks.map(b => b.date).sort();
      // 2026-11-02 (Mon), 11-04 (Wed, excluded), 11-09 (Mon, excluded), 11-11 (Wed),
      // plus RDATE 11-06 (Fri) and 11-13 (Fri).
      expect(dates).toEqual([
        '2026-11-02',
        '2026-11-06',
        '2026-11-11',
        '2026-11-13',
      ]);
      for (const blk of parsed.blocks) {
        expect(blk.startTime).toBe('07:30');
        expect(blk.endTime).toBe('09:00');
      }
    } finally {
      tzSpy.mockRestore();
    }
  });

  test('C1-S06: guest profile/preference mutations stay local while outbox compacts guest edits cleanly', () => {
    userStore.createGuestUser();
    userStore.setCurrentUser(GUEST_USER_ID);
    userStore.set24HourFormat(GUEST_USER_ID, true);
    userStore.setDarkModeEnabled(GUEST_USER_ID, true);
    expect(
      syncOutboxStore
        .getPendingMutations(GUEST_USER_ID)
        .filter(item => item.entityType === 'profile'),
    ).toHaveLength(0);
    tasksStore.insertTask({
      id: 'guest-task-1',
      userId: GUEST_USER_ID,
      title: 'Guest Task',
      dueDate: '2026-11-26',
      dueTime: '10:00',
      priority: 'Medium',
      category: 'Academic',
      isCompleted: false,
      recurrenceRule: null,
    });
    tasksStore.updateTask({id: 'guest-task-1', title: 'Guest Task Updated'});
    const guestTaskPending = syncOutboxStore
      .getPendingMutations(GUEST_USER_ID)
      .filter(item => item.entityId === 'guest-task-1');
    expect(guestTaskPending).toHaveLength(1);
    expect(guestTaskPending[0].payload.title).toBe('Guest Task Updated');
    notesStore.insert({
      id: 'guest-note-1',
      userId: GUEST_USER_ID,
      title: 'Guest Note',
      body: 'Body',
      category: 'Personal',
      tags: [],
      isPinned: false,
      isVoiceTranscribed: false,
      sortOrder: 0,
    });
    timeBlocksStore.insert({
      id: 'guest-blk-1',
      userId: GUEST_USER_ID,
      title: 'Guest Study',
      date: '2026-11-26',
      startTime: '09:00',
      endTime: '10:00',
      color: '#3498DB',
      category: 'Study',
      recurrenceRule: null,
    });
  });

  test('C1-S07: resetPersonalData succeeds even with malformed chat JSON rows', () => {
    const uid = createStudentUser('corrupt-reset');
    userStore.setCurrentUser(uid);
    const sessionId = chatStore.ensureDefaultSession(uid);
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO messages (id, session_id, sender, content, attachment_json, metadata_json, created_at, updated_at)
       VALUES (?, ?, 'user', 'hi', '{not valid json', '{also bad', ?, ?)`,
      [`msg-${uid}`, sessionId, now, now],
    );
    const auth = authorizeDataReset(uid);
    expect(auth).not.toBeNull();
    const outcome = resetPersonalData(auth!);
    expect(outcome.admitted).toBe(true);
    if (outcome.admitted) {
      expect(outcome.chat).toBe('cleared');
    }
    const remaining = db.executeSync(
      'SELECT COUNT(*) AS c FROM messages WHERE session_id = ?',
      [sessionId],
    ).rows[0]?.c;
    expect(Number(remaining)).toBe(0);
  });

  test('C1-C01: cloudClient.stream treats xhr.status === 0 as server_unavailable and aborts on session switch', async () => {
    const uidA = createStudentUser('stream-a');
    const uidB = createStudentUser('stream-b');
    userStore.setCurrentUser(uidA);
    jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
    jest.spyOn(cloudClient, 'getAccessToken').mockReturnValue('tok-a');

    const origXhr = (globalThis as {XMLHttpRequest?: unknown}).XMLHttpRequest;
    let aborted = false;
    let sendCount = 0;

    class FakeXhr {
      readyState = 0;
      status = 0;
      responseText = '';
      timeout = 0;
      onprogress: (() => void) | null = null;
      onreadystatechange: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      abort() {
        aborted = true;
        this.onabort?.();
      }
      send() {
        sendCount += 1;
        if (sendCount === 1) {
          this.status = 0;
          setImmediate(() => this.onload?.());
        } else {
          setImmediate(() => {
            userStore.setCurrentUser(uidB);
          });
        }
      }
    }

    (globalThis as {XMLHttpRequest?: unknown}).XMLHttpRequest = FakeXhr;
    try {
      const res1 = await cloudClient.streamOnce(
        '/v1/ai/chat/stream',
        {},
        {
          onText: () => undefined,
        },
      );
      expect(res1.status).toBe('server_unavailable');

      aborted = false;
      const res2 = await cloudClient.streamOnce(
        '/v1/ai/chat/stream',
        {},
        {
          onText: () => undefined,
        },
      );
      expect(aborted).toBe(true);
      expect(res2.status).toBe('server_unavailable');
      expect(res2.error).toMatch(/active sign-in changed/i);
    } finally {
      (globalThis as {XMLHttpRequest?: unknown}).XMLHttpRequest = origXhr;
    }
  });

  test('C1-C04: syncWorker updates sync_metadata on accepted mutations without own echoes and refunds transient outage attempts', async () => {
    const uid = createStudentUser('sync-meta');
    userStore.setCurrentUser(uid);
    syncStateStore.saveServerEntityTypes(uid, [...CLIENT_SYNC_ENTITY_TYPES]);
    syncStateStore.saveSnapshotEntityTypes(uid, [...CLIENT_SYNC_ENTITY_TYPES]);

    syncOutboxStore.enqueueMutation(uid, 'note', 'note-sync-1', 'create', {
      id: 'note-sync-1',
      title: 'Draft',
      content: 'Hello',
    });
    const [queued] = syncOutboxStore.getPendingMutations(uid);
    expect(queued).toBeDefined();

    jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
    jest.spyOn(cloudClient, 'getAccessToken').mockReturnValue('tok-sync');
    jest
      .spyOn(accountLinkService, 'refreshCloudProfile')
      .mockResolvedValue({status: 'success', message: 'ok'});

    const reqSpy = jest.spyOn(cloudClient, 'request');
    // 1. Transient server_unavailable must refund attempts (keep attempts === 0)
    reqSpy.mockResolvedValueOnce({
      status: 'server_unavailable',
      error: 'Temporary outage',
    });
    await syncWorker.runSyncPass();
    const afterOutage = syncOutboxStore.getPendingMutations(uid);
    expect(afterOutage).toHaveLength(1);
    expect(afterOutage[0].attempts).toBe(0);

    // 2. Accepted without own echo in changes still records serverVersion in sync_metadata
    reqSpy.mockResolvedValueOnce({
      status: 'success',
      data: {
        accepted: [
          {
            mutationId: queued.id,
            entityType: 'note',
            entityId: 'note-sync-1',
            status: 'accepted',
            serverVersion: 5,
          },
        ],
        rejected: [],
        changes: [],
        nextCursor: 0,
        hasMore: false,
        resetRequired: false,
        serverTime: '2026-11-26T00:00:00.000Z',
        supportedEntityTypes: [...CLIENT_SYNC_ENTITY_TYPES],
      },
    });
    await syncWorker.runSyncPass();
    expect(syncOutboxStore.getPendingMutations(uid)).toHaveLength(0);
    expect(syncMetadataStore.getVersion(uid, 'note', 'note-sync-1')).toBe(5);
  });

  test('C1-C05: superseded speechService startSpeechStream finish() resolves cleanly without deadlocking', async () => {
    const uid = createStudentUser('speech-deadlock');
    userStore.setCurrentUser(uid);
    const provider = createCallSpeechProvider(uid, {
      isOnlineMode: () => false,
    });
    const stream1 = provider.startSpeechStream!();
    stream1.update('Waiting for more');
    const stream2 = provider.startSpeechStream!();
    const res1 = await Promise.race([
      stream1.finish('Waiting for more text.'),
      new Promise<'timeout'>(resolve =>
        setTimeout(() => resolve('timeout'), 500),
      ),
    ]);
    expect(res1).not.toBe('timeout');
    expect((res1 as {source: string}).source).toBe('cancelled');
    stream2.cancel();
    await provider.dispose?.();
  });

  test('C1-C06: VoiceConversationController mute+speechPause race preserves mute, endAfterReply extends while speaking, and tool_working resets', async () => {
    const {clock, advance} = createFakeClock();
    const muteCalls: boolean[] = [];
    let emitEvent: ((ev: TransportEvent) => void) | null = null;
    const transport: VoiceTransport = {
      available: () => true,
      start: async () => undefined,
      end: async () => true,
      setMuted: async (_key, muted) => {
        muteCalls.push(muted);
        return true;
      },
      stopResponse: async () => true,
      sendMessage: async () => true,
      subscribe: (_key, listener) => {
        emitEvent = listener;
        return () => {
          emitEvent = null;
        };
      },
    };
    let resolveTool!: (val: string) => void;
    const controller = new VoiceConversationController({
      clock,
      limits: {thinkingTimeoutMs: 2_000},
      gates: {
        isGuest: () => false,
        isSignedInOwner: () => true,
        isOnlineMode: () => true,
        isOnline: async () => true,
        hasConsent: () => true,
        ensureMicPermission: async () => true,
      },
      getVoice: () => ({id: 'v1', name: 'Test'}),
      useHandbook: () => false,
      api: {
        capabilities: async () => ({
          ok: true,
          data: {enabled: true, maxDurationSeconds: 600, maxTurns: 100},
        }),
        createSession: async () => ({
          ok: true,
          data: {
            sessionId: 's1',
            signedUrl: 'wss://example.invalid',
            grant: 'g1',
            voiceId: 'v1',
            expiresAt: '2026-12-01T00:00:00Z',
            maxDurationSeconds: 600,
            maxTurns: 100,
          },
        }),
        connected: async () => null,
        end: async () => null,
        status: async () => ({
          ok: true,
          data: {status: 'active', lastErrorCode: null, lastErrorMessage: null},
        }),
      },
      transport,
      onClientTool: () =>
        new Promise<string>(resolve => {
          resolveTool = resolve;
        }),
    });

    await controller.start();

    const p1 = controller.setSpeechPaused(true);
    const p2 = controller.setMuted(true);
    const p3 = controller.setSpeechPaused(false);
    await Promise.all([p1, p2, p3]);
    expect(controller.getSnapshot().muted).toBe(true);
    expect(muteCalls[muteCalls.length - 1]).toBe(true);

    emitEvent!({
      kind: 'message',
      data: JSON.stringify({
        type: 'client_tool_call',
        client_tool_call: {
          tool_name: 'search_schedule',
          tool_call_id: 'tc-1',
          parameters: {},
        },
      }),
    });
    expect(controller.getSnapshot().phase).toBe('tool_working');
    expect(controller.getSnapshot().toolPhrase).not.toBeNull();
    resolveTool('Done');
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getSnapshot().phase).toBe('thinking');
    expect(controller.getSnapshot().toolPhrase).toBeNull();

    emitEvent!({kind: 'playback', speaking: true});
    controller.endAfterReply(500);
    advance(2_000);
    expect(controller.getSnapshot().phase).toBe('speaking');
    emitEvent!({kind: 'playback', speaking: false});
    advance(500);
    expect(controller.getSnapshot().phase).toBe('ended');
    controller.dispose();
  });

  test('C1-C06: callClosingKind handles repeated bye tokens linearly without ReDoS', () => {
    expect(callClosingKind('bye bye')).toBe('goodbye');
    expect(callClosingKind('sige bye thanks')).toBe('goodbye');
    const adversarial = `${'bye '.repeat(40)}wait actually reschedule`;
    const started = Date.now();
    expect(callClosingKind(adversarial)).toBe('none');
    expect(Date.now() - started).toBeLessThan(100);
  });

  test('C1-C07: resolveOnlineMode maps offline auth status to offline and requestMeetingSummary rejects blank transcripts', async () => {
    const uid = createStudentUser('online-gate');
    jest.spyOn(NetInfo, 'fetch').mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    } as never);
    jest
      .spyOn(accountLinkService, 'authorizeOnlineMode')
      .mockResolvedValue({status: 'offline', message: 'Offline now'});
    db.executeSync(
      `INSERT OR REPLACE INTO local_settings (user_id, key, value, updated_at)
       VALUES (?, 'chat.onlineMode', 'true', ?)`,
      [uid, new Date().toISOString()],
    );
    const gate = await resolveOnlineMode(uid);
    expect(gate).toEqual({
      enabled: false,
      reason: 'offline',
      message: 'Offline now',
    });

    const reqSpy = jest.spyOn(cloudClient, 'request');
    const summary = await requestMeetingSummary({
      title: 'Empty',
      consentGiven: true,
      segments: [{start_ms: 0, end_ms: 100, text: '   \n\t  '}],
    });
    expect(summary.status).toBe('validation_error');
    expect(reqSpy).not.toHaveBeenCalled();
  });
});
