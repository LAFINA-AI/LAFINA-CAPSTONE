import React from 'react';
import {act, render} from '@testing-library/react-native';
import {OnlineReminderConversation} from '../../src/ui/components/call/OnlineReminderConversation';
import {useVoiceConversation} from '../../src/ui/hooks/useVoiceConversation';
import {createCallMeter} from '../../src/ui/hooks/callMeter';

jest.mock('../../src/ui/hooks/useVoiceConversation', () => ({
  useVoiceConversation: jest.fn(),
}));
jest.mock('../../src/ui/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      primary: 'red',
      textPrimary: 'black',
      textSecondary: 'gray',
      border: 'gray',
    },
  }),
}));

it('starts after mounting with the reminder in the start-of-call context and ends on unmount', async () => {
  const start = jest.fn();
  const end = jest.fn();
  const sendContext = jest.fn(async () => true);
  let phase = 'connecting';
  const meter = createCallMeter();
  (useVoiceConversation as jest.Mock).mockImplementation(() => ({
    start,
    end,
    endAndWait: async () => undefined,
    setMuted: jest.fn(),
    sendContext,
    snapshot: {phase, muted: false, turns: []},
    meter,
  }));
  const props = {
    userId: 'student',
    task: 'Review math',
    onSnapshot: jest.fn(),
    onSpokenTurn: jest.fn(),
  };
  const screen = render(<OnlineReminderConversation {...props} />);
  expect(start).toHaveBeenCalledTimes(1);
  const options = (useVoiceConversation as jest.Mock).mock.calls[0][1];
  expect(options.extraContext).toContain('"Review math"');
  expect(options.extraContext).toMatch(/do not announce or repeat it/);
  phase = 'listening';
  await act(async () => {
    screen.rerender(<OnlineReminderConversation {...props} />);
  });
  // Nothing is sent mid-call: the server would drop a contextual update.
  expect(sendContext).not.toHaveBeenCalled();
  screen.unmount();
  expect(end).toHaveBeenCalledTimes(1);
});

it('lets the agent read and snooze, and hands planner tools to the call screen', async () => {
  const {actionService} = require('../../src/ai/voiceActions/actionService');
  const {
    REMINDER_CALL_WRITE_NOTE,
  } = require('../../src/ui/components/call/OnlineReminderConversation');
  (useVoiceConversation as jest.Mock).mockClear();
  (useVoiceConversation as jest.Mock).mockImplementation(() => ({
    start: jest.fn(),
    end: jest.fn(),
    endAndWait: async () => undefined,
    setMuted: jest.fn(),
    sendContext: jest.fn(),
    snapshot: {phase: 'listening', muted: false, turns: []},
    meter: createCallMeter(),
  }));
  const execute = jest
    .spyOn(actionService, 'executeTool')
    .mockResolvedValue('Snoozing this reminder for 15 minutes.');
  const onSnooze = jest.fn(async () => 'Snoozing');
  const onPlannerTool = jest.fn(async (name: string) => `screen:${name}`);
  const screen = render(
    <OnlineReminderConversation
      userId="student"
      task="Review math"
      onSnapshot={jest.fn()}
      onSpokenTurn={jest.fn()}
      onSnooze={onSnooze}
      onPlannerTool={onPlannerTool}
    />,
  );
  const {onClientTool} = (useVoiceConversation as jest.Mock).mock.calls[0][1];
  // Planner tools are answered by the call screen from the student's own
  // words; the model's arguments never reach the action service.
  for (const name of [
    'prepare_lafina_action',
    'confirm_draft',
    'prepare_multi_action',
  ])
    expect(await onClientTool(name, {title: 'x'}, () => true)).toBe(
      `screen:${name}`,
    );
  // Other writes are refused without asking the student to repeat anything.
  expect(await onClientTool('save_lafina_memory', {}, () => true)).toBe(
    REMINDER_CALL_WRITE_NOTE,
  );
  expect(REMINDER_CALL_WRITE_NOTE).not.toMatch(
    /say (?:the|it|that) (?:change )?again/i,
  );
  expect(execute).not.toHaveBeenCalled();
  expect(await onClientTool('snooze_reminder', {minutes: 15}, () => true)).toBe(
    'Snoozing this reminder for 15 minutes.',
  );
  expect(execute).toHaveBeenCalledWith(
    'student',
    expect.any(String),
    'snooze_reminder',
    {minutes: 15},
    expect.any(Function),
    expect.objectContaining({onSnoozeReminder: onSnooze}),
  );
  const clear = jest.spyOn(actionService, 'clearSessionActions');
  screen.unmount();
  expect(clear).toHaveBeenCalledWith(execute.mock.calls[0][1]);
  execute.mockRestore();
  clear.mockRestore();
});
