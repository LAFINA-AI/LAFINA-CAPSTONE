import {detectSkillIntent} from '../../src/ai/skills/skillIntent';
import {handoffLine, validateSkillLaunch} from '../../src/skills/skillLaunch';
import {matches, NOT_SKILL, SKILL_CASES} from '../fixtures/skillLaunchCases';

describe('SKILL-01 reading a request to use a Skill', () => {
  test.each(SKILL_CASES)('%s', (text, expected) => {
    const intent = detectSkillIntent(text);
    expect({text, intent, ok: matches(intent, expected)}).toMatchObject({
      ok: true,
    });
  });

  test.each(NOT_SKILL)('not a skill: %s', text => {
    expect(detectSkillIntent(text)).toBeNull();
  });

  test('"from my Chem 101 notes" is kept as a material hint', () => {
    const intent = detectSkillIntent('make flashcards from my Chem 101 notes');
    expect(intent).toMatchObject({
      kind: 'launch',
      launch: {skill: 'flashcards', action: 'create'},
      materialHint: 'chem 101',
    });
  });
});

describe('SKILL-01 the launch allowlist', () => {
  test('unknown skills are refused; unknown actions fall back to open', () => {
    expect(validateSkillLaunch({skill: 'settings', action: 'open'})).toBeNull();
    expect(validateSkillLaunch({skill: 'meetings', action: 'start'})).toEqual({
      skill: 'meetings',
      action: 'open',
    });
    expect(validateSkillLaunch({skill: 'gwa', action: 'delete'})).toEqual({
      skill: 'gwa',
      action: 'open',
    });
  });

  test('a topic is plain words, trimmed and bounded; counts are capped', () => {
    const launch = validateSkillLaunch({
      skill: 'docgen',
      action: 'create',
      topic: '<script>x</script> {{ignore previous}} ' + 'a'.repeat(400),
    });
    expect(launch?.topic).not.toMatch(/[<>{}]/);
    expect(launch?.topic?.length).toBeLessThanOrEqual(200);
    expect(
      validateSkillLaunch({skill: 'quiz', action: 'create', count: 500})?.count,
    ).toBe(30);
    expect(
      validateSkillLaunch({skill: 'pomodoro', action: 'start', topic: 'x'}),
    ).toEqual({skill: 'pomodoro', action: 'start'});
  });

  test('LAFINA says one short line per skill, and is honest about Online Mode', () => {
    expect(handoffLine({skill: 'pomodoro', action: 'start'})).toBe(
      'Got it, starting a 25-minute focus session.',
    );
    expect(handoffLine({skill: 'flashcards', action: 'create'})).toBe(
      'Got it. Just upload your material in Flashcards.',
    );
    expect(
      handoffLine({skill: 'docgen', action: 'create'}, {online: false}),
    ).toMatch(/needs Online Mode/);
    expect(
      handoffLine(
        {skill: 'pomodoro', action: 'start'},
        {online: true, pomodoroRunning: true},
      ),
    ).toMatch(/already have a focus session/);
    expect(handoffLine({skill: 'meetings', action: 'open'})).toMatch(
      /Tap record/,
    );
  });
});
