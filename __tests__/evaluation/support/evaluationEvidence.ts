/**
 * AGY-PORT 12: frozen evaluation fixtures and fresh, non-overwriting evidence.
 *
 * Adapted from the LAFINA donor's scripts/evaluationEvidence.ts (pinned
 * 0d4bbe39). Changes for AGY: fixtures are listed with a per-file version
 * that must match the `-vN.json` name and the file's own `version`; hashes
 * are taken over LF-normalized bytes so a CRLF checkout verifies the same;
 * evidence may only be written under this run's evidence folder.
 *
 * Host-only. Nothing here runs in the app, and no fixture holds private data.
 */
import {createHash} from 'crypto';
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'fs';
import {isAbsolute, relative, resolve} from 'path';

export const ROOT = resolve(__dirname, '..', '..', '..');
const EVALUATION_DIR = resolve(ROOT, 'evaluation');
export const EVIDENCE_PREFIX = 'docs/plans/agy-improvements/reports/evidence/';
export const MANIFEST_NAME = 'fixture-manifest-v1.json';

export interface ManifestEntry {
  version: number;
  sha256: string;
}

export interface FixtureManifest {
  version: number;
  frozen: string;
  classification: string;
  rule: string;
  files: Record<string, ManifestEntry>;
}

export class FrozenFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrozenFixtureError';
  }
}

/** SHA-256 of the bytes with CRLF folded to LF (Git may check out either). */
export const normalizedSha256 = (bytes: Buffer): string =>
  createHash('sha256')
    .update(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
    .digest('hex');

const FIXTURE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*-v([1-9][0-9]*)\.json$/;

export const loadManifest = (): FixtureManifest => {
  const manifest = JSON.parse(
    readFileSync(resolve(EVALUATION_DIR, MANIFEST_NAME), 'utf8'),
  ) as FixtureManifest;
  if (
    manifest.version !== 1 ||
    !manifest.files ||
    typeof manifest.files !== 'object'
  ) {
    throw new FrozenFixtureError('Unsupported fixture manifest.');
  }
  return manifest;
};

/**
 * Checks one fixture's bytes against its manifest entry. Pure, so tampering
 * can be tested without touching the frozen files.
 */
export const verifyFixtureBytes = (
  manifest: FixtureManifest,
  name: string,
  bytes: Buffer,
): unknown => {
  const match = FIXTURE_NAME.exec(name);
  if (
    !match ||
    !Object.prototype.hasOwnProperty.call(manifest.files, name)
  ) {
    throw new FrozenFixtureError(`Unknown fixture: ${name}`);
  }
  const entry = manifest.files[name];
  const nameVersion = Number(match[1]);
  if (entry.version !== nameVersion) {
    throw new FrozenFixtureError(
      `${name}: manifest version ${entry.version} does not match the file name.`,
    );
  }
  if (normalizedSha256(bytes) !== entry.sha256) {
    throw new FrozenFixtureError(
      `${name} changed. Frozen fixtures are never edited: add a -v${nameVersion + 1} file instead of relabeling results.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new FrozenFixtureError(`${name} is not valid JSON.`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as {version?: unknown}).version !== nameVersion
  ) {
    throw new FrozenFixtureError(
      `${name}: its own version field does not match the file name.`,
    );
  }
  return parsed;
};

/** Reads a frozen fixture only after its fingerprint and version verify. */
export const readFrozenFixture = <T>(name: string): T => {
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new FrozenFixtureError(`Unknown fixture: ${name}`);
  }
  const manifest = loadManifest();
  // Name and membership are checked before any file is opened.
  if (!Object.prototype.hasOwnProperty.call(manifest.files, name)) {
    throw new FrozenFixtureError(`Unknown fixture: ${name}`);
  }
  return verifyFixtureBytes(
    manifest,
    name,
    readFileSync(resolve(EVALUATION_DIR, name)),
  ) as T;
};

const SOURCE_PATH = /^src\/[A-Za-z0-9_./-]+\.(?:ts|tsx)$/;

/** SHA-256 per named source file (LF-normalized). Only `src/**` TypeScript. */
export const fingerprintSources = (
  sources: readonly string[],
): Record<string, string> => {
  const hashes: Record<string, string> = {};
  for (const source of sources) {
    if (!SOURCE_PATH.test(source) || source.includes('..')) {
      throw new FrozenFixtureError(`Invalid evaluation source: ${source}`);
    }
    hashes[source] = normalizedSha256(readFileSync(resolve(ROOT, source)));
  }
  return hashes;
};

/** One hash over every `src/**` TypeScript file name and content hash. */
export const sourceTreeSha256 = (): string => {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(resolve(ROOT, directory), {
      withFileTypes: true,
    })) {
      if (entry.name.startsWith('.')) continue;
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(file);
    }
  };
  visit('src');
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(`${file}:${normalizedSha256(readFileSync(resolve(ROOT, file)))}\n`);
  }
  return hash.digest('hex');
};

/** Resolves and checks an evidence destination; never an existing file. */
export const checkEvidenceDestination = (output: string): string => {
  const destination = resolve(ROOT, output);
  const local = relative(ROOT, destination).replace(/\\/g, '/');
  if (
    isAbsolute(local) ||
    local.startsWith('..') ||
    !local.startsWith(EVIDENCE_PREFIX) ||
    !local.endsWith('.json') ||
    local.split('/').includes('..')
  ) {
    throw new FrozenFixtureError(
      `Evidence must be a new .json file under ${EVIDENCE_PREFIX}.`,
    );
  }
  if (existsSync(destination)) {
    throw new FrozenFixtureError(
      'Evidence already exists. Choose a new file name; never overwrite a result.',
    );
  }
  return destination;
};

export type EvaluationKind = 'intent' | 'notes' | 'speech' | 'protected' | 'qa-sql';

/**
 * Writes fresh host evidence when AGY_EVALUATION_OUTPUT names a new file.
 * Without it, nothing is written. `wx` refuses a file that appeared meanwhile.
 */
export const writeEvaluationEvidence = (
  kind: EvaluationKind,
  metrics: Record<string, unknown>,
  sources: readonly string[],
  output: string | undefined = process.env.AGY_EVALUATION_OUTPUT,
): string | null => {
  if (!output) return null;
  const destination = checkEvidenceDestination(
    output.replace(/\{kind\}/g, kind),
  );
  const manifest = loadManifest();
  const report = {
    version: 1,
    kind,
    recordedAt: new Date().toISOString(),
    environment: `Host Node ${process.version}, Jest with node:sqlite in memory; not Android timing`,
    fixtureManifest: manifest.files,
    sourceHashes: fingerprintSources(sources),
    sourceTreeSha256: sourceTreeSha256(),
    metrics,
    limits:
      'Synthetic regression and contract checks only. No phone latency, WER, SmolLM2 accuracy, audibility, battery or memory claim.',
  };
  writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`, {
    flag: 'wx',
  });
  return destination;
};
