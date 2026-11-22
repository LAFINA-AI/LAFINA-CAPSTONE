import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  FileText,
  FolderOpen,
  Info,
  Mic,
  Pencil,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react-native';
import type {MaterialExtractProgress} from '../../../materials';
import {
  askUserMaterials,
  getMaterialOnlineStatus,
  ingestMaterialForUser,
  MaterialQaAbortedError,
} from '../../../skills/materialQa';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {
  cancelOfflineSpeechCapture,
  isMicrophoneBusyError,
  startOfflineSpeechCapture,
  stopOfflineSpeechCapture,
  type OfflineSpeechCaptureHandle,
} from '../../../ai/native/speechCapture';
import {
  ensureMicrophonePermission,
  isSTTAvailable,
} from '../../../ai/stt/sttService';
import {
  materialStore,
  notesEditStore,
  type MaterialCitation,
  type MaterialQaMessage,
  type UserMaterialRecord,
} from '../../../storage';
import {generateId} from '../../../utils';
import {ChatReplyText} from '../../components/chat/ChatReplyText';
import {useScreenActive} from '../../navigation/RetainedTab';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {SkillButton, SkillCard, SkillInput, SkillText, ui} from './SkillUI';

function formatMaterialUnits(mat: UserMaterialRecord): string {
  const unit =
    mat.fileKind === 'pptx'
      ? 'slide'
      : ['txt', 'md', 'csv'].includes(mat.fileKind)
      ? 'part'
      : 'page';
  if (mat.pageCount > mat.pagesRead) {
    return `${mat.pagesRead} of ${mat.pageCount} ${unit}s`;
  }
  return `${mat.pagesRead} ${unit}${mat.pagesRead === 1 ? '' : 's'}`;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMessageTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  try {
    return new Date(ms).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function resolveInitialScope(
  userId: string,
  list: UserMaterialRecord[],
  preferredId?: string,
): string {
  if (list.length === 0) return 'all';
  if (preferredId && list.some(m => m.id === preferredId)) {
    return preferredId;
  }
  if (list.length === 1) return list[0].id;
  const saved = readSkillState<string>(userId, 'lessonQa.scope', 'all');
  if (saved === 'all' || list.some(m => m.id === saved)) {
    return saved;
  }
  return 'all';
}

export function LessonQaSkill({
  userId,
  initialMaterialId,
  onRefresh,
  onBack,
  onOpenSkill,
  registerBackHandler,
}: {
  userId: string;
  initialMaterialId?: string;
  onRefresh?: () => void;
  onBack: () => void;
  onOpenSkill?: (
    route: 'summarizer' | 'flashcards' | 'quiz' | 'docgen',
    materialId?: string,
  ) => void;
  registerBackHandler?: (handler: (() => boolean) | null) => void;
}) {
  const p = useSkillsPalette();
  const insets = useSafeAreaInsets();
  const screenActive = useScreenActive();

  const initialMaterials = useMemo(
    () => materialStore.listMaterials(userId),
    [userId],
  );
  const [materials, setMaterials] =
    useState<UserMaterialRecord[]>(initialMaterials);
  const [selectedId, setSelectedId] = useState<string>(() =>
    resolveInitialScope(userId, initialMaterials, initialMaterialId),
  );
  const [viewMode, setViewMode] = useState<'library' | 'qa'>(() =>
    initialMaterials.length > 0 ? 'qa' : 'library',
  );
  const [msgCounts, setMsgCounts] = useState<Record<string, number>>(() =>
    materialStore.getMessageCountsByScope(userId),
  );
  const [messages, setMessages] = useState<MaterialQaMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askStage, setAskStage] = useState('Searching your materials…');
  const [streamingReply, setStreamingReply] = useState('');
  const [uploading, setUploading] = useState(false);
  const [cancellingUpload, setCancellingUpload] = useState(false);
  const [progress, setProgress] = useState<MaterialExtractProgress | null>(
    null,
  );
  const [notice, setNotice] = useState<{text: string; danger?: boolean} | null>(
    null,
  );
  const [previewCitation, setPreviewCitation] =
    useState<MaterialCitation | null>(null);
  const [renaming, setRenaming] = useState<UserMaterialRecord | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [connected, setConnected] = useState(false);
  const [statusTick, setStatusTick] = useState(0);
  const [showModeInfo, setShowModeInfo] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [expandedOutlines, setExpandedOutlines] = useState<
    Record<string, boolean>
  >({});
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [savedMsgIds, setSavedMsgIds] = useState<Record<string, boolean>>({});
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [sttReady, setSttReady] = useState(false);
  const [listening, setListening] = useState(false);

  const mountedRef = useRef(true);
  const cancelUploadRef = useRef(false);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeCaptureRef = useRef<OfflineSpeechCaptureHandle | null>(null);
  const isNearBottomRef = useRef(true);
  const listRef = useRef<FlatList<MaterialQaMessage>>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelUploadRef.current = true;
      abortControllerRef.current?.abort();
      if (activeCaptureRef.current) {
        void cancelOfflineSpeechCapture(activeCaptureRef.current.captureId);
        activeCaptureRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void NetInfo.fetch()
      .then(state => {
        if (alive) {
          setConnected(
            state.isConnected !== false && state.isInternetReachable !== false,
          );
        }
      })
      .catch(() => {});
    const unsub = NetInfo.addEventListener(state => {
      setConnected(
        state.isConnected !== false && state.isInternetReachable !== false,
      );
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void isSTTAvailable().then(ok => {
      if (alive) setSttReady(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (screenActive) {
      setStatusTick(t => t + 1);
      setMsgCounts(materialStore.getMessageCountsByScope(userId));
    } else if (activeCaptureRef.current) {
      void cancelOfflineSpeechCapture(activeCaptureRef.current.captureId);
      activeCaptureRef.current = null;
      setListening(false);
    }
  }, [screenActive, userId]);

  useEffect(() => {
    if (!notice || notice.danger) return;
    const timer = setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!copiedMsgId) return;
    const timer = setTimeout(() => {
      if (mountedRef.current) setCopiedMsgId(null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [copiedMsgId]);

  const prevUserIdRef = useRef(userId);
  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    const next = materialStore.listMaterials(userId);
    setMaterials(next);
    setMsgCounts(materialStore.getMessageCountsByScope(userId));
    setSelectedId(resolveInitialScope(userId, next, initialMaterialId));
    setViewMode(next.length > 0 ? 'qa' : 'library');
  }, [initialMaterialId, userId]);

  // Apply explicit initialMaterialId from Hub search / cross-skill jumps
  useEffect(() => {
    if (!initialMaterialId) return;
    const current = materialStore.listMaterials(userId);
    setMaterials(current);
    if (current.some(m => m.id === initialMaterialId)) {
      setSelectedId(initialMaterialId);
      setViewMode('qa');
      try {
        writeSkillState(userId, 'lessonQa.scope', initialMaterialId);
      } catch {
        // Ignore persistence errors for transient session changes
      }
    }
  }, [initialMaterialId, userId]);

  const effectiveSelectedId =
    materials.length === 1
      ? materials[0].id
      : selectedId !== 'all' && !materials.some(m => m.id === selectedId)
      ? 'all'
      : selectedId;

  const activeMaterialIds =
    effectiveSelectedId === 'all' ||
    !materials.some(m => m.id === effectiveSelectedId)
      ? null
      : [effectiveSelectedId];
  const scopeKey = activeMaterialIds ? activeMaterialIds[0] : 'all';
  const activeScopeRef = useRef(scopeKey);
  activeScopeRef.current = scopeKey;

  const activeMaterial =
    activeMaterialIds?.length === 1
      ? materials.find(m => m.id === activeMaterialIds[0]) ?? null
      : null;

  const persistScope = useCallback(
    (nextScope: string) => {
      try {
        writeSkillState(userId, 'lessonQa.scope', nextScope);
      } catch {
        // Ignore if session changed concurrently
      }
    },
    [userId],
  );

  const selectScope = useCallback(
    (nextScope: string) => {
      if (nextScope === effectiveSelectedId) return;
      if (asking) {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        requestIdRef.current += 1;
        setAsking(false);
        setStreamingReply('');
      }
      setSelectedId(nextScope);
      persistScope(nextScope);
      isNearBottomRef.current = true;
    },
    [asking, effectiveSelectedId, persistScope],
  );

  const refreshLibrary = useCallback(
    (preferScopeId?: string) => {
      const next = materialStore.listMaterials(userId);
      setMaterials(next);
      setMsgCounts(materialStore.getMessageCountsByScope(userId));
      let nextScope = selectedId;
      if (next.length === 0) {
        nextScope = 'all';
        setViewMode('library');
      } else if (preferScopeId && next.some(m => m.id === preferScopeId)) {
        nextScope = preferScopeId;
      } else if (next.length === 1) {
        nextScope = next[0].id;
      } else if (selectedId !== 'all' && !next.some(m => m.id === selectedId)) {
        nextScope = 'all';
      }
      setSelectedId(nextScope);
      persistScope(nextScope);
    },
    [persistScope, selectedId, userId],
  );

  useEffect(() => {
    setMessages(materialStore.listMessages(userId, scopeKey, 80));
    isNearBottomRef.current = true;
  }, [userId, scopeKey, materials.length]);

  const onlineStatus = useMemo(() => {
    void statusTick;
    return getMaterialOnlineStatus(userId, connected);
  }, [connected, statusTick, userId]);

  const starterPrompts = useMemo(() => {
    const prompts = [
      'What are the main topics covered?',
      'Explain the key terms',
    ];
    if (activeMaterial?.outline?.length) {
      prompts.push(`Explain "${activeMaterial.outline[0].heading}"`);
    } else if (activeMaterial?.fileKind === 'pptx') {
      prompts.push('Summarize Slide 1');
    } else if (
      activeMaterial &&
      ['txt', 'md', 'csv'].includes(activeMaterial.fileKind)
    ) {
      prompts.push(
        activeMaterial.pagesRead > 1
          ? 'Summarize part 1'
          : 'Summarize the opening section',
      );
    } else {
      prompts.push('Summarize page 1');
    }
    return prompts;
  }, [activeMaterial]);

  const filteredMaterials = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      m =>
        m.title.toLowerCase().includes(q) ||
        m.fileName.toLowerCase().includes(q) ||
        m.fileKind.toLowerCase().includes(q),
    );
  }, [libraryQuery, materials]);

  const neighborCitations = useMemo(() => {
    if (!previewCitation?.seq) {
      return {
        prev: null as MaterialCitation | null,
        next: null as MaterialCitation | null,
      };
    }
    const seq = previewCitation.seq;
    const neighbors = materialStore.getNeighborChunks(
      userId,
      previewCitation.materialId,
      [seq - 1, seq + 1],
    );
    const toCitation = (hit: (typeof neighbors)[number]): MaterialCitation => ({
      materialId: hit.materialId,
      title: hit.materialTitle,
      heading: hit.heading,
      pageLabel: hit.pageLabel,
      snippet: hit.content.replace(/\s+/g, ' ').trim().slice(0, 240),
      content: hit.content,
      seq: hit.seq,
    });
    const prevHit = neighbors.find(n => n.seq === seq - 1);
    const nextHit = neighbors.find(n => n.seq === seq + 1);
    return {
      prev: prevHit ? toCitation(prevHit) : null,
      next: nextHit ? toCitation(nextHit) : null,
    };
  }, [previewCitation, userId]);

  const confirmLeaveDuringUpload = useCallback(() => {
    Alert.alert(
      'Cancel file upload?',
      'Your file is still being indexed. Leave Lesson Q&A and cancel it?',
      [
        {text: 'Keep indexing', style: 'cancel'},
        {
          text: 'Cancel upload',
          style: 'destructive',
          onPress: () => {
            cancelUploadRef.current = true;
            setCancellingUpload(true);
            onBack();
          },
        },
      ],
    );
  }, [onBack]);

  useEffect(() => {
    if (!registerBackHandler) return;
    registerBackHandler(() => {
      if (previewCitation) {
        setPreviewCitation(null);
        return true;
      }
      if (renaming) {
        setRenaming(null);
        return true;
      }
      if (uploading) {
        confirmLeaveDuringUpload();
        return true;
      }
      if (viewMode === 'library' && materials.length > 0) {
        setViewMode('qa');
        return true;
      }
      return false;
    });
    return () => registerBackHandler(null);
  }, [
    confirmLeaveDuringUpload,
    materials.length,
    previewCitation,
    registerBackHandler,
    renaming,
    uploading,
    viewMode,
  ]);

  const handleHeaderBack = () => {
    if (uploading) {
      confirmLeaveDuringUpload();
      return;
    }
    onBack();
  };

  const handleUpload = async () => {
    if (uploading) return;
    setNotice(null);
    cancelUploadRef.current = false;
    setCancellingUpload(false);
    setUploading(true);
    setProgress({
      pagesRead: 0,
      totalPages: 1,
      ocrPages: 0,
      stage: 'Choose a lesson file…',
    });

    try {
      const outcome = await ingestMaterialForUser(userId, {
        onProgress: next => {
          if (mountedRef.current) setProgress(next);
        },
        isCancelled: () => cancelUploadRef.current || !mountedRef.current,
      });

      if (!mountedRef.current) return;
      if (outcome.status === 'cancelled') {
        setNotice({text: 'Upload cancelled.'});
        return;
      }
      if (outcome.status === 'failed') {
        setNotice({text: outcome.message, danger: true});
        return;
      }
      if (outcome.status === 'duplicate') {
        refreshLibrary(outcome.material.id);
        setViewMode('qa');
        setNotice({
          text: `Already in your library: ${outcome.material.title}. Opened it for Q&A.`,
        });
        return;
      }
      refreshLibrary(outcome.material.id);
      setViewMode('qa');
      const warnText = outcome.warnings.length
        ? ` ${outcome.warnings.join(' ')}`
        : '';
      setNotice({
        text: `Indexed "${outcome.material.title}" (${outcome.material.chunkCount} passages).${warnText}`,
      });
    } catch (e) {
      if (mountedRef.current) {
        setNotice({
          text: (e as Error).message || 'Could not import that file.',
          danger: true,
        });
      }
    } finally {
      if (mountedRef.current) {
        setUploading(false);
        setCancellingUpload(false);
        setProgress(null);
      }
    }
  };

  const handleAsk = async (override?: string) => {
    const trimmed = (override ?? question).trim();
    if (!trimmed || asking || materials.length === 0) return;
    setNotice(null);
    if (!override) setQuestion('');
    const reqId = ++requestIdRef.current;
    const reqScope = scopeKey;
    const reqMaterialIds = activeMaterialIds;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    isNearBottomRef.current = true;
    setAsking(true);
    setAskStage('Searching your materials…');
    setStreamingReply('');

    const optimisticUser: MaterialQaMessage = {
      id: `pending_user_${Date.now()}`,
      userId,
      scopeKey: reqScope,
      sender: 'user',
      content: trimmed,
      sources: [],
      usedOnline: false,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticUser]);

    try {
      const result = await askUserMaterials(userId, trimmed, {
        materialIds: reqMaterialIds,
        scopeKey: reqScope,
        signal: controller.signal,
        isCurrent: () =>
          mountedRef.current &&
          requestIdRef.current === reqId &&
          activeScopeRef.current === reqScope,
        onStage: stage => {
          if (
            mountedRef.current &&
            requestIdRef.current === reqId &&
            activeScopeRef.current === reqScope
          ) {
            setAskStage(stage);
          }
        },
        onReplyText: partial => {
          if (
            mountedRef.current &&
            requestIdRef.current === reqId &&
            activeScopeRef.current === reqScope
          ) {
            setStreamingReply(partial);
          }
        },
      });
      if (
        !mountedRef.current ||
        requestIdRef.current !== reqId ||
        activeScopeRef.current !== reqScope
      ) {
        return;
      }
      setMessages(materialStore.listMessages(userId, reqScope, 80));
      setMsgCounts(materialStore.getMessageCountsByScope(userId));
      if (result.fallbackNote) {
        setNotice({text: result.fallbackNote});
      }
    } catch (e) {
      if (!mountedRef.current || requestIdRef.current !== reqId) return;
      if (activeScopeRef.current === reqScope) {
        setMessages(materialStore.listMessages(userId, reqScope, 80));
        setMsgCounts(materialStore.getMessageCountsByScope(userId));
      }
      if (e instanceof MaterialQaAbortedError) {
        if (!override) setQuestion(trimmed);
        setNotice({text: 'Stopped generating.'});
      } else {
        if (!override) setQuestion(trimmed);
        setNotice({
          text: (e as Error).message || 'Could not answer that question.',
          danger: true,
        });
      }
    } finally {
      if (mountedRef.current && requestIdRef.current === reqId) {
        abortControllerRef.current = null;
        setAsking(false);
        setStreamingReply('');
      }
    }
  };

  const stopAsking = () => {
    abortControllerRef.current?.abort();
  };

  const toggleVoiceInput = async () => {
    if (asking) return;
    if (listening && activeCaptureRef.current) {
      await stopOfflineSpeechCapture(activeCaptureRef.current.captureId).catch(
        () => undefined,
      );
      return;
    }
    setNotice(null);
    const permitted = await ensureMicrophonePermission();
    if (!permitted) {
      setNotice({
        text: 'Allow microphone permission in Settings to dictate questions.',
        danger: true,
      });
      return;
    }
    try {
      const handle = startOfflineSpeechCapture({
        mode: 'manual',
        bargeIn: false,
        context: 'main_mic',
      });
      activeCaptureRef.current = handle;
      setListening(true);
      const res = await handle.result;
      if (!mountedRef.current) return;
      if (activeCaptureRef.current?.captureId === handle.captureId) {
        activeCaptureRef.current = null;
        setListening(false);
      }
      if (res.cancelled) return;
      const transcript = res.transcript.trim();
      if (!transcript) {
        setNotice({
          text: 'No speech detected. Try speaking closer to the mic.',
        });
        return;
      }
      setQuestion(prev =>
        prev.trim() ? `${prev.trim()} ${transcript}` : transcript,
      );
    } catch (e) {
      if (!mountedRef.current) return;
      activeCaptureRef.current = null;
      setListening(false);
      if (isMicrophoneBusyError(e)) {
        setNotice({
          text: 'Microphone is busy right now. Try again in a moment.',
          danger: true,
        });
      } else {
        setNotice({
          text: (e as Error).message || 'Could not capture voice input.',
          danger: true,
        });
      }
    }
  };

  const handleCopy = async (
    text: string,
    msgId?: string,
    successLabel = 'Copied answer.',
  ) => {
    const clipboard = NativeModules.LafinaSkillsFiles as
      | {copy?: (value: string) => Promise<boolean> | void}
      | undefined;
    if (!clipboard?.copy) {
      setNotice({text: 'Copy is unavailable in this build.', danger: true});
      return;
    }
    try {
      await clipboard.copy(text);
      if (msgId) setCopiedMsgId(msgId);
      setNotice({text: successLabel});
    } catch (e) {
      setNotice({
        text: (e as Error).message || 'Could not copy to clipboard.',
        danger: true,
      });
    }
  };

  const handleSaveToNote = (
    msg: MaterialQaMessage,
    precedingQuestion?: string,
  ) => {
    if (savedMsgIds[msg.id]) return;
    try {
      const sourceList = msg.sources.length
        ? `\n\nSources: ${msg.sources
            .map(s => `${s.title} (${s.pageLabel})`)
            .join(', ')}`
        : '';
      const firstTitle = msg.sources[0]?.title || 'Lesson Q&A';
      const questionSnippet = precedingQuestion
        ? ` · ${precedingQuestion.slice(0, 36).trim()}`
        : '';
      const title = `Lesson Q&A · ${firstTitle}${questionSnippet}`.slice(
        0,
        120,
      );
      const questionBlock = precedingQuestion
        ? `Question: ${precedingQuestion}\n\n`
        : '';
      notesEditStore.create({
        id: generateId('note'),
        userId,
        title,
        body: `${questionBlock}${msg.content}${sourceList}`,
        category: 'Learning',
        isPinned: false,
        tags: ['Lesson Q&A'],
        isVoiceTranscribed: false,
      });
      setSavedMsgIds(prev => ({...prev, [msg.id]: true}));
      onRefresh?.();
      setNotice({text: 'Saved to Notes.'});
    } catch (e) {
      setNotice({
        text: (e as Error).message || 'Could not save to Notes.',
        danger: true,
      });
    }
  };

  const confirmDelete = (mat: UserMaterialRecord) => {
    Alert.alert(
      'Delete lesson material?',
      `Remove "${mat.title}" and its indexed passages and Q&A history from this phone?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (asking && effectiveSelectedId === mat.id) {
              abortControllerRef.current?.abort();
              requestIdRef.current += 1;
              setAsking(false);
              setStreamingReply('');
            }
            materialStore.deleteMaterial(userId, mat.id);
            refreshLibrary();
            setNotice({text: `Removed "${mat.title}".`});
          },
        },
      ],
    );
  };

  const saveRename = () => {
    if (!renaming) return;
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === renaming.title) return;
    materialStore.renameMaterial(userId, renaming.id, trimmed);
    setRenaming(null);
    setRenameDraft('');
    refreshLibrary();
    setNotice({text: `Renamed to "${trimmed}".`});
  };

  const clearCurrentThread = () => {
    Alert.alert(
      'Clear Q&A thread?',
      'Delete saved questions and answers for this scope?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            if (asking) {
              abortControllerRef.current?.abort();
              requestIdRef.current += 1;
              setAsking(false);
              setStreamingReply('');
            }
            materialStore.clearThread(userId, scopeKey);
            setMessages([]);
            setMsgCounts(materialStore.getMessageCountsByScope(userId));
          },
        },
      ],
    );
  };

  const progressRatio =
    progress && progress.totalPages > 0
      ? Math.min(1, Math.max(0.08, progress.pagesRead / progress.totalPages))
      : 0.1;

  const composerBottomPadding = keyboardVisible
    ? 8
    : Math.max(insets.bottom, 10);

  return (
    <KeyboardAvoidingView
      style={[ui.fill, {backgroundColor: p.bg}]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={ui.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to Skills"
          onPress={handleHeaderBack}
          style={ui.icon}
        >
          <ArrowLeft size={24} color={p.text} />
        </TouchableOpacity>
        <Text
          accessibilityRole="header"
          style={[ui.pageTitle, {color: p.text}]}
        >
          Lesson Q&A
        </Text>
        {materials.length > 0 && (
          <TouchableOpacity
            testID="lesson-qa-toggle-view"
            accessibilityRole="button"
            accessibilityLabel={
              viewMode === 'library' ? 'Open Q&A' : 'Open lesson library'
            }
            onPress={() =>
              setViewMode(m => (m === 'library' ? 'qa' : 'library'))
            }
            style={[
              styles.headerChip,
              {backgroundColor: p.surface, borderColor: p.border},
            ]}
          >
            <FolderOpen size={15} color={p.accent} />
            <Text style={[styles.headerChipText, {color: p.text}]}>
              {viewMode === 'library'
                ? 'Ask Q&A'
                : `Library (${materials.length})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Upload Progress Banner */}
      {uploading && (
        <View
          style={[
            styles.progressBanner,
            {backgroundColor: p.card, borderColor: p.border},
          ]}
        >
          <View style={styles.progressTopRow}>
            <ActivityIndicator size="small" color={p.accent} />
            <View style={ui.fill}>
              <SkillText strong size={13}>
                {cancellingUpload
                  ? 'Cancelling upload…'
                  : progress?.stage || 'Reading lesson file…'}
              </SkillText>
              {progress && progress.ocrPages > 0 && (
                <SkillText muted size={12}>
                  OCR applied to {progress.ocrPages} scanned page
                  {progress.ocrPages === 1 ? '' : 's'}
                </SkillText>
              )}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Cancel upload"
              disabled={cancellingUpload}
              onPress={() => {
                cancelUploadRef.current = true;
                setCancellingUpload(true);
              }}
              style={[styles.cancelTap, cancellingUpload && {opacity: 0.5}]}
            >
              <SkillText danger size={13} strong>
                {cancellingUpload ? 'Cancelling…' : 'Cancel'}
              </SkillText>
            </TouchableOpacity>
          </View>
          <View style={[styles.progressTrack, {backgroundColor: p.surface}]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: p.accent,
                  width: `${Math.round(progressRatio * 100)}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Dismissible Notice Toast */}
      {!!notice && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.noticeToast,
            {
              backgroundColor: notice.danger ? p.dangerSoft : p.surface,
              borderColor: notice.danger ? p.danger : p.border,
            },
          ]}
        >
          <View style={ui.fill}>
            <SkillText danger={notice.danger} size={13}>
              {notice.text}
            </SkillText>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Dismiss notice"
            onPress={() => setNotice(null)}
            style={styles.dismissBtn}
          >
            <X size={15} color={notice.danger ? p.danger : p.muted} />
          </TouchableOpacity>
        </View>
      )}

      {viewMode === 'library' || materials.length === 0 ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.libraryScroll,
            {paddingBottom: Math.max(insets.bottom, 24) + 32},
          ]}
        >
          <SkillCard>
            <View style={ui.row}>
              <View style={[styles.heroIcon, {backgroundColor: p.surface}]}>
                <BookOpen size={22} color={p.accent} />
              </View>
              <View style={ui.fill}>
                <SkillText strong size={16}>
                  Ask anything about your lessons
                </SkillText>
                <SkillText muted size={13}>
                  Upload PDFs, slides, or notes. LAFINA indexes every page on
                  your phone and answers with exact citations.
                </SkillText>
              </View>
            </View>
            <SkillButton
              testID="lesson-qa-upload-btn"
              disabled={uploading}
              label={uploading ? 'Indexing file…' : 'Upload lesson file'}
              onPress={() => {
                void handleUpload();
              }}
            />
            <SkillText muted size={12}>
              PDF (text & scanned OCR, up to 100 pages), Word (.docx),
              PowerPoint (.pptx), TXT, MD & CSV · up to 15 MB.
            </SkillText>
          </SkillCard>

          {materials.length > 0 && (
            <View style={ui.section}>
              <SkillText strong size={16}>
                Your uploaded files ({materials.length})
              </SkillText>
            </View>
          )}

          {materials.length >= 4 && (
            <View
              style={[
                styles.librarySearchWrap,
                {backgroundColor: p.surface, borderColor: p.border},
              ]}
            >
              <Search size={16} color={p.muted} />
              <TextInput
                accessibilityLabel="Filter uploaded lesson files"
                placeholder="Search uploaded files…"
                placeholderTextColor={p.muted}
                value={libraryQuery}
                onChangeText={setLibraryQuery}
                style={[styles.librarySearchInput, {color: p.text}]}
              />
              {!!libraryQuery && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Clear library filter"
                  onPress={() => setLibraryQuery('')}
                  style={styles.dismissBtn}
                >
                  <X size={15} color={p.muted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {materials.length > 0 && filteredMaterials.length === 0 && (
            <SkillText muted size={13}>
              No uploaded files match “{libraryQuery.trim()}”.
            </SkillText>
          )}

          {filteredMaterials.map(mat => {
            const sizeLabel = formatFileSize(mat.sizeBytes);
            const savedTurns = Math.floor((msgCounts[mat.id] ?? 0) / 2);
            const outlineExpanded = Boolean(expandedOutlines[mat.id]);
            return (
              <SkillCard key={mat.id}>
                <View style={ui.between}>
                  <View style={ui.fill}>
                    <SkillText strong size={15}>
                      {mat.title}
                    </SkillText>
                    <SkillText muted size={12}>
                      {mat.fileKind.toUpperCase()} · {formatMaterialUnits(mat)}{' '}
                      · {mat.chunkCount} passages
                      {sizeLabel ? ` · ${sizeLabel}` : ''}
                      {mat.ocrPages > 0 ? ` · ${mat.ocrPages} OCR` : ''}
                      {savedTurns > 0 ? ` · ${savedTurns} Q&A` : ''}
                    </SkillText>
                  </View>
                  <View style={styles.cardIcons}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Rename ${mat.title}`}
                      onPress={() => {
                        setRenaming(mat);
                        setRenameDraft(mat.title);
                      }}
                      style={ui.icon}
                    >
                      <Pencil size={18} color={p.muted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${mat.title}`}
                      onPress={() => confirmDelete(mat)}
                      style={ui.icon}
                    >
                      <Trash2 size={18} color={p.danger} />
                    </TouchableOpacity>
                  </View>
                </View>

                {mat.outline.length > 0 && (
                  <View>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`${
                        outlineExpanded ? 'Hide' : 'Show'
                      } topics in ${mat.title}`}
                      onPress={() =>
                        setExpandedOutlines(prev => ({
                          ...prev,
                          [mat.id]: !prev[mat.id],
                        }))
                      }
                      style={styles.outlineToggle}
                    >
                      <SkillText size={12} strong>
                        Topics & outline ({mat.outline.length})
                      </SkillText>
                      {outlineExpanded ? (
                        <ChevronUp size={15} color={p.muted} />
                      ) : (
                        <ChevronDown size={15} color={p.muted} />
                      )}
                    </TouchableOpacity>
                    {outlineExpanded && (
                      <View style={styles.outlineList}>
                        {mat.outline.slice(0, 12).map((entry, idx) => (
                          <TouchableOpacity
                            key={`${mat.id}_ol_${idx}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Ask about ${entry.heading}`}
                            onPress={() => {
                              selectScope(mat.id);
                              setViewMode('qa');
                              void handleAsk(`Explain "${entry.heading}"`);
                            }}
                            style={[
                              styles.outlineChip,
                              {
                                backgroundColor: p.surface,
                                borderColor: p.border,
                              },
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              style={[styles.outlineText, {color: p.text}]}
                            >
                              {entry.heading} · {entry.pageLabel}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                <SkillButton
                  secondary
                  label="Ask about this file"
                  onPress={() => {
                    selectScope(mat.id);
                    setViewMode('qa');
                  }}
                />

                {onOpenSkill && (
                  <View style={styles.skillJumpRow}>
                    {(
                      [
                        ['summarizer', 'Summarize'],
                        ['flashcards', 'Flashcards'],
                        ['quiz', 'Quiz'],
                        ['docgen', 'Create file'],
                      ] as const
                    ).map(([route, label]) => (
                      <TouchableOpacity
                        key={route}
                        accessibilityRole="button"
                        accessibilityLabel={`${label} ${mat.title}`}
                        onPress={() => onOpenSkill(route, mat.id)}
                        style={[
                          styles.jumpChip,
                          {backgroundColor: p.surface, borderColor: p.border},
                        ]}
                      >
                        <SkillText strong size={12}>
                          {label}
                        </SkillText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </SkillCard>
            );
          })}
        </ScrollView>
      ) : (
        <View style={ui.fill}>
          {/* Scope chips */}
          {materials.length > 1 && (
            <View style={styles.scopeBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scopeChips}
                keyboardShouldPersistTaps="handled"
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Scope: All materials"
                  onPress={() => selectScope('all')}
                  style={[
                    styles.scopeChip,
                    {
                      backgroundColor:
                        effectiveSelectedId === 'all' ? p.accent : p.surface,
                      borderColor: p.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.scopeChipText,
                      {
                        color:
                          effectiveSelectedId === 'all' ? p.onAccent : p.text,
                      },
                    ]}
                  >
                    All materials
                  </Text>
                </TouchableOpacity>
                {materials.map(mat => {
                  const active = effectiveSelectedId === mat.id;
                  return (
                    <TouchableOpacity
                      key={mat.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Scope: ${mat.title}`}
                      onPress={() => selectScope(mat.id)}
                      style={[
                        styles.scopeChip,
                        {
                          backgroundColor: active ? p.accent : p.surface,
                          borderColor: p.border,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.scopeChipText,
                          {color: active ? p.onAccent : p.text},
                        ]}
                      >
                        {mat.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Status row */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`AI mode: ${onlineStatus.label}. Tap for details.`}
              onPress={() => setShowModeInfo(v => !v)}
              style={[
                styles.modePill,
                {backgroundColor: p.surface, borderColor: p.border},
              ]}
            >
              {onlineStatus.ready ? (
                <Wifi size={13} color={p.accent} />
              ) : (
                <WifiOff size={13} color={p.muted} />
              )}
              <Text
                numberOfLines={1}
                style={[styles.modePillText, {color: p.text}]}
              >
                {onlineStatus.label}
              </Text>
              <Info size={12} color={p.muted} />
            </TouchableOpacity>

            <View style={styles.modeActions}>
              {messages.length > 0 && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Clear Q&A thread"
                  onPress={clearCurrentThread}
                  style={styles.smallActionTap}
                >
                  <SkillText danger size={12} strong>
                    Clear Q&A
                  </SkillText>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Upload another file"
                disabled={uploading}
                onPress={() => {
                  void handleUpload();
                }}
                style={styles.smallActionTap}
              >
                <View style={styles.inlineUpload}>
                  <Upload size={13} color={p.accent} />
                  <Text
                    style={{
                      color: p.accent,
                      fontFamily: SkillFonts.semibold,
                      fontSize: 12,
                    }}
                  >
                    Add file
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {showModeInfo && (
            <View
              style={[
                styles.modeInfoBox,
                {backgroundColor: p.surface, borderColor: p.border},
              ]}
            >
              <SkillText muted size={12}>
                {onlineStatus.detail}
              </SkillText>
            </View>
          )}

          <FlatList
            ref={listRef}
            style={ui.fill}
            contentContainerStyle={styles.chatList}
            keyboardShouldPersistTaps="handled"
            data={messages}
            keyExtractor={item => item.id}
            onScroll={e => {
              const {contentOffset, layoutMeasurement, contentSize} =
                e.nativeEvent;
              isNearBottomRef.current =
                contentOffset.y + layoutMeasurement.height >=
                contentSize.height - 80;
            }}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (
                (messages.length > 0 || streamingReply) &&
                isNearBottomRef.current
              ) {
                listRef.current?.scrollToEnd({animated: false});
              }
            }}
            ListEmptyComponent={
              !asking ? (
                <SkillCard>
                  <View style={ui.row}>
                    <Sparkles size={18} color={p.accent} />
                    <View style={ui.fill}>
                      <SkillText strong size={15}>
                        {activeMaterial
                          ? `Ask about ${activeMaterial.title}`
                          : 'Ask a question about your lessons'}
                      </SkillText>
                    </View>
                  </View>
                  <SkillText muted size={13}>
                    Try a topic, term, page number (e.g. “page 4”), or one of
                    these starters:
                  </SkillText>
                  <View style={styles.starterWrap}>
                    {starterPrompts.map(prompt => (
                      <TouchableOpacity
                        key={prompt}
                        accessibilityRole="button"
                        accessibilityLabel={prompt}
                        onPress={() => {
                          void handleAsk(prompt);
                        }}
                        style={[
                          styles.starterChip,
                          {backgroundColor: p.surface, borderColor: p.border},
                        ]}
                      >
                        <SkillText size={13} strong>
                          {prompt}
                        </SkillText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </SkillCard>
              ) : null
            }
            renderItem={({item, index}) => {
              const isUser = item.sender === 'user';
              if (isUser) {
                return (
                  <View
                    style={[styles.userBubble, {backgroundColor: p.accent}]}
                  >
                    <Text
                      style={{
                        color: p.onAccent,
                        fontFamily: SkillFonts.body,
                        fontSize: 14,
                        lineHeight: 20,
                      }}
                    >
                      {item.content}
                    </Text>
                  </View>
                );
              }
              let precedingQuestion: string | undefined;
              for (let i = index - 1; i >= 0; i -= 1) {
                if (messages[i].sender === 'user') {
                  precedingQuestion = messages[i].content;
                  break;
                }
              }
              const isLatest = index === messages.length - 1;
              const isDegradedReply =
                item.content.includes('cut off before it finished') ||
                item.content.includes('Stopped early') ||
                item.content.includes(
                  'Showing verified local excerpts instead',
                );
              const showRetry =
                !asking && !!precedingQuestion && (isLatest || isDegradedReply);
              const isSaved = Boolean(savedMsgIds[item.id]);
              const isCopied = copiedMsgId === item.id;
              const timeStr = formatMessageTime(item.createdAt);

              return (
                <View
                  style={[
                    styles.assistantBubble,
                    {backgroundColor: p.card, borderColor: p.border},
                  ]}
                >
                  <View style={styles.msgMetaRow}>
                    <View
                      style={[
                        styles.sourceKindPill,
                        {backgroundColor: p.surface},
                      ]}
                    >
                      <SkillText muted size={11} strong>
                        {item.usedOnline ? 'Online AI' : 'Local excerpt'}
                      </SkillText>
                    </View>
                    {!!timeStr && (
                      <SkillText muted size={11}>
                        {timeStr}
                      </SkillText>
                    )}
                  </View>

                  <ChatReplyText
                    content={item.content}
                    format="markdown"
                    textStyle={{
                      color: p.text,
                      fontFamily: SkillFonts.body,
                      fontSize: 14,
                      lineHeight: 20,
                    }}
                  />

                  {item.sources.length > 0 && (
                    <View style={styles.citationWrap}>
                      {item.sources.map((src, idx) => (
                        <TouchableOpacity
                          key={`${item.id}_src_${idx}`}
                          accessibilityRole="button"
                          accessibilityLabel={`View source ${src.title} ${src.pageLabel}`}
                          onPress={() => setPreviewCitation(src)}
                          style={[
                            styles.citationChip,
                            {
                              backgroundColor: p.surface,
                              borderColor: p.border,
                            },
                          ]}
                        >
                          <FileText size={12} color={p.accent} />
                          <Text
                            numberOfLines={1}
                            style={[styles.citationText, {color: p.text}]}
                          >
                            {src.title} · {src.pageLabel}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <View style={styles.msgActions}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Copy answer"
                      onPress={() => {
                        void handleCopy(item.content, item.id);
                      }}
                      style={styles.msgActionBtn}
                    >
                      {isCopied ? (
                        <Check size={13} color={p.accent} />
                      ) : (
                        <Copy size={13} color={p.muted} />
                      )}
                      <SkillText muted={!isCopied} size={12} strong={isCopied}>
                        {isCopied ? 'Copied' : 'Copy'}
                      </SkillText>
                    </TouchableOpacity>

                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={
                        isSaved ? 'Saved to notes' : 'Save answer to notes'
                      }
                      disabled={isSaved}
                      onPress={() => handleSaveToNote(item, precedingQuestion)}
                      style={styles.msgActionBtn}
                    >
                      {isSaved ? (
                        <Check size={13} color={p.accent} />
                      ) : (
                        <BookOpen size={13} color={p.muted} />
                      )}
                      <SkillText muted={!isSaved} size={12} strong={isSaved}>
                        {isSaved ? 'Saved' : 'Save to notes'}
                      </SkillText>
                    </TouchableOpacity>

                    {showRetry && precedingQuestion && (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Retry question"
                        onPress={() => {
                          void handleAsk(precedingQuestion);
                        }}
                        style={styles.msgActionBtn}
                      >
                        <RotateCcw size={13} color={p.muted} />
                        <SkillText muted size={12}>
                          Retry
                        </SkillText>
                      </TouchableOpacity>
                    )}
                  </View>

                  {isLatest && !asking && item.sources.length > 0 && (
                    <View style={styles.followUpWrap}>
                      {(['Explain simpler', 'Give an example'] as const).map(
                        followUp => (
                          <TouchableOpacity
                            key={followUp}
                            accessibilityRole="button"
                            accessibilityLabel={followUp}
                            onPress={() => {
                              void handleAsk(followUp);
                            }}
                            style={[
                              styles.followUpChip,
                              {
                                backgroundColor: p.surface,
                                borderColor: p.border,
                              },
                            ]}
                          >
                            <SkillText size={12} strong>
                              {followUp}
                            </SkillText>
                          </TouchableOpacity>
                        ),
                      )}
                      {onOpenSkill && (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel="Make flashcards from this lesson"
                          onPress={() =>
                            onOpenSkill(
                              'flashcards',
                              activeMaterial?.id ?? item.sources[0]?.materialId,
                            )
                          }
                          style={[
                            styles.followUpChip,
                            {
                              backgroundColor: p.surface,
                              borderColor: p.border,
                            },
                          ]}
                        >
                          <SkillText size={12} strong>
                            Make flashcards
                          </SkillText>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            }}
            ListFooterComponent={
              asking ? (
                <View
                  style={[
                    styles.assistantBubble,
                    {backgroundColor: p.card, borderColor: p.border},
                  ]}
                >
                  {streamingReply ? (
                    <ChatReplyText
                      content={streamingReply}
                      format="markdown"
                      streaming
                      textStyle={{
                        color: p.text,
                        fontFamily: SkillFonts.body,
                        fontSize: 14,
                        lineHeight: 20,
                      }}
                    />
                  ) : (
                    <View style={ui.row}>
                      <ActivityIndicator size="small" color={p.accent} />
                      <SkillText muted size={13}>
                        {askStage}
                      </SkillText>
                    </View>
                  )}
                </View>
              ) : null
            }
          />

          {/* Sticky Bottom Composer */}
          <View
            style={[
              styles.composerBar,
              {
                backgroundColor: p.bg,
                borderTopColor: p.border,
                paddingBottom: composerBottomPadding,
              },
            ]}
          >
            {sttReady && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  listening ? 'Stop voice input' : 'Speak question'
                }
                disabled={asking}
                onPress={() => {
                  void toggleVoiceInput();
                }}
                style={[
                  styles.micBtn,
                  {
                    backgroundColor: listening ? p.danger : p.surface,
                    borderColor: listening ? p.danger : p.border,
                    opacity: asking ? 0.45 : 1,
                  },
                ]}
              >
                <Mic size={18} color={listening ? '#FFFFFF' : p.text} />
              </TouchableOpacity>
            )}
            <TextInput
              accessibilityLabel="Ask about your materials"
              placeholder={
                listening
                  ? 'Listening… tap mic to finish'
                  : 'Ask anything about your uploaded files…'
              }
              placeholderTextColor={p.muted}
              value={question}
              onChangeText={setQuestion}
              multiline
              textAlignVertical="top"
              editable={!asking}
              maxLength={1000}
              style={[
                styles.composerInput,
                {
                  backgroundColor: p.card,
                  borderColor: p.border,
                  color: p.text,
                },
              ]}
            />
            {asking ? (
              <TouchableOpacity
                testID="lesson-qa-stop-btn"
                accessibilityRole="button"
                accessibilityLabel="Stop generating"
                onPress={stopAsking}
                style={[styles.sendBtn, {backgroundColor: p.danger}]}
              >
                <Square size={16} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                testID="lesson-qa-send-btn"
                accessibilityRole="button"
                accessibilityLabel="Send question"
                disabled={!question.trim()}
                onPress={() => {
                  void handleAsk();
                }}
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: p.accent,
                    opacity: !question.trim() ? 0.45 : 1,
                  },
                ]}
              >
                <Send size={18} color={p.onAccent} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Verbatim Source Preview Modal */}
      <Modal
        visible={previewCitation !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewCitation(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPreviewCitation(null)}
        >
          <Pressable
            style={[
              styles.modalCard,
              {backgroundColor: p.card, borderColor: p.border},
            ]}
            onPress={() => {}}
          >
            <View style={ui.between}>
              <View style={ui.fill}>
                <SkillText strong size={17}>
                  {previewCitation?.title}
                </SkillText>
                <SkillText muted size={13}>
                  {previewCitation?.pageLabel}
                  {previewCitation?.heading
                    ? ` · ${previewCitation.heading}`
                    : ''}
                </SkillText>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Copy excerpt"
                onPress={() => {
                  if (previewCitation) {
                    void handleCopy(
                      previewCitation.content || previewCitation.snippet,
                      undefined,
                      'Copied excerpt.',
                    );
                  }
                }}
                style={ui.icon}
              >
                <Copy size={18} color={p.accent} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text
                selectable
                style={{
                  color: p.text,
                  fontFamily: SkillFonts.body,
                  fontSize: 14,
                  lineHeight: 21,
                }}
              >
                {previewCitation?.content || previewCitation?.snippet}
              </Text>
            </ScrollView>

            {(neighborCitations.prev || neighborCitations.next) && (
              <View style={styles.neighborRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Previous passage"
                  disabled={!neighborCitations.prev}
                  onPress={() => {
                    if (neighborCitations.prev) {
                      setPreviewCitation(neighborCitations.prev);
                    }
                  }}
                  style={[
                    styles.neighborBtn,
                    {
                      backgroundColor: p.surface,
                      borderColor: p.border,
                      opacity: neighborCitations.prev ? 1 : 0.4,
                    },
                  ]}
                >
                  <ChevronLeft size={16} color={p.text} />
                  <SkillText size={13} strong>
                    Previous
                  </SkillText>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Next passage"
                  disabled={!neighborCitations.next}
                  onPress={() => {
                    if (neighborCitations.next) {
                      setPreviewCitation(neighborCitations.next);
                    }
                  }}
                  style={[
                    styles.neighborBtn,
                    {
                      backgroundColor: p.surface,
                      borderColor: p.border,
                      opacity: neighborCitations.next ? 1 : 0.4,
                    },
                  ]}
                >
                  <SkillText size={13} strong>
                    Next
                  </SkillText>
                  <ChevronRight size={16} color={p.text} />
                </TouchableOpacity>
              </View>
            )}

            <SkillButton
              label="Close"
              onPress={() => setPreviewCitation(null)}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={renaming !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenaming(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <Pressable
            style={styles.modalBackdropInner}
            onPress={() => setRenaming(null)}
          >
            <Pressable
              style={[
                styles.modalCard,
                {backgroundColor: p.card, borderColor: p.border},
              ]}
              onPress={() => {}}
            >
              <SkillText strong size={17}>
                Rename material
              </SkillText>
              <SkillInput
                label="Material title"
                value={renameDraft}
                onChangeText={setRenameDraft}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveRename}
                maxLength={120}
              />
              <SkillButton
                label="Save"
                disabled={
                  !renameDraft.trim() || renameDraft.trim() === renaming?.title
                }
                onPress={saveRename}
              />
              <SkillButton
                secondary
                label="Cancel"
                onPress={() => setRenaming(null)}
              />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  headerChipText: {
    fontFamily: SkillFonts.semibold,
    fontSize: 13,
  },
  progressBanner: {
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  progressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  cancelTap: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  dismissBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryScroll: {
    paddingHorizontal: 20,
  },
  librarySearchWrap: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  librarySearchInput: {
    flex: 1,
    fontFamily: SkillFonts.body,
    fontSize: 14,
    paddingVertical: 8,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  outlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingVertical: 4,
  },
  outlineList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  outlineChip: {
    minHeight: 36,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  outlineText: {
    fontFamily: SkillFonts.body,
    fontSize: 12,
  },
  skillJumpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  jumpChip: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
  },
  scopeBar: {
    paddingVertical: 4,
  },
  scopeChips: {
    paddingHorizontal: 16,
    gap: 8,
  },
  scopeChip: {
    minHeight: 44,
    maxWidth: 200,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
  },
  scopeChipText: {
    fontFamily: SkillFonts.semibold,
    fontSize: 13,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    flexShrink: 1,
  },
  modePillText: {
    fontFamily: SkillFonts.medium,
    fontSize: 12,
    flexShrink: 1,
  },
  modeInfoBox: {
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  modeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  smallActionTap: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  inlineUpload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chatList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  starterWrap: {
    gap: 8,
    marginTop: 6,
  },
  starterChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  msgMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sourceKindPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  citationWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  citationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  citationText: {
    fontFamily: SkillFonts.medium,
    fontSize: 12,
    flexShrink: 1,
  },
  msgActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  msgActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
  },
  followUpWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
  },
  followUpChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
  },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: SkillFonts.body,
    fontSize: 14,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBackdropInner: {
    flex: 1,
    justifyContent: 'center',
  },
  modalCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 10,
    maxHeight: '82%',
  },
  modalScroll: {
    maxHeight: 280,
  },
  neighborRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  neighborBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
