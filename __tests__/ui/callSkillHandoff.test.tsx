/**
 * Skill handoff in a call (ADR-041, SKILL-02/03/05): the student asks for a
 * skill, LAFINA says one line, the call ends and the skill opens. Rendered in
 * Jest with the node:sqlite mock and a fake transport; this proves screen
 * logic, not audio, ElevenLabs or a real phone.
 */
import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {NativeModules, PermissionsAndroid} from 'react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {VoiceConversationPanel} from '../../src/ui/components/voice/VoiceConversationPanel';
import {
  db,
  initDatabase,
  localSettingsStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {cloudClient} from '../../src/cloud/cloudClient';
import {
  defaultVoiceConversationDeps,
  VOICE_CONSENT_KEY,
} from '../../src/cloud/voiceConversation';
import type {
  TransportEvent,
  VoiceTransport,
} from '../../src/cloud/voiceConversation';
import {
  endReviewSession,
  latestPendingReview,
} from '../../src/ai/nlu/commandReview';
import {ttsService} from '../../src/ai/tts/ttsService';
import {useCommandReview} from '../../src/ui/hooks/useCommandReview';
import type {CallNavigationTarget} from '../../src/ui/navigation/callNavigation';
import {writeSkillState} from '../../src/skills/skillsState';
import {newPomodoro} from '../../src/skills/studyLogic';

const SESSION_ID = '11111111-2222-3333-4444-555555555555';
let serial = 0;
let activeUser: string | null = null;

const student = (label: string): string => {
  serial += 1;
  const id = `callsave-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const signIn = (userId: string) => {
  activeUser = userId;
  jest.spyOn(userStore, 'getActiveSessionToken').mockImplementation(() => ({
    userId: activeUser,
    accessToken: 'synthetic-token',
    refreshToken: null,
  }));
  localSettingsStore.set(userId, 'chat.onlineMode', 'true');
  localSettingsStore.set(userId, VOICE_CONSENT_KEY, 'true');
  localSettingsStore.set(
    userId,
    'voiceConversation.directDataConsent.v1',
    'true',
  );
};

const fakeServer = () => {
  jest
    .spyOn(cloudClient, 'request')
    .mockImplementation(async (path: string) => {
      if (path === '/v1/ai/voice/capabilities') {
        return {
          status: 'success',
          data: {
            enabled: true,
            maxDurationSeconds: 300,
            maxTurns: 30,
            detail: null,
          },
        } as never;
      }
      if (path === '/v1/ai/voice/sessions') {
        return {
          status: 'success',
          data: {
            sessionId: SESSION_ID,
            signedUrl:
              'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s',
            grant: 'synthetic-grant',
            voiceId: 'default_voice',
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
            maxDurationSeconds: 300,
            maxTurns: 30,
          },
        } as never;
      }
      if (path.startsWith(`/v1/ai/voice/sessions/${SESSION_ID}`)) {
        return {
          status: 'success',
          data: {status: 'active', lastErrorCode: null, lastErrorMessage: null},
        } as never;
      }
      return {
        status: 'error',
        error: {code: 'offline', message: 'n/a'},
      } as never;
    });
};

const fakeTransport = () => {
  let listener: ((event: TransportEvent) => void) | null = null;
  const calls = {start: 0, sent: [] as string[]};
  const transport: VoiceTransport = {
    available: () => true,
    start: async () => {
      calls.start += 1;
    },
    setMuted: async () => true,
    stopResponse: async () => true,
    sendMessage: async (_key, payload) => {
      calls.sent.push(payload);
      return true;
    },
    end: async () => true,
    subscribe: (_key, fn) => {
      listener = fn;
      return () => {
        listener = null;
      };
    },
  };
  const message = (payload: object) =>
    act(() => {
      listener?.({kind: 'message', data: JSON.stringify(payload)});
    });
  const emit = (event: TransportEvent) =>
    act(() => {
      listener?.(event);
    });
  return {transport, calls, message, emit};
};

const PanelHost: React.FC<{
  userId: string;
  transport: VoiceTransport;
  onBack?: () => void;
  onNavigate?: (target: CallNavigationTarget) => void;
}> = ({userId, transport, onBack = () => undefined, onNavigate}) => {
  const review = useCommandReview(userId, 'voice');
  return (
    <VoiceConversationPanel
      userId={userId}
      review={review}
      onBack={onBack}
      onNavigate={onNavigate}
      deps={id => ({
        ...defaultVoiceConversationDeps(id),
        transport,
        log: () => undefined,
      })}
    />
  );
};

const startCall = async (
  label: string,
  onBack?: () => void,
  onNavigate?: (target: CallNavigationTarget) => void,
) => {
  const userId = student(label);
  signIn(userId);
  fakeServer();
  const fake = fakeTransport();
  const utils = render(
    <ThemeProvider userId={userId}>
      <PanelHost
        userId={userId}
        transport={fake.transport}
        onBack={onBack}
        onNavigate={onNavigate}
      />
    </ThemeProvider>,
  );
  fireEvent.press(utils.getByTestId('voice-conversation-start'));
  await waitFor(() => expect(fake.calls.start).toBe(1));
  return {userId, utils, ...fake};
};

let eventId = 5000;
const said = (text: string) => ({
  type: 'user_transcript',
  user_transcription_event: {user_transcript: text, event_id: ++eventId},
});
const tool = (name: string, id: string, parameters: object) => ({
  type: 'client_tool_call',
  client_tool_call: {tool_name: name, tool_call_id: id, parameters},
});
/** The result LAFINA received for one tool call. */
const toolResult = (sent: string[], id: string): string | null => {
  for (const frame of sent) {
    const parsed = JSON.parse(frame) as {
      type?: string;
      tool_call_id?: string;
      result?: string;
    };
    if (parsed.type === 'client_tool_result' && parsed.tool_call_id === id)
      return parsed.result ?? '';
  }
  return null;
};
const contexts = (sent: string[]): string[] =>
  sent
    .map(frame => JSON.parse(frame) as {type?: string; text?: string})
    .filter(f => f.type === 'contextual_update')
    .map(f => f.text ?? '');

const MEETING = {
  request: 'schedule a meeting at 10am to 11am for capstone meeting',
  action: 'create_event',
  title: 'Capstone Meeting',
  date: '2030-06-12',
  time: '10:00',
  endTime: '11:00',
};

/** LAFINA prepares the meeting card from its own fields (a suggested card). */
const prepareMeeting = async (
  call: Awaited<ReturnType<typeof startCall>>,
): Promise<string> => {
  call.message(said(MEETING.request));
  call.message(tool('prepare_lafina_action', `prep-${++eventId}`, MEETING));
  const card = await call.utils.findByTestId('voice-conversation-review-card');
  expect(card).toHaveTextContent(/10:00 AM/);
  const id = latestPendingReview(call.userId, 'voice')?.operationId;
  expect(id).toBeTruthy();
  return id as string;
};

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});

beforeEach(() => {
  jest.spyOn(ttsService, 'speak').mockResolvedValue(undefined as never);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
  endReviewSession();
  activeUser = null;
  delete (NativeModules as Record<string, unknown>).LafinaVoiceConversation;
});

describe('SKILL-02/03 a spoken skill request ends the call and opens the skill', () => {
  test('"start a pomodoro": the call ends at once, the phone says the line, Pomodoro opens', async () => {
    const onBack = jest.fn();
    const onNavigate = jest.fn();
    const call = await startCall('skill-pomo', onBack, onNavigate);
    call.message(said('Can you start a pomodoro?'));
    // No agent turn: LAFINA cannot ask "how long?" or offer a time block.
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    expect(onNavigate.mock.calls[0][0]).toEqual({
      ownerId: call.userId,
      screen: 'notes',
      skill: {skill: 'pomodoro', action: 'start'},
    });
    await waitFor(() =>
      expect(ttsService.speak).toHaveBeenCalledWith(
        'Got it, starting a 25-minute focus session.',
      ),
    );
    expect(contexts(call.calls.sent).join('\n')).not.toMatch(/Say only/);
    // The skill replaces the call screen; the call is not "closed to chat".
    expect(onBack).not.toHaveBeenCalled();
  });

  test('"make flashcards": Flashcards opens ready to create and the line asks for material', async () => {
    const onNavigate = jest.fn();
    const call = await startCall('skill-cards', undefined, onNavigate);
    call.message(said('make flashcards'));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    expect(onNavigate.mock.calls[0][0].skill).toEqual({
      skill: 'flashcards',
      action: 'create',
    });
    await waitFor(() =>
      expect(ttsService.speak).toHaveBeenCalledWith(
        'Got it. Just upload your material in Flashcards.',
      ),
    );
  });

  test('with an unsaved card LAFINA asks first; "no" discards it and opens the skill', async () => {
    const onNavigate = jest.fn();
    const call = await startCall('skill-card', undefined, onNavigate);
    await prepareMeeting(call);
    call.message(said('start a pomodoro'));
    await waitFor(() =>
      expect(contexts(call.calls.sent).join('\n')).toMatch(
        /asked to open Pomodoro, but the card on screen/,
      ),
    );
    expect(onNavigate).not.toHaveBeenCalled();
    call.message(said('no'));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    expect(latestPendingReview(call.userId, 'voice')).toBeNull();
    expect(tasksStore.getAllEvents(call.userId)).toHaveLength(0);
  });

  test('a skill request never becomes a time block card', async () => {
    // No navigation available, so the call stays up and the model's own
    // planner tool arrives: it is refused and no card appears.
    const call = await startCall('skill-no-block');
    call.message(said('start a pomodoro'));
    call.message(
      tool('prepare_lafina_action', 'block-1', {
        request: 'start a pomodoro',
        action: 'create_time_block',
        title: 'Pomodoro',
        date: '2030-06-12',
        time: '10:00',
        endTime: '10:25',
      }),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'block-1')).toMatch(
        /not to add anything to their planner\. No card was prepared/,
      ),
    );
    expect(
      call.utils.queryByTestId('voice-conversation-review-card'),
    ).toBeNull();
    expect(latestPendingReview(call.userId, 'voice')).toBeNull();
  });

  test('"I have a quiz tomorrow" opens nothing', async () => {
    const onNavigate = jest.fn();
    const call = await startCall('skill-none', undefined, onNavigate);
    call.message(said('I have a quiz tomorrow'));
    await act(async () => undefined);
    expect(call.utils.queryByTestId('call-ending-banner')).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('SKILL-03 online tools', () => {
  test('open_lafina_skill without the student asking shows a chip only', async () => {
    const onNavigate = jest.fn();
    const call = await startCall('skill-chip', undefined, onNavigate);
    call.message(said('I am so tired of studying'));
    call.message(
      tool('open_lafina_skill', 'skill-1', {
        skill: 'pomodoro',
        action: 'start',
      }),
    );
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'skill-1')).toMatch(
        /nothing was opened/,
      ),
    );
    expect(call.utils.queryByTestId('call-ending-banner')).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.press(await call.utils.findByTestId('call-skill-chip-open'));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1), {
      timeout: 9000,
    });
    expect(onNavigate.mock.calls[0][0].skill.skill).toBe('pomodoro');
  });

  test('open_lafina_skill refuses a skill not on the list', async () => {
    const call = await startCall('skill-bad', undefined, jest.fn());
    call.message(said('open settings'));
    call.message(tool('open_lafina_skill', 'skill-3', {skill: 'settings'}));
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'skill-3')).toMatch(
        /not a skill LAFINA can open/,
      ),
    );
  });

  test('read_skill_status and a spoken question read the Pomodoro', async () => {
    const call = await startCall('skill-status', undefined, jest.fn());
    jest
      .spyOn(userStore, 'getCurrentUser')
      .mockReturnValue({id: call.userId} as never);
    writeSkillState(call.userId, 'pomodoro', {
      ...newPomodoro(),
      deadline: Date.now() + 12 * 60_000 - 1000,
    });
    call.message(tool('read_skill_status', 'skill-4', {topic: 'pomodoro'}));
    await waitFor(() =>
      expect(toolResult(call.calls.sent, 'skill-4')).toBe(
        '12 minutes left in your focus session.',
      ),
    );
    call.message(said('how long is left on my pomodoro?'));
    await waitFor(() =>
      expect(contexts(call.calls.sent).join('\n')).toMatch(
        /12 minutes left in your focus session/,
      ),
    );
    expect(call.utils.queryByTestId('call-ending-banner')).toBeNull();
  });

  test('"pause my pomodoro" pauses it on the call', async () => {
    const call = await startCall('skill-pause', undefined, jest.fn());
    jest
      .spyOn(userStore, 'getCurrentUser')
      .mockReturnValue({id: call.userId} as never);
    writeSkillState(call.userId, 'pomodoro', {
      ...newPomodoro(),
      deadline: Date.now() + 10 * 60_000,
    });
    call.message(said('pause my pomodoro'));
    await waitFor(() =>
      expect(contexts(call.calls.sent).join('\n')).toMatch(
        /Paused\. 10 minutes left when you resume/,
      ),
    );
    expect(call.utils.queryByTestId('call-ending-banner')).toBeNull();
  });
});
