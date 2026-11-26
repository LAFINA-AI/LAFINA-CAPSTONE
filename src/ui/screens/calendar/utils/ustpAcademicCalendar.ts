/**
 * Built-in USTP Academic Calendar layer (AY 2026–2027), grounded in the
 * CHED-noted USTP Academic Calendar bundled in `ustpCdoKnowledgePack.json`.
 *
 * Mirrors `philippineHolidays.ts`: read-only calendar layer toggled via
 * `calendarVisibilityStore`, never written into SQLite `events` or `time_blocks`.
 * National holidays already rendered by `philippineHolidays.ts` and purely
 * internal faculty/admin rows are omitted to avoid clutter and duplicates.
 */

/** Shared visibility-map layer ID for the USTP Academic Calendar group. */
export const USTP_CALENDAR_ID = 'ustp-academic-calendar';
/** Separate per-account opt-in toggle for Graduate School events (default OFF). */
export const USTP_GRADUATE_CALENDAR_ID = 'ustp-academic-calendar-grad';
export const USTP_CALENDAR_NAME = 'USTP Academic Calendar';
export const USTP_ACCENT_COLOR = '#1D4ED8';
export const USTP_ACADEMIC_YEAR = 'AY 2026–2027';
export const USTP_CALENDAR_SOURCE_LABEL =
  'CHED-noted USTP Academic Calendar AY 2026–2027';

export type UstpTerm = 'first' | 'second' | 'midyear';
export type UstpAudience = 'ug' | 'all' | 'gr';
export type UstpEventCategory =
  | 'term'
  | 'enrollment'
  | 'exam'
  | 'campus'
  | 'deadline'
  | 'admissions';

export interface UstpAcademicEvent {
  id: string;
  title: string;
  /** Inclusive local start date (YYYY-MM-DD). */
  startDate: string;
  /** Inclusive local end date (YYYY-MM-DD). Equal to startDate for single-day events. */
  endDate: string;
  term: UstpTerm;
  audience: UstpAudience;
  category: UstpEventCategory;
  pdfPage: number;
  /**
   * Short events (1–14 days) span every day on the calendar grid.
   * Long windows (> 14 days, e.g., Graduation Application) render Start and
   * Deadline markers on the grid while showing their full range in the browser modal.
   */
  displayMode: 'span' | 'endpoints';
  /** True when the official PDF has a known caveat or requires Registrar/ASO confirmation. */
  needsConfirmation?: boolean;
  caveatNote?: string;
  description?: string;
}

export interface UstpCalendarOccurrence {
  event: UstpAcademicEvent;
  /** Local YYYY-MM-DD date on which this occurrence appears. */
  date: string;
  /** Title displayed on the day cell/card (appends Opens/Deadline for endpoint markers). */
  displayTitle: string;
  /** Concise date/span label displayed in the timeline meta row. */
  dayLabel: string;
  /** Marker role for multi-month window endpoints. */
  endpointRole?: 'start' | 'end';
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const USTP_TERM_LABELS: Record<UstpTerm, string> = {
  first: '1st Semester',
  second: '2nd Semester',
  midyear: 'Midyear 2027',
};

export const USTP_AUDIENCE_LABELS: Record<UstpAudience, string> = {
  ug: 'Undergraduate',
  all: 'All Campus',
  gr: 'Graduate',
};

export const USTP_CATEGORY_LABELS: Record<UstpEventCategory, string> = {
  term: 'Term Milestone',
  enrollment: 'Enrollment',
  exam: 'Examinations',
  campus: 'Campus Event',
  deadline: 'Deadline',
  admissions: 'Admissions',
};

export const USTP_CATEGORY_COLORS: Record<UstpEventCategory, string> = {
  term: '#1D4ED8',
  enrollment: '#0284C7',
  exam: '#DC2626',
  campus: '#7C3AED',
  deadline: '#D97706',
  admissions: '#0F766E',
};

const MIDYEAR_CONFLICT_CAVEAT =
  'Conflicting PDF dates: the AY 2026–2027 term summary (PDF p. 2) lists June 9, 2027 while the detailed schedule (PDF p. 5) lists June 5, 2027. Confirm with the USTP CDO Registrar.';

const GRAD_MIDYEAR_OVERLAP_CAVEAT =
  'PDF p. 6 lists June 5, 2027 as both start of classes and the first day of graduate enrollment (June 5–11). Confirm with the Graduate School or Registrar.';

/**
 * Curated student-facing USTP Academic Calendar entries for AY 2026–2027
 * extracted from `src/handbook/ustpCdoKnowledgePack.json`.
 */
export const USTP_ACADEMIC_EVENTS: ReadonlyArray<UstpAcademicEvent> = [
  // ── 1st Semester AY 2026–2027 (UG & All Campus) ──────────────────────────
  {
    id: 'ustp-1st-early-enroll-freshmen',
    title: 'Early Enrollment Opens (Incoming Freshmen)',
    startDate: '2026-05-24',
    endDate: '2026-05-24',
    term: 'first',
    audience: 'ug',
    category: 'enrollment',
    pdfPage: 2,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-early-enroll-upper',
    title: 'Early Enrollment Opens (Regular Upperclassmen)',
    startDate: '2026-06-15',
    endDate: '2026-06-15',
    term: 'first',
    audience: 'ug',
    category: 'enrollment',
    pdfPage: 2,
    displayMode: 'span',
    description: 'For regular upperclassmen without midyear classes.',
  },
  {
    id: 'ustp-1st-gr-enrollment',
    title: 'Graduate Enrollment Period (1st Sem)',
    startDate: '2026-07-20',
    endDate: '2026-08-08',
    term: 'first',
    audience: 'gr',
    category: 'enrollment',
    pdfPage: 3,
    displayMode: 'endpoints',
  },
  {
    id: 'ustp-1st-petitioned-class',
    title: 'Application for Petitioned Class',
    startDate: '2026-07-28',
    endDate: '2026-08-01',
    term: 'first',
    audience: 'ug',
    category: 'enrollment',
    pdfPage: 2,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-week-of-welcome',
    title: 'USTP Week of Welcome (WoW)',
    startDate: '2026-08-03',
    endDate: '2026-08-08',
    term: 'first',
    audience: 'ug',
    category: 'campus',
    pdfPage: 2,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-add-drop',
    title: 'Adding & Dropping of Subjects',
    startDate: '2026-08-06',
    endDate: '2026-08-08',
    term: 'first',
    audience: 'ug',
    category: 'enrollment',
    pdfPage: 2,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-asean-day',
    title: 'ASEAN Day',
    startDate: '2026-08-08',
    endDate: '2026-08-08',
    term: 'first',
    audience: 'all',
    category: 'campus',
    pdfPage: 2,
    displayMode: 'span',
    description: 'University calendar observance.',
  },
  {
    id: 'ustp-1st-classes-start',
    title: 'Start of 1st Semester Classes',
    startDate: '2026-08-10',
    endDate: '2026-08-10',
    term: 'first',
    audience: 'all',
    category: 'term',
    pdfPage: 2,
    displayMode: 'span',
    description:
      'Start of classes for all levels (109 instructional days, ends Dec 19, 2026).',
  },
  {
    id: 'ustp-1st-gr-add-drop',
    title: 'Graduate Adding & Dropping (1st Sem)',
    startDate: '2026-08-10',
    endDate: '2026-08-14',
    term: 'first',
    audience: 'gr',
    category: 'enrollment',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-gr-orientation',
    title: 'Graduate Studies Orientation General Assembly',
    startDate: '2026-08-15',
    endDate: '2026-08-15',
    term: 'first',
    audience: 'gr',
    category: 'campus',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-charter-day',
    title: 'USTP Charter Day',
    startDate: '2026-08-16',
    endDate: '2026-08-16',
    term: 'first',
    audience: 'all',
    category: 'campus',
    pdfPage: 2,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-grad-application',
    title: 'Application for Graduation (1st Sem)',
    startDate: '2026-08-17',
    endDate: '2026-10-31',
    term: 'first',
    audience: 'ug',
    category: 'deadline',
    pdfPage: 3,
    displayMode: 'endpoints',
  },
  {
    id: 'ustp-1st-gr-grad-application',
    title: 'Graduate Application for Graduation (1st Sem)',
    startDate: '2026-08-17',
    endDate: '2026-12-19',
    term: 'first',
    audience: 'gr',
    category: 'deadline',
    pdfPage: 4,
    displayMode: 'endpoints',
  },
  {
    id: 'ustp-1st-prelims',
    title: 'Preliminary Examinations (1st Sem)',
    startDate: '2026-09-09',
    endDate: '2026-09-12',
    term: 'first',
    audience: 'ug',
    category: 'exam',
    pdfPage: 3,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-rotoras-birthday',
    title: 'Birthday of Dr. Ricardo E. Rotoras',
    startDate: '2026-09-18',
    endDate: '2026-09-18',
    term: 'first',
    audience: 'all',
    category: 'campus',
    pdfPage: 3,
    displayMode: 'span',
    description: 'University calendar observance.',
  },
  {
    id: 'ustp-1st-deans-listers',
    title: "Announcement of Dean's Listers",
    startDate: '2026-09-21',
    endDate: '2026-09-21',
    term: 'first',
    audience: 'ug',
    category: 'campus',
    pdfPage: 3,
    displayMode: 'span',
    description: 'For the previous semester.',
  },
  {
    id: 'ustp-1st-teachers-day',
    title: "World Teachers' Day",
    startDate: '2026-10-05',
    endDate: '2026-10-05',
    term: 'first',
    audience: 'all',
    category: 'campus',
    pdfPage: 3,
    displayMode: 'span',
    description: 'University calendar observance.',
  },
  {
    id: 'ustp-1st-midterms',
    title: 'Midterm Examinations (1st Sem)',
    startDate: '2026-10-05',
    endDate: '2026-10-10',
    term: 'first',
    audience: 'ug',
    category: 'exam',
    pdfPage: 3,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-gr-midterms',
    title: 'Graduate Midterm Examination (1st Sem)',
    startDate: '2026-10-10',
    endDate: '2026-10-10',
    term: 'first',
    audience: 'gr',
    category: 'exam',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-faculty-eval',
    title: 'Faculty Evaluation (1st Sem)',
    startDate: '2026-10-19',
    endDate: '2026-10-23',
    term: 'first',
    audience: 'ug',
    category: 'campus',
    pdfPage: 3,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-prefinals',
    title: 'Pre-Final Examinations (1st Sem)',
    startDate: '2026-11-09',
    endDate: '2026-11-14',
    term: 'first',
    audience: 'ug',
    category: 'exam',
    pdfPage: 3,
    displayMode: 'span',
  },
  {
    id: 'ustp-admissions-freshmen-2027',
    title: 'Freshmen Admission Application (AY 2027–2028)',
    startDate: '2026-11-09',
    endDate: '2027-04-30',
    term: 'first',
    audience: 'all',
    category: 'admissions',
    pdfPage: 3,
    displayMode: 'endpoints',
    description: 'Admission application window for incoming freshmen.',
  },
  {
    id: 'ustp-1st-wellness-period',
    title: 'USTP Wellness Period',
    startDate: '2026-11-16',
    endDate: '2026-11-17',
    term: 'first',
    audience: 'all',
    category: 'campus',
    pdfPage: 3,
    displayMode: 'span',
    description: 'Social, sports, and mental awareness activities.',
  },
  {
    id: 'ustp-1st-finals-graduating',
    title: 'Final Exams — Graduating Students (1st Sem)',
    startDate: '2026-11-23',
    endDate: '2026-11-28',
    term: 'first',
    audience: 'ug',
    category: 'exam',
    pdfPage: 3,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-gr-finals',
    title: 'Graduate Final Examinations (1st Sem)',
    startDate: '2026-11-23',
    endDate: '2026-11-28',
    term: 'first',
    audience: 'gr',
    category: 'exam',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-gr-admissions',
    title: 'Graduate Admission Application Window',
    startDate: '2026-12-01',
    endDate: '2026-12-12',
    term: 'first',
    audience: 'gr',
    category: 'admissions',
    pdfPage: 4,
    displayMode: 'span',
    needsConfirmation: true,
    caveatNote:
      'PDF p. 4 lists an admission application window without specifying the cycle; confirm with the Graduate School or ASO.',
  },
  {
    id: 'ustp-1st-rotoras-anniversary',
    title: 'Death Anniversary of Dr. Ricardo E. Rotoras',
    startDate: '2026-12-02',
    endDate: '2026-12-02',
    term: 'first',
    audience: 'all',
    category: 'campus',
    pdfPage: 3,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-finals-nongraduating',
    title: 'Final Exams — Non-Graduating (1st Sem)',
    startDate: '2026-12-09',
    endDate: '2026-12-19',
    term: 'first',
    audience: 'ug',
    category: 'exam',
    pdfPage: 3,
    displayMode: 'span',
    description: 'First semester ends December 19, 2026.',
  },
  {
    id: 'ustp-1st-yearend-assembly',
    title: 'University Year-End Assembly & Fellowship',
    startDate: '2026-12-18',
    endDate: '2026-12-18',
    term: 'first',
    audience: 'all',
    category: 'campus',
    pdfPage: 3,
    displayMode: 'span',
  },
  {
    id: 'ustp-1st-gr-finals-saturday',
    title: 'Graduate Final Exams (Saturday Classes)',
    startDate: '2026-12-19',
    endDate: '2026-12-19',
    term: 'first',
    audience: 'gr',
    category: 'exam',
    pdfPage: 4,
    displayMode: 'span',
  },

  // ── 2nd Semester AY 2026–2027 ────────────────────────────────────────────
  {
    id: 'ustp-2nd-enrollment',
    title: '2nd Semester Enrollment Period',
    startDate: '2027-01-04',
    endDate: '2027-01-09',
    term: 'second',
    audience: 'ug',
    category: 'enrollment',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-2nd-petitioned-class',
    title: 'Application for Petitioned Class (2nd Sem)',
    startDate: '2027-01-04',
    endDate: '2027-01-06',
    term: 'second',
    audience: 'ug',
    category: 'enrollment',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-2nd-classes-start',
    title: 'Start of 2nd Semester Classes',
    startDate: '2027-01-05',
    endDate: '2027-01-05',
    term: 'second',
    audience: 'all',
    category: 'term',
    pdfPage: 4,
    displayMode: 'span',
    description:
      'Start of classes for all levels (110 instructional days, ends May 20, 2027).',
  },
  {
    id: 'ustp-2nd-gr-enrollment',
    title: 'Graduate Enrollment Period (2nd Sem)',
    startDate: '2027-01-06',
    endDate: '2027-01-09',
    term: 'second',
    audience: 'gr',
    category: 'enrollment',
    pdfPage: 5,
    displayMode: 'span',
  },
  {
    id: 'ustp-2nd-add-drop',
    title: 'Adding & Dropping of Subjects (2nd Sem)',
    startDate: '2027-01-11',
    endDate: '2027-01-13',
    term: 'second',
    audience: 'ug',
    category: 'enrollment',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-2nd-grad-application',
    title: 'Application for Graduation (2nd Sem)',
    startDate: '2027-01-18',
    endDate: '2027-04-03',
    term: 'second',
    audience: 'ug',
    category: 'deadline',
    pdfPage: 4,
    displayMode: 'endpoints',
  },
  {
    id: 'ustp-2nd-gr-add-drop',
    title: 'Graduate Adding & Dropping (2nd Sem)',
    startDate: '2027-01-18',
    endDate: '2027-01-22',
    term: 'second',
    audience: 'gr',
    category: 'enrollment',
    pdfPage: 5,
    displayMode: 'span',
  },
  {
    id: 'ustp-2nd-gr-grad-application',
    title: 'Graduate Application for Graduation (2nd Sem)',
    startDate: '2027-01-18',
    endDate: '2027-05-15',
    term: 'second',
    audience: 'gr',
    category: 'deadline',
    pdfPage: 5,
    displayMode: 'endpoints',
  },
  {
    id: 'ustp-2nd-prelims',
    title: 'Preliminary Examinations (2nd Sem)',
    startDate: '2027-02-08',
    endDate: '2027-02-13',
    term: 'second',
    audience: 'ug',
    category: 'exam',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-2nd-intramurals',
    title: 'USTP Intramurals (Sports & Cultural Events)',
    startDate: '2027-02-24',
    endDate: '2027-02-27',
    term: 'second',
    audience: 'all',
    category: 'campus',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-2nd-engineering-day',
    title: 'World Engineering Day',
    startDate: '2027-03-04',
    endDate: '2027-03-04',
    term: 'second',
    audience: 'all',
    category: 'campus',
    pdfPage: 5,
    displayMode: 'span',
    description: 'University calendar observance.',
  },
  {
    id: 'ustp-2nd-midterms',
    title: 'Midterm Examinations (2nd Sem)',
    startDate: '2027-03-15',
    endDate: '2027-03-20',
    term: 'second',
    audience: 'ug',
    category: 'exam',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-2nd-gr-midterms',
    title: 'Graduate Midterm Examination (2nd Sem)',
    startDate: '2027-03-20',
    endDate: '2027-03-20',
    term: 'second',
    audience: 'gr',
    category: 'exam',
    pdfPage: 5,
    displayMode: 'span',
  },
  {
    id: 'ustp-2nd-deans-listers',
    title: "Announcement of Dean's Listers",
    startDate: '2027-03-22',
    endDate: '2027-03-22',
    term: 'second',
    audience: 'ug',
    category: 'campus',
    pdfPage: 4,
    displayMode: 'span',
    description: 'For the previous semester.',
  },
  {
    id: 'ustp-2nd-faculty-eval',
    title: 'Faculty Evaluation (2nd Sem)',
    startDate: '2027-03-29',
    endDate: '2027-04-02',
    term: 'second',
    audience: 'ug',
    category: 'campus',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-admissions-shs-2027',
    title: 'Grade 11 SHS Admission Application (AY 2027–2028)',
    startDate: '2027-04-12',
    endDate: '2027-05-22',
    term: 'second',
    audience: 'all',
    category: 'admissions',
    pdfPage: 5,
    displayMode: 'endpoints',
  },
  {
    id: 'ustp-2nd-prefinals',
    title: 'Pre-Final Examinations (2nd Sem)',
    startDate: '2027-04-19',
    endDate: '2027-04-24',
    term: 'second',
    audience: 'ug',
    category: 'exam',
    pdfPage: 4,
    displayMode: 'span',
  },
  {
    id: 'ustp-2nd-finals-graduating',
    title: 'Final Exams — Graduating Students (2nd Sem)',
    startDate: '2027-04-26',
    endDate: '2027-05-03',
    term: 'second',
    audience: 'ug',
    category: 'exam',
    pdfPage: 5,
    displayMode: 'span',
  },
  {
    id: 'ustp-admissions-transferees-2027',
    title: 'Transferee & Second-Courser Application Opens',
    startDate: '2027-05-10',
    endDate: '2027-05-10',
    term: 'second',
    audience: 'ug',
    category: 'admissions',
    pdfPage: 5,
    displayMode: 'span',
    needsConfirmation: true,
    caveatNote:
      'PDF p. 5 labels this May 10, 2027 row "1st Semester AY 2026-2027", which conflicts with its 2027 date. Confirm with the Admission and Scholarship Office.',
  },
  {
    id: 'ustp-admissions-gr-2027',
    title: 'Graduate Admission Application Opens',
    startDate: '2027-05-10',
    endDate: '2027-05-10',
    term: 'second',
    audience: 'gr',
    category: 'admissions',
    pdfPage: 5,
    displayMode: 'span',
  },
  {
    id: 'ustp-2nd-finals-nongraduating',
    title: 'Final Exams — Non-Graduating (2nd Sem)',
    startDate: '2027-05-13',
    endDate: '2027-05-20',
    term: 'second',
    audience: 'ug',
    category: 'exam',
    pdfPage: 5,
    displayMode: 'span',
    description: 'Second semester ends May 20, 2027.',
  },
  {
    id: 'ustp-2nd-gr-finals',
    title: 'Graduate Final Examinations (2nd Sem)',
    startDate: '2027-05-13',
    endDate: '2027-05-20',
    term: 'second',
    audience: 'gr',
    category: 'exam',
    pdfPage: 5,
    displayMode: 'span',
  },

  // ── Midyear 2027 ─────────────────────────────────────────────────────────
  {
    id: 'ustp-midyear-enrollment',
    title: 'Midyear Enrollment Period',
    startDate: '2027-06-03',
    endDate: '2027-06-08',
    term: 'midyear',
    audience: 'ug',
    category: 'enrollment',
    pdfPage: 5,
    displayMode: 'span',
  },
  {
    id: 'ustp-midyear-start-detailed',
    title: 'Midyear Classes Start (Detailed Schedule)',
    startDate: '2027-06-05',
    endDate: '2027-06-05',
    term: 'midyear',
    audience: 'ug',
    category: 'term',
    pdfPage: 5,
    displayMode: 'span',
    needsConfirmation: true,
    caveatNote: MIDYEAR_CONFLICT_CAVEAT,
  },
  {
    id: 'ustp-midyear-petitioned-class',
    title: 'Application for Petitioned Class (Midyear)',
    startDate: '2027-06-05',
    endDate: '2027-06-08',
    term: 'midyear',
    audience: 'ug',
    category: 'enrollment',
    pdfPage: 5,
    displayMode: 'span',
  },
  {
    id: 'ustp-midyear-gr-enrollment',
    title: 'Graduate Midyear Enrollment Period',
    startDate: '2027-06-05',
    endDate: '2027-06-11',
    term: 'midyear',
    audience: 'gr',
    category: 'enrollment',
    pdfPage: 6,
    displayMode: 'span',
    needsConfirmation: true,
    caveatNote: GRAD_MIDYEAR_OVERLAP_CAVEAT,
  },
  {
    id: 'ustp-midyear-gr-start',
    title: 'Graduate Midyear Start of Classes',
    startDate: '2027-06-05',
    endDate: '2027-06-05',
    term: 'midyear',
    audience: 'gr',
    category: 'term',
    pdfPage: 6,
    displayMode: 'span',
    needsConfirmation: true,
    caveatNote: GRAD_MIDYEAR_OVERLAP_CAVEAT,
  },
  {
    id: 'ustp-midyear-start-summary',
    title: 'Midyear Term Start (Summary Table)',
    startDate: '2027-06-09',
    endDate: '2027-06-09',
    term: 'midyear',
    audience: 'ug',
    category: 'term',
    pdfPage: 2,
    displayMode: 'span',
    needsConfirmation: true,
    caveatNote: MIDYEAR_CONFLICT_CAVEAT,
  },
  {
    id: 'ustp-midyear-commencement',
    title: 'Commencement & Recognition Exercises',
    startDate: '2027-06-14',
    endDate: '2027-06-22',
    term: 'midyear',
    audience: 'all',
    category: 'campus',
    pdfPage: 6,
    displayMode: 'span',
    needsConfirmation: true,
    caveatNote:
      'As printed in the academic calendar; verify college-specific dates with official USTP CDO advisories.',
  },
  {
    id: 'ustp-midyear-grad-application',
    title: 'Application for Graduation (Midyear)',
    startDate: '2027-06-24',
    endDate: '2027-07-10',
    term: 'midyear',
    audience: 'ug',
    category: 'deadline',
    pdfPage: 6,
    displayMode: 'endpoints',
  },
  {
    id: 'ustp-midyear-gr-grad-application',
    title: 'Graduate Application for Graduation (Midyear)',
    startDate: '2027-06-24',
    endDate: '2027-07-10',
    term: 'midyear',
    audience: 'gr',
    category: 'deadline',
    pdfPage: 6,
    displayMode: 'endpoints',
  },
  {
    id: 'ustp-midyear-midterms',
    title: 'Midterm Examinations (Midyear)',
    startDate: '2027-06-28',
    endDate: '2027-07-03',
    term: 'midyear',
    audience: 'ug',
    category: 'exam',
    pdfPage: 6,
    displayMode: 'span',
  },
  {
    id: 'ustp-midyear-gr-midterms',
    title: 'Graduate Midyear Midterm Examination',
    startDate: '2027-07-03',
    endDate: '2027-07-03',
    term: 'midyear',
    audience: 'gr',
    category: 'exam',
    pdfPage: 6,
    displayMode: 'span',
  },
  {
    id: 'ustp-midyear-finals',
    title: 'Final Examinations (Midyear)',
    startDate: '2027-07-16',
    endDate: '2027-07-22',
    term: 'midyear',
    audience: 'ug',
    category: 'exam',
    pdfPage: 6,
    displayMode: 'span',
    description: 'Midyear term ends July 22, 2027.',
  },
  {
    id: 'ustp-midyear-gr-finals',
    title: 'Graduate Midyear Final Examinations',
    startDate: '2027-07-16',
    endDate: '2027-07-22',
    term: 'midyear',
    audience: 'gr',
    category: 'exam',
    pdfPage: 6,
    displayMode: 'span',
  },
  {
    id: 'ustp-midyear-asean-day',
    title: 'ASEAN Day',
    startDate: '2027-08-08',
    endDate: '2027-08-08',
    term: 'midyear',
    audience: 'all',
    category: 'campus',
    pdfPage: 5,
    displayMode: 'span',
    description: 'University calendar observance.',
  },
  {
    id: 'ustp-ay2027-2028-classes-start',
    title: 'Start of Classes — AY 2027–2028',
    startDate: '2027-08-09',
    endDate: '2027-08-09',
    term: 'midyear',
    audience: 'all',
    category: 'term',
    pdfPage: 6,
    displayMode: 'span',
    description: 'Resumption of faculty service and start of AY 2027–2028.',
  },
];

const parseYmdUtc = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};

const formatUtcYmd = (utcMs: number): string => {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatShortMd = (ymd: string): string => {
  const [, m, d] = ymd.split('-').map(Number);
  return `${SHORT_MONTHS[(m || 1) - 1] ?? ''} ${d || 1}`;
};

/** Formats a single date or inclusive date range in compact human-readable form. */
export const formatUstpDateRange = (
  startDate: string,
  endDate: string,
): string => {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const sMon = SHORT_MONTHS[(sm || 1) - 1] ?? '';
  const eMon = SHORT_MONTHS[(em || 1) - 1] ?? '';
  if (startDate === endDate) {
    return `${sMon} ${sd}, ${sy}`;
  }
  if (sy === ey && sm === em) {
    return `${sMon} ${sd}–${ed}, ${sy}`;
  }
  if (sy === ey) {
    return `${sMon} ${sd} – ${eMon} ${ed}, ${sy}`;
  }
  return `${sMon} ${sd}, ${sy} – ${eMon} ${ed}, ${ey}`;
};

/** Returns USTP academic calendar events filtered by audience and term, sorted chronologically. */
export const getUstpAcademicEvents = (options?: {
  includeGraduate?: boolean;
  term?: UstpTerm | 'all';
}): UstpAcademicEvent[] => {
  const includeGraduate = options?.includeGraduate === true;
  const term = options?.term ?? 'all';
  return USTP_ACADEMIC_EVENTS.filter(ev => {
    if (!includeGraduate && ev.audience === 'gr') return false;
    if (term !== 'all' && ev.term !== term) return false;
    return true;
  });
};

const MS_PER_DAY = 86_400_000;

const buildDateIndex = (
  includeGraduate: boolean,
): Map<string, UstpCalendarOccurrence[]> => {
  const index = new Map<string, UstpCalendarOccurrence[]>();
  const push = (date: string, occ: UstpCalendarOccurrence) => {
    const existing = index.get(date);
    if (existing) existing.push(occ);
    else index.set(date, [occ]);
  };

  const events = getUstpAcademicEvents({includeGraduate});
  for (const event of events) {
    if (event.startDate === event.endDate) {
      push(event.startDate, {
        event,
        date: event.startDate,
        displayTitle: event.title,
        dayLabel: event.needsConfirmation ? 'All day · Confirm' : 'All day',
      });
      continue;
    }

    const shortRange = `${formatShortMd(event.startDate)} – ${formatShortMd(
      event.endDate,
    )}`;

    if (event.displayMode === 'endpoints') {
      push(event.startDate, {
        event,
        date: event.startDate,
        displayTitle: `${event.title} (Opens)`,
        dayLabel: `Opens · ${shortRange}`,
        endpointRole: 'start',
      });
      push(event.endDate, {
        event,
        date: event.endDate,
        displayTitle: `${event.title} (Deadline)`,
        dayLabel: `Deadline · ${shortRange}`,
        endpointRole: 'end',
      });
      continue;
    }

    const startMs = parseYmdUtc(event.startDate);
    const endMs = parseYmdUtc(event.endDate);
    const totalDays = Math.max(
      1,
      Math.round((endMs - startMs) / MS_PER_DAY) + 1,
    );
    for (let i = 0; i < totalDays; i++) {
      const ymd = formatUtcYmd(startMs + i * MS_PER_DAY);
      push(ymd, {
        event,
        date: ymd,
        displayTitle: event.title,
        dayLabel: `Day ${i + 1} of ${totalDays} · ${shortRange}`,
      });
    }
  }

  return index;
};

const indexUgOnly = buildDateIndex(false);
const indexWithGrad = buildDateIndex(true);

/** Returns all USTP Academic Calendar occurrences falling on a local YYYY-MM-DD date. */
export const getUstpEventsOn = (
  dateStr: string,
  options?: {includeGraduate?: boolean},
): UstpCalendarOccurrence[] => {
  const index = options?.includeGraduate ? indexWithGrad : indexUgOnly;
  return index.get(dateStr) ?? [];
};

/** Summary text for a USTP Academic Calendar event. */
export const describeUstpEvent = (event: UstpAcademicEvent): string => {
  const parts = [
    `${USTP_TERM_LABELS[event.term]} · ${USTP_AUDIENCE_LABELS[event.audience]}`,
    formatUstpDateRange(event.startDate, event.endDate),
  ];
  if (event.description) parts.push(event.description);
  if (event.caveatNote) parts.push(`Note: ${event.caveatNote}`);
  return parts.join('\n');
};
