import {buildStudentVoiceContext} from '../../src/cloud/voiceConversation/localVoiceData';
import {VoiceConversationController} from '../../src/cloud/voiceConversation/controller';
import type {VoiceConversationDeps} from '../../src/cloud/voiceConversation';
import type {TransportEvent} from '../../src/cloud/voiceConversation/types';
import {notesStore} from '../../src/storage/notesStore';
import {plannerQueries} from '../../src/storage/plannerQueries';
import {chatMemoryStore} from '../../src/storage/chatMemoryStore';
import * as onboardingModule from '../../src/storage/onboardingMemory';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Call Lafina Student Context Generation', () => {
  const userId = 'student-test-123';

  test('returns empty string when userId is empty', () => {
    expect(buildStudentVoiceContext('')).toBe('');
  });

  test('builds comprehensive context including profile, schedule, notes, and memories', () => {
    jest.spyOn(onboardingModule, 'readOnboardingIdentity').mockReturnValue({
      preferredName: 'Lem',
      tone: 'casual',
    });

    jest.spyOn(plannerQueries, 'window').mockReturnValue({
      blocks: [
        {
          id: 'b1',
          title: 'Deep Study Block',
          date: '2026-11-12',
          startTime: '09:00',
          endTime: '11:00',
        } as never,
      ],
      events: [
        {
          id: 'e1',
          title: 'Capstone Presentation',
          date: '2026-11-12',
          startTime: '14:00',
          endTime: '15:30',
        } as never,
      ],
      tasks: [
        {
          id: 't1',
          title: 'Submit Final Report',
          dueDate: '2026-11-12',
          dueTime: '23:59',
          isCompleted: false,
        } as never,
      ],
    });

    // Test with rich-text delta JSON body to ensure clean conversion
    jest.spyOn(notesStore, 'getAll').mockReturnValue([
      {
        id: 'n1',
        userId,
        title: 'Grocery List',
        category: 'Personal',
        body: JSON.stringify([{insert: 'Apples, almond milk, sourdough bread, eggs\n'}]),
        updatedAt: '2026-11-11T10:00:00Z',
        createdAt: '2026-11-11T10:00:00Z',
      } as never,
      {
        id: 'n2',
        userId,
        title: 'Physics Formulas',
        category: 'Academic',
        body: 'F = m * a, E = m * c^2',
        updatedAt: '2026-11-11T11:00:00Z',
        createdAt: '2026-11-11T11:00:00Z',
      } as never,
    ]);

    jest.spyOn(chatMemoryStore, 'isEnabled').mockReturnValue(true);
    jest.spyOn(chatMemoryStore, 'list').mockReturnValue([
      {id: 'm1', text: 'Likes studying in quiet environments'} as never,
    ]);

    const context = buildStudentVoiceContext(userId);

    // Profile check
    expect(context).toContain('Student preferred name: Lem');
    expect(context).toContain('Tone: casual');

    // Calendar & Schedule check
    expect(context).toContain('Deep Study Block');
    expect(context).toContain('09:00-11:00');
    expect(context).toContain('Capstone Presentation');
    expect(context).toContain('14:00');
    expect(context).toContain('Submit Final Report');
    expect(context).toContain('due 2026-11-12 at 23:59');

    // Notes check: rich text must be plain text, NO raw JSON delta
    expect(context).toContain('Grocery List');
    expect(context).toContain('[Personal]');
    expect(context).toContain('Apples, almond milk, sourdough bread, eggs');
    expect(context).not.toContain('{"insert"');
    expect(context).toContain('Physics Formulas');
    expect(context).toContain('[Academic]');
    expect(context).toContain('F = m * a');

    // Memories check
    expect(context).toContain('Likes studying in quiet environments');
  });

  test('gracefully handles empty schedule and empty notes without crashing', () => {
    jest.spyOn(onboardingModule, 'readOnboardingIdentity').mockReturnValue({
      preferredName: '',
      tone: '',
    });

    jest.spyOn(plannerQueries, 'window').mockReturnValue({
      blocks: [],
      events: [],
      tasks: [],
    });

    jest.spyOn(notesStore, 'getAll').mockReturnValue([]);
    jest.spyOn(chatMemoryStore, 'isEnabled').mockReturnValue(false);

    const context = buildStudentVoiceContext(userId);
    expect(context).toContain('No upcoming events or pending tasks scheduled');
    expect(context).toContain('No saved notes currently');
  });

  test('VoiceConversationController passes student_context in initiation when getStudentContext is provided', async () => {
    let capturedInitiation = '';
    const listeners = new Map<string, (event: TransportEvent) => void>();
    const deps: VoiceConversationDeps = {
      gates: {
        isGuest: () => false,
        isSignedInOwner: () => true,
        isOnlineMode: () => true,
        isOnline: async () => true,
        hasConsent: () => true,
        ensureMicPermission: async () => true,
      },
      getVoice: () => ({id: 'voice_ph_1', name: 'Lafina Filipina'}),
      useHandbook: () => true,
      getStudentContext: () => 'Student Notes: Grocery List (Apples, milk)',
      api: {
        capabilities: async () => ({
          ok: true,
          data: {
            enabled: true,
            maxDurationSeconds: 600,
            maxTurns: 30,
            sessionsPerDay: 0,
          },
        }),
        createSession: async () => ({
          ok: true,
          data: {
            provider: 'elevenlabs',
            sessionId: 'sess-123',
            signedUrl: 'wss://fake-elevenlabs/socket',
            grant: 'fake-grant-abc',
            voiceId: 'voice_ph_1',
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            maxDurationSeconds: 600,
            maxTurns: 30,
          },
        }),
        connected: async () => null,
        end: async () => null,
        status: async () => ({ok: true, data: {} as never}),
      },
      transport: {
        available: () => true,
        start: async (options: {sessionKey: string; url: string; initiation: string}) => {
          capturedInitiation = options.initiation;
        },
        end: async () => true,
        subscribe: (key: string, listener: (event: TransportEvent) => void) => {
          listeners.set(key, listener);
          return () => listeners.delete(key);
        },
        sendMessage: async () => true,
        setMuted: async () => true,
        stopResponse: async () => true,
      },
    };

    const controller = new VoiceConversationController(deps);
    await controller.start();

    const parsed = JSON.parse(capturedInitiation);
    expect(parsed.dynamic_variables.student_context).toBe('Student Notes: Grocery List (Apples, milk)');
    expect(parsed.custom_llm_extra_body.student_context).toBe('Student Notes: Grocery List (Apples, milk)');
    expect(parsed.dynamic_variables.lafina_voice_grant).toBe('fake-grant-abc');

    await controller.end();
  });

  test('VoiceConversationController.sendContext supports up to 4000 characters without early truncation', async () => {
    let sentPayload = '';
    const listeners = new Map<string, (event: TransportEvent) => void>();
    const deps: VoiceConversationDeps = {
      gates: {
        isGuest: () => false,
        isSignedInOwner: () => true,
        isOnlineMode: () => true,
        isOnline: async () => true,
        hasConsent: () => true,
        ensureMicPermission: async () => true,
      },
      getVoice: () => ({id: 'voice_ph_1', name: 'Lafina Filipina'}),
      useHandbook: () => true,
      api: {
        capabilities: async () => ({
          ok: true,
          data: {enabled: true, maxDurationSeconds: 600, maxTurns: 30, sessionsPerDay: 0},
        }),
        createSession: async () => ({
          ok: true,
          data: {
            provider: 'elevenlabs',
            sessionId: 'sess-123',
            signedUrl: 'wss://fake-elevenlabs/socket',
            grant: 'fake-grant-abc',
            voiceId: 'voice_ph_1',
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            maxDurationSeconds: 600,
            maxTurns: 30,
          },
        }),
        connected: async () => null,
        end: async () => null,
        status: async () => ({ok: true, data: {} as never}),
      },
      transport: {
        available: () => true,
        start: async () => {},
        end: async () => true,
        subscribe: (key: string, listener: (event: TransportEvent) => void) => {
          listeners.set(key, listener);
          return () => listeners.delete(key);
        },
        sendMessage: async (_key: string, json: string) => {
          sentPayload = json;
          return true;
        },
        setMuted: async () => true,
        stopResponse: async () => true,
      },
    };

    const controller = new VoiceConversationController(deps);
    await controller.start();

    // Send a 3000-character payload
    const longPayload = 'Schedule & Notes: ' + 'x'.repeat(2950);
    const sent = await controller.sendContext(longPayload);
    expect(sent).toBe(true);

    const parsed = JSON.parse(sentPayload);
    expect(parsed.type).toBe('contextual_update');
    expect(parsed.text.length).toBe(longPayload.length);
    expect(parsed.text).toBe(longPayload);

    await controller.end();
  });
});
