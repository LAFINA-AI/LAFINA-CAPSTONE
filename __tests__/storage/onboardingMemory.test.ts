import {initDatabase} from '../../src/storage';
import {chatMemoryStore} from '../../src/storage/chatMemoryStore';
import {onboardingVoiceContext, readOnboardingIdentity, saveOnboardingMemories} from '../../src/storage/onboardingMemory';
import {localSettingsStore} from '../../src/storage/localSettingsStore';

beforeAll(async () => { await initDatabase(); });

test('onboarding saves chosen identity and study preferences without duplicates', () => {
  const user = 'onboarding-memory-a';
  chatMemoryStore.add(user, 'An unrelated existing memory.');
  saveOnboardingMemories(user, {preferredName:'Alex',tone:'casual'}, ['night']);
  saveOnboardingMemories(user, {preferredName:'Alex',tone:'casual'}, ['night']);
  expect(readOnboardingIdentity(user)).toEqual({preferredName:'Alex',tone:'casual'});
  expect(chatMemoryStore.list(user).map(m => m.text).sort()).toEqual([
    'An unrelated existing memory.', 'Prefers a casual conversational tone.',
    'Prefers studying during: night.', 'Prefers to be called Alex.',
  ].sort());
  saveOnboardingMemories(user, {preferredName:'Alex',tone:'professional'}, ['night']);
  const memories = chatMemoryStore.list(user).map(m => m.text);
  expect(memories).toContain('Prefers a professional conversational tone.');
  expect(memories).not.toContain('Prefers a casual conversational tone.');
  expect(memories).toContain('An unrelated existing memory.');
});

test('onboarding does not save facts when memory is off', () => {
  const user = 'onboarding-memory-off';
  chatMemoryStore.setEnabled(user, false);
  saveOnboardingMemories(user, {preferredName:'Sam',tone:'casual'}, ['night']);
  expect(chatMemoryStore.list(user)).toEqual([]);
});

test('onboarding seed data remains isolated by account', () => {
  saveOnboardingMemories('onboarding-owner-a', {preferredName:'Ari',tone:'casual'}, []);
  saveOnboardingMemories('onboarding-owner-b', {preferredName:'Bo',tone:'professional'}, []);
  expect(chatMemoryStore.list('onboarding-owner-a').map(m=>m.text)).not.toContain('Prefers to be called Bo.');
  expect(readOnboardingIdentity('onboarding-owner-b').preferredName).toBe('Bo');
});

test('voice identity context respects memory-off and removed memories', () => {
  const user = 'onboarding-voice-context';
  saveOnboardingMemories(user, {preferredName:'Ari',tone:'casual'}, []);
  expect(localSettingsStore.get(user, 'onboarding.memory.v1', '')).not.toContain('Ari');
  expect(localSettingsStore.get(user, 'onboarding.memory.v1', '')).not.toContain('casual');
  expect(onboardingVoiceContext(user)).toContain('Prefers to be called Ari.');
  const name = chatMemoryStore.list(user).find(m => m.text === 'Prefers to be called Ari.');
  if (!name) throw new Error('Expected onboarding name');
  chatMemoryStore.remove(user, name.id);
  expect(onboardingVoiceContext(user)).not.toContain('Ari');
  expect(readOnboardingIdentity(user).preferredName).toBe('');
  chatMemoryStore.setEnabled(user, false);
  expect(onboardingVoiceContext(user)).toBe('');
});
