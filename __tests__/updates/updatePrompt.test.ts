/** When LAFINA checks, offers, downloads by itself and shows "What's new". Pure rules. */
import {
  AUTO_CHECK_INTERVAL_MS,
  EMPTY_MEMORY,
  isSnoozed,
  markSeen,
  parseMemory,
  shouldAutoCheck,
  shouldAutoDownload,
  shouldPrompt,
  SNOOZE_MS,
  whatsNewToShow,
} from '../../src/updates/updatePrompt';
import type { UpdateState } from '../../src/updates/updateService';
import { parseReleaseNotes, parseInline } from '../../src/ui/components/updates/releaseNotesMarkdown';
import { releaseSubtitle } from '../../src/ui/components/updates/UpdateSheet';

const state = (patch: Partial<UpdateState>): UpdateState => ({
  phase: 'available',
  currentVersion: '1.1.0',
  version: '1.2.0',
  title: null,
  notes: null,
  percent: null,
  message: null,
  releaseUrl: 'https://github.com/LAFINA-AI/LAFINA-CAPSTONE/releases/latest',
  kind: 'bundle',
  size: 1,
  reason: null,
  checkedAt: null,
  installing: false,
  ...patch,
});

describe('automatic checks', () => {
  it('checks the first time, then at most every interval, and after a clock change', () => {
    expect(shouldAutoCheck(EMPTY_MEMORY, 0)).toBe(true);
    const memory = { ...EMPTY_MEMORY, lastAutoCheckAt: 10_000 };
    expect(shouldAutoCheck(memory, 10_000 + AUTO_CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(shouldAutoCheck(memory, 10_000 + AUTO_CHECK_INTERVAL_MS)).toBe(true);
    expect(shouldAutoCheck(memory, 5_000)).toBe(true);
  });

  it('downloads by itself only on unmetered Wi-Fi', () => {
    const offer = state({});
    expect(shouldAutoDownload(offer, { connected: true, unmetered: true })).toBe(true);
    expect(shouldAutoDownload(offer, { connected: true, unmetered: false })).toBe(false);
    expect(shouldAutoDownload(offer, { connected: false, unmetered: true })).toBe(false);
    expect(shouldAutoDownload(state({ phase: 'needs-install' }), { connected: true, unmetered: true })).toBe(false);
  });
});

describe('offers', () => {
  it('offers available, ready and release-page updates, but not other phases', () => {
    for (const phase of ['available', 'ready', 'needs-install'] as const) {
      expect(shouldPrompt(state({ phase }), EMPTY_MEMORY, 0)).toBe(true);
    }
    for (const phase of ['idle', 'checking', 'downloading', 'error', 'up-to-date'] as const) {
      expect(shouldPrompt(state({ phase }), EMPTY_MEMORY, 0)).toBe(false);
    }
  });

  it('"Later" hides only that version, for a day', () => {
    const memory = { ...EMPTY_MEMORY, snoozedVersion: '1.2.0', snoozedUntil: SNOOZE_MS };
    expect(isSnoozed(memory, '1.2.0', SNOOZE_MS - 1)).toBe(true);
    expect(shouldPrompt(state({}), memory, SNOOZE_MS - 1)).toBe(false);
    expect(shouldPrompt(state({}), memory, SNOOZE_MS)).toBe(true);
    expect(shouldPrompt(state({ version: '1.3.0' }), memory, 0)).toBe(true);
  });
});

describe("What's new", () => {
  const notes = { version: '1.2.0', title: 'T', notes: '- a' };

  it('shows the kept notes once the new version runs, then never again', () => {
    const memory = { ...EMPTY_MEMORY, lastSeenVersion: '1.1.0', whatsNew: notes };
    expect(whatsNewToShow(memory, '1.1.0')).toBeNull();
    expect(whatsNewToShow(memory, '1.2.0')).toEqual(notes);
    const seen = markSeen(memory, '1.2.0');
    expect(seen).toMatchObject({ lastSeenVersion: '1.2.0', whatsNew: null });
    expect(whatsNewToShow(seen, '1.2.0')).toBeNull();
  });

  it('keeps notes for a version not running yet, and clears an old snooze', () => {
    const memory = {
      ...EMPTY_MEMORY,
      whatsNew: notes,
      snoozedVersion: '1.1.0',
      snoozedUntil: 99,
    };
    const seen = markSeen(memory, '1.1.0');
    expect(seen.whatsNew).toEqual(notes);
    expect(seen.snoozedVersion).toBeNull();
  });

  it('reads back stored memory and survives garbage', () => {
    const memory = { ...EMPTY_MEMORY, lastAutoCheckAt: 5, whatsNew: notes, lastSeenVersion: '1.1.0' };
    expect(parseMemory(JSON.stringify(memory))).toEqual(memory);
    expect(parseMemory('not json')).toEqual(EMPTY_MEMORY);
    expect(parseMemory(null)).toEqual(EMPTY_MEMORY);
    expect(parseMemory('{"whatsNew":{"title":"no version"},"lastAutoCheckAt":"x"}')).toEqual(EMPTY_MEMORY);
  });
});

describe('release notes Markdown', () => {
  it('parses the shapes GitHub notes use', () => {
    const blocks = parseReleaseNotes(
      [
        '# Welcome to LAFINA v1.0.1',
        '',
        'A **quality** update with *polish* and `code`.',
        'Same paragraph.',
        '---',
        '## What is improved',
        '- **Connects Online Automatically:** no switches',
        '  - nested',
        '1. first',
        '> quoted',
        '<details>hidden html</details>',
        'See [the page](https://github.com/LAFINA-AI).',
      ].join('\r\n'),
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'paragraph',
      'rule',
      'heading',
      'bullet',
      'bullet',
      'numbered',
      'quote',
      'paragraph',
    ]);
    expect(blocks[1]).toMatchObject({
      kind: 'paragraph',
      spans: [
        { kind: 'text', text: 'A ' },
        { kind: 'bold', text: 'quality' },
        { kind: 'text', text: ' update with ' },
        { kind: 'italic', text: 'polish' },
        { kind: 'text', text: ' and ' },
        { kind: 'code', text: 'code' },
        { kind: 'text', text: '. Same paragraph.' },
      ],
    });
    expect(blocks[5]).toMatchObject({ kind: 'bullet', depth: 1 });
    const last = blocks[8] as { spans: unknown[] };
    expect(last.spans).toContainEqual({ kind: 'text', text: 'hidden html See ' });
    expect(last.spans).toContainEqual({ kind: 'link', text: 'the page', url: 'https://github.com/LAFINA-AI' });
  });

  it('leaves odd text alone and handles empty notes', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ kind: 'text', text: '2 * 3 = 6' }]);
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ kind: 'text', text: '[x](javascript:alert(1))' }]);
    expect(parseReleaseNotes(null)).toEqual([]);
    expect(parseReleaseNotes('\n\n')).toEqual([]);
  });

  it('turns the release title into a subtitle', () => {
    expect(releaseSubtitle('LAFINA v1.1.0 — Updates Inside the App', '1.1.0')).toBe('Updates Inside the App');
    expect(releaseSubtitle('v1.1.0: Fixes', '1.1.0')).toBe('Fixes');
    expect(releaseSubtitle('LAFINA v1.1.0', '1.1.0')).toBeNull();
    expect(releaseSubtitle(null, '1.1.0')).toBeNull();
  });
});
