/**
 * AGY-PORT 12: the offline-boundary scanner (scripts/offline-boundary.cjs) on
 * synthetic sources, with real violations and false-positive traps, plus the
 * actual project result.
 */
import path from 'node:path';

const boundary = require('../../scripts/offline-boundary.cjs') as {
  findViolations: (
    sources: Record<string, string>,
    composition?: Record<string, string>,
  ) => {violations: string[]; dynamic: string[]; unusedApprovals: string[]; offlineLeaves: number; files: number};
  readSources: (root: string) => Record<string, string>;
  ONLINE_COMPOSITION: Record<string, string>;
};

const scan = (sources: Record<string, string>, composition: Record<string, string> = {}) =>
  boundary.findViolations(sources, composition);

describe('AGY-PORT 12 offline boundary: real violations are found', () => {
  it('a direct fetch, global fetch, WebSocket and XMLHttpRequest in an offline leaf', () => {
    for (const body of [
      'export const f = () => fetch("https://x");',
      'export const f = () => globalThis.fetch("https://x");',
      'export const f = () => new WebSocket("wss://x");',
      'export const f = () => new XMLHttpRequest();',
    ]) {
      expect(scan({'src/storage/a.ts': body}).violations).toHaveLength(1);
    }
  });

  it('a transitive path through a helper to an online module, with the chain', () => {
    const result = scan({
      'src/scheduler/a.ts': "import {b} from '../utils/b';\nexport const a = b;",
      'src/utils/b.ts': "import {c} from '../cloud/c';\nexport const b = c;",
      'src/cloud/c.ts': 'export const c = 1;',
    });
    expect(result.violations).toEqual([
      'src/scheduler/a.ts -> src/utils/b.ts -> src/cloud/c.ts (online module)',
    ]);
  });

  it('dynamic import(), require() and re-exports are followed', () => {
    expect(scan({'src/ai/nlu/a.ts': "export const a = () => import('../../sync/s');", 'src/sync/s.ts': ''}).violations).toHaveLength(1);
    expect(scan({'src/ai/tts/a.ts': "const s = require('../../cloud/s');", 'src/cloud/s.ts': ''}).violations).toHaveLength(1);
    expect(scan({'src/storage/a.ts': "export * from '../updates/u';", 'src/updates/u.ts': ''}).violations).toHaveLength(1);
  });

  it('a network package import is a violation', () => {
    expect(scan({'src/ai/stt/a.ts': "import axios from 'axios';"}).violations).toHaveLength(1);
    expect(scan({'src/ai/native/a.ts': "import NetInfo from '@react-native-community/netinfo';"}).violations).toHaveLength(1);
  });

  it('a non-literal dynamic import is reported, never trusted', () => {
    expect(scan({'src/storage/a.ts': 'const m = "x"; export const a = () => import(m);'}).dynamic).toHaveLength(1);
  });
});

describe('AGY-PORT 12 offline boundary: false positives are not flagged', () => {
  it('type-only imports are erased', () => {
    expect(
      scan({
        'src/storage/a.ts': "import type {C} from '../cloud/c';\nimport {type D} from '../sync/d';\nexport type X = C | D;",
        'src/cloud/c.ts': 'export type C = 1;',
        'src/sync/d.ts': 'export type D = 2;',
      }).violations,
    ).toEqual([]);
  });

  it('the words fetch and WebSocket in comments, strings or properties are not calls', () => {
    expect(
      scan({
        'src/storage/a.ts':
          '// fetch("https://x")\nconst label = "fetch WebSocket";\nconst o = {fetch: 1};\nexport const v = o.fetch + label.length;\nexport const prefetch = () => store.fetch();',
      }).violations,
    ).toEqual([]);
  });

  it('online modules and UI may use the network; only offline leaves are checked', () => {
    expect(scan({'src/cloud/c.ts': 'fetch("x")', 'src/ui/x.tsx': "import {c} from '../cloud/c';"}).violations).toEqual([]);
  });
});

describe('AGY-PORT 12 offline boundary: approved composition is exact', () => {
  const sources = {
    'src/scheduler/a.ts': "import {c} from '../cloud/c';\nexport const a = c;",
    'src/cloud/c.ts': 'export const c = 1;',
  };

  it('only the exact approved edge passes, and a stale approval is reported', () => {
    expect(scan(sources, {'src/scheduler/a.ts -> src/cloud/c.ts': 'reason'}).violations).toEqual([]);
    expect(scan(sources, {'src/scheduler/other.ts -> src/cloud/c.ts': 'reason'}).violations).toHaveLength(1);
    expect(scan(sources, {'src/scheduler/other.ts -> src/cloud/c.ts': 'reason'}).unusedApprovals).toEqual([
      'src/scheduler/other.ts -> src/cloud/c.ts',
    ]);
  });
});

describe('AGY-PORT 12 offline boundary: this project', () => {
  it('every offline leaf is clean with no approvals needed, and online modules still exist', () => {
    const sources = boundary.readSources(path.resolve(__dirname, '..', '..'));
    const result = boundary.findViolations(sources);
    expect(result).toMatchObject({violations: [], dynamic: [], unusedApprovals: []});
    expect(result.offlineLeaves).toBeGreaterThan(50);
    expect(boundary.ONLINE_COMPOSITION).toEqual({});
    // The online features are composed in the UI, not removed.
    for (const kept of [
      'src/cloud/cloudClient.ts',
      'src/cloud/speechService.ts',
      'src/sync/syncWorker.ts',
      'src/skills/documentSkill.ts',
      'src/skills/onlineChatSkill.ts',
    ]) {
      expect(sources[kept]).toBeDefined();
    }
  });
});
