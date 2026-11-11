/** Audit-only reproductions. Passing means the named defect was reproduced. */
import {initDatabase} from '../../../../src/storage/dbInit';
import {db} from '../../../../src/storage/database';
import {userStore} from '../../../../src/storage/userStore';
import {voiceConsent, defaultVoiceConversationDeps} from '../../../../src/cloud/voiceConversation';
import {actionService} from '../../../../src/ai/voiceActions/actionService';
import {draftRegistry} from '../../../../src/ai/voiceActions/draftRegistry';
import {validatePayload} from '../../../../src/ai/voiceActions/actionValidator';
import {createMultiActionBatch, executeMultiActionBatch} from '../../../../src/ai/voiceActions/multiActionService';
import {chatMemoryStore} from '../../../../src/storage/chatMemoryStore';
import {chatOrchestrator} from '../../../../src/ai/chatOrchestrator';
import {saveCallLafinaSettings} from '../../../../src/cloud/voiceConversation/callLafinaSettingsStore';
import {onlineVoiceSettingsStore} from '../../../../src/storage/onlineVoiceSettingsStore';
import {checkScheduleConflict} from '../../../../src/ai/voiceActions/conflictChecker';
import {plannerQueries} from '../../../../src/storage/plannerQueries';

const owner = 'codex-audit-synthetic';
const count = (table: string) => Number(db.executeSync(`SELECT count(*) AS n FROM ${table} WHERE user_id = ?`, [owner]).rows[0].n);
beforeAll(async () => { await initDatabase(); });
beforeEach(() => {
  jest.restoreAllMocks();
  const now = new Date().toISOString();
  db.executeSync(`INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at) VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`, [owner, owner, 'audit@example.invalid', now, now]);
  jest.spyOn(userStore, 'isGuest').mockReturnValue(false);
  jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({userId: owner, accessToken: 'synthetic', refreshToken: null});
  voiceConsent.write(owner);
  chatMemoryStore.setEnabled(owner, true);
  chatMemoryStore.clear(owner);
  draftRegistry.clearAll();
});
afterEach(() => jest.restoreAllMocks());

test('CL2-001: confirm_draft says saved with no task or outbox write', async () => {
  draftRegistry.registerDraft({cardId:'audit-draft', sessionId:'audit-session', ownerId:owner, revision:1, kind:'task', title:'Audit task', details:[], assumptions:[], warnings:[]});
  const before = [count('tasks'), count('sync_outbox')];
  const result = await actionService.executeTool(owner, 'audit-session', 'confirm_draft', {cardId:'audit-draft', revision:1}, () => true);
  expect(result).toContain('confirmed and saved');
  expect([count('tasks'), count('sync_outbox')]).toEqual(before);
});

test('CL2-003: memory proposal ID supplied by panel is not an action ID', () => {
  const {actionId, proposal} = actionService.createMemoryProposal(owner, 'audit-session', 'I prefer afternoons');
  expect(actionId).not.toBe(proposal.id);
  expect(actionService.confirmMemoryProposal(owner, proposal.id)).toMatchObject({success:false, error:'Action not found'});
  expect(chatMemoryStore.list(owner)).toHaveLength(0);
  expect(actionService.confirmMemoryProposal(owner, actionId)).toMatchObject({success:true, status:'saved'});
});

test('CL2-004: legacy memory tool writes before any review confirmation', async () => {
  const result = await actionService.executeTool(owner, 'audit-session', 'save_lafina_memory', {request:'Remember that I prefer afternoon study time'}, () => true);
  expect(result).toContain('saved');
  expect(chatMemoryStore.list(owner).length).toBeGreaterThan(0);
});

test('CL2-005: new voice selection does not change the voice read by call dependencies', () => {
  onlineVoiceSettingsStore.save(owner, {id:'voice_A', name:'Voice A'});
  saveCallLafinaSettings(owner, {voiceId:'voice_B', voiceName:'Voice B'});
  expect(defaultVoiceConversationDeps(owner).getVoice()).toEqual({id:'voice_A', name:'Voice A'});
});

test('CL2-007: multi tool rejects its advertised flat schema and corrupts accepted nested schema', async () => {
  const flat = validatePayload('multi.prepare', {items:[{kind:'task', title:'Physics'}]});
  expect(flat.valid).toBe(false);
  let batch: any;
  await actionService.executeTool(owner, 'audit-session', 'prepare_multi_action', {items:[{kind:'task.prepare', payload:{title:'Physics'}}]}, () => true, {onMultiActionBatch:b => {batch=b;}});
  expect(batch.items[0]).toMatchObject({kind:'task.prepare', title:'Action 1'});
});

test('CL2-008: grouped event and reminder with no times silently get 09:00', async () => {
  const batch = createMultiActionBatch('audit-session', owner, [
    {id:'event-probe', kind:'event', title:'No time supplied event', status:'draft', savedEntityId:null, error:null},
    {id:'reminder-probe', kind:'reminder', title:'No time supplied reminder', status:'draft', savedEntityId:null, error:null},
  ]);
  await executeMultiActionBatch(batch, owner);
  expect(db.executeSync('SELECT start_time FROM events WHERE id = ?', [batch.items[0].savedEntityId]).rows[0].start_time).toBe('09:00');
  expect(db.executeSync('SELECT trigger_at FROM reminders WHERE id = ?', [batch.items[1].savedEntityId]).rows[0].trigger_at).toContain('T09:00:00');
});

test('CL2-009: targeted retry of a successful item duplicates its SQL record', async () => {
  const batch = createMultiActionBatch('audit-session', owner, [{id:'retry-probe', kind:'task', title:'Retry duplicate', status:'draft', savedEntityId:null, error:null}]);
  const before = count('tasks');
  await executeMultiActionBatch(batch, owner);
  const first = batch.items[0].savedEntityId;
  await executeMultiActionBatch(batch, owner, 'retry-probe');
  expect(count('tasks')).toBe(before + 2);
  expect(batch.items[0].savedEntityId).not.toBe(first);
});

test('CL2-011: schedule query error is presented as no conflicts', () => {
  jest.spyOn(plannerQueries, 'window').mockImplementation(() => {throw new Error('synthetic read failure');});
  expect(checkScheduleConflict(owner, '2026-11-11', '14:00', '15:00')).toEqual({hasConflict:false, conflictingItems:[], alternatives:[]});
});

test('CL2-013: strict validator accepts unknown payload fields', () => {
  const result = validatePayload('memory.prepare', {text:'Afternoons', ownerId:'forged-owner', unexpected:true});
  expect(result.valid).toBe(true);
});

test('CL2-002: spoken revision changes shadow draft but tap confirmation saves original time', async () => {
  let review: any;
  await actionService.executeTool(owner, 'audit-session', 'prepare_lafina_action', {request:'Add task: Physics homework tomorrow at 3pm'}, () => true, {onProposal:r => {review=r;}});
  expect(review.kind).toBe('proposal');
  const proposal = review.review.proposal;
  const revised = draftRegistry.reviseDraft(owner, proposal.operationId, 1, 'change to 4 PM');
  expect(revised.success).toBe(true);
  expect(draftRegistry.getDraft(proposal.operationId)?.time).toBe('16:00');
  await chatOrchestrator.confirmReview(owner, proposal.operationId, {speakReply:false});
  const row = db.executeSync('SELECT due_time FROM tasks WHERE user_id = ? AND title = ? ORDER BY created_at DESC LIMIT 1', [owner, proposal.title]).rows[0];
  expect(row.due_time).toBe('15:00');
});

test('CL2-002: spoken cancel does not retire the authoritative review operation', async () => {
  let review: any;
  await actionService.executeTool(owner, 'audit-session', 'prepare_lafina_action', {request:'Add task: Cancellation proof tomorrow at 2pm'}, () => true, {onProposal:r => {review=r;}});
  expect(review.kind).toBe('proposal');
  const proposal = review.review.proposal;
  const before = count('tasks');
  expect(draftRegistry.cancelDraft(owner, proposal.operationId).success).toBe(true);
  await chatOrchestrator.confirmReview(owner, proposal.operationId, {speakReply:false});
  expect(count('tasks')).toBe(before + 1);
});
