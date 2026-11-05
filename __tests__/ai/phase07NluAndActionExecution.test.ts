import { NativeModules, Platform } from 'react-native';
import {
  parseIntentFastPath,
  parseDateAndTime,
  detectCategory,
  isTitleNoisy,
  distillScheduleTitle,
  toTitleCase,
} from '../../src/ai/nlu/fastPathParser';
import { validateIntent } from '../../src/ai/nlu/types';
import { executeNluAction } from '../../src/ai/nlu/actionExecutor';
import { intentService } from '../../src/ai/nlu/intentService';
import {
  getModelStatus,
  isQwenModelReady,
  downloadQwenModel,
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
import { acknowledgeReminderAction } from '../../src/scheduler';
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

    test('extracts 12 Noon, exact 12, and 12 Midnight single times and edge cases', () => {
      expect(parseDateAndTime('remind me at 12 Noon', fixedDate).time).toBe('12:00');
      expect(parseDateAndTime('remind me at noon', fixedDate).time).toBe('12:00');
      expect(parseDateAndTime('remind me at midday', fixedDate).time).toBe('12:00');
      expect(parseDateAndTime('remind me at 12nn', fixedDate).time).toBe('12:00');
      expect(parseDateAndTime('remind me at twelve noon', fixedDate).time).toBe('12:00');
      expect(parseDateAndTime('remind me at 12', fixedDate).time).toBe('12:00');
      expect(parseDateAndTime('remind me at twelve o\'clock', fixedDate).time).toBe('12:00');

      expect(parseDateAndTime('remind me at 12 Midnight', fixedDate).time).toBe('00:00');
      expect(parseDateAndTime('remind me at midnight', fixedDate).time).toBe('00:00');
      expect(parseDateAndTime('remind me at 12mn', fixedDate).time).toBe('00:00');
      expect(parseDateAndTime('remind me at twelve midnight', fixedDate).time).toBe('00:00');
      expect(parseDateAndTime('remind me at 12 tonight', fixedDate).time).toBe('00:00');
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

    test('extracts time ranges including 12 Noon, exact 12, and 12 Midnight endpoints', () => {
      const range = parseDateAndTime('study block from 9 to 11 am', fixedDate);
      expect(range.time).toBe('09:00');
      expect(range.endTime).toBe('11:00');
      expect(range.durationMinutes).toBe(120);

      const hyphenRange = parseDateAndTime('library session from 2pm to 4pm', fixedDate);
      expect(hyphenRange.time).toBe('14:00');
      expect(hyphenRange.endTime).toBe('16:00');
      expect(hyphenRange.durationMinutes).toBe(120);

      // Direct user case: "at 9am to 12 Noon"
      const nineToNoon = parseDateAndTime('at 9am to 12 Noon', fixedDate);
      expect(nineToNoon.time).toBe('09:00');
      expect(nineToNoon.endTime).toBe('12:00');
      expect(nineToNoon.durationMinutes).toBe(180);

      // Bare 12 at end when start is AM: "from 9am to 12"
      const nineAmToBare12 = parseDateAndTime('from 9am to 12', fixedDate);
      expect(nineAmToBare12.time).toBe('09:00');
      expect(nineAmToBare12.endTime).toBe('12:00');
      expect(nineAmToBare12.durationMinutes).toBe(180);

      // Bare start to 12 Noon / 12pm: "from 9 to 12 Noon" and "from 9 to 12pm"
      const bare9ToNoon = parseDateAndTime('from 9 to 12 Noon', fixedDate);
      expect(bare9ToNoon.time).toBe('09:00');
      expect(bare9ToNoon.endTime).toBe('12:00');
      expect(bare9ToNoon.durationMinutes).toBe(180);

      const bare9To12Pm = parseDateAndTime('from 9 to 12pm', fixedDate);
      expect(bare9To12Pm.time).toBe('09:00');
      expect(bare9To12Pm.endTime).toBe('12:00');
      expect(bare9To12Pm.durationMinutes).toBe(180);

      // Bare "from 9 to 12"
      const bare9To12 = parseDateAndTime('from 9 to 12', fixedDate);
      expect(bare9To12.time).toBe('09:00');
      expect(bare9To12.endTime).toBe('12:00');
      expect(bare9To12.durationMinutes).toBe(180);

      // 12 Noon at start of range: "12 Noon to 2pm", "noon to 3pm", "from 12 to 2pm", "12 Noon to 2"
      const noonTo2Pm = parseDateAndTime('from 12 Noon to 2pm', fixedDate);
      expect(noonTo2Pm.time).toBe('12:00');
      expect(noonTo2Pm.endTime).toBe('14:00');
      expect(noonTo2Pm.durationMinutes).toBe(120);

      const bareNoonTo3Pm = parseDateAndTime('noon to 3pm', fixedDate);
      expect(bareNoonTo3Pm.time).toBe('12:00');
      expect(bareNoonTo3Pm.endTime).toBe('15:00');
      expect(bareNoonTo3Pm.durationMinutes).toBe(180);

      const bare12To2Pm = parseDateAndTime('from 12 to 2pm', fixedDate);
      expect(bare12To2Pm.time).toBe('12:00');
      expect(bare12To2Pm.endTime).toBe('14:00');
      expect(bare12To2Pm.durationMinutes).toBe(120);

      const noonToBare2 = parseDateAndTime('12 Noon to 2', fixedDate);
      expect(noonToBare2.time).toBe('12:00');
      expect(noonToBare2.endTime).toBe('14:00');
      expect(noonToBare2.durationMinutes).toBe(120);

      // Crossing 12 Noon: "from 10 to 2pm" and "from 11am to 2"
      const crossNoon1 = parseDateAndTime('from 10 to 2pm', fixedDate);
      expect(crossNoon1.time).toBe('10:00');
      expect(crossNoon1.endTime).toBe('14:00');
      expect(crossNoon1.durationMinutes).toBe(240);

      const crossNoon2 = parseDateAndTime('from 11am to 2', fixedDate);
      expect(crossNoon2.time).toBe('11:00');
      expect(crossNoon2.endTime).toBe('14:00');
      expect(crossNoon2.durationMinutes).toBe(180);

      // 12 Midnight at end or start of range: "9pm to 12 Midnight", "9pm to midnight", "9pm to 12", "12 Midnight to 2am", "from 12 to 2am"
      const ninePmToMidnight = parseDateAndTime('from 9pm to 12 Midnight', fixedDate);
      expect(ninePmToMidnight.time).toBe('21:00');
      expect(ninePmToMidnight.endTime).toBe('00:00');
      expect(ninePmToMidnight.durationMinutes).toBe(180);

      const ninePmToBare12 = parseDateAndTime('from 9pm to 12', fixedDate);
      expect(ninePmToBare12.time).toBe('21:00');
      expect(ninePmToBare12.endTime).toBe('00:00');
      expect(ninePmToBare12.durationMinutes).toBe(180);

      const midnightTo2Am = parseDateAndTime('from 12 Midnight to 2am', fixedDate);
      expect(midnightTo2Am.time).toBe('00:00');
      expect(midnightTo2Am.endTime).toBe('02:00');
      expect(midnightTo2Am.durationMinutes).toBe(120);

      const bare12To2Am = parseDateAndTime('from 12 to 2am', fixedDate);
      expect(bare12To2Am.time).toBe('00:00');
      expect(bare12To2Am.endTime).toBe('02:00');
      expect(bare12To2Am.durationMinutes).toBe(120);

      // 24-hour range: "from 14:00 to 16:00"
      const range24 = parseDateAndTime('from 14:00 to 16:00', fixedDate);
      expect(range24.time).toBe('14:00');
      expect(range24.endTime).toBe('16:00');
      expect(range24.durationMinutes).toBe(120);
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

    test('parses time block creation with 12 Noon, exact 12, and 12 Midnight ranges and durations', () => {
      // Exact user prompt: "Create a timeblock at 9am to 12 Noon for a Coffee break"
      const coffeeNoon = parseIntentFastPath(
        'Create a timeblock at 9am to 12 Noon for a Coffee break',
        fixedDate,
      );
      expect(coffeeNoon.intent).toBe('create_time_block');
      expect(coffeeNoon.title).toBe('Coffee break');
      expect(coffeeNoon.time).toBe('09:00');
      expect(coffeeNoon.endTime).toBe('12:00');
      expect(coffeeNoon.durationMinutes).toBe(180);
      expect(coffeeNoon.category).toBe('Personal');

      // Exact 12 without "Noon": "Create a timeblock from 9am to 12 for a Coffee break"
      const coffeeExact12 = parseIntentFastPath(
        'Create a timeblock from 9am to 12 for a Coffee break',
        fixedDate,
      );
      expect(coffeeExact12.intent).toBe('create_time_block');
      expect(coffeeExact12.title).toBe('Coffee break');
      expect(coffeeExact12.time).toBe('09:00');
      expect(coffeeExact12.endTime).toBe('12:00');
      expect(coffeeExact12.durationMinutes).toBe(180);

      // 12 Midnight range: "Create a timeblock at 9pm to 12 Midnight for Thesis writing"
      const midnightBlock = parseIntentFastPath(
        'Create a timeblock at 9pm to 12 Midnight for Thesis writing',
        fixedDate,
      );
      expect(midnightBlock.intent).toBe('create_time_block');
      expect(midnightBlock.title).toBe('Thesis writing');
      expect(midnightBlock.time).toBe('21:00');
      expect(midnightBlock.endTime).toBe('00:00');
      expect(midnightBlock.durationMinutes).toBe(180);
      expect(midnightBlock.category).toBe('Academic');

      // 12 Noon with explicit duration: "Create a timeblock at 12 Noon for 2 hours for Lunch break"
      const noonDurationBlock = parseIntentFastPath(
        'Create a timeblock at 12 Noon for 2 hours for Lunch break',
        fixedDate,
      );
      expect(noonDurationBlock.intent).toBe('create_time_block');
      expect(noonDurationBlock.title).toBe('Lunch break');
      expect(noonDurationBlock.time).toBe('12:00');
      expect(noonDurationBlock.endTime).toBe('14:00');
      expect(noonDurationBlock.durationMinutes).toBe(120);
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

      const ackEvent = parseIntentFastPath('Acknowledge the event');
      expect(ackEvent.intent).toBe('acknowledge');
      expect(ackEvent.targetEntityType).toBe('event');

      const ackEventAlready = parseIntentFastPath("I've already acknowledged the event");
      expect(ackEventAlready.intent).toBe('acknowledge');
      expect(ackEventAlready.targetEntityType).toBe('event');

      const ackTask = parseIntentFastPath('Acknowledge task Submit assignment');
      expect(ackTask.intent).toBe('acknowledge');
      expect(ackTask.targetEntityType).toBe('task');
      expect(ackTask.targetTitle).toBe('Submit assignment');

      const ackNamed = parseIntentFastPath('Acknowledge Chemistry Quiz');
      expect(ackNamed.intent).toBe('acknowledge');
      expect(ackNamed.targetTitle).toBe('Chemistry Quiz');

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

    test('executes 9am to 12 Noon timeblock command end-to-end with 09:00 to 12:00', async () => {
      const result = await intentService.processAndExecuteIntent(
        testUserId,
        'Create a timeblock at 9am to 12 Noon for a Coffee break',
        { referenceDate: fixedDate },
      );

      expect(result.success).toBe(true);
      expect(result.intent).toBe('create_time_block');
      expect(result.reply).toContain('from 9:00 AM to 12:00 PM');

      const blocks = timeBlocksStore.getAll(testUserId);
      const coffeeBlock = blocks.find((b) => b.title === 'Coffee break');
      expect(coffeeBlock).toBeDefined();
      expect(coffeeBlock?.startTime).toBe('09:00');
      expect(coffeeBlock?.endTime).toBe('12:00');
    });
  });

  describe('7. Smart Hybrid NLU Titling Pipeline (Fast-Path + Qwen 2.5 0.5B SLM)', () => {
    beforeEach(() => {
      Platform.OS = 'android';
      if (!NativeModules.LafinaIntentExtractor) {
        NativeModules.LafinaIntentExtractor = {
          extractIntent: jest.fn(),
          isModelAvailable: jest.fn(async () => true),
          unloadModel: jest.fn(async () => true),
        };
      }
    });

    afterEach(async () => {
      await deleteQwenModel();
      jest.restoreAllMocks();
    });

    test('executes clean fast-path schedule title ("Dentist appointment at 2pm") in <5ms without SLM overhead', async () => {
      const fastPath = parseIntentFastPath('Dentist appointment at 2pm', fixedDate);
      expect(fastPath.intent).toBe('create_task');
      expect(fastPath.title).toBe('Dentist Appointment');
      expect(fastPath.time).toBe('14:00');
      expect(fastPath.confidence).toBeGreaterThanOrEqual(0.85);
      expect(isTitleNoisy(fastPath.title || '', 'Dentist appointment at 2pm')).toBe(false);

      const extracted = await intentService.extractIntent('Dentist appointment at 2pm', {
        referenceDate: fixedDate,
      });
      expect(extracted.isValid).toBe(true);
      expect(extracted.source).toBe('fast_path');
      expect(extracted.title).toBe('Dentist Appointment');
      expect(extracted.time).toBe('14:00');
    });

    test('detects noisy colloquial transcript ("Morrow 9am coffee break") and fuses Qwen SLM title with Fast-Path date/time', async () => {
      const rawTranscript = 'Morrow 9am coffee break';
      const fastPath = parseIntentFastPath(rawTranscript, fixedDate);
      expect(fastPath.date).toBe('2026-10-28');
      expect(fastPath.time).toBe('09:00');
      expect(isTitleNoisy(fastPath.title || '', rawTranscript)).toBe(true);
      expect(fastPath.confidence).toBe(0.75);

      await downloadQwenModel();
      const extractSpy = jest
        .spyOn(NativeModules.LafinaIntentExtractor, 'extractIntent')
        .mockResolvedValueOnce(
          JSON.stringify({
            intent: 'create_task',
            title: 'Coffee Break',
            date: null,
            time: '09:00',
            category: 'Personal',
          }),
        );

      const extracted = await intentService.extractIntent(rawTranscript, {
        referenceDate: fixedDate,
      });

      expect(extractSpy).toHaveBeenCalledTimes(1);
      expect(extracted.source).toBe('on_device_slm');
      expect(extracted.title).toBe('Coffee Break');
      expect(extracted.date).toBe('2026-10-28');
      expect(extracted.time).toBe('09:00');
      expect(extracted.category).toBe('Personal');
    });

    test('detects noisy conversational academic transcript and fuses Qwen SLM distilled title with Fast-Path date/time', async () => {
      const rawTranscript =
        'I need to finish studying for operating systems midterm tomorrow 8pm';
      const fastPath = parseIntentFastPath(rawTranscript, fixedDate);
      expect(isTitleNoisy(fastPath.title || '', rawTranscript)).toBe(true);
      expect(fastPath.confidence).toBe(0.75);
      expect(fastPath.date).toBe('2026-10-28');
      expect(fastPath.time).toBe('20:00');

      await downloadQwenModel();
      const extractSpy = jest
        .spyOn(NativeModules.LafinaIntentExtractor, 'extractIntent')
        .mockResolvedValueOnce(
          JSON.stringify({
            intent: 'create_task',
            title: 'Study for Operating Systems Midterm',
            date: null,
            time: '20:00',
            category: 'Academic',
          }),
        );

      const extracted = await intentService.extractIntent(rawTranscript, {
        referenceDate: fixedDate,
      });

      expect(extractSpy).toHaveBeenCalledTimes(1);
      expect(extracted.source).toBe('on_device_slm');
      expect(extracted.title).toBe('Study for Operating Systems Midterm');
      expect(extracted.date).toBe('2026-10-28');
      expect(extracted.time).toBe('20:00');
      expect(extracted.category).toBe('Academic');
    });

    test('gracefully falls back to sanitized Title Case titles when offline or SLM is not downloaded', async () => {
      await deleteQwenModel();
      expect(await isQwenModelReady()).toBe(false);

      const morrowCoffee = await intentService.extractIntent('Morrow 9am coffee break', {
        referenceDate: fixedDate,
      });
      expect(morrowCoffee.source).toBe('fast_path');
      expect(morrowCoffee.title).toBe('Coffee Break');
      expect(morrowCoffee.date).toBe('2026-10-28');
      expect(morrowCoffee.time).toBe('09:00');

      const studyMidterm = await intentService.extractIntent(
        'I need to finish studying for operating systems midterm tomorrow 8pm',
        { referenceDate: fixedDate },
      );
      expect(studyMidterm.source).toBe('fast_path');
      expect(studyMidterm.title).toBe('Study for Operating Systems Midterm');
      expect(studyMidterm.date).toBe('2026-10-28');
      expect(studyMidterm.time).toBe('20:00');
      expect(studyMidterm.category).toBe('Academic');

      const capstoneDraft = await intentService.extractIntent(
        'I really gotta submit my capstone draft chapter 2 tomorrow at 8pm',
        { referenceDate: fixedDate },
      );
      expect(capstoneDraft.title).toBe('Submit Capstone Draft Chapter 2');
      expect(capstoneDraft.date).toBe('2026-10-28');
      expect(capstoneDraft.time).toBe('20:00');

      const groceries = await intentService.extractIntent(
        'Remind me to buy groceries after class',
        { referenceDate: fixedDate },
      );
      expect(groceries.intent).toBe('create_reminder');
      expect(groceries.title).toBe('Buy Groceries');

      const examReview = await intentService.extractIntent(
        "Don't forget exam review session with Alex on Friday 2pm",
        { referenceDate: fixedDate },
      );
      expect(examReview.title).toBe('Exam Review Session with Alex');
      expect(examReview.date).toBe('2026-10-30');
      expect(examReview.time).toBe('14:00');

      expect(toTitleCase(distillScheduleTitle('morrow 9am coffee break'))).toBe('Coffee Break');
    });
  });

  describe('8. Schedule Audit, Transcription Time Caveats, Create/Add Commands & Full CRUD Operations', () => {
    test('Schedule Audit & Queries never get hijacked into task creation (including on Android with SLM ready)', async () => {
      Platform.OS = 'android';
      await downloadQwenModel();
      const extractSpy = jest
        .spyOn(NativeModules.LafinaIntentExtractor, 'extractIntent')
        .mockResolvedValue(
          JSON.stringify({
            intent: 'create_task',
            title: 'What Is My Schedule',
            date: null,
            time: null,
            category: 'Academic',
          }),
        );

      const schedulePrompts = [
        'What is my schedule for today',
        'What is my schedule today',
        'Whats my schedule for today',
        'Tell me my schedule for today',
        'Audit my schedule for today',
        'Give me a schedule audit for today',
        'Schedule audit today',
        'What am I doing today',
        'What time blocks do I have today',
        'What tasks are due today',
        'Am I free today',
        'Can you check my schedule for tomorrow',
      ];

      for (const prompt of schedulePrompts) {
        const extracted = await intentService.extractIntent(prompt, { referenceDate: fixedDate });
        expect(extracted.intent).toBe('query_schedule');
        expect(extracted.source).toBe('fast_path');
      }

      // SLM should never have been called for schedule queries
      expect(extractSpy).not.toHaveBeenCalled();
      extractSpy.mockRestore();
      await deleteQwenModel();
    });

    test('parses compact/noisy STT time transcriptions (730AM, 1030pm, 7.30a.m., 7 30 a m, seven thirty, homophones) with exact dueTime instead of All-Day', async () => {
      // 1. Direct user case: "730AM" without colon
      const wakeUp = parseIntentFastPath('Wake up at 730AM', fixedDate);
      expect(wakeUp.intent).toBe('create_task');
      expect(wakeUp.time).toBe('07:30');
      expect(wakeUp.title).toBe('Wake up');

      const task730 = parseIntentFastPath('Create a task at 730AM for morning exercise', fixedDate);
      expect(task730.intent).toBe('create_task');
      expect(task730.time).toBe('07:30');
      expect(task730.title).toBe('Morning exercise');

      // 2. 4-digit compact time ("1030pm", "1230pm", "1230am")
      expect(parseDateAndTime('sleep at 1030pm', fixedDate).time).toBe('22:30');
      expect(parseDateAndTime('lunch at 1230pm', fixedDate).time).toBe('12:30');
      expect(parseDateAndTime('late study at 1230am', fixedDate).time).toBe('00:30');

      // 3. Compact time range ("from 730AM to 930AM", "from 730 to 930")
      const rangeCompact = parseIntentFastPath(
        'Create a time block from 730AM to 930AM for Algorithms coding',
        fixedDate,
      );
      expect(rangeCompact.intent).toBe('create_time_block');
      expect(rangeCompact.time).toBe('07:30');
      expect(rangeCompact.endTime).toBe('09:30');
      expect(rangeCompact.durationMinutes).toBe(120);
      expect(rangeCompact.title).toBe('Algorithms coding');

      const bareRangeCompact = parseDateAndTime('from 730 to 930', fixedDate);
      expect(bareRangeCompact.time).toBe('07:30');
      expect(bareRangeCompact.endTime).toBe('09:30');

      // 4. Attached dotted meridiems ("7:30a.m.", "730a.m.", "9p.m.") and spaced ("7:30 a m", "7 30 a m")
      expect(parseDateAndTime('at 7:30a.m.', fixedDate).time).toBe('07:30');
      expect(parseDateAndTime('at 730a.m.', fixedDate).time).toBe('07:30');
      expect(parseDateAndTime('at 9p.m.', fixedDate).time).toBe('21:00');
      expect(parseDateAndTime('at 7:30 a m', fixedDate).time).toBe('07:30');
      expect(parseDateAndTime('at 7 30 am', fixedDate).time).toBe('07:30');
      expect(parseDateAndTime('at 7.30 am', fixedDate).time).toBe('07:30');
      expect(parseDateAndTime('at 7.30', fixedDate).time).toBe('07:30');
      expect(parseDateAndTime('at 730', fixedDate).time).toBe('07:30');

      // 5. Spoken minutes and "oh" minutes ("at seven thirty", "7 oh 5 am", "7 o 5 am")
      expect(parseDateAndTime('at seven thirty', fixedDate).time).toBe('07:30');
      expect(parseDateAndTime('at seven thirty pm', fixedDate).time).toBe('19:30');
      expect(parseDateAndTime('at 7 oh 5 am', fixedDate).time).toBe('07:05');
      expect(parseDateAndTime('at seven o five am', fixedDate).time).toBe('07:05');

      // 6. Whisper homophones before am/pm ("at to pm", "at too pm", "at for pm", "at ate am")
      expect(parseDateAndTime('meeting at to pm', fixedDate).time).toBe('14:00');
      expect(parseDateAndTime('meeting at too pm', fixedDate).time).toBe('14:00');
      expect(parseDateAndTime('meeting at for pm', fixedDate).time).toBe('16:00');
      expect(parseDateAndTime('meeting at ate am', fixedDate).time).toBe('08:00');

      // 7. Period-of-day fallback so tasks with "this afternoon" / "tonight" get a timeline slot instead of All-Day
      const afternoonTask = parseIntentFastPath('Create a task this afternoon to email professor', fixedDate);
      expect(afternoonTask.intent).toBe('create_task');
      expect(afternoonTask.time).toBe('14:00');
      expect(afternoonTask.title).toBe('Email professor');
    });

    test('parses Create/Add Time Block, Create/Add Task, and Create/Add Note commands reliably', () => {
      // Create / Add Note variations
      const createNote = parseIntentFastPath('Create a note about operating systems deadlock conditions', fixedDate);
      expect(createNote.intent).toBe('create_note');
      expect(createNote.title).toBe('Operating systems deadlock conditions');

      const addNote = parseIntentFastPath('Add a note that the quiz is moved to next Monday at 9am', fixedDate);
      expect(addNote.intent).toBe('create_note');
      expect(addNote.title).toBe('The quiz is moved to next Monday at 9am');

      const titledNote = parseIntentFastPath(
        'Create a note titled Biology Chapter 3 that mitochondria is the powerhouse of the cell',
        fixedDate,
      );
      expect(titledNote.intent).toBe('create_note');
      expect(titledNote.title).toBe('Biology Chapter 3');
      expect(titledNote.details).toBe('Mitochondria is the powerhouse of the cell');

      // Create / Add Task variations
      const createTask = parseIntentFastPath('Create a new task called Submit Thesis Form tomorrow at 730AM', fixedDate);
      expect(createTask.intent).toBe('create_task');
      expect(createTask.title).toBe('Submit Thesis Form');
      expect(createTask.date).toBe('2026-10-28');
      expect(createTask.time).toBe('07:30');

      // Create / Add Time Block variations
      const addTimeBlock = parseIntentFastPath(
        'Add a new time block for Backend Architecture from 1pm to 330pm',
        fixedDate,
      );
      expect(addTimeBlock.intent).toBe('create_time_block');
      expect(addTimeBlock.title).toBe('Backend Architecture');
      expect(addTimeBlock.time).toBe('13:00');
      expect(addTimeBlock.endTime).toBe('15:30');

      // Explicit Note commands vs Chat queries
      const saveAsNote = parseIntentFastPath('Save this as a note that bring index cards to exam', fixedDate);
      expect(saveAsNote.intent).toBe('create_note');
      expect(saveAsNote.title).toBe('Bring index cards to exam');

      const toNote = parseIntentFastPath('To note that lab safety rules require goggles', fixedDate);
      expect(toNote.intent).toBe('create_note');
      expect(toNote.title).toBe('Lab safety rules require goggles');

      const colonNote = parseIntentFastPath('Take a note: Bring index cards to exam', fixedDate);
      expect(colonNote.intent).toBe('create_note');
      expect(colonNote.title).toBe('Voice Note');
      expect(colonNote.details).toBe('Bring index cards to exam');

      const whatAreYou = parseIntentFastPath('What are you', fixedDate);
      expect(whatAreYou.intent).toBe('chat');

      const whoAreYou = parseIntentFastPath('Who are you', fixedDate);
      expect(whoAreYou.intent).toBe('chat');

      const whatCanYouDo = parseIntentFastPath('What can you do', fixedDate);
      expect(whatCanYouDo.intent).toBe('chat');
    });

    test('executes full CRUD commands (Update, Rename, Complete, Cancel/Remove/Delete) for Time Blocks, Tasks, and Notes', async () => {
      const crudUser = 'test-student-crud-phase07';

      // --- 1. TIME BLOCK CRUD ---
      const createTb = await intentService.processAndExecuteIntent(
        crudUser,
        'Create a time block from 9am to 11am for Deep Coding',
        { referenceDate: fixedDate },
      );
      expect(createTb.success).toBe(true);
      expect(createTb.intent).toBe('create_time_block');

      // Update time block schedule
      const updateTb = await intentService.processAndExecuteIntent(
        crudUser,
        'Update time block Deep Coding to 1pm to 3pm',
        { referenceDate: fixedDate },
      );
      expect(updateTb.success).toBe(true);
      expect(updateTb.intent).toBe('update_time_block');
      let blocks = timeBlocksStore.getAll(crudUser);
      expect(blocks[0].startTime).toBe('13:00');
      expect(blocks[0].endTime).toBe('15:00');

      // Rename time block
      const renameTb = await intentService.processAndExecuteIntent(
        crudUser,
        'Rename time block Deep Coding to System Design Session',
        { referenceDate: fixedDate },
      );
      expect(renameTb.success).toBe(true);
      blocks = timeBlocksStore.getAll(crudUser);
      expect(blocks[0].title).toBe('System Design Session');

      // Cancel / Remove time block
      const deleteTb = await intentService.processAndExecuteIntent(
        crudUser,
        'Cancel my System Design Session time block',
        { referenceDate: fixedDate },
      );
      expect(deleteTb.success).toBe(true);
      expect(deleteTb.intent).toBe('delete_time_block');
      expect(timeBlocksStore.getAll(crudUser)).toHaveLength(0);

      // --- 2. TASK CRUD ---
      const createT = await intentService.processAndExecuteIntent(
        crudUser,
        'Create a task at 730AM for Calculus Problem Set',
        { referenceDate: fixedDate },
      );
      expect(createT.success).toBe(true);
      expect(createT.intent).toBe('create_task');
      let tasks = tasksStore.getAllTasks(crudUser);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].dueTime).toBe('07:30');

      // Update task time
      const updateT = await intentService.processAndExecuteIntent(
        crudUser,
        'Update task Calculus Problem Set to 430PM',
        { referenceDate: fixedDate },
      );
      expect(updateT.success).toBe(true);
      expect(updateT.intent).toBe('update_task');
      tasks = tasksStore.getAllTasks(crudUser);
      expect(tasks[0].dueTime).toBe('16:30');

      // Mark task as completed
      const completeT = await intentService.processAndExecuteIntent(
        crudUser,
        'Mark task Calculus Problem Set as done',
        { referenceDate: fixedDate },
      );
      expect(completeT.success).toBe(true);
      tasks = tasksStore.getAllTasks(crudUser);
      expect(tasks[0].isCompleted).toBe(true);

      // Delete / Remove task
      const deleteT = await intentService.processAndExecuteIntent(
        crudUser,
        'Remove task Calculus Problem Set',
        { referenceDate: fixedDate },
      );
      expect(deleteT.success).toBe(true);
      expect(deleteT.intent).toBe('delete_task');
      expect(tasksStore.getAllTasks(crudUser)).toHaveLength(0);

      // --- 3. NOTE CRUD ---
      const createN = await intentService.processAndExecuteIntent(
        crudUser,
        'Create a note titled Lab Checklist that bring oscilloscope probes',
        { referenceDate: fixedDate },
      );
      expect(createN.success).toBe(true);
      expect(createN.intent).toBe('create_note');
      let notes = notesStore.getAll(crudUser);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Lab Checklist');
      expect(notes[0].body).toBe('Bring oscilloscope probes');

      // Append to note
      const appendN = await intentService.processAndExecuteIntent(
        crudUser,
        'Append to note Lab Checklist: bring safety goggles',
        { referenceDate: fixedDate },
      );
      expect(appendN.success).toBe(true);
      expect(appendN.intent).toBe('update_note');
      notes = notesStore.getAll(crudUser);
      expect(notes[0].body).toContain('Bring oscilloscope probes');
      expect(notes[0].body).toContain('Bring safety goggles');

      // Update note body
      const editN = await intentService.processAndExecuteIntent(
        crudUser,
        'Update note Lab Checklist to bring multimeter and jumper wires',
        { referenceDate: fixedDate },
      );
      expect(editN.success).toBe(true);
      notes = notesStore.getAll(crudUser);
      expect(notes[0].body).toBe('Bring multimeter and jumper wires');

      // Delete note
      const deleteN = await intentService.processAndExecuteIntent(
        crudUser,
        'Delete note Lab Checklist',
        { referenceDate: fixedDate },
      );
      expect(deleteN.success).toBe(true);
      expect(deleteN.intent).toBe('delete_note');
      expect(notesStore.getAll(crudUser)).toHaveLength(0);
    });

    test('distills clean titles from conversational scheduling prompts and cancels/deletes tasks, events, and time blocks by name or time', async () => {
      const cancelUser = 'test-student-cancel-hardening';

      // 1. Conversational prompt from screenshot: "So let's schedule at 2 PM for a coffee date."
      const coffeeCreate = await intentService.processAndExecuteIntent(
        cancelUser,
        "So let's schedule at 2 PM for a coffee date.",
        { referenceDate: fixedDate },
      );
      expect(coffeeCreate.success).toBe(true);
      expect(coffeeCreate.intent).toBe('create_task');
      expect(coffeeCreate.reply).toContain('"Coffee Date"');
      let tasks = tasksStore.getAllTasks(cancelUser);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Coffee Date');
      expect(tasks[0].dueTime).toBe('14:00');

      // 2. Cancel task by time ("Cancel what I have at 2 PM")
      const cancelByTime = await intentService.processAndExecuteIntent(
        cancelUser,
        'Cancel what I have at 2 PM',
        { referenceDate: fixedDate },
      );
      expect(cancelByTime.success).toBe(true);
      expect(tasksStore.getAllTasks(cancelUser)).toHaveLength(0);

      // 3. Legacy noisy task titles ("Schedule ." at 1:00 PM and "Schedule for a Coffee Date." at 2:00 PM)
      tasksStore.insertTask({
        id: 'legacy-schedule-dot',
        userId: cancelUser,
        title: 'Schedule .',
        dueDate: '2026-10-27',
        dueTime: '13:00',
        isCompleted: false,
        priority: 'Medium',
        category: 'Personal',
      });
      tasksStore.insertTask({
        id: 'legacy-coffee-dot',
        userId: cancelUser,
        title: 'Schedule for a Coffee Date.',
        dueDate: '2026-10-27',
        dueTime: '14:00',
        isCompleted: false,
        priority: 'Medium',
        category: 'Personal',
      });

      // Delete the 1 PM legacy task by time ("Delete my 1 PM schedule")
      const delete1Pm = await intentService.processAndExecuteIntent(
        cancelUser,
        'Delete my 1 PM schedule',
        { referenceDate: fixedDate },
      );
      expect(delete1Pm.success).toBe(true);
      expect(tasksStore.getAllTasks(cancelUser).map((t) => t.id)).toEqual(['legacy-coffee-dot']);

      // Cancel the 2 PM legacy task by name ("I want to cancel the coffee date")
      const cancelCoffee = await intentService.processAndExecuteIntent(
        cancelUser,
        'I want to cancel the coffee date',
        { referenceDate: fixedDate },
      );
      expect(cancelCoffee.success).toBe(true);
      expect(tasksStore.getAllTasks(cancelUser)).toHaveLength(0);

      // 4. Cancel / Delete calendar events by name and by time
      tasksStore.insertEvent({
        id: 'ev-cancel-1',
        userId: cancelUser,
        title: 'Department Assembly',
        date: '2026-10-27',
        startTime: '10:00',
        endTime: '11:30',
      });
      tasksStore.insertEvent({
        id: 'ev-cancel-2',
        userId: cancelUser,
        title: 'Thesis Panel Defense',
        date: '2026-10-27',
        startTime: '15:00',
        endTime: '16:30',
      });

      const cancelEvByName = await intentService.processAndExecuteIntent(
        cancelUser,
        'Cancel event Department Assembly',
        { referenceDate: fixedDate },
      );
      expect(cancelEvByName.success).toBe(true);
      expect(cancelEvByName.entityType).toBe('event');
      expect(tasksStore.getAllEvents(cancelUser).map((e) => e.id)).toEqual(['ev-cancel-2']);

      const deleteEvByTime = await intentService.processAndExecuteIntent(
        cancelUser,
        'Delete my 3 PM event',
        { referenceDate: fixedDate },
      );
      expect(deleteEvByTime.success).toBe(true);
      expect(deleteEvByTime.entityType).toBe('event');
      expect(tasksStore.getAllEvents(cancelUser)).toHaveLength(0);

      // 5. Cancel / Delete time block by start time and by recent reference ("Cancel that")
      await intentService.processAndExecuteIntent(
        cancelUser,
        'Create a time block from 4pm to 6pm for Capstone Debugging',
        { referenceDate: fixedDate },
      );
      expect(timeBlocksStore.getAll(cancelUser)).toHaveLength(1);

      const deleteTbByTime = await intentService.processAndExecuteIntent(
        cancelUser,
        'Delete my 4 PM time block',
        { referenceDate: fixedDate },
      );
      expect(deleteTbByTime.success).toBe(true);
      expect(timeBlocksStore.getAll(cancelUser)).toHaveLength(0);

      await intentService.processAndExecuteIntent(
        cancelUser,
        'Add task at 5 PM for Laundry',
        { referenceDate: fixedDate },
      );
      expect(tasksStore.getAllTasks(cancelUser)).toHaveLength(1);

      const cancelRecent = await intentService.processAndExecuteIntent(
        cancelUser,
        'Cancel that',
        { referenceDate: fixedDate },
      );
      expect(cancelRecent.success).toBe(true);
      expect(tasksStore.getAllTasks(cancelUser)).toHaveLength(0);
    });
  });

  describe('Student Assistant Evaluation Scenario Audit & Verification', () => {
    const studentUser = 'scenario-audit-student';
    // Monday, Nov 2, 2026, 09:00:00
    const fixedRefMonday = new Date(2026, 10, 2, 9, 0, 0);

    beforeEach(async () => {
      await initDatabase();
      tasksStore.getAllTasks(studentUser).forEach((t) => tasksStore.deleteTask(t.id));
      tasksStore.getAllEvents(studentUser).forEach((e) => tasksStore.deleteEvent(e.id));
      timeBlocksStore.getAll(studentUser).forEach((b) => timeBlocksStore.delete(b.id));
      remindersStore.getAllReminders(studentUser).forEach((r) => remindersStore.deleteReminder(r.id));
    });

    it('Scenario 1: Simple reminder — "Create a reminder for your Software Engineering final exam this Friday at 2 PM."', async () => {
      const transcript = 'Create a reminder for your Software Engineering final exam this Friday at 2 PM.';
      const parsed = parseIntentFastPath(transcript, fixedRefMonday);
      expect(parsed.intent).toBe('create_reminder');
      expect(parsed.title?.toLowerCase()).toContain('software engineering final exam');
      expect(parsed.date).toBe('2026-11-06'); // Friday
      expect(parsed.time).toBe('14:00'); // 2 PM

      const result = await intentService.processAndExecuteIntent(studentUser, transcript, {
        referenceDate: fixedRefMonday,
      });
      expect(result.success).toBe(true);
      expect(result.entityType).toBe('reminder');

      const reminders = remindersStore.getPendingReminders(studentUser);
      expect(reminders).toHaveLength(1);
      expect(reminders[0].task.toLowerCase()).toContain('software engineering final exam');
      expect(new Date(reminders[0].scheduledAt).getTime()).toBe(new Date('2026-11-06T14:00:00').getTime());

      const tasks = tasksStore.getAllTasks(studentUser);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].dueDate).toBe('2026-11-06');
      expect(tasks[0].dueTime).toBe('14:00');
    });

    it('Scenario 2: Recurring reminder — "Create a reminder that repeats every Monday for your 8 AM class."', async () => {
      const transcript = 'Create a reminder that repeats every Monday for your 8 AM class.';
      const parsed = parseIntentFastPath(transcript, fixedRefMonday);
      expect(parsed.intent).toBe('create_reminder');
      expect(parsed.recurrenceRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO');
      expect(parsed.time).toBe('08:00');
      expect(parsed.date).toBe('2026-11-09'); // Next Monday

      const result = await intentService.processAndExecuteIntent(studentUser, transcript, {
        referenceDate: fixedRefMonday,
      });
      expect(result.success).toBe(true);
      expect(result.reply).toContain('repeating every Monday');

      const reminders = remindersStore.getPendingReminders(studentUser);
      expect(reminders).toHaveLength(1);
      expect(reminders[0].description).toContain('[RRULE:RRULE:FREQ=WEEKLY;BYDAY=MO]');

      // Acknowledging the recurring reminder automatically creates and schedules the subsequent Monday occurrence
      const firstReminderId = reminders[0].id;
      const ackResult = await acknowledgeReminderAction(firstReminderId, studentUser);
      expect(ackResult.ok).toBe(true);

      const updatedFirst = remindersStore.getReminderById(firstReminderId);
      expect(updatedFirst?.status).toBe('acknowledged');

      const pendingAfterAck = remindersStore.getPendingReminders(studentUser);
      expect(pendingAfterAck).toHaveLength(1);
      expect(pendingAfterAck[0].id).not.toBe(firstReminderId);
      expect(new Date(pendingAfterAck[0].scheduledAt).getTime()).toBe(new Date('2026-11-16T08:00:00').getTime()); // Second Monday
    });

    it('Scenario 3: View queue — "Ask LAFINA to show you everything scheduled this week."', async () => {
      const fixedRefWed = new Date(2026, 10, 4, 10, 0, 0); // Wed Nov 4, 2026

      // Prepopulate items during this week (Mon Nov 2 - Sun Nov 8)
      tasksStore.insertTask({
        id: 'task-mon-1',
        userId: studentUser,
        title: 'Algorithms Homework',
        dueDate: '2026-11-02',
        dueTime: '09:00',
        isCompleted: false,
        priority: 'High',
        category: 'Academic',
      });
      tasksStore.insertEvent({
        id: 'event-wed-1',
        userId: studentUser,
        title: 'Database Systems Lecture',
        date: '2026-11-04',
        startTime: '13:00',
        endTime: '15:00',
      });
      timeBlocksStore.insert({
        id: 'block-fri-1',
        userId: studentUser,
        title: 'Capstone Focus Session',
        date: '2026-11-06',
        startTime: '16:00',
        endTime: '18:00',
        color: '#3498DB',
        category: 'Academic',
      });

      const transcript = 'Ask LAFINA to show you everything scheduled this week.';
      const parsed = parseIntentFastPath(transcript, fixedRefWed);
      expect(parsed.intent).toBe('query_schedule');
      expect(parsed.dateRange).toBe('this_week');

      const result = await intentService.processAndExecuteIntent(studentUser, transcript, {
        referenceDate: fixedRefWed,
      });
      expect(result.success).toBe(true);
      expect(result.reply).toContain('This week you have');
      expect(result.reply).toContain('On Monday: Algorithms Homework at 9:00 AM.');
      expect(result.reply).toContain('On Wednesday: Database Systems Lecture from 1:00 PM to 3:00 PM.');
      expect(result.reply).toContain('On Friday: Capstone Focus Session from 4:00 PM to 6:00 PM.');
    });

    it('Scenario 6: Cancel — "Cancel the recurring 8 AM reminder you created earlier."', async () => {
      // First create the recurring 8 AM reminder
      await intentService.processAndExecuteIntent(
        studentUser,
        'Create a reminder that repeats every Monday for your 8 AM class.',
        { referenceDate: fixedRefMonday },
      );
      expect(remindersStore.getPendingReminders(studentUser)).toHaveLength(1);

      const cancelTranscript = 'Cancel the recurring 8 AM reminder you created earlier.';
      const parsed = parseIntentFastPath(cancelTranscript, fixedRefMonday);
      expect(parsed.intent).toBe('delete_task');
      expect(parsed.targetEntityType).toBe('reminder');
      expect(parsed.targetTime).toBe('08:00');

      const result = await intentService.processAndExecuteIntent(studentUser, cancelTranscript, {
        referenceDate: fixedRefMonday,
      });
      expect(result.success).toBe(true);
      expect(result.entityType).toBe('reminder');
      expect(result.reply).toContain('Cancelled reminder');
      expect(remindersStore.getPendingReminders(studentUser)).toHaveLength(0);
    });

    it('Scenario 8: Ambiguous date — "Create a reminder for your project deadline next week."', async () => {
      const transcript = 'Create a reminder for your project deadline next week.';
      const parsed = parseIntentFastPath(transcript, fixedRefMonday);
      expect(parsed.intent).toBe('create_reminder');
      expect(parsed.date).toBe('2026-11-09'); // Resolves to Monday of next week
      expect(parsed.title?.toLowerCase()).toBe('project deadline');

      const result = await intentService.processAndExecuteIntent(studentUser, transcript, {
        referenceDate: fixedRefMonday,
      });
      expect(result.success).toBe(true);
      expect(result.entityType).toBe('reminder');
      const reminders = remindersStore.getPendingReminders(studentUser);
      expect(reminders).toHaveLength(1);
      expect(new Date(reminders[0].scheduledAt).getTime()).toBe(new Date('2026-11-09T09:00:00').getTime());
      expect(reminders[0].task).toBe('Project deadline');
    });
  });
});
