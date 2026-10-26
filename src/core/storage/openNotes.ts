import {openLocalDatabase} from './openLocalDatabase';
import {createNotesRepository} from './notesRepository';

export function openNotes() {
  return createNotesRepository(openLocalDatabase());
}
