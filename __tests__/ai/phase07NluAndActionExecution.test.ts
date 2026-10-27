import {
  parseIntentFastPath,
  parseDateAndTime,
  detectCategory,
} from '../../src/ai/nlu/fastPathParser';
import { validateIntent } from '../../src/ai/nlu/types';
import { executeNluAction } from '../../src/ai/nlu/actionExecutor';
import { intentService } from '../../src/ai/nlu/intentService';
import {
  getModelStatus,
  isQwenModelReady,
  deleteQwenModel,
  getQwenModelPath,
  QWEN_MODEL_INFO,
} from '../../src/ai/nlu/modelManager';
import {
  tasksStore,
  timeBlocksStore,
  remindersStore,
  notesStore,
  initDatabase,
} from '../../src/storage';
import { ttsService } from '../../src/ai/tts/ttsService';

jest.mock('react-native-fs', () => {
  const files: Record<string, { size: number }> = {};
  return {
    DocumentDirectoryPath: '/mock/documents',
    exists: jest.fn(async (path: string) => Boolean(files[path])),
    stat: jest.fn(async (path: string) => {
      if (!files[path]) throw new Error('File does not exist');
      return { size: files[path].size };
    }),
    mkdir: jest.fn(async () => {}),
    downloadFile: jest.fn(({ toFile, progress }: { toFile: string; progress?: (res: any) => void }) => {
      if (progress) {
        progress({ bytesWritten: 397800000, contentLength: 397800000 });
      }
      return {
        jobId: 101,
        promise: Promise.resolve({ statusCode: 200 }).then(() => {
          files[toFile] = { size: 397800000 };
          return { statusCode: 200 };
        }),
      };
    }),
    stopDownload: jest.fn(),
    moveFile: jest.fn(async (from: string, to: string) => {
      files[to] = files[from] || { size: 397800000 };
      delete files[from];
    }),
    unlink: jest.fn(async (path: string) => {
      delete files[path];
    }),
    __files: files,
  };
});

describe('Phase 07: Smart Hybrid On-Device NLU & Action Execution', () => {
  const testUserId = 'test-student-nlu-phase07';
  const fixedDate = new Date(2026, 9, 27, 8, 30, 0); // Tuesday, Oct 27, 2026 08:30

  beforeAll(() => {
    initDatabase();
  });

  describe('1. Fast-Path Deterministic Date & Time Parser', () => {
    test('extracts relative dates correctly with local calendar arithmetic', () => {
      const today = parseDateAndTime('meeting today', fixedDate);
      expect(today.date).toBe('2026-10-27');

      const tomorrow = parseDateAndTime('submit homework tomorrow', fixedDate);
      expect(tomorrow.date).toBe('2026-10-28');

      const dayAfter = parseDateAndTime('lab presentation day after tomorrow', fixedDate);
      expect(dayAfter.date).toBe('2026-10-29');
    });

    test('extracts single 12-hour and 24-hour times accurately', () => {
      const amTime = parseDateAndTime('class at 9am', fixedDate);
      expect(amTime.time).toBe('09:00');

      const wordTime = parseDateAndTime('meeting at nine am', fixedDate);
      expect(wordTime.time).toBe('09:00');

      const pmTime = parseDateAndTime('review session at 3:15 pm', fixedDate);
      expect(pmTime.time).toBe('15:15');

      const military = parseDateAndTime('consultation at 14:45', fixedDate);
      expect(military.time).toBe('14:45');
    });

    test('extracts relative durations with number words and offsets accurately', () => {
      const fiveMins = parseDateAndTime('remind me five minutes from now', fixedDate);
      expect(fiveMins.date).toBe('2026-10-27');
      expect(fiveMins.time).toBe('08:35');

      const tenMins = parseDateAndTime('in ten minutes', fixedDate);
      expect(tenMins.time).toBe('08:40');

      const halfHour = parseDateAndTime('in half an hour', fixedDate);
      expect(halfHour.time).toBe('09:00');

      const anHour = parseDateAndTime('an hour from now', fixedDate);
      expect(anHour.time).toBe('09:30');

      const twoDays = parseDateAndTime('in two days', fixedDate);
      expect(twoDays.date).toBe('2026-10-29');
    });

    test('extracts time ranges and computes duration minutes', () => {
      const range = parseDateAndTime('study block from 9 to 11 am', fixedDate);
      expect(range.time).toBe('09:00');
      expect(range.endTime).toBe('11:00');
      expect(range.durationMinutes).toBe(120);

      const hyphenRange = parseDateAndTime('library session from 2pm to 4pm', fixedDate);
      expect(hyphenRange.time).toBe('14:00');
      expect(hyphenRange.endTime).toBe('16:00');
      expect(hyphenRange.durationMinutes).toBe(120);
    });

    test('detects academic vs personal categories', () => {
      expect(detectCategory('prepare for data structures quiz')).toBe('Academic');
      expect(detectCategory('buy groceries for the dorm')).toBe('Personal');
      expect(detectCategory('meet with thesis adviser')).toBe('Academic');
    });
  });

  describe('2. Intent Classification and Clean Title Extraction', () => {
    test('parses task creation with clean title and exact due time', () => {
      const result = parseIntentFastPath(
        'Remind me tomorrow at 9am to submit capstone chapter 2 draft',
        fixedDate,
      );
      expect(result.intent).toBe('create_reminder');
      expect(result.title).toBe('Submit capstone chapter 2 draft');
      expect(result.date).toBe('2026-10-28');
      expect(result.time).toBe('09:00');
      expect(result.category).toBe('Academic');
      expect(result.confidence).toBeGreaterThan(0.85);
    });

    test('parses time block creation with time range and category', () => {
      const result = parseIntentFastPath(
        'Add time block for study session from 2 to 4pm tomorrow',
        fixedDate,
      );
      expect(result.intent).toBe('create_time_block');
      expect(result.title).toBe('Study session');
      expect(result.date).toBe('2026-10-28');
      expect(result.time).toBe('14:00');
      expect(result.endTime).toBe('16:00');
      expect(result.durationMinutes).toBe(120);
    });

    test('parses note saving correctly', () => {
      const result = parseIntentFastPath(
        'Take a note that midterm exam coverage is chapters 1 through 4',
        fixedDate,
      );
      expect(result.intent).toBe('create_note');
      expect(result.title).toContain('Midterm exam coverage');
      expect(result.category).toBe('Academic');
    });

    test('parses relative reminder commands and strips prepositions to isolate clean titles', () => {
      // Direct user case: "Remind me five minutes from now for a coffee"
      const coffeeResult = parseIntentFastPath(
        'Remind me five minutes from now for a coffee',
        fixedDate,
      );
      expect(coffeeResult.intent).toBe('create_reminder');
      expect(coffeeResult.title).toBe('Coffee');
      expect(coffeeResult.date).toBe('2026-10-27');
      expect(coffeeResult.time).toBe('08:35');
      expect(coffeeResult.category).toBe('Personal');

      // Coffee break variation with "in ten minutes"
      const coffeeBreakResult = parseIntentFastPath(
        'Remind me in ten minutes for a coffee break',
        fixedDate,
      );
      expect(coffeeBreakResult.intent).toBe('create_reminder');
      expect(coffeeBreakResult.title).toBe('Coffee break');
      expect(coffeeBreakResult.date).toBe('2026-10-27');
      expect(coffeeBreakResult.time).toBe('08:40');

      // Academic variation with "in half an hour"
      const studyResult = parseIntentFastPath(
        'Remind me in half an hour to review lecture notes',
        fixedDate,
      );
      expect(studyResult.intent).toBe('create_reminder');
      expect(studyResult.title).toBe('Review lecture notes');
      expect(studyResult.time).toBe('09:00');
      expect(studyResult.category).toBe('Academic');
    });

    test('parses call response intents (acknowledge, snooze, reschedule)', () => {
      const ack = parseIntentFastPath('I did it, thanks!');
      expect(ack.intent).toBe('acknowledge');

      const snooze = parseIntentFastPath('Snooze for 15 minutes');
      expect(snooze.intent).toBe('snooze');
      expect(snooze.snoozeMinutes).toBe(15);

      const snoozeWord = parseIntentFastPath('Snooze for five minutes');
      expect(snoozeWord.intent).toBe('snooze');
      expect(snoozeWord.snoozeMinutes).toBe(5);

      const resched = parseIntentFastPath('Reschedule to tomorrow at 4pm', fixedDate);
      expect(resched.intent).toBe('reschedule');
      expect(resched.date).toBe('2026-10-28');
      expect(resched.time).toBe('16:00');
    });

    test('parses schedule query intent and diverse conversational edge cases', () => {
      // Standard query
      const queryToday = parseIntentFastPath("What's on my schedule today?", fixedDate);
      expect(queryToday.intent).toBe('query_schedule');
      expect(queryToday.date).toBe('2026-10-27');

      // Tomorrow query
      const queryTomorrow = parseIntentFastPath("What do I have tomorrow?", fixedDate);
      expect(queryTomorrow.intent).toBe('query_schedule');
      expect(queryTomorrow.date).toBe('2026-10-28');

      // Weekday query
      const queryFriday = parseIntentFastPath("What is on my calendar on Friday?", fixedDate);
      expect(queryFriday.intent).toBe('query_schedule');
      expect(queryFriday.date).toBe('2026-10-30');

      // "What do I have" / "Do I have anything" variations
      expect(parseIntentFastPath("What do I have today?", fixedDate).intent).toBe('query_schedule');
      expect(parseIntentFastPath("Do I have anything today?", fixedDate).intent).toBe('query_schedule');
      expect(parseIntentFastPath("Do I have any tasks today?", fixedDate).intent).toBe('query_schedule');
      expect(parseIntentFastPath("Do I have any classes today?", fixedDate).intent).toBe('query_schedule');
      expect(parseIntentFastPath("Is anything scheduled today?", fixedDate).intent).toBe('query_schedule');

      // Imperative "show / check / read / tell me" commands
      expect(parseIntentFastPath("Show my schedule", fixedDate).intent).toBe('query_schedule');
      expect(parseIntentFastPath("Check my schedule", fixedDate).intent).toBe('query_schedule');
      expect(parseIntentFastPath("Check my calendar", fixedDate).intent).toBe('query_schedule');
      expect(parseIntentFastPath("Tell me what's on my schedule", fixedDate).intent).toBe('query_schedule');
      expect(parseIntentFastPath("Read out my schedule today", fixedDate).intent).toBe('query_schedule');

      // Conversational queries
      expect(parseIntentFastPath("How's my schedule looking today?", fixedDate).intent).toBe('query_schedule');
      expect(parseIntentFastPath("What does my day look like?", fixedDate).intent).toBe('query_schedule');
      expect(parseIntentFastPath("What are my plans for today?", fixedDate).intent).toBe('query_schedule');

      // Action commands with schedule words must NOT be hijacked
      const reminderCmd = parseIntentFastPath("Remind me to check my schedule tomorrow", fixedDate);
      expect(reminderCmd.intent).toBe('create_reminder');
      expect(reminderCmd.title).toBe('Check my schedule');
    });
  });

  describe('3. Strict Schema Validation', () => {
    test('rejects empty titles for task creation', () => {
      const validated = validateIntent({
        intent: 'create_task',
        title: '',
        date: '2026-10-28',
        time: '09:00',
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        confidence: 0.9,
        source: 'fast_path',
        rawTranscript: 'add task',
      });
      expect(validated.isValid).toBe(false);
      expect(validated.validationError).toContain('Title cannot be empty');
    });

    test('clamps snooze minutes to valid bounds', () => {
      const validated = validateIntent({
        intent: 'snooze',
        title: null,
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: null,
        snoozeMinutes: 5000,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: 'snooze',
      });
      expect(validated.isValid).toBe(true);
      expect(validated.snoozeMinutes).toBe(1440);
    });

    test('validates malformed dates and times', () => {
      const badTime = validateIntent({
        intent: 'create_task',
        title: 'Review notes',
        date: '2026-10-28',
        time: '25:99',
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        confidence: 0.9,
        source: 'fast_path',
        rawTranscript: 'bad time',
      });
      expect(badTime.isValid).toBe(false);
      expect(badTime.validationError).toContain('Invalid time format');
    });
  });

  describe('4. Database & Scheduler Mutation Execution', () => {
    test('executes create_task and persists in tasksStore', async () => {
      const validated = validateIntent({
        intent: 'create_task',
        title: 'Finish Physics Laboratory Report',
        date: '2026-10-28',
        time: '14:00',
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: 'Lab report on kinematics',
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: 'add task',
      });

      const result = await executeNluAction(testUserId, validated, { referenceDate: fixedDate });
      expect(result.success).toBe(true);
      expect(result.entityType).toBe('task');
      expect(result.reply).toContain('Finish Physics Laboratory Report');

      const tasks = tasksStore.getAllTasks(testUserId);
      const created = tasks.find((t) => t.title === 'Finish Physics Laboratory Report');
      expect(created).toBeDefined();
      expect(created?.category).toBe('Academic');
      expect(created?.dueDate).toBe('2026-10-28');
    });

    test('executes create_reminder and persists in remindersStore and tasksStore', async () => {
      const validated = validateIntent({
        intent: 'create_reminder',
        title: 'Oral Defense Consultation',
        date: '2026-10-30',
        time: '09:00',
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: 'Review slides with panel adviser',
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: 'remind me to oral defense',
      });

      const result = await executeNluAction(testUserId, validated, { referenceDate: fixedDate });
      expect(result.success).toBe(true);
      expect(result.entityType).toBe('reminder');

      const reminders = remindersStore.getAllReminders(testUserId);
      const created = reminders.find((r) => r.task === 'Oral Defense Consultation');
      expect(created).toBeDefined();
    });

    test('executes create_time_block and persists in timeBlocksStore', async () => {
      const validated = validateIntent({
        intent: 'create_time_block',
        title: 'Software Engineering Sprint Review',
        date: '2026-10-29',
        time: '10:00',
        endTime: '12:00',
        durationMinutes: 120,
        category: 'Academic',
        details: 'Sprint 3 demo',
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: 'time block',
      });

      const result = await executeNluAction(testUserId, validated, { referenceDate: fixedDate });
      expect(result.success).toBe(true);
      expect(result.entityType).toBe('time_block');

      const blocks = timeBlocksStore.getAll(testUserId);
      const created = blocks.find((b) => b.title === 'Software Engineering Sprint Review');
      expect(created).toBeDefined();
      expect(created?.startTime).toBe('10:00');
      expect(created?.endTime).toBe('12:00');
    });

    test('executes create_note and persists in notesStore', async () => {
      const validated = validateIntent({
        intent: 'create_note',
        title: 'Operating Systems Quiz Topics',
        date: null,
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: 'Semaphores, Deadlocks, Mutex locks',
        snoozeMinutes: null,
        confidence: 0.9,
        source: 'fast_path',
        rawTranscript: 'save note',
      });

      const result = await executeNluAction(testUserId, validated);
      expect(result.success).toBe(true);
      expect(result.entityType).toBe('note');

      const notes = notesStore.getAll(testUserId);
      const created = notes.find((n) => n.title === 'Operating Systems Quiz Topics');
      expect(created).toBeDefined();
      expect(created?.body).toBe('Semaphores, Deadlocks, Mutex locks');
    });

    test('executes query_schedule and provides spoken schedule summary', async () => {
      const validatedTomorrow = validateIntent({
        intent: 'query_schedule',
        title: null,
        date: '2026-10-28',
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: 'what is on my schedule tomorrow',
      });

      const resultTomorrow = await executeNluAction(testUserId, validatedTomorrow, { referenceDate: fixedDate });
      expect(resultTomorrow.success).toBe(true);
      expect(resultTomorrow.intent).toBe('query_schedule');
      // Natural 12-hour spoken format: "Tomorrow you have 1 task: Finish Physics Laboratory Report at 2:00 PM."
      expect(resultTomorrow.reply).toContain('Tomorrow you have 1 task');
      expect(resultTomorrow.reply).toContain('Finish Physics Laboratory Report at 2:00 PM');

      // Test empty schedule day
      const validatedEmpty = validateIntent({
        intent: 'query_schedule',
        title: null,
        date: '2026-10-27',
        time: null,
        endTime: null,
        durationMinutes: null,
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        confidence: 0.95,
        source: 'fast_path',
        rawTranscript: "what's on my schedule today",
      });

      const resultEmpty = await executeNluAction(testUserId, validatedEmpty, { referenceDate: fixedDate });
      expect(resultEmpty.success).toBe(true);
      expect(resultEmpty.reply).toContain('Today, your schedule is completely clear!');

      // Add multiple items to 2026-10-27 and verify chronological ordering
      timeBlocksStore.insert({
        id: 'tb-test-chron-1',
        userId: testUserId,
        title: 'Algorithms Lecture',
        date: '2026-10-27',
        startTime: '09:00',
        endTime: '10:30',
        color: '#4F46E5',
        category: 'Academic',
      });

      tasksStore.insertTask({
        id: 'task-test-chron-2',
        userId: testUserId,
        title: 'Submit Operating Systems Assignment',
        dueDate: '2026-10-27',
        dueTime: '16:00',
        isCompleted: false,
        priority: 'High',
        category: 'Academic',
      });

      tasksStore.insertEvent({
        id: 'event-test-chron-3',
        userId: testUserId,
        title: 'Dean Consultation',
        date: '2026-10-27',
        startTime: '13:00',
        endTime: '14:00',
      });

      const speakSpy = jest.spyOn(ttsService, 'speak');
      const resultMulti = await executeNluAction(
        testUserId,
        validatedEmpty,
        { referenceDate: fixedDate, speakResult: true },
      );

      expect(resultMulti.success).toBe(true);
      expect(resultMulti.reply).toContain('Today you have 1 task, 1 time block, and 1 event');
      expect(resultMulti.reply).toContain('First, Algorithms Lecture from 9:00 AM to 10:30 AM.');
      expect(resultMulti.reply).toContain('Next, Dean Consultation from 1:00 PM to 2:00 PM.');
      expect(resultMulti.reply).toContain('Finally, Submit Operating Systems Assignment at 4:00 PM.');
      expect(speakSpy).toHaveBeenCalledWith(resultMulti.reply);
      speakSpy.mockRestore();
    });
  });

  describe('5. Dynamic Model Manager & Lifecycle', () => {
    test('reports model status accurately before and after deletion', async () => {
      const status = await getModelStatus();
      expect(status.modelName).toBe(QWEN_MODEL_INFO.name);
      expect(status.filePath).toBe(getQwenModelPath());

      await deleteQwenModel();
      const isReady = await isQwenModelReady();
      expect(isReady).toBe(false);
    });
  });

  describe('6. IntentService End-to-End Hybrid Processing', () => {
    test('extracts and executes speech transcript in one seamless call', async () => {
      const result = await intentService.processAndExecuteIntent(
        testUserId,
        'Add study block for Algorithms from 3pm to 5pm tomorrow',
        { referenceDate: fixedDate },
      );

      expect(result.success).toBe(true);
      expect(result.intent).toBe('create_time_block');
      expect(result.reply).toContain('Algorithms');

      const blocks = timeBlocksStore.getAll(testUserId);
      expect(blocks.some((b) => b.title.includes('Algorithms'))).toBe(true);
    });
  });
});
