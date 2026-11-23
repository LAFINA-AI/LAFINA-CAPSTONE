/* In-app update releases: the release script's checks, with synthetic inputs only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import {
  checkVersionCode,
  compareSemver,
  createZip,
  nativePackageChanges,
  notesForManifest,
  onlyVersionCodeChanged,
  splitNotes,
  parseApkSignerSha256,
} from '../release-update.mjs';

test('splits the title from the notes', () => {
  assert.deepEqual(splitNotes('# LAFINA v1.1.0 — Updates\r\n\r\nBody **here**.\n', '1.1.0'), {
    title: 'LAFINA v1.1.0 — Updates',
    body: 'Body **here**.',
  });
  assert.deepEqual(splitNotes('No heading at all.', '1.1.0'), {
    title: 'LAFINA v1.1.0',
    body: 'No heading at all.',
  });
});

test('cuts long notes at a paragraph and points to the release page', () => {
  const body = `${'a'.repeat(9_000)}\n\n${'b'.repeat(9_000)}`;
  const cut = notesForManifest(body);
  assert.ok(cut.length <= 12_000);
  assert.ok(cut.startsWith('a'.repeat(9_000)));
  assert.ok(!cut.includes('b'));
  assert.match(cut, /full notes are on the release page/);
  assert.equal(notesForManifest('short'), 'short');
});

test('compares versions', () => {
  assert.ok(compareSemver('1.1.0', '1.0.9') > 0);
  assert.ok(compareSemver('1.10.0', '1.9.0') > 0);
  assert.ok(compareSemver('1.1.0', '1.1.0-rc.1') > 0);
  assert.equal(compareSemver('2.0.0', '2.0.0'), 0);
});

test('a build.gradle diff that only raises versionCode is not a native change', () => {
  const bump = 'diff --git a b\n--- a/android/app/build.gradle\n+++ b/android/app/build.gradle\n@@ -26 +26 @@\n-        versionCode 7\n+        versionCode 8\n';
  assert.equal(onlyVersionCodeChanged(bump), true);
  assert.equal(onlyVersionCodeChanged(`${bump}+    implementation('x:y:1')\n`), false);
});

test('only packages with Android code count as native changes', () => {
  const lock = (versions) => ({
    packages: {
      '': { version: '1.0.0' },
      ...Object.fromEntries(Object.entries(versions).map(([name, version]) => [`node_modules/${name}`, { version }])),
      'node_modules/a/node_modules/nested': { version: '1' },
    },
  });
  const android = new Set(['react-native-tts', 'react-native-fs']);
  const changed = nativePackageChanges(
    lock({ 'react-native-tts': '4.1.0', rrule: '2.8.0', 'react-native-fs': '2.20.0' }),
    lock({ 'react-native-tts': '4.1.1', rrule: '2.8.1', 'react-native-svg': '15.0.0' }),
    (name) => android.has(name),
  );
  assert.deepEqual(changed, ['react-native-fs', 'react-native-tts']);
});

test('decides the APK build number against the last release', () => {
  const published = { version: '1.1.0', nativeVersionCode: 7 };
  assert.deepEqual(checkVersionCode({ versionCode: 7, published: null, nativeChanged: [] }), { ok: true, kind: 'first' });
  assert.deepEqual(checkVersionCode({ versionCode: 7, published, nativeChanged: [] }), { ok: true, kind: 'bundle' });
  assert.deepEqual(checkVersionCode({ versionCode: 8, published, nativeChanged: ['android/x.kt'] }), { ok: true, kind: 'apk' });
  const refused = checkVersionCode({ versionCode: 7, published, nativeChanged: ['android/x.kt'] });
  assert.equal(refused.ok, false);
  assert.match(refused.message, /Raise versionCode .* to 8/);
  assert.equal(checkVersionCode({ versionCode: 6, published, nativeChanged: [] }).ok, false);
  assert.deepEqual(
    checkVersionCode({ versionCode: 7, published, nativeChanged: ['android/x.kt'], allowNativeWithoutBump: true }),
    { ok: true, kind: 'bundle' },
  );
});

test('zips entries the app can unpack', () => {
  const data = Buffer.from('console.log("LAFINA");'.repeat(50));
  const zip = createZip([{ name: 'index.android.bundle', data }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const method = zip.readUInt16LE(8);
  const compressedSize = zip.readUInt32LE(18);
  const nameLength = zip.readUInt16LE(26);
  const body = zip.subarray(30 + nameLength, 30 + nameLength + compressedSize);
  assert.deepEqual(method === 8 ? inflateRawSync(body) : body, data);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.deepEqual(createZip([{ name: 'index.android.bundle', data }]), zip, 'same input, same bytes');
});

test('reads the APK signer from old and new apksigner output', () => {
  const sha = 'c87209e987f87abc27a535c0be835ae4ff469052ea054018ff6654174902bdfe';
  const v37 = `V2 Signer: certificate DN: CN=LAFINA, O=LAFINA-AI, C=PH\nV2 Signer: certificate SHA-256 digest: ${sha}\nV2 Signer: certificate SHA-1 digest: acee0a32\n`;
  const old = `Signer #1 certificate DN: CN=LAFINA\nSigner #1 certificate SHA-256 digest: ${sha.toUpperCase()}\n`;
  assert.equal(parseApkSignerSha256(v37), sha);
  assert.equal(parseApkSignerSha256(old), sha);
  assert.equal(parseApkSignerSha256('Verifies\n'), null);
  assert.equal(parseApkSignerSha256(undefined), null);
});
