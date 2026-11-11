import React from 'react';
import {Alert} from 'react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {CalendarScreen} from '../../src/ui/screens/calendar';
import {ClassScheduleModal} from '../../src/ui/screens/calendar/components/ClassScheduleModal';
import {
  formatDaysBadge,
  isDraftUntouched,
  validateManualClassDraft,
} from '../../src/ui/screens/calendar/utils/classScheduleHelpers';
import {
  academicProfileStore,
  db,
  initDatabase,
  parseClassBlockMetadata,
  syncOutboxStore,
  timeBlocksStore,
  userStore,
} from '../../src/storage';
import {visionService} from '../../src/ai/vision/visionService';
import {parseUstpCor} from '../../src/ai/vision/ustpCorParser';

const SAMPLE_COR_TEXT = `
Registration No: 556711 Academic Year/Term : 1st Semester AY 2026-2027
STUDENT GENERAL INFORMATION
Student No: 2023305519 College: COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING
Name: SANTOS, MARIA CLARA R Program: B.S. in Information Technology
Gender: F Nationality: Filipino Major: N/A Curriculum: CITC-BSIT-2018-2019
Age: 21 Contact #: Year Level: 3rd Year - Baccalaureate Scholarship/Discount:
CODE SUBJECT TITLE U N I T Lec Lab Credit SECTION SCHEDULE/ROOM FACULTY
IT311 Systems Integration 2 1 3 IT3R1 MWF 9:00 AM - 10:00 AM/09-301 Loredel Tamayo
IT312 Information Assurance 3 0 3 IT3R1 TTH 1:00 PM - 2:30 PM/51-202 Anton Alfred Endaya
Total Unit(s) 5 1 6
ASSESSSED FEES
`;

describe('Calendar Class Schedule / COR Manual Entry', () => {
  let userId: string;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM sync_outbox');
    db.executeSync('DELETE FROM reminders');
    db.executeSync('DELETE FROM notes');
    db.executeSync('DELETE FROM custom_categories');
    db.executeSync('DELETE FROM time_blocks');
    db.executeSync('DELETE FROM events');
    db.executeSync('DELETE FROM tasks');
    db.executeSync('DELETE FROM local_settings');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM users');

    const guest = userStore.createGuestUser();
    userId = guest.id;
  });

  test('validates manual class drafts and formats weekday patterns', () => {
    expect(
      isDraftUntouched({
        code: '',
        subjectTitle: '',
        days: ['Monday', 'Wednesday', 'Friday'],
        startTime: '09:00',
        endTime: '10:30',
        room: '',
        section: 'IT4R11',
        faculty: '',
        recurrenceMode: 'semester',
      }),
    ).toBe(true);

    expect(
      validateManualClassDraft({
        code: 'IT414',
        subjectTitle: '',
        days: ['Monday'],
        startTime: '09:00',
        endTime: '10:00',
        room: '',
        section: '',
        faculty: '',
        recurrenceMode: 'semester',
      }),
    ).toBe('Enter a subject title.');

    expect(
      validateManualClassDraft({
        code: 'IT414',
        subjectTitle: 'IT Elective 3',
        days: [],
        startTime: '09:00',
        endTime: '10:00',
        room: '',
        section: '',
        faculty: '',
        recurrenceMode: 'semester',
      }),
    ).toBe('Select at least one class day.');

    expect(
      validateManualClassDraft({
        code: 'IT414',
        subjectTitle: 'IT Elective 3',
        days: ['Monday'],
        startTime: '11:00',
        endTime: '10:00',
        room: '',
        section: '',
        faculty: '',
        recurrenceMode: 'semester',
      }),
    ).toBe('End time must be after start time.');

    expect(formatDaysBadge(['Wednesday', 'Monday', 'Friday'])).toBe('MWF');
    expect(formatDaysBadge(['Thursday', 'Tuesday'])).toBe('TTH');
    expect(formatDaysBadge(['Monday', 'Thursday'])).toBe('Mon, Thu');
  });

  test('saves single manually entered class directly from Calendar Options into recurring Class blocks', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onRefresh = jest.fn();

    const {getByTestId, queryByTestId} = render(
      <ThemeProvider userId={userId}>
        <CalendarScreen
          userId={userId}
          refreshTrigger={0}
          onRefresh={onRefresh}
        />
      </ThemeProvider>,
    );

    fireEvent.press(getByTestId('calendar-more-menu-button'));
    fireEvent.press(getByTestId('calendar-add-cor-schedule-button'));
    expect(getByTestId('class-schedule-modal')).toBeTruthy();

    fireEvent.changeText(getByTestId('class-code-input'), 'IT414');
    fireEvent.changeText(getByTestId('class-section-input'), 'IT4R11');
    fireEvent.changeText(getByTestId('class-title-input'), 'IT Elective 3');
    fireEvent.press(getByTestId('class-preset-TTH'));
    fireEvent.changeText(getByTestId('class-room-input'), '09-302');
    fireEvent.changeText(getByTestId('class-faculty-input'), 'Prof. Tamayo');

    fireEvent.press(getByTestId('class-schedule-save-button'));

    const blocks = timeBlocksStore.getAll(userId);
    expect(blocks).toHaveLength(2);
    expect(blocks.every(b => b.category === 'Class')).toBe(true);
    expect(blocks.every(b => b.title === 'IT414 · IT Elective 3')).toBe(true);
    expect(
      blocks.every(b => b.recurrenceRule?.includes('FREQ=WEEKLY;UNTIL=')),
    ).toBe(true);

    const meta = parseClassBlockMetadata(blocks[0].notes);
    expect(meta).toEqual({
      room: '09-302',
      section: 'IT4R11',
      faculty: 'Prof. Tamayo',
      summaryLine: '09-302 · IT4R11 · Prof. Tamayo',
    });

    expect(
      syncOutboxStore.getPendingMutations(userId).length,
    ).toBeGreaterThanOrEqual(2);
    expect(academicProfileStore.get(userId)).toBeNull();
    expect(onRefresh).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();
    expect(queryByTestId('class-schedule-modal')).toBeNull();
  });

  test('supports queuing multiple classes, removing/editing, and saving optional manual COR details', () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSaved = jest.fn();
    const onClose = jest.fn();
    const originalUsername = userStore.getUserById(userId)?.username;

    const {getByTestId, getByText} = render(
      <ThemeProvider userId={userId}>
        <ClassScheduleModal
          visible={true}
          userId={userId}
          timeFormat24h={false}
          onClose={onClose}
          onSaved={onSaved}
        />
      </ThemeProvider>,
    );

    // Validation check before entering title
    fireEvent.press(getByTestId('class-schedule-save-button'));
    expect(getByText('Enter a subject title.')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();

    // Queue first subject (MWF default -> 3 sessions)
    fireEvent.changeText(getByTestId('class-code-input'), 'CS201');
    fireEvent.changeText(getByTestId('class-section-input'), 'CS2A');
    fireEvent.changeText(getByTestId('class-title-input'), 'Data Structures');
    fireEvent.changeText(getByTestId('class-room-input'), 'Lab 1');
    fireEvent.press(getByTestId('class-add-to-list-button'));

    expect(getByText('Queued Subjects (1)')).toBeTruthy();
    // Section preserved for rapid multi-subject entry
    expect(getByTestId('class-section-input').props.value).toBe('CS2A');

    // Queue second subject (TTH -> 2 sessions)
    fireEvent.changeText(getByTestId('class-code-input'), 'CS202');
    fireEvent.changeText(getByTestId('class-title-input'), 'Algorithms');
    fireEvent.press(getByTestId('class-preset-TTH'));
    fireEvent.press(getByTestId('class-duration-weekly'));
    fireEvent.press(getByTestId('class-add-to-list-button'));

    expect(getByText('Queued Subjects (2)')).toBeTruthy();

    // Fill optional Student / COR details
    fireEvent.press(getByTestId('class-cor-info-toggle'));
    fireEvent.changeText(
      getByTestId('class-cor-student-no-input'),
      '202400123',
    );
    fireEvent.changeText(
      getByTestId('class-cor-program-input'),
      'BS Computer Science',
    );
    fireEvent.changeText(
      getByTestId('class-cor-term-input'),
      '1st Sem 2026-2027',
    );

    fireEvent.press(getByTestId('class-schedule-save-button'));

    const blocks = timeBlocksStore.getAll(userId);
    expect(blocks).toHaveLength(5);
    const algoBlocks = blocks.filter(b => b.title === 'CS202 · Algorithms');
    expect(algoBlocks).toHaveLength(2);
    expect(algoBlocks.every(b => b.recurrenceRule === 'FREQ=WEEKLY')).toBe(
      true,
    );

    const profile = academicProfileStore.get(userId);
    expect(profile).not.toBeNull();
    expect(profile?.studentNo).toBe('202400123');
    expect(profile?.program).toBe('BS Computer Science');
    expect(profile?.academicTerm).toBe('1st Sem 2026-2027');
    expect(profile?.courses).toHaveLength(2);
    expect(userStore.getUserById(userId)?.username).toBe(originalUsername);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('can extract a USTP COR into the editable list from Scan COR / Photo tab and save', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const parsed = parseUstpCor(
      SAMPLE_COR_TEXT,
      new Date('2026-11-11T09:00:00Z'),
    );
    jest.spyOn(visionService, 'pickCorDocument').mockResolvedValue({
      uri: 'file:///cor.pdf',
      name: 'cor.pdf',
    });
    jest.spyOn(visionService, 'scanUstpCorFromUri').mockResolvedValue(parsed);

    const onSaved = jest.fn();
    const onClose = jest.fn();

    const {getByTestId, findByText} = render(
      <ThemeProvider userId={userId}>
        <ClassScheduleModal
          visible={true}
          userId={userId}
          timeFormat24h={false}
          onClose={onClose}
          onSaved={onSaved}
        />
      </ThemeProvider>,
    );

    fireEvent.press(getByTestId('class-schedule-mode-scan'));
    fireEvent.press(getByTestId('class-schedule-upload-cor'));

    expect(await findByText('Queued Subjects (2)')).toBeTruthy();

    fireEvent.press(getByTestId('class-schedule-save-button'));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    const blocks = timeBlocksStore.getAll(userId);
    expect(blocks).toHaveLength(5);
    const savedProfile = academicProfileStore.get(userId);
    expect(savedProfile?.isUstpStudent).toBe(true);
    expect(savedProfile?.studentNo).toBe('2023305519');
    expect(savedProfile?.formattedName).toBe('Maria Clara R. Santos');
  });
});
