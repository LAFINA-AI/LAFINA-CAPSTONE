import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import {buildCsv, buildJson, type BenchmarkRun} from '../../../ai/benchmark';

const EXPORT_SUBDIR = 'dev_benchmarks';

/**
 * Writes a benchmark run to the app's cache folder and opens the share sheet.
 * Nothing is uploaded; the student chooses where it goes.
 */
export const exportBenchmarkRun = async (
  run: BenchmarkRun,
  format: 'csv' | 'json',
): Promise<'shared' | 'cancelled'> => {
  const dir = `${RNFS.CachesDirectoryPath}/${EXPORT_SUBDIR}`;
  if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);
  const fileName = `lafina-benchmark-${run.runId}.${format}`;
  const path = `${dir}/${fileName}`;
  await RNFS.writeFile(
    path,
    format === 'csv' ? buildCsv(run) : buildJson(run),
    'utf8',
  );
  const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
  const outcome = (await Share.open({
    url: `file://${path}`,
    type: mimeType,
    filename: fileName,
    title: fileName,
    failOnCancel: false,
  })) as {dismissedAction?: boolean} | undefined;
  return outcome?.dismissedAction === true ? 'cancelled' : 'shared';
};

/** Removes exported benchmark files from the cache (never anything else). */
export const clearBenchmarkExports = async (): Promise<void> => {
  const dir = `${RNFS.CachesDirectoryPath}/${EXPORT_SUBDIR}`;
  try {
    if (await RNFS.exists(dir)) await RNFS.unlink(dir);
  } catch {
    // A file still being shared is removed next time.
  }
};
