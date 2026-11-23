/**
 * Creates LAFINA's two release keys — once, ever, for this app.
 *
 *   npm run release:keygen
 *   npm run release:keygen -- --dir <folder outside this repository>
 *   npm run release:keygen -- --rotate   # replace a public key whose private half is lost
 *
 * 1. The APK signing key (a PKCS#12 keystore). Android installs an update only
 *    when it is signed with the same key as the installed app, so every
 *    release, from any computer or from GitHub Actions, must use this one.
 * 2. The update-manifest key (ECDSA P-256). Installed copies check the signed
 *    manifest on GitHub with its public half before downloading anything.
 *
 * Both private keys are written outside the repository (default ~/.lafina/)
 * and this script refuses a folder inside it. The public parts — the manifest
 * public key and the APK signer's certificate fingerprint — are written into
 * src/updates/releaseKey.ts, where they are safe to commit.
 *
 * Losing either private key means installed copies can no longer be updated in
 * place: back them up in a password manager, never a shared drive or the repo.
 */
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const keyFile = resolve(repoRoot, 'src', 'updates', 'releaseKey.ts');
const PUBLIC_KEY_LINE = /export const UPDATE_PUBLIC_KEY: string =\s*'([^']*)';/;
const SIGNER_LINE = /export const RELEASE_APK_SIGNER_SHA256: string =\s*'([^']*)';/;

export const KEY_ALIAS = 'lafina';
export const STORE_NAME = 'lafina-capstone-release.p12';
export const PROPERTIES_NAME = 'lafina-capstone-signing.properties';
export const MANIFEST_KEY_NAME = 'lafina-capstone-update-key.pem';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : undefined;
};

/** keytool from JAVA_HOME, then PATH. */
export const findKeytool = () => {
  const exe = process.platform === 'win32' ? 'keytool.exe' : 'keytool';
  const fromHome = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', exe) : null;
  if (fromHome && existsSync(fromHome)) return fromHome;
  const probe = spawnSync(exe, ['-help'], { encoding: 'utf8' });
  if (!probe.error) return exe;
  return null;
};

/** The SHA-256 of the signing certificate in a keystore, as lowercase hex. */
export const certificateSha256 = (keytool, storeFile, storePassword, alias = KEY_ALIAS) => {
  const listed = spawnSync(
    keytool,
    ['-list', '-v', '-keystore', storeFile, '-storetype', 'PKCS12', '-alias', alias, '-storepass', storePassword],
    { encoding: 'utf8' },
  );
  const match = /SHA256:\s*([0-9A-F:]{95})/i.exec(`${listed.stdout}\n${listed.stderr}`);
  return match ? match[1].replace(/:/g, '').toLowerCase() : null;
};

const main = () => {
  const dir = resolve(argument('--dir') ?? join(homedir(), '.lafina'));
  const rel = relative(repoRoot, dir);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    fail('Refusing to write private keys inside the repository. Choose a folder outside it.');
  }
  const storeFile = join(dir, STORE_NAME);
  const propertiesFile = join(dir, PROPERTIES_NAME);
  const manifestKeyFile = join(dir, MANIFEST_KEY_NAME);
  for (const file of [storeFile, propertiesFile, manifestKeyFile]) {
    if (existsSync(file)) {
      fail(
        `${file} already exists and was left untouched.\n` +
          'Replacing a release key stops every installed copy from accepting new updates.',
      );
    }
  }

  const source = readFileSync(keyFile, 'utf8');
  const currentPublic = PUBLIC_KEY_LINE.exec(source);
  if (!currentPublic) fail(`Could not find UPDATE_PUBLIC_KEY in ${keyFile}.`);
  if (currentPublic[1] && !process.argv.includes('--rotate')) {
    fail(
      `${keyFile} already holds a release key. Installed copies trust that one; sign with its\n` +
        'private key. Only if that private key is lost, run again with --rotate (installed copies\n' +
        'then need one manual reinstall).',
    );
  }

  const keytool = findKeytool();
  if (!keytool) fail('keytool was not found. Set JAVA_HOME to a JDK 17 and run this again.');

  mkdirSync(dir, { recursive: true });

  // PKCS#12 keeps one password for the store and the key.
  const password = randomBytes(24).toString('base64url');
  const created = spawnSync(
    keytool,
    [
      '-genkeypair',
      '-keystore', storeFile,
      '-storetype', 'PKCS12',
      '-alias', KEY_ALIAS,
      '-keyalg', 'RSA',
      '-keysize', '4096',
      '-validity', '10000',
      '-dname', 'CN=LAFINA, O=LAFINA-AI, C=PH',
      '-storepass', password,
      '-keypass', password,
    ],
    { encoding: 'utf8' },
  );
  if (created.status !== 0 || !existsSync(storeFile)) {
    fail(`keytool could not create the keystore:\n${created.stderr || created.stdout}`);
  }
  const signerSha256 = certificateSha256(keytool, storeFile, password);
  if (!signerSha256) fail('Could not read the new certificate fingerprint back from the keystore.');

  writeFileSync(
    propertiesFile,
    [
      '# LAFINA release signing. Private: never commit or share. Back up with the keystore.',
      `storeFile=${storeFile.replace(/\\/g, '/')}`,
      `storePassword=${password}`,
      `keyAlias=${KEY_ALIAS}`,
      `keyPassword=${password}`,
      '',
    ].join('\n'),
    { mode: 0o600, flag: 'wx' },
  );

  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  writeFileSync(manifestKeyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    mode: 0o600,
    flag: 'wx',
  });
  const publicBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

  let next = source.replace(PUBLIC_KEY_LINE, `export const UPDATE_PUBLIC_KEY: string =\n  '${publicBase64}';`);
  next = SIGNER_LINE.test(next)
    ? next.replace(SIGNER_LINE, `export const RELEASE_APK_SIGNER_SHA256: string =\n  '${signerSha256}';`)
    : `${next.trimEnd()}\n\nexport const RELEASE_APK_SIGNER_SHA256: string =\n  '${signerSha256}';\n`;
  writeFileSync(keyFile, next);

  console.log(`APK signing keystore:   ${storeFile}`);
  console.log(`Its passwords:          ${propertiesFile}`);
  console.log(`Update manifest key:    ${manifestKeyFile}`);
  console.log('\nBack up all three in a password manager. Never commit or share them.\n');
  console.log(`Public parts written to ${relative(repoRoot, keyFile)} (safe to commit).`);
  console.log(`APK signer SHA-256: ${signerSha256}\n`);
  console.log('For GitHub Actions releases, add these repository secrets (Settings > Secrets > Actions):');
  console.log(`  LAFINA_RELEASE_KEYSTORE_BASE64   base64 of ${STORE_NAME}`);
  console.log('  LAFINA_RELEASE_KEYSTORE_PASSWORD the storePassword above');
  console.log(`  LAFINA_UPDATE_KEY_PEM            the full text of ${MANIFEST_KEY_NAME}`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
