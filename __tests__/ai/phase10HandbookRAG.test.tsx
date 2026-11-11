import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';
import { MeetingsProvider } from '../../src/ui/contexts/MeetingsContext';
import { ChatScreen } from '../../src/ui/screens/ChatScreen';
import { ChatMessageItem } from '../../src/ui/components/chat/ChatMessageItem';
import {
  initDatabase,
  userStore,
  chatStore,
  localSettingsStore,
} from '../../src/storage';
import { chatOrchestrator } from '../../src/ai';
import { accountLinkService, cloudClient } from '../../src/cloud';
import {
  onlineChatSkill,
  handbookPreference,
  handbookSourceLabel,
} from '../../src/skills/onlineChatSkill';

describe('Phase 10: USTP Student Handbook RAG & Citation-Backed Answers', () => {
  const testUserId = 'local_guest_user';

  beforeEach(async () => {
    await initDatabase();
    userStore.createGuestUser();
    chatStore.clearHistory(testUserId);
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('1. Handbook Preference & localSettingsStore Persistence', () => {
    it('defaults to true when unconfigured', () => {
      // Clear any stored setting
      localSettingsStore.set(testUserId, 'chat.useHandbook', '');
      localSettingsStore.set(testUserId, 'ustp_handbook_enabled', '');
      expect(handbookPreference.read('new_user_123')).toBe(true);
    });

    it('writes and reads both chat.useHandbook and ustp_handbook_enabled', () => {
      handbookPreference.write(testUserId, false);
      expect(handbookPreference.read(testUserId)).toBe(false);
      expect(localSettingsStore.get(testUserId, 'chat.useHandbook')).toBe('false');
      expect(localSettingsStore.get(testUserId, 'ustp_handbook_enabled')).toBe('false');

      handbookPreference.write(testUserId, true);
      expect(handbookPreference.read(testUserId)).toBe(true);
      expect(localSettingsStore.get(testUserId, 'chat.useHandbook')).toBe('true');
      expect(localSettingsStore.get(testUserId, 'ustp_handbook_enabled')).toBe('true');
    });
  });

  describe('2. Handbook Citation Formatting (handbookSourceLabel)', () => {
    it('returns null when sources list is empty', () => {
      expect(handbookSourceLabel([])).toBeNull();
    });

    it('formats single page reference correctly', () => {
      const label = handbookSourceLabel([
        {
          title: 'USTP Student Handbook',
          section: 'Academic Honors',
          page: 28,
        },
      ]);
      expect(label).toBe('Referenced USTP Student Handbook (p. 28)');
    });

    it('formats multiple distinct page references and deduplicates', () => {
      const label = handbookSourceLabel([
        { title: 'USTP Student Handbook', page: 14 },
        { title: 'USTP Student Handbook', page: 14 },
        { title: 'USTP Student Handbook', page: 22 },
      ]);
      expect(label).toBe('Referenced USTP Student Handbook (p. 14, p. 22)');
    });

    it('falls back to title without pages if page numbers are absent', () => {
      const label = handbookSourceLabel([
        { title: 'USTP Student Handbook', page: null },
      ]);
      expect(label).toBe('Referenced USTP Student Handbook');
    });
  });

  describe('3. onlineChatSkill Handbook Integration', () => {
    it('sends useHandbook: true and parses sources with citations', async () => {
      const requestSpy = jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
        status: 'success',
        data: {
          reply: 'To qualify for the USTP Dean\'s List, a student must attain a GPA of 1.75 or higher.',
          used_handbook: true,
          sources: [
            {
              title: 'USTP Student Handbook 2023',
              section: 'Dean\'s Honor List',
              page: 35,
              snippet: 'A student who obtains a GPA of 1.75...',
            },
          ],
        },
      });

      const result = await onlineChatSkill.sendChatMessage(
        [{ role: 'user', content: 'What are the Dean\'s List requirements?' }],
        { useHandbook: true },
      );

      expect(requestSpy).toHaveBeenCalledWith(
        '/v1/ai/chat',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"useHandbook":true'),
        }),
        true,
      );

      expect(result.status).toBe('success');
      expect(result.data?.usedHandbook).toBe(true);
      expect(result.data?.sources).toHaveLength(1);
      expect(result.data?.sources[0].page).toBe(35);
      expect(result.data?.reply).toContain('GPA of 1.75');
    });

    it('sends useHandbook: false when handbook toggle is disabled', async () => {
      const requestSpy = jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
        status: 'success',
        data: {
          reply: 'General knowledge answer without handbook lookup.',
          used_handbook: false,
          sources: [],
        },
      });

      const result = await onlineChatSkill.sendChatMessage(
        [{ role: 'user', content: 'What is photosynthesis?' }],
        { useHandbook: false },
      );

      expect(requestSpy).toHaveBeenCalledWith(
        '/v1/ai/chat',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"useHandbook":false'),
        }),
        true,
      );
      expect(result.status).toBe('success');
      expect(result.data?.usedHandbook).toBe(false);
      expect(result.data?.sources).toHaveLength(0);
    });

    it('fetches handbook availability status from /v1/ai/handbook/status', async () => {
      jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
        status: 'success',
        data: {
          available: true,
          title: 'USTP Student Handbook 2023',
          chunk_count: 420,
        },
      });

      const status = await onlineChatSkill.fetchHandbookStatus();
      expect(status.status).toBe('success');
      expect(status.data?.available).toBe(true);
      expect(status.data?.title).toBe('USTP Student Handbook 2023');
      expect(status.data?.chunkCount).toBe(420);
    });
  });

  describe('4. ChatOrchestrator Offline & Online Fail-Closed Handbook Routing', () => {
    it('returns fail-closed handbook offline message when user asks handbook query while offline', async () => {
      const result = await chatOrchestrator.processMessage(
        testUserId,
        'What are the USTP Dean\'s List requirements?',
        {
          onlineMode: false,
          useHandbook: true,
        },
      );

      expect(result.usedOnline).toBe(false);
      expect(result.reply).toContain(
        'Official USTP Student Handbook guidelines require Online Mode',
      );
    });

    it('returns fail-closed fallback message if online handbook request fails', async () => {
      jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
        status: 'server_error',
        error: 'Backend handbook index unavailable',
      });

      const result = await chatOrchestrator.processMessage(
        testUserId,
        'What is USTP grading system policy?',
        {
          onlineMode: true,
          useHandbook: true,
        },
      );

      expect(result.usedOnline).toBe(false);
      expect(result.reply).toContain(
        "I couldn't verify that from the USTP Student Handbook right now",
      );
      expect(result.reply).toContain('USTP Student Affairs office');
    });

    it('attaches verified handbook citation note when online query succeeds', async () => {
      jest.spyOn(cloudClient, 'request').mockResolvedValueOnce({
        status: 'success',
        data: {
          reply: 'Under the USTP Student Handbook, an incomplete (INC) grade must be completed within one school year.',
          used_handbook: true,
          sources: [
            {
              title: 'USTP Student Handbook',
              section: 'Removal of Incomplete Grades',
              page: 46,
            },
          ],
        },
      });

      const result = await chatOrchestrator.processMessage(
        testUserId,
        'What is the rule for INC grade in USTP?',
        {
          onlineMode: true,
          useHandbook: true,
        },
      );

      expect(result.usedOnline).toBe(true);
      expect(result.reply).toContain('incomplete (INC) grade must be completed');
      expect(result.handbookNote).toBe('Referenced USTP Student Handbook (p. 46)');
    });

    it('routes dedicated ustpRagOnly questions directly to Handbook RAG without planner NLU', async () => {
      const sendSpy = jest
        .spyOn(onlineChatSkill, 'sendChatMessage')
        .mockResolvedValueOnce({
          status: 'success',
          data: {
            reply: 'Dropping of subjects must be done within the official dropping period per the USTP Handbook.',
            usedHandbook: true,
            sources: [{ title: 'USTP Student Handbook', page: 38 }],
          },
        });

      const result = await chatOrchestrator.processMessage(
        testUserId,
        'What is my schedule policy for dropping subjects?',
        {
          onlineMode: true,
          useHandbook: true,
          ustpRagOnly: true,
        },
      );

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0]?.[1]?.useHandbook).toBe(true);
      expect(result.usedOnline).toBe(true);
      expect(result.handbookNote).toBe('Referenced USTP Student Handbook (p. 38)');
    });
  });

  describe('5. UI Verification: Citation Rendering & Handbook Toggle', () => {
    it('renders citation badge in ChatMessageItem when handbookNote is present', () => {
      const { getByTestId, getByText } = render(
        <ThemeProvider userId={testUserId}>
          <ChatMessageItem
            item={{
              id: 'msg-test-1',
              sessionId: 'default',
              sender: 'assistant',
              content: 'The minimum passing grade is 3.0.',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }}
            handbookNote="Referenced USTP Student Handbook (p. 42)"
          />
        </ThemeProvider>,
      );

      expect(getByTestId('chat-handbook-citation')).toBeTruthy();
      expect(getByText('Referenced USTP Student Handbook (p. 42)')).toBeTruthy();
    });

    it('does not render citation badge when handbookNote is absent', () => {
      const { queryByTestId } = render(
        <ThemeProvider userId={testUserId}>
          <ChatMessageItem
            item={{
              id: 'msg-test-2',
              sessionId: 'default',
              sender: 'assistant',
              content: 'You have 2 study blocks scheduled today.',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }}
          />
        </ThemeProvider>,
      );

      expect(queryByTestId('chat-handbook-citation')).toBeNull();
    });

    it('separates Ask LAFINA about USTP into its own RAG chat and sends handbook queries with useHandbook: true', async () => {
      jest
        .spyOn(accountLinkService, 'authorizeOnlineMode')
        .mockResolvedValue({
          status: 'success',
          message: 'Online mode ready.',
        });
      const streamSpy = jest
        .spyOn(onlineChatSkill, 'streamChatMessage')
        .mockResolvedValue({
          status: 'success',
          data: {
            reply: "A GPA of 1.75 or higher qualifies for Dean's List.",
            usedHandbook: true,
            sources: [{ title: 'USTP Student Handbook', page: 44 }],
          },
        });

      const { getByTestId, queryByTestId, findByTestId, getByText } = render(
        <ThemeProvider userId={testUserId}>
          <MeetingsProvider userId={testUserId}>
            <ChatScreen userId={testUserId} />
          </MeetingsProvider>
        </ThemeProvider>,
      );

      // General chat header no longer mixes in the USTP toggle chip
      expect(queryByTestId('chat-handbook-toggle-button')).toBeNull();
      expect(getByTestId('chat-switch-to-ustp-button')).toBeTruthy();

      // Open the Gemini-style sidebar and switch to Ask LAFINA about USTP
      fireEvent.press(getByTestId('chat-history-button'));
      fireEvent.press(getByTestId('chat-history-ustp-new'));

      expect(await findByTestId('chat-ustp-mode-badge')).toBeTruthy();
      expect(getByText('Ask LAFINA anything about USTP')).toBeTruthy();
      expect(getByTestId('chat-ustp-prompt-chip-0')).toBeTruthy();

      // Enable Online Mode and send a USTP starter prompt
      fireEvent.press(getByTestId('chat-ustp-enable-online'));
      await waitFor(() => expect(queryByTestId('chat-ustp-enable-online')).toBeNull());

      fireEvent.press(getByTestId('chat-ustp-prompt-chip-0'));
      await waitFor(() => expect(streamSpy).toHaveBeenCalledTimes(1));
      expect(streamSpy.mock.calls[0][1].useHandbook).toBe(true);
      expect(await findByTestId('chat-handbook-citation')).toBeTruthy();
    });
  });
});
