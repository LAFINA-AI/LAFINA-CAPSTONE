/**
 * The USTP sources library and "See passages": the student can read every
 * passage Ask USTP answers from, and the exact passages behind one answer.
 */
import React from 'react';
import {Linking} from 'react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {
  chatStore,
  db,
  initDatabase,
  localHandbookStore,
  userStore,
} from '../../src/storage';
import {
  getPassagesById,
  listKnowledgeSources,
  listOfficialPages,
  localHandbookService,
  toPassageView,
} from '../../src/handbook';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {handbookPassageIds} from '../../src/skills/onlineChatSkill';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {UstpSourcesSheet} from '../../src/ui/components/chat/UstpSourcesSheet';
import {ChatMessageItem} from '../../src/ui/components/chat/ChatMessageItem';
import type {ChatMessage} from '../../src/storage/chatStore';
import {enableUstpForTest} from '../fixtures/ustpEligibility';

const GUEST = 'local_guest_user';
const REF = new Date(2026, 10, 24, 9, 0, 0);

beforeEach(async () => {
  await initDatabase();
  userStore.createGuestUser();
  enableUstpForTest(GUEST);
  userStore.setCurrentUser(GUEST);
  localHandbookService.resetForTests();
  await localHandbookService.ensureReady();
  jest.restoreAllMocks();
});

const wrap = (ui: React.ReactElement) => (
  <ThemeProvider userId={GUEST}>{ui}</ThemeProvider>
);

describe('library data', () => {
  test('both sources are listed with their real counts', () => {
    const sources = listKnowledgeSources();
    expect(sources.map(s => s.collection)).toEqual(['handbook', 'ustp_cdo']);
    const campus = sources[1];
    expect(campus.passageCount).toBe(
      localHandbookStore.countChunks('ustp_cdo'),
    );
    expect(campus.chapterCount).toBe(14);
    expect(campus.description).toContain('checked November 24, 2026');
    expect(sources[0].passageCount).toBe(
      localHandbookStore.countChunks('handbook'),
    );
  });

  test('chapters list every passage once, in reading order', () => {
    for (const collection of ['handbook', 'ustp_cdo'] as const) {
      const chapters = localHandbookStore.listChapters(collection);
      const total = chapters.reduce((n, c) => n + c.passageCount, 0);
      expect(total).toBe(localHandbookStore.countChunks(collection));
      const first = localHandbookStore.listPassages(
        collection,
        chapters[0].chapter,
      );
      expect(first).toHaveLength(chapters[0].passageCount);
      const seqs = first.map(p => p.seq);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    }
  });

  test('passages come back in the order asked, skipping ids no longer indexed', () => {
    const [a, b] = localHandbookStore.listPassages(
      'ustp_cdo',
      'Academic Calendar AY 2026-2027 - Undergraduate',
    );
    const found = getPassagesById([b.id, 'gone-from-this-version', a.id]);
    expect(found.map(p => p.id)).toEqual([b.id, a.id]);
  });

  test('search is a plain match of every word, with LIKE wildcards escaped', () => {
    const hits = localHandbookStore.searchPassages('e-Library LRC');
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      const text = `${hit.chapter} ${hit.section} ${hit.content}`.toLowerCase();
      expect(text).toContain('e-library');
      expect(text).toContain('lrc');
    }
    expect(localHandbookStore.searchPassages('%')).toEqual([]);
    expect(localHandbookStore.searchPassages('zz_%_zz')).toEqual([]);
  });

  test('every official page is https and listed once', () => {
    const pages = listOfficialPages();
    expect(pages.length).toBeGreaterThan(10);
    expect(new Set(pages.map(p => p.url)).size).toBe(pages.length);
    for (const page of pages) expect(page.url).toMatch(/^https:\/\//);
  });

  test('a campus passage shows its scope, caveat and official links', () => {
    const midyear = localHandbookStore
      .searchPassages('inconsistent midyear start')
      .find(p => p.collection === 'ustp_cdo');
    expect(midyear).toBeDefined();
    const view = toPassageView(midyear!, REF);
    expect(view.scope).toContain('Undergraduate');
    expect(view.caveats.join(' ')).toContain('June 9, 2027');
    expect(view.citation).toContain(
      'USTP CDO sources (as of November 24, 2026)',
    );
    expect(view.staleNote).toBeNull();
    expect(toPassageView(midyear!, new Date(2027, 6, 1)).staleNote).toContain(
      'may have changed',
    );
  });
});

describe('answers remember their passages on this phone only', () => {
  test('an offline Ask USTP answer saves the passage ids its note cites', async () => {
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
    expect(res.handbookNote).toBeTruthy();
    expect(res.sourcePassageIds?.length).toBeGreaterThan(0);
    const reloaded = chatStore
      .getMessages(GUEST, res.assistantMessage.sessionId)
      .find(m => m.id === res.assistantMessage.id);
    expect(reloaded?.sourcePassageIds).toEqual(res.sourcePassageIds);
    const passages = getPassagesById(res.sourcePassageIds ?? []);
    expect(passages.map(p => p.content).join(' ')).toContain(
      '2nd floor, left wing',
    );
  });

  test('a reply without evidence saves no passages', async () => {
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
    expect(res.handbookNote).toBeNull();
    expect(res.sourcePassageIds ?? []).toEqual([]);
  });

  test('chat sync sends the note but never the passage ids', () => {
    const me = 'srclib-account-1';
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
       VALUES (?, ?, ?, 'student', 0, ?, ?)`,
      [me, me, `${me}@example.invalid`, now, now],
    );
    chatStore.addMessage(me, 'assistant', 'From my USTP sources…', null, {
      handbookNote: 'Referenced USTP Student Handbook (p. 53)',
      sourcePassageIds: ['p-1', 'p-2'],
    });
    const payloads = db
      .executeSync(
        "SELECT payload FROM sync_outbox WHERE user_id = ? AND entity_type = 'chat_message'",
        [me],
      )
      .rows.map(row => String(row.payload));
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toContain('Referenced USTP Student Handbook (p. 53)');
    expect(payloads[0]).not.toContain('p-1');
    expect(chatStore.getMessages(me)[0].sourcePassageIds).toEqual([
      'p-1',
      'p-2',
    ]);
  });

  test('backend sources have no passage and repeats are dropped', () => {
    expect(
      handbookPassageIds([
        {title: 'USTP Student Handbook', page: 3},
        {title: 'x', passageId: 'a'},
        {title: 'y', passageId: 'a'},
        {title: 'z', passageId: 'b'},
      ]),
    ).toEqual(['a', 'b']);
  });
});

const baseMessage: ChatMessage = {
  id: 'm1',
  sessionId: 's1',
  sender: 'assistant',
  content: 'From my USTP sources…',
  createdAt: '2026-11-24T01:00:00.000Z',
  updatedAt: '2026-11-24T01:00:00.000Z',
};

describe('"See passages" under an answer', () => {
  test('shows only when the answer has passages to open', () => {
    const onView = jest.fn();
    const withIds = {...baseMessage, sourcePassageIds: ['a']};
    const screen = render(
      wrap(
        <ChatMessageItem
          item={withIds}
          handbookNote="Referenced USTP Student Handbook (p. 53)"
          onViewSources={onView}
        />,
      ),
    );
    fireEvent.press(screen.getByTestId('chat-handbook-view-sources'));
    expect(onView).toHaveBeenCalledWith(withIds);

    const synced = render(
      wrap(
        <ChatMessageItem
          item={{...baseMessage, sourcePassageIds: []}}
          handbookNote="Referenced USTP Student Handbook (p. 53)"
          onViewSources={onView}
        />,
      ),
    );
    expect(synced.queryByTestId('chat-handbook-view-sources')).toBeNull();
  });
});

describe('UstpSourcesSheet', () => {
  test('opens the exact passages of one answer, and their links open', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const [passage] = localHandbookStore.searchPassages(
      'Where is the e-Library?',
    );
    const screen = render(
      wrap(
        <UstpSourcesSheet
          target={{kind: 'used', passageIds: [passage.id]}}
          onClose={jest.fn()}
        />,
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('ustp-source-passage')).toHaveLength(1),
    );
    expect(screen.getByText('Sources for this answer')).toBeTruthy();
    expect(screen.getByText(/2nd floor, left wing/)).toBeTruthy();
    const links = screen.getAllByTestId('chat-source-link');
    fireEvent.press(links[0]);
    expect(open.mock.calls[0][0]).toMatch(/^https:\/\//);
  });

  test('passages missing from this version say so and offer the library', async () => {
    const screen = render(
      wrap(
        <UstpSourcesSheet
          target={{kind: 'used', passageIds: ['gone']}}
          onClose={jest.fn()}
        />,
      ),
    );
    await waitFor(() =>
      expect(screen.getByText(/no longer in this version/)).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId('ustp-sources-browse'));
    expect(screen.getByTestId('ustp-sources-intro')).toBeTruthy();
  });

  test('the library goes source → document → passages and back', async () => {
    const onClose = jest.fn();
    const screen = render(
      wrap(<UstpSourcesSheet target={{kind: 'library'}} onClose={onClose} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId('ustp-sources-intro')).toBeTruthy(),
    );
    expect(screen.getByTestId('ustp-sources-official-pages')).toBeTruthy();

    fireEvent.press(screen.getByTestId('ustp-sources-open-ustp_cdo'));
    expect(screen.getAllByTestId('ustp-sources-chapter')).toHaveLength(14);

    fireEvent.press(
      screen.getByText('Academic Calendar AY 2026-2027 - Undergraduate'),
    );
    expect(screen.getAllByTestId('ustp-source-passage').length).toBeGreaterThan(
      1,
    );
    expect(screen.getAllByTestId('ustp-source-caveat').length).toBeGreaterThan(
      0,
    );

    fireEvent.press(screen.getByTestId('ustp-sources-back'));
    fireEvent.press(screen.getByTestId('ustp-sources-back'));
    expect(screen.getByTestId('ustp-sources-intro')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('search shows the passages containing the words', async () => {
    const screen = render(
      wrap(<UstpSourcesSheet target={{kind: 'library'}} onClose={jest.fn()} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId('ustp-sources-search')).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByTestId('ustp-sources-search'),
      'grade completion',
    );
    expect(screen.getByTestId('ustp-sources-result-count')).toHaveTextContent(
      /containing "grade completion"/,
    );
    expect(screen.getAllByTestId('ustp-source-passage').length).toBeGreaterThan(
      0,
    );
    fireEvent.changeText(
      screen.getByTestId('ustp-sources-search'),
      'qwertyzzz',
    );
    expect(screen.getByText('No passage contains "qwertyzzz".')).toBeTruthy();
  });

  test('a handbook passage cites the edition and page', () => {
    const [hit] = localHandbookStore.searchPassages('grade completion');
    const view = toPassageView(hit, REF);
    expect(view.collection).toBe('handbook');
    expect(view.citation).toMatch(
      /USTP Student Handbook 2023 Edition, p\. \d+/,
    );
  });
});
