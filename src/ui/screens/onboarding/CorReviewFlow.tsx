import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {Fonts} from '../../theme';
import {visionService} from '../../../ai/vision/visionService';
import {
  deleteCorCopy,
  openCorOriginal,
  pickCorFile,
  retainCorCopy,
} from '../../../ai/vision/corDocument';
import {
  WEEKDAYS,
  WEEKDAY_NAMES,
  acknowledgeOverlap,
  addCourse,
  addMeeting,
  buildCorDraft,
  clockLabel,
  confirmAllValidItems,
  countWeeklyOccurrences,
  courseNeedsAttention,
  courseProblems,
  courseReviewState,
  draftLocalId,
  draftReadiness,
  editAcademic,
  editCourse,
  editMeeting,
  editStudentName,
  editTerm,
  formatDisplayDate,
  formatIsoDate,
  isIsoDate,
  isMeetingValid,
  isReviewableExtraction,
  meetingProblems,
  meetingSummary,
  parseIsoDate,
  removeMeeting,
  semesterTermDates,
  setCourseIncluded,
  termProblems,
} from '../../../ai/vision/corReviewModel';
import type {
  ClockTime,
  CorDraft,
  CorDraftCourse,
  CorDraftMeeting,
  Meridiem,
  Weekday,
} from '../../../ai/vision/corReviewModel';
import {corImportStore} from '../../../storage/corImportStore';
import type {CommitResult} from '../../../storage/corImportStore';
import {refreshAcademicMemories} from '../../../storage/onboardingMemory';
import {
  Card,
  ChoiceButton,
  Field,
  InlineActions,
  Notice,
  OnboardingPage,
  ReadonlyValue,
  SecondaryButton,
  SlimRow,
  Tag,
  TagRow,
  onboardingStyles,
  useOnboardingTokens,
} from './onboardingUi';

/**
 * Simplified 1-screen COR verification (used by onboarding, Profile and Schedule).
 * Extraction produces a draft shown all on one scrollable review screen:
 * clean subjects and TBA subjects are ready immediately without per-subject
 * pagination, ambiguous items (e.g. missing AM/PM) can be fixed inline, and
 * confirming saves blocks, profile, ledger and setup state in one transaction.
 *
 * This enables LAFINA's USTP features on this phone. It is product
 * eligibility, not official USTP identity verification.
 */
export type CorReviewOutcome =
  | {status: 'confirmed'; result: CommitResult}
  | {status: 'later'}
  | {status: 'cancelled'};

export interface CorReviewFlowProps {
  userId: string;
  onClose: (outcome: CorReviewOutcome) => void;
  /** Words for the "not now" link (onboarding: "I'll add my COR later"). */
  laterLabel?: string;
}

type Screen =
  | {name: 'start'}
  | {name: 'reading'}
  | {name: 'failed'; message: string}
  | {name: 'review'}
  | {name: 'subjectEdit'; courseId: string}
  | {name: 'meetingWhen'; courseId: string; meetingId: string}
  | {name: 'meetingWhere'; courseId: string; meetingId: string}
  | {name: 'source'; courseId: string | null; back: Screen}
  | {name: 'saveFailed'; message: string}
  | {name: 'done'; result: CommitResult};

const DAY_SHORT: Record<Weekday, string> = {
  Mon: 'M',
  Tue: 'T',
  Wed: 'W',
  Thu: 'Th',
  Fri: 'F',
  Sat: 'Sa',
  Sun: 'Su',
};

type CourseTag = {label: string; tone: 'neutral' | 'good' | 'attention'};

export const courseTag = (
  course: CorDraftCourse,
  committed: boolean,
): CourseTag => {
  if (!course.included) return {label: 'Excluded', tone: 'neutral'};
  if (committed && courseReviewState(course) === 'reviewed') {
    return {label: 'Added', tone: 'good'};
  }
  if (courseNeedsAttention(course) !== null) {
    return {label: 'Needs fix', tone: 'attention'};
  }
  if (course.meetings.length === 0) {
    return {label: 'TBA · no schedule', tone: 'neutral'};
  }
  return {label: 'Ready', tone: 'good'};
};

const meetingStatusLabel = (meeting: CorDraftMeeting): string => {
  if (meeting.notices.length > 0 || !isMeetingValid(meeting)) {
    return 'Needs fix';
  }
  const parts = [meeting.room, meeting.faculty].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Edit';
};

export const CorReviewFlow: React.FC<CorReviewFlowProps> = ({
  userId,
  onClose,
  laterLabel = 'Not now',
}) => {
  const t = useOnboardingTokens();
  const [draft, setDraftState] = useState<CorDraft | null>(() => {
    const saved = corImportStore.getDraft(userId);
    return saved && saved.status === 'draft' ? saved : null;
  });
  const [resumable] = useState(() => draft !== null);
  const [screen, setScreen] = useState<Screen>({name: 'start'});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState(false);
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);
  const runRef = useRef(0);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      runRef.current += 1;
    },
    [],
  );

  const go = useCallback((next: Screen) => {
    setError(null);
    setNotice(null);
    setPicker(null);
    setScreen(next);
  }, []);

  /** Every review change is saved, so the review resumes after a restart. */
  const update = useCallback(
    (fn: (current: CorDraft) => CorDraft) => {
      setDraftState(current => {
        if (!current) return current;
        const next = fn(current);
        setSaveWarning(!corImportStore.saveDraft(userId, next));
        return next;
      });
    },
    [userId],
  );

  const readiness = useMemo(
    () => (draft ? draftReadiness(draft) : null),
    [draft],
  );
  const courses = useMemo(() => draft?.courses ?? [], [draft]);
  const findCourse = (id: string) => courses.find(c => c.id === id) ?? null;
  const findMeeting = (courseId: string, meetingId: string) =>
    findCourse(courseId)?.meetings.find(m => m.id === meetingId) ?? null;
  const conflictCount = readiness
    ? readiness.overlaps.length +
      readiness.duplicateMeetings.length +
      readiness.duplicateSubjects.length
    : 0;

  const back = useCallback((): boolean => {
    switch (screen.name) {
      case 'start':
        onClose({status: 'cancelled'});
        return true;
      case 'reading':
        runRef.current += 1;
        go(draft ? {name: 'review'} : {name: 'start'});
        return true;
      case 'failed':
      case 'review':
        go({name: 'start'});
        return true;
      case 'subjectEdit':
      case 'meetingWhen':
      case 'saveFailed':
        go({name: 'review'});
        return true;
      case 'meetingWhere':
        go({
          name: 'meetingWhen',
          courseId: screen.courseId,
          meetingId: screen.meetingId,
        });
        return true;
      case 'source':
        go(screen.back);
        return true;
      case 'done':
        return true;
    }
    return false;
  }, [screen, draft, go, onClose]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      back,
    );
    return () => subscription.remove();
  }, [back]);

  const chooseFile = async () => {
    setError(null);
    const outcome = await pickCorFile();
    if (!mounted.current) return;
    if (outcome.status === 'cancelled') {
      setNotice('No file was chosen. Your schedule has not changed.');
      return;
    }
    if (outcome.status === 'failed') {
      go({name: 'failed', message: outcome.message});
      return;
    }
    const run = ++runRef.current;
    go({name: 'reading'});
    try {
      const {text, parsed} = await visionService.extractUstpCorFromUri(
        outcome.file.uri,
      );
      if (run !== runRef.current || !mounted.current) return;
      if (!isReviewableExtraction(parsed)) {
        go({
          name: 'failed',
          message:
            'LAFINA could not find USTP COR details in that file. Try a clearer PDF or a screenshot of the whole COR.',
        });
        return;
      }
      const draftId = draftLocalId('cordraft');
      const localPath = await retainCorCopy(outcome.file, draftId);
      if (run !== runRef.current || !mounted.current) {
        await deleteCorCopy(localPath);
        return;
      }
      const next = buildCorDraft(parsed, {
        ownerId: userId,
        draftId,
        document: {
          fileName: outcome.file.fileName,
          localPath,
          mimeType: outcome.file.mimeType,
        },
        sourceText: text,
      });
      // Replacing a draft never touches the active (already confirmed) schedule.
      const previousCopy = draft?.document?.localPath;
      setSaveWarning(!corImportStore.saveDraft(userId, next));
      setDraftState(next);
      if (previousCopy && previousCopy !== localPath) {
        await deleteCorCopy(previousCopy);
      }
      go({name: 'review'});
    } catch (readError) {
      console.warn('[CorReviewFlow] COR reading failed:', readError);
      if (run !== runRef.current || !mounted.current) return;
      go({
        name: 'failed',
        message:
          'The COR could not be read on this phone. Try again or choose another file.',
      });
    }
  };

  const viewOriginal = async () => {
    const opened = await openCorOriginal(
      draft?.document?.localPath,
      draft?.document?.mimeType,
    );
    if (!opened && mounted.current) {
      setNotice(
        'The original file is no longer available. You can compare with the recognized text instead.',
      );
    }
  };

  const firstReviewError = (current: CorDraft): string | null => {
    if (!current.studentName.trim()) {
      return 'Enter your name as it appears on the COR.';
    }
    if (!current.campus.trim()) {
      return 'Campus was not detected. Replace the COR with a clearer copy.';
    }
    if (!current.program.trim()) {
      return 'Program was not detected. Replace the COR with a clearer copy.';
    }
    if (!current.yearLevel.trim()) {
      return 'Enter your year level.';
    }
    const termErr = termProblems(current)[0];
    if (termErr) return termErr;
    const included = current.courses.filter(c => c.included);
    if (included.length === 0) {
      return 'Include at least one subject.';
    }
    for (const course of included) {
      const problem = courseNeedsAttention(course);
      if (problem) {
        return `${course.code || 'Subject'}: ${problem}`;
      }
    }
    const ready = draftReadiness(confirmAllValidItems(current));
    if (ready.duplicateSubjects.length > 0) {
      const dup = ready.duplicateSubjects[0];
      return `${dup.code} appears more than once. Exclude or edit one above.`;
    }
    if (ready.duplicateMeetings.length > 0) {
      const dup = ready.duplicateMeetings[0];
      return `${dup.course.code} has a repeated class time. Remove the repeat above.`;
    }
    if (ready.overlaps.length > 0) {
      const ov = ready.overlaps[0];
      return `${ov.first.course.code || 'Two classes'} and ${
        ov.second.course.code || 'another class'
      } overlap. Tap Keep both or edit above.`;
    }
    return null;
  };

  const commit = () => {
    if (!draft) return;
    setError(null);
    const validationError = firstReviewError(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    const confirmed = confirmAllValidItems(draft);
    setDraftState(confirmed);
    corImportStore.saveDraft(userId, confirmed);
    try {
      const result = corImportStore.commitDraft(userId, confirmed);
      try {
        refreshAcademicMemories(userId);
      } catch (memoryError) {
        console.warn(
          '[CorReviewFlow] Academic memory refresh failed:',
          memoryError,
        );
      }
      setDraftState(corImportStore.getDraft(userId));
      go({name: 'done', result});
    } catch (commitError) {
      console.error('[CorReviewFlow] COR import failed:', commitError);
      const notReady = (commitError as {code?: string})?.code === 'not_ready';
      go({
        name: 'saveFailed',
        message: notReady
          ? 'Some details still need fixing before they can be added.'
          : 'Your classes could not be saved. Nothing was added. Try again.',
      });
    }
  };

  const undo = () => {
    try {
      const undone = corImportStore.undoLatestImport(userId);
      try {
        refreshAcademicMemories(userId);
      } catch (memoryError) {
        console.warn(
          '[CorReviewFlow] Academic memory refresh failed:',
          memoryError,
        );
      }
      const restored = corImportStore.getDraft(userId);
      setDraftState(restored && restored.status === 'draft' ? restored : null);
      go({name: 'review'});
      setNotice(
        undone
          ? 'The import was undone. Classes added by it were removed; your other plans are unchanged.'
          : 'There was nothing to undo.',
      );
    } catch (undoError) {
      console.error('[CorReviewFlow] Undo failed:', undoError);
      setError('The import could not be undone. Try again.');
    }
  };

  const laterAction = {
    label: laterLabel,
    onPress: () => onClose({status: 'later'}),
    testID: 'cor-later',
  };
  const warning = saveWarning
    ? 'Review progress could not be saved on this phone.'
    : null;

  // -------------------------------------------------------------------------
  if (screen.name === 'start') {
    return (
      <OnboardingPage
        pageKey="cor-start"
        headLabel="USTP COR setup"
        onBack={() => onClose({status: 'cancelled'})}
        title={
          resumable && draft
            ? 'Continue your COR review?'
            : 'Add your USTP COR.'
        }
        copy={
          resumable && draft
            ? `Saved review of ${
                draft.document?.fileName ?? 'your COR'
              }. Nothing has been added yet.`
            : 'LAFINA reads your Certificate of Registration offline and shows everything on one screen to review.'
        }
        error={error}
        note="This turns on LAFINA's USTP features. It is not official USTP verification."
        primary={
          resumable && draft
            ? {
                label: 'Continue review',
                onPress: () => go({name: 'review'}),
                testID: 'cor-resume',
              }
            : {
                label: 'Choose COR file',
                onPress: chooseFile,
                testID: 'cor-choose-file',
              }
        }
        secondary={laterAction}
        testID="cor-start"
      >
        {resumable && draft ? (
          <SecondaryButton
            label="Use a different COR file"
            onPress={chooseFile}
            testID="cor-replace-start"
          />
        ) : (
          <Card>
            <Text style={[onboardingStyles.body, {color: t.ink}]}>
              • PDF or screenshot, read offline{'\n'}• Review all subjects on
              one screen{'\n'}• Nothing is added until you confirm
            </Text>
          </Card>
        )}
        {notice ? <Notice text={notice} testID="cor-notice" /> : null}
      </OnboardingPage>
    );
  }

  if (screen.name === 'reading') {
    return (
      <OnboardingPage
        pageKey="cor-reading"
        headLabel="USTP COR setup"
        title="Reading your COR…"
        copy="Text is recognized on this phone. This can take a little while."
        primary={{label: 'Cancel', onPress: back, testID: 'cor-cancel-reading'}}
        testID="cor-reading"
      >
        <View style={styles.center} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={t.accent} />
        </View>
      </OnboardingPage>
    );
  }

  if (screen.name === 'failed') {
    return (
      <OnboardingPage
        pageKey="cor-failed"
        headLabel="USTP COR setup"
        onBack={back}
        title="We couldn't read that COR."
        error={screen.message}
        copy="Your schedule has not changed. USTP features stay off until a COR is added."
        primary={{
          label: 'Try another file',
          onPress: chooseFile,
          testID: 'cor-retry',
        }}
        secondary={laterAction}
        testID="cor-failed"
      />
    );
  }

  if (!draft || !readiness) {
    return (
      <OnboardingPage
        pageKey="cor-missing"
        headLabel="USTP COR setup"
        onBack={() => go({name: 'start'})}
        title="Choose your COR again."
        copy="The saved review is not available."
        error={error}
        note={notice ?? undefined}
        primary={{
          label: 'Choose COR file',
          onPress: chooseFile,
          testID: 'cor-choose-file',
        }}
        secondary={laterAction}
      />
    );
  }

  const committed = draft.status === 'committed';

  if (screen.name === 'source') {
    const course = screen.courseId ? findCourse(screen.courseId) : null;
    const excerpt = course
      ? [course.sourceText, ...course.meetings.map(m => m.sourceText)]
          .filter(Boolean)
          .filter((v, i, all) => all.indexOf(v) === i)
          .join('\n')
      : draft.sourceText;
    return (
      <OnboardingPage
        pageKey={`cor-source-${screen.courseId ?? 'all'}`}
        headLabel="Compare with your COR"
        onBack={back}
        scrollable
        title={
          course
            ? `${course.code || 'Subject'} on your COR`
            : 'Recognized COR text'
        }
        note={notice ?? undefined}
        primary={{
          label: 'Back to review',
          onPress: back,
          testID: 'cor-source-back',
        }}
        secondary={{
          label: 'Open original file',
          onPress: viewOriginal,
          testID: 'cor-source-original',
        }}
        testID="cor-source"
      >
        <Card>
          <Text
            style={[onboardingStyles.excerpt, {color: t.ink}]}
            selectable
            testID="cor-source-text"
          >
            {excerpt || 'No recognized text was kept for this item.'}
          </Text>
        </Card>
      </OnboardingPage>
    );
  }

  if (screen.name === 'subjectEdit') {
    const course = findCourse(screen.courseId);
    if (!course) {
      return <MissingItem onBack={() => go({name: 'review'})} />;
    }
    return (
      <OnboardingPage
        pageKey={`cor-subject-edit-${course.id}`}
        headLabel="Edit subject"
        onBack={back}
        scrollable
        title="Subject details."
        error={error ?? warning}
        primary={{
          label: 'Done',
          onPress: () => {
            const problems = courseProblems(course);
            if (problems.length) return setError(problems[0]);
            go({name: 'review'});
          },
          testID: 'cor-subject-edit-done',
        }}
      >
        <View style={onboardingStyles.rowGap}>
          <View style={onboardingStyles.flex1}>
            <Field
              label="Code"
              value={course.code}
              onChangeText={value =>
                update(d => editCourse(d, course.id, {code: value}))
              }
              maxLength={24}
              autoCapitalize="characters"
              testID="cor-subject-code"
            />
          </View>
          <View style={styles.unitsField}>
            <Field
              label="Units"
              value={course.units}
              onChangeText={value =>
                update(d =>
                  editCourse(d, course.id, {
                    units: value.replace(/[^0-9.]/g, ''),
                  }),
                )
              }
              maxLength={5}
              keyboardType="decimal-pad"
              testID="cor-subject-units"
            />
          </View>
        </View>
        <Field
          label="Title"
          value={course.title}
          onChangeText={value =>
            update(d => editCourse(d, course.id, {title: value}))
          }
          maxLength={160}
          testID="cor-subject-title"
        />
      </OnboardingPage>
    );
  }

  if (screen.name === 'meetingWhen' || screen.name === 'meetingWhere') {
    const course = findCourse(screen.courseId);
    const meeting = findMeeting(screen.courseId, screen.meetingId);
    if (!course || !meeting) {
      return <MissingItem onBack={() => go({name: 'review'})} />;
    }
    const edit = (patch: Parameters<typeof editMeeting>[3]) =>
      update(d => editMeeting(d, course.id, meeting.id, patch));
    const remove = () => {
      update(d => removeMeeting(d, course.id, meeting.id));
      go({name: 'review'});
    };
    if (screen.name === 'meetingWhen') {
      return (
        <OnboardingPage
          pageKey={`cor-meeting-when-${meeting.id}`}
          headLabel={`${course.code || 'Subject'} · Class time`}
          onBack={back}
          scrollable
          title="Day and time."
          error={error ?? warning}
          primary={{
            label: 'Save time',
            onPress: () => {
              const problems = meetingProblems(meeting);
              if (problems.length) return setError(problems[0]);
              go({name: 'review'});
            },
            testID: 'cor-meeting-save',
          }}
          secondary={{
            label: 'Edit room & instructor',
            onPress: () => {
              const problems = meetingProblems(meeting);
              if (problems.length) return setError(problems[0]);
              go({
                name: 'meetingWhere',
                courseId: course.id,
                meetingId: meeting.id,
              });
            },
            testID: 'cor-meeting-next',
          }}
        >
          <Text style={[styles.label, {color: t.ink}]}>Days</Text>
          <View style={styles.days}>
            {WEEKDAYS.map(day => (
              <ChoiceButton
                key={day}
                label={DAY_SHORT[day]}
                accessibilityLabel={WEEKDAY_NAMES[day]}
                selected={meeting.days.includes(day)}
                onPress={() =>
                  edit({
                    days: meeting.days.includes(day)
                      ? meeting.days.filter(d => d !== day)
                      : [...meeting.days, day],
                  })
                }
                testID={`cor-day-${day}`}
              />
            ))}
          </View>
          <ClockField
            key={`${meeting.id}-start`}
            label="Starts"
            clock={meeting.start}
            onChange={start => edit({start})}
            testID="cor-start"
          />
          <ClockField
            key={`${meeting.id}-end`}
            label="Ends"
            clock={meeting.end}
            onChange={end => edit({end})}
            testID="cor-end"
          />
          {meeting.notices.length ? (
            <Notice
              testID="cor-meeting-notice"
              text={
                meeting.notices.includes('days_unclear')
                  ? 'The class days were unclear on the COR. Choose them yourself.'
                  : meeting.notices.includes('time_unclear')
                  ? 'The class time was unclear on the COR. Enter it yourself.'
                  : 'The COR did not show AM or PM. Choose the right one.'
              }
            />
          ) : null}
          <SecondaryButton
            label="Remove this class time"
            onPress={remove}
            testID="cor-remove-meeting"
          />
        </OnboardingPage>
      );
    }
    return (
      <OnboardingPage
        pageKey={`cor-meeting-where-${meeting.id}`}
        headLabel={`${course.code || 'Subject'} · Details`}
        onBack={back}
        scrollable
        title="Place and instructor."
        copy={meetingSummary(meeting)}
        error={error ?? warning}
        primary={{
          label: 'Done',
          onPress: () => go({name: 'review'}),
          testID: 'cor-confirm-meeting',
        }}
        secondary={{
          label: 'Compare with COR',
          onPress: () =>
            go({name: 'source', courseId: course.id, back: screen}),
          testID: 'cor-compare-meeting',
        }}
      >
        <Field
          label="Location"
          value={meeting.room}
          onChangeText={room => edit({room})}
          maxLength={80}
          testID="cor-room"
        />
        <Field
          label="Instructor"
          value={meeting.faculty}
          onChangeText={faculty => edit({faculty})}
          maxLength={80}
          autoCapitalize="words"
          testID="cor-faculty"
        />
        <Field
          label="Section"
          value={meeting.section}
          onChangeText={section => edit({section})}
          maxLength={40}
          autoCapitalize="characters"
          testID="cor-meeting-section"
        />
      </OnboardingPage>
    );
  }

  if (screen.name === 'review' || screen.name === 'saveFailed') {
    const termErr = termProblems(draft);
    const termValid = termErr.length === 0;
    const weeks = termValid
      ? countWeeklyOccurrences(draft.startDate, draft.endDate)
      : 0;
    const pickerValue =
      picker && isIsoDate(picker === 'start' ? draft.startDate : draft.endDate)
        ? parseIsoDate(picker === 'start' ? draft.startDate : draft.endDate)
        : new Date();
    const attentionCount = courses.filter(
      c => c.included && courseNeedsAttention(c) !== null,
    ).length;

    const applyQuickSemester = () => {
      if (isIsoDate(draft.startDate) && !isIsoDate(draft.endDate)) {
        const dates = semesterTermDates(parseIsoDate(draft.startDate));
        update(d => editTerm(d, {endDate: dates.endDate}));
      } else {
        const dates = semesterTermDates(new Date());
        update(d => editTerm(d, dates));
      }
      setError(null);
    };

    return (
      <OnboardingPage
        pageKey="cor-review"
        headLabel="Review your COR"
        onBack={back}
        scrollable
        topAction={{
          label: 'Replace',
          onPress: chooseFile,
          testID: 'cor-replace',
        }}
        title="Review your COR."
        copy={
          draft.document?.fileName
            ? `${draft.document.fileName} · Check anything below, then add to your schedule.`
            : 'Check the detected details below, then add to your schedule.'
        }
        error={screen.name === 'saveFailed' ? screen.message : error ?? warning}
        primary={{
          label:
            screen.name === 'saveFailed'
              ? 'Try again'
              : 'Confirm & Add Schedule',
          onPress: commit,
          testID: 'cor-commit',
        }}
        secondary={laterAction}
        testID="cor-review"
      >
        <InlineActions>
          <SecondaryButton
            label="View original"
            onPress={viewOriginal}
            testID="cor-view-original"
            style={styles.smallButton}
          />
          <SecondaryButton
            label="Recognized text"
            onPress={() =>
              go({name: 'source', courseId: null, back: {name: 'review'}})
            }
            testID="cor-view-text"
            style={styles.smallButton}
          />
        </InlineActions>
        {notice ? <Notice text={notice} testID="cor-notice" /> : null}

        {/* Student & Program */}
        <Card testID="cor-student-card">
          <Text style={[styles.sectionTitle, {color: t.ink}]}>
            Student & program
          </Text>
          <Field
            label="Name on COR"
            value={draft.studentName}
            onChangeText={value => update(d => editStudentName(d, value))}
            maxLength={120}
            autoCapitalize="words"
            testID="cor-student-name"
          />
          <ReadonlyValue
            label="Campus"
            value={draft.campus}
            testID="cor-campus"
          />
          <ReadonlyValue
            label="Program"
            value={draft.program}
            testID="cor-program"
          />
          <View style={onboardingStyles.rowGap}>
            <View style={onboardingStyles.flex1}>
              <Field
                label="Year level"
                value={draft.yearLevel}
                onChangeText={value =>
                  update(d => editAcademic(d, {yearLevel: value}))
                }
                maxLength={60}
                testID="cor-year"
              />
            </View>
            <View style={onboardingStyles.flex1}>
              <Field
                label="Section"
                value={draft.section}
                onChangeText={value =>
                  update(d => editAcademic(d, {section: value}))
                }
                maxLength={40}
                autoCapitalize="characters"
                testID="cor-section"
              />
            </View>
          </View>
        </Card>

        {/* Term & Dates */}
        <Card testID="cor-term-card">
          <Text style={[styles.sectionTitle, {color: t.ink}]}>
            Term & class dates
          </Text>
          <Field
            label="Term"
            value={draft.term}
            onChangeText={value => update(d => editTerm(d, {term: value}))}
            maxLength={80}
            placeholder="e.g. 1st Semester AY 2026-2027"
            testID="cor-term-label"
          />
          <SlimRow
            label="First class date"
            value={formatDisplayDate(draft.startDate)}
            onPress={() => setPicker('start')}
            testID="cor-start-date"
          />
          <SlimRow
            label="Last class date"
            value={formatDisplayDate(draft.endDate)}
            onPress={() => setPicker('end')}
            testID="cor-end-date"
          />
          {!termValid ? (
            <SecondaryButton
              label={
                isIsoDate(draft.startDate) && !isIsoDate(draft.endDate)
                  ? 'Set end date (+18 weeks)'
                  : 'Use 18-week semester (starts today)'
              }
              onPress={applyQuickSemester}
              testID="cor-quick-term-dates"
              style={styles.smallButton}
            />
          ) : (
            <Text
              style={[onboardingStyles.small, {color: t.muted}]}
              testID="cor-recurrence-preview"
            >
              Repeats weekly from {formatDisplayDate(draft.startDate)} to{' '}
              {formatDisplayDate(draft.endDate)} (up to {weeks} weeks).
            </Text>
          )}
          {picker ? (
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display="default"
              onChange={(event, date) => {
                const which = picker;
                setPicker(null);
                if (event.type === 'dismissed' || !date) return;
                update(d =>
                  editTerm(
                    d,
                    which === 'start'
                      ? {startDate: formatIsoDate(date)}
                      : {endDate: formatIsoDate(date)},
                  ),
                );
              }}
            />
          ) : null}
        </Card>

        {/* Conflicts (only shown when present) */}
        {conflictCount > 0 ? (
          <Card testID="cor-conflicts-card">
            <Text style={[styles.sectionTitle, {color: t.danger}]}>
              Resolve before adding ({conflictCount})
            </Text>
            {readiness.duplicateSubjects.map(dup => (
              <View key={`dup-s-${dup.id}`} style={styles.conflictItem}>
                <Text style={[onboardingStyles.small, {color: t.ink}]}>
                  {dup.code} appears more than once ({dup.title}).
                </Text>
                <SecondaryButton
                  label={`Exclude duplicate ${dup.code}`}
                  onPress={() =>
                    update(d => setCourseIncluded(d, dup.id, false))
                  }
                  testID="cor-dup-subject-exclude"
                  style={styles.smallButton}
                />
              </View>
            ))}
            {readiness.duplicateMeetings.map(dup => (
              <View key={`dup-m-${dup.meeting.id}`} style={styles.conflictItem}>
                <Text style={[onboardingStyles.small, {color: t.ink}]}>
                  {dup.course.code} repeats {meetingSummary(dup.meeting)}.
                </Text>
                <SecondaryButton
                  label="Remove repeat"
                  onPress={() =>
                    update(d => removeMeeting(d, dup.course.id, dup.meeting.id))
                  }
                  testID="cor-dup-meeting-remove"
                  style={styles.smallButton}
                />
              </View>
            ))}
            {readiness.overlaps.map(ov => (
              <View key={`ov-${ov.key}`} style={styles.conflictItem}>
                <Text style={[onboardingStyles.small, {color: t.ink}]}>
                  {ov.first.course.code} ({meetingSummary(ov.first.meeting)})
                  overlaps {ov.second.course.code} (
                  {meetingSummary(ov.second.meeting)}).
                </Text>
                <InlineActions>
                  <SecondaryButton
                    label="Keep both"
                    onPress={() => update(d => acknowledgeOverlap(d, ov.key))}
                    testID="cor-overlap-keep"
                    style={styles.smallButton}
                  />
                  <SecondaryButton
                    label={`Edit ${ov.second.course.code || 'class'}`}
                    onPress={() =>
                      go({
                        name: 'meetingWhen',
                        courseId: ov.second.course.id,
                        meetingId: ov.second.meeting.id,
                      })
                    }
                    testID="cor-overlap-edit"
                    style={styles.smallButton}
                  />
                </InlineActions>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Subjects (all on 1 screen) */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, {color: t.ink}]}>
            Subjects ({courses.length})
          </Text>
          <SecondaryButton
            label="+ Add subject"
            onPress={() => {
              const added = addCourse(draft);
              update(() => added.draft);
              go({name: 'subjectEdit', courseId: added.courseId});
            }}
            testID="cor-add-subject"
            style={styles.compactHeaderButton}
          />
        </View>

        {attentionCount > 0 ? (
          <Notice
            testID="cor-attention-banner"
            text={`${attentionCount} ${
              attentionCount === 1 ? 'subject needs' : 'subjects need'
            } a quick check below (marked Needs fix).`}
          />
        ) : null}

        {courses.length === 0 ? (
          <Card>
            <Text style={[onboardingStyles.body, {color: t.muted}]}>
              No subjects were detected from the COR. Tap "+ Add subject" or
              replace the file.
            </Text>
          </Card>
        ) : (
          courses.map((course, index) => {
            const tag = courseTag(course, committed);
            const problem = courseNeedsAttention(course);
            return (
              <Card key={course.id} testID={`cor-subject-card-${index}`}>
                <View style={styles.subjectHeader}>
                  <View style={onboardingStyles.flex1}>
                    <Text style={[onboardingStyles.strong, {color: t.ink}]}>
                      {course.code || 'New subject'}
                      {course.units ? ` · ${course.units}u` : ''}
                    </Text>
                    <Text
                      style={[onboardingStyles.small, {color: t.muted}]}
                      numberOfLines={2}
                    >
                      {course.title || 'Title needed'}
                    </Text>
                  </View>
                  <Tag label={tag.label} tone={tag.tone} />
                </View>

                {course.included ? (
                  course.meetings.length > 0 ? (
                    <View style={styles.meetingsList}>
                      {course.meetings.map(meeting => {
                        const needsStartPeriod =
                          meeting.start.hour !== null &&
                          meeting.start.period === null;
                        const needsEndPeriod =
                          meeting.end.hour !== null &&
                          meeting.end.period === null;
                        return (
                          <View key={meeting.id}>
                            <SlimRow
                              label={meetingSummary(meeting)}
                              value={meetingStatusLabel(meeting)}
                              onPress={() =>
                                go({
                                  name: 'meetingWhen',
                                  courseId: course.id,
                                  meetingId: meeting.id,
                                })
                              }
                              testID={`cor-meeting-${meeting.id}`}
                            />
                            {needsStartPeriod || needsEndPeriod ? (
                              <View style={styles.inlinePeriodWrap}>
                                {needsStartPeriod ? (
                                  <View style={styles.inlinePeriodGroup}>
                                    <Text
                                      style={[
                                        onboardingStyles.small,
                                        {color: t.danger},
                                      ]}
                                    >
                                      Start {meeting.start.hour}:
                                      {String(
                                        meeting.start.minute ?? 0,
                                      ).padStart(2, '0')}
                                      :
                                    </Text>
                                    <ChoiceButton
                                      label="AM"
                                      selected={false}
                                      onPress={() =>
                                        update(d =>
                                          editMeeting(
                                            d,
                                            course.id,
                                            meeting.id,
                                            {
                                              start: {
                                                ...meeting.start,
                                                period: 'AM',
                                              },
                                            },
                                          ),
                                        )
                                      }
                                      testID={`cor-inline-start-am-${meeting.id}`}
                                      style={styles.pillButton}
                                    />
                                    <ChoiceButton
                                      label="PM"
                                      selected={false}
                                      onPress={() =>
                                        update(d =>
                                          editMeeting(
                                            d,
                                            course.id,
                                            meeting.id,
                                            {
                                              start: {
                                                ...meeting.start,
                                                period: 'PM',
                                              },
                                            },
                                          ),
                                        )
                                      }
                                      testID={`cor-inline-start-pm-${meeting.id}`}
                                      style={styles.pillButton}
                                    />
                                  </View>
                                ) : null}
                                {needsEndPeriod ? (
                                  <View style={styles.inlinePeriodGroup}>
                                    <Text
                                      style={[
                                        onboardingStyles.small,
                                        {color: t.danger},
                                      ]}
                                    >
                                      End {meeting.end.hour}:
                                      {String(meeting.end.minute ?? 0).padStart(
                                        2,
                                        '0',
                                      )}
                                      :
                                    </Text>
                                    <ChoiceButton
                                      label="AM"
                                      selected={false}
                                      onPress={() =>
                                        update(d =>
                                          editMeeting(
                                            d,
                                            course.id,
                                            meeting.id,
                                            {
                                              end: {
                                                ...meeting.end,
                                                period: 'AM',
                                              },
                                            },
                                          ),
                                        )
                                      }
                                      testID={`cor-inline-end-am-${meeting.id}`}
                                      style={styles.pillButton}
                                    />
                                    <ChoiceButton
                                      label="PM"
                                      selected={false}
                                      onPress={() =>
                                        update(d =>
                                          editMeeting(
                                            d,
                                            course.id,
                                            meeting.id,
                                            {
                                              end: {
                                                ...meeting.end,
                                                period: 'PM',
                                              },
                                            },
                                          ),
                                        )
                                      }
                                      testID={`cor-inline-end-pm-${meeting.id}`}
                                      style={styles.pillButton}
                                    />
                                  </View>
                                ) : null}
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={[onboardingStyles.small, {color: t.muted}]}>
                      No fixed class time (TBA / flexible).
                    </Text>
                  )
                ) : (
                  <Text style={[onboardingStyles.small, {color: t.muted}]}>
                    Excluded — will not be added to your schedule.
                  </Text>
                )}

                {problem && course.included ? (
                  <Text style={[onboardingStyles.small, {color: t.danger}]}>
                    {problem}
                  </Text>
                ) : null}

                <InlineActions>
                  <SecondaryButton
                    label="Edit"
                    onPress={() =>
                      go({name: 'subjectEdit', courseId: course.id})
                    }
                    testID={`cor-edit-subject-${index}`}
                    style={styles.smallButton}
                  />
                  {course.included ? (
                    <SecondaryButton
                      label="Add time"
                      onPress={() => {
                        const added = addMeeting(draft, course.id);
                        update(() => added.draft);
                        go({
                          name: 'meetingWhen',
                          courseId: course.id,
                          meetingId: added.meetingId,
                        });
                      }}
                      testID={`cor-add-meeting-${index}`}
                      style={styles.smallButton}
                    />
                  ) : null}
                  <SecondaryButton
                    label={course.included ? 'Exclude' : 'Include'}
                    onPress={() =>
                      update(d =>
                        setCourseIncluded(d, course.id, !course.included),
                      )
                    }
                    testID={`cor-toggle-subject-${index}`}
                    style={styles.smallButton}
                  />
                </InlineActions>
              </Card>
            );
          })
        )}
      </OnboardingPage>
    );
  }

  // done
  const result = screen.result;
  return (
    <OnboardingPage
      pageKey="cor-done"
      headLabel="USTP COR setup"
      title="Added to your schedule."
      copy="USTP features are now on."
      error={error}
      primary={{
        label: 'Continue',
        onPress: () => onClose({status: 'confirmed', result}),
        testID: 'cor-done',
      }}
      secondary={{label: 'Undo this import', onPress: undo, testID: 'cor-undo'}}
      testID="cor-done-page"
    >
      <Card>
        <SlimRow label="Subjects" value={String(result.subjects)} />
        <SlimRow label="Class blocks added" value={String(result.created)} />
        {result.updated ? (
          <SlimRow
            label="Class blocks updated"
            value={String(result.updated)}
          />
        ) : null}
        {result.removed ? (
          <SlimRow
            label="Old class blocks removed"
            value={String(result.removed)}
          />
        ) : null}
      </Card>
      <TagRow>
        <Tag label="Added" tone="good" />
        <Tag label="USTP features on" tone="good" />
      </TagRow>
    </OnboardingPage>
  );
};

const MissingItem: React.FC<{onBack: () => void}> = ({onBack}) => (
  <OnboardingPage
    pageKey="cor-missing-item"
    headLabel="USTP COR setup"
    onBack={onBack}
    title="That item was removed."
    primary={{
      label: 'Back to review',
      onPress: onBack,
      testID: 'cor-missing-back',
    }}
  />
);

/** Hour, minute and an explicit AM/PM choice. Nothing is assumed. */
const ClockField: React.FC<{
  label: string;
  clock: ClockTime;
  onChange: (clock: ClockTime) => void;
  testID: string;
}> = ({label, clock, onChange, testID}) => {
  const t = useOnboardingTokens();
  const [hourText, setHourText] = useState(
    clock.hour === null ? '' : String(clock.hour),
  );
  const [minuteText, setMinuteText] = useState(
    clock.minute === null ? '' : String(clock.minute).padStart(2, '0'),
  );
  const setPeriod = (period: Meridiem) => onChange({...clock, period});
  const inputStyle = [
    styles.clockInput,
    {color: t.ink, borderColor: t.line, backgroundColor: t.paper},
  ];
  return (
    <View>
      <Text style={[styles.label, {color: t.ink}]}>
        {label}
        {clock.hour !== null && clock.minute !== null && clock.period
          ? ` · ${clockLabel(clock)}`
          : ''}
      </Text>
      <View style={styles.clockRow}>
        <TextInput
          value={hourText}
          onChangeText={text => {
            const digits = text.replace(/\D/g, '').slice(0, 2);
            setHourText(digits);
            const n = Number(digits);
            onChange({...clock, hour: digits && n >= 1 && n <= 12 ? n : null});
          }}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="h"
          placeholderTextColor={t.muted}
          accessibilityLabel={`${label} hour, 1 to 12`}
          style={inputStyle}
          testID={`${testID}-hour`}
        />
        <Text style={[styles.colon, {color: t.ink}]}>:</Text>
        <TextInput
          value={minuteText}
          onChangeText={text => {
            const digits = text.replace(/\D/g, '').slice(0, 2);
            setMinuteText(digits);
            const n = Number(digits);
            onChange({
              ...clock,
              minute: digits.length === 2 && n <= 59 ? n : null,
            });
          }}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="mm"
          placeholderTextColor={t.muted}
          accessibilityLabel={`${label} minutes`}
          style={inputStyle}
          testID={`${testID}-minute`}
        />
        <ChoiceButton
          label="AM"
          selected={clock.period === 'AM'}
          onPress={() => setPeriod('AM')}
          testID={`${testID}-am`}
        />
        <ChoiceButton
          label="PM"
          selected={clock.period === 'PM'}
          onPress={() => setPeriod('PM')}
          testID={`${testID}-pm`}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: {paddingVertical: 32, alignItems: 'center'},
  label: {
    fontFamily: Fonts.heading,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '600',
  },
  compactHeaderButton: {
    minHeight: 36,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  meetingsList: {gap: 2},
  inlinePeriodWrap: {
    gap: 6,
    paddingVertical: 6,
  },
  inlinePeriodGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  pillButton: {
    flex: 0,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  conflictItem: {
    gap: 6,
    paddingTop: 4,
  },
  days: {flexDirection: 'row', gap: 4},
  clockRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  clockInput: {
    width: 52,
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: 16,
  },
  colon: {fontSize: 18, fontFamily: Fonts.heading},
  smallButton: {minHeight: 38, paddingVertical: 5, flexGrow: 1},
  unitsField: {width: 88},
});
