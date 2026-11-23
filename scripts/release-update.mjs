/**
 * Builds, checks and signs a LAFINA release that installed copies update to
 * from inside the app. Run by .github/workflows/release.yml on a version tag,
 * or by hand:
 *
 *   npm run release                    # build, check, sign; files in release/
 *   npm run release -- --publish       # ...and create the GitHub release (needs gh)
 *   npm run release -- --skip-build    # reuse the last Gradle build
 *   npm run release -- --allow-native-without-apk-bump   # see "Native changes" below
 *
 * Every release carries:
 *   lafina-android-bundle-<version>.zip  the JavaScript bundle and images; phones on the
 *                                         same APK build restart into it (a few MB)
 *   LAFINA-v<version>-arm64-v8a.apk      the app; phones on an older APK build install it
 *                                         from inside the app, new testers download it
 *   lafina-update-android.json           the signed manifest the app checks first
 *
 * The version is package.json's; the tag is v<version>. The release notes are
 * docs/releases/v<version>.md: its first "# " line is the title, the rest is
 * shown in the app's update sheet and on GitHub.
 *
 * Native changes: phones run a downloaded bundle only on the APK build it was
 * made for (android/app/build.gradle versionCode). When native code changed
 * since the last release (android/, or a package with Android code), the
 * versionCode must go up so phones install the new APK instead. This script
 * checks that against the last release's tag and refuses otherwise.
 *
 * Keys (see `npm run release:keygen`):
 *   APK signing: ~/.lafina/lafina-capstone-signing.properties, or LAFINA_RELEASE_SIGNING
 *                (read by Gradle). The built APK's signer must equal
 *                RELEASE_APK_SIGNER_SHA256 in src/updates/releaseKey.ts.
 *   Manifest:    --key <pem>, LAFINA_UPDATE_KEY_PEM (the PEM text), LAFINA_UPDATE_KEY
 *                (a path), or ~/.lafina/lafina-capstone-update-key.pem. Its public
 *                half must equal UPDATE_PUBLIC_KEY in src/updates/releaseKey.ts.
 */
import { spawnSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = resolve(repoRoot, 'android');

export const PRODUCT_ID = 'com.lafina.capstone';
export const MANIFEST_NAME = 'lafina-update-android.json';
export const RELEASE_ABI = 'arm64-v8a';
export const MAX_NOTES_CHARS = 12_000;
const BUNDLE_FILE = 'index.android.bundle';
const REPO = 'LAFINA-AI/LAFINA-CAPSTONE';
const LATEST_MANIFEST_URL = `https://github.com/${REPO}/releases/latest/download/${MANIFEST_NAME}`;
const NATIVE_PATHS = ['android/', 'scripts/patch-android-libs.mjs', 'patches/'];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

// ── Pure helpers (tested in scripts/tests/release-update.test.mjs) ──────────

/** Title (first "# " heading) and body of a release-notes file. */
export const splitNotes = (markdown, version) => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const index = lines.findIndex((line) => /^#\s+\S/.test(line));
  const title = index > -1 ? lines[index].replace(/^#\s+/, '').trim() : `LAFINA v${version}`;
  const body = (index > -1 ? [...lines.slice(0, index), ...lines.slice(index + 1)] : lines)
    .join('\n')
    .trim();
  return { title, body };
};

/** The notes as the app shows them: cut at a paragraph near the limit, pointing to GitHub. */
export const notesForManifest = (body, max = MAX_NOTES_CHARS) => {
  if (body.length <= max) return body;
  const room = max - 80;
  const cut = body.lastIndexOf('\n\n', room);
  return `${body.slice(0, cut > room / 2 ? cut : room).trimEnd()}\n\n*The full notes are on the release page.*`;
};

export const compareSemver = (a, b) => {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) return 0;
  for (let i = 1; i <= 3; i += 1) {
    if (Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) - Number(pb[i]);
  }
  if (!pa[4] && pb[4]) return 1;
  if (pa[4] && !pb[4]) return -1;
  return (pa[4] ?? '').localeCompare(pb[4] ?? '');
};

/** True when a build.gradle diff only changes the versionCode line. */
export const onlyVersionCodeChanged = (unifiedDiff) =>
  unifiedDiff
    .split('\n')
    .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line))
    .every((line) => /^[+-]\s*versionCode\s+\d+\s*$/.test(line) || /^[+-]\s*$/.test(line));

/**
 * Packages (from two package-lock.json files) that were added, removed or
 * changed version, and that ship Android code (`hasAndroid(name)`).
 */
export const nativePackageChanges = (oldLock, newLock, hasAndroid) => {
  const packages = (lock) => {
    const result = new Map();
    for (const [path, entry] of Object.entries(lock?.packages ?? {})) {
      if (!path.startsWith('node_modules/') || path.includes('/node_modules/', 13)) continue;
      result.set(path.slice('node_modules/'.length), entry?.version ?? '');
    }
    return result;
  };
  const before = packages(oldLock);
  const after = packages(newLock);
  const changed = new Set();
  for (const [name, version] of after) if (before.get(name) !== version) changed.add(name);
  for (const name of before.keys()) if (!after.has(name)) changed.add(name);
  return [...changed].filter((name) => hasAndroid(name)).sort();
};

/** The decision for this release's APK build number. */
export const checkVersionCode = ({ versionCode, published, nativeChanged, allowNativeWithoutBump }) => {
  if (!published) return { ok: true, kind: 'first' };
  if (versionCode < published.nativeVersionCode) {
    return {
      ok: false,
      message:
        `versionCode is ${versionCode}, lower than the latest release's ${published.nativeVersionCode}. ` +
        'Phones would ignore this release.',
    };
  }
  if (versionCode > published.nativeVersionCode) return { ok: true, kind: 'apk' };
  if (nativeChanged.length && !allowNativeWithoutBump) {
    return {
      ok: false,
      message:
        `Native code changed since v${published.version}:\n  ${nativeChanged.join('\n  ')}\n\n` +
        `Raise versionCode in android/app/build.gradle to ${versionCode + 1}, so phones install the new APK\n` +
        'instead of running this JavaScript on an APK without those changes. If none of these\n' +
        'changes reach the app (a comment, a test), run again with --allow-native-without-apk-bump.',
    };
  }
  return { ok: true, kind: 'bundle' };
};

/** A plain zip with fixed timestamps, so the same bundle always zips to the same bytes. */
export const createZip = (entries) => {
  const DOS_DATE_1980_01_01 = 0x21;
  const UTF8_NAMES = 0x0800;
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBytes, body);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8_NAMES, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
};

// ── The release ────────────────────────────────────────────────────────────

const fail = (message) => {
  console.error(`\n${message}`);
  process.exit(1);
};

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : undefined;
};

const git = (args) => {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: result.status === 0, out: (result.stdout ?? '').trim() };
};

const sha256OfFile = (path) =>
  new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolveHash(hash.digest('hex')));
  });

const filesUnder = (dir) => {
  if (!existsSync(dir)) return [];
  const found = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else found.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return found.sort();
};

const sdkDir = () => {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const local = join(androidDir, 'local.properties');
  if (existsSync(local)) {
    const match = /^sdk\.dir=(.*)$/m.exec(readFileSync(local, 'utf8'));
    if (match) return match[1].trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\');
  }
  return null;
};

/** The SHA-256 of the APK's signing certificate, via the SDK's apksigner. */
const apkSignerSha256 = (apkPath) => {
  const sdk = sdkDir();
  if (!sdk) fail('The Android SDK was not found (set ANDROID_HOME) to check the APK signature.');
  const tools = join(sdk, 'build-tools');
  const versions = existsSync(tools) ? readdirSync(tools).sort((a, b) => compareSemver(a, b) || a.localeCompare(b)) : [];
  const exe = process.platform === 'win32' ? 'apksigner.bat' : 'apksigner';
  const apksigner = versions.map((v) => join(tools, v, exe)).reverse().find((path) => existsSync(path));
  if (!apksigner) fail(`apksigner was not found under ${tools}.`);
  // apksigner is a .bat on Windows, run through cmd: quote paths (this repo's has spaces).
  const windows = process.platform === 'win32';
  const result = spawnSync(
    windows ? `"${apksigner}"` : apksigner,
    ['verify', '--print-certs', windows ? `"${apkPath}"` : apkPath],
    { encoding: 'utf8', shell: windows },
  );
  if (result.status !== 0) fail(`apksigner could not verify the APK:\n${result.stderr || result.stdout}`);
  const match = /Signer #1 certificate SHA-256 digest:\s*([0-9a-f]{64})/i.exec(result.stdout);
  if (!match) fail('apksigner did not report the APK signer.');
  return match[1].toLowerCase();
};

const readManifestKey = () => {
  const pemText = process.env.LAFINA_UPDATE_KEY_PEM;
  if (pemText && pemText.includes('PRIVATE KEY')) return createPrivateKey(pemText);
  const keyPath = resolve(
    argument('--key') ??
      process.env.LAFINA_UPDATE_KEY ??
      join(homedir(), '.lafina', 'lafina-capstone-update-key.pem'),
  );
  if (!existsSync(keyPath)) fail(`No update signing key at ${keyPath}. Create the keys with \`npm run release:keygen\`.`);
  return createPrivateKey(readFileSync(keyPath));
};

const latestPublished = async () => {
  try {
    const response = await fetch(LATEST_MANIFEST_URL, { signal: AbortSignal.timeout(20_000) });
    if (response.status === 404) return null;
    if (!response.ok) fail(`GitHub answered ${response.status} for the latest manifest. Try again.`);
    const { payload } = await response.json();
    const manifest = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return { version: String(manifest.version), nativeVersionCode: Number(manifest.nativeVersionCode) };
  } catch (error) {
    return fail(`Could not read the latest release from GitHub (${error.message}). Check the connection.`);
  }
};

/** Native changes between the last release's tag and HEAD. */
const nativeChangesSince = (tag) => {
  if (!git(['rev-parse', '-q', '--verify', `refs/tags/${tag}`]).ok) {
    fail(`Tag ${tag} (the latest release) is not in this checkout. Run: git fetch --tags`);
  }
  const changed = [];
  const files = git(['diff', '--name-only', tag, 'HEAD', '--', ...NATIVE_PATHS]).out.split('\n').filter(Boolean);
  for (const file of files) {
    if (file === 'android/app/build.gradle') {
      const diff = git(['diff', '-U0', tag, 'HEAD', '--', file]).out;
      if (onlyVersionCodeChanged(diff)) continue;
    }
    changed.push(file);
  }
  const oldLockText = git(['show', `${tag}:package-lock.json`]);
  if (oldLockText.ok) {
    const packages = nativePackageChanges(
      JSON.parse(oldLockText.out),
      JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8')),
      (name) => existsSync(join(repoRoot, 'node_modules', name, 'android')),
    );
    changed.push(...packages.map((name) => `npm package with Android code: ${name}`));
  }
  return changed;
};

const main = async () => {
  const publish = process.argv.includes('--publish');
  const skipBuild = process.argv.includes('--skip-build');

  // Version and notes.
  const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  if (!SEMVER.test(version)) fail(`package.json version "${version}" is not a plain version like 1.2.3.`);
  const tag = `v${version}`;
  const refName = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : null;
  if (refName && refName !== tag) fail(`The tag is ${refName}, but package.json says ${version}. They must match.`);
  const gradle = readFileSync(join(androidDir, 'app', 'build.gradle'), 'utf8');
  const versionCode = Number(/^\s*versionCode\s+(\d+)/m.exec(gradle)?.[1]);
  if (!versionCode) fail('Could not read versionCode from android/app/build.gradle.');

  const notesPath = resolve(argument('--notes') ?? join(repoRoot, 'docs', 'releases', `${tag}.md`));
  if (!existsSync(notesPath)) {
    fail(`No release notes at ${relative(repoRoot, notesPath)}. Write them first: they show in the app.`);
  }
  const { title, body } = splitNotes(readFileSync(notesPath, 'utf8'), version);
  if (body.length < 40) fail('The release notes are nearly empty. Write what changed for students.');

  if (!process.argv.includes('--allow-dirty') && git(['status', '--porcelain', '--untracked-files=no']).out) {
    fail('The working tree has uncommitted changes. Commit them, so the release matches its tag.');
  }

  // Keys.
  const releaseKeys = readFileSync(join(repoRoot, 'src', 'updates', 'releaseKey.ts'), 'utf8');
  const embeddedPublic = /UPDATE_PUBLIC_KEY: string =\s*'([^']*)'/.exec(releaseKeys)?.[1];
  const expectedSigner = /RELEASE_APK_SIGNER_SHA256: string =\s*'([^']*)'/.exec(releaseKeys)?.[1];
  if (!embeddedPublic || !expectedSigner) {
    fail('src/updates/releaseKey.ts has no release keys yet. Run `npm run release:keygen` once.');
  }
  const privateKey = readManifestKey();
  if (privateKey.asymmetricKeyType !== 'ec' || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    fail('The update signing key must be an ECDSA P-256 key.');
  }
  const publicKey = createPublicKey(privateKey);
  if (publicKey.export({ type: 'spki', format: 'der' }).toString('base64') !== embeddedPublic) {
    fail('The update signing key does not match UPDATE_PUBLIC_KEY in src/updates/releaseKey.ts.');
  }

  // Against the last release.
  const published = await latestPublished();
  if (published && compareSemver(version, published.version) <= 0) {
    fail(`v${version} is not newer than the latest release v${published.version}. Raise package.json's version.`);
  }
  const nativeChanged = published ? nativeChangesSince(`v${published.version}`) : [];
  const decision = checkVersionCode({
    versionCode,
    published,
    nativeChanged,
    allowNativeWithoutBump: process.argv.includes('--allow-native-without-apk-bump'),
  });
  if (!decision.ok) fail(decision.message);

  // Build.
  if (!skipBuild) {
    console.log(`Building LAFINA ${version} (APK build ${versionCode}, ${RELEASE_ABI})…\n`);
    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    const extra = (process.env.LAFINA_GRADLE_ARGS ?? '').split(' ').filter(Boolean);
    const result = spawnSync(
      gradlew,
      [':app:assembleRelease', `-PreactNativeArchitectures=${RELEASE_ABI}`, '--console=plain', ...extra],
      { cwd: androidDir, stdio: 'inherit', shell: process.platform === 'win32' },
    );
    if (result.status !== 0) fail('The build failed. Fix the error above and run this again.');
  }

  const outputs = join(androidDir, 'app', 'build', 'outputs', 'apk', 'release');
  const metadataPath = join(outputs, 'output-metadata.json');
  if (!existsSync(metadataPath)) fail('No release APK was built. Run without --skip-build.');
  const elements = JSON.parse(readFileSync(metadataPath, 'utf8')).elements ?? [];
  const element = elements.find((item) =>
    (item.filters ?? []).some((filter) => filter.filterType === 'ABI' && filter.value === RELEASE_ABI),
  );
  const builtApk = element?.outputFile ? join(outputs, element.outputFile) : null;
  if (!builtApk || !existsSync(builtApk)) fail(`No ${RELEASE_ABI} release APK in ${outputs}. Run without --skip-build.`);
  if (element.versionCode !== versionCode) fail(`The built APK is build ${element.versionCode}, not ${versionCode}. Rebuild.`);
  if (element.versionName !== version) {
    fail(
      `The built APK is version "${element.versionName}", not "${version}".\n` +
        'A "-preview" suffix means it was signed with the debug key: the release signing\n' +
        'properties were not found (see `npm run release:keygen`).',
    );
  }
  const signer = apkSignerSha256(builtApk);
  if (signer !== expectedSigner) {
    fail(
      `The APK is signed by ${signer},\nnot the LAFINA release key ${expectedSigner}.\n` +
        'Installed copies would refuse it. Build with the release signing properties.',
    );
  }

  const bundlePath = join(androidDir, 'app', 'build', 'generated', 'assets', 'react', 'release', BUNDLE_FILE);
  const resDir = join(androidDir, 'app', 'build', 'generated', 'res', 'react', 'release');
  if (!existsSync(bundlePath)) fail(`No bundle at ${bundlePath}. Run without --skip-build.`);
  const entries = [
    { name: BUNDLE_FILE, data: readFileSync(bundlePath) },
    // Images sit beside the bundle, where React Native looks for them when it
    // runs a bundle from a file instead of from the APK.
    ...filesUnder(resDir).map((name) => ({ name, data: readFileSync(join(resDir, ...name.split('/'))) })),
  ];
  const zipFile = `lafina-android-bundle-${version}.zip`;
  const zip = createZip(entries);
  const apkFile = `LAFINA-${tag}-${RELEASE_ABI}.apk`;

  const manifest = {
    schema: 1,
    product: PRODUCT_ID,
    version,
    platform: 'android',
    nativeVersionCode: versionCode,
    file: zipFile,
    size: zip.length,
    sha256: createHash('sha256').update(zip).digest('hex'),
    signedAt: new Date().toISOString(),
    title,
    notes: notesForManifest(body),
    apk: {
      file: apkFile,
      size: statSync(builtApk).size,
      sha256: await sha256OfFile(builtApk),
      versionCode,
      abis: [RELEASE_ABI],
      signerSha256: signer,
    },
  };
  const payload = Buffer.from(JSON.stringify(manifest), 'utf8');
  const signature = sign('sha256', payload, privateKey);
  if (!verify('sha256', payload, publicKey, signature)) fail('The manifest signature did not verify. Nothing was written.');

  const outDir = join(repoRoot, 'release');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, zipFile), zip);
  copyFileSync(builtApk, join(outDir, apkFile));
  writeFileSync(
    join(outDir, MANIFEST_NAME),
    `${JSON.stringify({ payload: payload.toString('base64'), signature: signature.toString('base64') }, null, 2)}\n`,
  );
  const releaseNotesFile = join(outDir, 'release-notes.md');
  writeFileSync(releaseNotesFile, `${body}\n`);

  const route =
    decision.kind === 'bundle'
      ? `Phones on APK build ${versionCode} restart into the new JavaScript (${(zip.length / 1024 / 1024).toFixed(1)} MB).`
      : `Phones on older APK builds download and install the new APK (${(manifest.apk.size / 1024 / 1024).toFixed(0)} MB) from inside the app.`;
  console.log(`\nSigned LAFINA ${version}: "${title}"`);
  console.log(route);
  console.log(`Files in ${relative(repoRoot, outDir)}/: ${zipFile}, ${apkFile}, ${MANIFEST_NAME}`);

  if (!publish) {
    console.log(`\nTo publish: push the tag (git tag ${tag} && git push origin ${tag}); the Release workflow does the rest.`);
    return;
  }
  const assets = [zipFile, apkFile, MANIFEST_NAME].map((name) => join(outDir, name));
  const created = spawnSync(
    'gh',
    ['release', 'create', tag, ...assets, '--repo', REPO, '--title', title, '--notes-file', releaseNotesFile, '--verify-tag', '--latest'],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (created.status !== 0) fail('gh could not create the release. Is the tag pushed, and is gh signed in?');
  console.log(`\nPublished ${tag}. Installed copies offer it the next time they check.`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
