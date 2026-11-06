/**
 * AGY-PORT 12: the host QA SQL runner uses only its own temporary file,
 * reports redacted results, fails on any failed check or unconfirmed
 * cleanup, and never touches the app's database.
 */
import {existsSync, readdirSync, readFileSync} from 'fs';
import {tmpdir} from 'os';
import {join, resolve} from 'path';
import {db} from '../../src/storage';
import {
  isOwnedQaDirectory,
  QA_STATEMENT_BUDGET,
  runQaSqlChecks,
} from './support/qaSqlChecks';
import {
  writeEvaluationEvidence,
} from './support/evaluationEvidence';

describe('AGY-PORT 12 isolated QA SQL checks', () => {
  afterEach(() => jest.restoreAllMocks());

  test('all checks pass on an owned file and the directory is removed', async () => {
    const appDb = jest.spyOn(db, 'executeSync').mockImplementation(() => {
      throw new Error('the app database must not be used');
    });
    let owned = '';
    const report = await runQaSqlChecks({
      remove: path => {
        owned = path;
        jest.requireActual<typeof import('fs')>('fs').rmSync(path, {
          recursive: true,
          force: true,
        });
      },
    });
    expect(report.status).toBe('passed');
    expect(report.checks.length).toBeGreaterThanOrEqual(14);
    expect(report.checks.every(item => item.passed)).toBe(true);
    expect(report.cleanup).toBe('removed');
    expect(isOwnedQaDirectory(owned)).toBe(true);
    expect(existsSync(owned)).toBe(false);
    expect(appDb).not.toHaveBeenCalled();

    // Redacted: names, booleans, numbers and the status only.
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/Study|Changed fixture|qa-owner|example\.invalid/);
    expect(text).not.toContain(tmpdir());
    writeEvaluationEvidence('qa-sql', {qaSql: report}, [
      'src/storage/dbInit.ts',
      'src/storage/notesQueryStore.ts',
    ], process.env.AGY_QA_SQL_OUTPUT);
  });

  test('a failed statement fails the run and cleanup still happens', async () => {
    let path = '';
    const report = await runQaSqlChecks({
      onOpen: connection => {
        connection.failWhen = query => /UPDATE notes SET body = 'Changed/.test(query);
      },
      remove: target => {
        path = target;
        jest.requireActual<typeof import('fs')>('fs').rmSync(target, {
          recursive: true,
          force: true,
        });
      },
    });
    expect(report.status).toBe('failed');
    expect(report.cleanup).toBe('removed');
    expect(existsSync(path)).toBe(false);
    expect(JSON.stringify(report)).not.toContain('injected storage failure');
  });

  test('unconfirmed cleanup is a failure even when every check passed', async () => {
    let leftover = '';
    const report = await runQaSqlChecks({
      remove: target => {
        leftover = target; // pretend removal silently did nothing
      },
    });
    expect(report.checks.every(item => item.passed)).toBe(true);
    expect(report.cleanup).toBe('failed');
    expect(report.status).toBe('failed');
    // This test owns the leftover; remove it now.
    jest.requireActual<typeof import('fs')>('fs').rmSync(leftover, {
      recursive: true,
      force: true,
    });
    expect(existsSync(leftover)).toBe(false);
  });

  test('a runaway check hits the statement budget instead of running on', async () => {
    const report = await runQaSqlChecks({
      onOpen: connection => {
        const execute = connection.executeSync;
        connection.executeSync = (query, params) => {
          // Burn the budget on the first data statement.
          if (/INSERT INTO users/.test(query)) {
            for (let i = 0; i < QA_STATEMENT_BUDGET; i += 1) {
              connection.statements.push('SELECT 1');
            }
          }
          return execute(query, params);
        };
      },
    });
    expect(report.status).toBe('failed');
    expect(report.cleanup).toBe('removed');
  });

  test('only a directory with the runner prefix directly in tmp is owned', () => {
    expect(isOwnedQaDirectory(join(tmpdir(), 'agy-qa-sql-Ab12Cd'))).toBe(true);
    expect(isOwnedQaDirectory(join(tmpdir(), 'other-Ab12Cd'))).toBe(false);
    expect(isOwnedQaDirectory(join(tmpdir(), 'x', 'agy-qa-sql-Ab12Cd'))).toBe(false);
    expect(isOwnedQaDirectory(resolve('agy-qa-sql-Ab12Cd'))).toBe(false);
    expect(isOwnedQaDirectory(join(tmpdir(), 'agy-qa-sql-'))).toBe(false);
  });

  test('the runner is not reachable from app code', () => {
    const offenders: string[] = [];
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, {withFileTypes: true})) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (/\.(ts|tsx|js)$/.test(entry.name)) {
          const text = readFileSync(file, 'utf8');
          if (/from\s+['"][^'"]*__tests__|require\(\s*['"][^'"]*__tests__/.test(text)) {
            offenders.push(file);
          }
        }
      }
    };
    visit(resolve(__dirname, '..', '..', 'src'));
    expect(offenders).toEqual([]);
  });
});
