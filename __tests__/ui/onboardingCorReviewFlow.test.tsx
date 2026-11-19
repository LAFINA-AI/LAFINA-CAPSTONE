/**
 * Simplified 1-screen COR review flow (Jest render, not a device run),
 * plus the restored-USTP-chat gate in ChatScreen.
 */
import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {CorReviewFlow} from '../../src/ui/screens/onboarding/CorReviewFlow';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {
  chatStore,
  db,
  initDatabase,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {corImportStore} from '../../src/storage/corImportStore';
import {getUstpEligibility} from '../../src/storage/ustpEligibility';
import {chooseUstpMode} from '../../src/storage/studentMode';
import * as corDocument from '../../src/ai/vision/corDocument';
import {visionService} from '../../src/ai/vision/visionService';
import {parseUstpCor} from '../../src/ai/vision/ustpCorParser';
import {chooseCorReading} from '../../src/ai/vision/corExtraction';
import {
  buildSyntheticCorPage,
  toOcrPage,
  type SynthCor,
} from '../fixtures/corSynthetic';

const ACCURACY_COR: SynthCor = {
  registrationNo: '123456',
  studentNo: '2099000003',
  fullName: 'SANTOS, MARIA CLARA R',
  gender: 'F',
  age: 21,
  college: 'COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING',
  program: 'B.S. in Information Technology',
  major: 'N/A',
  yearLevel: '4th Year - Baccalaureate',
  curriculum: 'CITC-BSIT-2018-2019',
  term: '1st Semester AY 2026-2027',
  campusLine: 'USTP CDO CAMPUS',
  courses: [
    {
      code: 'IT414',
      title: 'IT Elective 3',
      lec: 2,
      lab: 1,
      credit: 3,
      section: 'IT4R11_Track2',
      sessions: [
        {
          dayCode: 'F',
          start: '7:00 AM',
          end: '10:00 AM',
          room: '51-201',
          faculty: 'Ana Reyes',
        },
      ],
    },
    {
      code: 'GnS',
      title: 'Gender and Society',
      lec: 3,
      lab: 0,
      credit: 3,
      section: 'IT4R11_Track2',
      sessions: [
        {
          dayCode: 'TF',
          start: '1:00 PM',
          end: '2:30 PM',
          room: '',
          faculty: 'Pedro Garcia',
        },
      ],
    },
  ],
};

const COR_TEXT = `
Registration No: 556711 Academic Year/Term : 1st Semester AY 2026-2027
STUDENT GENERAL INFORMATION
Student No: 2099000001 College: COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING
Name: SANTOS, MARIA CLARA R Program: B.S. in Information Technology
Gender: F Nationality: Filipino Major: N/A Curriculum: CITC-BSIT-2018-2019
Age: 21 Contact #: Year Level: 4th Year - Baccalaureate Scholarship/Discount:
CODE SUBJECT TITLE U N I T Lec Lab Credit SECTION SCHEDULE/ROOM FACULTY
IT414 IT Elective 3 2 1 3 IT4R11_Track2 F 7:00 AM - 10:00 AM/09-302(CITC Lab 3) Loredel Tamayo
W 7:00 AM - 9:00 AM/51-201 Loredel Tamayo
IT411 CAPSTONE Project and Research 2 2 1 3 IT411_Rojo JAY NOEL ROJO
GnS Gender and Society 3 0 3 IT4R11_Track2 TF 1:00 PM - 2:30 PM Anton Alfred Endaya
Total Unit(s) 8 2 10
`;

const COR_TEXT_MISSING_PERIOD = `
Registration No: 556711 Academic Year/Term : 1st Semester AY 2026-2027
STUDENT GENERAL INFORMATION
Student No: 2099000002 College: COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING
Name: SANTOS, MARIA CLARA R Program: B.S. in Information Technology
Year Level: 4th Year - Baccalaureate
CODE SUBJECT TITLE U N I T Lec Lab Credit SECTION SCHEDULE/ROOM FACULTY
IT414 IT Elective 3 2 1 3 IT4R11_Track2 F 7:00 AM - 10:00 AM/09-302 Loredel Tamayo
GnS Gender and Society 3 0 3 IT4R11_Track2 TF 1:00 - 2:30 Anton Alfred Endaya
Total Unit(s) 6 0 6
`;

let serial = 0;
const student = (label: string): string => {
  serial += 1;
  const id = `corui-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const mockPickedCor = () => {
  jest.spyOn(corDocument, 'pickCorFile').mockResolvedValue({
    status: 'picked',
    file: {
      uri: 'content://cor.pdf',
      fileName: 'my-cor.pdf',
      mimeType: 'application/pdf',
    },
  });
  jest.spyOn(corDocument, 'retainCorCopy').mockResolvedValue(null);
};

const setPickedDate = (ui: ReturnType<typeof render>, date: Date) =>
  act(() => {
    ui.getByTestId('datetimepicker').props.onChange({type: 'set'}, date);
  });

beforeAll(async () => {
  await initDatabase();
});

afterEach(() => jest.restoreAllMocks());

test('1-screen COR review: all subjects on one screen, no per-subject stepping, one-tap confirm & undo', async () => {
  const user = student('full');
  chooseUstpMode(user);
  mockPickedCor();
  jest
    .spyOn(visionService, 'extractUstpCorFromUri')
    .mockResolvedValue({text: COR_TEXT, parsed: parseUstpCor(COR_TEXT)});
  const onClose = jest.fn();
  const ui = render(
    <ThemeProvider userId={user}>
      <CorReviewFlow userId={user} onClose={onClose} />
    </ThemeProvider>,
  );

  fireEvent.press(ui.getByTestId('cor-choose-file'));
  // Lands directly on the 1-screen review with student, program, term, and all 3 subjects visible.
  expect(await ui.findByTestId('cor-review')).toBeTruthy();
  expect(ui.getByText(/my-cor\.pdf/)).toBeTruthy();
  expect(ui.getByTestId('cor-student-name').props.value).toBe(
    'Maria Clara R. Santos',
  );
  expect(ui.getByText('B.S. in Information Technology')).toBeTruthy();
  expect(ui.getByText('Subjects (3)')).toBeTruthy();
  expect(ui.getByTestId('cor-subject-card-0')).toBeTruthy();
  expect(ui.getByTestId('cor-subject-card-1')).toBeTruthy();
  expect(ui.getByTestId('cor-subject-card-2')).toBeTruthy();
  expect(ui.getAllByText('Ready')).toHaveLength(2);
  expect(ui.getByText('TBA · no schedule')).toBeTruthy();
  expect(ui.queryByText('Needs review')).toBeNull();
  // Nothing is added by reading the COR.
  expect(timeBlocksStore.getAll(user)).toHaveLength(0);
  expect(getUstpEligibility(user).eligible).toBe(false);

  // Comparing with the source returns straight back to the 1-screen review.
  fireEvent.press(ui.getByTestId('cor-view-text'));
  expect(ui.getByTestId('cor-source-text').props.children).toContain('IT414');
  fireEvent.press(ui.getByTestId('cor-source-back'));
  expect(ui.getByTestId('cor-review')).toBeTruthy();

  // Term dates are required before committing.
  fireEvent.press(ui.getByTestId('cor-commit'));
  expect(ui.getByText('Choose the first class date.')).toBeTruthy();

  fireEvent.press(ui.getByTestId('cor-start-date'));
  setPickedDate(ui, new Date(2026, 7, 10, 12));
  fireEvent.press(ui.getByTestId('cor-end-date'));
  setPickedDate(ui, new Date(2026, 11, 18, 12));
  expect(
    ui.getByTestId('cor-recurrence-preview').props.children.join(''),
  ).toMatch(/Mon, Aug 10, 2026 to Fri, Dec 18, 2026/);

  // Confirm all subjects & meetings in one tap (no per-subject clicking needed).
  fireEvent.press(ui.getByTestId('cor-commit'));
  expect(ui.getByText('Added to your schedule.')).toBeTruthy();
  // F + W for IT414, T + F for GnS; IT411 (TBA) makes no timed block.
  expect(
    timeBlocksStore.getAll(user).filter(b => b.category === 'Class'),
  ).toHaveLength(4);
  expect(getUstpEligibility(user).eligible).toBe(true);

  fireEvent.press(ui.getByTestId('cor-undo'));
  expect(timeBlocksStore.getAll(user)).toHaveLength(0);
  expect(getUstpEligibility(user).eligible).toBe(false);
  expect(ui.getByTestId('cor-review')).toBeTruthy();
  expect(ui.getByText(/The import was undone/)).toBeTruthy();
});

test('inline AM/PM fix and 1-tap semester dates resolve flagged meetings on the same screen', async () => {
  const user = student('inline');
  chooseUstpMode(user);
  mockPickedCor();
  jest.spyOn(visionService, 'extractUstpCorFromUri').mockResolvedValue({
    text: COR_TEXT_MISSING_PERIOD,
    parsed: parseUstpCor(COR_TEXT_MISSING_PERIOD),
  });
  const ui = render(
    <ThemeProvider userId={user}>
      <CorReviewFlow userId={user} onClose={jest.fn()} />
    </ThemeProvider>,
  );

  fireEvent.press(ui.getByTestId('cor-choose-file'));
  expect(await ui.findByTestId('cor-review')).toBeTruthy();
  expect(ui.getByTestId('cor-attention-banner')).toBeTruthy();
  expect(ui.getByText('Needs fix')).toBeTruthy();

  // Quick-fill 18-week term dates in 1 tap.
  fireEvent.press(ui.getByTestId('cor-quick-term-dates'));
  expect(ui.getByTestId('cor-recurrence-preview')).toBeTruthy();

  // Tapping confirm now points directly to the ambiguous AM/PM meeting.
  fireEvent.press(ui.getByTestId('cor-commit'));
  expect(ui.getByText(/GnS: Choose AM or PM/i)).toBeTruthy();

  // Fix start & end AM/PM inline on the same review screen without opening sub-screens.
  const draft = corImportStore.getDraft(user)!;
  const gnsMeetingId = draft.courses[1].meetings[0].id;
  fireEvent.press(ui.getByTestId(`cor-inline-start-pm-${gnsMeetingId}`));
  fireEvent.press(ui.getByTestId(`cor-inline-end-pm-${gnsMeetingId}`));
  expect(ui.queryByTestId('cor-attention-banner')).toBeNull();
  expect(ui.getAllByText('Ready')).toHaveLength(2);

  fireEvent.press(ui.getByTestId('cor-commit'));
  expect(ui.getByText('Added to your schedule.')).toBeTruthy();
  expect(getUstpEligibility(user).eligible).toBe(true);
});

test('cancel while reading ignores the late result; a failed read keeps the schedule unchanged', async () => {
  const user = student('cancel');
  chooseUstpMode(user);
  mockPickedCor();
  let finish: (value: {
    text: string;
    parsed: ReturnType<typeof parseUstpCor>;
  }) => void = () => undefined;
  jest.spyOn(visionService, 'extractUstpCorFromUri').mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const ui = render(
    <ThemeProvider userId={user}>
      <CorReviewFlow userId={user} onClose={jest.fn()} />
    </ThemeProvider>,
  );
  fireEvent.press(ui.getByTestId('cor-choose-file'));
  expect(await ui.findByTestId('cor-reading')).toBeTruthy();
  fireEvent.press(ui.getByTestId('cor-cancel-reading'));
  await act(async () =>
    finish({text: COR_TEXT, parsed: parseUstpCor(COR_TEXT)}),
  );
  expect(ui.getByTestId('cor-start')).toBeTruthy();
  expect(corImportStore.getDraft(user)).toBeNull();

  jest
    .spyOn(visionService, 'extractUstpCorFromUri')
    .mockRejectedValueOnce(new Error('ocr'));
  fireEvent.press(ui.getByTestId('cor-choose-file'));
  expect(await ui.findByTestId('cor-failed')).toBeTruthy();
  expect(timeBlocksStore.getAll(user)).toHaveLength(0);
  // A failed COR never turns the student into "not USTP".
  expect(getUstpEligibility(user).reason).toBe('cor_pending');
});

test('a saved draft resumes directly to the 1-screen review after a restart', async () => {
  const user = student('resume');
  mockPickedCor();
  jest
    .spyOn(visionService, 'extractUstpCorFromUri')
    .mockResolvedValue({text: COR_TEXT, parsed: parseUstpCor(COR_TEXT)});
  const first = render(
    <ThemeProvider userId={user}>
      <CorReviewFlow userId={user} onClose={jest.fn()} />
    </ThemeProvider>,
  );
  fireEvent.press(first.getByTestId('cor-choose-file'));
  await first.findByTestId('cor-review');
  fireEvent.changeText(first.getByTestId('cor-student-name'), 'Lemar Gonzales');
  first.unmount();

  const again = render(
    <ThemeProvider userId={user}>
      <CorReviewFlow userId={user} onClose={jest.fn()} />
    </ThemeProvider>,
  );
  expect(again.getByText('Continue your COR review?')).toBeTruthy();
  fireEvent.press(again.getByTestId('cor-resume'));
  expect(again.getByTestId('cor-student-name').props.value).toBe(
    'Lemar Gonzales',
  );
});

test('a restored USTP chat for a student without a confirmed COR shows an explanation, not answers', async () => {
  const user = student('chatgate');
  userStore.setCurrentUser(user);
  chooseUstpMode(user);
  chatStore.startNewUstpChat(user);
  chatStore.addMessage(user, 'user', 'What is the passing grade?');
  const ui = render(
    <ThemeProvider userId={user}>
      <ChatScreen userId={user} refreshTrigger={0} onRefresh={jest.fn()} />
    </ThemeProvider>,
  );
  expect(await ui.findByTestId('chat-ustp-unavailable')).toBeTruthy();
  expect(
    ui.getByText(/become available after you review and confirm your USTP COR/),
  ).toBeTruthy();
  expect(ui.queryByText('What is the passing grade?')).toBeNull();
  fireEvent.press(ui.getByTestId('chat-ustp-unavailable-back'));
  await waitFor(() =>
    expect(ui.queryByTestId('chat-ustp-unavailable')).toBeNull(),
  );
});

test('the review shows how the COR was read: exact for a portal PDF, itemized problems otherwise', async () => {
  const user = student('accuracy');
  chooseUstpMode(user);
  mockPickedCor();
  const page = buildSyntheticCorPage(ACCURACY_COR);
  const spy = jest
    .spyOn(visionService, 'extractUstpCorFromUri')
    .mockResolvedValue(chooseCorReading({pdfWords: page})!);
  const ui = render(
    <ThemeProvider userId={user}>
      <CorReviewFlow userId={user} onClose={jest.fn()} />
    </ThemeProvider>,
  );
  fireEvent.press(ui.getByTestId('cor-choose-file'));
  expect(await ui.findByTestId('cor-accuracy-exact')).toBeTruthy();
  expect(ui.getByText('Read exactly from your COR PDF')).toBeTruthy();
  expect(ui.queryByTestId('cor-accuracy-issue')).toBeNull();

  // A misread credit digit in an image is itemized, not hidden.
  const credit = page.words.findIndex(w => w.t === '3' && w.x0 === 282.3);
  const misread = toOcrPage({
    ...page,
    words: page.words.map((w, i) => (i === credit ? {...w, t: '8'} : w)),
  });
  spy.mockResolvedValue(chooseCorReading({ocrWords: misread, ocrText: null})!);
  fireEvent.press(ui.getByTestId('cor-replace'));
  expect(await ui.findByTestId('cor-accuracy-needs_attention')).toBeTruthy();
  const issues = ui.getAllByTestId('cor-accuracy-issue');
  expect(
    issues.some(node => String(node.props.children).includes('Total Unit(s)')),
  ).toBe(true);
});
