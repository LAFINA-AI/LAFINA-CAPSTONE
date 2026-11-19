import {
  parseCorLayout,
  readHeaderLine,
  readScheduleCell,
  type CorPageWords,
} from '../../src/ai/vision/corLayoutParser';
import {checkCorExtraction} from '../../src/ai/vision/corChecks';
import {chooseCorReading} from '../../src/ai/vision/corExtraction';
import {parseUstpCor} from '../../src/ai/vision/ustpCorParser';
import {buildCorDraft} from '../../src/ai/vision/corReviewModel';
import {scoreCor} from '../fixtures/corAccuracy';
import {
  buildSyntheticCorPage,
  expectedFromSynthetic,
  randomSyntheticCor,
  toOcrPage,
  type SynthCor,
} from '../fixtures/corSynthetic';

const REF = new Date('2026-11-11T09:00:00Z');

const parseOrThrow = (page: CorPageWords) => {
  const outcome = parseCorLayout(page, REF);
  if (!outcome.ok) throw new Error(`layout failed: ${outcome.reason}`);
  return outcome.result;
};

const wrongFields = (cor: SynthCor, page: CorPageWords) => {
  const parsed = parseOrThrow(page);
  return scoreCor(parsed, expectedFromSynthetic(cor)).fields.filter(f => !f.ok);
};

/** Mirrors the sample COR's layout with invented student data. */
const SAMPLE: SynthCor = {
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
      code: 'IT414',
      title: 'IT Elective 3',
      lec: 2,
      lab: 1,
      credit: 3,
      section: 'IT4R11_Track2',
      sessions: [
        {
          dayCode: 'F',
          start: '7:00 AM',
          end: '10:00 AM',
          room: '09-302(CITC Lab 3)',
          faculty: 'Maria Santos',
        },
        {
          dayCode: 'W',
          start: '7:00 AM',
          end: '9:00 AM',
          room: '51-201',
          faculty: 'Maria Santos',
        },
      ],
    },
    {
      code: 'IT411',
      title: 'CAPSTONE Project and Research 2',
      lec: 2,
      lab: 1,
      credit: 3,
      section: 'IT411_Reyes',
      faculty: 'ANA REYES',
      sessions: [],
    },
    {
      code: 'IT412',
      title: 'System Administration and Maintenance',
      lec: 2,
      lab: 1,
      credit: 3,
      section: 'IT4R11_Track2',
      sessions: [
        {
          dayCode: 'S',
          start: '4:00 PM',
          end: '7:00 PM',
          room: '',
          faculty: 'Pedro Garcia',
        },
        {
          dayCode: 'W',
          start: '7:00 PM',
          end: '9:00 PM',
          room: 'Modular Classroom 2',
          faculty: 'Pedro Garcia',
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
          faculty: 'JUAN DELA CRUZ JR.',
        },
      ],
    },
  ],
};

describe('COR layout reader (portal template geometry)', () => {
  test('reads every field of a portal-layout COR exactly and passes all checks', () => {
    const page = buildSyntheticCorPage(SAMPLE);
    const parsed = parseOrThrow(page);
    expect(wrongFields(SAMPLE, page)).toEqual([]);
    expect(parsed.profile.formattedName).toBe('Juan Miguel S. Dela Cruz');
    expect(parsed.profile.campus).toBeTruthy();
    expect(parsed.profile.totalCreditUnits).toBe(12);
    expect(parsed.extraction).toEqual({
      method: 'pdf_text',
      printedTotals: {lec: 9, lab: 3, credit: 12},
      portalPdf: true,
    });
    const gns = parsed.courses.find(c => c.code === 'GnS')!;
    expect(gns.sessions[0].days).toEqual(['Tuesday', 'Friday']);
    expect(parsed.courses.find(c => c.code === 'IT411')).toMatchObject({
      faculty: 'ANA REYES',
      sessions: [],
    });
    expect(checkCorExtraction(parsed)).toEqual({
      method: 'pdf_text',
      level: 'exact',
      issues: [],
    });
  });

  test('300 randomized portal-layout CORs are read with zero field errors', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 300; seed++) {
      const cor = randomSyntheticCor(seed);
      const page = buildSyntheticCorPage(cor);
      const wrong = wrongFields(cor, page);
      const report = checkCorExtraction(parseOrThrow(page));
      if (wrong.length > 0 || report.level !== 'exact') {
        failures.push(
          `seed ${seed}: ${wrong
            .map(f => `${f.field}=${JSON.stringify(f.actual)}`)
            .join(', ')} ${report.issues.map(i => i.code).join(',')}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  test.each([
    ['screenshot scale', {scale: 1.3, jitter: 0.4}],
    ['high-res render', {scale: 5.2, jitter: 0.6}],
    ['slightly rotated photo', {scale: 3.5, degrees: 0.8, jitter: 0.6}],
    ['rotated the other way', {scale: 3.5, degrees: -1.2, jitter: 0.5}],
  ])(
    'OCR-style word boxes (%s) are mapped back onto the template',
    (_label, options) => {
      for (let seed = 1; seed <= 60; seed++) {
        const cor = randomSyntheticCor(seed);
        const page = toOcrPage(buildSyntheticCorPage(cor), {...options, seed});
        const wrong = wrongFields(cor, page);
        expect({seed, wrong}).toEqual({seed, wrong: []});
        expect(checkCorExtraction(parseOrThrow(page)).level).toBe('checked');
      }
    },
  );

  test('fees, pledge and payment lines below the table never become subjects', () => {
    const page = buildSyntheticCorPage({...SAMPLE, printTotals: false});
    const parsed = parseOrThrow(page);
    expect(parsed.courses.map(c => c.code)).toEqual([
      'IT414',
      'IT411',
      'IT412',
      'GnS',
    ]);
    const report = checkCorExtraction(parsed);
    expect(report.level).toBe('needs_attention');
    expect(report.issues.map(i => i.code)).toEqual(['totals_missing']);
  });

  test('a subject titled "Assessment of Learning" does not end the table early', () => {
    const cor: SynthCor = {
      ...SAMPLE,
      courses: [
        {
          code: 'EDUC104',
          title: 'Assessment of Learning 1',
          lec: 3,
          lab: 0,
          credit: 3,
          section: 'BSED3A',
          sessions: [
            {
              dayCode: 'MW',
              start: '8:00 AM',
              end: '9:30 AM',
              room: '23-411',
              faculty: 'Ana Reyes',
            },
          ],
        },
        ...SAMPLE.courses,
      ],
    };
    expect(wrongFields(cor, buildSyntheticCorPage(cor))).toEqual([]);
  });

  test('a page without the COR table header is rejected so callers can fall back', () => {
    const page: CorPageWords = {
      source: 'ocr',
      pageWidth: 1000,
      pageHeight: 1000,
      words: [{t: 'Hello', x0: 0, y0: 0, x1: 50, y1: 10}],
    };
    expect(parseCorLayout(page)).toEqual({
      ok: false,
      reason: 'no_table_header',
    });
    expect(parseCorLayout({...page, words: []})).toEqual({
      ok: false,
      reason: 'no_words',
    });
  });

  test('a table whose columns sit elsewhere is reported as a layout mismatch', () => {
    const page = buildSyntheticCorPage(SAMPLE);
    const moved = {
      ...page,
      words: page.words.map(w =>
        w.t === 'SECTION' ? {...w, x0: w.x0 + 60, x1: w.x1 + 60} : w,
      ),
    };
    expect(parseCorLayout(moved)).toEqual({
      ok: false,
      reason: 'layout_mismatch',
    });
  });
});

describe('COR checks never let a misread through silently', () => {
  const replaceWord = (
    page: CorPageWords,
    from: string,
    to: string,
    nth = 0,
  ) => {
    let seen = -1;
    return {
      ...page,
      words: page.words.map(w =>
        w.t === from && ++seen === nth ? {...w, t: to} : w,
      ),
    };
  };
  const issuesOf = (page: CorPageWords) =>
    checkCorExtraction(parseOrThrow(page)).issues.map(i => i.code);

  test('a misread unit digit breaks the Total Unit(s) checksum', () => {
    const pdf = buildSyntheticCorPage(SAMPLE);
    // IT414's Credit cell (x = 282.3) "3" read as "8".
    const credit = pdf.words.findIndex(w => w.t === '3' && w.x0 === 282.3);
    const misread = toOcrPage({
      ...pdf,
      words: pdf.words.map((w, i) => (i === credit ? {...w, t: '8'} : w)),
    });
    expect(issuesOf(misread)).toEqual(
      expect.arrayContaining(['units_inconsistent', 'totals_mismatch']),
    );
  });

  test('a subject row lost by OCR is caught by the totals', () => {
    const page = toOcrPage(buildSyntheticCorPage(SAMPLE));
    const gnsTop = page.words.find(w => w.t === 'GnS')!.y0;
    const dropped = {
      ...page,
      words: page.words.filter(w => Math.abs(w.y0 - gnsTop) > 8),
    };
    expect(issuesOf(dropped)).toContain('totals_mismatch');
  });

  test('an unreadable day code or time is kept and flagged, never invented', () => {
    const page = replaceWord(
      toOcrPage(buildSyntheticCorPage(SAMPLE)),
      'TF',
      'TE',
    );
    const parsed = parseOrThrow(page);
    const gns = parsed.courses.find(c => c.code === 'GnS')!;
    expect(gns.sessions).toHaveLength(1);
    expect(gns.sessions[0].days).toEqual([]);
    expect(checkCorExtraction(parsed).issues.map(i => i.code)).toContain(
      'days_unclear',
    );

    const garbled = replaceWord(
      toOcrPage(buildSyntheticCorPage(SAMPLE)),
      '10:00',
      '1O:OO?x',
    );
    const it414 = parseOrThrow(garbled).courses.find(c => c.code === 'IT414')!;
    expect(it414.sessions[0]).toMatchObject({
      startTime: '',
      rawText: expect.stringContaining('1O:OO?x'),
    });
    expect(issuesOf(garbled)).toContain('time_unclear');
  });

  test('common OCR digit confusions inside times and units are corrected', () => {
    let page = toOcrPage(buildSyntheticCorPage(SAMPLE));
    page = replaceWord(page, '7:00', '7:O0');
    page = replaceWord(page, '1', 'l');
    const parsed = parseOrThrow(page);
    expect(parsed.courses[0].sessions[0].startTime).toBe('07:00');
    expect(
      scoreCor(parsed, expectedFromSynthetic(SAMPLE)).fields.filter(f => !f.ok),
    ).toEqual([]);
  });

  test('flagged meetings reach the review as needing attention', () => {
    const page = replaceWord(
      toOcrPage(buildSyntheticCorPage(SAMPLE)),
      'TF',
      'TE',
    );
    const draft = buildCorDraft(parseOrThrow(page), {
      ownerId: 'u1',
      document: null,
      sourceText: '',
    });
    const gns = draft.courses.find(c => c.code === 'GnS')!;
    expect(gns.meetings[0].notices).toContain('days_unclear');
  });
});

describe('COR cell readers', () => {
  test.each([
    [
      'F 7:00 AM - 10:00 AM/09-302(CITC Lab 3)',
      'F',
      ['Friday'],
      '07:00',
      '10:00',
      '09-302(CITC Lab 3)',
    ],
    [
      'T 3:00 PM - 5:00 PM/Modular Classroom 1',
      'T',
      ['Tuesday'],
      '15:00',
      '17:00',
      'Modular Classroom 1',
    ],
    ['S 4:00 PM - 7:00 PM', 'S', ['Saturday'], '16:00', '19:00', 'TBA'],
    [
      'TTH 12:00 PM - 1:30 PM/ICT Lab 2',
      'TTH',
      ['Tuesday', 'Thursday'],
      '12:00',
      '13:30',
      'ICT Lab 2',
    ],
    [
      'MWF 7:30 AM - 8:30 AM/Gym',
      'MWF',
      ['Monday', 'Wednesday', 'Friday'],
      '07:30',
      '08:30',
      'Gym',
    ],
  ])('readScheduleCell(%s)', (cell, dayCode, days, start, end, room) => {
    expect(readScheduleCell(cell)).toEqual(
      expect.objectContaining({
        dayCode,
        days,
        startTime: start,
        endTime: end,
        room,
      }),
    );
  });

  test('readScheduleCell rejects text that is not a schedule', () => {
    expect(readScheduleCell('Maria Santos')).toBeNull();
    expect(readScheduleCell('')).toBeNull();
  });

  test('readHeaderLine splits labels and values, including glued ones', () => {
    expect(
      readHeaderLine(
        'Gender: M Nationality:Filipino Major: N/A Curriculum: CITC-BSIT-2018-2019',
      ),
    ).toEqual({
      gender: 'M',
      nationality: 'Filipino',
      major: 'N/A',
      curriculum: 'CITC-BSIT-2018-2019',
    });
    expect(
      readHeaderLine(
        'Age: 22 Contact #: Year Level: 4th Year - BaccalaureateScholarship/Discount:',
      ),
    ).toEqual({
      age: '22',
      contact: '',
      yearLevel: '4th Year - Baccalaureate',
      scholarship: '',
    });
    expect(
      readHeaderLine(
        'Registration No: 123456 Academic Year/Term : 1st Semester AY 2026-2027',
      ),
    ).toEqual({
      registrationNo: '123456',
      academicTerm: '1st Semester AY 2026-2027',
    });
  });
});

describe('Choosing between readings', () => {
  test('the PDF text layer is used whenever the template is recognized', () => {
    const page = buildSyntheticCorPage(SAMPLE);
    const reading = chooseCorReading({
      pdfWords: page,
      ocrText: 'ignored',
      referenceDate: REF,
    })!;
    expect(reading.parsed.checks?.level).toBe('exact');
    expect(reading.text).toContain('IT414');
  });

  test('without a usable layout, the older text reading is used and still checked', () => {
    const text = [
      'CERTIFICATE OF REGISTRATION',
      'Registration No: 123456 Academic Year/Term : 1st Semester AY 2026-2027',
      'Student No: 2023000001 College: COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING',
      'Name: DELA CRUZ, JUAN MIGUEL S Program: B.S. in Information Technology',
      'IT414 IT Elective 3 2 1 3 IT4R11_Track2 F 7:00 AM - 10:00 AM/51-201 Maria Santos',
      'GnS Gender and Society 3 0 3 IT4R11_Track2 TF 1:00 PM - 2:30 PM Ana Reyes',
      'Total Unit(s) 5 1 6',
    ].join('\n');
    const reading = chooseCorReading({
      ocrWords: null,
      ocrText: text,
      referenceDate: REF,
    })!;
    expect(reading.parsed.extraction?.method).toBe('ocr_text');
    expect(reading.parsed.courses.map(c => c.code)).toEqual(['IT414', 'GnS']);
    expect(reading.parsed.checks?.issues.map(i => i.code)).not.toContain(
      'totals_mismatch',
    );
  });

  test('returns null when nothing readable was found', () => {
    expect(chooseCorReading({ocrText: 'hello world'})).toBeNull();
  });

  test('the text parser no longer invents Monday for an unknown day code', () => {
    const parsed = parseUstpCor(
      'CERTIFICATE OF REGISTRATION\nIT414 IT Elective 3 2 1 3 IT4R11_Track2 Q 7:00 AM - 10:00 AM/51-201 Maria Santos',
      REF,
    );
    for (const session of parsed.sessions) {
      expect(session.days).not.toEqual(['Monday']);
    }
  });
});
