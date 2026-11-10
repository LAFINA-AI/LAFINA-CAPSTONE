import React from 'react';
import {act, render, waitFor} from '@testing-library/react-native';
import {OnlineReminderConversation} from '../../src/ui/components/call/OnlineReminderConversation';
import {useVoiceConversation} from '../../src/ui/hooks/useVoiceConversation';

jest.mock('../../src/ui/hooks/useVoiceConversation', () => ({useVoiceConversation: jest.fn()}));
jest.mock('../../src/ui/contexts/ThemeContext', () => ({
  useTheme: () => ({colors: {primary: 'red', textPrimary: 'black', textSecondary: 'gray', border: 'gray'}}),
}));

it('starts after mounting, supplies the reminder once and ends on unmount', async () => {
  const start = jest.fn();
  const end = jest.fn();
  const sendReminderContext = jest.fn(async () => true);
  let phase = 'connecting';
  (useVoiceConversation as jest.Mock).mockImplementation(() => ({
    start, end, endAndWait: async () => undefined, setMuted: jest.fn(),
    sendReminderContext, snapshot: {phase, muted: false, turns: []},
  }));
  const props = {userId: 'student', task: 'Review math', onSnapshot: jest.fn(), onSpokenTurn: jest.fn()};
  const screen = render(<OnlineReminderConversation {...props} />);
  expect(start).toHaveBeenCalledTimes(1);
  expect(sendReminderContext).not.toHaveBeenCalled();
  phase = 'listening';
  await act(async () => { screen.rerender(<OnlineReminderConversation {...props} />); });
  expect(sendReminderContext).toHaveBeenCalledTimes(1);
  expect(sendReminderContext).toHaveBeenCalledWith('Review math');
  phase = 'speaking';
  await act(async () => { screen.rerender(<OnlineReminderConversation {...props} />); });
  phase = 'listening';
  await act(async () => { screen.rerender(<OnlineReminderConversation {...props} />); });
  expect(sendReminderContext).toHaveBeenCalledTimes(1);
  screen.unmount();
  expect(end).toHaveBeenCalledTimes(1);
});

it('tells the student when the reminder could not be shared', async () => {
  (useVoiceConversation as jest.Mock).mockReturnValue({start: jest.fn(), end: jest.fn(),
    endAndWait: async () => undefined, setMuted: jest.fn(),
    sendReminderContext: jest.fn(async () => false),
    snapshot: {phase: 'listening', muted: false, turns: []}});
  const screen = render(<OnlineReminderConversation userId="student" task="Review math"
    onSnapshot={jest.fn()} onSpokenTurn={jest.fn()} />);
  await waitFor(() => expect(screen.getByText(/could not receive the reminder details/)).toBeTruthy());
});
