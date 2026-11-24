import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  chatOrchestrator,
  type ChatOrchestratorResult,
} from '../../src/ai/chatOrchestrator';
import * as studyAi from '../../src/skills/studyAi';
import type {StudyCard} from '../../src/skills/studyLogic';
import {readSkillState, writeSkillState} from '../../src/skills/skillsState';
import {resetStudyJobsForTests} from '../../src/skills/studyJobs';
import {invalidateOwnerWork} from '../../src/storage/ownerWorkEpoch';
import {chatStore, initDatabase, userStore} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {SummarizerSkill} from '../../src/ui/screens/skills/SummarizerSkill';

let owner: string;
beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  resetStudyJobsForTests();
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
  chatStore.clearHistory(owner);
});
afterEach(() => jest.restoreAllMocks());
const wrap = (children: React.ReactNode) => (
  <ThemeProvider userId={owner}>{children}</ThemeProvider>
);

test('resetting during summary-to-cards aborts generation and prevents a late deck save', async () => {
  writeSkillState(owner, 'summary', {
    text: 'Saved summary',
    source: {label: 'Biology', text: 'Student source'},
    length: 'Short',
  });
  writeSkillState(owner, 'decks', []);
  let finish!: (cards: StudyCard[]) => void;
  const generate = jest.spyOn(studyAi, 'cardsFromSource').mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const view = render(
    wrap(<SummarizerSkill userId={owner} onFlashcards={jest.fn()} />),
  );
  fireEvent.press(view.getByText('Make flashcards'));
  const signal = generate.mock.calls[0][3]?.signal;
  expect(signal?.aborted).toBe(false);
  act(() => invalidateOwnerWork(owner));
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish([
      {
        id: 'late',
        question: 'Question',
        answer: 'Answer',
        intervalDays: 0,
        ease: 2.5,
        dueAt: 0,
        reviews: 0,
      },
    ]);
  });
  expect(readSkillState(owner, 'decks', [])).toEqual([]);
  expect(view.queryByText('Flashcards saved')).toBeNull();
});

test('a previous account reply cannot show streaming text or skill offers in the newly shown chat', async () => {
  let finish!: (value: ChatOrchestratorResult) => void;
  let publish!: (text: string) => void;
  let saved!: ReturnType<typeof chatStore.addMessage>;
  jest
    .spyOn(chatOrchestrator, 'processMessage')
    .mockImplementation((requestOwner, text, options) => {
      saved = chatStore.addMessage(requestOwner, 'user', text);
      options?.onUserMessage?.(saved);
      publish = partial => options?.onReplyText?.(partial);
      return new Promise(resolve => {
        finish = resolve;
      });
    });
  const view = render(wrap(<ChatScreen userId={owner} />));
  fireEvent.changeText(view.getByTestId('chat-text-input'), 'make flashcards');
  await act(async () => fireEvent.press(view.getByTestId('chat-send-button')));
  view.rerender(wrap(<ChatScreen userId="other-ui-owner" />));
  await act(async () => {
    publish('Old account answer');
    finish({
      assistantMessage: {
        ...saved,
        sender: 'assistant',
        content: 'Old account answer',
      },
      reply: 'Old account answer',
      skillLaunch: {skill: 'flashcards', action: 'create'},
    } as ChatOrchestratorResult);
  });
  await waitFor(() =>
    expect(view.queryByTestId('chat-streaming-content')).toBeNull(),
  );
  expect(view.queryByText('Old account answer')).toBeNull();
  expect(view.queryByText('Open Flashcards')).toBeNull();
});
