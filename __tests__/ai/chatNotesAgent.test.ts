import {initDatabase} from '../../src/storage/dbInit';
import {userStore} from '../../src/storage/userStore';
import {notesStore} from '../../src/storage/notesStore';
import {chatStore} from '../../src/storage/chatStore';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {executeNluAction} from '../../src/ai/nlu/actionExecutor';
import {generateId} from '../../src/utils';

describe('Chat Tab AI Agent - Notes Control & Query Integration', () => {
  const testUserId = 'test-student-notes-agent';
  const refDate = new Date('2026-11-11T12:00:00Z');

  beforeAll(() => {
    initDatabase();
    userStore.createGuestUser();
  });

  beforeEach(() => {
    chatStore.clearHistory(testUserId);
    // Clear existing notes for this user
    const existingNotes = notesStore.getAll(testUserId);
    for (const n of existingNotes) {
      notesStore.delete(n.id);
    }
    jest.clearAllMocks();
  });

  describe('1. Fast Path NLU Intent Parsing for Note Queries', () => {
    test('extracts query_notes for "check my notes about grocery list"', () => {
      const intent = parseIntentFastPath('check my notes about grocery list', refDate);
      expect(intent.intent).toBe('query_notes');
      expect(intent.details?.toLowerCase()).toBe('grocery list');
    });

    test('extracts query_notes for "check my grocery list note"', () => {
      const intent = parseIntentFastPath('check my grocery list note', refDate);
      expect(intent.intent).toBe('query_notes');
      expect(intent.details?.toLowerCase()).toBe('grocery list');
    });

    test('extracts query_notes for "what is in my grocery list note"', () => {
      const intent = parseIntentFastPath("what's in my grocery list note", refDate);
      expect(intent.intent).toBe('query_notes');
      expect(intent.details?.toLowerCase()).toBe('grocery list');
    });

    test('extracts query_notes for "find my note about physics exam"', () => {
      const intent = parseIntentFastPath('find my note about physics exam', refDate);
      expect(intent.intent).toBe('query_notes');
      expect(intent.details?.toLowerCase()).toBe('physics exam');
    });

    test('extracts query_notes for "search my notes for capstone project"', () => {
      const intent = parseIntentFastPath('search my notes for capstone project', refDate);
      expect(intent.intent).toBe('query_notes');
      expect(intent.details?.toLowerCase()).toBe('capstone project');
    });

    test('extracts query_notes without specific query for "check my notes"', () => {
      const intent = parseIntentFastPath('check my notes', refDate);
      expect(intent.intent).toBe('query_notes');
      expect(intent.details).toBeNull();
    });

    test('extracts query_notes without specific query for "show all my notes"', () => {
      const intent = parseIntentFastPath('show all my notes', refDate);
      expect(intent.intent).toBe('query_notes');
      expect(intent.details).toBeNull();
    });

    test('does not misclassify note creation as note query', () => {
      const intent = parseIntentFastPath('create a note: Grocery list: Milk, Bread', refDate);
      expect(intent.intent).toBe('create_note');
    });

    test('does not misclassify note deletion as note query', () => {
      const intent = parseIntentFastPath('delete note Grocery list', refDate);
      expect(intent.intent).toBe('delete_note');
    });
  });

  describe('2. ActionExecutor Note Retrieval & Formatting', () => {
    test('returns empty state message when user has no notes saved', async () => {
      const result = await executeNluAction(
        testUserId,
        {
          intent: 'query_notes',
          title: 'grocery list',
          details: 'grocery list',
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          category: 'Academic',
          snoozeMinutes: null,
          confidence: 1,
          source: 'fast_path',
          rawTranscript: 'check my notes about grocery list',
          isValid: true,
        },
        {referenceDate: refDate},
      );

      expect(result.success).toBe(true);
      expect(result.reply).toContain("You don't have any notes saved in your Notes tab yet");
    });

    test('finds matching note and outputs its title and body content', async () => {
      const noteId = generateId();
      notesStore.insert({
        id: noteId,
        userId: testUserId,
        title: 'Grocery list',
        body: '- Milk\n- Eggs\n- Sourdough Bread\n- Honey',
        category: 'Personal',
        isPinned: true,
        tags: ['shopping', 'personal'],
        isVoiceTranscribed: false,
      });

      const result = await executeNluAction(
        testUserId,
        {
          intent: 'query_notes',
          title: 'grocery list',
          details: 'grocery list',
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          category: 'Personal',
          snoozeMinutes: null,
          confidence: 1,
          source: 'fast_path',
          rawTranscript: 'check my notes about grocery list',
          isValid: true,
        },
        {referenceDate: refDate},
      );

      expect(result.success).toBe(true);
      expect(result.reply).toContain('Grocery list');
      expect(result.reply).toContain('Milk');
      expect(result.reply).toContain('Eggs');
      expect(result.reply).toContain('Sourdough Bread');
    });

    test('returns helpful message when notes exist but none match the search query', async () => {
      notesStore.insert({
        id: generateId(),
        userId: testUserId,
        title: 'Physics Chapter 4',
        body: 'Newtonian mechanics and circular motion',
        category: 'Academic',
        isPinned: false,
        tags: ['physics'],
        isVoiceTranscribed: false,
      });

      const result = await executeNluAction(
        testUserId,
        {
          intent: 'query_notes',
          title: 'grocery list',
          details: 'grocery list',
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          category: 'Academic',
          snoozeMinutes: null,
          confidence: 1,
          source: 'fast_path',
          rawTranscript: 'check my notes about grocery list',
          isValid: true,
        },
        {referenceDate: refDate},
      );

      expect(result.success).toBe(true);
      expect(result.reply).toContain('didn\'t find any notes matching "grocery list"');
      expect(result.reply).toContain('Would you like me to create a new note');
    });

    test('lists saved notes when query is empty', async () => {
      notesStore.insert({
        id: generateId(),
        userId: testUserId,
        title: 'Grocery list',
        body: 'Milk, Eggs',
        category: 'Personal',
        isPinned: true,
        tags: [],
        isVoiceTranscribed: false,
      });
      notesStore.insert({
        id: generateId(),
        userId: testUserId,
        title: 'Capstone Proposal',
        body: 'Offline Secretary System',
        category: 'Academic',
        isPinned: false,
        tags: [],
        isVoiceTranscribed: false,
      });

      const result = await executeNluAction(
        testUserId,
        {
          intent: 'query_notes',
          title: null,
          details: null,
          date: null,
          time: null,
          endTime: null,
          durationMinutes: null,
          category: 'Academic',
          snoozeMinutes: null,
          confidence: 1,
          source: 'fast_path',
          rawTranscript: 'check my notes',
          isValid: true,
        },
        {referenceDate: refDate},
      );

      expect(result.success).toBe(true);
      expect(result.reply).toContain('Grocery list');
      expect(result.reply).toContain('Capstone Proposal');
      expect(result.reply).toContain('saved notes in the Notes tab');
    });
  });

  describe('3. ChatOrchestrator End-to-End Chat Integration', () => {
    test('user asks "check my notes about grocery list" and receives note content in chat', async () => {
      // 1. Seed a note in SQLite Notes tab
      notesStore.insert({
        id: generateId(),
        userId: testUserId,
        title: 'Grocery list',
        body: '- Milk\n- Free-range Eggs\n- Whole wheat bread\n- Fuji Apples',
        category: 'Personal',
        isPinned: false,
        tags: ['shopping'],
        isVoiceTranscribed: false,
      });

      // 2. Process message in chat tab
      const outcome = await chatOrchestrator.processMessage(
        testUserId,
        'check my notes about grocery list',
        {referenceDate: refDate},
      );

      // 3. Verify user message is saved in chatStore
      expect(outcome.userMessage.content).toBe('check my notes about grocery list');

      // 4. Verify assistant reply in chat has the grocery list note content
      expect(outcome.reply).toContain('Grocery list');
      expect(outcome.reply).toContain('Milk');
      expect(outcome.reply).toContain('Free-range Eggs');
      expect(outcome.reply).toContain('Fuji Apples');

      // 5. Verify chatStore contains the messages
      const history = chatStore.getRecentMessages(testUserId, 10);
      expect(history.length).toBeGreaterThanOrEqual(2);
      const assistantMsg = history.find(m => m.sender === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.content).toContain('Grocery list');
    });
  });
});
