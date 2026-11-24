import React from 'react';
import {Alert, NativeModules} from 'react-native';
import RNFS from 'react-native-fs';
import NetInfo from '@react-native-community/netinfo';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {DocGenSkill} from '../../src/ui/screens/skills/DocGenSkill';
import {SkillsHub} from '../../src/ui/screens/skills/SkillsHub';
import {docGenDraftStore} from '../../src/ui/drafts/docGenDraftStore';
import {accountLinkService, cloudClient} from '../../src/cloud';
import {localHandbookService} from '../../src/handbook/localHandbookService';
import {documentSkill} from '../../src/skills/documentSkill';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {readSkillState, writeSkillState} from '../../src/skills/skillsState';
import {resetStudyJobsForTests} from '../../src/skills/studyJobs';
import * as sttService from '../../src/ai/stt/sttService';
import {MicrophoneBusyError} from '../../src/ai/native/speechCapture';
import {
  db,
  initDatabase,
  localSettingsStore,
  notesStore,
  userStore,
} from '../../src/storage';
import {studentSetupStore} from '../../src/storage/studentSetupStore';
import {readSkillsDocumentPaths} from '../../src/storage/accountDataReset';
import {enableUstpForTest} from '../fixtures/ustpEligibility';

jest.mock('../../src/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

const BASE64_SAMPLE = 'JVBERi0xLjQK'; // 9 bytes

const wrap = (userId: string, children: React.ReactNode) => (
  <ThemeProvider userId={userId}>{children}</ThemeProvider>
);

const createSignedInStudent = (id = 'student-doc-1') => {
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR REPLACE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, 'Student One', `${id}@example.invalid`, now, now],
  );
  userStore.setCurrentUser(id);
  cloudClient.setAccessToken('tok-student-1');
  localSettingsStore.set(id, 'chat.onlineMode', 'true');
  return id;
};

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  docGenDraftStore.resetForTests();
  resetStudyJobsForTests();
  cloudClient.resetSessionCache();
  localHandbookService.resetForTests();
  for (const table of [
    'active_session',
    'local_settings',
    'users',
    'notes',
    'notes_search_index',
    'user_materials',
    'user_material_chunks',
  ]) {
    db.executeSync(`DELETE FROM ${table}`);
  }
  (NetInfo.fetch as jest.Mock).mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
  (NetInfo.addEventListener as jest.Mock).mockImplementation(cb => {
    cb({isConnected: true, isInternetReachable: true});
    return jest.fn();
  });
  (RNFS.exists as jest.Mock).mockResolvedValue(false);
  (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
  (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
  (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
  NativeModules.LafinaSkillsFiles = {
    openFile: jest.fn(() => Promise.resolve(true)),
    copy: jest.fn(() => Promise.resolve(true)),
  };
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('guest account is gated upfront with Sign in / Create account and never hits document API', () => {
  const guest = userStore.createGuestUser();
  userStore.setCurrentUser(guest.id);
  const genSpy = jest.spyOn(documentSkill, 'generate');
  const onRegister = jest.fn();

  const view = render(
    wrap(
      guest.id,
      <DocGenSkill userId={guest.id} onNavigateToRegister={onRegister} />,
    ),
  );

  expect(view.getByTestId('docgen-readiness-auth')).toBeTruthy();
  fireEvent.changeText(
    view.getByTestId('docgen-prompt-input'),
    'Make a biology study deck',
  );
  const cta = view.getByTestId('docgen-generate-btn');
  expect(cta.props.accessibilityState?.disabled).toBe(true);
  fireEvent.press(cta);
  expect(genSpy).not.toHaveBeenCalled();

  fireEvent.press(view.getByText('Sign in / Create account'));
  expect(onRegister).toHaveBeenCalledTimes(1);
});

test('signed-in student with Online Mode off can enable it in one tap and offline still shows recent files', async () => {
  const userId = createSignedInStudent();
  localSettingsStore.set(userId, 'chat.onlineMode', 'false');
  const authSpy = jest
    .spyOn(accountLinkService, 'authorizeOnlineMode')
    .mockResolvedValue({status: 'success', message: 'Online Mode ready.'});

  const view = render(wrap(userId, <DocGenSkill userId={userId} />));
  expect(view.getByTestId('docgen-readiness-online-mode')).toBeTruthy();

  await act(async () => {
    fireEvent.press(view.getByText('Turn on Online Mode'));
  });
  await waitFor(() => {
    expect(authSpy).toHaveBeenCalledWith(userId);
    expect(localSettingsStore.get(userId, 'chat.onlineMode')).toBe('true');
    expect(view.queryByTestId('docgen-readiness-online-mode')).toBeNull();
  });

  // Simulate device going offline
  (NetInfo.addEventListener as jest.Mock).mockImplementation(cb => {
    cb({isConnected: false, isInternetReachable: false});
    return jest.fn();
  });
  const offlineView = render(wrap(userId, <DocGenSkill userId={userId} />));
  expect(offlineView.getByTestId('docgen-readiness-offline')).toBeTruthy();
  expect(
    offlineView.getByTestId('docgen-generate-btn').props.accessibilityState
      ?.disabled,
  ).toBe(true);
});

test('generates xlsx/pdf, condenses a long source so all of it is used, persists clean filename, and cleans up on Clear All Data sync', async () => {
  const userId = createSignedInStudent();
  const longSource = 'CPU scheduling algorithms '.repeat(200);
  const reqSpy = jest
    .spyOn(cloudClient, 'request')
    .mockImplementation(async (path: string) =>
      path === '/v1/ai/chat'
        ? ({
            status: 'success',
            data: {
              reply: 'Condensed notes: FCFS, SJF and Round Robin scheduling.',
              sources: [],
              usedHandbook: false,
            },
          } as never)
        : ({
            status: 'success',
            data: {
              format: 'xlsx',
              fileName: 'Study...Schedule.xlsx',
              mimeType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              contentBase64: BASE64_SAMPLE,
              title: 'OS Study Tracker',
              summary: 'Weekly **OS** exam breakdown.',
              sizeBytes: 2048,
            },
          } as never),
    );

  const view = render(
    wrap(userId, <DocGenSkill userId={userId} refreshTrigger={0} />),
  );

  fireEvent.press(view.getByTestId('docgen-format-xlsx'));
  expect(view.getByText('Multi-sheet')).toBeTruthy();
  fireEvent.press(view.getByText('Multi-sheet'));
  fireEvent.changeText(
    view.getByTestId('docgen-prompt-input'),
    'Create a study tracker',
  );
  fireEvent.press(view.getByText('Paste text'));
  fireEvent.changeText(view.getByLabelText('Text to work with'), longSource);

  await act(async () => {
    fireEvent.press(view.getByTestId('docgen-generate-btn'));
  });

  await waitFor(() => {
    expect(view.getByText('Your spreadsheet is ready')).toBeTruthy();
  });

  expect(reqSpy).toHaveBeenCalledWith(
    '/v1/ai/documents',
    expect.objectContaining({method: 'POST'}),
    true,
  );
  // The 5,200-character source was condensed online first, and the
  // document service received the condensed notes rather than page one.
  const chatCalls = reqSpy.mock.calls.filter(c => c[0] === '/v1/ai/chat');
  expect(chatCalls.length).toBeGreaterThanOrEqual(1);
  const docCall = reqSpy.mock.calls.find(c => c[0] === '/v1/ai/documents');
  const sentBody = JSON.parse(String(docCall?.[1]?.body ?? '{}'));
  expect(sentBody.format).toBe('xlsx');
  expect(sentBody.messages[0].content).toContain('Multi-sheet workbook');
  expect(sentBody.messages[0].content).toContain('Condensed notes: FCFS');

  // Filename had '...' collapsed so Clear All Data readSkillsDocumentPaths accepts it
  const savedFiles = readSkillState<Array<{attachment: {fileName: string}}>>(
    userId,
    'files',
    [],
  );
  expect(savedFiles).toHaveLength(1);
  expect(savedFiles[0].attachment.fileName).not.toContain('..');
  expect(readSkillsDocumentPaths(userId)).toHaveLength(1);

  // The fixture contains 9 bytes; ignore the server's inflated 2 KB metadata.
  expect(view.getAllByText(/9 B/).length).toBeGreaterThan(0);
  expect(
    view.getByText(/condensed your [\d,]+-character source first/i),
  ).toBeTruthy();

  // Simulate Clear All Data updating local_settings + refreshTrigger
  db.executeSync(
    `DELETE FROM local_settings WHERE user_id = ? AND key LIKE 'skills.%'`,
    [userId],
  );
  view.rerender(
    wrap(userId, <DocGenSkill userId={userId} refreshTrigger={1} />),
  );
  await waitFor(() => {
    expect(view.queryByText('Your spreadsheet is ready')).toBeNull();
    expect(
      view.getByText('Your generated files will appear here.'),
    ).toBeTruthy();
  });
});

test('cancel generation aborts request and persistent error can be dismissed', async () => {
  const userId = createSignedInStudent();
  let capturedSignal: AbortSignal | undefined;
  jest
    .spyOn(documentSkill, 'generate')
    .mockImplementationOnce(
      ({signal}) =>
        new Promise(() => {
          capturedSignal = signal;
        }),
    )
    .mockResolvedValueOnce({
      status: 'server_error',
      error: 'Document service failed.',
    });

  const view = render(wrap(userId, <DocGenSkill userId={userId} />));
  fireEvent.changeText(
    view.getByTestId('docgen-prompt-input'),
    'Build lecture slides',
  );
  fireEvent.press(view.getByTestId('docgen-generate-btn'));

  await waitFor(() => {
    expect(view.getByTestId('docgen-cancel-btn')).toBeTruthy();
  });
  fireEvent.press(view.getByTestId('docgen-cancel-btn'));
  await waitFor(() => {
    expect(capturedSignal?.aborted).toBe(true);
    expect(view.getByTestId('docgen-generate-btn')).toBeTruthy();
  });

  // Trigger failure and dismiss error
  await act(async () => {
    fireEvent.press(view.getByTestId('docgen-generate-btn'));
  });
  await waitFor(() => {
    expect(view.getByText('Document service failed.')).toBeTruthy();
  });
  fireEvent.press(view.getByLabelText('Dismiss error'));
  expect(view.queryByText('Document service failed.')).toBeNull();
});

test('unmounting mid-job and remounting after completion restores result in preview', async () => {
  const userId = createSignedInStudent();
  let resolveDoc!: (
    val: Awaited<ReturnType<typeof documentSkill.generate>>,
  ) => void;
  jest.spyOn(documentSkill, 'generate').mockImplementation(
    () =>
      new Promise(resolve => {
        resolveDoc = resolve;
      }),
  );

  const first = render(wrap(userId, <DocGenSkill userId={userId} />));
  fireEvent.changeText(
    first.getByTestId('docgen-prompt-input'),
    'Algorithms slides',
  );
  fireEvent.press(first.getByTestId('docgen-generate-btn'));
  await waitFor(() => expect(first.getByText(/Working on it/i)).toBeTruthy());
  first.unmount();

  await act(async () => {
    resolveDoc({
      status: 'success',
      data: {
        format: 'pptx',
        fileName: 'Algorithms.pptx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        contentBase64: BASE64_SAMPLE,
        title: 'Algorithms Deck',
        summary: 'Covered sorting and graphs.',
        sizeBytes: 1500,
      },
    });
  });

  const reopened = render(wrap(userId, <DocGenSkill userId={userId} />));
  await waitFor(() => {
    expect(reopened.getByText('Your slides are ready')).toBeTruthy();
    expect(reopened.getAllByText('Algorithms Deck').length).toBeGreaterThan(0);
  });
});

test('revisions preserve format, length, and full non-degraded source across rounds', async () => {
  const userId = createSignedInStudent();
  const sourceBody = 'S'.repeat(2100);
  const genSpy = jest
    .spyOn(documentSkill, 'generate')
    .mockResolvedValueOnce({
      status: 'success',
      data: {
        format: 'pdf',
        fileName: 'Midterm.pdf',
        mimeType: 'application/pdf',
        contentBase64: BASE64_SAMPLE,
        title: 'Midterm Guide',
        summary: 'Initial summary',
        sizeBytes: 1024,
      },
    })
    .mockResolvedValueOnce({
      status: 'success',
      data: {
        format: 'pdf',
        fileName: 'Midterm_v2.pdf',
        mimeType: 'application/pdf',
        contentBase64: BASE64_SAMPLE,
        title: 'Midterm Guide v2',
        summary: 'Revised summary',
        sizeBytes: 1200,
      },
    });

  const view = render(wrap(userId, <DocGenSkill userId={userId} />));
  fireEvent.press(view.getByTestId('docgen-format-pdf'));
  fireEvent.press(view.getByText('6+ pages'));
  fireEvent.changeText(
    view.getByTestId('docgen-prompt-input'),
    'Original midterm prompt',
  );
  fireEvent.press(view.getByText('Paste text'));
  fireEvent.changeText(view.getByLabelText('Text to work with'), sourceBody);

  await act(async () => {
    fireEvent.press(view.getByTestId('docgen-generate-btn'));
  });
  await waitFor(() => expect(view.getByText('Your PDF is ready')).toBeTruthy());

  fireEvent.press(view.getByTestId('docgen-open-revise-btn'));
  expect(
    view.getByLabelText('6+ pages').props.accessibilityState?.checked,
  ).toBe(true);

  fireEvent.changeText(
    view.getByLabelText('Ask for changes'),
    'Add practice questions at the end',
  );
  await act(async () => {
    fireEvent.press(view.getByText('Generate revision'));
  });

  await waitFor(() => {
    expect(genSpy).toHaveBeenCalledTimes(2);
  });
  const revCall = genSpy.mock.calls[1][0];
  expect(revCall.format).toBe('pdf');
  expect(revCall.prompt).toContain('Length: 6 or more pages.');
  expect(revCall.prompt).toContain('Original request: Original midterm prompt');
  expect(revCall.prompt).toContain('S'.repeat(1800));
  expect(view.getByText('v2')).toBeTruthy();
});

test('USTP Handbook uses on-device search, works with empty prompt, hides for non-USTP, and propagates cloud errors', async () => {
  const userId = createSignedInStudent();

  // non-USTP scheduling mode hides Handbook control
  studentSetupStore.update(userId, {affiliation: 'not_ustp'});
  const nonUstpView = render(wrap(userId, <DocGenSkill userId={userId} />));
  expect(nonUstpView.queryByText('Handbook source')).toBeNull();
  expect(nonUstpView.queryByTestId('docgen-handbook-locked')).toBeNull();
  nonUstpView.unmount();

  // Enable USTP eligibility & test local handbook pack with empty prompt + source
  enableUstpForTest(userId);
  localHandbookService.ingestPackForTests({
    version: 1,
    title: 'USTP Student Handbook',
    edition: '2026',
    sourceLabel: 'USTP Student Handbook',
    sha256: 'test-pack-sha',
    chunkCount: 1,
    generatedAt: new Date().toISOString(),
    chunks: [
      {
        id: 'c1',
        seq: 1,
        chapter: 'Academic Policies',
        section: 'Grading',
        pageLabel: 'p. 42',
        sourceLabel: 'USTP Student Handbook',
        content: 'Minimum passing grade for undergraduate courses is 3.0.',
      },
    ],
  });

  const genSpy = jest.spyOn(documentSkill, 'generate').mockResolvedValue({
    status: 'success',
    data: {
      format: 'docx',
      fileName: 'Grading_Policy.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contentBase64: BASE64_SAMPLE,
      title: 'Grading Policy Notes',
      summary: 'Covers passing grade rules.',
      sizeBytes: 900,
    },
  });
  const chatSpy = jest.spyOn(onlineChatSkill, 'sendChatMessage');

  const view = render(wrap(userId, <DocGenSkill userId={userId} />));
  fireEvent.press(view.getByTestId('docgen-format-docx'));
  fireEvent.press(view.getByLabelText('USTP Handbook'));
  fireEvent.press(view.getByText('Paste text'));
  fireEvent.changeText(
    view.getByLabelText('Text to work with'),
    'Explain passing grade policy for undergraduate courses',
  );

  await act(async () => {
    fireEvent.press(view.getByTestId('docgen-generate-btn'));
  });
  await waitFor(() => {
    expect(view.getByText('Your document is ready')).toBeTruthy();
  });
  expect(chatSpy).not.toHaveBeenCalled();
  expect(genSpy.mock.calls[0][0].prompt).toContain(
    'USTP Student Handbook, p. 42',
  );
  expect(genSpy.mock.calls[0][0].prompt).toContain(
    'Explain passing grade policy for undergraduate courses',
  );
  expect(view.getByText('USTP Student Handbook, p. 42')).toBeTruthy();

  // When local pack is unpopulated and fallback cloud call fails, real error is preserved
  localHandbookService.resetForTests();
  jest.spyOn(localHandbookService, 'ensureReady').mockResolvedValue({
    ready: true,
    populated: false,
    chunkCount: 0,
    title: 'USTP Student Handbook',
    edition: 'Unavailable',
    sourceLabel: 'USTP Student Handbook',
    sha256: 'empty',
    origin: 'none',
  });
  chatSpy.mockResolvedValueOnce({
    status: 'rate_limited',
    error: 'Rate limit exceeded for Handbook lookup.',
  });

  fireEvent.press(view.getByText('Make something else'));
  await act(async () => {
    fireEvent.press(view.getByTestId('docgen-generate-btn'));
  });
  await waitFor(() => {
    expect(
      view.getByText('Rate limit exceeded for Handbook lookup.'),
    ).toBeTruthy();
  });
});

test('delete asks confirmation, reads latest state to avoid stale overwrite, and missing file offers Regenerate', async () => {
  const userId = createSignedInStudent();
  writeSkillState(userId, 'files', [
    {
      id: 'doc-1',
      attachment: {
        uri: 'file:///documents/skills_documents/student-doc-1/doc-1_Test.pdf',
        fileName: 'Test.pdf',
        format: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      },
      title: 'Old Notes PDF',
      summary: 'Old summary',
      createdAt: new Date().toISOString(),
      prompt: 'Make PDF',
      originalPrompt: 'Make PDF',
      fullContext: 'Source content',
      length: 'Short',
    },
  ]);

  const alertSpy = jest.spyOn(Alert, 'alert');
  (NativeModules.LafinaSkillsFiles.openFile as jest.Mock).mockRejectedValueOnce(
    Object.assign(
      new Error('This file is no longer on this phone. Generate it again.'),
      {
        code: 'SKILL_FILE_MISSING',
      },
    ),
  );

  const view = render(wrap(userId, <DocGenSkill userId={userId} />));

  // Preview & attempt Open on missing file -> shows recovery card
  fireEvent.press(view.getByLabelText('Preview Old Notes PDF'));
  await act(async () => {
    fireEvent.press(view.getByText('Open'));
  });
  await waitFor(() => {
    expect(view.getByTestId('docgen-missing-file-card')).toBeTruthy();
  });

  // Delete asks confirmation and reads latest storage before saving
  fireEvent.press(view.getAllByLabelText('Delete Old Notes PDF')[0]);
  expect(alertSpy).toHaveBeenCalledWith(
    'Delete file?',
    expect.stringContaining('Old Notes PDF'),
    expect.any(Array),
  );
  // Inject a concurrent item before confirming delete
  const current = readSkillState<unknown[]>(userId, 'files', []);
  writeSkillState(userId, 'files', [
    {
      id: 'doc-2',
      attachment: {
        uri: 'file:///documents/skills_documents/student-doc-1/doc-2_New.pdf',
        fileName: 'New.pdf',
        format: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 512,
      },
      title: 'Concurrent PDF',
      summary: 'Summary',
      createdAt: new Date().toISOString(),
      prompt: 'Prompt',
    },
    ...current,
  ]);
  const buttons = alertSpy.mock.calls[0][2] as Array<{
    text: string;
    onPress?: () => void;
  }>;
  await act(async () => {
    buttons.find(b => b.text === 'Delete')?.onPress?.();
  });
  await waitFor(() => {
    const remaining = readSkillState<Array<{id: string}>>(userId, 'files', []);
    expect(remaining.map(f => f.id)).toEqual(['doc-2']);
  });
});

test('dictation locks double-taps, cancels on Generate, and handles MicrophoneBusyError cleanly', async () => {
  const userId = createSignedInStudent();
  let resolvePerm!: (ok: boolean) => void;
  jest.spyOn(sttService, 'ensureMicrophonePermission').mockImplementation(
    () =>
      new Promise(resolve => {
        resolvePerm = resolve;
      }),
  );

  let resolveCapture!: (val: {
    captureId: string;
    transcript: string;
    speechDetected: boolean;
    cancelled: boolean;
    captureDurationMs: number;
    inferenceDurationMs: number;
  }) => void;
  const startSpy = jest.spyOn(sttService, 'startListening').mockReturnValue({
    captureId: 'cap-1',
    result: new Promise(resolve => {
      resolveCapture = resolve;
    }),
  });
  const cancelSpy = jest
    .spyOn(sttService, 'cancelListening')
    .mockResolvedValue(true);

  const view = render(wrap(userId, <DocGenSkill userId={userId} />));
  // Rapid double tap before permission resolves
  fireEvent.press(view.getByTestId('docgen-dictate-btn'));
  fireEvent.press(view.getByTestId('docgen-dictate-btn'));

  await act(async () => {
    resolvePerm(true);
  });
  expect(startSpy).toHaveBeenCalledTimes(1);

  // Put some text so Generate is enabled, then tap Generate while listening -> cancels capture
  fireEvent.changeText(view.getByTestId('docgen-prompt-input'), 'Draft slides');
  jest.spyOn(documentSkill, 'generate').mockResolvedValue({
    status: 'offline',
    error: 'Offline',
  });
  await act(async () => {
    fireEvent.press(view.getByTestId('docgen-generate-btn'));
  });
  expect(cancelSpy).toHaveBeenCalledWith('cap-1');
  resolveCapture({
    captureId: 'cap-1',
    transcript: '',
    speechDetected: false,
    cancelled: true,
    captureDurationMs: 0,
    inferenceDurationMs: 0,
  });

  // MicrophoneBusyError produces friendly guidance
  (sttService.ensureMicrophonePermission as jest.Mock).mockResolvedValueOnce(
    true,
  );
  startSpy.mockImplementationOnce(() => {
    throw new MicrophoneBusyError();
  });
  await act(async () => {
    fireEvent.press(view.getByTestId('docgen-dictate-btn'));
  });
  expect(view.getByText(/Microphone is currently in use/i)).toBeTruthy();
});

test('form draft persists across unmount/remount and SkillsHub exposes search aliases + live job status pill', () => {
  const userId = createSignedInStudent();
  notesStore.insert({
    id: 'n1',
    userId,
    title: 'Sample',
    body: 'Body',
    category: 'Learning',
    isPinned: false,
    tags: [],
    isVoiceTranscribed: false,
  });

  const first = render(wrap(userId, <DocGenSkill userId={userId} />));
  fireEvent.press(first.getByTestId('docgen-format-pdf'));
  fireEvent.changeText(
    first.getByTestId('docgen-prompt-input'),
    'Keep this draft',
  );
  first.unmount();

  const second = render(wrap(userId, <DocGenSkill userId={userId} />));
  expect(second.getByTestId('docgen-prompt-input').props.value).toBe(
    'Keep this draft',
  );
  expect(
    second.getByTestId('docgen-format-pdf').props.accessibilityState?.checked,
  ).toBe(true);
  second.unmount();

  const hub = render(
    wrap(
      userId,
      <SkillsHub
        userId={userId}
        refreshTrigger={0}
        onOpen={jest.fn()}
        onEntity={jest.fn()}
      />,
    ),
  );
  fireEvent.changeText(
    hub.getByLabelText('Search skills, notes, to-dos'),
    'xlsx',
  );
  expect(hub.getByText('Create with LAFINA')).toBeTruthy();
});

test('a full file list asks before the oldest file is deleted, and Cancel creates nothing', async () => {
  const userId = createSignedInStudent('student-doc-full');
  const full = Array.from({length: 50}, (_, i) => ({
    id: `doc-${i}`,
    attachment: {
      uri: `file:///docs/skills_documents/student-doc-full/doc-${i}.pdf`,
      fileName: `doc-${i}.pdf`,
      format: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
    },
    title: i === 49 ? 'Oldest handout' : `Handout ${i}`,
    summary: 'S',
    createdAt: new Date(Date.UTC(2026, 10, 22) - i * 60000).toISOString(),
    prompt: 'p',
  }));
  writeSkillState(userId, 'files', full);
  const alertSpy = jest.spyOn(Alert, 'alert');
  const genSpy = jest.spyOn(documentSkill, 'generate').mockResolvedValue({
    status: 'success',
    data: {
      format: 'pdf',
      fileName: 'New.pdf',
      mimeType: 'application/pdf',
      contentBase64: BASE64_SAMPLE,
      title: 'New handout',
      summary: 'Fresh.',
      sizeBytes: 9,
    },
  });

  const view = render(
    wrap(userId, <DocGenSkill userId={userId} refreshTrigger={0} />),
  );
  expect(view.getByText(/50 of 50 files saved/)).toBeTruthy();
  fireEvent.changeText(
    view.getByTestId('docgen-prompt-input'),
    'One-page handout on recursion',
  );
  await act(async () => {
    fireEvent.press(view.getByTestId('docgen-generate-btn'));
  });

  expect(alertSpy).toHaveBeenCalledWith(
    'Your file list is full',
    expect.stringContaining('"Oldest handout"'),
    expect.any(Array),
  );
  expect(genSpy).not.toHaveBeenCalled();
  const buttons = alertSpy.mock.calls[0][2] as Array<{
    text: string;
    onPress?: () => void;
  }>;
  buttons.find(b => b.text === 'Cancel')?.onPress?.();
  expect(genSpy).not.toHaveBeenCalled();
  expect(readSkillState<unknown[]>(userId, 'files', [])).toHaveLength(50);

  // Continue makes the file; the oldest is the one removed.
  await act(async () => {
    buttons.find(b => b.text === 'Continue')?.onPress?.();
  });
  await waitFor(() => expect(genSpy).toHaveBeenCalledTimes(1));
  await waitFor(() => {
    const files = readSkillState<Array<{title: string}>>(userId, 'files', []);
    expect(files).toHaveLength(50);
    expect(files[0].title).toBe('New handout');
    expect(files.some(f => f.title === 'Oldest handout')).toBe(false);
  });
});
