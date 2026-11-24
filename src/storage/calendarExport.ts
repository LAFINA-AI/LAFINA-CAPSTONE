import RNFS from 'react-native-fs';
import {plannerQueries} from './plannerQueries';
import {generateIcsString} from './icsHelper';

/** Append bounded batches and yield between writes, keeping full histories off the JS heap. */
export const writeCalendarExport = async (
  userId: string,
  path: string,
  isCurrent: () => boolean = () => true,
): Promise<number> => {
  const footer = 'END:VCALENDAR\r\n';
  const header = generateIcsString([], [], []).slice(0, -footer.length);
  let count = 0;
  const check = () => {
    if (!isCurrent())
      throw new Error(
        'The active account changed. Export again from your account.',
      );
  };
  check();
  await RNFS.writeFile(path, header, 'utf8');
  for (const batch of plannerQueries.exportBatches(userId)) {
    check();
    const text = generateIcsString(batch.events, batch.blocks, batch.tasks);
    await RNFS.appendFile(
      path,
      text.slice(header.length, -footer.length),
      'utf8',
    );
    count += batch.events.length + batch.blocks.length + batch.tasks.length;
  }
  check();
  await RNFS.appendFile(path, footer, 'utf8');
  return count;
};
