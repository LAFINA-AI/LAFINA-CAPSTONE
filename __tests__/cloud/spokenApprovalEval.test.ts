import {
  callClosingKind,
  endsWithGoodbye,
  hasDraftApproval,
  isPlainApproval,
} from '../../src/cloud/voiceConversation/turnPolicy';
import {
  APPROVALS,
  CARD_LINES,
  NOT_APPROVALS,
} from '../fixtures/spokenApprovalCases';

describe('CALLFIX-01 spoken approval of the card just shown', () => {
  test.each(CARD_LINES)('every approval saves after: %s', line => {
    const missed = APPROVALS.filter(
      text => !hasDraftApproval(text, line, {cardJustShown: true}),
    );
    expect(missed).toEqual([]);
  });

  test.each(CARD_LINES)(
    'nothing refusing or changing saves after: %s',
    line => {
      const saved = NOT_APPROVALS.filter(text =>
        hasDraftApproval(text, line, {cardJustShown: true}),
      );
      expect(saved).toEqual([]);
    },
  );

  test('negatives are never a plain approval for confirm_draft either', () => {
    expect(NOT_APPROVALS.filter(isPlainApproval)).toEqual([]);
  });

  test('a bare yes to an unrelated question never saves, even with a card open', () => {
    for (const yes of ['yes', 'okay', 'sure', 'oo']) {
      expect(
        hasDraftApproval(yes, 'Do you want to hear tomorrow’s schedule?', {
          cardJustShown: true,
        }),
      ).toBe(false);
    }
  });

  test('a bare yes long after the card was shown answers only a save question', () => {
    expect(hasDraftApproval('okay', 'You have three events tomorrow.')).toBe(
      false,
    );
    expect(
      hasDraftApproval('okay', 'Shall I save Review chemistry?', {
        cardJustShown: false,
      }),
    ).toBe(true);
  });

  test('a clause that refuses does not cancel a later save question', () => {
    expect(
      hasDraftApproval(
        'yes',
        "I can't save it until you say so — should I save it?",
      ),
    ).toBe(true);
    expect(
      hasDraftApproval('yes', "I couldn't save it. Want to hear your day?"),
    ).toBe(false);
  });
});

describe('CALLFIX-03 call closing', () => {
  test.each([
    'bye',
    'Goodbye, Lafina.',
    'okay thank you bye',
    "no that's all",
    "That's all, thanks.",
    'sige bye',
    'end the call',
    'see you later',
    "I'm done",
    'nothing else',
    'ingat',
  ])('goodbye: %s', text => {
    expect(callClosingKind(text)).toBe('goodbye');
  });

  test.each([
    'thank you',
    'Thanks, Lafina!',
    'salamat po',
    'thank you for the help',
  ])('thanks: %s', text => {
    expect(callClosingKind(text)).toBe('thanks');
  });

  test.each([
    'thanks, and also add a task',
    'yes',
    'ok',
    'what is up',
    'bye the way, add a note',
    'remind me later to call mom',
  ])('not a closing: %s', text => {
    expect(callClosingKind(text)).toBe('none');
  });

  test('a goodbye after an answer is found; a trailing thanks is not a goodbye', () => {
    expect(endsWithGoodbye('yes save it, thanks, bye')).toBe(true);
    expect(endsWithGoodbye('save it. see you later')).toBe(true);
    expect(endsWithGoodbye('yes save it, thanks')).toBe(false);
    expect(endsWithGoodbye('save it')).toBe(false);
  });
});
