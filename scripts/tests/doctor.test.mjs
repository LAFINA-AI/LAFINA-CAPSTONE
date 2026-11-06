/* AGY-PORT 12: doctor with synthetic adapters only (no real SDK, JDK or subprocess). */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {diagnose, readRequirements, satisfiesMinimum, SUBPROCESS_TIMEOUT_MS, nodeAdapter} from '../doctor.mjs';

const ROOT = path.join('Z:', 'proj');
const SDK = path.join('Z:', 'sdk');
const JDK = path.join('Z:', 'jdk');

const FILES = {
  [path.join(ROOT, 'android', 'build.gradle')]:
    'ext {\n buildToolsVersion = "36.0.0"\n compileSdkVersion = 36\n ndkVersion = "27.1.12297006"\n}',
  [path.join(ROOT, 'android', 'app', 'build.gradle')]:
    'externalNativeBuild {\n cmake {\n path file("x")\n version "3.22.1"\n }\n}',
  [path.join(ROOT, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties')]:
    'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.3.1-bin.zip',
  [path.join(ROOT, 'package.json')]: JSON.stringify({engines: {node: '>= 22.11.0'}}),
};

const adapter = ({files = FILES, present = [], spawn} = {}) => {
  const calls = [];
  return {
    calls,
    readFile: file => {
      if (!(file in files)) throw new Error('missing');
      return files[file];
    },
    exists: file => present.includes(file),
    spawn: (command, args, options) => {
      calls.push({command, args, options});
      return spawn ? spawn(command, args) : {status: 0, stdout: '', stderr: 'openjdk version "17.0.20" 2026-07-15'};
    },
  };
};

const allPresent = [
  path.join(JDK, 'bin', 'java.exe'),
  SDK,
  path.join(SDK, 'platforms/android-36'),
  path.join(SDK, 'build-tools/36.0.0'),
  path.join(SDK, 'ndk/27.1.12297006'),
  path.join(SDK, 'cmake/3.22.1'),
];
const env = {JAVA_HOME: JDK, ANDROID_HOME: SDK, SECRET_TOKEN: 'never-printed'};
const run = options =>
  diagnose({root: ROOT, env, platform: 'win32', nodeVersion: 'v24.19.0', ...options});

test('requirements come from the project files', () => {
  assert.deepEqual(readRequirements(ROOT, adapter()), {
    node: '>= 22.11.0',
    compileSdk: '36',
    buildTools: '36.0.0',
    ndk: '27.1.12297006',
    cmake: '3.22.1',
    gradle: '9.3.1',
    jdkMajor: '17',
  });
});

test('everything present passes, bounded, without printing the environment', () => {
  const fake = adapter({present: allPresent});
  const report = run({adapter: fake});
  assert.equal(report.ok, true);
  assert.ok(fake.calls.every(call => call.options.timeout === SUBPROCESS_TIMEOUT_MS));
  assert.equal(JSON.stringify(report).includes('never-printed'), false);
});

test('a missing NDK or CMake fails with the derived version named', () => {
  const report = run({adapter: adapter({present: allPresent.filter(p => !p.includes('ndk'))})});
  assert.equal(report.ok, false);
  assert.ok(report.rows.some(row => row.status === 'FAIL' && row.detail === 'ndk/27.1.12297006'));
});

test('wrong JDK major, a timeout and a failing java are failures', () => {
  assert.equal(run({adapter: adapter({present: allPresent, spawn: () => ({status: 0, stderr: 'openjdk version "25.0.1"'})})}).ok, false);
  const timedOut = run({adapter: adapter({present: allPresent, spawn: () => ({error: Object.assign(new Error('t'), {code: 'ETIMEDOUT'})})})});
  assert.equal(timedOut.ok, false);
  assert.ok(timedOut.rows.some(row => row.name === 'JDK' && row.detail === 'timed out'));
  assert.equal(run({adapter: adapter({present: allPresent, spawn: () => ({status: 1})})}).ok, false);
});

test('missing JAVA_HOME, SDK or declarations fail; old Node fails', () => {
  assert.equal(diagnose({root: ROOT, env: {}, adapter: adapter({present: allPresent}), platform: 'win32', nodeVersion: 'v24.19.0'}).ok, false);
  const noFiles = run({adapter: adapter({files: {}, present: allPresent})});
  assert.equal(noFiles.ok, false);
  assert.ok(noFiles.rows.some(row => row.name === 'declared NDK'));
  assert.equal(run({adapter: adapter({present: allPresent}), nodeVersion: 'v20.1.0'}).ok, false);
});

test('a long Windows checkout path warns about MAX_PATH but is not a failure', () => {
  const long = path.join('Z:', 'a'.repeat(60));
  const files = Object.fromEntries(Object.entries(FILES).map(([key, value]) => [key.replace(ROOT, long), value]));
  const report = diagnose({root: long, env, adapter: adapter({files, present: allPresent}), platform: 'win32', nodeVersion: 'v24.19.0'});
  assert.equal(report.ok, true);
  assert.ok(report.rows.some(row => row.name === 'Checkout path length' && row.status === 'WARN'));
});

test('engines range parsing', () => {
  assert.equal(satisfiesMinimum('v22.11.0', '>= 22.11.0'), true);
  assert.equal(satisfiesMinimum('v22.10.9', '>= 22.11.0'), false);
  assert.equal(satisfiesMinimum('v22.11.0', '^22'), null);
});

test('the real adapter refuses .env and signing files', () => {
  assert.throws(() => nodeAdapter.readFile(path.join(ROOT, '.env')));
  assert.throws(() => nodeAdapter.readFile(path.join(ROOT, 'android', 'app', 'release.keystore')));
});
