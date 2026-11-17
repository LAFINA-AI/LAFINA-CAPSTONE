import RNFS from 'react-native-fs';
import bundledHandbookPack from './ustpHandbookPack.json';
import {
  localHandbookStore,
  parseHandbookPack,
  type HandbookFtsHit,
  type HandbookPack,
} from '../storage/localHandbookStore';
import {
  buildFtsQueries,
  buildPromptHandbookContext,
  formatOfflineHandbookReply,
  freeTokensOf,
  rankAndFilterFtsCandidates,
  shouldMergeFollowUpQuery,
  type LocalHandbookMatch,
  type LocalHandbookSearchResult,
  type LocalHandbookSource,
} from './handbookSearch';

export type HandbookPackOrigin = 'none' | 'bundled' | 'device_file' | 'test';

export interface LocalHandbookStatus {
  ready: boolean;
  populated: boolean;
  chunkCount: number;
  title: string;
  edition: string;
  sourceLabel: string;
  sha256: string;
  origin: HandbookPackOrigin;
}

export interface LocalHandbookSearchOptions {
  limit?: number;
  previousUserQuery?: string | null;
}

export interface OnlineHandbookContext {
  contextBlock: string;
  sources: LocalHandbookSource[];
  matches: LocalHandbookMatch[];
}

export interface OfflineHandbookAnswer {
  reply: string;
  sources: LocalHandbookSource[];
  insufficientEvidence: boolean;
}

const OVERRIDE_RELATIVE_PATH = 'handbook/ustp_handbook_pack.json';

let readyPromise: Promise<LocalHandbookStatus> | null = null;
let lastOrigin: HandbookPackOrigin = 'none';
let cachedStatus: LocalHandbookStatus | null = null;
/** False on a native build without SQLite FTS5: the handbook is "not available". */
let ftsAvailable = true;

function overrideFilePath(): string | null {
  const dir =
    typeof RNFS.DocumentDirectoryPath === 'string'
      ? RNFS.DocumentDirectoryPath.trim()
      : '';
  return dir ? `${dir}/${OVERRIDE_RELATIVE_PATH}` : null;
}

async function loadBestAvailablePack(): Promise<{
  pack: HandbookPack;
  origin: HandbookPackOrigin;
}> {
  const overridePath = overrideFilePath();
  if (overridePath && typeof RNFS.exists === 'function') {
    try {
      const hasOverride = await RNFS.exists(overridePath);
      if (hasOverride && typeof RNFS.readFile === 'function') {
        const rawText = await RNFS.readFile(overridePath, 'utf8');
        const parsedOverride = parseHandbookPack(JSON.parse(rawText));
        if (parsedOverride && parsedOverride.chunkCount > 0) {
          return {pack: parsedOverride, origin: 'device_file'};
        }
      }
    } catch (error) {
      console.warn(
        '[LocalHandbookService] Ignoring unreadable device override pack:',
        error,
      );
    }
  }

  const parsedBundled = parseHandbookPack(bundledHandbookPack);
  if (parsedBundled) {
    return {
      pack: parsedBundled,
      origin: parsedBundled.chunkCount > 0 ? 'bundled' : 'none',
    };
  }

  return {
    pack: {
      version: 1,
      title: 'USTP Student Handbook',
      edition: 'Unavailable',
      sourceLabel: 'USTP Student Handbook',
      sha256: 'empty-0',
      chunkCount: 0,
      generatedAt: new Date(0).toISOString(),
      chunks: [],
    },
    origin: 'none',
  };
}

function buildStatusFromMeta(
  origin: HandbookPackOrigin,
  ready = cachedStatus?.ready === true,
): LocalHandbookStatus {
  const meta = localHandbookStore.getMeta();
  if (!ftsAvailable) {
    return {
      ready,
      populated: false,
      chunkCount: 0,
      title: meta?.title ?? 'USTP Student Handbook',
      edition: meta?.edition ?? 'Unavailable on this build',
      sourceLabel: meta?.sourceLabel ?? 'USTP Student Handbook',
      sha256: meta?.sha256 ?? 'empty-0',
      origin: 'none',
    };
  }
  if (meta) {
    return {
      ready: true,
      populated: meta.chunkCount > 0,
      chunkCount: meta.chunkCount,
      title: meta.title,
      edition: meta.edition,
      sourceLabel: meta.sourceLabel,
      sha256: meta.sha256,
      origin: meta.chunkCount > 0 ? origin : 'none',
    };
  }
  const parsedBundled = parseHandbookPack(bundledHandbookPack);
  return {
    ready,
    populated: Boolean(parsedBundled && parsedBundled.chunkCount > 0),
    chunkCount: parsedBundled?.chunkCount ?? 0,
    title: parsedBundled?.title ?? 'USTP Student Handbook',
    edition: parsedBundled?.edition ?? 'USTP Student Handbook',
    sourceLabel: parsedBundled?.sourceLabel ?? 'USTP Student Handbook',
    sha256: parsedBundled?.sha256 ?? 'empty-0',
    origin: parsedBundled && parsedBundled.chunkCount > 0 ? 'bundled' : 'none',
  };
}

function runFtsCandidates(
  queryText: string,
  limit: number,
): {
  built: ReturnType<typeof buildFtsQueries>;
  hits: HandbookFtsHit[];
} {
  const built = buildFtsQueries(queryText);
  if (!built.relaxedOrExpr && !built.strictAndExpr) {
    return {built, hits: []};
  }

  const collected: HandbookFtsHit[] = [];
  const fetchLimit = Math.max(limit * 3, 12);

  if (built.strictAndExpr) {
    try {
      collected.push(
        ...localHandbookStore.queryFts(built.strictAndExpr, fetchLimit),
      );
    } catch {
      // Fallback safely to relaxed OR query
    }
  }

  if (collected.length < limit && built.relaxedOrExpr) {
    try {
      collected.push(
        ...localHandbookStore.queryFts(built.relaxedOrExpr, fetchLimit),
      );
    } catch {
      // Leave collected as-is if FTS table unavailable
    }
  }

  return {built, hits: collected};
}

/** Per-pack cache of "is this word anywhere in the handbook?". */
const termPresenceCache = new Map<string, boolean>();
let termPresenceDigest = '';

function unknownFreeTokens(
  built: ReturnType<typeof buildFtsQueries>,
): Set<string> {
  const digest = localHandbookStore.getMeta()?.sha256 ?? 'empty-0';
  if (digest !== termPresenceDigest) {
    termPresenceCache.clear();
    termPresenceDigest = digest;
  }
  const unknown = new Set<string>();
  for (const token of freeTokensOf(built)) {
    let present = termPresenceCache.get(token);
    if (present === undefined) {
      try {
        present = localHandbookStore.hasTerm(token);
      } catch {
        // FTS unavailable: do not invent unknown words.
        present = true;
      }
      termPresenceCache.set(token, present);
    }
    if (!present) {
      unknown.add(token);
    }
  }
  return unknown;
}

function searchOnce(
  queryText: string,
  limit: number,
): LocalHandbookSearchResult {
  const {built, hits} = runFtsCandidates(queryText, limit);
  return rankAndFilterFtsCandidates(queryText, built, hits, limit, {
    unknownTokens: unknownFreeTokens(built),
  });
}

export const localHandbookService = {
  async ensureReady(): Promise<LocalHandbookStatus> {
    if (cachedStatus?.ready) {
      const currentMeta = localHandbookStore.getMeta();
      const activeDigest = currentMeta?.sha256 ?? 'empty-0';
      if (activeDigest === cachedStatus.sha256) {
        return cachedStatus;
      }
      cachedStatus = null;
    }
    if (!readyPromise) {
      readyPromise = (async () => {
        try {
          ftsAvailable = localHandbookStore.ensureFtsIndex();
          if (!ftsAvailable) {
            cachedStatus = buildStatusFromMeta('none', true);
            return cachedStatus;
          }
          const {pack, origin} = await loadBestAvailablePack();
          const existingMeta = localHandbookStore.getMeta();
          const needsSync =
            existingMeta === null
              ? pack.chunkCount > 0
              : existingMeta.sha256 !== pack.sha256 ||
                existingMeta.chunkCount !== pack.chunkCount;

          if (needsSync) {
            localHandbookStore.upsertPack(pack);
          }

          lastOrigin =
            pack.chunkCount > 0 || (existingMeta?.chunkCount ?? 0) > 0
              ? origin === 'none'
                ? 'test'
                : origin
              : 'none';
          cachedStatus = buildStatusFromMeta(lastOrigin, true);
          return cachedStatus;
        } finally {
          readyPromise = null;
        }
      })();
    }
    return readyPromise;
  },

  getStatus(): LocalHandbookStatus {
    return buildStatusFromMeta(lastOrigin);
  },

  isPopulated(): boolean {
    if (!ftsAvailable) {
      return false;
    }
    const meta = localHandbookStore.getMeta();
    if (meta !== null) {
      return meta.chunkCount > 0;
    }
    const parsedBundled = parseHandbookPack(bundledHandbookPack);
    return Boolean(parsedBundled && parsedBundled.chunkCount > 0);
  },

  async search(
    query: string,
    options: LocalHandbookSearchOptions = {},
  ): Promise<LocalHandbookSearchResult> {
    const status = await this.ensureReady();
    if (!status.populated) {
      return {
        matches: [],
        queryUsed: query,
        insufficientEvidence: true,
        sources: [],
      };
    }

    const limit = options.limit ?? 4;
    let result = searchOnce(query, limit);

    // A short follow-up borrows the previous question only when that
    // question was itself answerable from the handbook (audit H2 item 3):
    // "tell me a joke" after small talk must not pull in old keywords.
    const previous = options.previousUserQuery?.trim() ?? '';
    if (
      (result.insufficientEvidence || result.matches.length === 0) &&
      previous &&
      shouldMergeFollowUpQuery(query) &&
      !searchOnce(previous, 1).insufficientEvidence
    ) {
      const mergedQuery = `${previous} ${query.trim()}`;
      const mergedResult = searchOnce(mergedQuery, limit);
      if (
        !mergedResult.insufficientEvidence &&
        mergedResult.matches.length > 0
      ) {
        result = mergedResult;
      }
    }

    return result;
  },

  async buildOnlineContext(
    query: string,
    options: {previousUserQuery?: string | null; maxChars?: number} = {},
  ): Promise<OnlineHandbookContext | null> {
    const result = await this.search(query, {
      limit: 4,
      previousUserQuery: options.previousUserQuery,
    });
    if (result.insufficientEvidence || result.matches.length === 0) {
      return null;
    }
    const contextBlock = buildPromptHandbookContext(
      result.matches,
      options.maxChars ?? 2400,
    );
    if (!contextBlock) {
      return null;
    }
    return {
      contextBlock,
      sources: result.sources,
      matches: result.matches,
    };
  },

  async answerOffline(
    query: string,
    options: {previousUserQuery?: string | null} = {},
  ): Promise<OfflineHandbookAnswer> {
    const result = await this.search(query, {
      limit: 3,
      previousUserQuery: options.previousUserQuery,
    });
    return {
      reply: formatOfflineHandbookReply(result),
      sources: result.sources,
      insufficientEvidence: result.insufficientEvidence,
    };
  },

  ingestPackForTests(rawPack: unknown): LocalHandbookStatus {
    const parsed = parseHandbookPack(rawPack);
    if (!parsed) {
      throw new Error('Invalid handbook pack fixture supplied in test');
    }
    localHandbookStore.upsertPack(parsed);
    lastOrigin = parsed.chunkCount > 0 ? 'test' : 'none';
    cachedStatus = buildStatusFromMeta(lastOrigin, true);
    return cachedStatus;
  },

  resetForTests(): void {
    readyPromise = null;
    cachedStatus = null;
    lastOrigin = 'none';
    ftsAvailable = true;
    termPresenceCache.clear();
    termPresenceDigest = '';
    try {
      localHandbookStore.clearPack();
    } catch {
      // Ignore if test database has not been initialized yet
    }
  },
};
