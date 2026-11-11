import {
  parseUstpCor,
  formatUstpStudentName,
} from '../../src/ai/vision/ustpCorParser';
import { parseScannedSchedule } from '../../src/ai/vision/scheduleParser';
import {
  db,
  initDatabase,
  userStore,
  academicProfileStore,
  timeBlocksStore,
  parseClassBlockMetadata,
} from '../../src/storage';
import { chatMemoryStore } from '../../src/storage/chatMemoryStore';
import { saveOnboardingMemories } from '../../src/storage/onboardingMemory';
import { buildDayEntries } from '../../src/ui/screens/calendar/utils/timeGridLayout';

/**
 * Exact raw text extracted from the sample USTP Certificate of Registration PDF
 * (cor-ustp055mlWbkig.pdf) where PDF text boxes separate labels and values.
 */
const SAMPLE_USTP_COR_PDF_TEXT = `
Document Code No.
FM-USTP-RGTR-01
Rev. No. Effective Date Page No.
01 10.01.21 1 of 1
Republic of the Philippines
University of Science and Technology of Southern Philippines
Alubijid | Balubal | Cagayan de Oro | Claveria | Jasaan | Oroquieta | Panaon | Villanueva
CERTIFICATE OF REGISTRATION
Registration No: Academic Year/Term :
STUDENT GENERAL INFORMATION
Student No: College:
Name: Program:
Gender: Age:
Address:
Nationality: Major:
Year Level:
Contact #: Curriculum:
Scholarship/Discount:
CODE SUBJECT TITLE
Lec Lab Credit
U N I T
SECTION SCHEDULE/ROOM FACULTY
Total Unit(s)
Note: Subject marked with "*" is Special Subject.
ASSESSSED FEES
STUDENT' PLEDGE
TOTAL
Total Assessment :
Total Payment :
Outstanding Balance :
SCHEDULE OF PAYMENTS
First Payment / Due Date Second Payment / Due Date Third Payment / Due Date
1st Semester AY 2026-2027 556711
2023305519
GONZALES, JOHN LEMAR L
M 22
BLOCK 6, LOT 1 TIBASAK, MACASANDIG, CAGAYAN DE ORO CITYMacasandigCagayan de Oro City
Filipino
COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING
B.S. in Information Technology
N/A
4th Year - Baccalaureate
CITC-BSIT-2018-2019
IT414 IT Elective 3 2 1 3 IT4R11_Track2 F 7:00 AM - 10:00 AM/09-302(CITC Lab 3) Loredel Tamayo
W 7:00 AM - 9:00 AM/51-201 Loredel Tamayo
IT415 IT Elective 4 2 1 3 IT4R11_Track2 W 10:00 AM - 1:00 PM/09-105 FLORETO JR. QUINITO
T 3:00 PM - 5:00 PM/Modular Classroom 1 FLORETO JR. QUINITO
IT411 CAPSTONE Project and Research 2 2 1 3 IT411_Rojo JAY NOEL ROJO
IT412 System Administration and Maintenance 2 1 3 IT4R11_Track2 S 4:00 PM - 7:00 PM Shannice Cabili
W 7:00 PM - 9:00 PM/Modular Classroom 2 Shannice Cabili
IT413 Social and Professional Issues 3 0 3 IT4R11_Track2 M 3:00 PM - 4:30 PM/Modular Classroom 4 Sharmaine Gabrielle Babanto
T 11:30 AM - 1:00 PM/51-204 Sharmaine Gabrielle Babanto
GnS Gender and Society 3 0 3 IT4R11_Track2 TF 1:00 PM - 2:30 PM Anton Alfred Endaya
14 4 18
Tuition Fee (18@500) 9,000.00
Library Fee 450.00
24,062.50
Free Higher Education (RA 10931)
I hereby Sleazy swear that I shall abide by all the rules and regulations of the University.
APPROVED BY:
ENGR.FRONT L. FAJARDO, MSManE
University Registrar
`;

/**
 * Coordinate-sorted horizontal OCR text produced by LafinaVisionModule.buildCoordinateSortedText
 * when scanning a screenshot or rendered PDF page of the USTP COR.
 */
const SAMPLE_USTP_COR_HORIZONTAL_OCR = `
Registration No: 556711 Academic Year/Term : 1st Semester AY 2026-2027
STUDENT GENERAL INFORMATION
Student No: 2023305519 College: COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING
Name: GONZALES, JOHN LEMAR L Program: B.S. in Information Technology
Gender: M Nationality: Filipino Major: N/A Curriculum: CITC-BSIT-2018-2019
Age: 22 Contact #: Year Level: 4th Year - Baccalaureate Scholarship/Discount:
Address: BLOCK 6, LOT 1 TIBASAK, MACASANDIG, CAGAYAN DE ORO CITYMacasandigCagayan de Oro City
CODE SUBJECT TITLE U N I T Lec Lab Credit SECTION SCHEDULE/ROOM FACULTY
IT414 IT Elective 3 2 1 3 IT4R11_Track2 F 7:00 AM - 10:00 AM/09-302(CITC Lab 3) Loredel Tamayo
W 7:00 AM - 9:00 AM/51-201 Loredel Tamayo
IT415 IT Elective 4 2 1 3 IT4R11_Track2 W 10:00 AM - 1:00 PM/09-105 FLORETO JR. QUINITO
T 3:00 PM - 5:00 PM/Modular Classroom 1 FLORETO JR. QUINITO
IT411 CAPSTONE Project and Research 2 2 1 3 IT411_Rojo JAY NOEL ROJO
IT412 System Administration and Maintenance 2 1 3 IT4R11_Track2 S 4:00 PM - 7:00 PM Shannice Cabili
W 7:00 PM - 9:00 PM/Modular Classroom 2 Shannice Cabili
IT413 Social and Professional Issues 3 0 3 IT4R11_Track2 M 3:00 PM - 4:30 PM/Modular Classroom 4 Sharmaine Gabrielle Babanto
T 11:30 AM - 1:00 PM/51-204 Sharmaine Gabrielle Babanto
GnS Gender and Society 3 0 3 IT4R11_Track2 TF 1:00 PM - 2:30 PM Anton Alfred Endaya
Total Unit(s) 14 4 18
ASSESSSED FEES
Tuition Fee (18@500) 9,000.00
STUDENT' PLEDGE
`;

describe('USTP COR Tailored Parser & Onboarding/Profile/Calendar Integration', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM users');
  });

  describe('formatUstpStudentName', () => {
    test('converts USTP "LASTNAME, FIRSTNAME MIDDLENAME" into display name and preferred name', () => {
      const formatted = formatUstpStudentName('GONZALES, JOHN LEMAR L');
      expect(formatted.formattedName).toBe('John Lemar L. Gonzales');
      expect(formatted.preferredName).toBe('John Lemar');
    });
  });

  describe.each([
    ['PDF block-separated text', SAMPLE_USTP_COR_PDF_TEXT],
    ['Coordinate-sorted horizontal OCR text', SAMPLE_USTP_COR_HORIZONTAL_OCR],
  ])('parseUstpCor (%s)', (_label, sampleText) => {
    test('100% accurately extracts student general info, 6 subjects, 10 recurring sessions, and ignores redundant fees/pledge/address', () => {
      const refDate = new Date('2026-11-11T09:00:00Z');
      const result = parseUstpCor(sampleText, refDate);

      expect(result.isValidUstpCor).toBe(true);

      // 1. Student General Information
      expect(result.profile.registrationNo).toBe('556711');
      expect(result.profile.academicYearTerm).toBe('1st Semester AY 2026-2027');
      expect(result.profile.studentNo).toBe('2023305519');
      expect(result.profile.fullName).toBe('GONZALES, JOHN LEMAR L');
      expect(result.profile.formattedName).toBe('John Lemar L. Gonzales');
      expect(result.profile.preferredName).toBe('John Lemar');
      expect(result.profile.gender).toBe('M');
      expect(result.profile.age).toBe(22);
      expect(result.profile.nationality).toBe('Filipino');
      expect(result.profile.college).toBe(
        'COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING',
      );
      expect(result.profile.collegeShort).toBe('CITC');
      expect(result.profile.program).toBe('B.S. in Information Technology');
      expect(result.profile.major).toBe('N/A');
      expect(result.profile.yearLevel).toBe('4th Year - Baccalaureate');
      expect(result.profile.yearLevelShort).toBe('4th Year');
      expect(result.profile.curriculum).toBe('CITC-BSIT-2018-2019');
      expect(result.profile.primarySection).toBe('IT4R11_Track2');
      expect(result.profile.totalLecUnits).toBe(14);
      expect(result.profile.totalLabUnits).toBe(4);
      expect(result.profile.totalCreditUnits).toBe(18);

      // 2. Enrolled Courses (6 total, including unscheduled IT411 and non-numeric GnS)
      expect(result.courses.length).toBe(6);

      const it414 = result.courses.find((c) => c.code === 'IT414');
      expect(it414).toMatchObject({
        code: 'IT414',
        subjectTitle: 'IT Elective 3',
        lecUnits: 2,
        labUnits: 1,
        creditUnits: 3,
        section: 'IT4R11_Track2',
        faculty: 'Loredel Tamayo',
      });
      expect(it414?.sessions.length).toBe(2);
      expect(it414?.sessions[0]).toMatchObject({
        days: ['Friday'],
        startTime: '07:00',
        endTime: '10:00',
        room: '09-302(CITC Lab 3)',
        faculty: 'Loredel Tamayo',
      });
      expect(it414?.sessions[1]).toMatchObject({
        days: ['Wednesday'],
        startTime: '07:00',
        endTime: '09:00',
        room: '51-201',
        faculty: 'Loredel Tamayo',
      });

      const it415 = result.courses.find((c) => c.code === 'IT415');
      expect(it415).toMatchObject({
        code: 'IT415',
        subjectTitle: 'IT Elective 4',
        section: 'IT4R11_Track2',
        faculty: 'FLORETO JR. QUINITO',
      });
      expect(it415?.sessions.length).toBe(2);
      expect(it415?.sessions[0]).toMatchObject({
        days: ['Wednesday'],
        startTime: '10:00',
        endTime: '13:00',
        room: '09-105',
      });
      expect(it415?.sessions[1]).toMatchObject({
        days: ['Tuesday'],
        startTime: '15:00',
        endTime: '17:00',
        room: 'Modular Classroom 1',
      });

      const it411 = result.courses.find((c) => c.code === 'IT411');
      expect(it411).toMatchObject({
        code: 'IT411',
        subjectTitle: 'CAPSTONE Project and Research 2',
        section: 'IT411_Rojo',
        faculty: 'JAY NOEL ROJO',
      });
      expect(it411?.sessions.length).toBe(0);

      const it412 = result.courses.find((c) => c.code === 'IT412');
      expect(it412).toMatchObject({
        code: 'IT412',
        subjectTitle: 'System Administration and Maintenance',
        section: 'IT4R11_Track2',
        faculty: 'Shannice Cabili',
      });
      expect(it412?.sessions.length).toBe(2);
      expect(it412?.sessions[0]).toMatchObject({
        days: ['Saturday'],
        startTime: '16:00',
        endTime: '19:00',
        room: 'TBA',
      });
      expect(it412?.sessions[1]).toMatchObject({
        days: ['Wednesday'],
        startTime: '19:00',
        endTime: '21:00',
        room: 'Modular Classroom 2',
      });

      const it413 = result.courses.find((c) => c.code === 'IT413');
      expect(it413).toMatchObject({
        code: 'IT413',
        subjectTitle: 'Social and Professional Issues',
        section: 'IT4R11_Track2',
        faculty: 'Sharmaine Gabrielle Babanto',
      });
      expect(it413?.sessions.length).toBe(2);
      expect(it413?.sessions[0]).toMatchObject({
        days: ['Monday'],
        startTime: '15:00',
        endTime: '16:30',
        room: 'Modular Classroom 4',
      });
      expect(it413?.sessions[1]).toMatchObject({
        days: ['Tuesday'],
        startTime: '11:30',
        endTime: '13:00',
        room: '51-204',
      });

      const gns = result.courses.find((c) => c.code === 'GnS');
      expect(gns).toMatchObject({
        code: 'GnS',
        subjectTitle: 'Gender and Society',
        section: 'IT4R11_Track2',
        faculty: 'Anton Alfred Endaya',
      });
      expect(gns?.sessions.length).toBe(1);
      expect(gns?.sessions[0]).toMatchObject({
        dayCode: 'TF',
        days: ['Tuesday', 'Friday'],
        startTime: '13:00',
        endTime: '14:30',
        room: 'TBA',
        faculty: 'Anton Alfred Endaya',
      });

      // 3. Total Scheduled Sessions (9 session rows -> 10 weekly day occurrences when TF expands)
      expect(result.sessions.length).toBe(9);

      // 4. Redundant sections & private address are strictly excluded
      expect(result.markdownSummary).not.toContain('Tuition Fee');
      expect(result.markdownSummary).not.toContain('PLEDGE');
      expect(result.markdownSummary).not.toContain('TIBASAK');

      // 5. Auto-computed Onboarding Preferences
      expect(result.recommendedPreferences.weeklyClassCount).toBe('4-6');
      expect(result.recommendedPreferences.busiestDay).toBe('Wednesday');
      expect(result.recommendedPreferences.longestClassGap).toBe('2+ hours');
    });
  });

  test('persists COR profile, updates user display name, populates recurring Calendar blocks with Room/Section/Faculty, and saves LAFINA memories', () => {
    const guest = userStore.createGuestUser();
    chatMemoryStore.setEnabled(guest.id, true);
    const refDate = new Date('2026-11-11T09:00:00Z'); // Wednesday

    const cor = parseUstpCor(SAMPLE_USTP_COR_PDF_TEXT, refDate);
    const savedProfile = academicProfileStore.save(guest.id, {
      ...cor.profile,
      isUstpStudent: true,
      courses: cor.courses.map((c) => ({
        code: c.code,
        subjectTitle: c.subjectTitle,
        lecUnits: c.lecUnits,
        labUnits: c.labUnits,
        creditUnits: c.creditUnits,
        section: c.section,
        faculty: c.faculty,
        scheduleSummary:
          c.sessions.length > 0
            ? c.sessions
                .map(
                  (s) =>
                    `${s.dayCode} ${s.startTime12}-${s.endTime12}${s.room && s.room !== 'TBA' ? ` (${s.room})` : ''}`,
                )
                .join(', ')
            : 'TBA',
      })),
    });

    // 1. User's profile name is updated to formattedName
    const updatedUser = userStore.getUserById(guest.id);
    expect(updatedUser?.username).toBe('John Lemar L. Gonzales');

    // 2. Recurring schedule persisted into timeBlocksStore (10 day blocks across Mon, Tue, Wed, Fri, Sat)
    const count = academicProfileStore.persistRecurringSchedule(
      guest.id,
      cor.sessions,
      refDate,
    );
    expect(count).toBe(10);

    const allBlocks = timeBlocksStore.getAll(guest.id);
    expect(allBlocks.length).toBe(10);

    const it414Fri = allBlocks.find(
      (b) => b.title === 'IT414 · IT Elective 3' && b.date === '2026-11-13',
    );
    expect(it414Fri).toBeDefined();
    expect(it414Fri?.category).toBe('Class');
    expect(it414Fri?.recurrenceRule).toContain('FREQ=WEEKLY;UNTIL=');
    const meta = parseClassBlockMetadata(it414Fri?.notes);
    expect(meta).toEqual({
      room: '09-302(CITC Lab 3)',
      section: 'IT4R11_Track2',
      faculty: 'Loredel Tamayo',
      summaryLine: '09-302(CITC Lab 3) · IT4R11_Track2 · Loredel Tamayo',
    });

    // 3. Calendar DayView entries include location = "Room · Section · Faculty"
    const friEntries = buildDayEntries({ date: new Date(2026, 10, 13), tasks: [], events: [], blocks: [it414Fri!], timeFormat24h: false, eventColor: '#2563EB', taskColor: () => '#059669' });
    expect(friEntries.length).toBe(1);
    expect(friEntries[0].location).toBe(
      '09-302(CITC Lab 3) · IT4R11_Track2 · Loredel Tamayo',
    );

    // 4. Memories saved in chatMemoryStore include student info, program, and all 6 courses (including unscheduled IT411)
    saveOnboardingMemories(
      guest.id,
      { preferredName: cor.profile.preferredName, tone: 'casual' },
      ['evening'],
      savedProfile,
    );
    const memories = chatMemoryStore.list(guest.id).map((m) => m.text);
    expect(memories).toContain('Prefers to be called John Lemar.');
    expect(
      memories.some(
        (m) =>
          m.includes('John Lemar L. Gonzales') &&
          m.includes('2023305519') &&
          m.includes('USTP CDO Campus'),
      ),
    ).toBe(true);
    expect(
      memories.some(
        (m) =>
          m.includes('B.S. in Information Technology') &&
          m.includes('4th Year - Baccalaureate') &&
          m.includes('IT4R11_Track2'),
      ),
    ).toBe(true);
    expect(
      memories.some(
        (m) =>
          m.includes('IT411 CAPSTONE Project and Research 2') &&
          m.includes('JAY NOEL ROJO'),
      ),
    ).toBe(true);
    // Never stores street address in memories
    expect(memories.some((m) => m.includes('TIBASAK'))).toBe(false);
  });

  test('parseScannedSchedule delegates USTP COR text to parseUstpCor for 100% accuracy', () => {
    const result = parseScannedSchedule(SAMPLE_USTP_COR_HORIZONTAL_OCR);
    expect(result.classes.length).toBe(9);
    expect(result.classes[0].subject).toBe('IT414 · IT Elective 3');
    expect(result.classes[0].faculty).toBe('Loredel Tamayo');
    expect(result.markdownTable).toContain('Scanned Class Schedule (USTP COR)');
  });

  test('recovers wrapped subject titles, vertically split rows, OCR O-as-0 units, spaced codes, and WF/MTH day codes for a full 20-unit load', () => {
    const wrappedCor = `
Registration No: 441234 Academic Year/Term : 1st Semester AY 2024-2025
STUDENT GENERAL INFORMATION
Student No: 2024300617 College: COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING
Name: BLANCO, NOEL JHUMEL G Program: B.S. in Information Technology
Gender: M Nationality: Filipino Major: N/A Curriculum: CITOC-BSIT-2018-2019
Age: 20 Contact #: Year Level: 2nd Year - Baccalaureate
CODE SUBJECT TITLE U N I T Lec Lab Credit SECTION SCHEDULE/ROOM FACULTY
IT211 Introduction to Human Computer
Interaction 2 1 3 IT2R13 WF 8:00 AM - 9:30 AM/09-301 Jane Doe
IT212 Data Structures and Algorithms
2 1 3 IT2R13 TTH 1:00 PM - 2:30 PM/09-302 Juan Dela Cruz
*IT213 Integrative Programming and
Technologies 1
2 1 3 IT2R13 M 10:00 AM - 1:00 PM/09-303 Maria Santos
IT214 Object-Oriented Programming 2 1 3 IT2R13 MTH 3:00 PM - 4:30 PM/51-201 Pedro Reyes
GEC106 Ethics 3 O 3 IT2R13 TF 9:00 AM - 10:30 AM/Modular Classroom 1 Ana Cruz
GEC107 Science, Technology and Society 3 0 3 IT2R13 S 1:00 PM - 4:00 PM/Online Mark Lopez
PATHFit 3 Physical Activities Toward Health 2 O 2 IT2R13 F 3:00 PM - 5:00 PM/Covered Court Carlo Tan
Total Unit(s) 16 4 20
ASSESSSED FEES
`;
    const result = parseUstpCor(wrappedCor);

    expect(result.isValidUstpCor).toBe(true);
    expect(result.profile.formattedName).toBe('Noel Jhumel G. Blanco');
    expect(result.profile.curriculum).toBe('CITOC-BSIT-2018-2019');
    expect(result.profile.totalCreditUnits).toBe(20);
    expect(result.courses.length).toBe(7);

    const sumCredits = result.courses.reduce((sum, c) => sum + c.creditUnits, 0);
    expect(sumCredits).toBe(20);

    const it211 = result.courses.find((c) => c.code === 'IT211');
    expect(it211?.subjectTitle).toBe('Introduction to Human Computer Interaction');
    expect(it211?.sessions[0]?.days).toEqual(['Wednesday', 'Friday']);

    const it213 = result.courses.find((c) => c.code === 'IT213');
    expect(it213?.subjectTitle).toBe('Integrative Programming and Technologies 1');

    const it214 = result.courses.find((c) => c.code === 'IT214');
    expect(it214?.sessions[0]?.days).toEqual(['Monday', 'Thursday']);

    const gec106 = result.courses.find((c) => c.code === 'GEC106');
    expect(gec106?.labUnits).toBe(0);
    expect(gec106?.creditUnits).toBe(3);

    const gec107 = result.courses.find((c) => c.code === 'GEC107');
    expect(gec107?.sessions[0]?.room).toBe('Online');
    expect(gec107?.faculty).toBe('Mark Lopez');

    const pathfit = result.courses.find((c) => c.code === 'PATHFit 3');
    expect(pathfit?.creditUnits).toBe(2);
    expect(pathfit?.sessions[0]?.room).toBe('Covered Court');
    expect(pathfit?.faculty).toBe('Carlo Tan');
  });
});
