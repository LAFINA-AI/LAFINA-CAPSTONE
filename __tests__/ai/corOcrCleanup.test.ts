/**
 * OCR clean-up rules. Each input reproduces a confusion ML Kit produced when
 * reading a real USTP COR screenshot on a phone (values here are invented).
 */
import {
  readScheduleCell,
  parseCorLayout,
} from '../../src/ai/vision/corLayoutParser';
import {
  cleanOcrCurriculum,
  cleanOcrMajor,
  cleanOcrRoom,
  cleanOcrYearLevel,
  fixLeadingL,
  normalizeOcrTime,
  snapVocabulary,
} from '../../src/ai/vision/corOcrCleanup';
import {checkCorExtraction} from '../../src/ai/vision/corChecks';
import {
  buildSyntheticCorPage,
  toOcrPage,
  type SynthCor,
} from '../fixtures/corSynthetic';

describe('OCR schedule cells', () => {
  test.each([
    // day glued to time, "." for ":", "/" read as "I", "0" read as "O"
    [
      'F7.00 AM - 10:00 AMIO9-302(CiTC Lab 3)',
      'F',
      '07:00',
      '10:00',
      '09-302(CITC Lab 3)',
    ],
    // ":" read as "-" in the end time, no room
    ['S4:00 PM -7-00 PM', 'S', '16:00', '19:00', 'TBA'],
    // dash read as ".", ":" dropped, "/" dropped, "Classroom" misspelled
    [
      'T3:00 PM . 500 PMModular Classoom 1',
      'T',
      '15:00',
      '17:00',
      'Modular Classroom 1',
    ],
    // "0" read as "D" after a slash read as "I"
    ['w 10:00 AM - 1:00 PMID9-105', 'W', '10:00', '13:00', '09-105'],
    ['T11:30 AM - 1:00 PMI51-204', 'T', '11:30', '13:00', '51-204'],
    ['TF 1:00 PM - 2:30 PM', 'TF', '13:00', '14:30', 'TBA'],
  ])('%s', (cell, dayCode, start, end, room) => {
    expect(readScheduleCell(cell, 'ocr')).toEqual(
      expect.objectContaining({dayCode, startTime: start, endTime: end, room}),
    );
  });

  test.each([
    ['wr:00 PM -9:00 PMModdar Classroom 2'], // "W7" read as "wr": unrecoverable
    ['F 7:00 AM - 1O:OO?x AM/51-201'], // a period left over means a bad read
    ['Maria Santos'],
  ])('rejects %s so the review flags it', cell => {
    expect(readScheduleCell(cell, 'ocr')).toBeNull();
  });

  test('PDF text keeps the strict grammar (no OCR repairs)', () => {
    expect(readScheduleCell('F7.00 AM - 10:00 AMIO9-302', 'pdf')).toBeNull();
  });

  test('normalizeOcrTime', () => {
    expect(normalizeOcrTime('7.00')).toBe('7:00');
    expect(normalizeOcrTime('7-00')).toBe('7:00');
    expect(normalizeOcrTime('500')).toBe('5:00');
    expect(normalizeOcrTime('1O:OO')).toBe('10:00');
    expect(normalizeOcrTime('r:00')).toBeNull();
  });
});

describe('OCR template vocabulary', () => {
  test('college and program words snap back to the template spelling', () => {
    expect(
      snapVocabulary('COLLEGE OF INFORMATIKON TECHNOLOGY AND cOMPUTING'),
    ).toBe('COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING');
    expect(snapVocabulary('B.S. Iin Informaton Technology')).toBe(
      'B.S. in Information Technology',
    );
  });

  test('names and unknown words are left alone', () => {
    expect(snapVocabulary('Ana Reyes')).toBe('Ana Reyes');
    expect(snapVocabulary('Moddar')).toBe('Moddar');
  });

  test('a leading "l" before a consonant is an "I", other words are untouched', () => {
    expect(fixLeadingL('Social and Professional lssues')).toBe(
      'Social and Professional Issues',
    );
    expect(fixLeadingL('Plant Tissues and Life Works')).toBe(
      'Plant Tissues and Life Works',
    );
  });

  test('rooms, year level, major and curriculum', () => {
    expect(cleanOcrRoom('O9-302(CiTC Lab 3)')).toBe('09-302(CITC Lab 3)');
    expect(cleanOcrRoom('Modular Classroam 4')).toBe('Modular Classroom 4');
    expect(cleanOcrYearLevel('4h Yoar- Baccalauroate')).toBe(
      '4th Year - Baccalaureate',
    );
    expect(cleanOcrYearLevel('2nd Year - Baccalaureate')).toBe(
      '2nd Year - Baccalaureate',
    );
    expect(cleanOcrMajor('NIA')).toBe('N/A');
    expect(cleanOcrMajor('Mathematics')).toBe('Mathematics');
    expect(cleanOcrCurriculum('crTC-BSIT-2018-2019', 'CITC')).toBe(
      'CITC-BSIT-2018-2019',
    );
    expect(cleanOcrCurriculum('CEA-BSCE-2018-2019', 'CITC')).toBe(
      'CEA-BSCE-2018-2019',
    );
  });
});

describe('OCR page with the confusions seen on a phone', () => {
  const COR: SynthCor = {
    registrationNo: '123456',
    studentNo: '2023000001',
    fullName: 'DELA CRUZ, JUAN MIGUEL S',
    gender: 'M',
    age: 21,
    college: 'COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING',
    program: 'B.S. in Information Technology',
    major: 'N/A',
    yearLevel: '4th Year - Baccalaureate',
    curriculum: 'CITC-BSIT-2018-2019',
    term: '1st Semester AY 2026-2027',
    campusLine: 'USTP CDO CAMPUS',
    courses: [
      {
        code: 'IT413',
        title: 'Social and Professional Issues',
        lec: 3,
        lab: 0,
        credit: 3,
        section: 'IT4R11_Track2',
        sessions: [
          {
            dayCode: 'M',
            start: '3:00 PM',
            end: '4:30 PM',
            room: 'Modular Classroom 4',
            faculty: 'Ana Reyes',
          },
        ],
      },
      {
        code: 'GnS',
        title: 'Gender and Society',
        lec: 3,
        lab: 0,
        credit: 3,
        section: 'IT4R11_Track2',
        sessions: [
          {
            dayCode: 'TF',
            start: '1:00 PM',
            end: '2:30 PM',
            room: '',
            faculty: 'Pedro Garcia',
          },
        ],
      },
    ],
  };
  const swap: Record<string, string> = {
    'SCHEDULE/ROOM': 'sCHEDULEROOM',
    'Year/Term': 'Year/Ten',
    'Unit(s)': 'Unlt(O)',
    Issues: 'lssues',
    INFORMATION: 'INFORMATIKON',
    'N/A': 'NIA',
    'CITC-BSIT-2018-2019': 'crTC-BSIT-2018-2019',
    Classroom: 'Classoom',
  };

  test('is read correctly and only the genuinely uncertain parts are flagged', () => {
    const pdf = buildSyntheticCorPage(COR);
    const page = toOcrPage({
      ...pdf,
      words: pdf.words.map(w => (swap[w.t] ? {...w, t: swap[w.t]} : w)),
    });
    const outcome = parseCorLayout(page);
    if (!outcome.ok) throw new Error(outcome.reason);
    const {profile, courses, extraction} = outcome.result;
    expect(profile.registrationNo).toBe('123456');
    expect(profile.academicTerm).toBe('1st Semester AY 2026-2027');
    expect(profile.college).toBe(
      'COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING',
    );
    expect(profile.major).toBe('N/A');
    expect(profile.curriculum).toBe('CITC-BSIT-2018-2019');
    expect(courses.map(c => c.subjectTitle)).toEqual([
      'Social and Professional Issues',
      'Gender and Society',
    ]);
    expect(courses[0].sessions[0].room).toBe('Modular Classroom 4');
    expect(extraction?.printedTotals).toEqual({lec: 6, lab: 0, credit: 6});
    expect(checkCorExtraction(outcome.result).level).toBe('checked');
  });

  test('a one-letter section misread is flagged, not changed', () => {
    const pdf = buildSyntheticCorPage(COR);
    let seen = 0;
    const page = toOcrPage({
      ...pdf,
      words: pdf.words.map(w =>
        w.t === 'IT4R11_Track2' && ++seen === 2
          ? {...w, t: 'ITAR11_Track2'}
          : w,
      ),
    });
    const outcome = parseCorLayout(page);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.result.courses[1].section).toBe('ITAR11_Track2');
    expect(checkCorExtraction(outcome.result).issues.map(i => i.code)).toEqual([
      'section_near_main',
    ]);
  });
});
