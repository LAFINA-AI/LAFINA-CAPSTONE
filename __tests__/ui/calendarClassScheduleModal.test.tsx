import React from 'react';
import {Alert} from 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
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
import {getUstpEligibility} from '../../src/storage/ustpEligibility';
import {studentSetupStore} from '../../src/storage/studentSetupStore';
import {visionService} from '../../src/ai/vision/visionService';

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

  test('supports queuing multiple classes and saves them without creating a school profile', () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSaved = jest.fn();
    const onClose = jest.fn();
    const originalUsername = userStore.getUserById(userId)?.username;

    const {getByTestId, getByText, queryByTestId} = render(
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

    // Onboarding redesign: no manual campus/program/student details here.
    expect(queryByTestId('class-cor-info-toggle')).toBeNull();
    expect(queryByTestId('class-cor-program-input')).toBeNull();

    fireEvent.press(getByTestId('class-schedule-save-button'));

    const blocks = timeBlocksStore.getAll(userId);
    expect(blocks).toHaveLength(5);
    const algoBlocks = blocks.filter(b => b.title === 'CS202 · Algorithms');
    expect(algoBlocks).toHaveLength(2);
    expect(algoBlocks.every(b => b.recurrenceRule === 'FREQ=WEEKLY')).toBe(
      true,
    );

    // Manual classes are schedule blocks only; they never enable USTP features.
    expect(academicProfileStore.get(userId)).toBeNull();
    expect(getUstpEligibility(userId).eligible).toBe(false);
    expect(userStore.getUserById(userId)?.username).toBe(originalUsername);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('a COR from Calendar opens the full review and saves nothing before confirmation', async () => {
    const scan = jest.spyOn(visionService, 'scanUstpCorFromUri');
    const onSaved = jest.fn();
    const {getByTestId, findByTestId} = render(
      <ThemeProvider userId={userId}>
        <ClassScheduleModal
          visible={true}
          userId={userId}
          timeFormat24h={false}
          onClose={jest.fn()}
          onSaved={onSaved}
        />
      </ThemeProvider>,
    );

    fireEvent.press(getByTestId('class-schedule-mode-scan'));
    fireEvent.press(getByTestId('class-schedule-upload-cor'));

    expect(await findByTestId('cor-start')).toBeTruthy();
    // Uploading a COR is an explicit USTP choice, but stays pending until review.
    expect(studentSetupStore.get(userId)).toMatchObject({
      affiliation: 'ustp',
      corStatus: 'pending',
    });
    expect(scan).not.toHaveBeenCalled();
    fireEvent.press(getByTestId('cor-later'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(timeBlocksStore.getAll(userId)).toHaveLength(0);
    expect(academicProfileStore.get(userId)).toBeNull();
  });
});
