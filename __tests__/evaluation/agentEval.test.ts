/**
 * Agent eval (ADR-033): how often the right card or answer comes out of 71
 * realistic English and Taglish requests (19 about alarms, alarm plan A3).
 *
 * 1. Offline pipeline: the deterministic fast path the phone uses with no
 *    internet (no SmolLM2 in Jest, no DeepSeek). Scored per category; the
 *    test guards against regressions below the measured baseline.
 * 2. Agent fields: for requests that point at something said earlier ("book
 *    the first one"), the fields DeepSeek would pass to prepare_lafina_action
 *    must produce the right card.
 *
 * Not measured here: DeepSeek's own choices (needs a signed-in online run)
 * and SmolLM2 on a phone. Set AGENT_EVAL_OUTPUT to a JSON path to save the
 * scores; otherwise nothing is written.
 */
import {writeFileSync} from 'fs';
import {intentService} from '../../src/ai/nlu/intentService';
import type {ValidatedIntent} from '../../src/ai/nlu/types';
import {intentFromToolArguments} from '../../src/ai/voiceActions/structuredAction';
import {
  AGENT_EVAL_CASES,
  EVAL_REFERENCE,
  type AgentEvalCase,
} from '../fixtures/agentEvalCases';

/**
 * Measured 2026-11-15: 36 at ADR-033, 42 after the audit-2 Taglish rules
 * (Taglish 3/10 → 9/10), 61/71 after the 19 alarm cases (alarm 17/17, the
 * two alarm agent-field cases also pass). Raise it when the parser improves.
 */
const OFFLINE_BASELINE = 61;

const problemsWith = (c: AgentEvalCase, got: ValidatedIntent): string[] => {
  // An invalid planner command makes no card: for the student it is a
  // clarification, the same as conversation.
  const intent = got.isValid ? got.intent : 'chat';
  if (!c.intent.includes(intent)) return [`intent=${intent}`];
  const problems: string[] = [];
  for (const field of ['date', 'time', 'endTime'] as const)
    if (field in c && (got[field] ?? null) !== c[field])
      problems.push(`${field}=${got[field] ?? null}`);
  if ('isCompleted' in c && got.isCompleted !== c.isCompleted)
    problems.push(`isCompleted=${got.isCompleted}`);
  if (
    'recurrenceRule' in c &&
    (got.recurrenceRule ?? null) !== c.recurrenceRule
  )
    problems.push(`recurrenceRule=${got.recurrenceRule ?? null}`);
  if ('alarmEnabled' in c && got.alarmEnabled !== c.alarmEnabled)
    problems.push(`alarmEnabled=${got.alarmEnabled}`);
  const title = (got.title || got.targetTitle || '').toLowerCase();
  for (const word of c.titleHas ?? [])
    if (!title.includes(word)) problems.push(`title="${got.title}"`);
  return problems;
};

describe('agent eval: offline pipeline', () => {
  it('scores every case and stays at or above the baseline', async () => {
    const rows: {
      id: string;
      category: string;
      text: string;
      pass: boolean;
      problems: string[];
    }[] = [];
    for (const c of AGENT_EVAL_CASES) {
      const got = await intentService.extractIntent(c.text, {
        referenceDate: EVAL_REFERENCE,
      });
      const problems = problemsWith(c, got);
      rows.push({
        id: c.id,
        category: c.category,
        text: c.text,
        pass: problems.length === 0,
        problems,
      });
    }
    const byCategory: Record<string, {pass: number; total: number}> = {};
    for (const row of rows) {
      const entry = (byCategory[row.category] ??= {pass: 0, total: 0});
      entry.total++;
      if (row.pass) entry.pass++;
    }
    const passed = rows.filter(r => r.pass).length;
    const failures = rows
      .filter(r => !r.pass)
      .map(
        r => `${r.id} [${r.category}] "${r.text}": ${r.problems.join(', ')}`,
      );
    console.log(
      `Agent eval (offline): ${passed}/${rows.length}\n` +
        Object.entries(byCategory)
          .map(([k, v]) => `  ${k}: ${v.pass}/${v.total}`)
          .join('\n') +
        `\nFailures:\n  ${failures.join('\n  ')}`,
    );
    if (process.env.AGENT_EVAL_OUTPUT) {
      writeFileSync(
        process.env.AGENT_EVAL_OUTPUT,
        JSON.stringify(
          {
            kind: 'agent-eval-offline',
            reference: EVAL_REFERENCE.toISOString(),
            passed,
            total: rows.length,
            byCategory,
            rows,
          },
          null,
          2,
        ) + '\n',
      );
    }
    expect(rows).toHaveLength(71);
    expect(passed).toBeGreaterThanOrEqual(OFFLINE_BASELINE);
  });

  it('never turns conversation into a deletion', async () => {
    for (const c of AGENT_EVAL_CASES.filter(x =>
      ['conversation', 'reference'].includes(x.category),
    )) {
      const got = await intentService.extractIntent(c.text, {
        referenceDate: EVAL_REFERENCE,
      });
      expect([c.id, got.intent.startsWith('delete_')]).toEqual([c.id, false]);
    }
  });
});

describe('agent eval: fields from the conversation', () => {
  const cases = AGENT_EVAL_CASES.filter(c => c.agentFields);

  it.each(cases.map(c => [c.id, c.text, c]))(
    '%s "%s" becomes the intended change',
    (_id, _text, c) => {
      const intent = intentFromToolArguments({
        request: c.text,
        ...c.agentFields,
      });
      const fields = c.agentFields as Record<string, string>;
      expect(intent).not.toBeNull();
      expect(intent?.isValid).toBe(true);
      const title = (intent?.title || intent?.targetTitle || '').toLowerCase();
      expect(title).toBe(fields.title.toLowerCase());
      if (fields.date) expect(intent?.date).toBe(fields.date);
      if (fields.time) expect(intent?.time).toBe(fields.time);
      if (fields.action === 'complete_task')
        expect(intent?.isCompleted).toBe(true);
      if (fields.action === 'toggle_alarm')
        expect(intent?.alarmEnabled).toBe(fields.enabled);
      expect(intent?.intent.startsWith('delete_')).toBe(false);
    },
  );
});
