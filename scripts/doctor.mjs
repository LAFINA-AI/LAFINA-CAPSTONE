import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Report only selected public version/path-presence facts, never an environment dump.
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const jdk = process.env.JAVA_HOME;
console.log(`Node: ${process.version}; expected 24.19.x`);
console.log(
  `JAVA_HOME: ${
    jdk && fs.existsSync(path.join(jdk, 'bin', 'java.exe'))
      ? 'JDK executable present; use version check below'
      : 'not set / not verified'
  }`,
);
console.log(
  `Android SDK: ${
    sdk && fs.existsSync(sdk) ? 'present' : 'set ANDROID_HOME to installed SDK'
  }`,
);
for (const component of [
  'platforms/android-36',
  'build-tools/36.0.0',
  'ndk/27.1.12297006',
  'cmake/3.22.1',
]) {
  console.log(
    `${component}: ${
      sdk && fs.existsSync(path.join(sdk, component)) ? 'present' : 'not found'
    }`,
  );
}
const version = spawnSync(
  jdk
    ? path.join(jdk, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : 'java',
  ['-version'],
  {encoding: 'utf8'},
);
console.log(
  (
    version.stderr ||
    version.stdout ||
    'Java version command unavailable'
  ).trim(),
);
console.log(
  'Device tests: run adb devices -l locally; do not commit serials. A host inventory is not native build or device proof.',
);
console.log(
  'App models/backend: not required by Phase 01. Graphify: not installed; npm run check:architecture is the reproducible import/cycle substitute.',
);
