import React from 'react';
import {act, render} from '@testing-library/react-native';
import {OnlineReminderConversation} from '../../src/ui/components/call/OnlineReminderConversation';
import {useVoiceConversation} from '../../src/ui/hooks/useVoiceConversation';

jest.mock('../../src/ui/hooks/useVoiceConversation', () => ({useVoiceConversation: jest.fn()}));
jest.mock('../../src/ui/contexts/ThemeContext', () => ({
  useTheme: () => ({colors: {primary: 'red', textPrimary: 'black', textSecondary: 'gray', border: 'gray'}}),
}));

it('starts after mounting with the reminder in the start-of-call context and ends on unmount', async () => {
  const start = jest.fn();
  const end = jest.fn();
  const sendContext = jest.fn(async () => true);
  let phase = 'connecting';
  (useVoiceConversation as jest.Mock).mockImplementation(() => ({
    start, end, endAndWait: async () => undefined, setMuted: jest.fn(),
    sendContext, snapshot: {phase, muted: false, turns: []},
  }));
  const props = {userId: 'student', task: 'Review math', onSnapshot: jest.fn(), onSpokenTurn: jest.fn()};
  const screen = render(<OnlineReminderConversation {...props} />);
  expect(start).toHaveBeenCalledTimes(1);
  const options = (useVoiceConversation as jest.Mock).mock.calls[0][1];
  expect(options.extraContext).toContain('"Review math"');
  expect(options.extraContext).toMatch(/do not announce or repeat it/);
  phase = 'listening';
  await act(async () => { screen.rerender(<OnlineReminderConversation {...props} />); });
  // Nothing is sent mid-call: the server would drop a contextual update.
  expect(sendContext).not.toHaveBeenCalled();
  screen.unmount();
  expect(end).toHaveBeenCalledTimes(1);
});
