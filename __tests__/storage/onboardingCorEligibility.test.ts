/**
 * Onboarding redesign: COR verification, the single USTP eligibility
 * decision, and the paths that must not bypass it. Runs on the host with
 * the in-memory node:sqlite database (no device behaviour is claimed).
 */
import {db, initDatabase, timeBlocksStore, userStore} from '../../src/storage';
import {academicProfileStore} from '../../src/storage/academicProfileStore';
import {studentSetupStore} from '../../src/storage/studentSetupStore';
import {
  captureUstpEligibility,
  getUstpEligibility,
} from '../../src/storage/ustpEligibility';
import {
  __setCorCommitFaultForTests,
  corImportStore,
} from '../../src/storage/corImportStore';
import {chooseNotUstpMode, chooseUstpMode} from '../../src/storage/studentMode';
import {chatMemoryStore} from '../../src/storage/chatMemoryStore';
import {
  memoriesForPrompt,
  refreshAcademicMemories,
} from '../../src/storage/onboardingMemory';
import {guestMigration} from '../../src/storage/guestMigration';
import {
  acknowledgeOverlap,
  addMeeting,
  buildCorDraft,
  confirmAcademic,
  confirmAllValidItems,
  confirmCourse,
  confirmMeeting,
  confirmStudent,
  confirmTerm,
  courseNeedsAttention,
  draftReadiness,
  editCourse,
  editMeeting,
  editTerm,
  findOverlaps,
  keepCourseUnscheduled,
  meetingProblems,
  parseDayCodeStrict,
  planClassBlocks,
  setCourseIncluded,
  termProblems,
} from '../../src/ai/vision/corReviewModel';
import type {
  CorDraft,
  CorDraftMeeting,
} from '../../src/ai/vision/corReviewModel';
import {parseUstpCor} from '../../src/ai/vision/ustpCorParser';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {cloudClient} from '../../src/cloud';
import {GUEST_USER_ID} from '../../src/constants';

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `corelig-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const clock = (hour: number, minute: number, period: 'AM' | 'PM' | null) => ({
  hour,
  minute,
  period,
});
const meeting = (
  id: string,
  days: CorDraftMeeting['days'],
  start: CorDraftMeeting['start'],
  end: CorDraftMeeting['end'],
  extra: Partial<CorDraftMeeting> = {},
): CorDraftMeeting => ({
  id,
  days,
  start,
  end,
  room: '09-302',
  faculty: 'Instructor',
  section: 'IT4R11',
  origin: 'detected',
  sourceText: 'IT414 F 7:00 AM - 10:00 AM/09-302',
  notices: [],
  reviewed: false,
  ...extra,
});

/** A detected draft: two timed meetings, one with a missing AM/PM, one TBA subject. */
const makeDraft = (ownerId: string): CorDraft => ({
  version: 1,
  draftId: `draft-${ownerId}`,
  ownerId,
  status: 'draft',
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
  document: {fileName: 'cor.pdf', localPath: null, mimeType: 'application/pdf'},
  sourceText: 'IT414 IT Elective 3 ...',
  studentName: 'Sample Student',
  campus: 'Cagayan de Oro',
  program: 'B.S. in Information Technology',
  yearLevel: '4th Year',
  section: 'IT4R11',
  term: '1st Semester AY 2026-2027',
  startDate: '',
  endDate: '',
  studentReviewed: false,
  academicReviewed: false,
  termReviewed: false,
  courses: [
    {
      id: 'c-it414',
      code: 'IT414',
      title: 'IT Elective 3',
      units: '3',
      origin: 'detected',
      sourceText: 'IT414 IT Elective 3 2 1 3',
      included: true,
      reviewed: false,
      keepUnscheduled: false,
      meetings: [
        meeting('m-fri', ['Fri'], clock(7, 0, 'AM'), clock(10, 0, 'AM')),
        meeting('m-wed', ['Wed'], clock(7, 0, 'AM'), clock(9, 0, 'AM')),
      ],
    },
    {
      id: 'c-gns',
      code: 'GNS',
      title: 'Gender and Society',
      units: '3',
      origin: 'detected',
      sourceText: 'GnS Gender and Society TF 1:00 - 2:30',
      included: true,
      reviewed: false,
      keepUnscheduled: false,
      meetings: [
        meeting('m-tf', ['Tue', 'Fri'], clock(1, 0, null), clock(2, 30, null), {
          notices: ['start_period_missing', 'end_period_missing'],
        }),
      ],
    },
    {
      id: 'c-it411',
      code: 'IT411',
      title: 'Capstone Project and Research 2',
      units: '3',
      origin: 'detected',
      sourceText: 'IT411 CAPSTONE Project and Research 2',
      included: true,
      reviewed: false,
      keepUnscheduled: false,
      meetings: [],
    },
  ],
  acknowledgedOverlaps: [],
  extras: {
    college: '',
    collegeShort: '',
    major: '',
    curriculum: '',
    yearLevelShort: '',
    formattedName: '',
    totalCreditUnits: 9,
    totalLecUnits: null,
    totalLabUnits: null,
  },
  committedImportId: null,
});

/** What a student does in the review screens, step by step. */
const reviewEverything = (draft: CorDraft): CorDraft => {
  let d = confirmStudent(draft);
  d = confirmAcademic(d);
  d = editTerm(d, {startDate: '2026-08-10', endDate: '2026-12-18'});
  d = confirmTerm(d);
  d = editMeeting(d, 'c-gns', 'm-tf', {
    start: clock(1, 0, 'PM'),
    end: clock(2, 30, 'PM'),
  });
  for (const id of ['m-fri', 'm-wed']) d = confirmMeeting(d, 'c-it414', id);
  d = confirmMeeting(d, 'c-gns', 'm-tf');
  d = keepCourseUnscheduled(d, 'c-it411');
  for (const id of ['c-it414', 'c-gns', 'c-it411']) d = confirmCourse(d, id);
  for (const overlap of findOverlaps(d)) d = acknowledgeOverlap(d, overlap.key);
  return d;
};

const outboxCount = (userId: string): number =>
  Number(
    db.executeSync(
      "SELECT COUNT(*) AS n FROM sync_outbox WHERE user_id = ? AND entity_type = 'time_block'",
      [userId],
    ).rows?.[0]?.n ?? 0,
  );

beforeAll(async () => {
  await initDatabase();
});

afterEach(() => {
  __setCorCommitFaultForTests(null);
  jest.restoreAllMocks();
});

describe('eligibility states', () => {
  test('nothing chosen, COR pending and not-USTP are scheduling only', () => {
    const user = owner('states');
    expect(getUstpEligibility(user)).toMatchObject({
      eligible: false,
      reason: 'setup_not_chosen',
    });
    chooseUstpMode(user);
    expect(getUstpEligibility(user)).toMatchObject({
      eligible: false,
      reason: 'cor_pending',
    });
    chooseNotUstpMode(user);
    expect(getUstpEligibility(user)).toMatchObject({
      eligible: false,
      reason: 'not_ustp',
    });
  });

  test('a profile written outside the reviewed import never enables school features', () => {
    const user = owner('forged');
    academicProfileStore.save(user, {
      ...parseUstpCor('').profile,
      isUstpStudent: true,
      campus: 'Cagayan de Oro',
      program: 'BSIT',
      courses: [],
    });
    // Even with "confirmed" written by hand, provenance is missing.
    studentSetupStore.update(user, {
      affiliation: 'ustp',
      corStatus: 'confirmed',
      confirmedImportId: 'made-up',
    });
    expect(getUstpEligibility(user)).toMatchObject({
      eligible: false,
      reason: 'profile_missing',
    });
  });

  test('legacy installs: an old COR profile needs review and scheduling keeps working', () => {
    const user = owner('legacy');
    db.executeSync(
      'INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      [
        user,
        'academic.profile.v1',
        JSON.stringify({isUstpStudent: true, program: 'BSIT', campus: 'CDO'}),
        'x',
      ],
    );
    expect(studentSetupStore.get(user)).toMatchObject({
      affiliation: 'ustp',
      corStatus: 'needs_review',
    });
    // Reading did not write a new state, and nothing is eligible.
    expect(studentSetupStore.exists(user)).toBe(false);
    expect(getUstpEligibility(user)).toMatchObject({
      eligible: false,
      reason: 'cor_needs_review',
    });
  });
});

describe('COR draft rules', () => {
  test('unknown days are never guessed and a missing AM/PM stays unset', () => {
    expect(parseDayCodeStrict('XYZ')).toEqual([]);
    expect(parseDayCodeStrict('TBA')).toEqual([]);
    expect(parseDayCodeStrict('TTH')).toEqual(['Tue', 'Thu']);
    const draft = makeDraft(owner('rules'));
    const gns = draft.courses[1].meetings[0];
    expect(meetingProblems(gns)).toContain(
      'Choose AM or PM for the start time.',
    );
    expect(draftReadiness(draft).canCommit).toBe(false);
  });

  test('dates come from the student: no 18-week assumption, real calendar dates only', () => {
    const draft = makeDraft(owner('dates'));
    expect(draft.startDate).toBe('');
    expect(termProblems(draft)).toContain('Choose the first class date.');
    expect(
      termProblems({...draft, startDate: '2026-02-30', endDate: '2026-05-01'}),
    ).toContain('Choose the first class date.');
    expect(
      termProblems({...draft, startDate: '2026-08-10', endDate: '2026-08-01'}),
    ).toContain(
      'The last class date must be on or after the first class date.',
    );
    const reviewed = reviewEverything(draft);
    const blocks = planClassBlocks(reviewed);
    expect(
      blocks.every(
        b => b.recurrenceRule === 'FREQ=WEEKLY;UNTIL=20261218T235959Z',
      ),
    ).toBe(true);
    // First Friday on or after Mon 10 Aug 2026 is 14 Aug.
    expect(blocks.find(b => b.meetingId === 'm-fri')?.firstDate).toBe(
      '2026-08-14',
    );
  });

  test('multiple meetings and multi-day meetings each become blocks; TBA subjects create none', () => {
    const reviewed = reviewEverything(makeDraft(owner('multi')));
    const blocks = planClassBlocks(reviewed);
    expect(blocks.map(b => `${b.code}:${b.day}`).sort()).toEqual(
      ['GNS:Fri', 'GNS:Tue', 'IT414:Fri', 'IT414:Wed'].sort(),
    );
    expect(blocks.some(b => b.code === 'IT411')).toBe(false);
    expect(draftReadiness(reviewed)).toMatchObject({
      unscheduledCourses: 1,
      canCommit: true,
    });
  });

  test('editing details resets the review, including an earlier "keep both"', () => {
    let draft = reviewEverything(makeDraft(owner('reset')));
    expect(draftReadiness(draft).canCommit).toBe(true);
    // An overlap the student kept: IT414 Fri 7–10 AM vs a new Fri 9–11 AM meeting.
    const added = addMeeting(draft, 'c-gns');
    draft = editMeeting(added.draft, 'c-gns', added.meetingId, {
      days: ['Fri'],
      start: clock(9, 0, 'AM'),
      end: clock(11, 0, 'AM'),
    });
    draft = confirmMeeting(draft, 'c-gns', added.meetingId);
    const [overlap] = findOverlaps(draft);
    expect(overlap).toBeDefined();
    draft = acknowledgeOverlap(draft, overlap.key);
    expect(findOverlaps(draft)).toHaveLength(0);
    // Changing either meeting asks again.
    draft = editMeeting(draft, 'c-gns', added.meetingId, {
      end: clock(11, 30, 'AM'),
    });
    expect(findOverlaps(draft)).toHaveLength(1);
    expect(
      draft.courses[1].meetings.find(m => m.id === added.meetingId)?.reviewed,
    ).toBe(false);
    // Editing a subject resets its review too.
    draft = editCourse(draft, 'c-it414', {title: 'IT Elective III'});
    expect(draft.courses[0].reviewed).toBe(false);
    expect(draftReadiness(draft).canCommit).toBe(false);
  });

  test('a recognized COR becomes an unreviewed draft', () => {
    const parsed = parseUstpCor(
      'IT414 IT Elective 3 2 1 3 IT4R11 F 7:00 AM - 10:00 AM/09-302 Loredel Tamayo',
    );
    const draft = buildCorDraft(parsed, {
      ownerId: 'u',
      document: null,
      sourceText: 'x',
    });
    expect(draft.startDate).toBe('');
    expect(draft.endDate).toBe('');
    expect(
      draft.studentReviewed || draft.academicReviewed || draft.termReviewed,
    ).toBe(false);
    expect(
      draft.courses.every(
        c => !c.reviewed && c.meetings.every(m => !m.reviewed),
      ),
    ).toBe(true);
  });

  test('confirmAllValidItems confirms valid and TBA courses while keeping ambiguous meetings blocked', () => {
    const draft = editTerm(makeDraft(owner('one-screen')), {
      startDate: '2026-08-10',
      endDate: '2026-12-18',
    });
    // GnS is missing AM/PM on its meeting, so it needs attention while IT414 and IT411 (TBA) are clean.
    expect(courseNeedsAttention(draft.courses[0])).toBeNull();
    expect(courseNeedsAttention(draft.courses[1])).toMatch(/AM or PM/);
    expect(courseNeedsAttention(draft.courses[2])).toBeNull();

    const blocked = confirmAllValidItems(draft);
    expect(draftReadiness(blocked).canCommit).toBe(false);
    expect(blocked.courses[0].reviewed).toBe(true);
    expect(blocked.courses[2].keepUnscheduled).toBe(true);
    expect(blocked.courses[1].reviewed).toBe(false);

    // Fixing AM/PM clears the meeting notices and allows 1-tap confirmation.
    const fixed = editMeeting(draft, 'c-gns', 'm-tf', {
      start: clock(1, 0, 'PM'),
      end: clock(2, 30, 'PM'),
    });
    expect(fixed.courses[1].meetings[0].notices).toEqual([]);
    expect(courseNeedsAttention(fixed.courses[1])).toBeNull();
    const ready = confirmAllValidItems(fixed);
    expect(draftReadiness(ready).canCommit).toBe(true);
  });
});

describe('saving a reviewed COR', () => {
  test('one transaction: blocks, outbox, reviewed profile and USTP eligibility', () => {
    const user = owner('commit');
    chooseUstpMode(user);
    const draft = reviewEverything(makeDraft(user));
    const before = outboxCount(user);
    const result = corImportStore.commitDraft(user, draft);
    expect(result).toMatchObject({
      created: 4,
      updated: 0,
      removed: 0,
      subjects: 3,
    });
    expect(
      timeBlocksStore.getAll(user).filter(b => b.category === 'Class'),
    ).toHaveLength(4);
    expect(outboxCount(user)).toBe(before + 4);
    const profile = academicProfileStore.get(user);
    expect(profile?.provenance).toMatchObject({
      source: 'cor_review',
      importId: result.importId,
    });
    expect(profile?.studentNo).toBe('');
    expect(profile?.gender).toBe('');
    expect(userStore.getUserById(user)?.username).toBe(user);
    expect(getUstpEligibility(user)).toMatchObject({
      eligible: true,
      reason: 'eligible',
    });
  });

  test('retrying or re-importing the same COR never duplicates classes', () => {
    const user = owner('retry');
    const draft = reviewEverything(makeDraft(user));
    corImportStore.commitDraft(user, draft);
    const again = corImportStore.commitDraft(user, draft);
    expect(again).toMatchObject({created: 0, updated: 4, removed: 0});
    expect(
      timeBlocksStore.getAll(user).filter(b => b.category === 'Class'),
    ).toHaveLength(4);
  });

  test('excluding a subject on re-import removes only the classes that import made', () => {
    const user = owner('exclude');
    timeBlocksStore.insert({
      id: `manual-${user}`,
      userId: user,
      title: 'My own study block',
      date: '2026-08-14',
      startTime: '07:00',
      endTime: '10:00',
      color: '#000000',
      category: 'Study',
      recurrenceRule: null,
    });
    const draft = reviewEverything(makeDraft(user));
    corImportStore.commitDraft(user, draft);
    const result = corImportStore.commitDraft(
      user,
      setCourseIncluded(draft, 'c-gns', false),
    );
    expect(result.removed).toBe(2);
    const titles = timeBlocksStore.getAll(user).map(b => b.title);
    expect(titles).toContain('My own study block');
    expect(titles.some(t => t.startsWith('GNS'))).toBe(false);
  });

  test.each(['blocks', 'profile', 'setup'])(
    'a failure at "%s" rolls everything back (no partial completion)',
    stage => {
      const user = owner(`fault-${stage}`);
      chooseUstpMode(user);
      const before = outboxCount(user);
      __setCorCommitFaultForTests(at => {
        if (at === stage) throw new Error('disk full');
      });
      expect(() =>
        corImportStore.commitDraft(user, reviewEverything(makeDraft(user))),
      ).toThrow();
      expect(timeBlocksStore.getAll(user)).toHaveLength(0);
      expect(outboxCount(user)).toBe(before);
      expect(academicProfileStore.get(user)).toBeNull();
      expect(studentSetupStore.get(user).corStatus).toBe('pending');
      expect(getUstpEligibility(user).eligible).toBe(false);
      // The retry after the failure succeeds once and only once.
      __setCorCommitFaultForTests(null);
      corImportStore.commitDraft(user, reviewEverything(makeDraft(user)));
      expect(timeBlocksStore.getAll(user)).toHaveLength(4);
    },
  );

  test('an unreviewed draft cannot be saved', () => {
    const user = owner('unready');
    expect(() => corImportStore.commitDraft(user, makeDraft(user))).toThrow(
      /review/,
    );
    expect(timeBlocksStore.getAll(user)).toHaveLength(0);
  });

  test('undo reverses only this import and returns the COR to pending', () => {
    const user = owner('undo');
    chooseUstpMode(user);
    timeBlocksStore.insert({
      id: `own-${user}`,
      userId: user,
      title: 'Gym',
      date: '2026-08-12',
      startTime: '18:00',
      endTime: '19:00',
      color: '#111111',
      category: 'Personal',
      recurrenceRule: null,
    });
    corImportStore.commitDraft(user, reviewEverything(makeDraft(user)));
    expect(getUstpEligibility(user).eligible).toBe(true);
    corImportStore.undoLatestImport(user);
    refreshAcademicMemories(user);
    expect(timeBlocksStore.getAll(user).map(b => b.title)).toEqual(['Gym']);
    expect(academicProfileStore.get(user)).toBeNull();
    expect(studentSetupStore.get(user).corStatus).toBe('pending');
    expect(getUstpEligibility(user).eligible).toBe(false);
    // The draft is back for another review.
    expect(corImportStore.getDraft(user)?.status).toBe('draft');
  });
});

describe('ownership, resume and guest transfer', () => {
  test('a draft resumes for its owner only', () => {
    const a = owner('own-a');
    const b = owner('own-b');
    expect(corImportStore.saveDraft(a, makeDraft(a))).toBe(true);
    expect(corImportStore.getDraft(a)?.draftId).toBe(`draft-${a}`);
    expect(corImportStore.getDraft(b)).toBeNull();
    expect(corImportStore.saveDraft(b, makeDraft(a))).toBe(false);
    expect(() =>
      corImportStore.commitDraft(b, reviewEverything(makeDraft(a))),
    ).toThrow(/another account/);
  });

  test('guest → account keeps the setup choice, COR draft and import', async () => {
    userStore.createGuestUser();
    corImportStore.clear(GUEST_USER_ID);
    studentSetupStore.clear(GUEST_USER_ID);
    chooseUstpMode(GUEST_USER_ID);
    corImportStore.commitDraft(
      GUEST_USER_ID,
      reviewEverything(makeDraft(GUEST_USER_ID)),
    );
    expect(getUstpEligibility(GUEST_USER_ID).eligible).toBe(true);

    const account = owner('account');
    await guestMigration.linkGuestToCloudAccount(
      account,
      `${account}@example.test`,
    );
    expect(getUstpEligibility(account).eligible).toBe(true);
    expect(corImportStore.latestActiveImport(account)).not.toBeNull();
    expect(corImportStore.getDraft(account)?.ownerId).toBe(account);
    expect(getUstpEligibility(GUEST_USER_ID).eligible).toBe(false);
  });
});

describe('school features cannot be reached around the gate', () => {
  const eligibleUser = (label: string): string => {
    const user = owner(label);
    chooseUstpMode(user);
    corImportStore.commitDraft(user, reviewEverything(makeDraft(user)));
    return user;
  };

  test('switching to scheduling mode disables school features and academic memory at once', () => {
    const user = eligibleUser('switch');
    chatMemoryStore.setEnabled(user, true);
    studentSetupStore.update(user, {goal: 'handbook', explicit: ['goal']});
    refreshAcademicMemories(user);
    expect(
      memoriesForPrompt(user).some(m =>
        m.text.includes('Information Technology'),
      ),
    ).toBe(true);

    chooseNotUstpMode(user);
    expect(getUstpEligibility(user).eligible).toBe(false);
    expect(studentSetupStore.get(user).goal).toBeNull();
    expect(
      memoriesForPrompt(user).some(m =>
        m.text.includes('Information Technology'),
      ),
    ).toBe(false);
    // The student's classes stay; returning to USTP with the reviewed COR re-enables.
    expect(timeBlocksStore.getAll(user)).toHaveLength(4);
    chooseUstpMode(user);
    expect(getUstpEligibility(user).eligible).toBe(true);
  });

  test('a restored USTP chat for a non-eligible student answers with an explanation, offline and online', async () => {
    const user = owner('restored');
    chooseUstpMode(user);
    const send = jest.spyOn(onlineChatSkill, 'sendChatMessage');
    for (const onlineMode of [false, true]) {
      const result = await chatOrchestrator.processMessage(
        user,
        'What is the passing grade?',
        {
          onlineMode,
          useHandbook: true,
          ustpRagOnly: true,
        },
      );
      expect(result.reply).toMatch(/USTP school features/);
      expect(result.handbookNote ?? null).toBeNull();
    }
    expect(send).not.toHaveBeenCalled();
  });

  test('a handbook question in the general chat is not answered from the handbook', async () => {
    const user = owner('general');
    chooseNotUstpMode(user);
    const result = await chatOrchestrator.processMessage(
      user,
      'What is the USTP dress code?',
      {
        onlineMode: false,
      },
    );
    expect(result.reply).not.toMatch(
      /According to the local USTP Student Handbook/,
    );
    expect(result.handbookNote ?? null).toBeNull();
  });

  test('online requests never ask the backend for the handbook for an ineligible student', async () => {
    const user = owner('network');
    userStore.setCurrentUser(user);
    const request = jest.spyOn(cloudClient, 'request').mockResolvedValue({
      status: 'success',
      data: {reply: 'ok', sources: []},
    } as never);
    await onlineChatSkill.sendChatMessage([{role: 'user', content: 'hi'}], {
      useHandbook: true,
    });
    const body = JSON.parse(
      String((request.mock.calls[0][1] as RequestInit).body),
    );
    expect(body.useHandbook).toBe(false);
  });

  test('losing eligibility during an online reply removes the handbook answer (async recheck)', async () => {
    const user = eligibleUser('async');
    userStore.setCurrentUser(user);
    jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
    jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockImplementation(async () => {
        // The student switches mode while the request is in flight.
        chooseNotUstpMode(user);
        return {
          status: 'success',
          data: {
            reply: 'Grades use a 1.0–5.0 scale.',
            usedHandbook: true,
            sources: [
              {title: 'USTP Student Handbook', section: 'Grades', page: 50},
            ],
          },
        } as never;
      });
    const result = await chatOrchestrator.processMessage(
      user,
      'What is the passing grade?',
      {
        onlineMode: true,
        useHandbook: true,
        ustpRagOnly: true,
      },
    );
    expect(result.reply).toMatch(/USTP school features/);
    expect(result.handbookNote ?? null).toBeNull();
  });

  test('captureUstpEligibility notices a change after asynchronous work', () => {
    const user = eligibleUser('capture');
    const access = captureUstpEligibility(user);
    expect(access.eligibleAtStart).toBe(true);
    chooseNotUstpMode(user);
    expect(access.stillAllowed()).toBe(false);
  });
});
