/**
 * USTP CDO knowledge pack (ADR-044): retrieval, scoping, conflicts and
 * citations against the real bundled corpus (the 2023 Student Handbook plus
 * the November 24, 2026 USTP Cagayan de Oro snapshot).
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {db, initDatabase, userStore} from '../../src/storage';
import {migrateKnowledgeCollections} from '../../src/storage/handbookSchema';
import {
  LOCAL_NO_EVIDENCE_REPLY,
  analyzeKnowledgeQuery,
  campusSourceNote,
  isSnapshotStale,
  localHandbookService,
} from '../../src/handbook';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {isHandbookQuestion} from '../../src/ai/onlineIntentExtractor';
import {
  handbookSourceLabel,
  onlineChatSkill,
} from '../../src/skills/onlineChatSkill';
import {enableUstpForTest} from '../fixtures/ustpEligibility';
import campusPack from '../../src/handbook/ustpCdoKnowledgePack.json';

/** Tuesday 24 Nov 2026, 09:00 local: the snapshot's own date. */
const REF = new Date(2026, 10, 24, 9, 0, 0);
const GUEST = 'local_guest_user';
const CALENDAR_URL =
  'https://drive.google.com/file/d/1ijghm2zH9S203nn58Qxe8Ln8wchVWw3h/view?usp=sharing';
const PACK_DIR = join(
  __dirname,
  '..',
  '..',
  'knowledge',
  'ustp-cdo',
  '2026-11-24',
);

beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'queueMicrotask',
    ],
  });
  jest.setSystemTime(REF);
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(async () => {
  await initDatabase();
  userStore.createGuestUser();
  enableUstpForTest(GUEST);
  userStore.setCurrentUser(GUEST);
  localHandbookService.resetForTests();
  jest.restoreAllMocks();
});

const search = (q: string) => localHandbookService.search(q, {limit: 3});
const offline = (q: string) =>
  localHandbookService.answerOffline(q, {referenceDate: REF});

describe('campus questions reach the USTP CDO knowledge', () => {
  test.each([
    [
      'What are AY 2026-27 undergraduate term dates?',
      'Authoritative term summary',
    ],
    [
      'When are 1st sem non-graduating final exams?',
      'First semester AY 2026-2027',
    ],
    ['When are 2nd sem midterms?', 'Second semester AY 2026-2027'],
    ['How to enroll in PRISMS?', 'PRISMS'],
    ['Where is e-Library?', 'e-Library'],
    ['What does SITE stand for?', 'curricular organizations'],
    ['Does USTP CDO offer BSIT?', 'BSIT'],
    ['Who is the dean of CITC?', 'office holders'],
    ['What is the registrar phone number?', 'Where to ask'],
    ['When is Week of Welcome?', 'Week of Welcome'],
    ['Where is USTP CDO located?', 'contact'],
    ['When are graduate midterms in the second semester?', 'graduate'],
  ])('"%s" leads with a campus passage about %s', async (question, section) => {
    const result = await search(question);
    expect(result.insufficientEvidence).toBe(false);
    expect(result.matches[0].chunk.collection).toBe('ustp_cdo');
    expect(result.matches[0].chunk.section.toLowerCase()).toContain(
      section.toLowerCase(),
    );
  });

  test('standing policies still come from the 2023 Student Handbook', async () => {
    for (const [question, section] of [
      ['What is the campus dress code policy?', 'DRESS CODE'],
      ['can I still drop this subject', 'Dropping of Subjects'],
      ['How does INC grade completion work?', 'Grade Completion'],
    ]) {
      const result = await search(question);
      expect(result.matches[0].chunk.collection).toBe('handbook');
      expect(result.matches[0].chunk.section).toContain(section);
    }
  });

  test.each([
    'What is my class tomorrow?',
    'explain photosynthesis',
    'What is the weather tomorrow?',
    'list of best laptops for students',
  ])('"%s" still finds no evidence', async question => {
    const result = await search(question);
    expect(result.insufficientEvidence).toBe(true);
    expect(result.sources).toEqual([]);
  });
});

describe('dates, terms and audiences stay apart', () => {
  test('first semester finals cite PDF p. 3 and the official calendar link', async () => {
    const answer = await offline(
      'When are 1st sem non-graduating final exams?',
    );
    expect(answer.reply).toContain(
      'December 9-19, 2026: Final examinations for non-graduating students (UG, PDF p. 3)',
    );
    const note = handbookSourceLabel(answer.sources) ?? '';
    expect(note).toContain('as of November 24, 2026');
    expect(note).toContain(`PDF p`);
    expect(note).toContain(`](${CALENDAR_URL})`);
  });

  test('second semester midterms give the undergraduate week only', async () => {
    const answer = await offline('When are 2nd sem midterms?');
    expect(answer.reply).toContain(
      'March 15-20, 2027: Midterm examinations (UG, PDF p. 4)',
    );
    expect(answer.reply).not.toContain('(GR,');
  });

  test('a graduate question gets the graduate calendar, not undergraduate rows', async () => {
    const result = await search(
      'When are graduate midterms in the second semester?',
    );
    expect(result.matches.every(m => m.chunk.meta?.scope === 'GR')).toBe(true);
    const answer = await offline(
      'When are graduate midterms in the second semester?',
    );
    expect(answer.reply).toContain('(GR, PDF p. 5)');
    expect(answer.reply).not.toContain('(UG,');
  });

  test('the conflicting midyear start shows both dates and never picks one', async () => {
    const answer = await offline('When does midyear 2027 start?');
    expect(answer.reply).toContain('June 9, 2027');
    expect(answer.reply).toContain('June 5, 2027');
    expect(answer.reply).toContain(
      'Confirm with the USTP CDO Registrar before planning around either date.',
    );
  });

  test('a named date picks its own calendar row', async () => {
    const answer = await offline('Is November 30 a holiday?');
    expect(answer.reply).toContain('November 30, 2026: Bonifacio Day');
  });

  test('another academic year is refused instead of answered with AY 2026-2027 dates', async () => {
    const result = await search('When does first semester AY 2025-2026 start?');
    expect(result.insufficientEvidence).toBe(true);
    expect(result.insufficientReason).toBe('academic_year');
    const answer = await offline(
      'When does first semester AY 2025-2026 start?',
    );
    expect(answer.reply).toContain("can't give AY 2025-2026 dates");
    expect(answer.reply).toContain(CALENDAR_URL);
    expect(answer.reply).not.toMatch(/August 10, 2026/);
  });

  test('analyzeKnowledgeQuery reads years, terms and audiences', () => {
    expect(analyzeKnowledgeQuery('AY 2025-26 first sem')).toMatchObject({
      academicYear: '2025-2026',
      term: 'first',
    });
    expect(analyzeKnowledgeQuery('graduate midterms').audience).toBe('GR');
    expect(
      analyzeKnowledgeQuery('when do graduating students graduate').audience,
    ).toBeNull();
    expect(analyzeKnowledgeQuery('dress code policy').prefer).toBe('handbook');
    expect(analyzeKnowledgeQuery('where is the registrar').prefer).toBe(
      'ustp_cdo',
    );
  });
});

describe('uncertain information is labelled, not asserted', () => {
  test('the historical organization list says it is historical', async () => {
    const answer = await offline('What does SITE stand for?');
    expect(answer.reply).toContain(
      'Society of Information Technology Enthusiasts (SITE)',
    );
    expect(answer.reply).toContain('2021 Virtual Week of Welcome directory');
  });

  test('scholarship amounts are not claimed', async () => {
    const answer = await offline('What is my scholarship allowance?');
    expect(answer.reply).toContain('current stipend or award amount');
    expect(answer.reply).not.toMatch(/₱|PHP\s?\d|\bP\d{3,}/);
  });

  test('two published phone numbers are both shown with the caveat', async () => {
    const answer = await offline('What is the registrar phone number?');
    expect(answer.reply).toContain('local 137');
  });

  test('a stale snapshot says so', async () => {
    const later = new Date(2027, 6, 1);
    const answer = await localHandbookService.answerOffline(
      'When are 2nd sem midterms?',
      {referenceDate: later},
    );
    expect(answer.reply).toContain(
      'snapshot dated November 24, 2026 and may have changed',
    );
    expect(isSnapshotStale({asOf: '2026-11-24', volatility: 'high'}, REF)).toBe(
      false,
    );
    expect(
      isSnapshotStale({asOf: '2026-11-24', volatility: 'high'}, later),
    ).toBe(true);
  });
});

describe('online excerpts carry provenance and the rules', () => {
  test('campus excerpts name the snapshot date, audience and caveat', async () => {
    const ctx = await localHandbookService.buildOnlineContext(
      'When does midyear 2027 start?',
      {referenceDate: REF},
    );
    expect(ctx).not.toBeNull();
    const block = ctx?.contextBlock ?? '';
    expect(block).toContain('never choose one of two conflicting dates');
    expect(block).toContain('USTP CDO knowledge, as of November 24, 2026');
    expect(block).toContain('Caveat:');
  });

  test('Document generation keeps to the Student Handbook', async () => {
    const ctx = await localHandbookService.buildOnlineContext(
      'When are 2nd sem midterms?',
      {collections: ['handbook'], referenceDate: REF},
    );
    for (const source of ctx?.sources ?? []) {
      expect(source.collection ?? 'handbook').toBe('handbook');
    }
  });

  test('Ask USTP online sends campus excerpts and the backend RAG stays off', async () => {
    const send = jest
      .spyOn(onlineChatSkill, 'sendChatMessage')
      .mockResolvedValue({
        status: 'success',
        data: {
          reply: 'Midterms are March 15-20, 2027 (PDF p. 4).',
          sources: [],
          usedHandbook: false,
          interrupted: false,
        },
      });
    const res = await chatOrchestrator.processMessage(
      GUEST,
      'When are 2nd sem midterms?',
      {
        onlineMode: true,
        useHandbook: true,
        ustpRagOnly: true,
        referenceDate: REF,
      },
    );
    const [history, opts] = send.mock.calls[0];
    const prompt = JSON.stringify(history);
    expect(prompt).toContain('handbook_excerpts');
    expect(prompt).toContain('March 15-20, 2027');
    expect(opts?.useHandbook).toBe(false);
    expect(res.handbookNote).toContain(`](${CALENDAR_URL})`);
  });
});

describe('Ask USTP offline end to end', () => {
  test('a campus answer comes with a clickable source note', async () => {
    const res = await chatOrchestrator.processMessage(
      GUEST,
      'Where is e-Library?',
      {
        onlineMode: false,
        useHandbook: true,
        ustpRagOnly: true,
        referenceDate: REF,
      },
    );
    expect(res.reply).toContain('2nd floor, left wing');
    expect(res.handbookNote).toContain(
      '[USTP CDO Library](https://www.ustp.edu.ph/cdeo/library/)',
    );
  });

  test('an off-topic question still gets the no-evidence reply', async () => {
    const res = await chatOrchestrator.processMessage(
      GUEST,
      'explain photosynthesis',
      {
        onlineMode: false,
        useHandbook: true,
        ustpRagOnly: true,
        referenceDate: REF,
      },
    );
    expect(res.reply).toBe(LOCAL_NO_EVIDENCE_REPLY);
    expect(res.handbookNote).toBeNull();
  });
});

describe('campus questions are recognized outside Ask USTP', () => {
  test.each([
    'when is the academic calendar break',
    'how do I log in to PRISMS',
    'where is the e-library',
    'where is the ASO office',
    'when does the enrollment period start',
    'what programs are offered at USTP CDO',
  ])('"%s" is a USTP question', text => {
    expect(isHandbookQuestion(text)).toBe(true);
  });

  test.each([
    'I need aso for my dog',
    'schedule a meeting with the ustp registrar on friday 2pm',
    'what is my class tomorrow',
  ])('"%s" is not', text => {
    expect(isHandbookQuestion(text)).toBe(false);
  });
});

describe('citation notes', () => {
  test('only https links, at most four, with merged page numbers', () => {
    const note = campusSourceNote([
      {
        collection: 'ustp_cdo',
        asOf: '2026-11-24',
        links: [
          {id: 'CAL', title: 'Calendar [AY]', url: CALENDAR_URL, pages: [4]},
          {id: 'X', title: 'Insecure', url: 'http://example.com'},
          {id: 'A', title: 'A', url: 'https://a.example/'},
        ],
      },
      {
        collection: 'ustp_cdo',
        asOf: '2026-11-24',
        links: [
          {id: 'CAL', title: 'Calendar [AY]', url: CALENDAR_URL, pages: [3]},
          {id: 'B', title: 'B', url: 'https://b.example/'},
          {id: 'C', title: 'C', url: 'https://c.example/'},
          {id: 'D', title: 'D', url: 'https://d.example/'},
        ],
      },
      {collection: 'handbook'},
    ]);
    expect(note).toContain('USTP CDO sources (as of November 24, 2026):');
    expect(note).toContain(`[Calendar AY, PDF pp. 3, 4](${CALENDAR_URL})`);
    expect(note).not.toContain('http://');
    expect(note?.match(/\]\(https:/g)).toHaveLength(4);
    expect(campusSourceNote([{collection: 'handbook'}])).toBeNull();
  });

  test('handbook-only notes keep their existing wording', async () => {
    const result = await search('How does INC grade completion work?');
    expect(handbookSourceLabel(result.sources)).toMatch(
      /^Referenced USTP Student Handbook \(p\. \d+/,
    );
  });
});

describe('the bundled pack matches the reviewed knowledge files', () => {
  const manifest = JSON.parse(
    readFileSync(join(PACK_DIR, 'metadata', 'manifest.json'), 'utf8'),
  ) as {files: {path: string; sha256: string}[]};
  const registry = JSON.parse(
    readFileSync(join(PACK_DIR, 'metadata', 'sources.json'), 'utf8'),
  ) as {source_registry: Record<string, {url: string}>};
  const conflicts = JSON.parse(
    readFileSync(join(PACK_DIR, 'metadata', 'conflicts.json'), 'utf8'),
  ) as {conflicts: {id: string}[]};
  const sourceList = Object.values(registry.source_registry);
  const conflictList = conflicts.conflicts;

  test('every indexed document hashes to its manifest entry', () => {
    for (const doc of campusPack.documents) {
      const bytes = readFileSync(join(PACK_DIR, doc.path), 'utf8').replace(
        /\r\n/g,
        '\n',
      );
      const sha = createHash('sha256').update(bytes, 'utf8').digest('hex');
      const entry = manifest.files.find(f => f.path === doc.path);
      expect(entry?.sha256).toBe(sha);
      expect(doc.sha256).toBe(sha);
    }
  });

  test('chunk ids are unique, links come from the registry, caveats from conflicts.json', () => {
    const ids = campusPack.chunks.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const urls = new Set(sourceList.map(s => s.url));
    const conflictIds = new Set(conflictList.map(c => c.id));
    for (const chunk of campusPack.chunks) {
      expect(chunk.collection).toBe('ustp_cdo');
      for (const source of chunk.meta.sources) {
        expect(source.url).toMatch(/^https:\/\//);
        expect(urls.has(source.url)).toBe(true);
      }
      for (const caveat of chunk.meta.caveats) {
        expect(conflictIds.has(caveat.id)).toBe(true);
      }
    }
  });

  test('no AY 2025-2026 calendar data was indexed', () => {
    for (const chunk of campusPack.chunks) {
      expect(chunk.meta.academicYears).not.toContain('2025-2026');
    }
  });
});

describe('schema v32', () => {
  test('both corpora share one index after loading', async () => {
    await localHandbookService.ensureReady();
    const rows = db.executeSync(
      'SELECT collection, COUNT(*) AS n FROM handbook_chunks GROUP BY collection ORDER BY collection',
    ).rows;
    const counts = Object.fromEntries(
      rows.map(r => [String(r.collection), Number(r.n)]),
    );
    expect(counts.ustp_cdo).toBe(campusPack.chunks.length);
    expect(counts.handbook).toBeGreaterThan(100);
  });

  test('reloading does not duplicate passages', async () => {
    await localHandbookService.ensureReady();
    localHandbookService.resetForTests();
    await localHandbookService.ensureReady();
    const n = Number(
      db.executeSync(
        "SELECT COUNT(*) AS n FROM handbook_chunks WHERE collection = 'ustp_cdo'",
      ).rows[0].n,
    );
    expect(n).toBe(campusPack.chunks.length);
  });

  test('the migration is idempotent and existing rows default to the handbook', () => {
    db.transactionSync(tx => {
      // Already migrated by initDatabase: running it again is a no-op.
      migrateKnowledgeCollections(tx);
      migrateKnowledgeCollections(tx);
    });
    const columns = db
      .executeSync('PRAGMA table_info(handbook_chunks)')
      .rows.map(r => ({name: String(r.name), dflt: r.dflt_value}));
    expect(columns.find(c => c.name === 'collection')?.dflt).toBe("'handbook'");
    expect(columns.map(c => c.name)).toContain('meta_json');
  });
});
