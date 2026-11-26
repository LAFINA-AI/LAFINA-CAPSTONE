export {
  buildFtsQueries,
  buildPromptHandbookContext,
  buildPromptHandbookContextWithMeta,
  extractQueryTokens,
  formatOfflineHandbookReply,
  formatSpokenHandbookReply,
  hitToHandbookSource,
  LOCAL_NO_EVIDENCE_REPLY,
  parsePageNumber,
  rankAndFilterFtsCandidates,
  replyDisclaimsHandbook,
  sanitizePassageForPrompt,
  shouldMergeFollowUpQuery,
  uniqueLinks,
  wrongAcademicYearReply,
} from './handbookSearch';
export type {
  BuiltFtsQueries,
  KnowledgeFormatOptions,
  LocalHandbookMatch,
  LocalHandbookSearchResult,
  LocalHandbookSource,
} from './handbookSearch';
export {
  analyzeKnowledgeQuery,
  formatAsOfDate,
  isSnapshotStale,
  staleSnapshotNote,
} from './knowledgeScope';
export type {KnowledgeQueryScope} from './knowledgeScope';
export {campusSourceNote} from './knowledgeCitations';
export {
  localHandbookService,
  withCampusKnowledge,
} from './localHandbookService';
export type {
  HandbookPackOrigin,
  LocalHandbookSearchOptions,
  LocalHandbookStatus,
  OfflineHandbookAnswer,
  OnlineHandbookContext,
} from './localHandbookService';
export {
  getPassagesById,
  listChapterPassages,
  listKnowledgeChapters,
  listKnowledgeSources,
  listOfficialPages,
  prepareKnowledgeLibrary,
  searchKnowledgePassages,
  toPassageView,
} from './knowledgeLibrary';
export type {KnowledgeSourceSummary, PassageView} from './knowledgeLibrary';
export {
  formatVoiceUstpToolResult,
  searchUstpSourcesForVoice,
} from './voiceUstpSearch';
export type {
  UstpSearchCollection,
  VoiceUstpPassage,
  VoiceUstpSearchResult,
} from './voiceUstpSearch';
