/**
 * Skills audit fixes (2026-11-22): lesson parts, guest sign-in merging of
 * saved quizzes and Create with LAFINA files, and cleanup of guest-made files.
 */
import RNFS from 'react-native-fs';
import {
  db,
  initDatabase,
  localSettingsStore,
  materialStore,
  userStore,
} from '../../src/storage';
import {GUEST_USER_ID} from '../../src/constants';
import {guestMigration} from '../../src/storage/guestMigration';
import {readSkillsDocumentPaths} from '../../src/storage/accountDataReset';

function insertTestUser(id: string) {
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (
       id, username, email, role, is_new_user, time_format_24h,
       week_starts_monday, dark_mode, created_at, updated_at
     ) VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
}

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  for (const table of [
    'active_session',
    'user_material_chunks',
    'user_material_qa_messages',
    'user_materials',
    'local_settings',
  ]) {
    db.executeSync(`DELETE FROM ${table}`);
  }
});

describe('lesson parts', () => {
  const seedLesson = (owner: string, pages: number, charsPerPage: number) =>
    materialStore.saveMaterialWithChunks(
      owner,
      {
        title: 'Operating Systems',
        fileName: 'os.pdf',
        fileKind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
        sha256: `hash-${owner}-${pages}`,
        pageCount: pages,
        pagesRead: pages,
        ocrPages: 0,
        totalChars: pages * charsPerPage,
        outline: [],
      },
      Array.from({length: pages}, (_, i) => ({
        seq: i + 1,
        heading: i === 0 ? 'Processes' : '',
        pageStart: i + 1,
        pageEnd: i + 1,
        pageLabel: `p. ${i + 1}`,
        keywords: '',
        content: `Page ${i + 1}. ${'scheduling '.repeat(
          Math.floor(charsPerPage / 11),
        )}`,
      })),
    );

  test('a long lesson splits into ordered parts that cover every page', () => {
    insertTestUser('owner-parts');
    const mat = seedLesson('owner-parts', 20, 2000);
    const sections = materialStore.getMaterialSections(
      'owner-parts',
      mat.id,
      12000,
    );
    expect(sections.length).toBeGreaterThan(1);
    expect(sections[0]).toMatchObject({index: 0, pageStart: 1});
    expect(sections[0].label).toMatch(/^pp\. 1–\d+$/);
    expect(sections[0].heading).toBe('Processes');
    expect(sections[sections.length - 1].pageEnd).toBe(20);
    expect(sections[sections.length - 1].text).toContain('Page 20.');
    for (const s of sections) expect(s.text.length).toBeLessThanOrEqual(12000);
    // Parts follow on from each other with no gap.
    for (let i = 1; i < sections.length; i += 1) {
      expect(sections[i].pageStart).toBe(sections[i - 1].pageEnd + 1);
    }
  });

  test('a short lesson is one part, and another owner sees none of it', () => {
    insertTestUser('owner-short');
    const mat = seedLesson('owner-short', 2, 300);
    expect(
      materialStore.getMaterialSections('owner-short', mat.id, 12000),
    ).toHaveLength(1);
    expect(
      materialStore.getMaterialSections('someone-else', mat.id, 12000),
    ).toHaveLength(0);
  });
});

describe('signing in after using guest mode', () => {
  const setGuestAndCloud = (key: string, guest: unknown, cloud: unknown) => {
    localSettingsStore.set(GUEST_USER_ID, key, JSON.stringify(guest));
    localSettingsStore.set('cloud-merge', key, JSON.stringify(cloud));
  };

  test('guest quizzes and files are merged into an account that already has some', async () => {
    userStore.createGuestUser();
    setGuestAndCloud(
      'skills.quizzes.v1',
      [{id: 'guest-quiz', updatedAt: '2026-11-21T10:00:00.000Z'}],
      [
        {id: 'cloud-quiz', updatedAt: '2026-11-20T10:00:00.000Z'},
        {id: 'shared', updatedAt: '2026-11-19T10:00:00.000Z', from: 'cloud'},
      ],
    );
    setGuestAndCloud(
      'skills.files.v1',
      [{id: 'guest-file', createdAt: '2026-11-22T08:00:00.000Z'}],
      [{id: 'cloud-file', createdAt: '2026-11-18T08:00:00.000Z'}],
    );

    await guestMigration.linkGuestToCloudAccount(
      'cloud-merge',
      'merge@example.invalid',
    );

    const quizzes = JSON.parse(
      localSettingsStore.get('cloud-merge', 'skills.quizzes.v1') ?? '[]',
    );
    expect(quizzes.map((q: {id: string}) => q.id)).toEqual([
      'guest-quiz',
      'cloud-quiz',
      'shared',
    ]);
    const files = JSON.parse(
      localSettingsStore.get('cloud-merge', 'skills.files.v1') ?? '[]',
    );
    expect(files.map((f: {id: string}) => f.id)).toEqual([
      'guest-file',
      'cloud-file',
    ]);
    expect(
      localSettingsStore.get(GUEST_USER_ID, 'skills.quizzes.v1'),
    ).toBeNull();
    expect(localSettingsStore.get(GUEST_USER_ID, 'skills.files.v1')).toBeNull();
  });

  test('merged saved quizzes keep the 12 newest', async () => {
    userStore.createGuestUser();
    const stamp = (n: number) =>
      `2026-11-${String(n).padStart(2, '0')}T00:00:00.000Z`;
    setGuestAndCloud(
      'skills.quizzes.v1',
      Array.from({length: 8}, (_, i) => ({id: `g${i}`, updatedAt: stamp(i + 10)})),
      Array.from({length: 8}, (_, i) => ({id: `c${i}`, updatedAt: stamp(i + 1)})),
    );
    await guestMigration.linkGuestToCloudAccount(
      'cloud-merge',
      'merge@example.invalid',
    );
    const quizzes = JSON.parse(
      localSettingsStore.get('cloud-merge', 'skills.quizzes.v1') ?? '[]',
    );
    expect(quizzes).toHaveLength(12);
    expect(quizzes[0].id).toBe('g7');
    expect(quizzes.some((q: {id: string}) => q.id === 'c0')).toBe(false);
  });
});

test('Clear All Data finds files made as a guest, but only ones the account lists', () => {
  const root = String(RNFS.DocumentDirectoryPath).replace(/\/+$/, '');
  const guestPath = `${root}/skills_documents/${encodeURIComponent(
    GUEST_USER_ID,
  )}/doc_1_Notes.pdf`;
  const ownPath = `${root}/skills_documents/owner-files/doc_2_Slides.pptx`;
  const otherPath = `${root}/skills_documents/someone-else/doc_3.pdf`;
  localSettingsStore.set(
    'owner-files',
    'skills.files.v1',
    JSON.stringify(
      [guestPath, ownPath, otherPath].map((path, i) => ({
        id: `f${i}`,
        attachment: {uri: `file://${path}`},
      })),
    ),
  );
  expect(readSkillsDocumentPaths('owner-files').sort()).toEqual(
    [guestPath, ownPath].sort(),
  );
});
