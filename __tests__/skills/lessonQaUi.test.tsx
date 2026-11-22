import React from 'react';
import {Alert, NativeModules} from 'react-native';
import {pick} from '@react-native-documents/picker';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import * as materialQaModule from '../../src/skills/materialQa';
import {LessonQaSkill} from '../../src/ui/screens/skills/LessonQaSkill';
import {SkillsScreen} from '../../src/ui/screens/skills/SkillsScreen';
import {SourcePicker} from '../../src/ui/screens/skills/SourcePicker';
import type {SkillSource} from '../../src/ui/screens/skills/SourcePicker';
import {
  db,
  initDatabase,
  materialStore,
  notesStore,
  userStore,
} from '../../src/storage';

jest.mock('../../src/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

let owner: string;
const origExtractPages = NativeModules.LafinaVision?.extractDocumentPages;
const origExtractOffice =
  NativeModules.LafinaVision?.extractOfficeDocumentPages;
const origSkillsFiles = NativeModules.LafinaSkillsFiles;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  for (const table of [
    'active_session',
    'user_material_chunks',
    'user_material_qa_messages',
    'user_materials',
    'local_settings',
    'notes',
    'tasks',
    'users',
  ]) {
    db.executeSync(`DELETE FROM ${table}`);
  }
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
  NativeModules.LafinaVision = {
    ...(NativeModules.LafinaVision || {}),
    extractDocumentPages: jest.fn(async () => ({
      pageCount: 2,
      pagesRead: 2,
      startPage: 1,
      endPage: 2,
      nextStartPage: 3,
      hasMore: false,
      ocrPages: 0,
      pages: [
        {
          pageNumber: 1,
          text: 'Lesson 1 Operating Systems\nA process is a program in execution with its own address space.',
          usedOcr: false,
        },
        {
          pageNumber: 2,
          text: 'Deadlock Conditions\nMutual exclusion, hold and wait, no preemption, and circular wait.',
          usedOcr: false,
        },
      ],
    })),
    extractOfficeDocumentPages: jest.fn(async () => ({
      kind: 'docx',
      pageCount: 1,
      pagesRead: 1,
      ocrPages: 0,
      pages: [
        {
          pageNumber: 1,
          text: 'Virtual Memory\nPaging divides physical memory into fixed-size frames.',
          usedOcr: false,
        },
      ],
    })),
  };
});

afterEach(() => {
  if (NativeModules.LafinaVision) {
    NativeModules.LafinaVision.extractDocumentPages = origExtractPages;
    NativeModules.LafinaVision.extractOfficeDocumentPages = origExtractOffice;
  }
  NativeModules.LafinaSkillsFiles = origSkillsFiles;
  jest.restoreAllMocks();
});

const wrap = (children: React.ReactNode) => (
  <ThemeProvider userId={owner}>{children}</ThemeProvider>
);

test('Lesson Q&A is available to guest/non-USTP students, supports PDF upload, Q&A with citation preview, Save to notes, and duplicate detection', async () => {
  (pick as jest.Mock).mockResolvedValue([
    {
      uri: 'file:///downloads/os_notes.pdf',
      name: 'os_notes.pdf',
      type: 'application/pdf',
      size: 2048,
    },
  ]);

  const view = render(
    wrap(
      <SkillsScreen userId={owner} refreshTrigger={0} onRefresh={jest.fn()} />,
    ),
  );

  // Visible to all students (non-USTP guest) in Skills hub
  expect(view.getByText('Lesson Q&A')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Open Lesson Q&A'));

  await waitFor(() =>
    expect(view.getByTestId('lesson-qa-upload-btn')).toBeTruthy(),
  );

  // Upload PDF
  fireEvent.press(view.getByTestId('lesson-qa-upload-btn'));
  await waitFor(() =>
    expect(view.getByText(/Indexed "os notes"/i)).toBeTruthy(),
  );

  // Ask a question offline (shows verbatim passage + citation chip)
  fireEvent.changeText(
    view.getByLabelText('Ask about your materials'),
    'What are deadlock conditions?',
  );
  fireEvent.press(view.getByTestId('lesson-qa-send-btn'));

  await waitFor(() =>
    expect(
      view.getByText(/Mutual exclusion, hold and wait, no preemption/i),
    ).toBeTruthy(),
  );

  // Tap citation chip -> opens verbatim Source Preview Modal
  fireEvent.press(view.getByLabelText(/View source os notes/i));
  await waitFor(() => expect(view.getByText('Close')).toBeTruthy());
  fireEvent.press(view.getByText('Close'));

  // Save answer to Notes
  fireEvent.press(view.getByLabelText('Save answer to notes'));
  await waitFor(() => expect(view.getByText('Saved to Notes.')).toBeTruthy());
  expect(notesStore.getAll(owner)).toHaveLength(1);

  // Re-uploading exact same file detects duplicate cleanly
  fireEvent.press(view.getByTestId('lesson-qa-toggle-view'));
  await waitFor(() =>
    expect(view.getByTestId('lesson-qa-upload-btn')).toBeTruthy(),
  );
  fireEvent.press(view.getByTestId('lesson-qa-upload-btn'));
  await waitFor(() =>
    expect(view.getByText(/Already in your library: os notes/i)).toBeTruthy(),
  );

  // Delete material with confirmation
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
    const deleteBtn = buttons?.find(b => b.text === 'Delete');
    deleteBtn?.onPress?.();
  });
  fireEvent.press(view.getByTestId('lesson-qa-toggle-view'));
  fireEvent.press(view.getByLabelText('Delete os notes'));
  await waitFor(() =>
    expect(materialStore.listMaterials(owner)).toHaveLength(0),
  );

  // Back to Skills Hub
  fireEvent.press(view.getByLabelText('Back to Skills'));
  expect(view.getByTestId('skills-hub')).toBeTruthy();
});

test('SourcePicker From library loads indexed Lesson Q&A material into Summarizer/Quiz/Flashcards', async () => {
  materialStore.saveMaterialWithChunks(
    owner,
    {
      title: 'Linear Algebra Week 1',
      fileName: 'linalg.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'linalg-sha',
      pageCount: 1,
      pagesRead: 1,
      ocrPages: 0,
      totalChars: 62,
      outline: [],
    },
    [
      {
        seq: 1,
        heading: 'Vectors',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'vector dot product',
        content: 'The dot product of orthogonal vectors is always zero.',
      },
    ],
  );

  const onChange = jest.fn();
  const view = render(
    wrap(
      <SourcePicker
        userId={owner}
        source={{text: '', label: ''}}
        onChange={onChange}
      />,
    ),
  );

  fireEvent.press(view.getByLabelText('From library'));
  await waitFor(() =>
    expect(
      view.getByLabelText('Select lesson Linear Algebra Week 1'),
    ).toBeTruthy(),
  );
  fireEvent.press(view.getByLabelText('Select lesson Linear Algebra Week 1'));
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      text: 'The dot product of orthogonal vectors is always zero.',
      label: 'Linear Algebra Week 1',
      materialId: expect.any(String),
    }),
  );
});

test('starter prompts answer offline, Save to notes includes question & prevents duplicates, and single-file scope persists across remounts', async () => {
  const mat = materialStore.saveMaterialWithChunks(
    owner,
    {
      title: 'Operating Systems Ch 1',
      fileName: 'os_ch1.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'os-ch1-sha',
      pageCount: 2,
      pagesRead: 2,
      ocrPages: 0,
      totalChars: 140,
      outline: [{heading: 'Processes', pageNumber: 1, pageLabel: 'p. 1'}],
    },
    [
      {
        seq: 1,
        heading: 'Processes',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'process program execution',
        content: 'A process is a program in execution with its own state.',
      },
      {
        seq: 2,
        heading: 'Threads',
        pageStart: 2,
        pageEnd: 2,
        pageLabel: 'p. 2',
        keywords: 'threads lightweight process',
        content: 'Threads share the same code and data sections.',
      },
    ],
  );

  const onRefresh = jest.fn();
  const view = render(
    wrap(
      <LessonQaSkill
        userId={owner}
        onBack={jest.fn()}
        onRefresh={onRefresh}
      />,
    ),
  );

  // Single file hides redundant "All materials" scope chip
  expect(view.queryByLabelText('Scope: All materials')).toBeNull();

  // Starter prompt answers cleanly in offline mode
  fireEvent.press(view.getByLabelText('What are the main topics covered?'));
  await waitFor(() =>
    expect(view.getByText(/program in execution/i)).toBeTruthy(),
  );

  // Save to notes includes the question and prevents duplicate saves
  fireEvent.press(view.getByLabelText('Save answer to notes'));
  await waitFor(() => expect(view.getByText('Saved to Notes.')).toBeTruthy());
  expect(onRefresh).toHaveBeenCalledTimes(1);
  const savedNotes = notesStore.getAll(owner);
  expect(savedNotes).toHaveLength(1);
  expect(savedNotes[0].body).toContain(
    'Question: What are the main topics covered?',
  );
  expect(savedNotes[0].title).toContain('What are the main topics covered');
  expect(view.getByLabelText('Saved to notes')).toBeTruthy();

  // Citation Preview supports Next/Previous passage and Copy excerpt
  const copyMock = jest.fn(async () => true);
  NativeModules.LafinaSkillsFiles = {copy: copyMock};
  fireEvent.press(view.getAllByLabelText(/View source Operating Systems/i)[0]);
  await waitFor(() =>
    expect(view.getByLabelText('Next passage')).toBeTruthy(),
  );
  fireEvent.press(view.getByLabelText('Next passage'));
  await waitFor(() =>
    expect(
      view.getAllByText(/Threads share the same code/i).length,
    ).toBeGreaterThanOrEqual(2),
  );
  fireEvent.press(view.getByLabelText('Copy excerpt'));
  await waitFor(() =>
    expect(copyMock).toHaveBeenCalledWith(
      expect.stringContaining('Threads share the same code'),
    ),
  );
  fireEvent.press(view.getByText('Close'));

  // Remounting preserves the single-file Q&A thread automatically
  view.unmount();
  const remounted = render(
    wrap(<LessonQaSkill userId={owner} onBack={jest.fn()} />),
  );
  expect(remounted.getByText('What are the main topics covered?')).toBeTruthy();
  expect(
    materialStore.listMessages(owner, mat.id).length,
  ).toBeGreaterThanOrEqual(2);
});

test('SkillsHub search opens targeted material, cross-skill actions prefill SourcePicker, rename validates, and Stop cancels in-flight asks', async () => {
  const matA = materialStore.saveMaterialWithChunks(
    owner,
    {
      title: 'Chemistry Acids',
      fileName: 'acids.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'chem-a',
      pageCount: 1,
      pagesRead: 1,
      ocrPages: 0,
      totalChars: 60,
      outline: [],
    },
    [
      {
        seq: 1,
        heading: 'Acids',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'acids protons donor',
        content: 'Acids donate protons in aqueous solution.',
      },
    ],
  );
  materialStore.saveMaterialWithChunks(
    owner,
    {
      title: 'Calculus Limits',
      fileName: 'limits.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'calc-b',
      pageCount: 1,
      pagesRead: 1,
      ocrPages: 0,
      totalChars: 60,
      outline: [],
    },
    [
      {
        seq: 1,
        heading: 'Limits',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'limit continuity derivative',
        content: 'A limit describes the value a function approaches.',
      },
    ],
  );

  // 1. SkillsHub search opens Lesson Q&A scoped directly to Chemistry Acids
  const hubView = render(
    wrap(
      <SkillsScreen userId={owner} refreshTrigger={0} onRefresh={jest.fn()} />,
    ),
  );
  fireEvent.changeText(
    hubView.getByLabelText('Search skills, notes, to-dos'),
    'Chemistry',
  );
  await waitFor(() =>
    expect(
      hubView.getByLabelText('Open Lesson Q&A for Chemistry Acids'),
    ).toBeTruthy(),
  );
  fireEvent.press(
    hubView.getByLabelText('Open Lesson Q&A for Chemistry Acids'),
  );
  await waitFor(() =>
    expect(hubView.getByText('Ask about Chemistry Acids')).toBeTruthy(),
  );

  // 2. Rename validation disables Save when unchanged/empty and saves valid rename
  fireEvent.press(hubView.getByTestId('lesson-qa-toggle-view'));
  await waitFor(() =>
    expect(hubView.getByLabelText('Rename Chemistry Acids')).toBeTruthy(),
  );
  fireEvent.press(hubView.getByLabelText('Rename Chemistry Acids'));
  const saveBtn = hubView.getByLabelText('Save');
  expect(saveBtn.props.accessibilityState?.disabled).toBe(true);
  fireEvent.changeText(
    hubView.getByLabelText('Material title'),
    'Organic Acids Ch 1',
  );
  expect(hubView.getByLabelText('Save').props.accessibilityState?.disabled).toBe(
    false,
  );
  fireEvent.press(hubView.getByLabelText('Save'));
  await waitFor(() =>
    expect(hubView.getByText('Organic Acids Ch 1')).toBeTruthy(),
  );

  // 3. Cross-skill jump from material card prefills SourcePicker in Summarizer
  fireEvent.press(hubView.getByLabelText('Summarize Organic Acids Ch 1'));
  await waitFor(() =>
    expect(hubView.getByText(/12,000 characters/i)).toBeTruthy(),
  );
  expect(hubView.getAllByText('Organic Acids Ch 1').length).toBeGreaterThan(0);

  // 4. Stop button aborts an in-flight askUserMaterials call cleanly
  const qaView = render(
    wrap(
      <LessonQaSkill
        userId={owner}
        initialMaterialId={matA.id}
        onBack={jest.fn()}
      />,
    ),
  );
  jest
    .spyOn(materialQaModule, 'askUserMaterials')
    .mockImplementation(
      (_uid, _q, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            reject(new materialQaModule.MaterialQaAbortedError());
          });
        }),
    );

  fireEvent.changeText(
    qaView.getByLabelText('Ask about your materials'),
    'Explain Bronsted acids',
  );
  fireEvent.press(qaView.getByTestId('lesson-qa-send-btn'));
  await waitFor(() =>
    expect(qaView.getByTestId('lesson-qa-stop-btn')).toBeTruthy(),
  );
  fireEvent.press(qaView.getByTestId('lesson-qa-stop-btn'));
  await waitFor(() =>
    expect(qaView.getByText('Stopped generating.')).toBeTruthy(),
  );
});

test('SourcePicker lets the student pick any part of a long lesson, not only the opening pages', async () => {
  const pages = 18;
  materialStore.saveMaterialWithChunks(
    owner,
    {
      title: 'Data Structures',
      fileName: 'ds.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4096,
      sha256: 'ds-long-sha',
      pageCount: pages,
      pagesRead: pages,
      ocrPages: 0,
      totalChars: pages * 2000,
      outline: [],
    },
    Array.from({length: pages}, (_, i) => ({
      seq: i + 1,
      heading: '',
      pageStart: i + 1,
      pageEnd: i + 1,
      pageLabel: `p. ${i + 1}`,
      keywords: '',
      content: `Page ${i + 1} marker. ${'linked lists and trees '.repeat(80)}`,
    })),
  );

  const changes: SkillSource[] = [];
  function Harness() {
    const [source, setSource] = React.useState<SkillSource>({
      text: '',
      label: '',
    });
    return (
      <SourcePicker
        userId={owner}
        source={source}
        onChange={next => {
          changes.push(next);
          setSource(next);
        }}
      />
    );
  }
  const view = render(wrap(<Harness />));
  fireEvent.press(view.getByLabelText('From library'));
  await waitFor(() =>
    expect(view.getByLabelText('Select lesson Data Structures')).toBeTruthy(),
  );
  fireEvent.press(view.getByLabelText('Select lesson Data Structures'));

  const first = changes[changes.length - 1];
  expect(first.sectionIndex).toBe(0);
  expect(first.label).toMatch(/^Data Structures · pp\. 1–\d+$/);
  expect(first.text).toContain('Page 1 marker.');
  expect(view.getByText(/split into \d+ parts/)).toBeTruthy();

  const lastChip = view.getAllByTestId(/^source-section-\d+$/).pop()!;
  fireEvent.press(lastChip);
  const last = changes[changes.length - 1];
  expect(last.sectionIndex).toBeGreaterThan(0);
  expect(last.text).toContain(`Page ${pages} marker.`);
  expect(last.text).not.toContain('Page 1 marker.');
  expect(last.label).toMatch(new RegExp(`–${pages}$`));
});
