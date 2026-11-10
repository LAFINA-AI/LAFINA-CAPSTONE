import {groundedVoiceDraft} from '../../src/ai/nlu/groundedVoiceDraft';

const now = new Date(2026, 9, 27, 8, 0);

test('uses actual turns and asks for missing scheduling details', () => {
  expect(groundedVoiceDraft(['Add a time block for study session'], now)).toMatchObject({kind: 'clarify'});
  expect(groundedVoiceDraft(['Add a time block for study session', 'tomorrow'], now)).toMatchObject({kind: 'clarify'});
  const result = groundedVoiceDraft(['Add a time block for study session', 'tomorrow from 2 to 4pm'], now);
  expect(result).toMatchObject({kind: 'ready', intent: {intent: 'create_time_block', date: '2026-10-28', time: '14:00', endTime: '16:00'}});
  expect(groundedVoiceDraft(['Add a time block for study session', 'tomorrow', 'at 2pm', 'for one hour'], now)).toMatchObject({kind: 'ready', intent: {date: '2026-10-28', time: '14:00', durationMinutes: 60}});
});

test('requires a real scheduling request and does not use invented tool data', () => {
  expect(groundedVoiceDraft(['Tomorrow at 4pm'], now)).toMatchObject({kind: 'clarify'});
  expect(groundedVoiceDraft(['Add a task'], now)).toMatchObject({kind: 'clarify'});
  expect(groundedVoiceDraft(['Add a task', 'read chapter 5'], now)).toMatchObject({kind: 'ready', intent: {title: 'Read chapter 5'}});
});
