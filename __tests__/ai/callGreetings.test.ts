/**
 * Call Lafina's opening line: it follows the conversational tone, the time
 * of day and the student's name, and two calls in a row open differently.
 */
import {
  greetingOptions,
  greetingToneFor,
  pickCallGreeting,
  resetCallGreetingHistory,
  timeOfDay,
} from '../../src/ai/callGreetings';

const at = (hour: number) => new Date(2026, 10, 22, hour, 15);

beforeEach(() => resetCallGreetingHistory());

describe('call greetings', () => {
  it('has several lines for every tone, online and offline, at any hour', () => {
    for (const mode of ['online', 'offline'] as const) {
      for (const tone of ['default', 'casual', 'professional'] as const) {
        for (const hour of [7, 14, 19, 23]) {
          const options = greetingOptions({mode, tone, now: at(hour)});
          expect(options.length).toBeGreaterThanOrEqual(3);
          expect(new Set(options).size).toBe(options.length);
        }
      }
    }
  });

  it('casual and professional open differently from each other and from Default', () => {
    const now = at(14);
    const casual = greetingOptions({mode: 'online', tone: 'casual', now});
    const pro = greetingOptions({mode: 'online', tone: 'professional', now});
    const plain = greetingOptions({mode: 'online', tone: 'default', now});
    expect(casual.filter(line => pro.includes(line))).toEqual([]);
    expect(casual.filter(line => plain.includes(line))).toEqual([]);
    expect(casual.some(line => /^Hey/.test(line))).toBe(true);
    expect(pro.every(line => !/^Hey|What's up/.test(line))).toBe(true);
  });

  it('every offline line says LAFINA is offline', () => {
    for (const tone of ['default', 'casual', 'professional'] as const) {
      for (const hour of [7, 14, 19, 23]) {
        for (const line of greetingOptions({
          mode: 'offline',
          tone,
          now: at(hour),
        })) {
          expect(line).toMatch(/offline|no internet/i);
        }
      }
    }
  });

  it('uses the name naturally, and reads well without one', () => {
    const named = greetingOptions({
      mode: 'online',
      tone: 'casual',
      name: 'Ana',
      now: at(8),
    });
    expect(named).toContain("Hey Ana! What's up?");
    expect(named).toContain("Morning, Ana! What's first today?");
    const unnamed = greetingOptions({
      mode: 'online',
      tone: 'casual',
      now: at(8),
    });
    expect(unnamed).toContain("Hey! What's up?");
    for (const line of [...named, ...unnamed]) {
      expect(line).not.toMatch(/\s[,.!?]|\s{2}|undefined|null/);
    }
  });

  it('time-of-day lines appear only at that time', () => {
    const morning = greetingOptions({
      mode: 'online',
      tone: 'professional',
      now: at(8),
    });
    const late = greetingOptions({
      mode: 'online',
      tone: 'professional',
      now: at(23),
    });
    expect(morning.some(line => line.startsWith('Good morning'))).toBe(true);
    expect(morning.some(line => line.includes('this late'))).toBe(false);
    expect(late.some(line => line.startsWith('Good morning'))).toBe(false);
    expect(timeOfDay(at(4))).toBe('late');
    expect(timeOfDay(at(5))).toBe('morning');
    expect(timeOfDay(at(12))).toBe('afternoon');
    expect(timeOfDay(at(18))).toBe('evening');
    expect(timeOfDay(at(22))).toBe('late');
  });

  it('never opens two calls in a row with the same line', () => {
    let previous = '';
    for (let i = 0; i < 40; i += 1) {
      const line = pickCallGreeting({
        mode: 'online',
        tone: 'casual',
        now: at(14),
      });
      expect(line).not.toBe(previous);
      previous = line;
    }
  });

  it('online and offline remember their own last line', () => {
    const first = () => 0;
    const online = pickCallGreeting({
      mode: 'online',
      now: at(14),
      random: first,
    });
    const offline = pickCallGreeting({
      mode: 'offline',
      now: at(14),
      random: first,
    });
    expect(offline).toMatch(/offline/i);
    expect(
      pickCallGreeting({mode: 'online', now: at(14), random: first}),
    ).not.toBe(online);
  });

  it('an unreadable or unset tone is Default', () => {
    expect(greetingToneFor('')).toBe('default');
    expect(greetingToneFor('no-such-user')).toBe('default');
  });
});
