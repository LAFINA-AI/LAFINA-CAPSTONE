export {
  buildFtsQueries,
  buildPromptHandbookContext,
  extractQueryTokens,
  formatOfflineHandbookReply,
  hitToHandbookSource,
  LOCAL_NO_EVIDENCE_REPLY,
  parsePageNumber,
  rankAndFilterFtsCandidates,
  sanitizePassageForPrompt,
  shouldMergeFollowUpQuery,
} from './handbookSearch';
export type {
  BuiltFtsQueries,
  LocalHandbookMatch,
  LocalHandbookSearchResult,
  LocalHandbookSource,
} from './handbookSearch';
export {localHandbookService} from './localHandbookService';
export type {
  HandbookPackOrigin,
  LocalHandbookSearchOptions,
  LocalHandbookStatus,
  OfflineHandbookAnswer,
  OnlineHandbookContext,
} from './localHandbookService';
