import {
  mergeCorSubjects,
  restoreCorSubjectNames,
  subjectsFromCor,
} from '../../src/skills/gwaSubjects';
import type {AcademicCourseRecord} from '../../src/storage/academicProfileStore';
const course = (
  code = 'IT414',
  subjectTitle = 'IT Elective 3',
  creditUnits = 3,
): AcademicCourseRecord => ({
  code,
  subjectTitle,
  creditUnits,
  lecUnits: 3,
  labUnits: 0,
  section: '',
  faculty: '',
  scheduleSummary: '',
});

test('COR import uses names, keeps distinct codes with identical titles, and excludes invalid units/duplicates', () => {
  const rows = subjectsFromCor([
    course(),
    course('IT415', 'IT Elective 3'),
    course(),
    course('X', 'No credits', 0),
    course('Y', 'Bad credits', NaN),
  ]);
  expect(rows.map(s => s.name)).toEqual(['IT Elective 3', 'IT Elective 3']);
  expect(rows.map(s => s.corCourseCode)).toEqual(['IT414', 'IT415']);
  expect(
    mergeCorSubjects(
      rows,
      subjectsFromCor([course(), course('IT415', 'IT Elective 3')]),
    ),
  ).toEqual(rows);
});

test('legacy code-only rows recover names while grades, IDs, units and custom labels survive', () => {
  const saved = [
    {id: 'saved', name: ' it 414 ', units: 4, grade: 1.75},
    {
      id: 'custom',
      name: 'My elective',
      corCourseCode: 'IT415',
      units: 3,
      grade: 2,
    },
  ];
  const restored = restoreCorSubjectNames(saved, [course(), course('IT415')]);
  expect(restored[0]).toEqual({
    ...saved[0],
    name: 'IT Elective 3',
    corCourseCode: 'IT414',
  });
  expect(restored[1]).toEqual(saved[1]);
  expect(saved[0].name).toBe(' it 414 ');
  expect(
    mergeCorSubjects(restored, subjectsFromCor([course(), course('IT415')])),
  ).toEqual(restored);
});

test('unmatched or ambiguous saved codes remain untouched; manual names prevent reimport duplicates', () => {
  const saved = [{id: 'old', name: 'IT414', units: 3, grade: 2}];
  expect(restoreCorSubjectNames(saved, [])).toEqual(saved);
  expect(
    restoreCorSubjectNames(saved, [course(), course('IT414', 'Another title')]),
  ).toEqual(saved);
  const manual = [{...saved[0], name: ' IT   Elective 3 '}];
  expect(mergeCorSubjects(manual, subjectsFromCor([course()]))).toEqual(manual);
});

test('missing names never fall back to course codes', () => {
  expect(subjectsFromCor([course('IT414', '')])[0].name).toBe(
    'Unnamed subject',
  );
  expect(
    subjectsFromCor([{...course('IT414', '  '), title: 'IT Elective 3'}])[0]
      .name,
  ).toBe('IT Elective 3');
});

test('an imported subject missing a code matches an existing subject by title', () => {
  const existing = subjectsFromCor([course()]);
  expect(
    mergeCorSubjects(existing, subjectsFromCor([course('', 'IT Elective 3')])),
  ).toEqual(existing);
});
