import {
  CURRENT_SCHEMA_VERSION,
  db,
  initDatabase,
  materialStore,
  userStore,
} from '../../src/storage';
import {GUEST_USER_ID} from '../../src/constants';
import {guestMigration} from '../../src/storage/guestMigration';
import {
  authorizeDataReset,
  resetPersonalData,
} from '../../src/storage/accountDataReset';

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
    'users',
  ]) {
    db.executeSync(`DELETE FROM ${table}`);
  }
});

test('database initializes schema v29 with material tables and FTS5 index', () => {
  expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(29);
  expect(materialStore.ensureFtsIndex()).toBe(true);
  const tables = db
    .executeSync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'user_material%' ORDER BY name",
    )
    .rows.map(r => String(r.name));
  expect(tables).toContain('user_materials');
  expect(tables).toContain('user_material_chunks');
  expect(tables).toContain('user_material_chunks_fts');
  expect(tables).toContain('user_material_qa_messages');
});

test('CRUD, hash lookup, owner isolation, FTS5 search and LIKE fallback work cleanly', () => {
  insertTestUser('owner-a');
  insertTestUser('owner-b');

  const matA = materialStore.saveMaterialWithChunks(
    'owner-a',
    {
      title: 'Cell Biology Ch 1',
      fileName: 'cell_bio.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'hash-bio-1',
      pageCount: 5,
      pagesRead: 5,
      ocrPages: 0,
      totalChars: 240,
      outline: [{heading: 'Mitochondria', pageNumber: 2, pageLabel: 'p. 2'}],
    },
    [
      {
        seq: 1,
        heading: 'Introduction',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'cell membrane organelles biology',
        content: 'Eukaryotic cells contain membrane-bound organelles.',
      },
      {
        seq: 2,
        heading: 'Mitochondria',
        pageStart: 2,
        pageEnd: 2,
        pageLabel: 'p. 2',
        keywords: 'mitochondria atp cellular respiration',
        content:
          'Mitochondria generate adenosine triphosphate (ATP) through oxidative phosphorylation.',
      },
    ],
  );

  materialStore.saveMaterialWithChunks(
    'owner-b',
    {
      title: 'Discrete Math',
      fileName: 'discrete_math.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'hash-math-1',
      pageCount: 2,
      pagesRead: 2,
      ocrPages: 0,
      totalChars: 120,
      outline: [],
    },
    [
      {
        seq: 1,
        heading: 'Graphs',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'eulerian graphs mitochondria secret',
        content:
          'Owner B secret graph note mentioning mitochondria only for owner-b.',
      },
    ],
  );

  expect(materialStore.listMaterials('owner-a')).toHaveLength(1);
  expect(materialStore.findByHash('owner-a', 'hash-bio-1')?.id).toBe(matA.id);
  expect(materialStore.findByHash('owner-b', 'hash-bio-1')).toBeNull();

  // Owner isolation on FTS5, page lookup, LIKE fallback, and Q&A history
  const ftsHits = materialStore.queryFts('owner-a', '"mitochondria"');
  expect(ftsHits).toHaveLength(1);
  expect(ftsHits[0].materialId).toBe(matA.id);
  expect(ftsHits[0].pageLabel).toBe('p. 2');

  const pageHits = materialStore.getChunksByPage('owner-a', 2);
  expect(pageHits).toHaveLength(1);
  expect(pageHits[0].heading).toBe('Mitochondria');

  const likeHits = materialStore.queryFallbackLike('owner-a', ['oxidative']);
  expect(likeHits).toHaveLength(1);
  expect(likeHits[0].materialId).toBe(matA.id);

  materialStore.addMessage('owner-a', {
    scopeKey: matA.id,
    sender: 'user',
    content: 'What does mitochondria make?',
  });
  expect(materialStore.listMessages('owner-a', matA.id)).toHaveLength(1);
  expect(materialStore.listMessages('owner-b', matA.id)).toHaveLength(0);

  // Rename and delete
  expect(materialStore.renameMaterial('owner-a', matA.id, 'Bio Updated')).toBe(
    true,
  );
  expect(materialStore.getMaterial('owner-a', matA.id)?.title).toBe(
    'Bio Updated',
  );
  expect(materialStore.deleteMaterial('owner-a', matA.id)).toBe(true);
  expect(materialStore.listMaterials('owner-a')).toHaveLength(0);
  expect(materialStore.queryFts('owner-a', '"mitochondria"')).toHaveLength(0);
  expect(materialStore.listMessages('owner-a', matA.id)).toHaveLength(0);
  // Owner B stays untouched
  expect(materialStore.listMaterials('owner-b')).toHaveLength(1);
});

test('guestMigration transfers unique materials and deduplicates identical content hashes', async () => {
  const guest = userStore.createGuestUser();
  insertTestUser('cloud-user');

  const sharedMat = materialStore.saveMaterialWithChunks(
    guest.id,
    {
      title: 'Guest Duplicate',
      fileName: 'dup.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 500,
      sha256: 'same-hash',
      pageCount: 1,
      pagesRead: 1,
      ocrPages: 0,
      totalChars: 50,
      outline: [],
    },
    [
      {
        seq: 1,
        heading: '',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'duplicate content',
        content: 'Shared duplicate lesson text.',
      },
    ],
  );
  materialStore.saveMaterialWithChunks(
    'cloud-user',
    {
      title: 'Cloud Existing',
      fileName: 'cloud_dup.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 500,
      sha256: 'same-hash',
      pageCount: 1,
      pagesRead: 1,
      ocrPages: 0,
      totalChars: 50,
      outline: [],
    },
    [
      {
        seq: 1,
        heading: '',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'duplicate content',
        content: 'Shared duplicate lesson text.',
      },
    ],
  );

  const uniqueMat = materialStore.saveMaterialWithChunks(
    guest.id,
    {
      title: 'Guest Physics',
      fileName: 'physics.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 800,
      sha256: 'unique-physics-hash',
      pageCount: 2,
      pagesRead: 2,
      ocrPages: 0,
      totalChars: 120,
      outline: [],
    },
    [
      {
        seq: 1,
        heading: 'Kinematics',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'p. 1',
        keywords: 'velocity acceleration newton',
        content: 'Acceleration is the rate of change of velocity over time.',
      },
    ],
  );

  materialStore.addMessage(guest.id, {
    scopeKey: uniqueMat.id,
    sender: 'user',
    content: 'Define acceleration',
  });
  materialStore.addMessage(guest.id, {
    scopeKey: sharedMat.id,
    sender: 'user',
    content: 'Shared question',
  });

  await guestMigration.linkGuestToCloudAccount(
    'cloud-user',
    'cloud@example.invalid',
  );

  const cloudMaterials = materialStore.listMaterials('cloud-user');
  expect(cloudMaterials).toHaveLength(2);
  expect(cloudMaterials.map(m => m.title).sort()).toEqual([
    'Cloud Existing',
    'Guest Physics',
  ]);
  expect(materialStore.listMaterials(GUEST_USER_ID)).toHaveLength(0);
  expect(materialStore.queryFts('cloud-user', '"acceleration"')).toHaveLength(
    1,
  );
  expect(materialStore.listMessages('cloud-user', uniqueMat.id)).toHaveLength(
    1,
  );
  expect(materialStore.listMessages('cloud-user', sharedMat.id)).toHaveLength(
    0,
  );
});

test('resetPersonalData clears uploaded materials, chunks, and Q&A history for owner only', () => {
  insertTestUser('reset-owner');
  insertTestUser('other-owner');
  userStore.setCurrentUser('reset-owner');

  const mat = materialStore.saveMaterialWithChunks(
    'reset-owner',
    {
      title: 'Owner Notes',
      fileName: 'notes.txt',
      fileKind: 'txt',
      mimeType: 'text/plain',
      sizeBytes: 100,
      sha256: 'reset-hash',
      pageCount: 1,
      pagesRead: 1,
      ocrPages: 0,
      totalChars: 80,
      outline: [],
    },
    [
      {
        seq: 1,
        heading: 'Reset',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'Text',
        keywords: 'thermodynamics entropy',
        content: 'Entropy measures disorder in thermodynamics.',
      },
    ],
  );
  materialStore.addMessage('reset-owner', {
    scopeKey: mat.id,
    sender: 'user',
    content: 'What is entropy?',
  });

  materialStore.saveMaterialWithChunks(
    'other-owner',
    {
      title: 'Keep Me',
      fileName: 'keep.txt',
      fileKind: 'txt',
      mimeType: 'text/plain',
      sizeBytes: 100,
      sha256: 'keep-hash',
      pageCount: 1,
      pagesRead: 1,
      ocrPages: 0,
      totalChars: 80,
      outline: [],
    },
    [
      {
        seq: 1,
        heading: 'Keep',
        pageStart: 1,
        pageEnd: 1,
        pageLabel: 'Text',
        keywords: 'entropy kept',
        content: 'Other owner entropy note.',
      },
    ],
  );

  const authority = authorizeDataReset('reset-owner');
  const outcome = resetPersonalData(authority);
  expect(outcome).toMatchObject({admitted: true, defaults: 'cleared'});
  expect(materialStore.listMaterials('reset-owner')).toHaveLength(0);
  expect(materialStore.queryFts('reset-owner', '"entropy"')).toHaveLength(0);
  expect(materialStore.listMessages('reset-owner', mat.id)).toHaveLength(0);
  expect(materialStore.listMaterials('other-owner')).toHaveLength(1);
});

test('listMessages preserves insertion order on identical timestamps, persists citation seq, and counts/deletes messages', () => {
  insertTestUser('order-owner');
  const fixedTs = '2026-11-22T00:00:00.000Z';

  for (let i = 0; i < 10; i += 1) {
    materialStore.addMessage('order-owner', {
      scopeKey: 'all',
      sender: 'user',
      content: `Question ${i}`,
      createdAt: fixedTs,
    });
    materialStore.addMessage('order-owner', {
      scopeKey: 'all',
      sender: 'assistant',
      content: `Answer ${i}`,
      sources: [
        {
          materialId: 'm1',
          title: 'Deck',
          heading: 'Topic',
          pageLabel: 'p. 1',
          snippet: 'Excerpt',
          seq: i + 1,
        },
      ],
      createdAt: fixedTs,
    });
  }

  const msgs = materialStore.listMessages('order-owner', 'all', 40);
  expect(msgs).toHaveLength(20);
  for (let i = 0; i < 10; i += 1) {
    expect(msgs[i * 2].sender).toBe('user');
    expect(msgs[i * 2].content).toBe(`Question ${i}`);
    expect(msgs[i * 2 + 1].sender).toBe('assistant');
    expect(msgs[i * 2 + 1].content).toBe(`Answer ${i}`);
    expect(msgs[i * 2 + 1].sources[0].seq).toBe(i + 1);
  }

  expect(materialStore.getMessageCountsByScope('order-owner')).toEqual({
    all: 20,
  });

  materialStore.deleteMessage('order-owner', msgs[0].id);
  expect(materialStore.listMessages('order-owner', 'all', 40)).toHaveLength(
    19,
  );
});
