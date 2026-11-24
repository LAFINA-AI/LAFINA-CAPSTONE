import RNFS from 'react-native-fs';
import {
  db,
  initDatabase,
  userStore,
  recordedMeetingStore,
  tasksStore,
  notesStore,
} from '../../src/storage';
import {
  authorizeDataReset,
  resetPersonalData,
  finishPersonalFileCleanup,
} from '../../src/storage/accountDataReset';
import {meetingRecorder} from '../../src/ai/native/meetingRecorder';
import {writeCalendarExport} from '../../src/storage/calendarExport';
import {plannerQueries} from '../../src/storage/plannerQueries';
import {voiceQueryStore} from '../../src/storage/voiceQueryStore';
import {readLocalVoiceResult} from '../../src/cloud/voiceConversation/localVoiceData';

beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});
afterEach(() => jest.restoreAllMocks());

test('reset records meeting files durably before deleting rows and retries failed cleanup', async () => {
  userStore.setCurrentUser('local_guest_user');
  recordedMeetingStore.create({
    id: 'audit-cleanup-audio',
    userId: 'local_guest_user',
    title: 'Synthetic audio',
  });
  const authority = authorizeDataReset('local_guest_user')!;
  const deletion = jest
    .spyOn(meetingRecorder, 'deleteMeetingAudio')
    .mockResolvedValue(false);
  expect(resetPersonalData(authority).admitted).toBe(true);
  expect(recordedMeetingStore.get('audit-cleanup-audio')).toBeNull();
  expect(await finishPersonalFileCleanup(authority)).toEqual({pending: 1});
  deletion.mockResolvedValue(true);
  expect(await finishPersonalFileCleanup(authority)).toEqual({pending: 0});
  expect(deletion).toHaveBeenCalledWith('audit-cleanup-audio');
});

test('document deletion failures remain queued after settings and references are removed', async () => {
  userStore.setCurrentUser('local_guest_user');
  const path = `${RNFS.DocumentDirectoryPath}/skills_documents/local_guest_user/audit.pdf`;
  db.executeSync(
    `INSERT OR REPLACE INTO local_settings (user_id, key, value, updated_at) VALUES (?, 'skills.files.v1', ?, ?)`,
    [
      'local_guest_user',
      JSON.stringify([{attachment: {uri: `file://${path}`}}]),
      new Date().toISOString(),
    ],
  );
  const authority = authorizeDataReset('local_guest_user')!;
  const files = new Set([path]);
  jest
    .spyOn(RNFS, 'exists')
    .mockImplementation(async value => files.has(value));
  jest.spyOn(RNFS, 'stat').mockResolvedValue({isFile: () => true} as never);
  const unlink = jest
    .spyOn(RNFS, 'unlink')
    .mockRejectedValue(new Error('disk busy'));
  resetPersonalData(authority);
  expect(await finishPersonalFileCleanup(authority)).toEqual({pending: 1});
  unlink.mockImplementation(async value => {
    files.delete(value);
  });
  expect(await finishPersonalFileCleanup(authority)).toEqual({pending: 0});
});

test('export writes multiple bounded chunks without loading the full export', async () => {
  const owner = 'audit-export';
  for (let index = 0; index < 510; index += 1)
    tasksStore.insertTask({
      id: `audit-export-${String(index).padStart(4, '0')}`,
      userId: owner,
      title: `Task ${index}`,
      dueDate: null,
      dueTime: null,
      isCompleted: false,
      priority: 'Medium',
      category: 'Academic',
    });
  const full = jest
    .spyOn(plannerQueries, 'exportAll')
    .mockImplementation(() => {
      throw new Error('unbounded export forbidden');
    });
  const chunks: string[] = [];
  jest.spyOn(RNFS, 'writeFile').mockImplementation(async (_path, text) => {
    chunks.push(text);
  });
  // appendFile is not present in the app-wide fake; install a local in-memory implementation.
  const previous = RNFS.appendFile;
  RNFS.appendFile = jest.fn(async (_path, text) => {
    chunks.push(text);
  });
  try {
    expect(await writeCalendarExport(owner, '/synthetic/audit.ics')).toBe(510);
    const text = chunks.join('');
    expect(text.match(/BEGIN:VTODO/g) || []).toHaveLength(510);
    expect(text.match(/BEGIN:VCALENDAR/g) || []).toHaveLength(1);
    expect(chunks.length).toBeGreaterThan(3);
    expect(full).not.toHaveBeenCalled();
  } finally {
    RNFS.appendFile = previous;
  }
});

test('voice queries bound task/note rows and body bytes before JS and keep owner boundaries', () => {
  const owner = 'audit-voice';
  for (let index = 0; index < 60; index += 1) {
    tasksStore.insertTask({
      id: `audit-voice-${index}`,
      userId: owner,
      title: `Todo ${index}`,
      dueDate: null,
      isCompleted: false,
      priority: 'High',
      category: 'Academic',
    });
    notesStore.insert({
      id: `audit-voice-note-${index}`,
      userId: owner,
      title: `Checklist ${index}`,
      body: '- [ ] Finish homework\n' + 'x'.repeat(index === 0 ? 60000 : 5),
      isPinned: false,
      tags: [],
      category: 'Academic',
      isVoiceTranscribed: false,
    });
  }
  const allTasks = jest
    .spyOn(tasksStore, 'getAllTasks')
    .mockImplementation(() => {
      throw new Error('full read forbidden');
    });
  const allNotes = jest.spyOn(notesStore, 'getAll').mockImplementation(() => {
    throw new Error('full read forbidden');
  });
  expect(voiceQueryStore.tasks(owner, '', 6)).toHaveLength(6);
  expect(
    voiceQueryStore
      .notes(owner, '', 100)
      .items.every(note => note.body.length <= 50000),
  ).toBe(true);
  const result = readLocalVoiceResult(owner, 'todos', '') as {
    todos: unknown[];
    partial: boolean;
  };
  expect(result.todos).toHaveLength(12);
  expect(result.partial).toBe(true);
  expect(voiceQueryStore.tasks('other-owner', '', 6)).toEqual([]);
  expect(allTasks).not.toHaveBeenCalled();
  expect(allNotes).not.toHaveBeenCalled();
});
