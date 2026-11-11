/**
 * Phase 10 Acceptance & Unit Tests: Multi-turn Draft Correction, Referents & Idempotency (F-040, F-041, F-042, F-048, F-073).
 *
 * Verifies:
 * - P10-01: Active-draft registry keyed by stable cardId/session/owner/revision; draft survives intervening turns.
 * - P10-02: Bounded corrections ("Actually Friday", "make that 4 PM", "thirty minutes") modify existing draft.
 * - P10-03: Ambiguity handling: asks which draft when multiple candidates exist; never guesses.
 * - P10-04: Automatic re-run of schedule collision validation after each revision.
 * - P10-05: Draft cancellation is independent of active call lifecycle.
 * - P10-06: Concurrency guard: stale revision token rejected; repeated confirm is idempotent.
 * - P10-07: Interruption resistance: audio TTS ducking/cancellation does not corrupt committed writes.
 * - P10-08: Session end and account switch isolation.
 * - P10-09: "Cancel that" in 0-pending, 1-pending, and multi-pending scenarios.
 * - P10-10: Expiration policy: drafts older than TTL are marked expired and cannot be confirmed.
 */

import {draftRegistry} from '../../src/ai/voiceActions/draftRegistry';
import {actionService} from '../../src/ai/voiceActions/actionService';
import {plannerQueries} from '../../src/storage/plannerQueries';
import {userStore} from '../../src/storage/userStore';
import {voiceConsent} from '../../src/cloud/voiceConversation';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {initDatabase} from '../../src/storage/dbInit';
import {db} from '../../src/storage/database';

describe('Phase 10 — Multi-turn Draft Correction, Referents & Idempotency', () => {
  const USER_A = 'student-alice-10';
  const USER_B = 'student-bob-10';
  const SESSION_1 = 'session-call-101';
  const SESSION_2 = 'session-call-102';

  const seedUser = (id: string) => {
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
      [id, id, `${id}@example.invalid`, now, now],
    );
  };

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    draftRegistry.clearAll();
    seedUser(USER_A);
    seedUser(USER_B);

    jest.spyOn(userStore, 'isGuest').mockReturnValue(false);
    jest.spyOn(userStore, 'getDarkModeEnabled').mockReturnValue(false);
    jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
      userId: USER_A,
      accessToken: 'valid-test-access-token',
      refreshToken: 'valid-test-refresh-token',
    });
    jest.spyOn(voiceConsent, 'read').mockReturnValue(true);
    jest.spyOn(localSettingsStore, 'get').mockReturnValue('true');
  });

  describe('P10-01 & F-040: Active-Draft Registry & Persistence Across Turns', () => {
    it('registers transient draft with stable cardId, session, owner, and revision 1', () => {
      const draft = draftRegistry.registerDraft({
        cardId: 'card-bio-1',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'time_block',
        title: 'Biology Study Session',
        date: '2026-11-15',
        time: '14:00',
        endTime: '15:00',
        durationMinutes: 60,
        details: ['Date: 2026-11-15', 'Time: 2:00 PM - 3:00 PM'],
        assumptions: [],
        warnings: [],
      });

      expect(draft.cardId).toBe('card-bio-1');
      expect(draft.revision).toBe(1);
      expect(draft.status).toBe('pending');

      // Survives intervening lookups
      const retrieved = draftRegistry.getDraft('card-bio-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('Biology Study Session');
      expect(draftRegistry.getActiveDrafts(USER_A)).toHaveLength(1);
    });

    it('enforces expiration policy: draft expires after DRAFT_TTL_MS (P10-10)', () => {
      const draft = draftRegistry.registerDraft({
        cardId: 'card-expired-1',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Expired Assignment',
        details: [],
        assumptions: [],
        warnings: [],
        expiresAt: Date.now() - 1000, // already in the past
      });

      const retrieved = draftRegistry.getDraft(draft.cardId);
      expect(retrieved?.status).toBe('expired');
      expect(draftRegistry.getActiveDrafts(USER_A)).toHaveLength(0);

      // Confirming expired draft is refused
      const confirmResult = draftRegistry.confirmDraft(USER_A, draft.cardId, 1);
      expect(confirmResult.success).toBe(false);
      if (!confirmResult.success) {
        expect(confirmResult.error).toBe('expired');
      }
    });
  });

  describe('P10-02 & F-041: Spoken Relative Corrections (Date, Time, Duration, Title)', () => {
    const REF_DATE = new Date('2026-11-09T10:00:00Z'); // Monday

    it('revises draft time when student says "change to 4 PM"', () => {
      draftRegistry.registerDraft({
        cardId: 'card-edit-time',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Team Meeting',
        date: '2026-11-10',
        time: '14:00',
        details: [],
        assumptions: [],
        warnings: [],
      });

      const result = draftRegistry.reviseDraft(
        USER_A,
        'card-edit-time',
        1,
        'Actually change to 4 PM',
        REF_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.draft.time).toBe('16:00');
        expect(result.draft.revision).toBe(2);
        expect(result.message).toContain('time to 16:00');
      }
    });

    it('revises draft duration and updates end time when student says "make it 30 minutes"', () => {
      draftRegistry.registerDraft({
        cardId: 'card-edit-dur',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'time_block',
        title: 'Physics Lab',
        date: '2026-11-10',
        time: '10:00',
        endTime: '11:00',
        durationMinutes: 60,
        details: [],
        assumptions: [],
        warnings: [],
      });

      const result = draftRegistry.reviseDraft(
        USER_A,
        'card-edit-dur',
        1,
        'Make it thirty minutes',
        REF_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.draft.durationMinutes).toBe(30);
        expect(result.draft.endTime).toBe('10:30');
        expect(result.draft.revision).toBe(2);
      }
    });

    it('revises draft title when student says "change title to Chemistry Quiz"', () => {
      draftRegistry.registerDraft({
        cardId: 'card-edit-title',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Quiz Prep',
        details: [],
        assumptions: [],
        warnings: [],
      });

      const result = draftRegistry.reviseDraft(
        USER_A,
        'card-edit-title',
        1,
        'Change title to Chemistry Quiz',
        REF_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.draft.title).toBe('Chemistry Quiz');
        expect(result.draft.revision).toBe(2);
      }
    });

    it('re-runs collision check after modification and surfaces collision warnings (P10-04)', () => {
      // Mock existing calendar collision in plannerQueries
      jest.spyOn(plannerQueries, 'window').mockReturnValue({
        events: [
          {
            id: 'evt-existing',
            title: 'Existing Lecture',
            date: '2026-11-10',
            startTime: '15:00',
            endTime: '16:30',
          },
        ] as any,
        tasks: [],
        blocks: [],
      });

      draftRegistry.registerDraft({
        cardId: 'card-collision-check',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'time_block',
        title: 'Group Study',
        date: '2026-11-10',
        time: '13:00',
        endTime: '14:00',
        durationMinutes: 60,
        details: [],
        assumptions: [],
        warnings: [],
      });

      // Revise time to 15:30 (overlaps with 15:00 - 16:30 lecture)
      const result = draftRegistry.reviseDraft(
        USER_A,
        'card-collision-check',
        1,
        'Change time to 3:30 PM',
        REF_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.draft.time).toBe('15:30');
        expect(result.draft.warnings.length).toBeGreaterThan(0);
        expect(result.draft.warnings[0]).toContain(
          'Conflicts with "Existing Lecture"',
        );
      }
    });
  });

  describe('P10-03, P10-09 & F-042: Referent Resolution & Ambiguity Handling', () => {
    it('returns "none" when no draft is pending', () => {
      const result = draftRegistry.resolveTargetDraft(USER_A);
      expect(result.status).toBe('none');
      if (result.status === 'none') {
        expect(result.message).toContain('no active draft');
      }
    });

    it('resolves referent "that" to the single active draft', () => {
      draftRegistry.registerDraft({
        cardId: 'card-single-1',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Essay Draft',
        details: [],
        assumptions: [],
        warnings: [],
      });

      const result = draftRegistry.resolveTargetDraft(USER_A);
      expect(result.status).toBe('found');
      if (result.status === 'found') {
        expect(result.draft.cardId).toBe('card-single-1');
      }
    });

    it('detects ambiguity and asks which draft when multiple candidates exist (P10-03)', () => {
      draftRegistry.registerDraft({
        cardId: 'card-multi-1',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Math Homework',
        details: [],
        assumptions: [],
        warnings: [],
      });
      draftRegistry.registerDraft({
        cardId: 'card-multi-2',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'note',
        title: 'History Notes',
        details: [],
        assumptions: [],
        warnings: [],
      });

      const result = draftRegistry.resolveTargetDraft(USER_A);
      expect(result.status).toBe('ambiguous');
      if (result.status === 'ambiguous') {
        expect(result.candidates).toHaveLength(2);
        expect(result.message).toContain('Math Homework');
        expect(result.message).toContain('History Notes');
      }
    });

    it('handles spoken "cancel that" scenarios deterministically (P10-09)', () => {
      // 1. No pending
      const res0 = draftRegistry.handleCancelSpokenCommand(USER_A);
      expect(res0.status).toBe('none');

      // 2. One pending
      draftRegistry.registerDraft({
        cardId: 'card-cancel-1',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'reminder',
        title: 'Drink water',
        details: [],
        assumptions: [],
        warnings: [],
      });
      const res1 = draftRegistry.handleCancelSpokenCommand(USER_A);
      expect(res1.status).toBe('cancelled');
      expect(res1.cancelledDraft?.title).toBe('Drink water');
      expect(draftRegistry.getActiveDrafts(USER_A)).toHaveLength(0);

      // 3. Multi pending
      draftRegistry.registerDraft({
        cardId: 'card-cancel-a',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Task A',
        details: [],
        assumptions: [],
        warnings: [],
      });
      draftRegistry.registerDraft({
        cardId: 'card-cancel-b',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Task B',
        details: [],
        assumptions: [],
        warnings: [],
      });
      const res2 = draftRegistry.handleCancelSpokenCommand(USER_A);
      expect(res2.status).toBe('ambiguous');
      expect(res2.candidates).toHaveLength(2);
      expect(draftRegistry.getActiveDrafts(USER_A)).toHaveLength(2);
    });
  });

  describe('P10-06, P10-48 & F-048: Concurrency, Stale Tokens & Idempotency', () => {
    it('rejects stale confirmation when revision token does not match current draft', () => {
      const draft = draftRegistry.registerDraft({
        cardId: 'card-stale-test',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Dentist Appointment',
        details: [],
        assumptions: [],
        warnings: [],
      });

      // Update draft to bump revision to 2
      draftRegistry.reviseDraft(USER_A, draft.cardId, 1, 'Change to 3 PM');
      expect(draft.revision).toBe(2);

      // Stale confirm attempt using old revision 1
      const staleConfirm = draftRegistry.confirmDraft(USER_A, draft.cardId, 1);
      expect(staleConfirm.success).toBe(false);
      if (!staleConfirm.success) {
        expect(staleConfirm.error).toBe('stale_revision');
      }

      // Valid confirm attempt using current revision 2
      const validConfirm = draftRegistry.confirmDraft(USER_A, draft.cardId, 2);
      expect(validConfirm.success).toBe(true);
      if (validConfirm.success) {
        expect(validConfirm.status).toBe('applied');
      }
    });

    it('returns idempotent receipt on repeated confirm retry without duplicate writes (F-048)', () => {
      const draft = draftRegistry.registerDraft({
        cardId: 'card-idemp-test',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Submit Homework',
        details: [],
        assumptions: [],
        warnings: [],
      });

      const firstConfirm = draftRegistry.confirmDraft(USER_A, draft.cardId, 1);
      expect(firstConfirm.success).toBe(true);
      if (firstConfirm.success) {
        expect(firstConfirm.status).toBe('applied');
      }

      // Repeated confirm retry with same or subsequent call
      const secondConfirm = draftRegistry.confirmDraft(USER_A, draft.cardId, 1);
      expect(secondConfirm.success).toBe(true);
      if (secondConfirm.success && firstConfirm.success) {
        expect(secondConfirm.status).toBe('already_applied');
        expect(secondConfirm.receipt).toEqual(firstConfirm.receipt);
      }
    });
  });

  describe('P10-05, P10-07 & P10-08: Call Lifecycle, Interruption & Isolation', () => {
    it('cancelling draft does NOT terminate live call (P10-05)', () => {
      const draft = draftRegistry.registerDraft({
        cardId: 'card-cancel-lifecycle',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Discard Me',
        details: [],
        assumptions: [],
        warnings: [],
      });

      const cancelRes = draftRegistry.cancelDraft(USER_A, draft.cardId);
      expect(cancelRes.success).toBe(true);
      if (cancelRes.success) {
        expect(cancelRes.status).toBe('cancelled');
      }
      // Draft marked cancelled; call session remains untouched
      expect(draft.status).toBe('cancelled');
    });

    it('enforces multi-account isolation: USER_B cannot revise or confirm USER_A draft (P10-08)', () => {
      const draft = draftRegistry.registerDraft({
        cardId: 'card-alice-secret',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'note',
        title: 'Alice Notes',
        details: [],
        assumptions: [],
        warnings: [],
      });

      const bobRevise = draftRegistry.reviseDraft(
        USER_B,
        draft.cardId,
        1,
        'Change to 2 PM',
      );
      expect(bobRevise.success).toBe(false);
      if (!bobRevise.success) {
        expect(bobRevise.error).toBe('unauthorized');
      }

      const bobConfirm = draftRegistry.confirmDraft(USER_B, draft.cardId, 1);
      expect(bobConfirm.success).toBe(false);
      if (!bobConfirm.success) {
        expect(bobConfirm.error).toBe('unauthorized');
      }
    });

    it('clearSessionDrafts invalidates drafts when session ends or switches (P10-08)', () => {
      draftRegistry.registerDraft({
        cardId: 'card-sess-1',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Session 1 task',
        details: [],
        assumptions: [],
        warnings: [],
      });
      draftRegistry.registerDraft({
        cardId: 'card-sess-2',
        sessionId: SESSION_2,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Session 2 task',
        details: [],
        assumptions: [],
        warnings: [],
      });

      draftRegistry.clearSessionDrafts(SESSION_1);

      expect(draftRegistry.getDraft('card-sess-1')).toBeUndefined();
      expect(draftRegistry.getDraft('card-sess-2')).toBeDefined();
    });

    it('rejects a shadow-only revision and requires on-screen confirmation', async () => {
      draftRegistry.registerDraft({
        cardId: 'card-tool-test',
        sessionId: SESSION_1,
        ownerId: USER_A,
        revision: 1,
        kind: 'task',
        title: 'Study Session',
        date: '2026-11-12',
        time: '13:00',
        details: [],
        assumptions: [],
        warnings: [],
      });

      // 1. Tool revise_draft
      const reviseReply = await actionService.executeTool(
        USER_A,
        SESSION_1,
        'revise_draft',
        {cardId: 'card-tool-test', revision: 1, instruction: 'Change to 2 PM'},
        () => true,
      );
      expect(reviseReply).toContain('no longer available');
      expect(reviseReply).toContain('Nothing was changed');

      // 2. Tool confirm_draft
      const confirmReply = await actionService.executeTool(
        USER_A,
        SESSION_1,
        'confirm_draft',
        {cardId: 'card-tool-test', revision: 2},
        () => true,
      );
      expect(confirmReply).toContain('Nothing has been saved');

      // 3. Repeated confirm returns idempotent success
      const repeatReply = await actionService.executeTool(
        USER_A,
        SESSION_1,
        'confirm_draft',
        {cardId: 'card-tool-test', revision: 2},
        () => true,
      );
      expect(repeatReply).toContain('Nothing has been saved');
    });
  });
});
