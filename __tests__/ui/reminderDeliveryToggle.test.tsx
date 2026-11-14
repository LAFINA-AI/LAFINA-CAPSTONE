import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {CommandReviewCard} from '../../src/ui/components/chat/CommandReviewCard';
import type {CommandProposal} from '../../src/ai/nlu/commandReview';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';

const proposal = (over: Partial<CommandProposal> = {}): CommandProposal => ({
  operationId: 'op-1',
  ownerId: 'local_guest_user',
  surface: 'chat',
  intent: 'create_reminder',
  heading: 'Create reminder',
  title: 'Review physics',
  details: ['Tomorrow at 7:00 PM'],
  assumptions: [],
  warnings: [],
  destructive: false,
  expiresAt: Date.now() + 60_000,
  reminderDelivery: 'call',
  reply: 'Review physics tomorrow at 7:00 PM.',
  ...over,
});

const renderCard = (p: CommandProposal, onDeliveryChange?: jest.Mock) =>
  render(
    <ThemeProvider userId="local_guest_user">
      <CommandReviewCard
        proposal={p}
        expired={false}
        busy={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        onDismiss={jest.fn()}
        onDeliveryChange={onDeliveryChange}
        testIDPrefix="chat-review"
      />
    </ThemeProvider>,
  );

describe('review card "Call me / Notify only" (audit finding 16)', () => {
  it('shows the choice with Call me selected and switches on tap', () => {
    const onDeliveryChange = jest.fn();
    const utils = renderCard(proposal(), onDeliveryChange);
    expect(
      utils.getByTestId('chat-review-delivery-call').props.accessibilityState,
    ).toMatchObject({checked: true});
    fireEvent.press(utils.getByTestId('chat-review-delivery-notify'));
    expect(onDeliveryChange).toHaveBeenCalledWith('notify');
    // Tapping the selected choice again does nothing.
    fireEvent.press(utils.getByTestId('chat-review-delivery-call'));
    expect(onDeliveryChange).toHaveBeenCalledTimes(1);
  });

  it('is hidden when the card creates no reminder or no handler is given', () => {
    expect(
      renderCard(proposal({reminderDelivery: null}), jest.fn()).queryByTestId(
        'chat-review-delivery',
      ),
    ).toBeNull();
    expect(renderCard(proposal()).queryByTestId('chat-review-delivery')).toBeNull();
  });
});
