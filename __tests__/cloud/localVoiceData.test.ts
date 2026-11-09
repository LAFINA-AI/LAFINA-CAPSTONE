import {readLocalVoiceData} from '../../src/cloud/voiceConversation/localVoiceData';
import {chatMemoryStore} from '../../src/storage/chatMemoryStore';
import {notesQueryStore} from '../../src/storage/notesQueryStore';
import {plannerQueries} from '../../src/storage/plannerQueries';

afterEach(() => jest.restoreAllMocks());

test('memory is not read when the owner turned it off', () => {
  jest.spyOn(chatMemoryStore, 'isEnabled').mockReturnValue(false);
  const read = jest.spyOn(chatMemoryStore, 'list');
  expect(readLocalVoiceData('student-a', 'memory', '')).toContain('turned off');
  expect(read).not.toHaveBeenCalled();
});

test('note lookup is owner scoped and bounds content', () => {
  const page = jest.spyOn(notesQueryStore, 'page').mockReturnValue({items:[{title:'Class',body:'x'.repeat(900)}] as never, nextCursor:null, indexing:false});
  const result = JSON.parse(readLocalVoiceData('student-a', 'notes', 'class'));
  expect(page).toHaveBeenCalledWith({userId:'student-a',search:'class',limit:5});
  expect(result.notes[0].body).toHaveLength(600);
});

test('calendar reads only the selected owner and date', () => {
  const read = jest.spyOn(plannerQueries, 'window').mockReturnValue({events:[
    {title:'A',date:'2026-12-01',startTime:'10:00',endTime:'11:00'},
  ],tasks:[],blocks:[]} as never);
  const result = JSON.parse(readLocalVoiceData('student-a', 'calendar', '2026-12-01'));
  expect(read).toHaveBeenCalledWith('student-a','2026-12-01','2026-12-01');
  expect(result.events.map((e: {title: string}) => e.title)).toEqual(['A']);
});
