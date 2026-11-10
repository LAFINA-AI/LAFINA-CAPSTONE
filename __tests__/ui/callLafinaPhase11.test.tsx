/**
 * Call Lafina 2.0 Phase 11 Tests — Multi-action Workflow, Follow-ups, and Authoritative Results.
 *
 * Verifies:
 * - P11-01 & F-043: Parse grouped requests into individually validated structured drafts (quotes preserved, no guessed fields).
 * - P11-02 & F-043: MultiActionCard renders scrollable list, per-item review/edit/cancel, and group confirm.
 * - P11-03 & F-044: Partial transaction semantics: explicit partial outcomes (item 1 saved, item 2 failed) with no replay of successful items.
 * - P11-04 & F-045: Context-driven follow-up reminder proposals with explicit confirmation.
 * - P11-05 & F-044: Saved item links resolve to persisted entities; failed items display retry controls.
 * - P11-06 & F-068: Truthful spoken summaries reflecting exact item counts ("1 saved, 1 failed").
 * - P11-07: Per-item revision and target resolution within batch.
 * - P11-08: Multi-account isolation and safe cancellation.
 * - P11-09: Capping large spoken task lists at MAX_MULTI_ITEMS (5) with truncation notices.
 */

import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {
  parseGroupedRequest,
  proposeFollowUpReminder,
  executeMultiActionBatch,
  formatMultiActionSpokenSummary,
  reviseMultiItem,
  cancelMultiItem,
  MAX_MULTI_ITEMS,
} from '../../src/ai/voiceActions/multiActionService';
import {MultiActionCard} from '../../src/ui/components/callLafina/cards/MultiActionCard';
import {ActionCardHost} from '../../src/ui/components/callLafina/ActionCardHost';
import {actionService} from '../../src/ai/voiceActions/actionService';
import {tasksStore} from '../../src/storage/tasksStore';
import {userStore} from '../../src/storage/userStore';
import {voiceConsent} from '../../src/cloud/voiceConversation';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {initDatabase} from '../../src/storage/dbInit';
import {db} from '../../src/storage/database';
import type {MultiActionBatchData} from '../../src/ai/voiceActions/types';

const TEST_USER = 'user-student-p11';
const OTHER_USER = 'user-intruder-p11';
const SESSION_ID = 'session-p11-test';

describe('Phase 11 — Multi-action Workflow, Follow-ups, and Authoritative Results', () => {
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
    seedUser(TEST_USER);
    seedUser(OTHER_USER);

    jest.spyOn(userStore, 'isGuest').mockReturnValue(false);
    jest.spyOn(userStore, 'getDarkModeEnabled').mockReturnValue(false);
    jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
      userId: TEST_USER,
      accessToken: 'valid-test-access-token',
      refreshToken: 'valid-test-refresh-token',
    });
    jest.spyOn(voiceConsent, 'read').mockReturnValue(true);
    jest.spyOn(localSettingsStore, 'get').mockReturnValue('true');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    try {
      db.executeSync('DELETE FROM tasks WHERE user_id = ?', [TEST_USER]);
      db.executeSync('DELETE FROM events WHERE user_id = ?', [TEST_USER]);
      db.executeSync('DELETE FROM reminders WHERE user_id = ?', [TEST_USER]);
      db.executeSync('DELETE FROM notes WHERE user_id = ?', [TEST_USER]);
    } catch {
      // best-effort cleanup
    }
  });

  describe('P11-01 & F-043: Grouped Request Parsing & Truncation Bounds', () => {
    const REF_DATE = new Date('2026-11-09T10:00:00Z'); // Monday

    it('parses compound request into individual structured items preserving quotes and dates', () => {
      const speech =
        'Add meeting with "Adviser Dr. Santos" Friday at 2 PM and remind me Thursday 8 PM to prepare slides';
      const result = parseGroupedRequest(speech, REF_DATE);

      expect(result.items).toHaveLength(2);
      expect(result.truncated).toBe(false);

      const [first, second] = result.items;
      expect(first.kind).toBe('event');
      expect(first.title).toBe('Adviser Dr. Santos');
      expect(first.time).toBe('14:00');

      expect(second.kind).toBe('reminder');
      expect(second.time).toBe('20:00');
      expect(second.status).toBe('draft');
    });

    it('caps large spoken requests at MAX_MULTI_ITEMS (5) and reports truncation (P11-09)', () => {
      const largeSpeech =
        'Task: clean desk; Task: read chapter 1; Task: do exercise 2; Task: email professor; Task: review notes; Task: buy notebook; Task: call library';
      const result = parseGroupedRequest(largeSpeech, REF_DATE);

      expect(result.items).toHaveLength(MAX_MULTI_ITEMS);
      expect(result.truncated).toBe(true);
    });
  });

  describe('P11-02 & F-043: MultiActionCard Rendering & Interactive Controls', () => {
    const makeSampleBatch = (): MultiActionBatchData => ({
      id: 'batch-test-1',
      sessionId: SESSION_ID,
      ownerId: TEST_USER,
      revision: 1,
      items: [
        {
          id: 'item-1',
          kind: 'task',
          title: 'Submit Capstone Draft',
          date: '2026-11-12',
          time: '17:00',
          status: 'draft',
          savedEntityId: null,
          error: null,
        },
        {
          id: 'item-2',
          kind: 'event',
          title: 'Defense Rehearsal',
          date: '2026-11-13',
          time: '14:00',
          endTime: '15:30',
          status: 'draft',
          savedEntityId: null,
          error: null,
        },
      ],
      status: 'draft',
    });

    it('renders scrollable list of items with edit inputs and group confirm button', () => {
      const batch = makeSampleBatch();
      const onConfirmAll = jest.fn();
      const onCancelAll = jest.fn();
      const onCancelItem = jest.fn();

      const {getByTestId, getByText} = render(
        <ThemeProvider userId={TEST_USER}>
          <MultiActionCard
            batch={batch}
            onConfirmAll={onConfirmAll}
            onCancelAll={onCancelAll}
            onCancelItem={onCancelItem}
          />
        </ThemeProvider>,
      );

      expect(getByTestId('multi-action-card')).toBeTruthy();
      expect(getByTestId('multi-action-card-scroll')).toBeTruthy();
      expect(getByText('Grouped Actions (2)')).toBeTruthy();

      expect(getByTestId('multi-item-title-input-0')).toBeTruthy();
      expect(getByTestId('multi-item-title-input-1')).toBeTruthy();

      // Trigger Save All
      fireEvent.press(getByTestId('multi-action-confirm-all'));
      expect(onConfirmAll).toHaveBeenCalledTimes(1);

      // Trigger Cancel item 0
      fireEvent.press(getByTestId('multi-item-cancel-0'));
      expect(onCancelItem).toHaveBeenCalledWith('item-1');
    });

    it('renders truncation notice when batch is flagged truncated (P11-09)', () => {
      const batch = makeSampleBatch();
      batch.truncated = true;

      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <MultiActionCard batch={batch} />
        </ThemeProvider>,
      );

      expect(getByTestId('multi-action-truncated-notice')).toBeTruthy();
    });
  });

  describe('P11-03 & F-044: Partial Transaction Semantics & Safe Retry', () => {
    it('handles partial failure: item 1 saves, item 2 fails without losing item 1', async () => {
      const batch: MultiActionBatchData = {
        id: 'batch-partial-test',
        sessionId: SESSION_ID,
        ownerId: TEST_USER,
        revision: 1,
        items: [
          {
            id: 'item-good',
            kind: 'task',
            title: 'Prepare Presentation',
            status: 'draft',
            savedEntityId: null,
            error: null,
          },
          {
            id: 'item-bad',
            kind: 'event',
            title: 'Failing Event',
            status: 'draft',
            savedEntityId: null,
            error: null,
          },
        ],
        status: 'draft',
      };

      // Mock tasksStore.insertEvent to throw SQLite error on item 2
      jest.spyOn(tasksStore, 'insertEvent').mockImplementationOnce(() => {
        throw new Error('SQLITE_BUSY: database is locked');
      });

      const {batch: resultBatch, spokenSummary} = await executeMultiActionBatch(batch, TEST_USER);

      expect(resultBatch.status).toBe('partial');
      expect(resultBatch.items[0].status).toBe('saved');
      expect(resultBatch.items[0].savedEntityId).toBeTruthy();

      expect(resultBatch.items[1].status).toBe('failed');
      expect(resultBatch.items[1].error).toContain('SQLITE_BUSY');

      expect(spokenSummary).toContain('1 item saved, 1 failed');
    });

    it('retrying failed items does NOT replay or duplicate previously saved items (P11-03, P11-08)', async () => {
      const insertTaskSpy = jest.spyOn(tasksStore, 'insertTask');
      const insertEventSpy = jest.spyOn(tasksStore, 'insertEvent');

      const batch: MultiActionBatchData = {
        id: 'batch-retry-test',
        sessionId: SESSION_ID,
        ownerId: TEST_USER,
        revision: 2,
        items: [
          {
            id: 'item-already-saved',
            kind: 'task',
            title: 'Already Saved Task',
            status: 'saved',
            savedEntityId: 'task-12345',
            error: null,
          },
          {
            id: 'item-to-retry',
            kind: 'event',
            title: 'Event To Retry',
            date: '2026-11-14',
            time: '10:00',
            status: 'failed',
            savedEntityId: null,
            error: 'Previous failure',
          },
        ],
        status: 'partial',
      };

      // Retry execution for the whole batch
      const {batch: retriedBatch, spokenSummary} = await executeMultiActionBatch(batch, TEST_USER);

      // insertTask was NEVER called for item-already-saved
      expect(insertTaskSpy).not.toHaveBeenCalled();
      // insertEvent was called for item-to-retry
      expect(insertEventSpy).toHaveBeenCalledTimes(1);

      expect(retriedBatch.status).toBe('saved');
      expect(retriedBatch.items[0].savedEntityId).toBe('task-12345');
      expect(retriedBatch.items[1].status).toBe('saved');
      expect(spokenSummary).toContain('All 2 items saved successfully');
    });
  });

  describe('P11-04 & F-045: Context-Driven Follow-Up Reminder Proposals', () => {
    it('creates follow-up reminder 15 minutes before parent event with explicit confirmation requirement', () => {
      const parentEvent = {
        title: 'Thesis Defense Rehearsal',
        date: '2026-11-13',
        time: '14:00',
      };

      const followUp = proposeFollowUpReminder(parentEvent, 15);

      expect(followUp.kind).toBe('reminder');
      expect(followUp.title).toBe('Reminder: Thesis Defense Rehearsal');
      expect(followUp.date).toBe('2026-11-13');
      expect(followUp.time).toBe('13:45');
      expect(followUp.followUp).toBe(true);
      expect(followUp.status).toBe('draft');
      expect(followUp.savedEntityId).toBeNull();
    });

    it('renders follow-up badge in MultiActionCard for context-driven reminder', () => {
      const batch: MultiActionBatchData = {
        id: 'batch-followup-render',
        sessionId: SESSION_ID,
        ownerId: TEST_USER,
        revision: 1,
        items: [
          {
            id: 'item-f1',
            kind: 'reminder',
            title: 'Reminder: Thesis Defense Rehearsal',
            date: '2026-11-13',
            time: '13:45',
            followUp: true,
            status: 'draft',
            savedEntityId: null,
            error: null,
          },
        ],
        status: 'draft',
      };

      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <MultiActionCard batch={batch} />
        </ThemeProvider>,
      );

      expect(getByTestId('multi-item-followup-badge-0')).toBeTruthy();
    });
  });

  describe('P11-05, P11-06 & F-068: Authoritative Entity Links & Truthful Spoken Summaries', () => {
    it('renders saved entity ID links for completed items and Retry for failed items (P11-05)', () => {
      const batch: MultiActionBatchData = {
        id: 'batch-links-test',
        sessionId: SESSION_ID,
        ownerId: TEST_USER,
        revision: 2,
        items: [
          {
            id: 'item-saved-1',
            kind: 'task',
            title: 'Research Survey',
            status: 'saved',
            savedEntityId: 'task-auth-99',
            error: null,
          },
          {
            id: 'item-failed-1',
            kind: 'note',
            title: 'Meeting Minutes',
            status: 'failed',
            savedEntityId: null,
            error: 'Storage full',
          },
        ],
        status: 'partial',
      };

      const onRetryItem = jest.fn();

      const {getByTestId, getByText} = render(
        <ThemeProvider userId={TEST_USER}>
          <MultiActionCard batch={batch} onRetryItem={onRetryItem} />
        </ThemeProvider>,
      );

      // Verify saved link
      expect(getByTestId('multi-item-link-0')).toBeTruthy();
      expect(getByText('Saved ID: task-auth-99 (task)')).toBeTruthy();

      // Verify error and retry button
      expect(getByTestId('multi-item-error-1')).toBeTruthy();
      expect(getByTestId('multi-item-retry-1')).toBeTruthy();

      fireEvent.press(getByTestId('multi-item-retry-1'));
      expect(onRetryItem).toHaveBeenCalledWith('item-failed-1');
    });

    it('formulates precise spoken summary without unverified optimistic claims (P11-06, F-068)', () => {
      const savedBatch: MultiActionBatchData = {
        id: 'b1',
        sessionId: SESSION_ID,
        ownerId: TEST_USER,
        revision: 1,
        items: [
          {id: '1', kind: 'task', title: 'Task 1', status: 'saved', savedEntityId: 't1', error: null},
          {id: '2', kind: 'reminder', title: 'Rem 2', status: 'saved', savedEntityId: 'r2', error: null},
        ],
        status: 'saved',
      };
      expect(formatMultiActionSpokenSummary(savedBatch)).toBe('All 2 items saved successfully.');

      const partialBatch: MultiActionBatchData = {
        id: 'b2',
        sessionId: SESSION_ID,
        ownerId: TEST_USER,
        revision: 2,
        items: [
          {id: '1', kind: 'task', title: 'Task 1', status: 'saved', savedEntityId: 't1', error: null},
          {id: '2', kind: 'reminder', title: 'Rem 2', status: 'failed', savedEntityId: null, error: 'Locked'},
        ],
        status: 'partial',
      };
      expect(formatMultiActionSpokenSummary(partialBatch)).toContain('1 item saved, 1 failed: "Rem 2"');
    });
  });

  describe('P11-07 & P11-08: Revisions, Cancellations & Session Isolation', () => {
    it('revises specific item title inside batch (P11-07)', () => {
      const batch: MultiActionBatchData = {
        id: 'b-rev',
        sessionId: SESSION_ID,
        ownerId: TEST_USER,
        revision: 1,
        items: [
          {id: 'item-alpha', kind: 'task', title: 'Old Title', status: 'draft', savedEntityId: null, error: null},
        ],
        status: 'draft',
      };

      const revised = reviseMultiItem(batch, 'item-alpha', {title: 'New Title'});
      expect(revised.revision).toBe(2);
      expect(revised.items[0].title).toBe('New Title');
    });

    it('cancelling item updates item status; cancelling all updates batch status to cancelled', () => {
      const batch: MultiActionBatchData = {
        id: 'b-cancel',
        sessionId: SESSION_ID,
        ownerId: TEST_USER,
        revision: 1,
        items: [
          {id: 'item-one', kind: 'task', title: 'Task A', status: 'draft', savedEntityId: null, error: null},
        ],
        status: 'draft',
      };

      const cancelled = cancelMultiItem(batch, 'item-one');
      expect(cancelled.items[0].status).toBe('cancelled');
      expect(cancelled.status).toBe('cancelled');
    });

    it('enforces multi-account isolation: OTHER_USER cannot confirm TEST_USER batch (P11-08)', async () => {
      const batch: MultiActionBatchData = {
        id: 'b-iso',
        sessionId: SESSION_ID,
        ownerId: TEST_USER,
        revision: 1,
        items: [
          {id: 'item-iso', kind: 'task', title: 'Secret Task', status: 'draft', savedEntityId: null, error: null},
        ],
        status: 'draft',
      };

      await expect(executeMultiActionBatch(batch, OTHER_USER)).rejects.toThrow(
        /Unauthorized/,
      );
    });
  });

  describe('ActionService Tool Dispatch Integration', () => {
    it('dispatches prepare_multi_action tool and presents batch to student', async () => {
      let receivedBatch: MultiActionBatchData | null = null;

      const reply = await actionService.executeTool(
        TEST_USER,
        SESSION_ID,
        'prepare_multi_action',
        {
          text: 'Add meeting with mentor on Friday at 3 PM and remind me Thursday 7 PM',
        },
        () => true,
        {
          onMultiActionBatch: batch => {
            receivedBatch = batch;
          },
        },
      );

      expect(reply).toContain('A grouped review card with 2 items is shown');
      expect(receivedBatch).not.toBeNull();
      if (receivedBatch) {
        expect((receivedBatch as MultiActionBatchData).items).toHaveLength(2);
        expect((receivedBatch as MultiActionBatchData).status).toBe('draft');
      }
    });

    it('dispatches propose_follow_up_reminder tool and presents proposal', async () => {
      let receivedBatch: MultiActionBatchData | null = null;

      const reply = await actionService.executeTool(
        TEST_USER,
        SESSION_ID,
        'propose_follow_up_reminder',
        {
          parentTitle: 'Research Presentation',
          date: '2026-11-20',
          time: '10:00',
          minutesBefore: 30,
        },
        () => true,
        {
          onMultiActionBatch: batch => {
            receivedBatch = batch;
          },
        },
      );

      expect(reply).toContain('A follow-up reminder card is proposed');
      expect(receivedBatch).not.toBeNull();
      if (receivedBatch) {
        expect((receivedBatch as MultiActionBatchData).items[0].time).toBe('09:30');
      }
    });

    it('renders MultiActionCard through ActionCardHost when multiActionBatch prop is provided', () => {
      const batch: MultiActionBatchData = {
        id: 'host-batch-test',
        sessionId: SESSION_ID,
        ownerId: TEST_USER,
        revision: 1,
        items: [
          {id: 'it1', kind: 'task', title: 'Card Host Task', status: 'draft', savedEntityId: null, error: null},
        ],
        status: 'draft',
      };

      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <ActionCardHost multiActionBatch={batch} />
        </ThemeProvider>,
      );

      expect(getByTestId('action-card-host')).toBeTruthy();
      expect(getByTestId('action-card-card')).toBeTruthy();
    });
  });
});
