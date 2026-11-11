import {
  expandDays,
  normalizeTime24,
  parseScannedSchedule,
  computeSemesterEndDate,
} from '../../src/ai/vision/scheduleParser';
import {
  ChatOrchestrator,
  getNextDateForDay,
} from '../../src/ai/chatOrchestrator';
import {
  initDatabase,
  timeBlocksStore,
  tasksStore,
} from '../../src/storage';
import { confirmReviewedCommand } from '../../src/ai/nlu/commandReview';

describe('Schedule Parser & Calendar Integration', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  describe('expandDays', () => {
    test('expands MWF to Monday, Wednesday, Friday', () => {
      expect(expandDays('MWF')).toEqual(['Monday', 'Wednesday', 'Friday']);
    });

    test('expands TTH to Tuesday, Thursday', () => {
      expect(expandDays('TTH')).toEqual(['Tuesday', 'Thursday']);
    });

    test('expands TF to Tuesday, Friday', () => {
      expect(expandDays('TF')).toEqual(['Tuesday', 'Friday']);
    });

    test('expands TR and R to Thursday', () => {
      expect(expandDays('TR')).toEqual(['Tuesday', 'Thursday']);
      expect(expandDays('R')).toEqual(['Thursday']);
    });

    test('expands individual days and single letters', () => {
      expect(expandDays('Mon Wed')).toEqual(['Monday', 'Wednesday']);
      expect(expandDays('Friday')).toEqual(['Friday']);
      expect(expandDays('T')).toEqual(['Tuesday']);
      expect(expandDays('W')).toEqual(['Wednesday']);
      expect(expandDays('F')).toEqual(['Friday']);
      expect(expandDays('S')).toEqual(['Saturday']);
    });
  });

  describe('normalizeTime24', () => {
    test('normalizes 12-hour AM/PM times', () => {
      expect(normalizeTime24('9:00 AM')).toEqual({
        time24: '09:00',
        time12: '9:00 AM',
      });
      expect(normalizeTime24('1:30 PM')).toEqual({
        time24: '13:30',
        time12: '1:30 PM',
      });
      expect(normalizeTime24('12:00 PM')).toEqual({
        time24: '12:00',
        time12: '12:00 PM',
      });
      expect(normalizeTime24('12:30 AM')).toEqual({
        time24: '00:30',
        time12: '12:30 AM',
      });
    });

    test('normalizes 24-hour times', () => {
      expect(normalizeTime24('14:00')).toEqual({
        time24: '14:00',
        time12: '2:00 PM',
      });
      expect(normalizeTime24('08:30')).toEqual({
        time24: '08:30',
        time12: '8:30 AM',
      });
    });

    test('resilient to OCR typos: dots instead of colons and letter O instead of zero', () => {
      expect(normalizeTime24('1.00 PM')).toEqual({
        time24: '13:00',
        time12: '1:00 PM',
      });
      expect(normalizeTime24('11.30 AM')).toEqual({
        time24: '11:30',
        time12: '11:30 AM',
      });
      expect(normalizeTime24('1:0O PM')).toEqual({
        time24: '13:00',
        time12: '1:00 PM',
      });
    });
  });

  describe('computeSemesterEndDate', () => {
    test('computes an ~18-week cut-off timestamp for RRULE UNTIL clause', () => {
      const refDate = new Date('2026-11-11T09:00:00Z');
      const until = computeSemesterEndDate(refDate, 18);
      // 18 weeks * 7 = 126 days after Nov 11, 2026 -> mid-March 2027
      expect(until).toMatch(/^202703\d{2}T235959Z$/);
    });
  });

  describe('parseScannedSchedule', () => {
    test('extracts multiple classes with days, times, and rooms from timetable text', () => {
      const ocrText = `
        FIRST SEMESTER CLASS SCHEDULE
        CS 101 Intro to Computing | MWF 09:00 AM - 10:30 AM | Room 304
        MATH 201 Calculus I | TTH 1:00 PM - 2:30 PM | Science Hall
        ENG 102 Technical Writing | Friday 3:00 PM - 5:00 PM | ICT Lab
      `;

      const result = parseScannedSchedule(ocrText);
      expect(result.classes.length).toBe(3);

      // Class 1: CS 101
      expect(result.classes[0].subject).toBe('CS 101');
      expect(result.classes[0].days).toEqual(['Monday', 'Wednesday', 'Friday']);
      expect(result.classes[0].startTime).toBe('09:00');
      expect(result.classes[0].endTime).toBe('10:30');
      expect(result.classes[0].room).toBe('Room 304');
      expect(result.classes[0].recurrenceRule).toContain('FREQ=WEEKLY;UNTIL=');

      // Class 2: MATH 201
      expect(result.classes[1].subject).toBe('MATH 201');
      expect(result.classes[1].days).toEqual(['Tuesday', 'Thursday']);
      expect(result.classes[1].startTime).toBe('13:00');
      expect(result.classes[1].endTime).toBe('14:30');

      // Class 3: ENG 102
      expect(result.classes[2].subject).toBe('ENG 102');
      expect(result.classes[2].days).toEqual(['Friday']);
      expect(result.classes[2].startTime).toBe('15:00');
      expect(result.classes[2].endTime).toBe('17:00');

      // Markdown Table contains subjects and times
      expect(result.markdownTable).toContain('### 📅 Scanned Class Schedule');
      expect(result.markdownTable).toContain('CS 101');
      expect(result.markdownTable).toContain('MATH 201');
      expect(result.markdownTable).toContain('ENG 102');
    });

    test('handles fallback when no times are found', () => {
      const ocrText = 'Just some random notes about history without schedule times';
      const result = parseScannedSchedule(ocrText);
      expect(result.classes.length).toBe(0);
      expect(result.markdownTable).toContain('### 📄 Scanned Document Text');
      expect(result.markdownTable).toContain('No clear timetable grid');
    });

    test('handles OCR typos with periods instead of colons in class times', () => {
      const ocrText = `
        CS 101 Computer Science | MWF 9.00 AM - 10.30 AM | Lab 1
        MATH 201 Calculus | TR 1.00 PM - 2.30 PM | Hall 2
      `;
      const result = parseScannedSchedule(ocrText);
      expect(result.classes.length).toBe(2);
      expect(result.classes[0].startTime).toBe('09:00');
      expect(result.classes[0].endTime).toBe('10:30');
      expect(result.classes[1].days).toEqual(['Tuesday', 'Thursday']);
      expect(result.classes[1].startTime).toBe('13:00');
      expect(result.classes[1].endTime).toBe('14:30');
    });

    test('accurately parses USTP Weekly Class Schedule with 10 classes, distinct days, and weekly recurrence', () => {
      const ocrText = `
        WEEKLY CLASS SCHEDULE
        mon
        Social and Professional Issues
        3:00 PM - 4:30 PM/Modular Classroom 4
        tue
        Social and Professional Issues
        11:30 AM - 1:00 PM Building 51-204
        Gender and Society
        TF 1:00 PM - 2:30 PM
        IT Elective 4
        T 3:00 PM - 5:00 PM Modular Classroom 1 (CITC)
        wed
        IT Elective 3
        W 7:00 AM - 9:00 AM Building 51-201
        IT Elective 4
        W 10:00 AM - 1:00 PM Building 09-105 ICT BLDG
        System Administration and Maintenance
        W 7:00 PM - 9:00 PM
        fri
        IT Elective 3
        F 7:00 AM - 10:00 AM Building 09-302(CITC Lab 3)
        Gender and Society
        TF 1:00 PM - 2:30 PM
        sat
        System Administration and Maintenance
        S 4:00 PM - 7:00 PM Modular Classroom 2
      `;

      const parsed = parseScannedSchedule(ocrText);
      expect(parsed.classes.length).toBe(10);

      // Verify no titles are "PM - 4", "AM - 1", "TF 1", etc.
      for (const c of parsed.classes) {
        expect(c.subject).not.toMatch(/^(?:AM|PM|TF)\b/i);
        expect(c.recurrenceRule).toContain('FREQ=WEEKLY');
        expect(c.recurrenceRule).toContain('UNTIL=');
      }

      // Check specific classes
      const monClass = parsed.classes.find(c => c.days.includes('Monday'));
      expect(monClass?.subject).toBe('Social and Professional Issues');
      expect(monClass?.startTime).toBe('15:00');
      expect(monClass?.endTime).toBe('16:30');
      expect(monClass?.room).toBe('Modular Classroom 4');

      const tueClasses = parsed.classes.filter(c => c.days.includes('Tuesday'));
      expect(tueClasses.length).toBe(3);
      expect(tueClasses.map(c => c.subject)).toEqual([
        'Social and Professional Issues',
        'Gender and Society',
        'IT Elective 4',
      ]);

      const wedClasses = parsed.classes.filter(c => c.days.includes('Wednesday'));
      expect(wedClasses.length).toBe(3);
      expect(wedClasses.map(c => c.subject)).toEqual([
        'IT Elective 3',
        'IT Elective 4',
        'System Administration and Maintenance',
      ]);

      const friClasses = parsed.classes.filter(c => c.days.includes('Friday'));
      expect(friClasses.length).toBe(2);
      expect(friClasses.map(c => c.subject)).toEqual([
        'IT Elective 3',
        'Gender and Society',
      ]);

      const satClasses = parsed.classes.filter(c => c.days.includes('Saturday'));
      expect(satClasses.length).toBe(1);
      expect(satClasses[0].subject).toBe('System Administration and Maintenance');
      expect(satClasses[0].startTime).toBe('16:00');
      expect(satClasses[0].endTime).toBe('19:00');
      expect(satClasses[0].room).toBe('Modular Classroom 2');
    });

    test('handles columnar OCR reading where day names are listed first', () => {
      const columnarText = `
        WEEKLY CLASS SCHEDULE
        mon
        tue
        wed
        fri
        sat
        Social and Professional Issues
        3:00 PM - 4:30 PM/Modular Classroom 4
        Social and Professional Issues
        11:30 AM - 1:00 PM Building 51-204
        Gender and Society
        TF 1:00 PM - 2:30 PM
        IT Elective 4
        T 3:00 PM - 5:00 PM Modular Classroom 1 (CITC)
        IT Elective 3
        W 7:00 AM - 9:00 AM Building 51-201
        IT Elective 4
        W 10:00 AM - 1:00 PM Building 09-105 ICT BLDG
        System Administration and Maintenance
        W 7:00 PM - 9:00 PM
        IT Elective 3
        F 7:00 AM - 10:00 AM Building 09-302(CITC Lab 3)
        Gender and Society
        TF 1:00 PM - 2:30 PM
        System Administration and Maintenance
        S 4:00 PM - 7:00 PM Modular Classroom 2
      `;

      const parsed = parseScannedSchedule(columnarText);
      expect(parsed.classes.length).toBe(9);
      expect(parsed.classes[0].days).toEqual(['Monday']);
      expect(parsed.classes[0].subject).toBe('Social and Professional Issues');
      expect(parsed.classes[0].startTime).toBe('15:00');

      const genderClass = parsed.classes.find(c => c.subject === 'Gender and Society');
      expect(genderClass?.days).toEqual(['Tuesday', 'Friday']);
    });
  });

  describe('getNextDateForDay', () => {
    test('returns correct next date for a given weekday name', () => {
      // Wednesday Nov 11, 2026
      const refDate = new Date('2026-11-11T10:00:00Z');
      expect(getNextDateForDay('Wednesday', refDate)).toBe('2026-11-11');
      expect(getNextDateForDay('Thursday', refDate)).toBe('2026-11-12');
      expect(getNextDateForDay('Friday', refDate)).toBe('2026-11-13');
      expect(getNextDateForDay('Monday', refDate)).toBe('2026-11-16');
      expect(getNextDateForDay('Tuesday', refDate)).toBe('2026-11-17');
      expect(getNextDateForDay('Saturday', refDate)).toBe('2026-11-14');
    });
  });

  describe('ChatOrchestrator Scan Schedule Flow', () => {
    test('parses scanned schedule, emits proposal, and confirms into calendar timeBlocksStore', async () => {
      const orchestrator = new ChatOrchestrator();
      const userId = 'ocr-schedule-test-user';
      const refDate = new Date('2026-11-11T09:00:00Z');

      const ocrScanMessage = `Scan schedule:
        CS 211 Data Structures | MWF 09:00 AM - 10:30 AM | Lab 1
        PHYS 101 Physics Lecture | TTH 1:00 PM - 2:30 PM | Hall A
      `;

      const result = await orchestrator.processMessage(userId, ocrScanMessage, {
        referenceDate: refDate,
      });

      // Verification of assistant response
      expect(result.reply).toContain('### 📅 Scanned Class Schedule');
      expect(result.reply).toContain('CS 211');
      expect(result.reply).toContain('PHYS 101');
      expect(result.reply).toContain('Would you like me to add these classes to your Calendar?');

      // Proposal is created
      expect(result.review).toBeDefined();
      expect(result.review?.status).toBe('proposal');

      const proposal = (result.review as any).proposal;
      expect(proposal.intent).toBe('create_time_block');
      expect(proposal.title).toBe('CS 211 (+4 more classes)');

      // Confirm the proposal
      const confirmOutcome = confirmReviewedCommand(userId, proposal.operationId);
      expect(confirmOutcome.status).toBe('applied');
      expect(confirmOutcome.reply).toContain('Scheduled 5 classes into your Calendar');

      // Verify classes exist in timeBlocksStore in SQLite
      const blocks = timeBlocksStore.getAll(userId);
      const csBlock = blocks.find(b => b.title === 'CS 211');
      const physBlock = blocks.find(b => b.title === 'PHYS 101');

      expect(csBlock).toBeDefined();
      expect(csBlock?.startTime).toBe('09:00');
      expect(csBlock?.endTime).toBe('10:30');
      expect(csBlock?.recurrenceRule).toContain('FREQ=WEEKLY');
      expect(csBlock?.recurrenceRule).toContain('UNTIL=');

      expect(physBlock).toBeDefined();
      expect(physBlock?.startTime).toBe('13:00');
      expect(physBlock?.endTime).toBe('14:30');
      expect(physBlock?.recurrenceRule).toContain('FREQ=WEEKLY');
      expect(physBlock?.recurrenceRule).toContain('UNTIL=');
    });

      test('end-to-end schedules real USTP 10-class schedule across 5 distinct days with weekly recurrence and semester cut-off', async () => {
        const orchestrator = new ChatOrchestrator();
        const userId = 'ustp-e2e-user';
        const refDate = new Date('2026-11-11T09:00:00Z'); // Wednesday

        const ustpScheduleText = `Scan schedule:
        WEEKLY CLASS SCHEDULE
        mon
        Social and Professional Issues
        3:00 PM - 4:30 PM/Modular Classroom 4
        tue
        Social and Professional Issues
        11:30 AM - 1:00 PM Building 51-204
        Gender and Society
        TF 1:00 PM - 2:30 PM
        IT Elective 4
        T 3:00 PM - 5:00 PM Modular Classroom 1 (CITC)
        wed
        IT Elective 3
        W 7:00 AM - 9:00 AM Building 51-201
        IT Elective 4
        W 10:00 AM - 1:00 PM Building 09-105 ICT BLDG
        System Administration and Maintenance
        W 7:00 PM - 9:00 PM
        fri
        IT Elective 3
        F 7:00 AM - 10:00 AM Building 09-302(CITC Lab 3)
        Gender and Society
        TF 1:00 PM - 2:30 PM
        sat
        System Administration and Maintenance
        S 4:00 PM - 7:00 PM Modular Classroom 2
      `;

        const result = await orchestrator.processMessage(userId, ustpScheduleText, {
          referenceDate: refDate,
        });

        expect(result.review?.status).toBe('proposal');
        const proposal = (result.review as any).proposal;
        expect(proposal.title).toBe('Social and Professional Issues (+9 more classes)');
        expect(proposal.details).toContain('Reminder: 15-min notification before each class.');

        // Confirm proposal
        const outcome = confirmReviewedCommand(userId, proposal.operationId);
        expect(outcome.status).toBe('applied');
        expect(outcome.reply).toContain('Scheduled 10 classes into your Calendar (repeating weekly)');

        // Verify all 10 classes are saved in timeBlocksStore with weekly recurrence and semester UNTIL
        const allBlocks = timeBlocksStore.getAll(userId);
        expect(allBlocks.length).toBe(10);
        for (const block of allBlocks) {
          expect(block.recurrenceRule).toContain('FREQ=WEEKLY');
          expect(block.recurrenceRule).toContain('UNTIL=');
          expect(block.category).toBe('Class');
          expect(block.title).not.toMatch(/^(?:AM|PM|TF)\b/i);
        }

        // Verify classes fall on 5 distinct dates (Mon, Tue, Wed, Fri, Sat)
        const blockDates = new Set(allBlocks.map(b => b.date));
        expect(blockDates.size).toBe(5);

        // Verify first class location is preserved
        const monClass = allBlocks.find(b => b.title === 'Social and Professional Issues' && b.startTime === '15:00');
        expect(monClass?.notes).toBe('Location: Modular Classroom 4');

        // Test Idempotency / Duplicate Protection:
        // Rescanning and confirming the same schedule updates existing blocks rather than creating duplicates
        const rescanResult = await orchestrator.processMessage(userId, ustpScheduleText, {
          referenceDate: refDate,
        });
        const rescanProposal = (rescanResult.review as any).proposal;
        confirmReviewedCommand(userId, rescanProposal.operationId);

        // Total count in database MUST still be exactly 10, NOT 20!
        const blocksAfterRescan = timeBlocksStore.getAll(userId);
        expect(blocksAfterRescan.length).toBe(10);
      });

      test('detects conflicts against existing personal events on the review card', async () => {
        const orchestrator = new ChatOrchestrator();
        const userId = 'conflict-test-user';
        const refDate = new Date('2026-11-11T09:00:00Z'); // Wednesday

        // Insert an existing personal event on Tuesday 14:00 - 16:00
        tasksStore.insertEvent({
          id: 'user-doctor-appt',
          userId,
          title: 'Doctor Appointment',
          date: '2026-11-17', // next Tuesday
          startTime: '14:00',
          endTime: '16:00',
        });

        // Scan a schedule with a Tuesday class overlapping 15:00 - 17:00
        const schedText = `Scan schedule:
        tue
        IT Elective 4
        T 3:00 PM - 5:00 PM Modular Classroom 1
      `;

        const result = await orchestrator.processMessage(userId, schedText, {
          referenceDate: refDate,
        });

        expect(result.review?.status).toBe('proposal');
        const proposal = (result.review as any).proposal;
        expect(proposal.warnings.length).toBeGreaterThan(0);
        expect(proposal.warnings[0]).toContain('Doctor Appointment');
      });
    });
  });
