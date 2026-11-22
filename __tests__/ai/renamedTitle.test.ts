import {renamedTitleIn} from '../../src/ai/nlu/commandReview';

// 2026-11-20 device report: "Rename the event to just capstone meeting"
// saved an event titled "the event to just capstone meeting".
describe('the new title in a spoken rename', () => {
  test.each([
    ['Rename the event to just capstone meeting.', 'capstone meeting'],
    ['rename it to Capstone Meeting', 'Capstone Meeting'],
    ['Rename to Thesis Defense', 'Thesis Defense'],
    ['rename it Lab Report', 'Lab Report'],
    ['rename my capstone meeting as Group Meeting', 'Group Meeting'],
    [
      'rename the meeting to meeting with Prof. Cruz',
      'meeting with Prof. Cruz',
    ],
    ['Change the title to "Capstone Sync"', 'Capstone Sync'],
    ['change the title of the event to Capstone Sync', 'Capstone Sync'],
    ['change the name to Defense Practice', 'Defense Practice'],
    ['set its name as Review Session', 'Review Session'],
    ['call it Capstone Meeting', 'Capstone Meeting'],
    ['Call the event Capstone Meeting instead', 'Capstone Meeting'],
    ['name it: Org Meeting', 'Org Meeting'],
  ])('%s', (instruction, title) => {
    expect(renamedTitleIn(instruction)).toBe(title);
  });

  test.each([
    'move it to 3pm',
    'make it 30 minutes longer',
    'change it to tomorrow',
    'save it',
  ])('no rename in "%s"', instruction => {
    expect(renamedTitleIn(instruction)).toBeUndefined();
  });
});
