import {initDatabase} from '../../src/storage';
import {chatMemoryStore} from '../../src/storage/chatMemoryStore';
import {
  onboardingVoiceContext,
  readOnboardingIdentity,
  refreshAcademicMemories,
  saveOnboardingMemories,
} from '../../src/storage/onboardingMemory';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {chooseNotUstpMode} from '../../src/storage/studentMode';
import {enableUstpForTest} from '../fixtures/ustpEligibility';

beforeAll(async () => {
  await initDatabase();
});

test('onboarding saves chosen identity and study preferences without duplicates', () => {
  const user = 'onboarding-memory-a';
  chatMemoryStore.add(user, 'An unrelated existing memory.');
  saveOnboardingMemories(user, {preferredName: 'Alex', tone: 'casual'}, [
    'night',
  ]);
  saveOnboardingMemories(user, {preferredName: 'Alex', tone: 'casual'}, [
    'night',
  ]);
  expect(readOnboardingIdentity(user)).toEqual({
    preferredName: 'Alex',
    tone: 'casual',
  });
  expect(
    chatMemoryStore
      .list(user)
      .map(m => m.text)
      .sort(),
  ).toEqual(
    [
      'An unrelated existing memory.',
      'Prefers a casual conversational tone.',
      'Prefers studying during: night.',
      'Prefers to be called Alex.',
    ].sort(),
  );
  saveOnboardingMemories(user, {preferredName: 'Alex', tone: 'professional'}, [
    'night',
  ]);
  const memories = chatMemoryStore.list(user).map(m => m.text);
  expect(memories).toContain('Prefers a professional conversational tone.');
  expect(memories).not.toContain('Prefers a casual conversational tone.');
  expect(memories).toContain('An unrelated existing memory.');
});

test('onboarding does not save facts when memory is off', () => {
  const user = 'onboarding-memory-off';
  chatMemoryStore.setEnabled(user, false);
  saveOnboardingMemories(user, {preferredName: 'Sam', tone: 'casual'}, [
    'night',
  ]);
  expect(chatMemoryStore.list(user)).toEqual([]);
});

test('onboarding seed data remains isolated by account', () => {
  saveOnboardingMemories(
    'onboarding-owner-a',
    {preferredName: 'Ari', tone: 'casual'},
    [],
  );
  saveOnboardingMemories(
    'onboarding-owner-b',
    {preferredName: 'Bo', tone: 'professional'},
    [],
  );
  expect(
    chatMemoryStore.list('onboarding-owner-a').map(m => m.text),
  ).not.toContain('Prefers to be called Bo.');
  expect(readOnboardingIdentity('onboarding-owner-b').preferredName).toBe('Bo');
});

test('voice identity context respects memory-off and removed memories', () => {
  const user = 'onboarding-voice-context';
  saveOnboardingMemories(user, {preferredName: 'Ari', tone: 'casual'}, []);
  expect(
    localSettingsStore.get(user, 'onboarding.memory.v1', ''),
  ).not.toContain('Ari');
  expect(
    localSettingsStore.get(user, 'onboarding.memory.v1', ''),
  ).not.toContain('casual');
  expect(onboardingVoiceContext(user)).toContain('Prefers to be called Ari.');
  const name = chatMemoryStore
    .list(user)
    .find(m => m.text === 'Prefers to be called Ari.');
  if (!name) throw new Error('Expected onboarding name');
  chatMemoryStore.remove(user, name.id);
  expect(onboardingVoiceContext(user)).not.toContain('Ari');
  expect(readOnboardingIdentity(user).preferredName).toBe('');
  chatMemoryStore.setEnabled(user, false);
  expect(onboardingVoiceContext(user)).toBe('');
});

test('academic memory comes only from a confirmed COR and never holds IDs or demographics', () => {
  const user = 'onboarding-cor-details';
  chatMemoryStore.setEnabled(user, true);
  const legacyProfile = {
    isUstpStudent: true,
    campus: 'USTP CDO Campus',
    registrationNo: '556711',
    studentNo: '2023305519',
    fullName: 'GONZALES, JOHN LEMAR L',
    formattedName: 'John Lemar L. Gonzales',
    preferredName: 'John Lemar',
    gender: 'M',
    age: 22,
    nationality: 'Filipino',
    college: 'COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING',
    collegeShort: 'CITC',
    program: 'B.S. in Information Technology',
    major: 'N/A',
    yearLevel: '4th Year - Baccalaureate',
    yearLevelShort: '4th Year',
    curriculum: 'CITC-BSIT-2018-2019',
    academicTerm: '1st Semester AY 2026-2027',
    academicYearTerm: '1st Semester AY 2026-2027',
    section: 'IT4R11_Track2',
    primarySection: 'IT4R11_Track2',
    totalUnits: '18',
    totalLecUnits: 14,
    totalLabUnits: 4,
    totalCreditUnits: 18,
    courses: [],
    updatedAt: '2026-11-12T00:00:00Z',
  };

  // The older call path (an unreviewed profile argument) adds no academic facts.
  saveOnboardingMemories(
    user,
    {preferredName: 'John Lemar', tone: 'casual'},
    ['evening'],
    legacyProfile,
  );
  let texts = chatMemoryStore.list(user).map(m => m.text);
  expect(texts).toContain('Prefers to be called John Lemar.');
  expect(texts.some(t => t.includes('B.S. in Information Technology'))).toBe(
    false,
  );
  expect(onboardingVoiceContext(user)).not.toContain('Information Technology');

  // A reviewed, confirmed COR adds program/campus facts, but never the
  // student or registration number, age, gender or nationality.
  enableUstpForTest(user, legacyProfile);
  refreshAcademicMemories(user);
  texts = chatMemoryStore.list(user).map(m => m.text);
  const all = texts.join('\n');
  expect(all).toContain('B.S. in Information Technology');
  expect(all).toContain('USTP CDO Campus');
  expect(all).not.toContain('2023305519');
  expect(all).not.toContain('556711');
  expect(all).not.toMatch(/Gender|Male|\bage\b|Filipino/i);
  const voiceCtx = onboardingVoiceContext(user);
  expect(voiceCtx).toContain('B.S. in Information Technology');
  expect(voiceCtx).not.toContain('2023305519');
  expect(voiceCtx).not.toMatch(/Male/);

  // Leaving USTP mode removes the academic facts and keeps the rest.
  chooseNotUstpMode(user);
  texts = chatMemoryStore.list(user).map(m => m.text);
  expect(texts.some(t => t.includes('Information Technology'))).toBe(false);
  expect(texts).toContain('Prefers to be called John Lemar.');
  expect(onboardingVoiceContext(user)).not.toContain('Information Technology');
});
