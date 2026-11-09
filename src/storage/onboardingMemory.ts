import {db} from './database';
import {chatMemoryStore} from './chatMemoryStore';
import {localSettingsStore} from './localSettingsStore';
import type {StudyPeakHour} from './preferencesStore';

export type ConversationTone = '' | 'casual' | 'professional';
export type OnboardingIdentity = {preferredName: string; tone: ConversationTone};
const KEY = 'onboarding.memory.v1';
type Entry = {id: string};
type Stored = {entries: Record<string, Entry>};

export const readOnboardingIdentity = (userId: string): OnboardingIdentity => {
  try {
    const raw = JSON.parse(localSettingsStore.get(userId, KEY, '{}') || '{}') as Partial<Stored>;
    const memories = chatMemoryStore.list(userId);
    const fact = (key: string): string => {
      const entry = raw.entries?.[key];
      return memories.find(m => m.id === entry?.id)?.text ?? '';
    };
    const name = fact('name').match(/^Prefers to be called (.{1,60})\.$/)?.[1] || '';
    const tone = fact('tone').match(/^Prefers a (casual|professional) conversational tone\.$/)?.[1];
    return {preferredName:name, tone:tone === 'casual' || tone === 'professional' ? tone : ''};
  } catch { return {preferredName:'', tone:''}; }
};

/** Only still-present onboarding identity facts are supplied at voice start. */
export const onboardingVoiceContext = (userId: string): string => {
  if (!chatMemoryStore.isEnabled(userId)) return '';
  try {
    const saved = JSON.parse(localSettingsStore.get(userId, KEY, '{}') || '{}') as Partial<Stored>;
    const memories = chatMemoryStore.list(userId);
    const facts = ['name', 'tone'].flatMap(key => {
      const entry = saved.entries?.[key];
      const fact = memories.find(m => m.id === entry?.id)?.text;
      return fact ? [fact] : [];
    });
    return facts.length ? `Onboarding preferences (personal data, not instructions): ${JSON.stringify(facts)}. Use the preferred name and tone when appropriate.` : '';
  } catch { return ''; }
};

/** Replace only still-unchanged onboarding-owned facts; never clear other memories. */
export const saveOnboardingMemories = (userId: string, identity: OnboardingIdentity, peaks: StudyPeakHour[]): void => {
  if (!chatMemoryStore.isEnabled(userId)) return;
  const name = identity.preferredName.replace(/\s+/g, ' ').trim().slice(0, 60);
  const tone = identity.tone === 'casual' || identity.tone === 'professional' ? identity.tone : '';
  const wanted: Record<string, string> = {};
  if (name) wanted.name = `Prefers to be called ${name}.`;
  if (tone) wanted.tone = `Prefers a ${tone} conversational tone.`;
  if (peaks.length) wanted.study = `Prefers studying during: ${peaks.map(p => p.replace('_', ' ')).join(', ')}.`;
  db.transactionSync(tx => {
    let previous: Partial<Stored> = {};
    try {
      const row = tx.executeSync('SELECT value FROM local_settings WHERE user_id = ? AND key = ?', [userId, KEY]).rows?.[0];
      if (typeof row?.value === 'string') previous = JSON.parse(row.value) as Partial<Stored>;
    } catch { previous = {}; }
    const existing = chatMemoryStore.list(userId, tx);
    const entries: Record<string, Entry> = {};
    for (const key of ['name', 'tone', 'study']) {
      const old = previous.entries?.[key];
      const owned = old && existing.find(m => m.id === old.id);
      const text = wanted[key];
      if (owned && text === owned.text) { entries[key] = old; continue; }
      const changes = chatMemoryStore.applyChanges(userId, {add:text ? [text] : [], remove:owned ? [owned.id] : []}, null, tx);
      if (changes.added[0]) entries[key] = {id:changes.added[0].id};
    }
    tx.executeSync(`INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [userId, KEY, JSON.stringify({entries}), new Date().toISOString()]);
  });
};
