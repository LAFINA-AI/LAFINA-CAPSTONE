/**
 * AGY-PORT 12: frozen, fingerprinted contract fixtures for AGY intents, Notes
 * search, offline speech eligibility and the protected-feature test map.
 *
 * These are synthetic regression checks of deterministic code. They are not
 * held-out accuracy: no SmolLM2, no recorded speech, no device timing.
 * Set AGY_EVALUATION_OUTPUT to a new JSON path under the run's evidence
 * folder (`{kind}` is replaced) to record fresh host evidence; otherwise
 * nothing is written.
 */
import {existsSync, readdirSync, readFileSync} from 'fs';
import {resolve} from 'path';
import {db, initDatabase, notesQueryStore, notesStore} from '../../src/storage';
import {
  escapeLike,
  normalizeNoteForSearch,
} from '../../src/storage/notesQueryStore';
import {parseIntentFastPath} from '../../src/ai/nlu/fastPathParser';
import {INTENT_ROUTES, routeIntent} from '../../src/ai/nlu/intentRoutes';
import {intentService} from '../../src/ai/nlu/intentService';
import type {ExtractedIntent, ParsedIntentType} from '../../src/ai/nlu/types';
import {
  eligibleOfflineVoices,
  selectOfflineVoice,
} from '../../src/ai/tts/ttsService';
import type {TtsVoice} from '../../src/ai/tts/ttsService';
import {
  checkEvidenceDestination,
  EVIDENCE_PREFIX,
  FrozenFixtureError,
  loadManifest,
  normalizedSha256,
  readFrozenFixture,
  ROOT,
  verifyFixtureBytes,
  writeEvaluationEvidence,
} from './support/evaluationEvidence';
import type {FixtureManifest} from './support/evaluationEvidence';

/**
 * Second lock on the v1 bytes. Changing a v1 file needs this table and the
 * manifest edited together, which a review sees; the rule is a new v2 file.
 */
const FROZEN_V1: Record<string, string> = {
  'intent-contract-v1.json':
    '99d8a9551e5acceb52bf57eaf4d74dadc09f9e88519fbf45753adc2af4559b16',
  'notes-contract-v1.json':
    '10d46c0faaa35a7cd4fa4d6d42c3bc678390c26d3cd75298ad0eb2965f56d806',
  'protected-contracts-v1.json':
    '76f2a1d8e450cb70874e67c72eace857f0585a57bc4d4393e3c263ee2fdd1385',
  'speech-contract-v1.json':
    '7508a0aba08f5a1606beeefeaab7b87e2d4fd8b79e9d7e243b7f159d1a87d6e1',
  'stt-corpus-v1.json':
    '13a83a3e48246e57c15d1947f59555c8a41b4d363e0f93f7734f201c5c57e75b',
};

/** Frozen v2 additions (intent contract updated after query_notes was added). */
const FROZEN_V2: Record<string, string> = {
  'intent-contract-v2.json':
    '9c06bbd4bfd8f7c6b18edf66dbc31f54b6766937a3a58bc2b84ac7f1e39da218',
};

type IntentField =
  | 'intent'
  | 'title'
  | 'date'
  | 'time'
  | 'endTime'
  | 'snoozeMinutes'
  | 'targetTitle'
  | 'newTitle'
  | 'isCompleted'
  | 'targetEntityType';

interface IntentFixture {
  version: number;
  cases: Array<{
    id: string;
    command: string;
    expect: Partial<Record<IntentField, unknown>> & {
      intent: ParsedIntentType;
      route: string;
    };
  }>;
  emptyTranscripts: Array<{id: string; transcript: string; intent: string}>;
  ringingCall: Array<{id: string; intent: ParsedIntentType; route: string}>;
}

interface NotesFixture {
  version: number;
  normalize: Array<{
    id: string;
    title: string;
    body: string;
    contains: string[];
    excludes: string[];
  }>;
  escapeLike: Array<{input: string; output: string}>;
  notes: Array<{
    id: string;
    title: string;
    body: string;
    category: string;
    pinned: boolean;
    voice: boolean;
  }>;
  queries: Array<{
    id: string;
    query: {search?: string; filter?: string};
    titles: string[];
  }>;
}

interface SpeechFixture {
  version: number;
  cases: Array<{
    id: string;
    voices: unknown;
    eligible: string[];
    selected: string | null;
  }>;
}

interface ProtectedFixture {
  version: number;
  contracts: Record<string, Array<{file: string; title: string}>>;
}

const CLOCK = new Date(2026, 6, 6, 12, 0, 0);

const manifestWith = (
  name: string,
  entry: {version: number; sha256: string},
): FixtureManifest => ({
  ...loadManifest(),
  files: {[name]: entry},
});

describe('AGY-PORT 12 frozen evaluation fixtures', () => {
  describe('fingerprints and versions', () => {
    test('the manifest lists exactly the frozen v1 bytes and v2 additions', () => {
      const manifest = loadManifest();
      const digests = Object.fromEntries(
        Object.entries(manifest.files).map(([name, entry]) => [
          name,
          entry.sha256,
        ]),
      );
      for (const [name, sha] of Object.entries(FROZEN_V1)) {
        expect(digests[name]).toBe(sha);
      }
      expect(digests).toEqual({...FROZEN_V1, ...FROZEN_V2});
    });

    test('every fixture verifies, and no fixture is unlisted', () => {
      const manifest = loadManifest();
      const onDisk = readdirSync(resolve(ROOT, 'evaluation'))
        .filter(name => name.endsWith('.json'))
        .filter(name => name !== 'fixture-manifest-v1.json')
        .sort();
      expect(onDisk).toEqual(Object.keys(manifest.files).sort());
      for (const name of onDisk) {
        const match = /-v([1-9][0-9]*)\.json$/.exec(name);
        const expectedVersion = match ? Number(match[1]) : 1;
        expect(readFrozenFixture<{version: number}>(name).version).toBe(
          expectedVersion,
        );
      }
    });

    test('an edited fixture is refused and told to version instead', () => {
      const manifest = loadManifest();
      const name = 'speech-contract-v1.json';
      const bytes = readFileSync(resolve(ROOT, 'evaluation', name));
      const edited = Buffer.from(
        bytes.toString('utf8').replace('"us-preferred"', '"us-preferred-x"'),
      );
      expect(() => verifyFixtureBytes(manifest, name, edited)).toThrow(
        /changed.*-v2/,
      );
    });

    test('a CRLF checkout of the same bytes verifies', () => {
      const manifest = loadManifest();
      const name = 'notes-contract-v1.json';
      const bytes = readFileSync(resolve(ROOT, 'evaluation', name));
      const crlf = Buffer.from(
        bytes.toString('utf8').replace(/\r?\n/g, '\r\n'),
      );
      expect(() => verifyFixtureBytes(manifest, name, crlf)).not.toThrow();
    });

    test('a manifest version that disagrees with the file name is refused', () => {
      const bytes = Buffer.from('{"version": 1}\n');
      const name = 'probe-contract-v1.json';
      expect(() =>
        verifyFixtureBytes(
          manifestWith(name, {version: 2, sha256: normalizedSha256(bytes)}),
          name,
          bytes,
        ),
      ).toThrow(/does not match the file name/);
    });

    test("a fixture whose own version disagrees with its name is refused", () => {
      const bytes = Buffer.from('{"version": 2}\n');
      const name = 'probe-contract-v1.json';
      expect(() =>
        verifyFixtureBytes(
          manifestWith(name, {version: 1, sha256: normalizedSha256(bytes)}),
          name,
          bytes,
        ),
      ).toThrow(/own version field/);
    });

    test('unknown, unversioned and path-like names are refused', () => {
      for (const name of [
        'missing-v1.json',
        'intent-contract.json',
        '../package.json',
        'sub/intent-contract-v1.json',
        'sub\\intent-contract-v1.json',
      ]) {
        expect(() => readFrozenFixture(name)).toThrow(FrozenFixtureError);
      }
    });
  });

  describe('evidence writer', () => {
    test('nothing is written without an explicit output path', () => {
      expect(writeEvaluationEvidence('intent', {}, [], '')).toBeNull();
    });

    test('destinations outside the evidence folder are refused', () => {
      for (const output of [
        'docs/reports/x.json',
        'evaluation/new.json',
        `${EVIDENCE_PREFIX}../escape.json`,
        `${EVIDENCE_PREFIX}agy-port-20261106/phase-12/x.txt`,
        resolve(ROOT, '..', 'outside.json'),
      ]) {
        expect(() => checkEvidenceDestination(output)).toThrow(
          FrozenFixtureError,
        );
      }
    });

    test('an existing result is never overwritten', () => {
      const existing = `${EVIDENCE_PREFIX}agy-port-20261106/phase-11/apk-audit-dataqa-arm64-v8a-1.json`;
      expect(existsSync(resolve(ROOT, existing))).toBe(true);
      expect(() => checkEvidenceDestination(existing)).toThrow(
        /already exists/,
      );
    });

    test('only src TypeScript sources may be fingerprinted', () => {
      expect(() =>
        writeEvaluationEvidence(
          'intent',
          {},
          ['.env'],
          `${EVIDENCE_PREFIX}agy-port-20261106/phase-12/never-written-${process.pid}.json`,
        ),
      ).toThrow(/Invalid evaluation source/);
    });
  });

  describe('intent contract (deterministic fast path and routes)', () => {
    const fixture = readFrozenFixture<IntentFixture>('intent-contract-v2.json');
    let passed = 0;

    afterAll(() => {
      writeEvaluationEvidence(
        'intent',
        {
          cases: fixture.cases.length,
          emptyTranscripts: fixture.emptyTranscripts.length,
          ringingCall: fixture.ringingCall.length,
          passed,
        },
        [
          'src/ai/nlu/fastPathParser.ts',
          'src/ai/nlu/intentRoutes.ts',
          'src/ai/nlu/intentService.ts',
        ],
      );
    });

    test('covers every AGY intent type', () => {
      const covered = new Set<string>([
        ...fixture.cases.map(item => item.expect.intent),
        ...fixture.emptyTranscripts.map(item => item.intent),
      ]);
      expect([...covered].sort()).toEqual(Object.keys(INTENT_ROUTES).sort());
      expect(new Set(fixture.cases.map(item => item.id)).size).toBe(
        fixture.cases.length,
      );
    });

    test.each(fixture.cases)('$id', item => {
      const parsed = parseIntentFastPath(item.command, CLOCK);
      const {route, ...fields} = item.expect;
      const actual: Record<string, unknown> = {};
      for (const key of Object.keys(fields) as IntentField[]) {
        actual[key] = (parsed as ExtractedIntent)[key] ?? null;
      }
      expect(actual).toEqual(fields);
      expect(routeIntent(parsed.intent)).toBe(route);
      passed += 1;
    });

    test.each(fixture.emptyTranscripts)('$id', async item => {
      const result = await intentService.extractIntent(item.transcript);
      expect(result.intent).toBe(item.intent);
      expect(routeIntent(result.intent)).toBe('conversation');
      passed += 1;
    });

    test.each(fixture.ringingCall)('$id', item => {
      expect(
        routeIntent(item.intent, {
          ringingCall: {reminderId: 'fixture-reminder', generation: 0},
        }),
      ).toBe(item.route);
      passed += 1;
    });
  });

  describe('Notes contract (normalization, escaping, filtered pages)', () => {
    const fixture = readFrozenFixture<NotesFixture>('notes-contract-v1.json');
    const OWNER = 'p12-notes-contract';
    let passed = 0;

    beforeAll(async () => {
      await initDatabase();
      const now = new Date().toISOString();
      db.executeSync(
        `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
         VALUES (?, ?, ?, 'student', 0, ?, ?)`,
        [OWNER, OWNER, `${OWNER}@example.invalid`, now, now],
      );
      for (const note of fixture.notes) {
        notesStore.insert({
          id: `${OWNER}-${note.id}`,
          userId: OWNER,
          title: note.title,
          body: note.body,
          isPinned: note.pinned,
          tags: [],
          category: note.category,
          isVoiceTranscribed: note.voice,
        });
      }
    });

    afterAll(() => {
      writeEvaluationEvidence(
        'notes',
        {
          normalize: fixture.normalize.length,
          escapeLike: fixture.escapeLike.length,
          queries: fixture.queries.length,
          passed,
        },
        ['src/storage/notesQueryStore.ts', 'src/storage/notesStore.ts'],
      );
    });

    test.each(fixture.normalize)('normalize $id', item => {
      const text = normalizeNoteForSearch(item.title, item.body);
      for (const piece of item.contains) expect(text).toContain(piece);
      for (const piece of item.excludes) expect(text).not.toContain(piece);
      passed += 1;
    });

    test.each(fixture.escapeLike)('escapeLike $input', item => {
      expect(escapeLike(item.input)).toBe(item.output);
      passed += 1;
    });

    test.each(fixture.queries)('page $id', item => {
      // A search indexes a bounded batch per call; repeat until it settles.
      let page = notesQueryStore.page({userId: OWNER, ...item.query});
      for (let i = 0; page.indexing && i < 10; i += 1) {
        page = notesQueryStore.page({userId: OWNER, ...item.query});
      }
      expect(page.indexing).toBe(false);
      expect(page.items.map(note => note.title).sort()).toEqual(
        [...item.titles].sort(),
      );
      passed += 1;
    });
  });

  describe('speech contract (positive offline eligibility)', () => {
    const fixture = readFrozenFixture<SpeechFixture>('speech-contract-v1.json');
    let passed = 0;

    afterAll(() => {
      writeEvaluationEvidence(
        'speech',
        {cases: fixture.cases.length, passed},
        ['src/ai/tts/ttsService.ts'],
      );
    });

    test.each(fixture.cases)('$id', item => {
      expect(eligibleOfflineVoices(item.voices).map(voice => voice.id)).toEqual(
        [...item.eligible].sort(),
      );
      const selected = selectOfflineVoice(item.voices as TtsVoice[]);
      expect(selected ? selected.id : null).toBe(item.selected);
      passed += 1;
    });
  });

  describe('protected AGY contracts keep named tests', () => {
    const fixture = readFrozenFixture<ProtectedFixture>(
      'protected-contracts-v1.json',
    );
    let passed = 0;

    afterAll(() => {
      writeEvaluationEvidence(
        'protected',
        {contracts: Object.keys(fixture.contracts).length, passed},
        [],
      );
    });

    test('PF01 to PF13 are all mapped', () => {
      expect(Object.keys(fixture.contracts).sort()).toEqual(
        Array.from({length: 13}, (_, i) => `PF${String(i + 1).padStart(2, '0')}`),
      );
    });

    test.each(Object.entries(fixture.contracts))('%s', (_id, references) => {
      expect(references.length).toBeGreaterThan(0);
      for (const reference of references) {
        expect(reference.file).toMatch(/^__tests__\/[A-Za-z0-9_/.-]+\.test\.tsx?$/);
        const source = readFileSync(resolve(ROOT, reference.file), 'utf8');
        const quoted = [`'${reference.title}'`, `"${reference.title}"`, `\`${reference.title}\``];
        expect(quoted.some(text => source.includes(text))).toBe(true);
      }
      passed += 1;
    });
  });
});
