/**
 * Layout-based USTP COR reader.
 *
 * The USTP portal prints every COR from the same report template, so each
 * value sits in a fixed column. Instead of guessing from a flattened line of
 * text, this reader works on positioned words (from the PDF's own text layer,
 * or from OCR word boxes), maps them onto the template using the table header
 * (CODE … FACULTY) as anchors, and reads each cell by its column. Nothing is
 * guessed: an unreadable cell is kept as-is so the review flags it.
 *
 * Template coordinates are PDF points measured from the portal COR (A4).
 */
import {parseDayCodeStrict, WEEKDAY_NAMES} from './corReviewModel';
import {
  OCR_SCHEDULE_PATTERN,
  cleanOcrCurriculum,
  cleanOcrMajor,
  cleanOcrRoom,
  cleanOcrYearLevel,
  editDistance,
  fixLeadingL,
  normalizeOcrTime,
  snapVocabulary,
} from './corOcrCleanup';
import {
  assembleUstpCorResult,
  deriveCollegeShort,
  extractUstpCampus,
  normalizeTime24,
  type CorPrintedTotals,
  type ParsedUstpCorResult,
  type UstpCorClassSession,
  type UstpCorHeaderFields,
  type UstpEnrolledCourse,
} from './ustpCorParser';

export interface CorWord {
  /** Word text (no spaces). */
  t: string;
  x0: number;
  /** Top edge (y grows downward). */
  y0: number;
  x1: number;
  y1: number;
  /** Font size in points, when known (PDF only). */
  s?: number;
}

export interface CorPageWords {
  source: 'pdf' | 'ocr';
  pageWidth: number;
  pageHeight: number;
  pageCount?: number;
  producer?: string;
  creator?: string;
  words: CorWord[];
}

export type CorLayoutOutcome =
  | {ok: true; result: ParsedUstpCorResult}
  | {ok: false; reason: CorLayoutFailure};

export type CorLayoutFailure =
  | 'no_words'
  | 'no_table_header'
  | 'layout_mismatch'
  | 'no_subjects';

// --- Template geometry (portal COR, PDF points) ------------------------------

const T_CODE_X = 34;
const T_FACULTY_X = 506.5;
const T_SECTION_HDR_X = 312.5;
const T_SCHEDULE_HDR_X = 365;
const T_HEADER_CY = 244.7;
/** Tolerance for header-to-template agreement after mapping. */
const T_HEADER_TOLERANCE = 14;

type Column =
  | 'code'
  | 'title'
  | 'lec'
  | 'lab'
  | 'credit'
  | 'section'
  | 'schedule'
  | 'faculty';

/**
 * Column boundaries, as [column, start x), compared against a word's center.
 * Data cells start at: code 34, title 80, Lec ~238, Lab ~258, Credit ~282,
 * section 300, schedule 366, faculty 481. Long cells shrink to fit, so a
 * cell's words never cross into the next column.
 */
const COLUMN_STARTS: ReadonlyArray<[Column, number]> = [
  ['code', 20],
  ['title', 76],
  ['lec', 233],
  ['lab', 251],
  ['credit', 270],
  ['section', 296],
  ['schedule', 360],
  ['faculty', 479],
];

const columnOf = (word: {x0: number; x1: number}): Column | null => {
  const center = (word.x0 + word.x1) / 2;
  let found: Column | null = null;
  for (const [column, start] of COLUMN_STARTS) {
    if (center >= start) found = column;
  }
  return found;
};

// --- Geometry helpers --------------------------------------------------------

interface PlacedWord {
  t: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  cy: number;
  h: number;
}

interface Line {
  words: PlacedWord[];
  cy: number;
  text: string;
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Groups words into visual lines by vertical center. */
const groupLines = (
  words: PlacedWord[],
  tolerance: number,
  joiner = ' ',
): Line[] => {
  const sorted = [...words].sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
  const groups: PlacedWord[][] = [];
  for (const word of sorted) {
    const current = groups[groups.length - 1];
    if (current) {
      const meanCy = current.reduce((sum, w) => sum + w.cy, 0) / current.length;
      if (Math.abs(word.cy - meanCy) <= tolerance) {
        current.push(word);
        continue;
      }
    }
    groups.push([word]);
  }
  return groups.map(group => {
    const ordered = [...group].sort((a, b) => a.x0 - b.x0);
    return {
      words: ordered,
      cy: ordered.reduce((sum, w) => sum + w.cy, 0) / ordered.length,
      text: ordered
        .map(w => w.t)
        .join(joiner)
        .replace(/\s+/g, ' ')
        .trim(),
    };
  });
};

const anchorKey = (text: string): string =>
  text
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/[^A-Z/]/g, '');

interface Anchors {
  code: CorWord;
  faculty: CorWord;
  section?: CorWord;
  schedule?: CorWord;
}

const centerY = (w: CorWord) => (w.y0 + w.y1) / 2;

const findAnchors = (words: CorWord[]): Anchors | null => {
  let best: Anchors | null = null;
  let bestDy = Infinity;
  for (const code of words) {
    if (anchorKey(code.t) !== 'CODE') continue;
    const h = Math.max(1, code.y1 - code.y0);
    for (const faculty of words) {
      if (anchorKey(faculty.t) !== 'FACULTY' || faculty.x0 <= code.x1) continue;
      const dy = Math.abs(centerY(faculty) - centerY(code));
      if (dy > h * 2.5 || dy >= bestDy) continue;
      const between = (w: CorWord) =>
        w.x0 > code.x1 &&
        w.x1 < faculty.x0 &&
        Math.abs(centerY(w) - centerY(code)) <= h * 2.5;
      best = {
        code,
        faculty,
        section: words.find(w => anchorKey(w.t) === 'SECTION' && between(w)),
        schedule: words.find(
          w => anchorKey(w.t).startsWith('SCHEDULE') && between(w),
        ),
      };
      bestDy = dy;
    }
  }
  return best;
};

/**
 * Maps page coordinates onto template coordinates with one rotation and one
 * uniform scale, both measured from the CODE and FACULTY header words.
 */
const buildPlacement = (anchors: Anchors) => {
  const ox = anchors.code.x0;
  const oy = centerY(anchors.code);
  const dx = anchors.faculty.x0 - ox;
  const dy = centerY(anchors.faculty) - oy;
  const angle = Math.atan2(dy, dx);
  const scale = Math.hypot(dx, dy) / (T_FACULTY_X - T_CODE_X);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return (w: CorWord): PlacedWord => {
    const cx = (w.x0 + w.x1) / 2 - ox;
    const cyRaw = centerY(w) - oy;
    const rx = (cx * cos - cyRaw * sin) / scale;
    const ry = (cx * sin + cyRaw * cos) / scale;
    const halfW = (w.x1 - w.x0) / 2 / scale;
    const halfH = (w.y1 - w.y0) / 2 / scale;
    const tcx = T_CODE_X + rx;
    const tcy = T_HEADER_CY + ry;
    return {
      t: w.t,
      x0: tcx - halfW,
      x1: tcx + halfW,
      y0: tcy - halfH,
      y1: tcy + halfH,
      cy: tcy,
      h: halfH * 2,
    };
  };
};

// --- Cell readers ------------------------------------------------------------

/** OCR digit confusions, applied only inside number-shaped tokens. */
const fixDigits = (token: string): string =>
  token.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');

const readUnit = (
  text: string,
  source: CorPageWords['source'],
): number | null => {
  const clean = (source === 'ocr' ? fixDigits(text) : text).trim();
  if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(clean)) return null;
  return parseFloat(clean);
};

const CODE_PATTERN =
  /^\*?\s*[A-Za-z]{2,10}(?:\s?-?\d{1,4}[A-Za-z]?)?(?:-[A-Za-z0-9]{1,4})?$/;

export const isPlausibleCourseCode = (code: string): boolean =>
  CODE_PATTERN.test(code.trim());

const SCHEDULE_PATTERN =
  /^([A-Za-z]{1,9})\s*(\d{1,2}[:.]\d{2})\s*([AP]\.?M\.?)?\s*[-–—]\s*(\d{1,2}[:.]\d{2})\s*([AP]\.?M\.?)?\s*(?:\/\s*(.*))?$/i;

export interface ReadScheduleCell {
  dayCode: string;
  days: string[];
  startTime: string;
  endTime: string;
  startTime12: string;
  endTime12: string;
  room: string;
}

/** Reads one SCHEDULE/ROOM cell, e.g. "F 7:00 AM - 10:00 AM/09-302(CITC Lab 3)". */
export const readScheduleCell = (
  raw: string,
  source: CorPageWords['source'] = 'pdf',
): ReadScheduleCell | null => {
  const text = raw.replace(/\s+/g, ' ').trim();
  let match: RegExpExecArray | null;
  if (source === 'ocr') {
    const ocr = OCR_SCHEDULE_PATTERN.exec(text);
    const startTime = ocr ? normalizeOcrTime(ocr[2]) : null;
    const endTime = ocr ? normalizeOcrTime(ocr[4]) : null;
    // A period left in the room means the times were not read cleanly.
    if (!ocr || !startTime || !endTime || /\b[AP]\.?M\b/i.test(ocr[6])) {
      return null;
    }
    match = [...ocr] as unknown as RegExpExecArray;
    match[2] = startTime;
    match[4] = endTime;
    match[6] = ocr[6] ? cleanOcrRoom(ocr[6]) : '';
  } else {
    match = SCHEDULE_PATTERN.exec(text);
  }
  if (!match) return null;
  const dayCode = match[1].toUpperCase();
  const period = (p?: string) =>
    p ? p.replace(/[.\s]/g, '').toUpperCase() : '';
  let startPeriod = period(match[3]);
  const endPeriod = period(match[5]);
  if (!startPeriod && endPeriod) {
    // Same rule as the text parser; the review still asks when it is unprinted.
    const startHour = parseInt(match[2], 10);
    const endHour = parseInt(match[4], 10);
    startPeriod =
      endPeriod === 'PM' && startHour >= 7 && startHour <= 11 && endHour < 12
        ? 'AM'
        : endPeriod;
  }
  const start = normalizeTime24(`${match[2].replace('.', ':')} ${startPeriod}`);
  const end = normalizeTime24(`${match[4].replace('.', ':')} ${endPeriod}`);
  if (!start || !end) return null;
  const days = parseDayCodeStrict(dayCode).map(day => WEEKDAY_NAMES[day]);
  const room = (match[6] ?? '').trim();
  return {
    dayCode,
    days,
    startTime: start.time24,
    endTime: end.time24,
    startTime12: start.time12,
    endTime12: end.time12,
    room: room || 'TBA',
  };
};

// --- Header (Student General Information) -----------------------------------

type HeaderKey =
  | 'registrationNo'
  | 'academicTerm'
  | 'studentNo'
  | 'college'
  | 'fullName'
  | 'program'
  | 'gender'
  | 'nationality'
  | 'major'
  | 'curriculum'
  | 'age'
  | 'contact'
  | 'yearLevel'
  | 'scholarship'
  | 'address';

const HEADER_LABELS: ReadonlyArray<[HeaderKey, string]> = [
  ['registrationNo', 'Registration\\s*No\\.?\\s*:'],
  // "Term" tolerates OCR misreads ("Year/Ten :").
  ['academicTerm', 'Academic\\s*Year\\s*/\\s*T[a-z]{1,4}\\s*:'],
  ['studentNo', 'Student\\s*No\\.?\\s*:'],
  ['college', 'College\\s*:'],
  ['fullName', 'Name\\s*:'],
  ['program', 'Program\\s*:'],
  ['gender', 'Gender\\s*:'],
  // OCR may read this colon as "." ("Nationality.Filipino").
  ['nationality', 'Nationality\\s*[:.;]'],
  ['major', 'Major\\s*:'],
  ['curriculum', 'Curriculum\\s*:'],
  ['age', 'Age\\s*:'],
  ['contact', 'Contact\\s*#?\\s*:'],
  ['yearLevel', 'Year\\s*Level\\s*:'],
  ['scholarship', 'Scholarship\\s*/\\s*Discount\\s*:'],
  ['address', 'Address\\s*:'],
];

const HEADER_LABEL_RE = new RegExp(
  HEADER_LABELS.map(([, pattern]) => `(${pattern})`).join('|'),
  'gi',
);

/** Splits a header line into label → value pairs ("Gender: M Nationality:Filipino …"). */
export const readHeaderLine = (
  line: string,
): Partial<Record<HeaderKey, string>> => {
  const found: Array<{key: HeaderKey; start: number; end: number}> = [];
  HEADER_LABEL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HEADER_LABEL_RE.exec(line)) !== null) {
    const before = match.index > 0 ? line[match.index - 1] : ' ';
    const groupIndex = match.slice(1).findIndex(Boolean);
    if (groupIndex < 0) continue;
    // A label must start a word ("Name:" but not "Surname:").
    if (
      /[A-Za-z]/.test(before) &&
      HEADER_LABELS[groupIndex][0] !== 'scholarship'
    ) {
      continue;
    }
    found.push({
      key: HEADER_LABELS[groupIndex][0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  const values: Partial<Record<HeaderKey, string>> = {};
  found.forEach((label, index) => {
    const next = found[index + 1];
    const value = line
      .slice(label.end, next ? next.start : line.length)
      .replace(/\s+/g, ' ')
      .trim();
    if (values[label.key] === undefined) values[label.key] = value;
  });
  return values;
};

const readHeader = (
  lines: Line[],
  source: CorPageWords['source'],
): UstpCorHeaderFields => {
  const raw: Partial<Record<HeaderKey, string>> = {};
  for (const line of lines) {
    const values = readHeaderLine(line.text);
    for (const [key, value] of Object.entries(values) as Array<
      [HeaderKey, string]
    >) {
      if (raw[key] === undefined || (!raw[key] && value)) raw[key] = value;
    }
  }
  const numeric = (value: string | undefined) => {
    const text = (value ?? '').replace(/\s+/g, '');
    return source === 'ocr' ? fixDigits(text) : text;
  };
  const genderRaw = (raw.gender ?? '').split(/\s+/)[0]?.toUpperCase() ?? '';
  const gender =
    genderRaw === 'MALE' ? 'M' : genderRaw === 'FEMALE' ? 'F' : genderRaw;
  const ageText = numeric(raw.age);
  const age = /^\d{1,2}$/.test(ageText) ? parseInt(ageText, 10) : null;
  const termText = (raw.academicTerm ?? '').replace(/\s+/g, ' ').trim();
  const ocr = source === 'ocr';
  const text = (value: string | undefined) =>
    ocr ? snapVocabulary(fixLeadingL(value ?? '')) : value ?? '';
  const college = text(raw.college);
  const yearLevel = (raw.yearLevel ?? '').trim();
  const major = raw.major || 'N/A';
  const curriculum = (raw.curriculum ?? '').replace(/\s+/g, '');
  return {
    campus: extractUstpCampus(
      lines.map(l => l.text),
      true,
    ),
    registrationNo: numeric(raw.registrationNo),
    studentNo: numeric(raw.studentNo),
    fullName: (raw.fullName ?? '').replace(/\s+/g, ' ').trim(),
    gender,
    age,
    nationality:
      ocr &&
      raw.nationality &&
      editDistance(raw.nationality.toLowerCase(), 'filipino') <= 2
        ? 'Filipino'
        : text(raw.nationality) || 'Filipino',
    college,
    program: text(raw.program),
    major: ocr ? cleanOcrMajor(major) : major,
    yearLevel: ocr ? cleanOcrYearLevel(yearLevel) : yearLevel,
    curriculum: ocr
      ? cleanOcrCurriculum(
          curriculum,
          college ? deriveCollegeShort(college) : '',
        )
      : curriculum,
    academicTerm: termText.replace(/\s*-\s*(?=\d{4}$)/, '-'),
  };
};

// --- Main entry --------------------------------------------------------------

/**
 * Lines that end the subject table (a title like "Assessment of Learning"
 * must not). "Unit" tolerates one misread letter (OCR "Unlt").
 */
const TOTALS_KEY = /TOTALUN[A-Z]T/;
const STOP_KEY = /TOTALUN[A-Z]T|ASSESS?SEDFEE|STUDENTPLEDGE|SCHEDULEOFPAYMENT/;

/**
 * Reads a COR page from positioned words. Fails (so callers can fall back)
 * when the table header is missing or does not match the portal template.
 */
export const parseCorLayout = (
  page: CorPageWords,
  referenceDate: Date = new Date(),
): CorLayoutOutcome => {
  const words = page.words.filter(w => w.t && w.t.trim());
  if (words.length === 0) return {ok: false, reason: 'no_words'};
  const anchors = findAnchors(words);
  if (!anchors) return {ok: false, reason: 'no_table_header'};
  const place = buildPlacement(anchors);
  const placed = words.map(place);

  // The SECTION and SCHEDULE/ROOM headers must land where the template has them.
  for (const [anchor, expected] of [
    [anchors.section, T_SECTION_HDR_X],
    [anchors.schedule, T_SCHEDULE_HDR_X],
  ] as const) {
    if (anchor && Math.abs(place(anchor).x0 - expected) > T_HEADER_TOLERANCE) {
      return {ok: false, reason: 'layout_mismatch'};
    }
  }

  const lineTol = Math.max(2.5, median(placed.map(w => w.h)) * 0.45);
  const allLines = groupLines(placed, lineTol);
  const headerTop = T_HEADER_CY - lineTol;
  const headerLines = allLines.filter(l => l.cy < headerTop);
  const docKey = headerLines
    .map(l => l.text)
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  const isUstpCor =
    docKey.includes('CERTIFICATEOFREGISTRATION') ||
    docKey.includes('UNIVERSITYOFSCIENCEANDTECHNOLOGY') ||
    docKey.includes('USTP');

  // Table body: below the header row, above Total Unit(s) / fees / pledge.
  const below = allLines.filter(l => l.cy > T_HEADER_CY + lineTol);
  let tableBottom = Infinity;
  let totalsLine: Line | null = null;
  for (const line of below) {
    const key = line.text.toUpperCase().replace(/[^A-Z]/g, '');
    if (STOP_KEY.test(key)) {
      tableBottom = line.cy - lineTol;
      if (TOTALS_KEY.test(key)) totalsLine = line;
      break;
    }
  }

  let printedTotals: CorPrintedTotals | null = null;
  if (totalsLine) {
    const unitAt = (column: Column) => {
      const word = totalsLine!.words.find(w => columnOf(w) === column);
      return word ? readUnit(word.t, page.source) : null;
    };
    printedTotals = {
      lec: unitAt('lec'),
      lab: unitAt('lab'),
      credit: unitAt('credit'),
    };
  }

  const tableWords = placed.filter(
    w => w.cy > T_HEADER_CY + lineTol && w.cy < tableBottom,
  );
  const codeLines = groupLines(
    tableWords.filter(w => columnOf(w) === 'code'),
    lineTol,
  );
  // The "Lec Lab Credit" sub-header sits under the header row with no code.
  if (codeLines.length === 0) {
    return {ok: false, reason: 'no_subjects'};
  }

  const courses: UstpEnrolledCourse[] = [];
  let sessionCounter = 0;
  codeLines.forEach((codeLine, index) => {
    const top = codeLine.cy - lineTol * 1.4;
    const next = codeLines[index + 1];
    const bottom = next ? next.cy - lineTol * 1.4 : tableBottom;
    const band = tableWords.filter(w => w.cy >= top && w.cy < bottom);
    const inColumn = (column: Column) =>
      band.filter(w => columnOf(w) === column);
    const firstLineOf = (column: Column) =>
      inColumn(column).filter(w => Math.abs(w.cy - codeLine.cy) <= lineTol);

    const code = codeLine.text.replace(/\s+/g, ' ').trim();
    const titleText = groupLines(inColumn('title'), lineTol)
      .map(l => l.text)
      .join(' ')
      .trim();
    const title = page.source === 'ocr' ? fixLeadingL(titleText) : titleText;
    const unit = (column: Column) => {
      const text = firstLineOf(column)
        .map(w => w.t)
        .join('');
      return text ? readUnit(text, page.source) : null;
    };
    const lec = unit('lec');
    const lab = unit('lab');
    const credit = unit('credit');
    const sectionWords = firstLineOf('section').sort((a, b) => a.x0 - b.x0);
    const section = sectionWords
      .map(w => w.t)
      .join(page.source === 'ocr' ? '_' : ' ')
      .trim();

    const scheduleLines = groupLines(inColumn('schedule'), lineTol);
    const facultyLines = groupLines(inColumn('faculty'), lineTol);
    const usedFaculty = new Set<number>();
    const facultyFor = (cy: number): string => {
      let bestIndex = -1;
      let bestDy = lineTol * 1.6;
      facultyLines.forEach((line, i) => {
        const dy = Math.abs(line.cy - cy);
        if (!usedFaculty.has(i) && dy <= bestDy) {
          bestIndex = i;
          bestDy = dy;
        }
      });
      if (bestIndex < 0) return '';
      usedFaculty.add(bestIndex);
      return facultyLines[bestIndex].text;
    };

    const rowText = [code, title, lec ?? '', lab ?? '', credit ?? '', section]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const sessions: UstpCorClassSession[] = scheduleLines.map(line => {
      sessionCounter += 1;
      const cell = readScheduleCell(line.text, page.source);
      const faculty = facultyFor(line.cy);
      return {
        id: `ustp-cor-${sessionCounter}-${code}`,
        code,
        subjectTitle: title,
        section,
        faculty: faculty || 'TBA',
        // An unreadable cell stays empty so the review asks for it.
        dayCode: cell?.dayCode ?? '',
        days: cell?.days ?? [],
        startTime: cell?.startTime ?? '',
        endTime: cell?.endTime ?? '',
        startTime12: cell?.startTime12 ?? '',
        endTime12: cell?.endTime12 ?? '',
        room: cell?.room ?? 'TBA',
        recurrenceRule: '',
        rawText: line.text,
      };
    });
    const extraFaculty = facultyLines
      .filter((_, i) => !usedFaculty.has(i))
      .map(l => l.text);
    const facultyNames: string[] = [];
    for (const name of [
      ...sessions.map(s => s.faculty).filter(n => n && n !== 'TBA'),
      ...extraFaculty,
    ]) {
      if (!facultyNames.includes(name)) facultyNames.push(name);
    }

    courses.push({
      code,
      title,
      subjectTitle: title,
      lecUnits: lec ?? 0,
      labUnits: lab ?? 0,
      creditUnits: credit ?? 0,
      section,
      faculty: facultyNames.join(' / ') || 'TBA',
      sessions,
      scheduleSummary: '',
      rawText: rowText,
      unitsInferred: false,
      unitsUnread: lec === null || lab === null || credit === null,
    });
  });

  const header = readHeader(headerLines, page.source);
  const result = assembleUstpCorResult({
    isUstpCor,
    header,
    courses,
    referenceDate,
    extraction: {
      method: page.source === 'pdf' ? 'pdf_text' : 'ocr_layout',
      printedTotals,
      portalPdf:
        page.source === 'pdf' &&
        (/JasperReports/i.test(page.creator ?? '') ||
          /iText/i.test(page.producer ?? '')),
    },
  });
  return {ok: true, result};
};

/** Rebuilds readable text lines from positioned words (for the review's side-by-side view). */
export const corWordsToText = (page: CorPageWords): string => {
  const heights = page.words.map(w => Math.max(0.5, w.y1 - w.y0));
  const tol = Math.max(1, median(heights) * 0.45);
  const placed: PlacedWord[] = page.words.map(w => ({
    t: w.t,
    x0: w.x0,
    x1: w.x1,
    y0: w.y0,
    y1: w.y1,
    cy: (w.y0 + w.y1) / 2,
    h: w.y1 - w.y0,
  }));
  return groupLines(placed, tol)
    .map(l => l.text)
    .join('\n');
};
