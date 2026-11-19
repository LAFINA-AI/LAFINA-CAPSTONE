import type {ParsedUstpCorResult} from '../../src/ai/vision/ustpCorParser';

export interface ExpectedCorSession {
  dayCode: string;
  start: string;
  end: string;
  room: string;
  faculty: string;
}

export interface ExpectedCorCourse {
  code: string;
  title: string;
  lec: number;
  lab: number;
  credit: number;
  section: string;
  faculty?: string;
  sessions: ExpectedCorSession[];
}

export interface ExpectedCor {
  profile: Record<string, string | number | null>;
  courses: ExpectedCorCourse[];
}

export interface CorFieldResult {
  field: string;
  expected: unknown;
  actual: unknown;
  ok: boolean;
}

const norm = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;

/** Field-by-field comparison of a parsed COR against the ground truth. */
export const scoreCor = (
  parsed: ParsedUstpCorResult,
  expected: ExpectedCor,
): {fields: CorFieldResult[]; total: number; correct: number} => {
  const fields: CorFieldResult[] = [];
  const push = (field: string, exp: unknown, act: unknown) =>
    fields.push({
      field,
      expected: exp,
      actual: act,
      ok: norm(exp) === norm(act),
    });

  const profile = parsed.profile as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected.profile)) {
    push(`profile.${key}`, value, profile[key]);
  }
  push('courses.count', expected.courses.length, parsed.courses.length);
  expected.courses.forEach((exp, i) => {
    const act = parsed.courses[i];
    const p = `course[${i}:${exp.code}]`;
    push(`${p}.code`, exp.code, act?.code);
    push(`${p}.title`, exp.title, act?.subjectTitle);
    push(`${p}.lec`, exp.lec, act?.lecUnits);
    push(`${p}.lab`, exp.lab, act?.labUnits);
    push(`${p}.credit`, exp.credit, act?.creditUnits);
    push(`${p}.section`, exp.section, act?.section);
    if (exp.faculty) push(`${p}.faculty`, exp.faculty, act?.faculty);
    push(`${p}.sessions.count`, exp.sessions.length, act?.sessions.length);
    exp.sessions.forEach((es, j) => {
      const as = act?.sessions[j];
      const sp = `${p}.session[${j}]`;
      push(`${sp}.dayCode`, es.dayCode, as?.dayCode);
      push(`${sp}.start`, es.start, as?.startTime);
      push(`${sp}.end`, es.end, as?.endTime);
      push(`${sp}.room`, es.room, as?.room);
      push(`${sp}.faculty`, es.faculty, as?.faculty);
    });
  });
  const correct = fields.filter(f => f.ok).length;
  return {fields, total: fields.length, correct};
};
