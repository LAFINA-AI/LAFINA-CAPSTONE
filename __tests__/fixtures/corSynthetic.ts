/**
 * Synthetic USTP COR pages in the portal template's exact geometry.
 *
 * Positions, font sizes and row pitch were measured from a real portal COR
 * PDF (JasperReports, A4, points). Every value here is invented, so tests
 * can cover thousands of layouts without real student data.
 */
import type {CorPageWords, CorWord} from '../../src/ai/vision/corLayoutParser';
import type {ExpectedCor, ExpectedCorCourse} from './corAccuracy';

export interface SynthSession {
  dayCode: string;
  start: string; // "7:00 AM"
  end: string;
  room: string; // '' when not printed
  faculty: string;
}

export interface SynthCourse {
  code: string;
  title: string;
  lec: number;
  lab: number;
  credit: number;
  section: string;
  /** Faculty printed with no schedule (unscheduled subject). */
  faculty?: string;
  sessions: SynthSession[];
}

export interface SynthCor {
  registrationNo: string;
  studentNo: string;
  fullName: string;
  gender: string;
  age: number;
  college: string;
  program: string;
  major: string;
  yearLevel: string;
  curriculum: string;
  term: string;
  campusLine: string;
  courses: SynthCourse[];
  printTotals?: boolean;
}

/** Arial average advance ≈ 0.5 em; spaces ≈ 0.28 em. */
const text = (
  value: string,
  x: number,
  y0: number,
  size: number,
): CorWord[] => {
  const words: CorWord[] = [];
  let cursor = x;
  for (const part of value.split(' ')) {
    if (part) {
      const width = part.length * size * 0.5;
      words.push({
        t: part,
        x0: cursor,
        y0,
        x1: cursor + width,
        y1: y0 + size,
        s: size,
      });
      cursor += width;
    }
    cursor += size * 0.28;
  }
  return words;
};

/** Spaced capitals like "C E R T I F I C A T E". */
const spaced = (
  value: string,
  x: number,
  y0: number,
  size: number,
): CorWord[] =>
  value
    .split('')
    .flatMap((ch, i) =>
      ch === ' ' ? [] : text(ch, x + i * size * 1.1, y0, size),
    );

/** The portal shrinks long cells to fit their width. */
const fitSize = (value: string, size: number, width: number) =>
  Math.max(5, Math.min(size, width / Math.max(1, value.length * 0.5)));

const unitX = (value: number, left: number) =>
  String(value).length > 1 ? left - 2.2 : left;

export const buildSyntheticCorPage = (cor: SynthCor): CorPageWords => {
  const w: CorWord[] = [];
  w.push(...spaced('CERTIFICATE OF REGISTRATION', 155, 89.88, 13));
  w.push(...text(cor.campusLine, 275.43, 107.73, 10));
  w.push(...text('Registration No:', 20, 129.08, 8));
  w.push(...text(cor.registrationNo, 86, 127.8, 11));
  w.push(...text('Academic Year/Term :', 325.48, 129.08, 8));
  w.push(...text(cor.term, 410, 128.8, 11));
  w.push(...text('STUDENT GENERAL INFORMATION', 220.32, 146.16, 9));
  w.push(...text('Student No:', 32.8, 160.6, 8));
  w.push(...text(cor.studentNo, 80, 160.2, 9));
  w.push(...text('College:', 252.7, 160.6, 8));
  w.push(...text(cor.college, 287, 160.6, fitSize(cor.college, 8, 270)));
  w.push(...text('Name:', 51.5, 174.6, 8));
  w.push(...text(cor.fullName, 80, 174.2, 9));
  w.push(...text('Program:', 249.1, 174.6, 8));
  w.push(...text(cor.program, 287, 174.6, 8));
  w.push(...text('Gender:', 46.1, 188.6, 8));
  w.push(...text(cor.gender, 80, 188.6, 8));
  w.push(...text('Nationality:Filipino', 110.5, 188.6, 8));
  w.push(...text('Major:', 259.8, 188.6, 8));
  w.push(...text(cor.major, 287, 188.6, 8));
  w.push(...text('Curriculum:', 404.1, 188.6, 8));
  w.push(...text(cor.curriculum, 450, 188.6, 8));
  w.push(...text('Age:', 58.6, 202.6, 8));
  w.push(...text(String(cor.age), 80, 202.6, 8));
  w.push(...text('Contact #:', 113.6, 202.6, 8));
  w.push(...text('Year Level:', 241.6, 202.6, 8));
  w.push(...text(cor.yearLevel, 284, 202.8, 7.5));
  w.push(...text('Scholarship/Discount:', 366.7, 202.6, 8));
  w.push(...text('Address:', 43.5, 216.6, 8));
  w.push(...text('PUROK 1, SAMPLE STREET, SAMPLE CITY', 80, 216.8, 7.5));
  w.push(...spaced('UNIT', 243.3, 235.2, 9));
  w.push(...text('CODE', 34, 240.2, 9));
  w.push(...text('SUBJECT TITLE', 117.5, 240.2, 9));
  w.push(...text('SECTION', 312.5, 240.2, 9));
  w.push(...text('SCHEDULE/ROOM', 365, 240.2, 9));
  w.push(...text('FACULTY', 506.5, 240.2, 9));
  w.push(...text('Lec', 236.4, 248, 7), ...text('Lab', 255, 248, 7));
  w.push(...text('Credit', 272, 248, 7));

  let row = 257.6;
  for (const course of cor.courses) {
    w.push(...text(course.code, 34, row, 8));
    w.push(...text(course.title, 80, row, fitSize(course.title, 8, 150)));
    w.push(...text(String(course.lec), unitX(course.lec, 238.3), row, 8));
    w.push(...text(String(course.lab), unitX(course.lab, 258.3), row, 8));
    w.push(...text(String(course.credit), unitX(course.credit, 282.3), row, 8));
    w.push(
      ...text(course.section, 300, row - 0.4, fitSize(course.section, 8, 62)),
    );
    course.sessions.forEach((s, i) => {
      const y = row + i * 10.4;
      const cell = `${s.dayCode} ${s.start} - ${s.end}${
        s.room ? `/${s.room}` : ''
      }`;
      w.push(...text(cell, 366, y + 0.4, fitSize(cell, 7, 110)));
      w.push(...text(s.faculty, 481, y + 0.4, fitSize(s.faculty, 7, 100)));
    });
    if (course.sessions.length === 0 && course.faculty) {
      w.push(
        ...text(
          course.faculty,
          481,
          row + 0.4,
          fitSize(course.faculty, 7, 100),
        ),
      );
    }
    row += Math.max(1, course.sessions.length) * 10;
  }

  const totalsY = row + 3.6;
  if (cor.printTotals !== false) {
    const sum = (k: 'lec' | 'lab' | 'credit') =>
      cor.courses.reduce((acc, c) => acc + c[k], 0);
    w.push(...text('Total Unit(s)', 169, totalsY, 8));
    w.push(...text(String(sum('lec')), unitX(sum('lec'), 238.3), totalsY, 8));
    w.push(...text(String(sum('lab')), unitX(sum('lab'), 258.3), totalsY, 8));
    w.push(
      ...text(String(sum('credit')), unitX(sum('credit'), 282.3), totalsY, 8),
    );
  }
  w.push(...text("STUDENT' PLEDGE", 409.7, totalsY + 10, 8));
  w.push(...spaced('ASSESSSED FEES', 87.1, totalsY + 14, 9));
  const fees = [
    'Group Insurance Fee',
    'Guidance Fee',
    'Tuition Fee',
    'Library Fee',
  ];
  fees.forEach((fee, i) => {
    w.push(...text(fee, 39, totalsY + 29 + i * 10, 7));
    w.push(...text(`${(i + 1) * 50}.00`, 273.5, totalsY + 29 + i * 10, 7));
  });
  w.push(...text('SCHEDULE OF PAYMENTS', 60, totalsY + 200, 9));

  return {
    source: 'pdf',
    pageWidth: 595,
    pageHeight: 842,
    pageCount: 1,
    producer: 'iText 2.1.7 by 1T3XT',
    creator: 'JasperReports Library version 6.18.1',
    words: w,
  };
};

const to24 = (t: string): string => {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(t)!;
  let h = Number(m[1]) % 12;
  if (m[3] === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};

export const expectedFromSynthetic = (cor: SynthCor): ExpectedCor => ({
  profile: {
    registrationNo: cor.registrationNo,
    studentNo: cor.studentNo,
    fullName: cor.fullName,
    gender: cor.gender,
    age: cor.age,
    college: cor.college,
    program: cor.program,
    major: cor.major,
    yearLevel: cor.yearLevel,
    curriculum: cor.curriculum,
    academicTerm: cor.term,
  },
  courses: cor.courses.map(
    (c): ExpectedCorCourse => ({
      code: c.code,
      title: c.title,
      lec: c.lec,
      lab: c.lab,
      credit: c.credit,
      section: c.section,
      ...(c.sessions.length === 0 && c.faculty ? {faculty: c.faculty} : {}),
      sessions: c.sessions.map(s => ({
        dayCode: s.dayCode,
        start: to24(s.start),
        end: to24(s.end),
        room: s.room || 'TBA',
        faculty: s.faculty,
      })),
    }),
  ),
});

/** Deterministic PRNG (mulberry32) so failures are reproducible by seed. */
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const SUBJECTS: Array<[string, string, number, number]> = [
  ['IT414', 'IT Elective 3', 2, 1],
  ['IT415', 'IT Elective 4', 2, 1],
  ['IT411', 'CAPSTONE Project and Research 2', 2, 1],
  ['IT412', 'System Administration and Maintenance', 2, 1],
  ['IT413', 'Social and Professional Issues', 3, 0],
  ['GnS', 'Gender and Society', 3, 0],
  ['NSTP2', 'National Service Training Program 2', 3, 0],
  ['PATHFit3', 'Physical Activities Towards Health and Fitness 3', 2, 0],
  ['EDUC104', 'Assessment of Learning 1', 3, 0],
  ['MATH101', 'Mathematics in the Modern World', 3, 0],
  ['CS221', 'Data Structures and Algorithms', 2, 1],
  ['CpE311', 'Microprocessors and Microcontrollers Systems Design', 2, 1],
  ['ENGL1', 'Purposive Communication', 3, 0],
  ['Rizal', 'Life and Works of Rizal', 3, 0],
  ['STS', 'Science, Technology and Society', 3, 0],
  ['ARCH 201', 'Architectural Design 3', 1, 2],
  ['CHEM1-L', 'General Chemistry 1 (Lab)', 0, 1],
];
const DAY_CODES = [
  'M',
  'T',
  'W',
  'TH',
  'F',
  'S',
  'SU',
  'MW',
  'TF',
  'TTH',
  'MWF',
  'WF',
  'MTH',
  'TTHS',
];
const ROOMS = [
  '',
  '09-302(CITC Lab 3)',
  '51-201',
  'Modular Classroom 1',
  '09-105',
  '23-411(Old Bldg)',
  'ICT Lab 2',
  'Gym',
];
const FACULTY = [
  'Maria Clara Santos',
  'JUAN DELA CRUZ JR.',
  'Ana  Reyes',
  'Jose Protasio Rizal Mercado y Alonso',
  'TBA Instructor',
  'Pedro Penduko III',
];
const SURNAMES = [
  'DELA CRUZ',
  'SANTOS',
  'REYES',
  'GARCIA',
  'BAUTISTA',
  'OCAMPO',
];
const GIVEN = [
  'JUAN MIGUEL S',
  'MARIA ANA',
  'PEDRO L',
  'ANNA MAE C',
  'JOSE RIZAL P',
];
const PROGRAMS = [
  [
    'COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING',
    'B.S. in Information Technology',
    'CITC-BSIT-2018-2019',
  ],
  [
    'COLLEGE OF ENGINEERING AND ARCHITECTURE',
    'B.S. in Civil Engineering',
    'CEA-BSCE-2018-2019',
  ],
  [
    'COLLEGE OF SCIENCE AND TECHNOLOGY EDUCATION',
    'Bachelor of Secondary Education',
    'CSTE-BSED-2018-2019',
  ],
];

const pick = <T>(r: () => number, list: T[]): T =>
  list[Math.floor(r() * list.length)];

const clock = (minutes: number) => {
  const h24 = Math.floor(minutes / 60);
  const h = h24 % 12 || 12;
  return `${h}:${String(minutes % 60).padStart(2, '0')} ${
    h24 >= 12 ? 'PM' : 'AM'
  }`;
};

export const randomSyntheticCor = (seed: number): SynthCor => {
  const r = rng(seed);
  const count = 2 + Math.floor(r() * 8);
  const pool = [...SUBJECTS];
  const courses: SynthCourse[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const [code, title, lec, lab] = pool.splice(
      Math.floor(r() * pool.length),
      1,
    )[0];
    const sessionCount =
      Math.floor(r() * 4) === 0 ? 0 : 1 + Math.floor(r() * 2);
    const sessions: SynthSession[] = [];
    for (let j = 0; j < sessionCount; j++) {
      const start = 7 * 60 + Math.floor(r() * 26) * 30;
      const end = start + 60 + Math.floor(r() * 5) * 30;
      sessions.push({
        dayCode: pick(r, DAY_CODES),
        start: clock(start),
        end: clock(Math.min(end, 21 * 60 + 30)),
        room: pick(r, ROOMS),
        faculty: pick(r, FACULTY).replace(/\s+/g, ' '),
      });
    }
    courses.push({
      code,
      title,
      lec,
      lab,
      credit: lec + lab,
      section: pick(r, [
        'IT4R11_Track2',
        'IT2R13',
        'CE3A',
        'BSED-MATH2B',
        `${code.replace(/\s/g, '')}_Lab`,
      ]),
      faculty:
        sessionCount === 0 ? pick(r, FACULTY).replace(/\s+/g, ' ') : undefined,
      sessions,
    });
  }
  const [college, program, curriculum] = pick(r, PROGRAMS);
  const year = 1 + Math.floor(r() * 4);
  return {
    registrationNo: String(100000 + Math.floor(r() * 899999)),
    studentNo: `20${20 + Math.floor(r() * 7)}${String(
      Math.floor(r() * 1e6),
    ).padStart(6, '0')}`,
    fullName: `${pick(r, SURNAMES)}, ${pick(r, GIVEN)}`,
    gender: r() < 0.5 ? 'M' : 'F',
    age: 17 + Math.floor(r() * 8),
    college,
    program,
    major: 'N/A',
    yearLevel: `${['1st', '2nd', '3rd', '4th'][year - 1]} Year - Baccalaureate`,
    curriculum,
    term: `${r() < 0.5 ? '1st' : '2nd'} Semester AY 2026-2027`,
    campusLine: 'USTP CDO CAMPUS',
    courses,
  };
};

/**
 * Turns a PDF-geometry page into OCR-like input: pixel scale, offset, a small
 * rotation and per-word box jitter (as ML Kit reports for a screenshot/photo).
 */
export const toOcrPage = (
  page: CorPageWords,
  options: {
    scale?: number;
    degrees?: number;
    jitter?: number;
    seed?: number;
  } = {},
): CorPageWords => {
  const r = rng(options.seed ?? 1);
  const scale = options.scale ?? 4;
  const angle = ((options.degrees ?? 0) * Math.PI) / 180;
  const jitter = options.jitter ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const j = () => (r() * 2 - 1) * jitter;
  return {
    source: 'ocr',
    pageWidth: page.pageWidth * scale,
    pageHeight: page.pageHeight * scale,
    words: page.words.map(word => {
      const cx = (word.x0 + word.x1) / 2;
      const cy = (word.y0 + word.y1) / 2;
      const rx = cx * cos - cy * sin;
      const ry = cx * sin + cy * cos;
      const hw = ((word.x1 - word.x0) / 2) * scale;
      const hh = ((word.y1 - word.y0) / 2) * scale * 0.8;
      const px = 40 + rx * scale + j() * scale;
      const py = 60 + ry * scale + j() * scale;
      return {t: word.t, x0: px - hw, x1: px + hw, y0: py - hh, y1: py + hh};
    }),
  };
};
