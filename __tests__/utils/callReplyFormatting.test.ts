import {
  formatCallReplyMarkdown,
  highlightCallInlineDetails,
  splitCallSentences,
} from '../../src/utils/callReplyFormatting';

describe('splitCallSentences', () => {
  it('splits ordinary multi-sentence prose while protecting abbreviations and decimals', () => {
    const text =
      'Dr. Cruz checked Section 4.2 at 9:30 a.m. in Room 201. Please review pp. 18-19 (e.g. attendance rules). Want more details?';
    expect(splitCallSentences(text)).toEqual([
      'Dr. Cruz checked Section 4.2 at 9:30 a.m. in Room 201.',
      'Please review pp. 18-19 (e.g. attendance rules).',
      'Want more details?',
    ]);
  });
});

describe('highlightCallInlineDetails', () => {
  it('highlights clock times, explicit dates, and handbook citations without touching existing markdown', () => {
    expect(
      highlightCallInlineDetails(
        'Your **Capstone** is on May 8, 2026 at 2:30 p.m. per Section 4.2 on page 18.',
      ),
    ).toBe(
      'Your **Capstone** is on **May 8, 2026** at **2:30 p.m.** per **Section 4.2** on **page 18**.',
    );
  });

  it('does not treat modal May as a date or match inside URLs', () => {
    expect(
      highlightCallInlineDetails(
        'May I check https://example.com/2026-11-20 or help tomorrow?',
      ),
    ).toBe('May I check https://example.com/2026-11-20 or help tomorrow?');
  });
});

describe('formatCallReplyMarkdown', () => {
  it('formats multi-sentence Call Lafina overview replies into scannable paragraphs', () => {
    const raw =
      'I can read your schedule, tasks, notes and alarms, and I can prepare planner items for you — tasks, events, time blocks, reminders or notes — which you confirm before anything saves. I can also find free time in your day and help you revise or cancel a draft. Want me to set something up?';

    expect(formatCallReplyMarkdown(raw)).toBe(
      [
        'I can read your schedule, tasks, notes and alarms, and I can prepare planner items for you — tasks, events, time blocks, reminders or notes — which you confirm before anything saves.',
        '',
        'I can also find free time in your day and help you revise or cancel a draft.',
        '',
        'Want me to set something up?',
      ].join('\n'),
    );
  });

  it('formats colon-introduced lists into bullet items while keeping date commas intact', () => {
    const raw =
      "Here's what you have tomorrow: Math 101 on Friday, May 8 at 9:00 AM, Capstone Meeting at 1:30 PM, and Quiz Prep at 4:00 PM. Want me to add anything?";

    expect(formatCallReplyMarkdown(raw)).toBe(
      [
        "Here's what you have tomorrow:",
        '- Math 101 on Friday, **May 8** at **9:00 AM**',
        '- Capstone Meeting at **1:30 PM**',
        '- Quiz Prep at **4:00 PM**',
        '',
        'Want me to add anything?',
      ].join('\n'),
    );
  });

  it('handles lists without Oxford comma', () => {
    const raw =
      'Here is your agenda: Math 101 at 9:00 AM, Capstone Meeting at 1:30 PM and Quiz Prep at 4:00 PM.';
    expect(formatCallReplyMarkdown(raw)).toBe(
      [
        'Here is your agenda:',
        '- Math 101 at **9:00 AM**',
        '- Capstone Meeting at **1:30 PM**',
        '- Quiz Prep at **4:00 PM**',
      ].join('\n'),
    );
  });

  it('does not turn non-list colon prose into bullets', () => {
    const raw = 'Quick tip: if you miss a class, notify your instructor.';
    expect(formatCallReplyMarkdown(raw)).toBe(raw);
  });

  it('formats inline Step N sequences and numbered lists cleanly', () => {
    expect(
      formatCallReplyMarkdown(
        'How to submit: Step 1: Check your clearance. Step 2: Upload your form by May 15. Want a reminder?',
      ),
    ).toBe(
      [
        'How to submit:',
        '- **Step 1:** Check your clearance.',
        '- **Step 2:** Upload your form by **May 15**.',
        '',
        'Want a reminder?',
      ].join('\n'),
    );

    expect(
      formatCallReplyMarkdown(
        'Top priorities: 1) Finish lab report by 5:00 PM. 2) Review Section 4.2.',
      ),
    ).toBe(
      [
        'Top priorities:',
        '1. Finish lab report by **5:00 PM**.',
        '2. Review **Section 4.2**.',
      ].join('\n'),
    );
  });

  it('does not treat sentence-ending clock numbers like "at 1." as numbered lists', () => {
    const raw = "Let's meet at 1. Wait, no, let's check at 2. Does that work?";
    expect(formatCallReplyMarkdown(raw)).toBe(
      "Let's meet at 1. Wait, no, let's check at 2.\n\nDoes that work?",
    );
  });

  it('formats ordinal step sentences into bullets when an opener and continuation appear', () => {
    const raw =
      'First, check your calendar. Second, pick a free slot at 2:00 PM. Finally, confirm the draft.';
    expect(formatCallReplyMarkdown(raw)).toBe(
      [
        '- **First,** check your calendar.',
        '- **Second,** pick a free slot at **2:00 PM**.',
        '- **Finally,** confirm the draft.',
      ].join('\n'),
    );
  });

  it('leaves short plain confirmation strings and existing Markdown intact', () => {
    expect(
      formatCallReplyMarkdown(
        'Check the card — nothing is saved until confirmed.',
      ),
    ).toBe('Check the card — nothing is saved until confirmed.');

    const existingMarkdown =
      'You have **2 tasks**:\n\n• **9:00 AM** — Capstone Meeting *(Event)*';
    expect(formatCallReplyMarkdown(existingMarkdown)).toBe(existingMarkdown);
  });
});
