/**
 * Reproduces selected incoming integration defects without running the app.
 * Reads the fixed Git revision only; all SQLite and module imports are inert
 * in-memory stubs. Does not use the network, a phone, or a real database.
 */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {writeFileSync} = require('node:fs');
const {resolve} = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const revision = '9c183a20eca2377b5e54f219c5f83460b18af81b';
const sources = [];

function readSource(path) {
  const source = execFileSync('git', ['show', `${revision}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const blob = execFileSync('git', ['rev-parse', `${revision}:${path}`], {
    encoding: 'utf8',
  }).trim();
  sources.push({
    path,
    blob,
    sha256: createHash('sha256').update(source).digest('hex'),
  });
  return source;
}

function loadIsolated(source, imports = {}) {
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    exports: {},
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
    // Suppress exception messages and SQL parameters, even in synthetic probes.
    console: {warn() {}, error() {}, log() {}},
  };
  vm.runInNewContext(javascript, context, {timeout: 1000});
  return context.exports;
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(
    args.length === 2 && args[0] === '--output',
    'Usage: node scripts/audit-incoming-data.cjs --output NEW_EVIDENCE_PATH',
  );
  const databaseSource = readSource('src/storage/database.ts');
  const databaseStatements = [];
  const unavailable = loadIsolated(databaseSource, {
    '@op-engineering/op-sqlite': {
      open() {
        throw new Error('Synthetic native open failure');
      },
    },
  }).db;
  let afterCommitCalled = false;
  const result = unavailable.transactionSync(transaction => {
    transaction.executeSync('SYNTHETIC WRITE', []);
    transaction.afterCommit(() => {
      afterCommitCalled = true;
    });
    return 'accepted';
  });
  const emptyWrite = unavailable.executeSync('SYNTHETIC WRITE');
  assert.equal(unavailable.isFallback(), true);
  assert.equal(result, 'accepted');
  assert.equal(afterCommitCalled, true);
  assert.equal(emptyWrite.rowsAffected, 0);

  const available = loadIsolated(databaseSource, {
    '@op-engineering/op-sqlite': {
      open: () => ({
        executeSync(sql) {
          databaseStatements.push(sql);
          return {rows: [], rowsAffected: 0};
        },
      }),
    },
  }).db;
  const pending = available.transactionSync(async transaction => {
    await Promise.resolve();
    transaction.executeSync('SYNTHETIC ASYNC WRITE');
    return 'done';
  });
  const beforeSettlement = databaseStatements.slice();
  await pending;
  assert.deepEqual(beforeSettlement, ['BEGIN IMMEDIATE TRANSACTION', 'COMMIT']);
  assert.deepEqual(databaseStatements, [
    'BEGIN IMMEDIATE TRANSACTION',
    'COMMIT',
    'SYNTHETIC ASYNC WRITE',
  ]);

  const dispatcher = readSource('src/scheduler/callDispatcher.ts');
  const start = dispatcher.indexOf('const normalizeCallCommand =');
  const end = dispatcher.indexOf('const publishSttMetric =');
  assert.ok(start >= 0 && end > start, 'Pure parser boundaries changed');
  const pureParser = loadIsolated(dispatcher.slice(start, end));
  const phrases = [
    ['do not acknowledge', 'acknowledge'],
    ['I did not acknowledge', 'acknowledge'],
    ['acknowledge later', 'acknowledge'],
    ['do not snooze', 'snooze'],
    ['snooze zero minutes', 'snooze'],
    ['okay but remind me later', null],
  ];
  const parserResults = phrases.map(([syntheticText, expected]) => {
    const detected = pureParser.detectCallKeyword(syntheticText);
    assert.equal(detected?.intent ?? null, expected);
    return {syntheticText, detected};
  });

  const reminderSource = readSource('src/storage/remindersStore.ts');
  const ackStatements = [];
  const inertTransaction = {
    executeSync(sql) {
      ackStatements.push(sql);
      return {rows: [], rowsAffected: 0};
    },
  };
  const reminderModule = loadIsolated(reminderSource, {
    './database': {
      db: {
        transactionSync: callback => callback(inertTransaction),
        executeSync: inertTransaction.executeSync,
      },
    },
    './syncOutboxStore': {syncOutboxStore: {enqueueMutation() {}}},
  });
  reminderModule.remindersStore.acknowledgeReminder('synthetic-reminder-id');
  assert.ok(
    ackStatements.some(sql =>
      /UPDATE reminders SET status = 'acknowledged'/.test(sql),
    ),
  );
  assert.equal(
    ackStatements.some(sql =>
      /\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+tasks\b/i.test(sql),
    ),
    false,
  );

  const localDate = '2026-10-27T00:00:00+08:00';
  const incomingDate = new Date(localDate).toISOString().split('T')[0];
  assert.equal(incomingDate, '2026-10-26');
  const evidence = {
    schemaVersion: 1,
    measuredAtUtc: new Date().toISOString(),
    incomingRevision: revision,
    command:
      'node scripts/audit-incoming-data.cjs --output docs/reports/evidence/phase-07-1-incoming-data-probes.json',
    runtime: {node: process.version, typescript: ts.version},
    boundaries: {
      networkUsed: false,
      appExecuted: false,
      nativeDatabaseUsed: false,
      deviceUsed: false,
      credentialsUsed: false,
      inputs: 'Synthetic strings, inert in-memory module/SQLite stubs only',
      claim: 'Source-level regression reproductions, not Android device proof',
    },
    sources,
    probes: {
      failedOpen: {
        fallback: unavailable.isFallback(),
        transactionReturn: result,
        afterCommitCalled,
        writeRowsAffected: emptyWrite.rowsAffected,
        finding: 'Reports success despite unavailable durable storage',
      },
      asynchronousTransaction: {
        beforePromiseSettlement: beforeSettlement,
        afterPromiseSettlement: databaseStatements,
        finding: 'Async write executes after COMMIT',
      },
      callParser: parserResults,
      positiveAckSeparation: {
        statements: ackStatements,
        updatesTask: false,
        finding:
          'Incoming ACK correctly updates reminder without completing task',
        limitation: 'Stub records SQL, not actual native persistence',
      },
      calendarDateExpression: {
        selectedLocalDate: localDate,
        expression: "new Date(localDate).toISOString().split('T')[0]",
        actual: incomingDate,
        expectedSelectedDate: '2026-10-27',
        finding: 'UTC slicing changes selected local date',
        limitation: 'Expression reproduction; calendar UI not executed',
      },
    },
    assertions: 'PASS: all asserted incoming behaviors reproduced',
  };
  const output = resolve(args[1]);
  // Evidence is append-only across runs: choose a new filename for a new cohort.
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, {flag: 'wx'});
  process.stdout.write(
    `PASS: isolated incoming data probes saved to ${output}\n`,
  );
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
