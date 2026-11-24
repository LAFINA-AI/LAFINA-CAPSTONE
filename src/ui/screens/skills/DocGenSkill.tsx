import React, {useEffect, useRef, useState} from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  ActivityIndicator,
  Alert,
  NativeModules,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import RNFS from 'react-native-fs';
import {
  BookOpen,
  Copy,
  FileSpreadsheet,
  FileText,
  Mic,
  Presentation,
  Share2,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react-native';
import {buildSkillDocumentPrompt} from '../../../skills/documentPrompt';
import {replyPreferenceInstruction} from '../../../ai/personalization';
import {SKILLS_CAPABILITIES} from '../../../skills/skillsCapabilities';
import {
  describeDocumentFailure,
  documentSkill,
  formatFileSize,
  isDocumentFormat,
} from '../../../skills/documentSkill';
import type {DocumentFormat} from '../../../skills/documentSkill';
import {onlineChatSkill} from '../../../skills/onlineChatSkill';
import {
  condenseSourceForBudget,
  requireStudyOnline,
} from '../../../skills/studyAi';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {useStudyJob} from '../../../skills/studyJobs';
import {localHandbookService} from '../../../handbook/localHandbookService';
import {accountLinkService, cloudClient, isGuestAccount} from '../../../cloud';
import {localSettingsStore, notesEditStore, userStore} from '../../../storage';
import type {ChatAttachment} from '../../../storage/chatStore';
import {
  captureUstpEligibility,
  getUstpEligibility,
  isUstpSchoolEnabled,
  ustpUnavailableMessage,
} from '../../../storage/ustpEligibility';
import {
  cancelListening,
  ensureMicrophonePermission,
  startListening,
  stopListening,
} from '../../../ai/stt/sttService';
import {isMicrophoneBusyError} from '../../../ai/native/speechCapture';
import {generateId} from '../../../utils';
import {shareAttachment} from '../../components/chat/chatFiles';
import {ChatReplyText} from '../../components/chat/ChatReplyText';
import {docGenDraftStore} from '../../drafts/docGenDraftStore';
import type {
  DocGenHandbookMode,
  DocGenLength,
} from '../../drafts/docGenDraftStore';
import {useStorageRevision} from '../../hooks/useStorageRevision';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {SkillCheck, SkillHalo} from './SkillMotion';
import {Choices, SkillButton, SkillCard, SkillText, ui} from './SkillUI';
import {SourcePicker} from './SourcePicker';
import type {SkillSource} from './SourcePicker';
import type {SkillLaunchRequest} from '../../../skills/skillLaunch';

const MAX_PROMPT_LENGTH = 500;
const MAX_RECENT_FILES = 50;
const MAX_DOCGEN_SOURCE_CHARS = 2500;
/** The user's own text kept beside Handbook passages. */
const HANDBOOK_USER_EXCERPT_CHARS = 1300;
/** Warn this many files before the list is full. */
const FILES_NEARLY_FULL = MAX_RECENT_FILES - 5;

/** What to tell the student about how much of their source a file used. */
const describeSourceUse = (
  file: Pick<
    SkillFile,
    'condensedFrom' | 'truncated' | 'contextChars' | 'context'
  >,
): string | null => {
  if (file.condensedFrom) {
    return `LAFINA condensed your ${file.condensedFrom.toLocaleString()}-character source first, so the file covers all of it.`;
  }
  if (file.truncated) {
    return `This file used the first ${(
      file.contextChars ??
      file.context?.length ??
      MAX_DOCGEN_SOURCE_CHARS
    ).toLocaleString()} source characters.`;
  }
  return null;
};

export interface SkillFile {
  id: string;
  attachment: ChatAttachment;
  title: string;
  summary: string;
  createdAt: string;
  prompt: string;
  originalPrompt?: string;
  context?: string;
  fullContext?: string;
  citations?: string;
  truncated?: boolean;
  contextChars?: number;
  /** Length of the original source when it was condensed to fit. */
  condensedFrom?: number;
  length?: DocGenLength;
  version?: number;
  sourceLabel?: string;
}

interface FormatCardMeta {
  format: DocumentFormat;
  label: string;
  ext: string;
  badge: string;
  ctaLabel: string;
  readyTitle: string;
  placeholder: string;
  starters: readonly string[];
  icon: typeof FileText;
}

const FORMAT_CARDS: readonly FormatCardMeta[] = [
  {
    format: 'pptx',
    label: 'Slides',
    ext: '.pptx',
    badge: 'PPTX',
    ctaLabel: 'Generate slides',
    readyTitle: 'Your slides are ready',
    placeholder:
      'e.g. 10-slide group report on cloud computing for IT Elective 3',
    starters: [
      '10-slide group presentation on key concepts',
      'Chapter takeaways & discussion deck',
      'Case study summary slides with examples',
    ],
    icon: Presentation,
  },
  {
    format: 'docx',
    label: 'Document',
    ext: '.docx',
    badge: 'DOCX',
    ctaLabel: 'Generate document',
    readyTitle: 'Your document is ready',
    placeholder:
      'e.g. A structured reviewer for my Software Engineering midterm',
    starters: [
      'Midterm study reviewer with key terms',
      'Structured lab report outline',
      'Detailed reading guide with review questions',
    ],
    icon: FileText,
  },
  {
    format: 'pdf',
    label: 'PDF',
    ext: '.pdf',
    badge: 'PDF',
    ctaLabel: 'Generate PDF',
    readyTitle: 'Your PDF is ready',
    placeholder:
      'e.g. Concise study handout with key formulas, definitions and tips',
    starters: [
      'Clean exam cheat sheet handout',
      'Topic summary with definitions & formulas',
      'Printable study checklist & notes',
    ],
    icon: FileText,
  },
  {
    format: 'xlsx',
    label: 'Sheet',
    ext: '.xlsx',
    badge: 'XLSX',
    ctaLabel: 'Generate spreadsheet',
    readyTitle: 'Your spreadsheet is ready',
    placeholder:
      'e.g. Weekly exam revision tracker with topics, priority and hours',
    starters: [
      'Exam topic study tracker table',
      'Concept comparison matrix',
      'Project milestone & task schedule',
    ],
    icon: FileSpreadsheet,
  },
];

const LENGTH_VALUES: readonly DocGenLength[] = [
  'Short',
  'Standard',
  'Detailed',
];

const LENGTH_LABELS: Record<DocumentFormat, readonly [string, string, string]> =
  {
    pptx: ['5 slides', '10 slides', '15 slides'],
    docx: ['1–2 pages', '3–5 pages', '6+ pages'],
    pdf: ['1–2 pages', '3–5 pages', '6+ pages'],
    xlsx: ['1 sheet', '2–3 sheets', 'Multi-sheet'],
  };

const WORKING_STAGES = [
  'Reading your sources',
  'Outlining, writing & formatting',
  'Saving on this phone',
] as const;

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
};

const asDocumentFormat = (raw: string): DocumentFormat =>
  isDocumentFormat(raw) ? raw : 'pdf';

const formatMetaFor = (format: DocumentFormat): FormatCardMeta =>
  FORMAT_CARDS.find(card => card.format === format) ?? FORMAT_CARDS[0];

function LengthChoices({
  format,
  value,
  onChange,
  label = 'Length',
}: {
  format: DocumentFormat;
  value: DocGenLength;
  onChange: (next: DocGenLength) => void;
  label?: string;
}) {
  const labels = LENGTH_LABELS[format];
  const currentLabel = labels[LENGTH_VALUES.indexOf(value)] ?? labels[1];
  return (
    <Choices
      label={label}
      values={labels}
      value={currentLabel}
      onChange={picked => {
        const idx = labels.indexOf(picked);
        onChange(LENGTH_VALUES[idx >= 0 ? idx : 1]);
      }}
    />
  );
}

export function DocGenSkill({
  userId,
  refreshTrigger = 0,
  initialMaterialId,
  onOpenProfile,
  onNavigateToRegister,
  launch,
  onLaunchHandled,
  registerBackHandler,
}: {
  userId: string;
  refreshTrigger?: number;
  initialMaterialId?: string;
  /** LAFINA opened Create with LAFINA (ADR-041); a topic pre-fills the prompt. */
  launch?: SkillLaunchRequest | null;
  onLaunchHandled?: (id: string) => void;
  registerBackHandler?: (handler: (() => boolean) | null) => void;
  onOpenProfile?: () => void;
  onNavigateToRegister?: () => void;
}) {
  const p = useSkillsPalette();
  const settingsRevision = useStorageRevision(['local_settings']);
  const [connected, setConnected] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener(state =>
        setConnected(
          state.isConnected !== false && state.isInternetReachable !== false,
        ),
      ),
    [],
  );

  const initialDraft = docGenDraftStore.get(userId);
  const [format, setFormatState] = useState<DocumentFormat>(
    initialDraft.format,
  );
  const [prompt, setPromptState] = useState(initialDraft.prompt);
  const [source, setSourceState] = useState<SkillSource>(initialDraft.source);
  const [handbook, setHandbookState] = useState<DocGenHandbookMode>(
    initialDraft.handbook,
  );
  const [length, setLengthState] = useState<DocGenLength>(initialDraft.length);

  const [files, setFiles] = useState<SkillFile[]>(() =>
    readSkillState(userId, 'files', []),
  );
  const [selected, setSelected] = useState<SkillFile | null>(null);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [revisionLength, setRevisionLength] =
    useState<DocGenLength>('Standard');
  const [savedSummaryNoteId, setSavedSummaryNoteId] = useState<string | null>(
    null,
  );
  const [missingFileIds, setMissingFileIds] = useState<Record<string, boolean>>(
    {},
  );
  const [enablingOnline, setEnablingOnline] = useState(false);
  const [notice, setNotice] = useState<{text: string; danger?: boolean} | null>(
    null,
  );
  const [elapsedSec, setElapsedSec] = useState(0);

  const capture = useRef<string | null>(null);
  const dictationLock = useRef(false);
  const mountedRef = useRef(true);
  const [dictationState, setDictationState] = useState<
    'idle' | 'listening' | 'transcribing'
  >('idle');
  const [dictationTarget, setDictationTarget] = useState<'create' | 'revise'>(
    'create',
  );

  const job = useStudyJob<SkillFile>(userId, 'document');
  const stage = job.progress;
  const {result: completed, consume, clearError} = job;

  const setFormat = (next: DocumentFormat) => {
    setFormatState(next);
    docGenDraftStore.set(userId, {format: next});
    clearError();
  };
  const setPrompt = (next: string) => {
    setPromptState(next);
    docGenDraftStore.set(userId, {prompt: next});
    clearError();
  };
  const handledLaunchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!launch || handledLaunchRef.current === launch.id) return;
    handledLaunchRef.current = launch.id;
    onLaunchHandled?.(launch.id);
    // Only fills the prompt; nothing is generated until the student taps.
    if (launch.topic) setPrompt(launch.topic);
    // Runs once per launch id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch]);
  const setSource = (next: SkillSource) => {
    setSourceState(next);
    docGenDraftStore.set(userId, {source: next});
    clearError();
  };
  const setHandbook = (next: DocGenHandbookMode) => {
    setHandbookState(next);
    docGenDraftStore.set(userId, {handbook: next});
    clearError();
  };
  const setLength = (next: DocGenLength) => {
    setLengthState(next);
    docGenDraftStore.set(userId, {length: next});
    clearError();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (capture.current) {
        const activeId = capture.current;
        capture.current = null;
        dictationLock.current = false;
        void cancelListening(activeId).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    const draft = docGenDraftStore.get(userId);
    setFormatState(draft.format);
    setPromptState(draft.prompt);
    setSourceState(draft.source);
    setHandbookState(draft.handbook);
    setLengthState(draft.length);
    setSelected(null);
    setReviseOpen(false);
    setRevisionPrompt('');
    setSavedSummaryNoteId(null);
    setMissingFileIds({});
    setNotice(null);
  }, [userId]);

  useEffect(() => {
    const persisted = readSkillState<SkillFile[]>(userId, 'files', []);
    setFiles(persisted);
    setSelected(current => {
      if (!current) return null;
      const latest = persisted.find(item => item.id === current.id);
      return latest ?? null;
    });
  }, [userId, refreshTrigger, settingsRevision]);

  useEffect(() => {
    if (completed) {
      setSelected(completed);
      setReviseOpen(false);
      setRevisionPrompt('');
      setRevisionLength(completed.length ?? 'Standard');
      setSavedSummaryNoteId(null);
      setMissingFileIds(prev => {
        if (!prev[completed.id]) return prev;
        const copy = {...prev};
        delete copy[completed.id];
        return copy;
      });
      setFiles(readSkillState(userId, 'files', []));
      const sourceUse = describeSourceUse(completed);
      if (sourceUse) {
        setNotice({text: `Saved. ${sourceUse}`});
      }
      consume();
    }
  }, [completed, consume, userId]);

  useEffect(() => {
    if (!job.busy) {
      setElapsedSec(0);
      return;
    }
    const base = job.startedAt ?? Date.now();
    const update = () =>
      setElapsedSec(Math.max(0, Math.floor((Date.now() - base) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [job.busy, job.startedAt]);

  const stopActiveDictation = () => {
    if (!capture.current) return;
    const activeId = capture.current;
    capture.current = null;
    dictationLock.current = false;
    setDictationState('idle');
    void cancelListening(activeId).catch(() => undefined);
  };

  const docBackStateRef = useRef({
    selected,
    reviseOpen,
    stopActiveDictation,
    clearError,
  });
  docBackStateRef.current = {
    selected,
    reviseOpen,
    stopActiveDictation,
    clearError,
  };

  useEffect(() => {
    if (!registerBackHandler) return undefined;
    registerBackHandler(() => {
      const current = docBackStateRef.current;
      if (current.reviseOpen) {
        current.stopActiveDictation();
        setReviseOpen(false);
        setRevisionPrompt('');
        current.clearError();
        return true;
      }
      if (current.selected) {
        current.stopActiveDictation();
        setSelected(null);
        setReviseOpen(false);
        setRevisionPrompt('');
        setNotice(null);
        current.clearError();
        return true;
      }
      return false;
    });
    return () => registerBackHandler(null);
  }, [registerBackHandler]);

  const dictate = async (target: 'create' | 'revise') => {
    setNotice(null);
    if (capture.current) {
      if (dictationState === 'listening') {
        setDictationState('transcribing');
        await stopListening(capture.current);
      }
      return;
    }
    if (dictationLock.current) return;
    dictationLock.current = true;
    setDictationTarget(target);

    let myCaptureId: string | null = null;
    try {
      if (!(await ensureMicrophonePermission())) {
        if (mountedRef.current) {
          setNotice({
            text: 'Microphone permission was not granted. Type your prompt instead.',
            danger: true,
          });
        }
        return;
      }
      if (!mountedRef.current) return;
      const handle = startListening();
      myCaptureId = handle.captureId;
      capture.current = handle.captureId;
      setDictationState('listening');
      const result = await handle.result;
      if (!mountedRef.current || capture.current !== myCaptureId) return;
      const transcript = result.transcript.trim();
      if (!result.cancelled && transcript) {
        if (target === 'revise') {
          setRevisionPrompt(old => {
            const combined = old ? `${old} ${transcript}`.trim() : transcript;
            if (combined.length > MAX_PROMPT_LENGTH) {
              setNotice({
                text: `Dictated text reached the ${MAX_PROMPT_LENGTH}-character limit.`,
              });
            }
            return combined.slice(0, MAX_PROMPT_LENGTH);
          });
        } else {
          const current = docGenDraftStore.get(userId).prompt;
          const combined = current
            ? `${current} ${transcript}`.trim()
            : transcript;
          if (combined.length > MAX_PROMPT_LENGTH) {
            setNotice({
              text: `Dictated text reached the ${MAX_PROMPT_LENGTH}-character limit.`,
            });
          }
          setPrompt(combined.slice(0, MAX_PROMPT_LENGTH));
        }
      } else if (!result.cancelled) {
        setNotice({
          text: 'No speech was recognized. You can type your prompt.',
        });
      }
    } catch (e) {
      if (mountedRef.current) {
        setNotice({
          text: isMicrophoneBusyError(e)
            ? 'Microphone is currently in use (for example by a recording). Finish it or type your prompt.'
            : (e as Error).message ||
              'Dictation failed. Type your prompt instead.',
          danger: true,
        });
      }
    } finally {
      if (myCaptureId === null || capture.current === myCaptureId) {
        capture.current = null;
        dictationLock.current = false;
        if (mountedRef.current) {
          setDictationState('idle');
        }
      }
    }
  };

  const isGuest = isGuestAccount(userId);
  const activeTokens = userStore.getActiveSessionToken();
  const hasCloudSession =
    !isGuest &&
    Boolean(
      cloudClient.getAccessToken() ||
        (activeTokens.userId === userId && activeTokens.refreshToken),
    );
  const onlineModeEnabled =
    settingsRevision >= 0 &&
    localSettingsStore.get(userId, 'chat.onlineMode') === 'true';
  const ustp = getUstpEligibility(userId);
  const canGenerateOnline =
    !isGuest && hasCloudSession && onlineModeEnabled && connected;

  const enableOnlineMode = async () => {
    if (enablingOnline) return;
    setNotice(null);
    clearError();
    setEnablingOnline(true);
    try {
      const netState = await NetInfo.fetch().catch(() => null);
      if (
        netState?.isConnected === false ||
        netState?.isInternetReachable === false
      ) {
        if (mountedRef.current) {
          setNotice({
            text: 'Please connect to Wi-Fi or mobile data to enable Online Mode.',
            danger: true,
          });
        }
        return;
      }
      const auth = await accountLinkService
        .authorizeOnlineMode(userId)
        .catch(() => ({
          status: 'network_error' as const,
          message: 'Could not reach the LAFINA server. Try again.',
        }));
      if (auth.status !== 'success') {
        if (mountedRef.current) {
          setNotice({
            text: auth.message || 'Could not enable Online Mode right now.',
            danger: true,
          });
        }
        return;
      }
      if (!localSettingsStore.set(userId, 'chat.onlineMode', 'true')) {
        if (mountedRef.current) {
          setNotice({
            text: 'Could not save the Online Mode setting on this phone. Try again.',
            danger: true,
          });
        }
        return;
      }
      if (mountedRef.current) {
        setNotice({text: 'Online Mode is now on.'});
      }
    } finally {
      if (mountedRef.current) setEnablingOnline(false);
    }
  };

  const generate = (
    revising: SkillFile | null = null,
    confirmedListFull = false,
  ) => {
    stopActiveDictation();
    setNotice(null);
    clearError();

    const activePrompt = revising ? revisionPrompt.trim() : prompt.trim();
    if (revising && !activePrompt) {
      setNotice({
        text: 'Describe the changes you want to make.',
        danger: true,
      });
      return;
    }
    if (!revising && !activePrompt && !source.text.trim()) {
      setNotice({
        text: 'Describe the file you need or choose a source.',
        danger: true,
      });
      return;
    }
    if (isGuest || !hasCloudSession) {
      setNotice({
        text: 'Sign in to a cloud account to create files. Your saved files still open offline.',
        danger: true,
      });
      return;
    }
    if (!onlineModeEnabled) {
      setNotice({
        text: 'Online Mode is off. Turn it on above to create files.',
        danger: true,
      });
      return;
    }
    if (!connected) {
      setNotice({
        text: 'You appear to be offline. Connect to the internet to create files.',
        danger: true,
      });
      return;
    }
    if (!confirmedListFull) {
      const saved = readSkillState<SkillFile[]>(userId, 'files', []);
      if (saved.length >= MAX_RECENT_FILES) {
        const removed = saved.slice(MAX_RECENT_FILES - 1);
        const oldest = removed[removed.length - 1];
        const more =
          removed.length > 1 ? ` and ${removed.length - 1} more` : '';
        Alert.alert(
          'Your file list is full',
          `LAFINA keeps up to ${MAX_RECENT_FILES} files on this phone. Creating this one deletes the oldest: "${
            oldest?.title ?? 'file'
          }"${more}. Share or delete files you still need first, or continue.`,
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Continue',
              style: 'destructive',
              onPress: () => generate(revising, true),
            },
          ],
        );
        return;
      }
    }

    const chosenLength: DocGenLength = revising ? revisionLength : length;
    const chosenFormat: DocumentFormat = revising
      ? asDocumentFormat(revising.attachment.format)
      : format;
    const initialSourceText = revising
      ? revising.fullContext ?? revising.context ?? ''
      : source.text;
    const initialSourceLabel = revising
      ? revising.sourceLabel
      : source.label || undefined;
    const useHandbook = !revising && handbook === 'USTP Handbook';

    void job.run(async ({signal, isCancelled}) => {
      await requireStudyOnline(userId);
      if (signal.aborted || isCancelled()) {
        throw new Error('Document generation was cancelled.');
      }

      let context = initialSourceText;
      let citations =
        revising && isUstpSchoolEnabled(userId) ? revising.citations || '' : '';
      let condensedFrom = revising?.condensedFrom;

      // The document service takes a short prompt. Rather than cut a long
      // source to its first page, condense all of it into notes that fit.
      if (!revising) {
        const sourceText = context.trim();
        const room = useHandbook
          ? HANDBOOK_USER_EXCERPT_CHARS
          : buildSkillDocumentPrompt({
              prompt: activePrompt,
              format: chosenFormat,
              length: chosenLength,
              context: sourceText,
              citations,
              styleNote: replyPreferenceInstruction(userId),
            }).context.length;
        if (room > 0 && sourceText.length > room) {
          job.setProgress(0, 'Condensing your source so all of it is used…');
          context = await condenseSourceForBudget(
            userId,
            sourceText,
            Math.max(300, room - 40),
            {
              signal,
              onProgress: (done, total) =>
                job.setProgress(
                  0,
                  total > 1
                    ? `Condensing your source (part ${done} of ${total})…`
                    : 'Condensing your source…',
                ),
            },
          );
          condensedFrom = sourceText.length;
          if (signal.aborted || isCancelled()) {
            throw new Error('Document generation was cancelled.');
          }
        }
      }

      if (useHandbook) {
        const ustpGate = captureUstpEligibility(userId);
        if (!ustpGate.eligibleAtStart) {
          throw new Error(
            ustpUnavailableMessage(ustpGate.reason) ||
              'Review your USTP COR in your profile before using the Handbook source.',
          );
        }
        const handbookQuery = activePrompt || context.trim().slice(0, 300);
        const handbookStatus = await localHandbookService.ensureReady();
        if (signal.aborted || isCancelled()) {
          throw new Error('Document generation was cancelled.');
        }

        if (handbookStatus.populated) {
          // The "Handbook source" cites the Student Handbook only, not the
          // campus knowledge pack that shares its index.
          const localCtx = await localHandbookService.buildOnlineContext(
            handbookQuery,
            {maxChars: 1200, collections: ['handbook']},
          );
          if (!localCtx || !localCtx.contextBlock) {
            throw new Error(
              localCtx?.academicYearRefusal ||
                'No verified USTP Handbook passages matched this topic. Try a more specific prompt or turn off the Handbook source.',
            );
          }
          citations = localCtx.sources
            .map(s => `${s.title}${s.page ? `, p. ${s.page}` : ''}`)
            .join('; ');
          const userExcerpt = context
            .trim()
            .slice(0, HANDBOOK_USER_EXCERPT_CHARS);
          context = userExcerpt
            ? `${userExcerpt}\n\n${localCtx.contextBlock}`
            : localCtx.contextBlock;
        } else {
          const handbookReply = await onlineChatSkill.sendChatMessage(
            [
              {
                role: 'user',
                content: `Find handbook passages relevant to this document request: ${handbookQuery}. Provide only supported facts and page references.`,
              },
            ],
            {useHandbook: true},
          );
          if (handbookReply.status !== 'success') {
            throw new Error(
              handbookReply.error ||
                'Could not reach the USTP Handbook right now. Please try again or turn off that source.',
            );
          }
          if (
            !handbookReply.data?.usedHandbook ||
            !handbookReply.data.sources.length
          ) {
            throw new Error(
              'No verified Handbook source was returned. Try a more specific prompt or turn off that source.',
            );
          }
          citations = handbookReply.data.sources
            .map(s => `${s.title}${s.page ? `, p. ${s.page}` : ''}`)
            .join('; ');
          const userExcerpt = context
            .trim()
            .slice(0, HANDBOOK_USER_EXCERPT_CHARS);
          const handbookExcerpt = handbookReply.data.reply
            .trim()
            .slice(0, 1200);
          context = userExcerpt
            ? `${userExcerpt}\n\n${handbookExcerpt}`
            : handbookExcerpt;
        }
        if (!ustpGate.stillAllowed()) {
          throw new Error(
            'Your USTP school eligibility changed. Check your profile and try again.',
          );
        }
      }

      if (signal.aborted || isCancelled()) {
        throw new Error('Document generation was cancelled.');
      }
      if (userStore.getCurrentUser()?.id !== userId) {
        throw new Error('This account is no longer active.');
      }

      job.setProgress(1, '');
      const prepared = buildSkillDocumentPrompt({
        prompt: activePrompt,
        format: chosenFormat,
        length: chosenLength,
        context,
        citations,
        styleNote: replyPreferenceInstruction(userId),
        previous: revising
          ? {
              title: revising.title,
              summary: revising.summary,
              prompt: revising.originalPrompt || revising.prompt,
            }
          : undefined,
      });

      const result = await documentSkill.generate({
        format: chosenFormat,
        prompt: prepared.prompt,
        signal,
      });
      if (signal.aborted || isCancelled()) {
        throw new Error('Document generation was cancelled.');
      }
      if (result.status !== 'success' || !result.data) {
        throw new Error(
          result.status === 'subscription_required'
            ? 'Creating files is not available for this cloud account right now.'
            : describeDocumentFailure(result),
        );
      }
      if (userStore.getCurrentUser()?.id !== userId) {
        throw new Error('This account is no longer active.');
      }

      job.setProgress(2);
      const doc = result.data;
      const directory = `${
        RNFS.DocumentDirectoryPath
      }/skills_documents/${encodeURIComponent(userId)}`;
      await RNFS.mkdir(directory);
      const id = generateId('doc');
      const path = `${directory}/${id}_${doc.fileName}`;
      await RNFS.writeFile(path, doc.contentBase64, 'base64');

      if (signal.aborted || isCancelled()) {
        await RNFS.unlink(path).catch(() => undefined);
        throw new Error('Document generation was cancelled.');
      }

      const saved: SkillFile = {
        id,
        attachment: {
          uri: `file://${path}`,
          fileName: doc.fileName,
          format: doc.format,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
        },
        title: doc.title,
        summary: doc.summary,
        createdAt: new Date().toISOString(),
        prompt: activePrompt,
        originalPrompt:
          revising?.originalPrompt || revising?.prompt || activePrompt,
        context: prepared.context,
        fullContext: context.slice(0, MAX_DOCGEN_SOURCE_CHARS),
        citations,
        truncated: prepared.truncated,
        contextChars: prepared.context.length,
        ...(condensedFrom ? {condensedFrom} : {}),
        length: chosenLength,
        version: revising ? (revising.version ?? 1) + 1 : 1,
        sourceLabel: initialSourceLabel,
      };

      let evicted: SkillFile[] = [];
      try {
        const recent = readSkillState<SkillFile[]>(userId, 'files', []);
        const combined = [saved, ...recent];
        const kept = combined.slice(0, MAX_RECENT_FILES);
        evicted = combined.slice(MAX_RECENT_FILES);
        writeSkillState(userId, 'files', kept);
      } catch (e) {
        await RNFS.unlink(path).catch(() => undefined);
        throw e;
      }
      for (const old of evicted) {
        const oldPath = old.attachment.uri.replace(/^file:\/\//, '');
        if (oldPath) {
          void RNFS.unlink(oldPath).catch(() => undefined);
        }
      }

      job.setProgress(3);
      return saved;
    });
  };

  const open = async (file: SkillFile) => {
    setNotice(null);
    try {
      const module = NativeModules.LafinaSkillsFiles as {
        openFile?: (path: string, mime: string) => Promise<boolean>;
      };
      if (!module?.openFile) {
        throw new Error(
          'Opening files is unavailable in this build. Use Share.',
        );
      }
      await module.openFile(file.attachment.uri, file.attachment.mimeType);
    } catch (e) {
      if (!mountedRef.current) return;
      const err = e as {code?: string; message?: string};
      const message = err.message || 'Could not open the file.';
      if (
        err.code === 'SKILL_FILE_MISSING' ||
        /no longer on this phone/i.test(message)
      ) {
        setMissingFileIds(prev => ({...prev, [file.id]: true}));
      }
      setNotice({
        text: message,
        danger: true,
      });
    }
  };

  const share = async (file: SkillFile) => {
    setNotice(null);
    const result = await shareAttachment(file.attachment);
    if (!mountedRef.current) return;
    if (result === 'shared' || result === 'cancelled') return;
    if (result === 'Unavailable') {
      setMissingFileIds(prev => ({...prev, [file.id]: true}));
      setNotice({
        text: 'This file is no longer on this phone. Tap Regenerate to recreate it.',
        danger: true,
      });
      return;
    }
    setNotice({
      text: 'Could not share the file. Please try again.',
      danger: true,
    });
  };

  const performDelete = async (file: SkillFile) => {
    setNotice(null);
    const localPath = file.attachment.uri.replace(/^file:\/\//, '');
    try {
      if (localPath && (await RNFS.exists(localPath))) {
        await RNFS.unlink(localPath);
      }
      const latest = readSkillState<SkillFile[]>(userId, 'files', []);
      const next = latest.filter(f => f.id !== file.id);
      writeSkillState(userId, 'files', next);
      if (!mountedRef.current) return;
      setFiles(next);
      setMissingFileIds(prev => {
        if (!prev[file.id]) return prev;
        const copy = {...prev};
        delete copy[file.id];
        return copy;
      });
      if (selected?.id === file.id) {
        setSelected(null);
        setReviseOpen(false);
        setRevisionPrompt('');
      }
    } catch (e) {
      if (mountedRef.current) {
        setNotice({
          text: (e as Error).message || 'Could not remove the file.',
          danger: true,
        });
      }
    }
  };

  const confirmDelete = (file: SkillFile) => {
    Alert.alert(
      'Delete file?',
      `Remove "${file.title}" from this phone? This cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void performDelete(file);
          },
        },
      ],
    );
  };

  const copySummary = async (file: SkillFile) => {
    setNotice(null);
    const clipboard = NativeModules.LafinaSkillsFiles as {
      copy?: (text: string) => Promise<boolean> | void;
    };
    if (!clipboard?.copy) {
      setNotice({text: 'Copy is unavailable in this build.', danger: true});
      return;
    }
    try {
      await clipboard.copy(`${file.title}\n\n${file.summary}`);
      if (mountedRef.current) {
        setNotice({text: 'Summary copied to clipboard.'});
      }
    } catch (e) {
      if (mountedRef.current) {
        setNotice({
          text: (e as Error).message || 'Could not copy to clipboard.',
          danger: true,
        });
      }
    }
  };

  const saveSummaryToNotes = (file: SkillFile) => {
    if (savedSummaryNoteId === file.id) return;
    setNotice(null);
    try {
      const citationBlock = file.citations
        ? `\n\nSources: ${file.citations}`
        : '';
      notesEditStore.create({
        id: generateId('note'),
        userId,
        title: file.title,
        body: `${file.summary}${citationBlock}`,
        category: 'Learning',
        isPinned: false,
        tags: ['Create with LAFINA', file.attachment.format.toUpperCase()],
        isVoiceTranscribed: false,
      });
      setSavedSummaryNoteId(file.id);
      setNotice({text: 'Summary saved to Notes.'});
    } catch (e) {
      setNotice({
        text: (e as Error).message || 'Could not save summary to Notes.',
        danger: true,
      });
    }
  };

  const prefillFromFile = (
    file: SkillFile,
    targetFormat: DocumentFormat = asDocumentFormat(file.attachment.format),
  ) => {
    setFormat(targetFormat);
    setPrompt(file.originalPrompt || file.prompt || '');
    setLength(file.length ?? 'Standard');
    const savedContext = file.fullContext || file.context || '';
    if (savedContext.trim()) {
      setSource({
        text: savedContext,
        label: file.sourceLabel || file.title,
        kind: 'paste',
      });
    } else {
      setSource({text: '', label: ''});
    }
    setSelected(null);
    setReviseOpen(false);
    setRevisionPrompt('');
    setNotice(null);
    clearError();
  };

  const selectFileForPreview = (file: SkillFile) => {
    setSelected(file);
    setReviseOpen(false);
    setRevisionPrompt('');
    setRevisionLength(file.length ?? 'Standard');
    setSavedSummaryNoteId(null);
    clearError();
    const sourceUse = describeSourceUse(file);
    setNotice(sourceUse ? {text: sourceUse} : null);
  };

  const getTilePalette = (fmt: DocumentFormat) => {
    switch (fmt) {
      case 'pptx':
        return {tile: p.peach, ink: p.peachInk};
      case 'docx':
        return {tile: p.blueSoft, ink: p.accent};
      case 'pdf':
        return {tile: p.dangerSoft, ink: p.danger};
      case 'xlsx':
        return {tile: p.mint, ink: p.mintInk};
    }
  };

  if (job.busy) {
    const activeMeta = formatMetaFor(
      selected ? asDocumentFormat(selected.attachment.format) : format,
    );
    const activeLengthLabel =
      LENGTH_LABELS[activeMeta.format][
        LENGTH_VALUES.indexOf(selected ? revisionLength : length)
      ];
    return (
      <View style={styles.workingWrap}>
        <View style={ui.center}>
          <SkillHalo>
            <View style={[styles.workingIcon, {backgroundColor: p.accent}]}>
              <Sparkles size={30} color={p.onAccent} />
            </View>
          </SkillHalo>
          <View style={styles.workingTitleWrap}>
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.workingTitle, {color: p.text}]}
            >
              {stage >= 2 ? 'Almost there…' : 'Working on it…'}
            </Text>
          </View>
          <SkillText muted center>
            Building {activeMeta.label} ({activeMeta.ext}) · {activeLengthLabel}
            {elapsedSec > 0 ? ` · ${elapsedSec}s` : ''}
          </SkillText>
          <SkillText muted center size={12}>
            You can leave this page. The file will appear here when ready.
          </SkillText>
        </View>
        <SkillCard>
          {WORKING_STAGES.map((label, i) => (
            <View key={label} style={[ui.row, {minHeight: 50}]}>
              {i < stage ? (
                <SkillCheck />
              ) : i === stage ? (
                <ActivityIndicator size="small" color={p.accent} />
              ) : (
                <View
                  style={[styles.pendingDot, {backgroundColor: p.border}]}
                />
              )}
              <SkillText muted={i > stage} strong={i === stage}>
                {i === stage && job.statusText ? job.statusText : label}
              </SkillText>
            </View>
          ))}
        </SkillCard>
        <SkillButton
          secondary
          testID="docgen-cancel-btn"
          label="Cancel generation"
          onPress={job.cancel}
        />
      </View>
    );
  }

  const activeFormatMeta = formatMetaFor(format);

  const renderDictateButton = (target: 'create' | 'revise') => {
    const isThisTarget = dictationTarget === target;
    const isListening = isThisTarget && dictationState === 'listening';
    const isTranscribing = isThisTarget && dictationState === 'transcribing';
    const disabled =
      (dictationState !== 'idle' && !isThisTarget) || isTranscribing;
    return (
      <TouchableOpacity
        testID={
          target === 'create'
            ? 'docgen-dictate-btn'
            : 'docgen-revise-dictate-btn'
        }
        accessibilityRole="button"
        accessibilityLabel={
          isListening
            ? 'Stop dictation'
            : isTranscribing
            ? 'Transcribing speech'
            : 'Dictate prompt'
        }
        disabled={disabled}
        onPress={() => {
          void dictate(target);
        }}
        style={[
          styles.micPill,
          {
            backgroundColor: isListening ? p.dangerSoft : p.surface,
            borderColor: isListening ? p.danger : p.border,
          },
        ]}
      >
        {isTranscribing ? (
          <ActivityIndicator size="small" color={p.accent} />
        ) : isListening ? (
          <Square size={14} color={p.danger} />
        ) : (
          <Mic size={15} color={p.accent} />
        )}
        <Text
          style={[styles.micLabel, {color: isListening ? p.danger : p.accent}]}
        >
          {isTranscribing
            ? 'Transcribing…'
            : isListening
            ? 'Listening…'
            : 'Dictate'}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderFeedback = () => (
    <>
      {!!job.error && (
        <SkillCard
          style={{backgroundColor: p.dangerSoft, borderColor: p.danger}}
        >
          <View style={ui.between}>
            <View style={ui.fill}>
              <SkillText danger>{job.error}</SkillText>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
              onPress={clearError}
              style={ui.icon}
            >
              <SkillText strong danger size={12}>
                Dismiss
              </SkillText>
            </TouchableOpacity>
          </View>
        </SkillCard>
      )}
      {!!notice && (
        <SkillCard
          style={
            notice.danger
              ? {backgroundColor: p.dangerSoft, borderColor: p.danger}
              : undefined
          }
        >
          <SkillText danger={notice.danger} muted={!notice.danger} size={13}>
            {notice.text}
          </SkillText>
        </SkillCard>
      )}
    </>
  );

  const renderReadinessBanner = () => {
    if (isGuest || !hasCloudSession) {
      const actionHandler = isGuest
        ? onNavigateToRegister ?? onOpenProfile
        : onOpenProfile ?? onNavigateToRegister;
      return (
        <SkillCard testID="docgen-readiness-auth">
          <SkillText strong size={14}>
            Cloud sign-in required for new files
          </SkillText>
          <SkillText muted size={13}>
            Sign in to a cloud account to generate new slides, docs, PDFs, or
            sheets. Your saved files below still open offline.
          </SkillText>
          {actionHandler && (
            <SkillButton
              secondary
              label={isGuest ? 'Sign in / Create account' : 'Open Profile'}
              onPress={actionHandler}
            />
          )}
        </SkillCard>
      );
    }
    if (!onlineModeEnabled) {
      return (
        <SkillCard testID="docgen-readiness-online-mode">
          <SkillText strong size={14}>
            Online Mode is off
          </SkillText>
          <SkillText muted size={13}>
            Creating files uses LAFINA&apos;s cloud document service. Your saved
            files below stay available offline.
          </SkillText>
          <SkillButton
            secondary
            disabled={enablingOnline}
            label={enablingOnline ? 'Turning on…' : 'Turn on Online Mode'}
            onPress={() => {
              void enableOnlineMode();
            }}
          />
        </SkillCard>
      );
    }
    if (!connected) {
      return (
        <SkillCard testID="docgen-readiness-offline">
          <SkillText strong size={14}>
            You&apos;re offline
          </SkillText>
          <SkillText muted size={13}>
            Connect to the internet to create new files. You can still open,
            share, and delete saved files below.
          </SkillText>
        </SkillCard>
      );
    }
    return null;
  };

  const selectedFormat = selected
    ? asDocumentFormat(selected.attachment.format)
    : null;
  const selectedMeta = selectedFormat ? formatMetaFor(selectedFormat) : null;
  const selectedTile = selectedFormat ? getTilePalette(selectedFormat) : null;
  const selectedMissing = selected
    ? Boolean(missingFileIds[selected.id])
    : false;
  const quickAlternateFormats = selected
    ? FORMAT_CARDS.filter(c => c.format !== selected.attachment.format).slice(
        0,
        2,
      )
    : [];

  const isCreateEmpty = !prompt.trim() && !source.text.trim();

  return (
    <>
      {selected && selectedMeta && selectedTile ? (
        <>
          <View style={[ui.row, styles.readyHeader]}>
            <SkillCheck />
            <View style={ui.fill}>
              <SkillText strong size={16}>
                {selectedMeta.readyTitle}
              </SkillText>
            </View>
            {typeof selected.version === 'number' && selected.version > 1 && (
              <View style={[styles.versionPill, {backgroundColor: p.surface}]}>
                <SkillText strong size={12}>
                  v{selected.version}
                </SkillText>
              </View>
            )}
          </View>

          <SkillCard>
            <View style={ui.row}>
              <View
                style={[styles.badgeTile, {backgroundColor: selectedTile.tile}]}
              >
                <Text style={[styles.badgeText, {color: selectedTile.ink}]}>
                  {selectedMeta.badge}
                </Text>
              </View>
              <View style={ui.fill}>
                <SkillText strong size={18}>
                  {selected.title}
                </SkillText>
                <SkillText muted size={12}>
                  {selected.attachment.fileName}
                </SkillText>
              </View>
            </View>

            <View style={[styles.previewBox, {backgroundColor: p.surface}]}>
              <ChatReplyText
                content={selected.summary}
                format="markdown"
                textStyle={{
                  color: p.text,
                  fontFamily: SkillFonts.body,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              />
              {!!selected.citations && (
                <View style={styles.citationList}>
                  {selected.citations.split(/;\s*/).map(cite => (
                    <View
                      key={cite}
                      style={[
                        styles.citationPill,
                        {backgroundColor: p.card, borderColor: p.border},
                      ]}
                    >
                      <BookOpen size={12} color={p.accent} />
                      <SkillText size={12}>{cite}</SkillText>
                    </View>
                  ))}
                </View>
              )}
              <SkillText muted size={12}>
                {!SKILLS_CAPABILITIES.embeddedOfficePreview
                  ? 'Summary preview. Open to view every page or slide.'
                  : 'Document preview'}
              </SkillText>
            </View>

            <SkillText muted size={12}>
              {[
                formatFileSize(selected.attachment.sizeBytes ?? 0),
                formatTimestamp(selected.createdAt),
                'Saved on this phone',
              ]
                .filter(Boolean)
                .join(' · ')}
            </SkillText>
          </SkillCard>

          {selectedMissing && (
            <SkillCard
              testID="docgen-missing-file-card"
              style={{backgroundColor: p.dangerSoft, borderColor: p.danger}}
            >
              <SkillText strong danger size={14}>
                File missing on this phone
              </SkillText>
              <SkillText danger size={13}>
                This saved file could not be found in app storage. Regenerate it
                from its original instructions or remove the entry.
              </SkillText>
              <View style={ui.row}>
                <View style={ui.fill}>
                  <SkillButton
                    label="Regenerate"
                    onPress={() => prefillFromFile(selected)}
                  />
                </View>
                <View style={ui.fill}>
                  <SkillButton
                    secondary
                    label="Remove entry"
                    onPress={() => {
                      void performDelete(selected);
                    }}
                  />
                </View>
              </View>
            </SkillCard>
          )}

          {renderFeedback()}

          <View style={ui.row}>
            <View style={ui.fill}>
              <SkillButton
                label="Open"
                onPress={() => {
                  void open(selected);
                }}
              />
            </View>
            <View style={ui.fill}>
              <SkillButton
                secondary
                label="Share"
                onPress={() => {
                  void share(selected);
                }}
              />
            </View>
          </View>

          <View style={styles.utilityRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Copy summary"
              onPress={() => {
                void copySummary(selected);
              }}
              style={[
                styles.utilityChip,
                {backgroundColor: p.card, borderColor: p.border},
              ]}
            >
              <Copy size={14} color={p.accent} />
              <SkillText strong size={13}>
                Copy summary
              </SkillText>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Save summary to Notes"
              disabled={savedSummaryNoteId === selected.id}
              onPress={() => saveSummaryToNotes(selected)}
              style={[
                styles.utilityChip,
                {backgroundColor: p.card, borderColor: p.border},
              ]}
            >
              <BookOpen size={14} color={p.accent} />
              <SkillText strong size={13}>
                {savedSummaryNoteId === selected.id
                  ? 'Saved to Notes'
                  : 'Save to Notes'}
              </SkillText>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Delete ${selected.title}`}
              onPress={() => confirmDelete(selected)}
              style={[
                styles.utilityChip,
                {backgroundColor: p.card, borderColor: p.border},
              ]}
            >
              <Trash2 size={14} color={p.danger} />
              <SkillText strong danger size={13}>
                Delete
              </SkillText>
            </TouchableOpacity>
          </View>

          {quickAlternateFormats.length > 0 && (
            <View style={styles.alsoMakeRow}>
              <SkillText muted size={12}>
                Also make as:
              </SkillText>
              {quickAlternateFormats.map(alt => (
                <TouchableOpacity
                  key={alt.format}
                  accessibilityRole="button"
                  accessibilityLabel={`Also make as ${alt.label}`}
                  onPress={() => prefillFromFile(selected, alt.format)}
                  style={[
                    styles.altChip,
                    {backgroundColor: p.surface, borderColor: p.border},
                  ]}
                >
                  <SkillText strong size={12}>
                    {alt.label} ({alt.ext})
                  </SkillText>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!reviseOpen ? (
            <SkillButton
              secondary
              testID="docgen-open-revise-btn"
              label="Ask for changes"
              onPress={() => {
                setReviseOpen(true);
                clearError();
              }}
            />
          ) : (
            <SkillCard>
              <View style={ui.between}>
                <SkillText strong size={15}>
                  Ask for changes
                </SkillText>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Close revision panel"
                  onPress={() => setReviseOpen(false)}
                  style={ui.icon}
                >
                  <SkillText muted size={12}>
                    Close
                  </SkillText>
                </TouchableOpacity>
              </View>
              <SkillText muted size={12}>
                Creates v{(selected.version ?? 1) + 1} ({selectedMeta.ext}) —
                your original file stays in Recent files.
              </SkillText>
              <View
                style={[
                  styles.composerCard,
                  {backgroundColor: p.surface, borderColor: p.border},
                ]}
              >
                <TextInput
                  accessibilityLabel="Ask for changes"
                  placeholder="e.g. Add a summary slide and shorten the bullet points"
                  placeholderTextColor={p.muted}
                  value={revisionPrompt}
                  onChangeText={next => {
                    setRevisionPrompt(next);
                    clearError();
                  }}
                  multiline
                  maxLength={MAX_PROMPT_LENGTH}
                  style={[styles.composerInput, {color: p.text}]}
                />
                <View style={styles.composerFooter}>
                  <SkillText muted size={12}>
                    {revisionPrompt.length} / {MAX_PROMPT_LENGTH}
                  </SkillText>
                  {renderDictateButton('revise')}
                </View>
              </View>
              <LengthChoices
                format={asDocumentFormat(selected.attachment.format)}
                value={revisionLength}
                onChange={setRevisionLength}
              />
              <SkillButton
                label="Generate revision"
                disabled={!revisionPrompt.trim()}
                onPress={() => generate(selected)}
              />
            </SkillCard>
          )}

          <SkillButton
            secondary
            label="Make something else"
            onPress={() => {
              stopActiveDictation();
              setSelected(null);
              setReviseOpen(false);
              setRevisionPrompt('');
              setNotice(null);
              clearError();
            }}
          />
        </>
      ) : (
        <>
          {renderReadinessBanner()}

          <View style={ui.field}>
            <SkillText strong size={13}>
              What are you making?
            </SkillText>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Format"
              style={styles.formatGrid}
            >
              {FORMAT_CARDS.map(card => {
                const checked = format === card.format;
                const palette = getTilePalette(card.format);
                const Icon = card.icon;
                return (
                  <TouchableOpacity
                    key={card.format}
                    testID={`docgen-format-${card.format}`}
                    accessibilityRole="radio"
                    accessibilityLabel={`${card.label} (${card.ext})`}
                    accessibilityState={{checked}}
                    onPress={() => setFormat(card.format)}
                    style={[
                      styles.formatCard,
                      {
                        backgroundColor: p.card,
                        borderColor: checked ? p.accent : p.border,
                        borderWidth: checked ? 2 : 1,
                      },
                    ]}
                  >
                    <View style={ui.between}>
                      <View
                        style={[
                          styles.formatIconTile,
                          {backgroundColor: palette.tile},
                        ]}
                      >
                        <Icon size={20} color={palette.ink} />
                      </View>
                      {checked && <SkillCheck />}
                    </View>
                    <View style={styles.formatTextWrap}>
                      <SkillText strong size={15}>
                        {card.label}
                      </SkillText>
                      <SkillText muted size={12}>
                        {card.ext}
                      </SkillText>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={ui.field}>
            <SkillText strong size={13}>
              Describe it
            </SkillText>
            <View
              style={[
                styles.composerCard,
                {backgroundColor: p.card, borderColor: p.border},
              ]}
            >
              <TextInput
                testID="docgen-prompt-input"
                accessibilityLabel="What would you like to make?"
                placeholder={activeFormatMeta.placeholder}
                placeholderTextColor={p.muted}
                multiline
                maxLength={MAX_PROMPT_LENGTH}
                value={prompt}
                onChangeText={setPrompt}
                style={[styles.composerInput, {color: p.text}]}
              />
              <View style={styles.composerFooter}>
                <SkillText muted size={12}>
                  {prompt.length > 0
                    ? `${prompt.length} / ${MAX_PROMPT_LENGTH}`
                    : 'Tip: mention the subject and who it’s for'}
                </SkillText>
                {renderDictateButton('create')}
              </View>
            </View>
            {!prompt.trim() && (
              <View style={styles.starterRow}>
                {activeFormatMeta.starters.map(starter => (
                  <TouchableOpacity
                    key={starter}
                    accessibilityRole="button"
                    accessibilityLabel={`Use example: ${starter}`}
                    onPress={() => setPrompt(starter)}
                    style={[
                      styles.starterChip,
                      {backgroundColor: p.surface, borderColor: p.border},
                    ]}
                  >
                    <SkillText size={12}>{starter}</SkillText>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <SourcePicker
            userId={userId}
            source={source}
            onChange={setSource}
            initialMaterialId={initialMaterialId}
            maxEffectiveChars={MAX_DOCGEN_SOURCE_CHARS}
            longSourceNote="Long source: LAFINA condenses it first so the whole source is used. This takes a little longer."
            hideOfflineNotice
            compactList
          />

          {ustp.eligible ? (
            <Choices
              label="Handbook source"
              values={['Off', 'USTP Handbook'] as const}
              value={handbook}
              onChange={setHandbook}
            />
          ) : ustp.reason !== 'not_ustp' ? (
            <SkillCard testID="docgen-handbook-locked">
              <View style={ui.between}>
                <View style={ui.fill}>
                  <SkillText strong size={13}>
                    USTP Student Handbook source
                  </SkillText>
                  <SkillText muted size={12}>
                    {ustpUnavailableMessage(ustp.reason)}
                  </SkillText>
                </View>
                {onOpenProfile && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Open Profile to review COR"
                    onPress={onOpenProfile}
                    style={ui.icon}
                  >
                    <SkillText strong size={12}>
                      Profile
                    </SkillText>
                  </TouchableOpacity>
                )}
              </View>
            </SkillCard>
          ) : null}

          <LengthChoices format={format} value={length} onChange={setLength} />

          <SkillText muted size={12}>
            The document service uses up to 2,500 source characters per request.
            Split longer material into smaller files.
          </SkillText>

          {renderFeedback()}

          <SkillButton
            testID="docgen-generate-btn"
            label={activeFormatMeta.ctaLabel}
            disabled={isCreateEmpty || !canGenerateOnline}
            onPress={() => generate(null)}
          />
        </>
      )}

      <View style={ui.section}>
        <SkillText strong size={17}>
          Recent files
        </SkillText>
        {files.length >= FILES_NEARLY_FULL && (
          <SkillText muted size={12}>
            {`${files.length} of ${MAX_RECENT_FILES} files saved. When the list is full, LAFINA asks before deleting the oldest.`}
          </SkillText>
        )}
      </View>
      {!files.length && (
        <SkillText muted>Your generated files will appear here.</SkillText>
      )}
      {files.map(file => {
        const fileFormat = asDocumentFormat(file.attachment.format);
        const meta = formatMetaFor(fileFormat);
        const palette = getTilePalette(fileFormat);
        const isCurrent = selected?.id === file.id;
        const sizeLabel = formatFileSize(file.attachment.sizeBytes ?? 0);
        const subParts = [
          formatTimestamp(file.createdAt),
          sizeLabel,
          typeof file.version === 'number' && file.version > 1
            ? `v${file.version}`
            : '',
          missingFileIds[file.id] ? 'Missing' : '',
        ].filter(Boolean);
        return (
          <SkillCard
            key={file.id}
            style={{
              borderColor: isCurrent ? p.accent : p.border,
              borderWidth: isCurrent ? 2 : 1,
            }}
          >
            <View style={ui.row}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Preview ${file.title}`}
                onPress={() => selectFileForPreview(file)}
                style={[ui.fill, ui.row]}
              >
                <View
                  style={[styles.badgeTile, {backgroundColor: palette.tile}]}
                >
                  <Text style={[styles.badgeText, {color: palette.ink}]}>
                    {meta.badge}
                  </Text>
                </View>
                <View style={ui.fill}>
                  <Text
                    numberOfLines={1}
                    style={[styles.recentTitle, {color: p.text}]}
                  >
                    {file.title}
                  </Text>
                  <SkillText muted size={12}>
                    {subParts.join(' · ')}
                  </SkillText>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Share ${file.title}`}
                onPress={() => {
                  void share(file);
                }}
                style={[styles.recentAction, {backgroundColor: p.surface}]}
              >
                <Share2 size={17} color={p.text} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Delete ${file.title}`}
                onPress={() => confirmDelete(file)}
                style={[styles.recentAction, {backgroundColor: p.dangerSoft}]}
              >
                <Trash2 size={17} color={p.danger} />
              </TouchableOpacity>
            </View>
          </SkillCard>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  workingWrap: {paddingTop: 32, gap: 18},
  workingIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workingTitleWrap: {marginTop: 18},
  workingTitle: {
    fontFamily: SkillFonts.semibold,
    fontSize: 20,
    textAlign: 'center',
  },
  pendingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginHorizontal: 6,
  },
  formatGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  formatCard: {
    width: '48%',
    flexGrow: 1,
    minHeight: 104,
    borderRadius: 20,
    padding: 14,
    justifyContent: 'space-between',
    gap: 10,
  },
  formatIconTile: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatTextWrap: {gap: 2},
  composerCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
  },
  composerInput: {
    minHeight: 96,
    textAlignVertical: 'top',
    fontFamily: SkillFonts.body,
    fontSize: 15,
    lineHeight: 22,
    padding: 0,
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  micPill: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  micLabel: {
    fontFamily: SkillFonts.semibold,
    fontSize: 12,
  },
  starterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  starterChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  readyHeader: {marginBottom: 4},
  versionPill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeText: {
    fontFamily: SkillFonts.bold,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  previewBox: {
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  citationList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  citationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  utilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 4,
  },
  utilityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  alsoMakeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  altChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  recentTitle: {
    fontFamily: SkillFonts.semibold,
    fontSize: 14,
  },
  recentAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
