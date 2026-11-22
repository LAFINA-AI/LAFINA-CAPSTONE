/**
 * Chat skill requests (ADR-041, SKILL-04): answered on the device with a
 * button to tap; nothing opens by itself and no model or network is used.
 */
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {cloudClient} from '../../src/cloud/cloudClient';
import {db, initDatabase, userStore} from '../../src/storage';

let owner: string;
beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  db.executeSync('DELETE FROM local_settings');
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
});
afterEach(() => jest.restoreAllMocks());

test('"make flashcards" replies locally and offers Open Flashcards', async () => {
  const request = jest.spyOn(cloudClient, 'request');
  const result = await chatOrchestrator.processMessage(
    owner,
    'make flashcards',
    {
      onlineMode: true,
    },
  );
  expect(result.skillLaunch).toEqual({skill: 'flashcards', action: 'create'});
  expect(result.reply).toBe(
    'Got it. Just upload your material in Flashcards. Tap **Open Flashcards** below.',
  );
  expect(result.usedOnline).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

test('"start a pomodoro" in Chat does not start anything until the tap', async () => {
  const result = await chatOrchestrator.processMessage(
    owner,
    'start a pomodoro',
  );
  expect(result.reply).toBe(
    'Ready to start a 25-minute focus session. Tap **Open Pomodoro** below.',
  );
  expect(result.skillLaunch).toEqual({skill: 'pomodoro', action: 'start'});
});

test('a skill question is answered with no button', async () => {
  const result = await chatOrchestrator.processMessage(
    owner,
    'how many cards are due?',
  );
  expect(result.reply).toBe("You don't have any flashcards yet.");
  expect(result.skillLaunch).toBeUndefined();
});
