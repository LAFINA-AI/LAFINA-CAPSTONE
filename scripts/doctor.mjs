/*
 * AGY-PORT 12: read-only toolchain doctor.
 *
 * Requirements are derived from the project's own declarations (package.json
 * engines, android/build.gradle ext, android/app/build.gradle cmake block,
 * the Gradle wrapper), never hard-coded. It never installs anything, never
 * prints the environment, never opens .env or signing material, and bounds
 * every subprocess. Exit 0 = every required item is present; 1 = something
 * required is missing or failed (the report says what).
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const SUBPROCESS_TIMEOUT_MS = 10000;

const read = (adapter, file) => {
  try {
    return adapter.readFile(file);
  } catch {
    return null;
  }
};

const match = (text, pattern) => (text ? (text.match(pattern) ?? [])[1] ?? null : null);

/** Declared requirements, from project files only. */
export const readRequirements = (root, adapter) => {
  const rootGradle = read(adapter, path.join(root, 'android', 'build.gradle'));
  const appGradle = read(adapter, path.join(root, 'android', 'app', 'build.gradle'));
  const wrapper = read(adapter, path.join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'));
  const pkg = read(adapter, path.join(root, 'package.json'));
  let engines = {};
  try {
    engines = JSON.parse(pkg ?? '{}').engines ?? {};
  } catch {
    engines = {};
  }
  return {
    node: typeof engines.node === 'string' ? engines.node : null,
    compileSdk: match(rootGradle, /compileSdkVersion\s*=\s*(\d+)/),
    buildTools: match(rootGradle, /buildToolsVersion\s*=\s*"([\d.]+)"/),
    ndk: match(rootGradle, /ndkVersion\s*=\s*"([\d.]+)"/),
    cmake: match(appGradle, /cmake\s*\{[^}]*version\s+"([\d.]+)"/s),
    gradle: match(wrapper, /gradle-([\d.]+)-(?:bin|all)\.zip/),
    jdkMajor: '17',
  };
};

/** Minimal `>= x.y.z` check for package.json engines (the only form this project uses). */
export const satisfiesMinimum = (version, range) => {
  const want = (range ?? '').match(/^>=\s*(\d+)\.(\d+)\.(\d+)$/);
  const have = (version ?? '').replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!want || !have) return null;
  for (let i = 1; i <= 3; i += 1) {
    if (Number(have[i]) !== Number(want[i])) return Number(have[i]) > Number(want[i]);
  }
  return true;
};

/** Bounded subprocess; returns only the first output line, never the environment. */
const runVersion = (adapter, command, args) => {
  const result = adapter.spawn(command, args, {encoding: 'utf8', timeout: SUBPROCESS_TIMEOUT_MS, windowsHide: true});
  if (result.error) {
    return {ok: false, detail: result.error.code === 'ETIMEDOUT' ? 'timed out' : 'could not run'};
  }
  if (result.status !== 0) return {ok: false, detail: `exited ${result.status}`};
  const line = `${result.stderr ?? ''}\n${result.stdout ?? ''}`.split(/\r?\n/).find(text => text.trim());
  return {ok: true, detail: (line ?? '').trim().slice(0, 160)};
};

export const diagnose = ({root, env, adapter, platform = process.platform, nodeVersion = process.version}) => {
  const requirements = readRequirements(root, adapter);
  const rows = [];
  const add = (name, required, status, detail) => rows.push({name, required, status, detail});
  const exe = name => (platform === 'win32' ? `${name}.exe` : name);

  for (const [key, label] of [
    ['compileSdk', 'compileSdk'],
    ['buildTools', 'build-tools'],
    ['ndk', 'NDK'],
    ['cmake', 'CMake'],
    ['gradle', 'Gradle wrapper'],
  ]) {
    if (!requirements[key]) add(`declared ${label}`, true, 'FAIL', 'not found in project files');
  }

  const nodeOk = satisfiesMinimum(nodeVersion, requirements.node);
  add('Node', true, nodeOk === null ? 'UNKNOWN' : nodeOk ? 'PASS' : 'FAIL', `${nodeVersion}; package.json engines ${requirements.node ?? 'not declared'}`);

  const jdk = env.JAVA_HOME;
  const java = jdk ? path.join(jdk, 'bin', exe('java')) : null;
  if (!java || !adapter.exists(java)) {
    add('JDK', true, 'FAIL', 'JAVA_HOME not set or has no java executable');
  } else {
    const version = runVersion(adapter, java, ['-version']);
    const major = match(version.detail, /version "(\d+)/);
    add(
      'JDK',
      true,
      !version.ok ? 'FAIL' : major === requirements.jdkMajor ? 'PASS' : 'FAIL',
      version.ok ? `${version.detail}; this build uses JDK ${requirements.jdkMajor}` : version.detail,
    );
  }

  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!sdk || !adapter.exists(sdk)) {
    add('Android SDK', true, 'FAIL', 'set ANDROID_HOME to an installed SDK');
  } else {
    add('Android SDK', true, 'PASS', 'present');
    const components = [
      requirements.compileSdk && ['platform', `platforms/android-${requirements.compileSdk}`],
      requirements.buildTools && ['build-tools', `build-tools/${requirements.buildTools}`],
      requirements.ndk && ['NDK', `ndk/${requirements.ndk}`],
      requirements.cmake && ['CMake', `cmake/${requirements.cmake}`],
    ].filter(Boolean);
    for (const [label, relative] of components) {
      add(`${label} ${relative.split('/')[1]}`, true, adapter.exists(path.join(sdk, relative)) ? 'PASS' : 'FAIL', relative);
    }
    const adb = path.join(sdk, 'platform-tools', exe('adb'));
    if (adapter.exists(adb)) {
      const version = runVersion(adapter, adb, ['version']);
      add('adb', false, version.ok ? 'PASS' : 'WARN', version.ok ? version.detail : `${version.detail} (only needed for device checks)`);
    } else {
      add('adb', false, 'WARN', 'not found (only needed for device checks)');
    }
  }

  const pathLength = root.length;
  add(
    'Checkout path length',
    false,
    pathLength > 40 && platform === 'win32' ? 'WARN' : 'PASS',
    pathLength > 40 && platform === 'win32'
      ? `${pathLength} characters: native (ninja) builds exceed MAX_PATH; build from a short subst alias (see docs/plans/agy-improvements/reports/phase-11-native-qa.md)`
      : `${pathLength} characters`,
  );
  const failed = rows.some(row => row.required && row.status === 'FAIL');
  return {requirements, rows, ok: !failed};
};

export const nodeAdapter = {
  readFile: file => {
    if (/(^|[\\/])\.env/.test(file) || /\.(jks|keystore|p12|pem)$/i.test(file)) throw new Error('refused');
    return fs.readFileSync(file, 'utf8');
  },
  exists: file => fs.existsSync(file),
  spawn: (command, args, options) => spawnSync(command, args, options),
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const report = diagnose({root, env: process.env, adapter: nodeAdapter});
  for (const row of report.rows) {
    console.log(`${row.status.padEnd(7)} ${row.required ? 'required' : 'optional'}  ${row.name}: ${row.detail}`);
  }
  console.log(
    report.ok
      ? 'Doctor: every required tool is present. This is a host inventory, not build or device proof.'
      : 'Doctor: a required tool is missing or failed (see FAIL rows). Nothing was installed or changed.',
  );
  process.exitCode = report.ok ? 0 : 1;
}
