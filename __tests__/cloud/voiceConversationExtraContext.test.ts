import {act, renderHook} from '@testing-library/react-native';
import {useVoiceConversation} from '../../src/ui/hooks/useVoiceConversation';
import type {VoiceConversationDeps} from '../../src/cloud/voiceConversation';

// Call Lafina preferences live in SQLite; this test needs none of them.
jest.mock('../../src/cloud/voiceConversation/callLafinaSettingsStore', () => ({
  getCallLafinaSettings: () => ({}),
}));
describe('useVoiceConversation extraContext (reminder calls)', () => {
  test('puts the extra context before the student summary in the initiation', async () => {
    let initiation = '';
    const deps = (): VoiceConversationDeps => ({
      gates: {
        isGuest: () => false,
        isSignedInOwner: () => true,
        isOnlineMode: () => true,
        isOnline: async () => true,
        hasConsent: () => true,
        ensureMicPermission: async () => true,
      },
      getVoice: () => null,
      useHandbook: () => true,
      getStudentContext: () => 'Active Schedule & Calendar: Quiz Monday',
      api: {
        capabilities: async () => ({
          ok: true,
          data: {enabled: true, maxDurationSeconds: 300, maxTurns: 30, sessionsPerDay: 0},
        }),
        createSession: async () => ({
          ok: true,
          data: {
            provider: 'elevenlabs',
            sessionId: 'sess-1',
            signedUrl: 'wss://fake/socket',
            grant: 'g',
            voiceId: 'v',
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            maxDurationSeconds: 300,
            maxTurns: 30,
          },
        }),
        connected: async () => null,
        end: async () => null,
        status: async () => ({ok: true, data: {} as never}),
      },
      transport: {
        available: () => true,
        start: async (options: {initiation: string}) => {
          initiation = options.initiation;
        },
        end: async () => true,
        subscribe: () => () => undefined,
        sendMessage: async () => true,
        setMuted: async () => true,
        stopResponse: async () => true,
      },
    });
    const {result, unmount} = renderHook(() =>
      useVoiceConversation('student-1', {
        extraContext: 'Reminder call: Review math',
        deps,
      }),
    );
    await act(async () => {
      result.current.start();
    });
    await act(async () => undefined);
    const parsed = JSON.parse(initiation);
    expect(parsed.custom_llm_extra_body.student_context).toBe(
      'Reminder call: Review math\n\nActive Schedule & Calendar: Quiz Monday',
    );
    await act(async () => {
      await result.current.endAndWait();
    });
    unmount();
  });
});
