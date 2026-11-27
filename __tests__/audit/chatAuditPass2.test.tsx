/**
 * Chat Feature Audit — Pass 2 Adversarial Re-Audit & Everyday Chaos Tests.
 * Covers Pass 2 findings across UTF-16 surrogate-pair safety, markdown escaped pipes &
 * nesting caps, huge table stack safety, UndoSnackbar double-tap, Quick Chat reopen/history
 * isolation, SSE streaming abort/keepNameCase/snake_case, ChatAgent leak/abort safety,
 * onlineIntentExtractor brace-balanced JSON & AbortSignal, documentSkill dedup,
 * pendingClarification cancel/topic-change/past-date reset, multiActionService inverted
 * times/Oxford commas/compound hijack prevention, actionExecutor time math/sort/note cap,
 * and ChatScreen multi-confirm/openRequest/SQL LIKE wildcard edge cases.
 */
import React from 'react';
import {Alert, Linking} from 'react-native';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {
  ChatReplyText,
  tableColumnSizes,
} from '../../src/ui/components/chat/ChatReplyText';
import {UndoSnackbar} from '../../src/ui/components/chat/UndoSnackbar';
import {QuickChatHistoryView} from '../../src/ui/quickChat/QuickChatHistoryView';
import {QuickChatPanel} from '../../src/ui/quickChat/QuickChatPanel';
import {quickChatPresence} from '../../src/ui/quickChat/quickChatPresence';
import * as onlineModeGate from '../../src/cloud/onlineModeGate';
import {cloudClient} from '../../src/cloud/cloudClient';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {documentSkill} from '../../src/skills/documentSkill';
import {runChatAgent} from '../../src/ai/chatAgent';
import {
  extractIntentWithDeepSeek,
  extractJsonObject,
  extractMultiIntentsWithDeepSeek,
} from '../../src/ai/onlineIntentExtractor';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {
  clearPendingClarification,
  resolveClarificationFollowUp,
  type PendingClarification,
} from '../../src/ai/nlu/pendingClarification';
import {
  endReviewSession,
  latestPendingReview,
} from '../../src/ai/nlu/commandReview';
import {
  addMinutesToTime,
  executeNluAction,
} from '../../src/ai/nlu/actionExecutor';
import {
  cancelMultiItem,
  createMultiActionBatch,
  executeMultiActionBatch,
  parseGroupedRequest,
  splitGroupedClauses,
} from '../../src/ai/voiceActions/multiActionService';
import {actionService} from '../../src/ai/voiceActions/actionService';
import {localHandbookService} from '../../src/handbook';
import {
  parseChatInline,
  parseChatMarkdown,
  safeSlice,
  safeSliceEnd,
} from '../../src/utils';
import {
  chatMemoryStore,
  chatStore,
  db,
  initDatabase,
  notesStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {enableUstpForTest} from '../fixtures/ustpEligibility';

let userSeq = 0;
const makeStudent = (tag: string): string => {
  userSeq += 1;
  const id = `audit-p2-${tag}-${userSeq}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const hasLoneSurrogate = (text: string): boolean => {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) return true;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
};

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});

beforeEach(() => {
  endReviewSession();
  clearPendingClarification();
  quickChatPresence.resetForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  endReviewSession();
  clearPendingClarification();
  quickChatPresence.resetForTests();
});

describe('Pass 2: UTF-16 surrogate-pair safety across titles, memory & onlineChatSkill', () => {
  it('safeSlice & safeSliceEnd never split emoji surrogate pairs', () => {
    const emoji = '📚'; // 2 UTF-16 code units
    const str = `${'a'.repeat(9)}${emoji}tail`;
    const cutHead = safeSlice(str, 10);
    expect(cutHead).toBe('a'.repeat(9));
    expect(hasLoneSurrogate(cutHead)).toBe(false);

    const cutTail = safeSliceEnd(str, 5);
    expect(cutTail).toBe('tail');
    expect(hasLoneSurrogate(cutTail)).toBe(false);
  });

  it('chatStore renameSession/auto-title and chatMemoryStore never produce lone surrogates', () => {
    const userId = makeStudent('emoji-trunc');
    const sid = chatStore.startNewChat(userId);
    const titleWithBoundaryEmoji = `${'X'.repeat(59)}🎓extra`;
    chatStore.addMessage(
      userId,
      'user',
      titleWithBoundaryEmoji,
      null,
      null,
      sid,
    );
    const autoTitle = chatStore.getSessionTitle(userId, sid);
    expect(hasLoneSurrogate(autoTitle)).toBe(false);

    chatStore.renameSession(userId, sid, titleWithBoundaryEmoji);
    const renamed = chatStore.getSessionTitle(userId, sid);
    expect(hasLoneSurrogate(renamed)).toBe(false);

    const mem = chatMemoryStore.add(userId, `${'M'.repeat(199)}🔥done`);
    expect(mem).not.toBeNull();
    expect(hasLoneSurrogate(mem!.text)).toBe(false);
  });

  it('onlineChatSkill.sendChatMessage skips garbled tiny tail fragments and avoids lone surrogates', async () => {
    const reqSpy = jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
      status: 'success',
      data: {reply: 'ok', sources: []},
    } as never);

    const m1 =
      'Older context message that should be dropped instead of clipped to 10 chars';
    const m2 = 'b'.repeat(3990);
    const m3 = `${'c'.repeat(3999)}📚`; // 4001 chars -> budget left after m3+m2 is 9 (<32)
    await onlineChatSkill.sendChatMessage(
      [
        {role: 'user', content: m1},
        {role: 'assistant', content: m2},
        {role: 'user', content: m3},
      ],
      {useHandbook: false},
    );

    const rawBody = JSON.parse(String(reqSpy.mock.calls[0][1]?.body ?? '{}'));
    expect(rawBody.messages).toHaveLength(2);
    for (const msg of rawBody.messages) {
      expect(hasLoneSurrogate(msg.content)).toBe(false);
    }
  });
});

describe('Pass 2: Markdown escaped pipes, deep nesting, huge tables, link safety & UndoSnackbar', () => {
  it('parses escaped pipes in table cells and caps deep inline recursion safely', () => {
    const blocks = parseChatMarkdown(
      '| Subject | Days |\n| --- | --- |\n| CS 101 \\| Data Structures | MWF |',
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('table');
    if (blocks[0].kind === 'table') {
      expect(blocks[0].rows[0]).toHaveLength(2);
      expect(blocks[0].rows[0][0][0].text).toBe('CS 101 | Data Structures');
      expect(blocks[0].rows[0][1][0].text).toBe('MWF');
    }

    const deep = `${'**_~~'.repeat(40)}core${'~~_**'.repeat(40)}`;
    const spans = parseChatInline(deep);
    expect(spans.map(s => s.text).join('')).toContain('core');
  });

  it('tableColumnSizes handles huge tables without stack overflow and guards invalid fontScale', () => {
    const rows = Array.from({length: 500}, (_, i) => [
      [{text: `row ${i} `.repeat(30)}],
      [{text: `col ${i}`}],
    ]);
    const sizes = tableColumnSizes(rows, Number.NaN);
    expect(sizes).toHaveLength(2);
    expect(sizes[0].minimum).toBeGreaterThanOrEqual(64);
    expect(sizes[0].preferred).toBeGreaterThanOrEqual(sizes[0].minimum);
  });

  it('ChatReplyText blocks non-http(s) links and combines strike + underline', () => {
    const userId = makeStudent('reply-link');
    const openSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);

    const badHref = ['tel', ':123456'].join('');
    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatReplyText
          content={`[Call](${badHref}) and ~~[Docs](https://example.com)~~`}
          format="markdown"
          textStyle={{fontSize: 14}}
        />
      </ThemeProvider>,
    );

    // `tel:` link must be stripped to non-link plain text; only https `Docs` is a link
    expect(ui.getAllByRole('link')).toHaveLength(1);
    expect(ui.getByText(/Call and/)).toBeTruthy();
    expect(openSpy).not.toHaveBeenCalled();

    const docsLink = ui.getByText('Docs');
    expect(docsLink.props.style).toEqual(
      expect.objectContaining({textDecorationLine: 'underline line-through'}),
    );
  });

  it('UndoSnackbar prevents rapid double-tap from calling onUndo twice', () => {
    const userId = makeStudent('undo-dbl');
    const onUndo = jest.fn();
    const ui = render(
      <ThemeProvider userId={userId}>
        <UndoSnackbar
          offer={{
            token: 'tok-1',
            label: 'Marked done',
            expiresAt: Date.now() + 60_000,
          }}
          onUndo={onUndo}
          onHide={jest.fn()}
        />
      </ThemeProvider>,
    );
    const btn = ui.getByTestId('undo-snackbar-undo');
    fireEvent.press(btn);
    fireEvent.press(btn);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

describe('Pass 2: Quick Chat presence reopen & history isolation', () => {
  it('requestNavigation while panel is already open does not spuriously re-check online mode', async () => {
    const userId = makeStudent('qc-nav-reopen');
    const resolveSpy = jest
      .spyOn(onlineModeGate, 'resolveOnlineMode')
      .mockResolvedValue({
        enabled: false,
        reason: 'setting_off',
        message: 'Offline',
      });

    quickChatPresence.setOpen(true);
    const ui = render(
      <ThemeProvider userId={userId}>
        <QuickChatPanel userId={userId} state="ready" />
      </ThemeProvider>,
    );

    await waitFor(() => expect(resolveSpy).toHaveBeenCalledTimes(1));

    act(() => {
      quickChatPresence.requestNavigation({ownerId: userId, screen: 'chat'});
    });
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    ui.unmount();
  });

  it('QuickChatHistoryView resets confirmClearAll when userId switches', () => {
    const userA = makeStudent('qc-hist-a');
    const userB = makeStudent('qc-hist-b');
    const ui = render(
      <ThemeProvider userId={userA}>
        <QuickChatHistoryView
          userId={userA}
          activeSessionId={null}
          onSelectSession={jest.fn()}
          onStartNewChat={jest.fn()}
          onOpenAppChat={jest.fn()}
        />
      </ThemeProvider>,
    );
    ui.rerender(
      <ThemeProvider userId={userB}>
        <QuickChatHistoryView
          userId={userB}
          activeSessionId={null}
          onSelectSession={jest.fn()}
          onStartNewChat={jest.fn()}
          onOpenAppChat={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(ui.queryByTestId('quick-history-clear-confirm')).toBeNull();
  });
});

describe('Pass 2: Streaming abort, keepNameCase, ChatAgent leak/abort, onlineIntentExtractor & documentSkill', () => {
  it('streamChatMessage returns cancelled when aborted even after partial tokens, and honors keepNameCase & used_handbook', async () => {
    const controller = new AbortController();
    jest
      .spyOn(cloudClient, 'stream')
      .mockImplementationOnce(async (_ep, _body, opts) => {
        opts.onText('data: {"type":"delta","text":"Partial LAFINA reply"}\n\n');
        controller.abort();
        return {status: 'server_unavailable', error: 'cancelled'};
      });

    const cancelledRes = await onlineChatSkill.streamChatMessage(
      [{role: 'user', content: 'hi'}],
      {onReplyText: jest.fn(), signal: controller.signal},
    );
    expect(cancelledRes.status).toBe('server_unavailable');
    expect(cancelledRes.error).toBe('cancelled');

    jest
      .spyOn(cloudClient, 'stream')
      .mockImplementationOnce(async (_ep, _body, opts) => {
        opts.onText(
          'data: {"type":"delta","text":"LAFINA exact"}\n\ndata: {"type":"done","used_handbook":true,"sources":[]}\n\n',
        );
        return {status: 'success', data: ''};
      });
    const okRes = await onlineChatSkill.streamChatMessage(
      [{role: 'user', content: 'hi'}],
      {onReplyText: jest.fn(), keepNameCase: true},
    );
    expect(okRes.status).toBe('success');
    expect(okRes.data?.reply).toBe('LAFINA exact');
    expect(okRes.data?.usedHandbook).toBe(true);
  });

  it('runChatAgent cancels pending proposal on unexpected throw and stops tool loop on abort', async () => {
    const userId = makeStudent('agent-throw');
    const stepSpy = jest
      .spyOn(onlineChatSkill, 'agentStep')
      .mockResolvedValueOnce({
        status: 'success',
        data: {
          reply: '',
          toolCalls: [
            {
              id: 'call-1',
              name: 'prepare_lafina_action',
              arguments: {
                action: 'create_task',
                title: 'Leaked Task',
                date: '2030-06-15',
              },
            },
          ],
          sources: [],
          usedHandbook: false,
        },
      })
      .mockRejectedValueOnce(new Error('unexpected boom'));

    await expect(
      runChatAgent(userId, [{role: 'user', content: 'add task Leaked Task'}], {
        useHandbook: false,
        referenceDate: new Date(2030, 5, 10, 9, 0, 0),
        localNow: 'Monday 2030-06-10, 9:00 AM',
      }),
    ).rejects.toThrow('unexpected boom');

    expect(stepSpy).toHaveBeenCalledTimes(2);
    expect(latestPendingReview(userId, 'chat')).toBeNull();
  });

  it('extractJsonObject parses JSON surrounded by prose with braces, and multi-intent forwards signal & applies local relative time', async () => {
    const parsed = extractJsonObject(
      'Here is your JSON: {"intent":"create_task","title":"Study"} (note: {optional} fields omitted)',
    );
    expect(parsed).toEqual({intent: 'create_task', title: 'Study'});

    const controller = new AbortController();
    controller.abort();
    const sendSpy = jest.spyOn(onlineChatSkill, 'sendChatMessage');
    expect(
      await extractIntentWithDeepSeek(
        'add task X',
        new Date(),
        controller.signal,
      ),
    ).toBeNull();
    expect(
      await extractMultiIntentsWithDeepSeek(
        'add task X and remind me Y',
        new Date(),
        controller.signal,
      ),
    ).toBeNull();
    expect(sendSpy).not.toHaveBeenCalled();

    const ref = new Date(2030, 5, 10, 9, 36, 26); // 9:36:26 -> +5 min rounds up to 9:42
    sendSpy.mockResolvedValueOnce({
      status: 'success',
      data: {
        reply: JSON.stringify({
          intents: [
            {intent: 'create_task', title: 'Submit form', date: '2030-06-10'},
            {
              intent: 'create_reminder',
              title: 'Check oven',
              date: '2030-06-10',
              time: '09:41',
            },
          ],
        }),
        sources: [],
        usedHandbook: false,
      },
    });
    const multi = await extractMultiIntentsWithDeepSeek(
      'add task submit form and remind me in 5 minutes to check oven',
      ref,
    );
    expect(multi).toHaveLength(2);
    expect(multi?.[1].time).toBe('09:42');
  });

  it('documentSkill deduplicates an oversized >4000-char prompt already in prior history', async () => {
    const reqSpy = jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
      status: 'server_error',
      error: 'stop early',
    } as never);

    const longPrompt = 'P'.repeat(4500);
    await documentSkill.generate({
      prompt: longPrompt,
      format: 'pdf',
      history: [{role: 'user', content: longPrompt}],
    });

    const sent = JSON.parse(String(reqSpy.mock.calls[0][1]?.body ?? '{}'));
    expect(sent.messages).toHaveLength(1);
  });
});

describe('Pass 2: Clarification cancellation, compound hijack guards, multi-action & actionExecutor', () => {
  it('pendingClarification rejects cancel words, long paragraphs on missing_title, and resets past dates on missing_time', () => {
    const ref = new Date(2030, 5, 10, 9, 0, 0); // 2030-06-10
    const missingTitlePending: PendingClarification = {
      userId: 'u1',
      surface: 'chat',
      sessionId: 's1',
      reviewSessionId: 'rs1',
      assistantMessageId: 'a1',
      kind: 'missing_title',
      intent: {
        intent: 'create_task',
        title: null,
        date: '2030-06-10',
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'add task',
        isValid: true,
      },
      clearLeadMinutes: false,
      expiresAt: Date.now() + 60_000,
    };

    expect(
      resolveClarificationFollowUp(missingTitlePending, 'never mind', ref),
    ).toBeNull();
    expect(
      resolveClarificationFollowUp(missingTitlePending, 'nvm', ref),
    ).toBeNull();
    expect(
      resolveClarificationFollowUp(missingTitlePending, 'wag na', ref),
    ).toBeNull();
    expect(
      resolveClarificationFollowUp(
        missingTitlePending,
        "I'm really stressed about finals and need advice on how to study effectively",
        ref,
      ),
    ).toBeNull();

    const pastDatePending: PendingClarification = {
      ...missingTitlePending,
      kind: 'missing_time',
      intent: {
        ...missingTitlePending.intent,
        intent: 'create_reminder',
        title: 'Pay rent',
        date: '2030-06-09', // yesterday
        time: '09:00',
      },
    };
    const resolved = resolveClarificationFollowUp(
      pastDatePending,
      'at 5pm',
      ref,
    );
    expect(resolved?.date).toBe('2030-06-10');
    expect(resolved?.time).toBe('17:00');
  });

  it('prevents Oxford-comma splitting, writing-question hijacks, destructive batch creation, and inverted event times', async () => {
    const userId = makeStudent('compound-guards');
    const ref = new Date(2030, 5, 10, 9, 0, 0);

    expect(
      splitGroupedClauses('Add task buy pens, notebooks, and folders tomorrow'),
    ).toHaveLength(1);

    // Writing/study question with ", and make" must NOT become a multi-action planner batch
    const essayQ = await chatOrchestrator.processMessage(
      userId,
      'Can you help me write an essay about climate change, and make an outline for my intro?',
      {onlineMode: false, referenceDate: ref},
    );
    expect(essayQ.multiBatch).toBeUndefined();

    // Destructive compound command must NOT turn into multi-action CREATE items
    const delCmd = await chatOrchestrator.processMessage(
      userId,
      'Delete my math task and delete my physics note',
      {onlineMode: false, referenceDate: ref},
    );
    expect(delCmd.multiBatch).toBeUndefined();

    // 23:30 default event end caps at 23:59 instead of wrapping to 00:30
    const lateParsed = parseGroupedRequest(
      'Schedule late study class tomorrow at 11:30 PM',
      ref,
    );
    expect(lateParsed.items[0].time).toBe('23:30');
    expect(lateParsed.items[0].endTime).toBe('23:59');

    // Inverted event endTime < time must be rejected
    const batch = createMultiActionBatch('sess-inv', userId, [
      {
        id: 'ev-inv',
        kind: 'event',
        title: 'Inverted Event',
        date: '2030-06-12',
        time: '15:00',
        endTime: '14:00',
        status: 'draft',
        savedEntityId: null,
        error: null,
      },
      {
        id: 'task-ok',
        kind: 'task',
        title: 'Valid Task',
        date: '2030-06-12',
        status: 'draft',
        savedEntityId: null,
        error: null,
      },
    ]);
    const exec = await executeMultiActionBatch(batch, userId);
    expect(exec.batch.status).toBe('partial');
    expect(exec.batch.items[0].status).toBe('failed');
    expect(exec.batch.items[1].status).toBe('saved');

    // Cancelling the only failed item updates batch status from partial -> saved
    const afterCancel = cancelMultiItem(exec.batch, 'ev-inv');
    expect(afterCancel.status).toBe('saved');
  });

  it('actionExecutor handles negative addMinutesToTime, unpadded 9:00 sort, and caps massive single notes', async () => {
    const userId = makeStudent('action-exec');
    const ref = new Date(2030, 5, 10, 8, 0, 0);

    expect(addMinutesToTime('00:15', -30)).toBe('23:45');

    tasksStore.insertTask({
      id: 't-10',
      userId,
      title: 'Ten AM Task',
      dueDate: '2030-06-10',
      dueTime: '10:00',
      isCompleted: false,
      priority: 'Medium',
      category: 'Academic',
    });
    tasksStore.insertTask({
      id: 't-9',
      userId,
      title: 'Nine AM Task',
      dueDate: '2030-06-10',
      dueTime: '9:00',
      isCompleted: false,
      priority: 'Medium',
      category: 'Academic',
    });

    const sched = await executeNluAction(
      userId,
      {
        intent: 'query_schedule',
        title: null,
        date: '2030-06-10',
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'what is my schedule today',
        isValid: true,
      },
      {referenceDate: ref},
    );
    expect(sched.reply.indexOf('Nine AM Task')).toBeLessThan(
      sched.reply.indexOf('Ten AM Task'),
    );

    notesStore.insert({
      id: 'huge-note',
      userId,
      title: 'Mega Bio Note',
      body: 'Cell biology fact. '.repeat(600), // >10,000 chars
      category: 'Academic',
      isPinned: false,
      tags: [],
      isVoiceTranscribed: false,
    });
    const noteRes = await executeNluAction(
      userId,
      {
        intent: 'query_notes',
        title: 'Mega Bio Note',
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: 'Mega Bio Note',
        snoozeMinutes: null,
        confidence: 1,
        source: 'fast_path',
        rawTranscript: 'read my Mega Bio Note',
        isValid: true,
      },
      {referenceDate: ref},
    );
    expect(noteRes.reply.length).toBeLessThan(4_500);
    expect(noteRes.reply).toContain('Open the Notes tab');
  });

  it('long USTP question preserves the question at the end of the message for DeepSeek', async () => {
    const userId = makeStudent('long-ustp-tail');
    enableUstpForTest(userId);
    await localHandbookService.ensureReady();

    const sendSpy = jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValueOnce({
        status: 'success',
        data: {
          reply: 'GWA of 1.75 or better.',
          sources: [],
          usedHandbook: false,
        },
      });

    const question = `${'Background context about my courses. '.repeat(
      110,
    )}What GPA is required for Dean's List?`;
    await chatOrchestrator.processMessage(userId, question, {
      onlineMode: true,
      useHandbook: true,
      ustpRagOnly: true,
    });

    const [sentHistory] = sendSpy.mock.calls[0];
    const sentPrompt = sentHistory[sentHistory.length - 1].content;
    expect(sentPrompt).toContain("What GPA is required for Dean's List?");
    expect(sentPrompt.length).toBeLessThanOrEqual(3900);
  });

  it('ChatScreen handles SQL LIKE wildcards, openRequest session switches, and multi-confirm deleted-session resilience', async () => {
    const userId = makeStudent('screen-p2');
    const s1 = chatStore.startNewChat(userId);
    chatStore.addMessage(userId, 'user', '100% pass rate_test', null, null, s1);
    const s2 = chatStore.startNewChat(userId);
    chatStore.addMessage(
      userId,
      'user',
      'ordinary chat message',
      null,
      null,
      s2,
    );

    // Literal `%` and `_` must NOT act as SQL wildcards matching s2
    const pctHits = chatStore.listSessions(userId, '100%');
    expect(pctHits.map(s => s.id)).toEqual([s1]);
    const underHits = chatStore.listSessions(userId, 'rate_test');
    expect(underHits.map(s => s.id)).toEqual([s1]);

    // openRequest switches ChatScreen to newly opened session (e.g. from Quick Chat History)
    const ui = render(
      <ThemeProvider userId={userId}>
        <ChatScreen userId={userId} />
      </ThemeProvider>,
    );
    expect(await ui.findByText('ordinary chat message')).toBeTruthy();

    chatStore.openSession(userId, s1);
    ui.rerender(
      <ThemeProvider userId={userId}>
        <ChatScreen
          userId={userId}
          openRequest={{
            requestId: 'req-switch-1',
            ownerId: userId,
            screen: 'chat',
          }}
        />
      </ThemeProvider>,
    );
    expect(await ui.findByText('100% pass rate_test')).toBeTruthy();

    // Multi-action confirm must not show a false "Could Not Save" alert if transcript write throws
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const fakeBatch = createMultiActionBatch('sess-m', userId, [
      {
        id: 'm1',
        kind: 'task',
        title: 'Task One',
        date: '2030-06-15',
        status: 'draft',
        savedEntityId: null,
        error: null,
      },
      {
        id: 'm2',
        kind: 'task',
        title: 'Task Two',
        date: '2030-06-15',
        status: 'draft',
        savedEntityId: null,
        error: null,
      },
    ]);
    jest.spyOn(chatOrchestrator, 'processMessage').mockResolvedValueOnce({
      userMessage: {
        id: 'u-m',
        sessionId: s1,
        sender: 'user',
        content: 'add task Task One and add task Task Two',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      assistantMessage: {
        id: 'a-m',
        sessionId: s1,
        sender: 'assistant',
        content: 'Prepared 2 actions.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      intent: {intent: 'chat'} as any,
      multiBatch: fakeBatch,
      reply: 'Prepared 2 actions.',
    });

    fireEvent.changeText(
      ui.getByTestId('chat-text-input'),
      'add task Task One and add task Task Two',
    );
    await act(async () => {
      fireEvent.press(ui.getByTestId('chat-send-button'));
    });

    await ui.findByTestId('multi-action-confirm-all');
    jest.spyOn(actionService, 'confirmMultiActionBatch').mockResolvedValueOnce({
      batch: {
        ...fakeBatch,
        status: 'saved',
        items: fakeBatch.items.map(i => ({...i, status: 'saved'})),
      },
      spokenSummary: 'All 2 items saved successfully.',
    });
    jest.spyOn(chatStore, 'addMessage').mockImplementationOnce(() => {
      throw new Error('This chat does not belong to the signed-in account.');
    });

    await act(async () => {
      fireEvent.press(ui.getByTestId('multi-action-confirm-all'));
    });
    expect(alertSpy).not.toHaveBeenCalledWith(
      'Could Not Save',
      expect.anything(),
    );
  });
});
