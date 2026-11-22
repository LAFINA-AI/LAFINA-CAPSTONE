import type {DocumentFormat} from '../../skills/documentSkill';
import type {SkillSource} from '../screens/skills/SourcePicker';

export type DocGenLength = 'Short' | 'Standard' | 'Detailed';
export type DocGenHandbookMode = 'Off' | 'USTP Handbook';

export interface DocGenDraft {
  format: DocumentFormat;
  prompt: string;
  length: DocGenLength;
  handbook: DocGenHandbookMode;
  source: SkillSource;
}

const DEFAULT_DRAFT: DocGenDraft = {
  format: 'pptx',
  prompt: '',
  length: 'Standard',
  handbook: 'Off',
  source: {text: '', label: ''},
};

const drafts = new Map<string, DocGenDraft>();

const cloneSource = (source: SkillSource): SkillSource => ({
  ...source,
  ...(source.notes ? {notes: source.notes.map(n => ({...n}))} : {}),
});

const cloneDraft = (draft: DocGenDraft): DocGenDraft => ({
  ...draft,
  source: cloneSource(draft.source),
});

export const docGenDraftStore = {
  get(owner: string): DocGenDraft {
    const existing = drafts.get(owner);
    return existing ? cloneDraft(existing) : cloneDraft(DEFAULT_DRAFT);
  },

  set(owner: string, patch: Partial<DocGenDraft>): DocGenDraft {
    const current = drafts.get(owner) ?? cloneDraft(DEFAULT_DRAFT);
    const next: DocGenDraft = {
      ...current,
      ...patch,
      source: patch.source
        ? cloneSource(patch.source)
        : cloneSource(current.source),
    };
    drafts.set(owner, next);
    return cloneDraft(next);
  },

  seedSource(
    owner: string,
    source: SkillSource,
    options?: {
      prompt?: string;
      format?: DocumentFormat;
      length?: DocGenLength;
      handbook?: DocGenHandbookMode;
    },
  ): DocGenDraft {
    return docGenDraftStore.set(owner, {
      source,
      ...(options?.prompt !== undefined ? {prompt: options.prompt} : {}),
      ...(options?.format !== undefined ? {format: options.format} : {}),
      ...(options?.length !== undefined ? {length: options.length} : {}),
      ...(options?.handbook !== undefined ? {handbook: options.handbook} : {}),
    });
  },

  clear(owner: string): void {
    drafts.delete(owner);
  },

  retainOnly(owner: string | null): void {
    Array.from(drafts.keys()).forEach(key => {
      if (key !== owner) drafts.delete(key);
    });
  },

  resetForTests(): void {
    drafts.clear();
  },
};
