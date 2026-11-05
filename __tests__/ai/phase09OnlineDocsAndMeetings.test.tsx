import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { MeetingsProvider } from '../../src/ui/contexts/MeetingsContext';
import { ChatScreen } from '../../src/ui/screens/ChatScreen';
import { MeetingsScreen } from '../../src/ui/screens/meetings';
import {
  initDatabase,
  userStore,
  chatStore,
  notesStore,
  tasksStore,
  recordedMeetingStore,
} from '../../src/storage';
import {
  chatOrchestrator,
  detectDocumentRequest,
  meetingRecorder,
  transcribeMeetingChunks,
} from '../../src/ai';
import {
  accountLinkService,
  cloudClient,
  requestMeetingSummary,
} from '../../src/cloud';

describe('Phase 09: Online Mode, Document Generation & Meeting Transcription', () => {
  const testUserId = 'local_guest_user';

  beforeEach(async () => {
    await initDatabase();
    userStore.createGuestUser();
    chatStore.clearHistory(testUserId);
    for (const n of notesStore.getAll(testUserId)) {
      notesStore.delete(n.id);
    }
    for (const t of tasksStore.getAllTasks(testUserId)) {
      tasksStore.deleteTask(t.id);
    }
    for (const m of recordedMeetingStore.list(testUserId)) {
      recordedMeetingStore.remove(m.id);
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('1. Online Mode & Cloud AI Chat Client', () => {
    it('uses POST /v1/ai/chat when Online Mode is active and attaches handbook citations', async () => {
      const requestSpy = jest
        .spyOn(cloudClient, 'request')
        .mockResolvedValueOnce({
          status: 'success',
          data: {
            reply:
              'According to the USTP Student Handbook, the minimum passing grade is 3.0.',
            used_handbook: true,
            sources: [
              {
                title: 'USTP Student Handbook',
                section: 'Grading System',
                page: 42,
              },
            ],
          },
        });

      const res = await chatOrchestrator.processMessage(
        testUserId,
        'What is the passing grade policy at USTP?',
        {
          onlineMode: true,
          useHandbook: true,
        },
      );

      expect(requestSpy).toHaveBeenCalledWith(
        '/v1/ai/chat',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"use_handbook":true'),
        }),
        true,
      );
      expect(res.usedOnline).toBe(true);
      expect(res.reply).toContain('minimum passing grade is 3.0');
      expect(res.handbookNote).toBe('Referenced USTP Student Handbook (p. 42)');
    });

    it('falls back seamlessly to offline local assistant when cloud chat fails or is offline', async () => {
      jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
        status: 'offline',
        error: 'Network request failed',
      });

      const res = await chatOrchestrator.processMessage(
        testUserId,
        'Who are you?',
        {
          onlineMode: true,
        },
      );

      expect(res.usedOnline).toBe(false);
      expect(res.reply).toContain(
        'I am lafina, your offline academic assistant',
      );
    });
  });

  describe('2. Online Document Generation (PDF, Excel, Docx, PPTX)', () => {
    it('detects natural-language PDF, Word, Excel, and PowerPoint requests without misclassifying reminders', () => {
      expect(
        detectDocumentRequest('Create a PDF study guide for Operating Systems'),
      ).toEqual({
        format: 'pdf',
        prompt: 'Create a PDF study guide for Operating Systems',
      });
      expect(
        detectDocumentRequest('Generate a Word document for my thesis outline'),
      )?.toMatchObject({ format: 'docx' });
      expect(
        detectDocumentRequest('Make an Excel spreadsheet of my weekly budget'),
      )?.toMatchObject({ format: 'xlsx' });
      expect(
        detectDocumentRequest(
          'Build a PowerPoint slide deck on CPU scheduling',
        ),
      )?.toMatchObject({ format: 'pptx' });

      // Scheduling command mentioning PDF must NOT be intercepted as document generation
      expect(
        detectDocumentRequest(
          'Remind me tomorrow at 9am to submit the PDF report',
        ),
      ).toBeNull();
    });

    it('generates, decodes, saves base64 document via RNFS, and persists attachment in chatStore', async () => {
      jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
        status: 'success',
        data: {
          format: 'pdf',
          file_name: 'os_study_guide.pdf',
          mime_type: 'application/pdf',
          content_base64: 'JVBERi0xLjQK',
          title: 'OS Study Guide',
          summary: 'Created your Operating Systems PDF study guide.',
        },
      });

      const result = await chatOrchestrator.processMessage(
        testUserId,
        'Create a PDF study guide for Operating Systems',
        { onlineMode: true },
      );

      expect(RNFS.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('os_study_guide.pdf'),
        'JVBERi0xLjQK',
        'base64',
      );
      expect(result.attachment).not.toBeNull();
      expect(result.attachment?.format).toBe('pdf');
      expect(result.attachment?.fileName).toBe('os_study_guide.pdf');
      expect(result.reply).toBe(
        'Created your Operating Systems PDF study guide.',
      );

      const stored = chatStore.getMessages(testUserId);
      const lastMsg = stored[stored.length - 1];
      expect(lastMsg.attachment?.fileName).toBe('os_study_guide.pdf');
    });

    it('informs the user when trying to generate a document while in Offline Mode', async () => {
      const result = await chatOrchestrator.processMessage(
        testUserId,
        'Generate an Excel spreadsheet for my grades',
        { onlineMode: false },
      );

      expect(result.attachment).toBeNull();
      expect(result.reply).toContain('requires Online Mode');
    });

    it('renders attachment card in ChatScreen and opens share sheet when tapped', async () => {
      jest
        .spyOn(accountLinkService, 'authorizeOnlineMode')
        .mockResolvedValue({
          status: 'success',
          message: 'Online mode ready.',
        });
      jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
        status: 'success',
        data: {
          format: 'docx',
          file_name: 'thesis_draft.docx',
          mime_type:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          content_base64: 'UEsDBBQAAAAIA==',
          title: 'Thesis Draft',
          summary: 'Generated Thesis Draft (Word).',
        },
      });
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      const { getByTestId, findByTestId } = render(
        <ThemeProvider userId={testUserId}>
          <MeetingsProvider userId={testUserId}>
            <ChatScreen userId={testUserId} />
          </MeetingsProvider>
        </ThemeProvider>,
      );

      fireEvent.press(getByTestId('chat-online-toggle-button'));
      await waitFor(() => {
        expect(accountLinkService.authorizeOnlineMode).toHaveBeenCalledWith(
          testUserId,
        );
      });

      const input = getByTestId('chat-text-input');
      fireEvent.changeText(
        input,
        'Create a Word document for my thesis outline',
      );
      fireEvent.press(getByTestId('chat-send-button'));

      const card = await findByTestId('chat-attachment-card');
      expect(card).toBeTruthy();

      fireEvent.press(card);
      await waitFor(() => {
        expect(Share.open).toHaveBeenCalledWith(
          expect.objectContaining({
            filename: 'thesis_draft.docx',
          }),
        );
      });
    });
  });

  describe('3. Meeting & Lecture Transcription & Storage Cleanup', () => {
    it('transcribes multi-segment chunks with timestamp alignment and automatically deletes raw audio chunks', async () => {
      const transcribeSpy = jest
        .spyOn(meetingRecorder, 'transcribeChunk')
        .mockImplementation(async (_path, offsetMs) => [
          {
            start_ms: offsetMs + 500,
            end_ms: offsetMs + 4000,
            text:
              offsetMs === 0
                ? 'First lecture segment.'
                : 'Second lecture segment.',
          },
        ]);
      const deleteSpy = jest
        .spyOn(meetingRecorder, 'deleteAudioFile')
        .mockResolvedValue(true);

      const progress = await transcribeMeetingChunks({
        meetingId: 'lecture_101',
        chunkFiles: ['/tmp/chunk_0000.wav', '/tmp/chunk_0001.wav'],
        chunkDurationsMs: [30000, 30000],
      });

      expect(transcribeSpy).toHaveBeenCalledTimes(2);
      expect(progress.segments).toEqual([
        {
          start_ms: 500,
          end_ms: 4000,
          text: 'First lecture segment.',
        },
        {
          start_ms: 30500,
          end_ms: 34000,
          text: 'Second lecture segment.',
        },
      ]);
      expect(progress.fullTranscript).toBe(
        'First lecture segment. Second lecture segment.',
      );
      // Verify automatic storage cleanup of raw audio chunks post-transcription
      expect(deleteSpy).toHaveBeenCalledTimes(2);
      expect(deleteSpy).toHaveBeenCalledWith('/tmp/chunk_0000.wav');
      expect(deleteSpy).toHaveBeenCalledWith('/tmp/chunk_0001.wav');
    });

    it('preserves raw audio chunks when keepAudio: true is explicitly requested', async () => {
      jest.spyOn(meetingRecorder, 'transcribeChunk').mockResolvedValue([
        { start_ms: 0, end_ms: 2000, text: 'Saved audio lecture.' },
      ]);
      const deleteSpy = jest
        .spyOn(meetingRecorder, 'deleteAudioFile')
        .mockResolvedValue(true);

      await transcribeMeetingChunks({
        meetingId: 'lecture_keep',
        chunkFiles: ['/tmp/chunk_0000.wav'],
        keepAudio: true,
      });

      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('enforces explicit user consent for requestMeetingSummary and extracts action items', async () => {
      const denied = await requestMeetingSummary({
        title: 'Algorithms Lecture',
        consentGiven: false,
        segments: [
          { start_ms: 0, end_ms: 5000, text: 'Homework 3 is due Friday.' },
        ],
      });
      expect(denied.status).toBe('validation_error');

      jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
        status: 'success',
        data: {
          id: 'sum_1',
          title: 'Algorithms Lecture',
          summary: 'Covered dynamic programming and Homework 3.',
          decisions: ['Use memoization table for Problem 2'],
          action_items: [
            {
              title: 'Submit Homework 3',
              assignee: 'Student',
              due_date: '2026-11-10',
              priority: 'high',
            },
          ],
          created_at: new Date().toISOString(),
        },
      });

      const allowed = await requestMeetingSummary({
        title: 'Algorithms Lecture',
        consentGiven: true,
        segments: [
          { start_ms: 0, end_ms: 5000, text: 'Homework 3 is due Friday.' },
        ],
      });

      expect(allowed.status).toBe('success');
      expect(allowed.data?.summary).toContain('dynamic programming');
      expect(allowed.data?.actionItems).toHaveLength(1);
      expect(allowed.data?.actionItems[0]).toMatchObject({
        title: 'Submit Homework 3',
        priority: 'High',
      });
    });

    it('renders MeetingsScreen, opens a transcribed lecture, and saves notes & action items to SQLite stores', async () => {
      recordedMeetingStore.create({
        id: 'mtg_test_1',
        userId: testUserId,
        title: 'Software Engineering Lecture',
      });
      recordedMeetingStore.update('mtg_test_1', {
        status: 'completed',
        durationSeconds: 120,
        transcript: [
          {
            startMs: 0,
            endMs: 4000,
            text: 'Complete the sprint backlog before Wednesday.',
          },
        ],
        notes: {
          title: 'Software Engineering Lecture',
          summary: 'Reviewed agile sprint planning.',
          key_topics: [
            { topic: 'Sprint Backlog', discussion: 'Prioritize user stories.' },
          ],
          decisions: ['Freeze scope by Tuesday'],
          action_items: [
            {
              task: 'Complete sprint backlog',
              assignee: 'Student',
              deadline: 'Wednesday',
              status: 'pending',
            },
          ],
          important_dates: [],
          issues: [],
          unresolved_questions: [],
          key_points: [],
        },
      });

      const { getByTestId, findByTestId } = render(
        <ThemeProvider userId={testUserId}>
          <MeetingsProvider userId={testUserId}>
            <MeetingsScreen onBack={jest.fn()} />
          </MeetingsProvider>
        </ThemeProvider>,
      );

      const row = await findByTestId('meeting-row-mtg_test_1');
      fireEvent.press(row);

      const saveNotesBtn = await findByTestId('meeting-action-save');
      fireEvent.press(saveNotesBtn);

      const savedNotes = notesStore.getAll(testUserId);
      expect(savedNotes).toHaveLength(1);
      expect(savedNotes[0].title).toBe('Software Engineering Lecture');
      expect(savedNotes[0].body).toContain('Reviewed agile sprint planning.');

      const saveTasksBtn = getByTestId('meeting-action-save-tasks');
      fireEvent.press(saveTasksBtn);

      const savedTasks = tasksStore.getAllTasks(testUserId);
      expect(savedTasks).toHaveLength(1);
      expect(savedTasks[0].title).toBe('Complete sprint backlog');
    });

    it('imports an audio recording file from device, creates a meeting, and triggers transcription', async () => {
      const { pick } = require('@react-native-documents/picker');
      pick.mockResolvedValueOnce([
        {
          uri: 'content://media/external/audio/media/12345',
          name: 'Physics_Lecture_101.m4a',
          size: 1920000,
        },
      ]);

      const importSpy = jest
        .spyOn(meetingRecorder, 'importAudioFile')
        .mockResolvedValue({
          meetingId: 'mtg_mock_imported',
          durationSeconds: 30,
          audioBytes: 960044,
          chunkFiles: ['/data/meetings/mtg_mock_imported/chunk_000.wav'],
          chunkDurationsMs: [30000],
        });

      const { getByTestId } = render(
        <ThemeProvider userId={testUserId}>
          <MeetingsProvider userId={testUserId}>
            <MeetingsScreen onBack={jest.fn()} />
          </MeetingsProvider>
        </ThemeProvider>,
      );

      const importBtn = getByTestId('meeting-empty-import-btn');
      fireEvent.press(importBtn);

      await waitFor(() => {
        expect(importSpy).toHaveBeenCalledWith(
          'content://media/external/audio/media/12345',
          expect.any(String),
        );
      });

      await waitFor(() => {
        const list = recordedMeetingStore.list(testUserId);
        expect(list.length).toBeGreaterThan(0);
      });

      const meetings = recordedMeetingStore.list(testUserId);
      const importedMeeting = meetings.find((m) => m.source === 'upload');
      expect(importedMeeting).toBeDefined();
      expect(importedMeeting?.title).toBe('Physics_Lecture_101');
      expect(importedMeeting?.sourceFileName).toBe('Physics_Lecture_101.m4a');
    });
  });
});
