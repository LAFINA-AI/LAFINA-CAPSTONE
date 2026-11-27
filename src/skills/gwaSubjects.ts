import type {AcademicCourseRecord} from '../storage/academicProfileStore';
import type {GradeSubject} from './studyLogic';
import {generateId} from '../utils';

export const subjectKey = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLowerCase();
const codeKey = (code: string) => subjectKey(code).replace(/\s/g, '');
const courseName = (course: AcademicCourseRecord) =>
  course.subjectTitle.trim() || course.title?.trim() || 'Unnamed subject';

export function subjectsFromCor(
  courses: AcademicCourseRecord[],
): GradeSubject[] {
  const seen = new Set<string>();
  return courses.flatMap(course => {
    if (!Number.isFinite(course.creditUnits) || course.creditUnits <= 0)
      return [];
    const name = courseName(course);
    const key = codeKey(course.code) || subjectKey(name);
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        id: generateId('subject'),
        name,
        corCourseCode: course.code.trim() || undefined,
        units: course.creditUnits,
        grade: null,
      },
    ];
  });
}

/** Only repair code-only rows against the COR for the same semester.
 * Preserve IDs, grades, units and custom names; never infer an older term.
 * The repaired label is saved with the student's next ordinary edit.
 */
export function restoreCorSubjectNames(
  subjects: GradeSubject[],
  courses: AcademicCourseRecord[],
): GradeSubject[] {
  return subjects.map(subject => {
    const key = codeKey(subject.corCourseCode || subject.name);
    const matches = courses.filter(c => codeKey(c.code) === key && key);
    if (matches.length !== 1) return subject;
    const course = matches[0];
    const isCodeOnly = codeKey(subject.name) === codeKey(course.code);
    return {
      ...subject,
      name: isCodeOnly ? courseName(course) : subject.name,
      corCourseCode: course.code.trim(),
    };
  });
}

export function mergeCorSubjects(
  subjects: GradeSubject[],
  incoming: GradeSubject[],
): GradeSubject[] {
  const codes = new Set(subjects.map(s => codeKey(s.corCourseCode || '')));
  const manualNames = new Set(
    subjects.filter(s => !s.corCourseCode).map(s => subjectKey(s.name)),
  );
  const allNames = new Set(subjects.map(s => subjectKey(s.name)));
  return [
    ...subjects,
    ...incoming.filter(s => {
      const code = codeKey(s.corCourseCode || '');
      const name = subjectKey(s.name);
      if (
        (code && codes.has(code)) ||
        manualNames.has(name) ||
        (!code && allNames.has(name))
      )
        return false;
      if (code) codes.add(code);
      else manualNames.add(name);
      allNames.add(name);
      return true;
    }),
  ];
}
