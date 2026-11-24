import {ScreenOverlays} from '../navigation/RetainedTab';
import React, {useCallback, useMemo, useState, useEffect, useRef} from 'react';
import {
  Alert,
  DeviceEventEmitter,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Fonts,
  Layout,
  MODERN_AI_BUTTON_DESIGNS,
  MODERN_THEMES,
  ModernLayout,
  ModernTypography,
  Shadows,
  type ModernAiButtonDesignId,
  type ModernThemeId,
} from '../theme';
import {LafinaSynthOrb} from '../components/CustomTabBar';
import {
  localSettingsStore,
  preferencesStore,
  userStore,
  avatarSeedStore,
  generateAvatarSeed,
} from '../../storage';
import type {UserPreferences, User, AcademicProfileRecord} from '../../storage';
import {useTheme} from '../contexts/ThemeContext';
import {useThemedStyles} from '../theme/createThemedStyles';
import type {ThemeColors} from '../contexts/ThemeContext';
import {APP_VERSION} from '../../appVersion';
import {GUEST_USER_ID} from '../../constants';
import {cancelFocusTimer} from '../../scheduler/focusTimer';
import {SvgXml} from 'react-native-svg';
import {ARC_SCREEN_XML} from '../../assets/arc_screen_xml';
import {
  AlignLeft,
  AudioLines,
  BellRing,
  BookOpen,
  Brain,
  CalendarClock,
  CalendarDays,
  Camera,
  Compass,
  Info,
  Lock,
  MessageCircle,
  Palette,
  PhoneCall,
  Play,
  School,
  ShieldCheck,
  Type,
  Undo2,
  Volume2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Dices,
  FileText,
  GraduationCap,
  LayoutGrid,
  LogOut,
  Moon,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
} from 'lucide-react-native';
import {authService} from '../../cloud/authService';
import {
  avatarSource,
  pickAvatarImage,
  removeAvatarImage,
} from '../components/profile/avatarFile';
import {CharacterAvatar} from '../components/profile/CharacterAvatar';
import {DefaultProfileAvatar} from '../components/profile/DefaultProfileAvatar';
import {ProfileAvatarModal} from '../components/profile/ProfileAvatarModal';
import {
  areTraitsVisuallyDistinct,
  resolveCharacterTraits,
} from '../components/profile/characterAvatarGenerator';
import {ProfileStats} from '../components/profile/ProfileStats';
import {ProfileStatsModal} from '../components/profile/ProfileStatsModal';
import {StudentSetupModal} from '../components/profile/StudentSetupModal';
import {
  AppearancePickerModal,
  type AppearancePickerTab,
} from '../components/profile/AppearancePickerModal';
import {SignOutModal} from '../components/profile/SignOutModal';
import {SettingItem} from '../components/profile/SettingItem';
import {ServerSwitchItem} from '../components/profile/ServerSwitchItem';
import {backendSelection} from '../../cloud/backendSelection';
import {PrivacyModal} from '../components/profile/PrivacyModal';
import {AppUpdateItem} from '../components/profile/AppUpdateItem';
import {PreferencesSettingsScreen} from './PreferencesSettingsScreen';
import {ReminderHealth} from '../components/profile/ReminderHealth';
import {AlertAndNotificationSettings} from '../components/profile/AlertAndNotificationSettings';
import {ReminderCallSettings} from '../components/profile/ReminderCallSettings';
import {alertPreferencesStore} from '../../storage/alertPreferencesStore';
import {PersonalMemory} from '../components/profile/PersonalMemory';
import {ChatMemorySettings} from '../components/profile/ChatMemorySettings';
import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {CHAT_MEMORY_CHANGED_EVENT} from '../../cloud/chatMemoryService';
import {} from '../../storage/onboardingMemory';
import {OfflineVoice} from '../components/profile/OfflineVoice';
import {OnlineVoice} from '../components/profile/OnlineVoice';
import {
  FloatingAssistantSettings,
  useFloatingAssistantSummary,
} from '../components/profile/FloatingAssistantSettings';
import {onlineVoiceSettingsStore} from '../../storage/onlineVoiceSettingsStore';
import {chatReplyFormatStore} from '../../storage/chatReplyFormatStore';
import {useChatReplyFormat} from '../hooks/useChatReplyFormat';
import {speechSettingsStore} from '../../storage/speechSettingsStore';
import {profileStatisticsStore} from '../../storage/profileStatisticsStore';
import type {DetailedProfileStatistics} from '../../storage/profileStatisticsStore';
import {personalMemoryStore} from '../../storage/personalMemoryStore';
import {
  authorizeDataReset,
  finishAttachmentCleanup,
  hasAttachmentCleanup,
  resetPersonalData,
  preparePersonalDataReset,
  finishPersonalFileCleanup,
} from '../../storage/accountDataReset';
import {hasPersonalFileCleanup} from '../../storage/personalFileCleanup';
import type {DataResetAuthority} from '../../storage/accountDataReset';
import {DeveloperModal} from '../components/profile/DeveloperModal';
import {
  ClearAllDataModal,
  ClearDataResultModal,
  type ClearDataResultState,
} from '../components/profile/ClearAllDataModal';
import {
  developerTestService,
  promptClearAllDataAndResetOnboarding,
} from '../components/profile/developerTestService';
import {
  getConfirmedAcademicProfile,
  getUstpEligibility,
} from '../../storage/ustpEligibility';
import {studentSetupStore} from '../../storage/studentSetupStore';
import type {StudentSetupState} from '../../storage/studentSetupStore';
import {chooseNotUstpMode, chooseUstpMode} from '../../storage/studentMode';
import {corImportStore} from '../../storage/corImportStore';
import {refreshAcademicMemories} from '../../storage/onboardingMemory';
import {CorReviewFlow} from './onboarding/CorReviewFlow';
import type {TourAnchor} from '../tour/tourSteps';
import {measureInWindow, tourTargetRef} from '../tour/tourTargets';

const COLLEGE_LOWER_WORDS = new Set([
  'of',
  'and',
  'in',
  'for',
  'the',
  'at',
  'on',
  'to',
  'with',
]);

/** Converts uppercase COR college headers into readable Title Case for profile display. */
function formatCollegeDisplay(college: string, collegeShort?: string): string {
  const clean = college.replace(/\s+/g, ' ').trim();
  const short = collegeShort?.trim() || '';
  if (!clean) return short;

  const letters = clean.replace(/[^A-Za-z]/g, '');
  const upperRatio =
    letters.length > 0
      ? clean.replace(/[^A-Z]/g, '').length / letters.length
      : 0;
  const formatted =
    upperRatio < 0.7
      ? clean
      : clean
          .split(' ')
          .map((word, index) => {
            const lower = word.toLowerCase();
            if (index > 0 && COLLEGE_LOWER_WORDS.has(lower)) {
              return lower;
            }
            if (/^(?:ustp|citc|cea|csm|cste|cot|com)$/i.test(word)) {
              return word.toUpperCase();
            }
            return lower.charAt(0).toUpperCase() + lower.slice(1);
          })
          .join(' ');

  if (short && !formatted.toUpperCase().startsWith(short.toUpperCase())) {
    return `${short} — ${formatted}`;
  }
  return formatted;
}

/** Converts all-caps COR instructor names into readable Title Case. */
function formatFacultyDisplay(faculty: string): string {
  const clean = faculty.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const letters = clean.replace(/[^A-Za-z]/g, '');
  const upperRatio =
    letters.length > 0
      ? clean.replace(/[^A-Z]/g, '').length / letters.length
      : 0;
  if (upperRatio < 0.7) return clean;
  return clean
    .split(' ')
    .map(word => {
      if (/^(?:ii|iii|iv)$/i.test(word)) return word.toUpperCase();
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

const getSnoozePreferenceLabel = (preferences: UserPreferences): string => {
  switch (preferences.snoozeTendency) {
    case 'immediate':
      return 'Immediate';
    case 'snooze_multiple':
      return 'Multiple snoozes';
    case 'ignore':
      return 'Often ignore';
    default:
      return 'Snooze once';
  }
};

const formatReminderLeadLabel = (minutes: number): string =>
  minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`;

const readAlertSettingsSummary = (userId: string): string => {
  try {
    const prefs = alertPreferencesStore.read(userId);
    const delivery =
      prefs.defaultReminderDeliveryStyle === 'notify'
        ? 'Sends a notification'
        : 'Calls you';
    return prefs.quietHoursDowngradeToNotify
      ? `${delivery} · quiet hours on`
      : delivery;
  } catch {
    return 'Calls you';
  }
};

const readCallSettingsSummary = (userId: string): string => {
  try {
    const prefs = alertPreferencesStore.read(userId);
    const mode =
      prefs.callAnswerMode === 'buttons_only'
        ? 'Buttons only'
        : prefs.callAnswerMode === 'offline_voice'
        ? 'Talks without internet'
        : 'LAFINA talks with you';
    return `${mode} · rings ${prefs.callRingTimeoutSec} sec`;
  } catch {
    return 'LAFINA talks with you · rings 45 sec';
  }
};

const readEventDefaultsSummary = (userId: string): string => {
  try {
    const saved = personalMemoryStore.read(userId);
    return saved.enabled && saved.value
      ? 'On: start time and length filled in'
      : 'Off';
  } catch {
    return 'Unavailable';
  }
};

const readVoiceSummary = (userId: string): string => {
  try {
    return speechSettingsStore.read(userId).explicit
      ? 'Your chosen voice'
      : 'Default';
  } catch {
    return 'Unavailable';
  }
};

const DETAILED_SUMMARIES_KEY = 'ai.detailedSummaries';

const readDetailedSummariesEnabled = (userId: string): boolean => {
  try {
    return (
      localSettingsStore.get(userId, DETAILED_SUMMARIES_KEY, 'false') === 'true'
    );
  } catch {
    return false;
  }
};

type ProfileSectionKey =
  | 'reminders'
  | 'assistant'
  | 'voice'
  | 'school'
  | 'look'
  | 'about';

/** The shortcut chips above the settings, in the order the groups appear. */
const PROFILE_SECTIONS: ReadonlyArray<{
  key: ProfileSectionKey;
  title: string;
  short: string;
  icon: React.ComponentType<{size?: number; color?: string}>;
}> = [
  {
    key: 'reminders',
    title: 'Reminders & schedule',
    short: 'Reminders',
    icon: BellRing,
  },
  {
    key: 'assistant',
    title: 'LAFINA assistant',
    short: 'Assistant',
    icon: Sparkles,
  },
  {key: 'voice', title: 'Voice', short: 'Voice', icon: Volume2},
  {key: 'school', title: 'School', short: 'School', icon: School},
  {key: 'look', title: 'Appearance', short: 'Look', icon: Palette},
  {key: 'about', title: 'About & help', short: 'About', icon: Info},
];

const FEATURED_MODERN_THEME_IDS: readonly ModernThemeId[] = [
  'violet',
  'oled',
  'forest',
  'ocean',
];

const FEATURED_AI_BUTTON_DESIGN_IDS: readonly ModernAiButtonDesignId[] = [
  'synth_orb',
  'pulse_wave',
  'orbital_rings',
  'liquid_pearl',
];

interface ProfileScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
  onLogout?: (isGuest?: boolean) => void;
  onNavigateToRegister?: () => void;
  onReplayTour?: () => void;
  onReplayOnboarding?: () => void;
  onResetFromOnboarding?: () => void;
  tourAnchor?: TourAnchor | null;
}

export const ProfileScreen = React.memo(function ProfileScreenView({
  userId,
  refreshTrigger,
  onRefresh,
  onLogout,
  onNavigateToRegister,
  onReplayTour,
  onReplayOnboarding,
  onResetFromOnboarding,
  tourAnchor,
}: ProfileScreenProps) {
  const scrollWrapRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const floatingRowNodeRef = useRef<View | null>(null);
  const attachFloatingRowRef = useCallback((node: View | null) => {
    floatingRowNodeRef.current = node;
    tourTargetRef('profile-floating-row')(node);
  }, []);

  useEffect(() => {
    if (!tourAnchor) return;
    if (tourAnchor === 'tab-profile') {
      scrollRef.current?.scrollTo?.({y: 0, animated: false});
      return;
    }
    if (tourAnchor === 'profile-floating-row') {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const retryDelays = [60, 140];

      const attemptScroll = (attempt: number) => {
        if (cancelled) return;
        void Promise.all([
          measureInWindow(floatingRowNodeRef.current),
          measureInWindow(scrollWrapRef.current),
        ]).then(([rowRect, wrapRect]) => {
          if (cancelled) return;
          if (!rowRect || !wrapRect) {
            if (attempt < retryDelays.length) {
              timer = setTimeout(
                () => attemptScroll(attempt + 1),
                retryDelays[attempt],
              );
            }
            return;
          }
          const contentY = scrollYRef.current + (rowRect.y - wrapRect.y);
          scrollRef.current?.scrollTo?.({
            y: Math.max(0, contentY - 120),
            animated: false,
          });
        });
      };

      const frame = requestAnimationFrame(() => attemptScroll(0));
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
        if (timer) clearTimeout(timer);
      };
    }
  }, [tourAnchor]);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      return userStore.getUserById(userId);
    } catch {
      return null;
    }
  });
  const [academicProfile, setAcademicProfile] =
    useState<AcademicProfileRecord | null>(() => {
      try {
        return getConfirmedAcademicProfile(userId);
      } catch {
        return null;
      }
    });
  const [corReviewOpen, setCorReviewOpen] = useState(false);
  const [studentSetup, setStudentSetup] = useState<StudentSetupState>(() =>
    studentSetupStore.get(userId),
  );
  const [subjectsExpanded, setSubjectsExpanded] = useState(false);

  const [statistics, setStatistics] = useState<DetailedProfileStatistics>(() =>
    profileStatisticsStore.readDetailed(userId),
  );
  const [studentSetupVisible, setStudentSetupVisible] = useState(false);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [healthVisible, setHealthVisible] = useState(false);
  const [alertSettingsVisible, setAlertSettingsVisible] = useState(false);
  const [callSettingsVisible, setCallSettingsVisible] = useState(false);
  const [alertSummary, setAlertSummary] = useState(() =>
    readAlertSettingsSummary(userId),
  );
  const [callSettingsSummary, setCallSettingsSummary] = useState(() =>
    readCallSettingsSummary(userId),
  );
  const [memoryVisible, setMemoryVisible] = useState(false);
  const [chatMemoryVisible, setChatMemoryVisible] = useState(false);
  const readChatMemorySummary = () => {
    try {
      if (!chatMemoryStore.isEnabled(userId)) return 'Off';
      const count = chatMemoryStore.list(userId).length;
      if (count === 0) return 'Nothing saved yet';
      return count === 1 ? '1 thing saved' : `${count} things saved`;
    } catch {
      return 'Unavailable';
    }
  };
  const [chatMemorySummary, setChatMemorySummary] = useState(
    readChatMemorySummary,
  );
  const [eventDefaultsSummary, setEventDefaultsSummary] = useState(() =>
    readEventDefaultsSummary(userId),
  );
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [voiceSummary, setVoiceSummary] = useState(() =>
    readVoiceSummary(userId),
  );
  const [onlineVoiceVisible, setOnlineVoiceVisible] = useState(false);
  const [onlineVoiceSummary, setOnlineVoiceSummary] = useState(() => {
    try {
      return onlineVoiceSettingsStore.read(userId)?.name ?? 'Default voice';
    } catch {
      return 'Choose again';
    }
  });
  const loadOnlineVoiceSummary = () => {
    try {
      setOnlineVoiceSummary(
        onlineVoiceSettingsStore.read(userId)?.name ?? 'Default voice',
      );
    } catch {
      setOnlineVoiceSummary('Choose again');
    }
  };
  // Floating LAFINA (ADR-036)
  const [floatingVisible, setFloatingVisible] = useState(false);
  const {summary: floatingSummary, refresh: refreshFloatingSummary} =
    useFloatingAssistantSummary(userId);

  const [weekStartsMonday, setWeekStartsMonday] = useState(() => {
    try {
      return userStore.getWeekStartsMonday(userId);
    } catch {
      return false;
    }
  });
  const [summaryStyleDetailed, setSummaryStyleDetailed] = useState(() =>
    readDetailedSummariesEnabled(userId),
  );
  const handleDetailedSummariesChange = (enabled: boolean) => {
    setSummaryStyleDetailed(enabled);
    localSettingsStore.set(
      userId,
      DETAILED_SUMMARIES_KEY,
      enabled ? 'true' : 'false',
    );
  };
  const replyFormat = useChatReplyFormat(userId);
  const handleMarkdownRepliesChange = (enabled: boolean) => {
    if (!chatReplyFormatStore.save(userId, enabled ? 'markdown' : 'plain')) {
      Alert.alert(
        'Not saved',
        'Could not save the chat reply format. Try again.',
      );
    }
  };
  const [preferenceSummary, setPreferenceSummary] = useState(() => {
    try {
      const preferences = preferencesStore.get(userId);
      return `${formatReminderLeadLabel(
        preferences.reminderLeadMinutes,
      )} before · ${getSnoozePreferenceLabel(preferences)}`;
    } catch {
      return '15 min before · Snooze once';
    }
  });
  const [preferencesVisible, setPreferencesVisible] = useState(false);

  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [clearDataModalVisible, setClearDataModalVisible] = useState(false);
  const [clearDataAuthority, setClearDataAuthority] =
    useState<DataResetAuthority | null>(null);
  const [clearDataResult, setClearDataResult] =
    useState<ClearDataResultState | null>(null);
  const [developerModalVisible, setDeveloperModalVisible] = useState(false);
  const [isDevMode, setIsDevMode] = useState(() =>
    developerTestService.isDeveloperModeEnabled(),
  );
  const versionTapCountRef = useRef(0);
  const lastVersionTapRef = useRef(0);

  const handleVersionTap = () => {
    const now = Date.now();
    if (now - lastVersionTapRef.current > 2000) {
      versionTapCountRef.current = 0;
    }
    lastVersionTapRef.current = now;
    versionTapCountRef.current += 1;
    if (versionTapCountRef.current >= 5) {
      versionTapCountRef.current = 0;
      const next = !isDevMode;
      developerTestService.setDeveloperModeEnabled(next);
      setIsDevMode(next);
      if (!next) {
        setDeveloperModalVisible(false);
      }
      Alert.alert(
        'Developer Mode',
        next
          ? 'Developer Mode enabled! Test triggers and developer options are now visible.'
          : 'Developer Mode disabled.',
      );
    }
  };

  const handleQuickIncomingCall = async () => {
    const res = await developerTestService.triggerImmediateCall(
      userId,
      'CS402 Capstone Progress Check',
    );
    if (!res.success) {
      Alert.alert('Call Failed', res.message);
    }
  };

  const handleQuickAlarm = async () => {
    const res = await developerTestService.scheduleExactAlarmInSeconds(
      userId,
      5,
      '5-Second Alarm Test',
    );
    Alert.alert(res.success ? 'Alarm Scheduled' : 'Alarm Error', res.message);
    if (res.success) onRefresh();
  };

  const handleQuickSync = async () => {
    Alert.alert('Syncing…', 'Starting sync roundtrip with cloud backend.');
    const res = await developerTestService.triggerForceSync();
    Alert.alert(res.success ? 'Sync Complete' : 'Sync Failed', res.message);
    if (res.success) onRefresh();
  };

  const handleQuickSeedData = async () => {
    const res = await developerTestService.seedStudentSampleData(userId);
    if (res.success) {
      Alert.alert(
        'Student Data Seeded',
        `Created sample tasks (${res.created.tasks}), events (${res.created.events}), block (${res.created.timeBlocks}), reminders (${res.created.reminders}), and notes (${res.created.notes}). Switch tabs to explore!`,
      );
      onRefresh();
    } else {
      Alert.alert('Seeding Error', 'Failed to seed sample student data.');
    }
  };

  const handleClearAllDataAndResetOnboarding = () => {
    promptClearAllDataAndResetOnboarding({
      onSuccess: () => {
        if (onResetFromOnboarding) {
          onResetFromOnboarding();
        } else {
          onLogout?.(true);
        }
      },
    });
  };
  const [ttsTesting, setTtsTesting] = useState(false);
  const [appearanceModalTab, setAppearanceModalTab] =
    useState<AppearancePickerTab | null>(null);
  const [signOutModalVisible, setSignOutModalVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Remediation audit P1: a Clear All Data confirmation is honoured only while
  // this screen is mounted and still shows the account that opened it.
  const alive = useRef(true);
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const {
    colors,
    isDarkMode,
    toggleTheme,
    uiVariant,
    isModern,
    setUIVariant,
    modernPalette,
    modernTheme,
    modernThemeMeta,
    modernThemeExtras,
    modernShadows,
    setModernTheme,
    modernAiButtonDesign,
    modernAiButtonDesignMeta,
    setModernAiButtonDesign,
  } = useTheme();
  const quickThemes = useMemo(() => {
    const ids: ModernThemeId[] = [...FEATURED_MODERN_THEME_IDS];
    if (!ids.includes(modernTheme)) {
      ids[ids.length - 1] = modernTheme;
    }
    return ids
      .map(id => MODERN_THEMES.find(theme => theme.id === id))
      .filter((t): t is (typeof MODERN_THEMES)[number] => Boolean(t));
  }, [modernTheme]);
  const quickAiButtonDesigns = useMemo(() => {
    const ids: ModernAiButtonDesignId[] = [...FEATURED_AI_BUTTON_DESIGN_IDS];
    if (!ids.includes(modernAiButtonDesign)) {
      ids[ids.length - 1] = modernAiButtonDesign;
    }
    return ids
      .map(id => MODERN_AI_BUTTON_DESIGNS.find(design => design.id === id))
      .filter(
        (d): d is (typeof MODERN_AI_BUTTON_DESIGNS)[number] => Boolean(d),
      );
  }, [modernAiButtonDesign]);
  const themed = useThemedStyles(getProfileThemedStyles);
  const cardSurfaceStyle = isModern
    ? [
        themed.settingsGroupCard,
        modernShadows.card,
        {
          borderRadius: ModernLayout.borderRadiusCard,
          borderWidth: 1,
          borderColor: modernPalette.border,
          paddingHorizontal: ModernLayout.cardPadding,
          marginBottom: 14,
        },
      ]
    : [Shadows.card, themed.settingsGroupCard];

  const isGuest = userId === GUEST_USER_ID;
  const photoSource = avatarSource(currentUser?.avatarUri ?? null);
  const [avatarSeed, setAvatarSeed] = useState<string | null>(() =>
    avatarSeedStore.get(userId),
  );
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  const prevUserSetupRef = useRef(userId);
  useEffect(() => {
    if (prevUserSetupRef.current !== userId) {
      prevUserSetupRef.current = userId;
      setSubjectsExpanded(false);
      setAvatarSeed(avatarSeedStore.get(userId));
    }
    const memorySub = DeviceEventEmitter.addListener(
      CHAT_MEMORY_CHANGED_EVENT,
      (event: {userId?: string} | undefined) => {
        if (!event?.userId || event.userId === userId) {
          setChatMemorySummary(readChatMemorySummary());
        }
      },
    );
    const setupUnsub = studentSetupStore.subscribe(changedUserId => {
      if (changedUserId === userId) {
        setStudentSetup(studentSetupStore.get(userId));
      }
    });
    return () => {
      memorySub.remove();
      setupUnsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const prevProfileKeyRef = useRef(`${userId}:${refreshTrigger}`);
  useEffect(() => {
    const nextKey = `${userId}:${refreshTrigger}`;
    if (prevProfileKeyRef.current === nextKey) return;
    prevProfileKeyRef.current = nextKey;
    loadStats();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshTrigger]);

  const loadSettings = () => {
    setCurrentUser(userStore.getUserById(userId));
    setAcademicProfile(getConfirmedAcademicProfile(userId));
    setStudentSetup(studentSetupStore.get(userId));
    setAvatarSeed(avatarSeedStore.get(userId));
    setChatMemorySummary(readChatMemorySummary());
    setSummaryStyleDetailed(readDetailedSummariesEnabled(userId));

    const mondayStart = userStore.getWeekStartsMonday(userId);
    setWeekStartsMonday(mondayStart);

    const preferences = preferencesStore.get(userId);
    setPreferenceSummary(
      `${formatReminderLeadLabel(
        preferences.reminderLeadMinutes,
      )}, ${getSnoozePreferenceLabel(preferences)}`,
    );
    loadEventDefaultsSummary();
    loadVoiceSummary();
    loadOnlineVoiceSummary();
    setAlertSummary(readAlertSettingsSummary(userId));
    setCallSettingsSummary(readCallSettingsSummary(userId));
  };

  const loadVoiceSummary = () => {
    setVoiceSummary(readVoiceSummary(userId));
  };

  const loadEventDefaultsSummary = () => {
    setEventDefaultsSummary(readEventDefaultsSummary(userId));
  };

  const handleToggleWeekStart = (value: boolean) => {
    setWeekStartsMonday(value);
    userStore.setWeekStartsMonday(userId, value);
    onRefresh();
  };

  /**
   * Onboarding redesign: a COR is never saved straight from recognition.
   * Every path (set up, replace, review a legacy profile) opens the full
   * review flow, which adds classes only after the student confirms.
   */
  const handleUploadCor = () => {
    try {
      if (studentSetupStore.get(userId).affiliation !== 'ustp') {
        setStudentSetup(chooseUstpMode(userId));
      }
    } catch (error) {
      console.error('[ProfileScreen] Could not choose USTP mode:', error);
      Alert.alert(
        'Not Saved',
        'That choice could not be saved. Please try again.',
      );
      return;
    }
    setCorReviewOpen(true);
  };

  const closeCorReview = () => {
    setCorReviewOpen(false);
    loadSettings();
    setChatMemorySummary(readChatMemorySummary());
    loadStats();
    onRefresh();
  };

  const switchToSchedulingMode = () => {
    Alert.alert(
      'Use scheduling mode?',
      'USTP features turn off now: handbook answers, school details and academic memory. Your classes stay in your schedule.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Switch',
          onPress: () => {
            try {
              setStudentSetup(chooseNotUstpMode(userId));
              setAcademicProfile(null);
              setChatMemorySummary(readChatMemorySummary());
              onRefresh();
            } catch (error) {
              console.error('[ProfileScreen] Could not switch mode:', error);
              Alert.alert(
                'Not Saved',
                'The mode could not be changed. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const undoLatestCorImport = () => {
    Alert.alert(
      'Undo the last COR import?',
      'Classes added by that import are removed and the earlier state returns. Your other plans are unchanged.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Undo',
          style: 'destructive',
          onPress: () => {
            try {
              corImportStore.undoLatestImport(userId);
              refreshAcademicMemories(userId);
              closeCorReview();
            } catch (error) {
              console.error('[ProfileScreen] COR undo failed:', error);
              Alert.alert(
                'Not Undone',
                'The import could not be undone. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const handleStudentSetup = () => {
    setStudentSetup(studentSetupStore.get(userId));
    setStudentSetupVisible(true);
  };

  const handleTestTtsVoice = async () => {
    if (ttsTesting) {
      return;
    }
    setTtsTesting(true);
    let disposeSpeech: (() => Promise<void>) | undefined;
    try {
      const {createCallSpeechProvider} = require('../../cloud/speechService');
      const provider = createCallSpeechProvider(userId);
      disposeSpeech = provider.dispose;

      Alert.alert('Playing a sample…', 'Turn your media volume up to hear it.');
      const result = await provider.speakText(
        'Hey! This is LAFINA. My voice is working.',
      );
      if (result.source === 'cancelled') {
        Alert.alert('Sample stopped', 'The voice sample was cancelled.');
      } else if (result.source === 'elevenlabs') {
        Alert.alert('Sample finished', 'That was your online voice.');
      } else {
        Alert.alert(
          'Sample finished',
          result.fallbackReason
            ? `That was the phone's own voice. ${result.fallbackReason}`
            : "That was the phone's own voice. Turn on Online in Chat to hear the online voice.",
        );
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[Profile] TTS test failed:', e);
      Alert.alert('Could not play the sample', message);
    } finally {
      await disposeSpeech?.().catch(() => undefined);
      setTtsTesting(false);
    }
  };

  // AGY-PORT 09: counts from actual records; nothing is inferred from words or flags.
  const loadStats = () => {
    setStatistics(profileStatisticsStore.readDetailed(userId));
  };

  const choosePhoto = async () => {
    const result = await pickAvatarImage();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      Alert.alert(
        'Profile Photo',
        'That image could not be used. Please try another one.',
      );
      return;
    }
    const previous = currentUser?.avatarUri ?? null;
    userStore.setAvatarUri(userId, result.uri);
    setCurrentUser(userStore.getUserById(userId));
    await removeAvatarImage(previous);
    onRefresh();
  };

  const clearPhoto = async () => {
    const previous = currentUser?.avatarUri ?? null;
    userStore.setAvatarUri(userId, null);
    setCurrentUser(userStore.getUserById(userId));
    await removeAvatarImage(previous);
    onRefresh();
  };

  const randomizeCharacterAvatar = () => {
    const prevTraits = avatarSeed ? resolveCharacterTraits(avatarSeed) : null;
    let nextSeed = generateAvatarSeed(avatarSeed);
    if (prevTraits) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const nextTraits = resolveCharacterTraits(nextSeed);
        if (areTraitsVisuallyDistinct(prevTraits, nextTraits)) {
          break;
        }
        nextSeed = generateAvatarSeed(nextSeed);
      }
    }
    avatarSeedStore.set(userId, nextSeed);
    setAvatarSeed(nextSeed);
    setCurrentUser(userStore.getUserById(userId));
    onRefresh();
  };

  const switchToRandomCharacter = async () => {
    setAvatarModalVisible(false);
    const previous = currentUser?.avatarUri ?? null;
    if (previous) {
      userStore.setAvatarUri(userId, null);
    }
    randomizeCharacterAvatar();
    if (previous) {
      await removeAvatarImage(previous);
    }
  };

  const resetToDefaultAvatar = async () => {
    setAvatarModalVisible(false);
    const previous = currentUser?.avatarUri ?? null;
    if (previous) {
      userStore.setAvatarUri(userId, null);
    }
    avatarSeedStore.clear(userId);
    setAvatarSeed(null);
    setCurrentUser(userStore.getUserById(userId));
    await removeAvatarImage(previous);
    onRefresh();
  };

  const handleChoosePhotoFromModal = async () => {
    setAvatarModalVisible(false);
    await choosePhoto();
  };

  const handleRemovePhotoFromModal = async () => {
    setAvatarModalVisible(false);
    await clearPhoto();
  };

  const handleEditProfile = () => {
    setAvatarModalVisible(true);
  };

  /**
   * Remediation audit P1/P2 (ADR-025). The confirmation belongs to the sign-in
   * and the screen that opened it; resetPersonalData refuses it otherwise and
   * changes nothing. The result names only the steps it confirmed.
   */
  const confirmClearData = async (authority: DataResetAuthority | null) => {
    const preparation = preparePersonalDataReset(authority);
    const prepared =
      typeof preparation === 'boolean' ? preparation : await preparation;
    const outcome = resetPersonalData(
      prepared ? authority : null,
      () => alive.current && currentUserId.current === authority?.userId,
    );
    if (!outcome.admitted || !authority) {
      if (alive.current) {
        setClearDataResult({
          status: 'not_cleared',
          title: 'Not Cleared',
          message:
            "Nothing was deleted. Your sign-in changed or recording could not be stopped safely. Stop any recording, then reopen Clear All Data for the account you're using now.",
        });
      }
      return;
    }
    // Clear-data audit C1 (ADR-026): every saved attachment cleanup for this
    // owner, from this attempt or an earlier one, gets one bounded pass. Only
    // obligations still saved afterwards count as files not removed. Audit C2:
    // progress the pass could not save is never reported as done.
    const cleanup = hasAttachmentCleanup(authority)
      ? await finishAttachmentCleanup(authority)
      : {removed: 0, pending: 0, interrupted: false, unsaved: 0};
    const personalFiles = hasPersonalFileCleanup(authority.userId)
      ? await finishPersonalFileCleanup(authority)
      : {pending: 0};
    const plannerCleared = outcome.planner === 'cleared';
    const chatCleared = outcome.chat === 'cleared';
    const defaultsCleared = outcome.defaults === 'cleared';
    const filesPending = cleanup.pending;
    const refused = outcome.refusedAttachments;
    const unsaved = cleanup.unsaved;
    const filesConfirmed =
      filesPending === 0 &&
      refused === 0 &&
      unsaved === 0 &&
      personalFiles.pending === 0;

    if (plannerCleared && chatCleared && defaultsCleared && filesConfirmed) {
      if (alive.current) {
        setClearDataResult({
          status: 'cleared',
          title: 'Data Cleared',
          message:
            'All personal scheduling data and saved event defaults have been deleted.',
        });
      }
    } else {
      const done: string[] = [];
      const notDone: string[] = [];
      (plannerCleared ? done : notDone).push(
        'notes, tasks, events, reminders and calendar blocks',
      );
      (chatCleared ? done : notDone).push('chat history');
      (defaultsCleared ? done : notDone).push('saved event defaults');
      const lines = [
        personalFiles.pending === 0
          ? ''
          : 'Some recording or document files could not be confirmed deleted. They remain queued; try Clear All Data again.',
        done.length > 0 ? `Your ${done.join(' and your ')} were cleared.` : '',
        notDone.length > 0
          ? `Your ${notDone.join(' and your ')} were not deleted${
              plannerCleared
                ? ''
                : '; none of those planner records were changed'
            }.`
          : '',
        filesPending === null
          ? 'This phone could not confirm that every chat attachment file was removed.'
          : filesPending > 0
          ? `${filesPending} chat attachment file${
              filesPending === 1 ? '' : 's'
            } could not be removed from this phone's storage yet; Clear All Data keeps ${
              filesPending === 1 ? 'it' : 'them'
            } listed and tries again.`
          : '',
        unsaved > 0
          ? `This phone could not save its cleanup progress for ${unsaved} chat attachment file${
              unsaved === 1 ? '' : 's'
            }; ${
              unsaved === 1 ? 'it stays' : 'they stay'
            } listed for the next Clear All Data.`
          : '',
        cleanup.interrupted
          ? 'The sign-in changed before every file was removed; the rest stay listed for this account.'
          : '',
        refused > 0
          ? `${refused} chat attachment reference${
              refused === 1 ? ' did' : 's did'
            } not point to this app's attachment storage, so ${
              refused === 1 ? 'that file was' : 'those files were'
            } left untouched.`
          : '',
        defaultsCleared
          ? ''
          : 'To remove the saved event defaults, open Event Defaults and choose Forget all event defaults.',
        plannerCleared && chatCleared && filesPending === 0 && unsaved === 0
          ? ''
          : 'Try Clear All Data again.',
        'Device settings such as the offline voice, theme and time format were kept.',
      ];
      if (alive.current) {
        setClearDataResult({
          status: 'partly_cleared',
          title: 'Data Partly Cleared',
          message: lines.filter(Boolean).join(' '),
        });
      }
    }
    if (alive.current) {
      setCurrentUser(userStore.getUserById(userId));
      setAcademicProfile(getConfirmedAcademicProfile(userId));
      setStudentSetup(studentSetupStore.get(userId));
      setChatMemorySummary(readChatMemorySummary());
      loadStats();
      loadEventDefaultsSummary();
      onRefresh();
    }
  };

  const handleClearData = () => {
    // Captured now: a confirmation answered after a sign-in change is refused.
    const authority = authorizeDataReset(userId);
    setClearDataAuthority(authority);
    setClearDataModalVisible(true);
  };

  const handleCancelClearData = () => {
    setClearDataModalVisible(false);
    setClearDataAuthority(null);
  };

  const handleConfirmClearData = () => {
    const authority = clearDataAuthority;
    setClearDataModalVisible(false);
    setClearDataAuthority(null);
    void confirmClearData(authority);
  };

  const handleCreateAccount = () => {
    if (onNavigateToRegister) {
      onNavigateToRegister();
    } else {
      Alert.alert(
        'Create Account',
        'Navigate to Register from the Welcome screen to create an account.',
      );
    }
  };

  /** Sign-ins belong to one server: sign out there before switching. */
  const endSessionForServerSwitch = async () => {
    try {
      await authService.logout();
    } finally {
      void cancelFocusTimer();
      userStore.logout();
    }
  };

  const handleSignOut = () => {
    setSignOutModalVisible(true);
  };

  const handleConfirmSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (!isGuest) {
        await authService.logout();
      }
    } catch (error) {
      console.warn(
        '[Profile] Cloud logout failed, continuing local sign-out:',
        error,
      );
    } finally {
      void cancelFocusTimer();
      userStore.logout();
      if (alive.current) {
        setSigningOut(false);
        setSignOutModalVisible(false);
      }
      if (onLogout) {
        onLogout(isGuest);
      } else {
        Alert.alert(
          'Signed Out',
          'You have been signed out. Sync pipeline suspended.',
        );
      }
    }
  };

  const hasLatestCorImport = useMemo(() => {
    void refreshTrigger;
    void academicProfile;
    void studentSetup;
    try {
      return Boolean(corImportStore.latestActiveImport(userId));
    } catch {
      return false;
    }
  }, [userId, refreshTrigger, academicProfile, studentSetup]);

  const academicSection =
    academicProfile?.primarySection || academicProfile?.section || '';
  const academicTerm =
    academicProfile?.academicYearTerm || academicProfile?.academicTerm || '';
  const academicRows = academicProfile
    ? [
        {label: 'Program', value: academicProfile.program},
        {label: 'Year Level', value: academicProfile.yearLevel},
        {label: 'Section', value: academicSection},
        {
          label: 'College',
          value: formatCollegeDisplay(
            academicProfile.college,
            academicProfile.collegeShort,
          ),
        },
        {label: 'Academic Term', value: academicTerm},
        {label: 'Curriculum', value: academicProfile.curriculum},
      ].filter(row => Boolean(row.value))
    : [];

  // The settings list is long: a row of shortcuts jumps to each group.
  const settingsTopY = useRef(0);
  const mainContentY = useRef(0);
  const sectionY = useRef<Partial<Record<ProfileSectionKey, number>>>({});
  const rememberSection =
    (key: ProfileSectionKey) =>
    (event: {nativeEvent: {layout: {y: number}}}) => {
      sectionY.current[key] = event.nativeEvent.layout.y;
    };
  const jumpToSection = (key: ProfileSectionKey) => {
    const y = sectionY.current[key];
    if (y === undefined) return;
    scrollRef.current?.scrollTo?.({
      y: Math.max(0, mainContentY.current + settingsTopY.current + y - 8),
      animated: true,
    });
  };
  const rowDivider = (
    <View
      style={[
        styles.settingDivider,
        styles.settingDividerInset,
        themed.settingDivider,
      ]}
    />
  );
  const renderGroupHeader = (title: string, hint?: string) => (
    <View style={styles.groupHeaderBlock}>
      <Text
        style={[
          styles.groupHeaderTitle,
          {color: isModern ? modernPalette.text : colors.textPrimary},
        ]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {hint ? (
        <Text
          style={[
            styles.groupHeaderHint,
            {color: isModern ? modernPalette.muted : colors.textSecondary},
          ]}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container} collapsable={false} ref={scrollWrapRef}>
      <ScrollView
        ref={scrollRef}
        style={[styles.container, themed.container]}
        contentContainerStyle={[
          styles.contentContainer,
          isModern && styles.modernContentContainer,
        ]}
        scrollEventThrottle={16}
        onScroll={event => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        showsVerticalScrollIndicator={false}
      >
        {isModern ? (
          <View style={styles.modernTopHeader}>
            <Text
              style={[styles.modernPageTitle, {color: modernPalette.text}]}
              numberOfLines={1}
            >
              Profile
            </Text>
            <View style={styles.modernHeaderActions}>
              <TouchableOpacity
                onPress={() => toggleTheme()}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={
                  isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'
                }
                testID="profile-quick-theme-btn"
                style={[
                  styles.modernHeaderCircleBtn,
                  modernShadows.subtle,
                  {
                    backgroundColor: modernPalette.card,
                    borderColor: modernPalette.border,
                  },
                ]}
              >
                {isDarkMode ? (
                  <Sun size={18} color={modernPalette.text} />
                ) : (
                  <Moon size={18} color={modernPalette.text} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPreferencesVisible(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Open preferences"
                testID="profile-quick-prefs-btn"
                style={[
                  styles.modernHeaderCircleBtn,
                  modernShadows.subtle,
                  {
                    backgroundColor: modernPalette.card,
                    borderColor: modernPalette.border,
                  },
                ]}
              >
                <SlidersHorizontal size={17} color={modernPalette.text} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.headerBackground}>
            <SvgXml
              xml={ARC_SCREEN_XML}
              width="100%"
              height={180}
              preserveAspectRatio="none"
            />
          </View>
        )}

        <View
          style={[
            styles.avatarSection,
            isModern && [
              styles.modernHeroCard,
              modernShadows.card,
              {
                backgroundColor: modernPalette.card,
                borderColor: modernPalette.border,
              },
            ],
          ]}
        >
          {isModern && (
            <View
              style={[
                styles.modernHeroAccentBand,
                {backgroundColor: modernPalette.softViolet},
              ]}
            />
          )}
          <View
            style={[
              styles.avatarWrapper,
              isModern && styles.modernAvatarWrapper,
            ]}
          >
            <TouchableOpacity
              onPress={handleEditProfile}
              activeOpacity={0.85}
              testID="profile-avatar-btn"
              accessibilityRole="button"
              accessibilityLabel={
                photoSource ? 'Change profile photo' : 'Change profile avatar'
              }
              style={[
                styles.avatarCircle,
                isModern && styles.modernAvatarCircle,
                themed.avatarCircle,
                {
                  backgroundColor: isModern
                    ? modernPalette.surface
                    : colors.cardBg,
                  borderColor: isModern ? modernPalette.accent : colors.cardBg,
                },
              ]}
            >
              {photoSource ? (
                <Image
                  source={photoSource}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : avatarSeed ? (
                <CharacterAvatar
                  seed={avatarSeed}
                  size={isModern ? 88 : 112}
                  testID="profile-character-avatar"
                />
              ) : (
                <DefaultProfileAvatar
                  size={isModern ? 88 : 112}
                  isDarkMode={isDarkMode}
                  testID="profile-default-avatar"
                />
              )}
            </TouchableOpacity>
            {!photoSource && Boolean(avatarSeed) && (
              <TouchableOpacity
                onPress={randomizeCharacterAvatar}
                style={[
                  styles.randomizeBadge,
                  isModern && styles.modernAvatarBadge,
                  themed.editBadge,
                  isModern ? modernShadows.subtle : Shadows.card,
                  isModern && {
                    backgroundColor: modernPalette.card,
                    borderColor: modernPalette.border,
                  },
                ]}
                testID="profile-randomize-avatar-btn"
                accessibilityRole="button"
                accessibilityLabel="Randomize character avatar"
              >
                <Dices
                  size={isModern ? 15 : 16}
                  color={isModern ? modernPalette.text : colors.textPrimary}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleEditProfile}
              style={[
                styles.editBadge,
                isModern && styles.modernAvatarBadge,
                themed.editBadge,
                isModern ? modernShadows.subtle : Shadows.card,
                isModern && {
                  backgroundColor: modernPalette.card,
                  borderColor: modernPalette.border,
                },
              ]}
              testID="profile-photo-badge-btn"
              accessibilityRole="button"
              accessibilityLabel={
                photoSource ? 'Change profile photo' : 'Add a profile photo'
              }
            >
              <Camera
                size={isModern ? 15 : 16}
                color={isModern ? modernPalette.text : colors.textPrimary}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.nameRow} testID="profile-identity-block">
            <Text
              style={[
                styles.userName,
                themed.userName,
                isModern && ModernTypography.title,
                styles.userNameAlign,
              ]}
              numberOfLines={2}
              testID="profile-display-name"
            >
              {currentUser?.username?.trim() || 'Student'}
            </Text>
          </View>
          <Text
            style={[
              styles.userEmail,
              themed.userEmail,
              isModern && styles.modernUserEmail,
            ]}
            numberOfLines={1}
            testID="profile-display-email"
          >
            {currentUser?.email ||
              (isGuest ? 'Offline Guest Account' : 'No email set')}
          </Text>
          {academicProfile &&
            (academicProfile.collegeShort ||
              academicProfile.yearLevelShort ||
              academicProfile.yearLevel ||
              academicSection) &&
            (isModern ? (
              <View
                testID="profile-academic-subtitle"
                style={styles.modernHeroAcademicBlock}
              >
                <View style={styles.modernHeroPillsRow}>
                  {academicProfile.collegeShort ? (
                    <View
                      style={[
                        styles.modernHeroPill,
                        {backgroundColor: modernPalette.blueSoft},
                      ]}
                    >
                      <GraduationCap size={12} color={modernPalette.blueInk} />
                      <Text
                        style={[
                          styles.modernHeroPillText,
                          {color: modernPalette.blueInk},
                        ]}
                        numberOfLines={1}
                      >
                        {academicProfile.collegeShort}
                      </Text>
                    </View>
                  ) : null}
                  {academicProfile.yearLevelShort ||
                  academicProfile.yearLevel ? (
                    <View
                      style={[
                        styles.modernHeroPill,
                        {backgroundColor: modernPalette.softViolet},
                      ]}
                    >
                      {!academicProfile.collegeShort && (
                        <GraduationCap size={12} color={modernPalette.accent} />
                      )}
                      <Text
                        style={[
                          styles.modernHeroPillText,
                          {color: modernPalette.accent},
                        ]}
                        numberOfLines={1}
                      >
                        {academicProfile.yearLevelShort ||
                          academicProfile.yearLevel.split(' - ')[0]}
                      </Text>
                    </View>
                  ) : null}
                  {academicSection ? (
                    <View
                      style={[
                        styles.modernHeroPill,
                        {backgroundColor: modernPalette.mint},
                      ]}
                    >
                      <Text
                        style={[
                          styles.modernHeroPillText,
                          {color: modernPalette.mintInk},
                        ]}
                        numberOfLines={1}
                      >
                        {academicSection}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <View
                testID="profile-academic-subtitle"
                style={[
                  styles.academicSubtitlePill,
                  {
                    backgroundColor: colors.cardBg,
                    borderColor: colors.border,
                  },
                ]}
              >
                <GraduationCap
                  size={14}
                  color={colors.blue}
                  style={styles.academicSubtitleIcon}
                />
                <Text
                  style={[
                    styles.academicSubtitleText,
                    {
                      color: colors.textPrimary,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {[
                    academicProfile.program,
                    academicProfile.yearLevelShort || academicProfile.yearLevel,
                    academicSection,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ))}
        </View>

        <View
          style={[styles.mainContent, isModern && styles.modernMainContent]}
          onLayout={event => {
            mainContentY.current = event.nativeEvent.layout.y;
          }}
        >
          {academicProfile && (
            <View
              testID="profile-academic-card"
              style={[
                styles.academicCard,
                ...cardSurfaceStyle,
                isModern && styles.modernAcademicCard,
              ]}
            >
              <View style={styles.academicCardHeader}>
                <View style={styles.academicCardTitleRow}>
                  {isModern ? (
                    <View
                      style={[
                        styles.modernCardIconCircle,
                        {backgroundColor: modernPalette.blueSoft},
                      ]}
                    >
                      <GraduationCap size={18} color={modernPalette.blueInk} />
                    </View>
                  ) : (
                    <GraduationCap
                      size={18}
                      color={colors.blue}
                      style={styles.academicHeaderIcon}
                    />
                  )}
                  <View style={styles.academicCardTitleGroup}>
                    <Text
                      style={[
                        styles.academicCardTitle,
                        isModern && styles.modernCardTitle,
                        {
                          color: isModern
                            ? modernPalette.text
                            : colors.textPrimary,
                        },
                      ]}
                    >
                      Academic Profile
                    </Text>
                    <Text
                      style={[
                        styles.academicCardSubtitle,
                        isModern && styles.modernCardSubtitle,
                        {
                          color: isModern
                            ? modernPalette.muted
                            : colors.textSecondary,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      Reviewed USTP COR
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  testID="profile-attach-cor-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Replace COR"
                  onPress={handleUploadCor}
                  activeOpacity={0.8}
                  style={[
                    styles.academicUpdateBtn,
                    isModern && styles.modernCorPillBtn,
                    {
                      borderColor: isModern
                        ? modernPalette.border
                        : colors.blue,
                      backgroundColor: isModern
                        ? modernPalette.softViolet
                        : 'transparent',
                    },
                  ]}
                >
                  <FileText
                    size={isModern ? 13 : 12}
                    color={isModern ? modernPalette.accent : colors.blue}
                  />
                  <Text
                    style={[
                      styles.academicUpdateBtnText,
                      isModern && styles.modernCorPillBtnText,
                      {color: isModern ? modernPalette.accent : colors.blue},
                    ]}
                  >
                    Replace COR
                  </Text>
                </TouchableOpacity>
              </View>

              {(academicRows.length > 0 ||
                academicProfile.courses.length > 0) && (
                <View style={[styles.settingDivider, themed.settingDivider]} />
              )}

              {academicRows.map((row, index) => (
                <React.Fragment key={row.label}>
                  {index > 0 && (
                    <View
                      style={[styles.settingDivider, themed.settingDivider]}
                    />
                  )}
                  <View
                    style={[
                      styles.academicRow,
                      isModern && styles.modernAcademicRow,
                    ]}
                  >
                    <Text
                      style={[
                        styles.academicLabel,
                        isModern && styles.modernAcademicLabel,
                        {
                          color: isModern
                            ? modernPalette.muted
                            : colors.textSecondary,
                        },
                      ]}
                    >
                      {row.label}
                    </Text>
                    <Text
                      style={[
                        styles.academicValue,
                        isModern && styles.modernAcademicValue,
                        {
                          color: isModern
                            ? modernPalette.text
                            : colors.textPrimary,
                        },
                      ]}
                    >
                      {row.value}
                    </Text>
                  </View>
                </React.Fragment>
              ))}

              {academicProfile.courses.length > 0 ? (
                <>
                  {academicRows.length > 0 && !isModern && (
                    <View
                      style={[styles.settingDivider, themed.settingDivider]}
                    />
                  )}
                  <TouchableOpacity
                    testID="profile-toggle-subjects-btn"
                    accessibilityRole="button"
                    accessibilityState={{expanded: subjectsExpanded}}
                    onPress={() => setSubjectsExpanded(prev => !prev)}
                    activeOpacity={0.75}
                    style={[
                      styles.academicRow,
                      isModern && [
                        styles.modernSubjectsToggleRow,
                        {
                          backgroundColor: modernPalette.surface,
                          borderColor: modernPalette.border,
                        },
                      ],
                    ]}
                  >
                    <View style={styles.modernSubjectsLabelGroup}>
                      {isModern && (
                        <BookOpen size={15} color={modernPalette.accent} />
                      )}
                      <Text
                        style={[
                          styles.academicLabel,
                          isModern && [
                            styles.modernAcademicLabel,
                            styles.modernSubjectsToggleLabel,
                            {color: modernPalette.text},
                          ],
                          !isModern && {color: colors.textSecondary},
                        ]}
                        numberOfLines={1}
                      >
                        Enrolled Subjects
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.academicSubjectsValueWrap,
                        isModern && styles.modernSubjectsValueWrap,
                      ]}
                    >
                      <Text
                        style={[
                          styles.academicSubjectsValue,
                          isModern && styles.modernSubjectsValueText,
                          {
                            color: isModern
                              ? modernPalette.accent
                              : colors.textPrimary,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {academicProfile.courses.length}{' '}
                        {academicProfile.courses.length === 1
                          ? 'subject'
                          : 'subjects'}
                        {academicProfile.totalCreditUnits
                          ? ` (${academicProfile.totalCreditUnits} units)`
                          : ''}
                      </Text>
                      {subjectsExpanded ? (
                        <ChevronUp
                          size={15}
                          color={isModern ? modernPalette.accent : colors.blue}
                        />
                      ) : (
                        <ChevronDown
                          size={15}
                          color={isModern ? modernPalette.accent : colors.blue}
                        />
                      )}
                    </View>
                  </TouchableOpacity>

                  {subjectsExpanded && (
                    <View
                      testID="profile-academic-subjects-list"
                      style={[
                        styles.academicSubjectsList,
                        isModern && styles.modernAcademicSubjectsList,
                        {
                          backgroundColor: isModern
                            ? modernPalette.surface
                            : colors.inputBg,
                          borderColor: isModern
                            ? modernPalette.border
                            : colors.border,
                        },
                      ]}
                    >
                      {academicProfile.courses.map((course, idx) =>
                        isModern ? (
                          <View
                            key={`${course.code}-${course.section}-${idx}`}
                            style={[
                              styles.modernSubjectItem,
                              idx > 0 && [
                                styles.academicSubjectItemBorder,
                                {borderTopColor: modernPalette.border},
                              ],
                            ]}
                          >
                            <View style={styles.modernSubjectTopRow}>
                              <View style={styles.modernSubjectTitleWrap}>
                                <View
                                  style={[
                                    styles.modernSubjectCodeBadge,
                                    {backgroundColor: modernPalette.softViolet},
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.modernSubjectCodeText,
                                      {color: modernPalette.accent},
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {course.code}
                                  </Text>
                                </View>
                                {course.subjectTitle ? (
                                  <Text
                                    style={[
                                      styles.modernSubjectTitle,
                                      {color: modernPalette.text},
                                    ]}
                                  >
                                    {course.subjectTitle}
                                  </Text>
                                ) : null}
                              </View>
                              <View
                                style={[
                                  styles.modernSubjectUnitsPill,
                                  {
                                    backgroundColor: modernPalette.card,
                                    borderColor: modernPalette.border,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.modernSubjectUnitsText,
                                    {color: modernPalette.muted},
                                  ]}
                                  numberOfLines={1}
                                >
                                  {course.creditUnits}{' '}
                                  {course.creditUnits === 1 ? 'unit' : 'units'}
                                </Text>
                              </View>
                            </View>

                            {course.scheduleSummary ? (
                              <View style={styles.modernSubjectDetailRow}>
                                <Clock
                                  size={12}
                                  color={modernPalette.accent}
                                  style={styles.modernSubjectDetailIcon}
                                />
                                <Text
                                  style={[
                                    styles.modernSubjectScheduleText,
                                    {color: modernPalette.text},
                                  ]}
                                >
                                  {course.scheduleSummary}
                                </Text>
                              </View>
                            ) : null}

                            {(course.section ||
                              (course.faculty && course.faculty !== 'TBA')) && (
                              <View style={styles.modernSubjectMetaRow}>
                                {course.section ? (
                                  <View
                                    style={[
                                      styles.modernSubjectSectionChip,
                                      {backgroundColor: modernPalette.mint},
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.modernSubjectSectionText,
                                        {color: modernPalette.mintInk},
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {course.section}
                                    </Text>
                                  </View>
                                ) : null}
                                {course.faculty && course.faculty !== 'TBA' ? (
                                  <View style={styles.modernSubjectFacultyRow}>
                                    <UserIcon
                                      size={11.5}
                                      color={modernPalette.muted}
                                    />
                                    <Text
                                      style={[
                                        styles.modernSubjectFacultyText,
                                        {color: modernPalette.muted},
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {formatFacultyDisplay(course.faculty)}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            )}
                          </View>
                        ) : (
                          <View
                            key={`${course.code}-${course.section}-${idx}`}
                            style={[
                              styles.academicSubjectItem,
                              idx > 0 && [
                                styles.academicSubjectItemBorder,
                                {borderTopColor: colors.divider},
                              ],
                            ]}
                          >
                            <View style={styles.academicSubjectTopRow}>
                              <Text
                                style={[
                                  styles.academicSubjectTitle,
                                  {color: colors.textPrimary},
                                ]}
                              >
                                <Text style={{color: colors.blue}}>
                                  {course.code}
                                </Text>
                                {course.subjectTitle
                                  ? ` · ${course.subjectTitle}`
                                  : ''}
                              </Text>
                              <Text
                                style={[
                                  styles.academicSubjectUnits,
                                  {color: colors.textSecondary},
                                ]}
                              >
                                {course.creditUnits}{' '}
                                {course.creditUnits === 1 ? 'unit' : 'units'}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.academicSubjectMeta,
                                {color: colors.textSecondary},
                              ]}
                            >
                              {[
                                course.scheduleSummary,
                                course.section,
                                course.faculty && course.faculty !== 'TBA'
                                  ? course.faculty
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          </View>
                        ),
                      )}
                    </View>
                  )}
                </>
              ) : academicProfile.totalCreditUnits ? (
                <>
                  {academicRows.length > 0 && (
                    <View
                      style={[styles.settingDivider, themed.settingDivider]}
                    />
                  )}
                  <View
                    style={[
                      styles.academicRow,
                      isModern && styles.modernAcademicRow,
                    ]}
                  >
                    <Text
                      style={[
                        styles.academicLabel,
                        isModern && styles.modernAcademicLabel,
                        {
                          color: isModern
                            ? modernPalette.muted
                            : colors.textSecondary,
                        },
                      ]}
                    >
                      Total Units
                    </Text>
                    <Text
                      style={[
                        styles.academicValue,
                        isModern && styles.modernAcademicValue,
                        {
                          color: isModern
                            ? modernPalette.text
                            : colors.textPrimary,
                        },
                      ]}
                    >
                      {academicProfile.totalCreditUnits} units
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          )}

          <ProfileStats
            statistics={statistics}
            onPressViewStats={() => setStatsModalVisible(true)}
          />

          <View
            style={[
              styles.settingsContainer,
              isModern && styles.modernSettingsContainer,
            ]}
            onLayout={event => {
              settingsTopY.current = event.nativeEvent.layout.y;
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sectionJumpRow}
              style={styles.sectionJumpScroll}
              testID="profile-section-jump"
            >
              {PROFILE_SECTIONS.map(section => {
                const SectionIcon = section.icon;
                return (
                  <TouchableOpacity
                    key={section.key}
                    onPress={() => jumpToSection(section.key)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to ${section.title}`}
                    testID={`profile-jump-${section.key}`}
                    style={[
                      styles.sectionJumpChip,
                      {
                        backgroundColor: isModern
                          ? modernPalette.card
                          : colors.cardBg,
                        borderColor: isModern
                          ? modernPalette.border
                          : colors.border,
                      },
                    ]}
                  >
                    <SectionIcon
                      size={14}
                      color={isModern ? modernPalette.accent : colors.primary}
                    />
                    <Text
                      style={[
                        styles.sectionJumpText,
                        {
                          color: isModern
                            ? modernPalette.text
                            : colors.textPrimary,
                        },
                      ]}
                    >
                      {section.short}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View onLayout={rememberSection('reminders')}>
              {renderGroupHeader(
                'Reminders & schedule',
                'How and when LAFINA reminds you',
              )}
              <View
                style={[
                  styles.settingsGroupCard,
                  cardSurfaceStyle,
                  themed.settingsGroupCard,
                ]}
              >
                <SettingItem
                  text="Reminder timing"
                  subtitle={preferenceSummary}
                  icon={CalendarClock}
                  tone="violet"
                  onPress={() => setPreferencesVisible(true)}
                />
                {rowDivider}
                <SettingItem
                  text="Alerts & sounds"
                  subtitle={alertSummary}
                  icon={BellRing}
                  tone="peach"
                  onPress={() => setAlertSettingsVisible(true)}
                />
                {rowDivider}
                <SettingItem
                  text="Reminder calls"
                  subtitle={callSettingsSummary}
                  icon={PhoneCall}
                  tone="mint"
                  onPress={() => setCallSettingsVisible(true)}
                />
                {rowDivider}
                <SettingItem
                  text="Check my reminders work"
                  subtitle="Phone permissions and battery"
                  icon={ShieldCheck}
                  tone="blue"
                  onPress={() => setHealthVisible(true)}
                />
                {rowDivider}
                <SettingItem
                  text="New event defaults"
                  subtitle={eventDefaultsSummary}
                  icon={Clock}
                  tone="lilac"
                  onPress={() => setMemoryVisible(true)}
                />
                {rowDivider}
                <SettingItem
                  text="Week starts on Monday"
                  type="toggle"
                  icon={CalendarDays}
                  tone="cream"
                  value={weekStartsMonday}
                  onValueChange={handleToggleWeekStart}
                />
              </View>
            </View>

            <View onLayout={rememberSection('assistant')}>
              {renderGroupHeader(
                'LAFINA assistant',
                'How LAFINA talks with you',
              )}
              <View
                style={[
                  styles.settingsGroupCard,
                  cardSurfaceStyle,
                  themed.settingsGroupCard,
                ]}
              >
                <SettingItem
                  text="What LAFINA remembers"
                  subtitle={chatMemorySummary}
                  icon={Brain}
                  tone="violet"
                  onPress={() => setChatMemoryVisible(true)}
                  testID="profile-memory-row"
                />
                {rowDivider}
                <View collapsable={false} ref={attachFloatingRowRef}>
                  <SettingItem
                    text="Floating LAFINA"
                    subtitle={floatingSummary}
                    icon={MessageCircle}
                    tone="blue"
                    onPress={() => setFloatingVisible(true)}
                  />
                </View>
                {rowDivider}
                <SettingItem
                  text="Detailed answers"
                  subtitle="Longer summaries with more detail"
                  type="toggle"
                  icon={AlignLeft}
                  tone="lilac"
                  value={summaryStyleDetailed}
                  onValueChange={handleDetailedSummariesChange}
                />
                {rowDivider}
                <SettingItem
                  text="Neat answer formatting"
                  subtitle="Bold words, lists and headings"
                  type="toggle"
                  icon={Type}
                  tone="mint"
                  value={replyFormat === 'markdown'}
                  onValueChange={handleMarkdownRepliesChange}
                />
              </View>
            </View>

            <View onLayout={rememberSection('voice')}>
              {renderGroupHeader('Voice', 'How LAFINA sounds')}
              <View
                style={[
                  styles.settingsGroupCard,
                  cardSurfaceStyle,
                  themed.settingsGroupCard,
                ]}
              >
                <SettingItem
                  text="Voice without internet"
                  subtitle={voiceSummary}
                  icon={Volume2}
                  tone="peach"
                  onPress={() => setVoiceVisible(true)}
                />
                {rowDivider}
                <SettingItem
                  text="Online voice"
                  subtitle={onlineVoiceSummary}
                  icon={AudioLines}
                  tone="violet"
                  onPress={() => setOnlineVoiceVisible(true)}
                />
                {rowDivider}
                <SettingItem
                  text={
                    ttsTesting ? 'Playing a sample…' : 'Play a voice sample'
                  }
                  subtitle="Hear how LAFINA sounds now"
                  type="clickable"
                  icon={Play}
                  tone="mint"
                  onPress={handleTestTtsVoice}
                />
              </View>
            </View>

            <View onLayout={rememberSection('school')}>
              {renderGroupHeader('School', 'Your school and class schedule')}
              <View
                style={[
                  styles.settingsGroupCard,
                  cardSurfaceStyle,
                  themed.settingsGroupCard,
                ]}
              >
                <SettingItem
                  text="School setup"
                  subtitle={
                    studentSetup.affiliation === 'ustp'
                      ? academicProfile
                        ? 'USTP · COR confirmed'
                        : studentSetup.corStatus === 'needs_review'
                        ? 'USTP · COR needs checking'
                        : 'USTP · COR not added yet'
                      : studentSetup.affiliation === 'not_ustp'
                      ? 'Schedule only (not USTP)'
                      : 'Not chosen yet'
                  }
                  icon={GraduationCap}
                  tone="blue"
                  onPress={handleStudentSetup}
                />
                {hasLatestCorImport ? (
                  <>
                    {rowDivider}
                    <SettingItem
                      text="Undo last COR upload"
                      subtitle="Removes only the classes from that upload"
                      icon={Undo2}
                      tone="peach"
                      onPress={undoLatestCorImport}
                    />
                  </>
                ) : null}
              </View>
            </View>

            <View onLayout={rememberSection('look')}>
              {renderGroupHeader('Appearance', 'Colors and style')}
              <View style={[styles.settingsGroupCard, ...cardSurfaceStyle]}>
                <SettingItem
                  text="Dark Mode"
                  type="toggle"
                  icon={isDarkMode ? Moon : Sun}
                  tone="lilac"
                  value={isDarkMode}
                  onValueChange={(_enabled, origin) => toggleTheme(origin)}
                />
                {isModern && (
                  <>
                    <View
                      style={[
                        styles.settingDivider,
                        {backgroundColor: colors.divider},
                      ]}
                    />
                    <View
                      style={styles.themePickerBlock}
                      testID="modern-theme-selector"
                    >
                      <View style={styles.themePickerHeader}>
                        <View style={styles.themePickerHeaderCopy}>
                          <Text
                            style={[
                              styles.interfaceTitle,
                              {color: colors.textPrimary},
                            ]}
                          >
                            Color Theme
                          </Text>
                          <Text
                            style={[
                              styles.themePickerSubtitle,
                              {color: colors.textSecondary},
                            ]}
                          >
                            Pick the colors for the whole app
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.themeActiveBadge,
                            {backgroundColor: modernPalette.softViolet},
                          ]}
                          testID="modern-theme-active-badge"
                        >
                          <Text
                            style={[
                              styles.themeActiveBadgeText,
                              {color: modernPalette.accent},
                            ]}
                          >
                            {modernThemeMeta.label}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={styles.themeGrid}
                        accessibilityRole="radiogroup"
                        accessibilityLabel="Color theme"
                      >
                        {quickThemes.map(theme => {
                          const active = modernTheme === theme.id;
                          const preview = isDarkMode
                            ? theme.previewDark
                            : theme.previewLight;
                          return (
                            <TouchableOpacity
                              key={theme.id}
                              testID={`modern-theme-${theme.id}`}
                              accessibilityRole="radio"
                              accessibilityState={{
                                checked: active,
                                selected: active,
                              }}
                              accessibilityLabel={`${theme.label} theme — ${theme.subtitle}`}
                              activeOpacity={0.8}
                              onPress={() => setModernTheme(theme.id)}
                              style={[
                                styles.themeTile,
                                {
                                  backgroundColor: active
                                    ? modernPalette.softViolet
                                    : modernPalette.surface,
                                  borderColor: active
                                    ? modernPalette.accent
                                    : modernPalette.border,
                                },
                              ]}
                            >
                              <View style={styles.themeSwatchCluster}>
                                <View
                                  style={[
                                    styles.themeSwatchPrimary,
                                    {
                                      backgroundColor: preview[0],
                                      borderColor: modernPalette.card,
                                    },
                                  ]}
                                />
                                <View
                                  style={[
                                    styles.themeSwatchSecondary,
                                    {
                                      backgroundColor: preview[1],
                                      borderColor: modernPalette.card,
                                    },
                                  ]}
                                />
                              </View>
                              <View style={styles.themeTileTextCol}>
                                <View style={styles.themeTileTitleRow}>
                                  <Text
                                    style={[
                                      styles.themeTileLabel,
                                      {
                                        color: active
                                          ? modernPalette.accent
                                          : colors.textPrimary,
                                      },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {theme.label}
                                  </Text>
                                  {theme.badge ? (
                                    <View
                                      style={[
                                        styles.themeTileBadge,
                                        {
                                          backgroundColor: active
                                            ? modernPalette.accent
                                            : modernPalette.card,
                                          borderColor: modernPalette.border,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.themeTileBadgeText,
                                          {
                                            color: active
                                              ? '#FFFFFF'
                                              : colors.textSecondary,
                                          },
                                        ]}
                                      >
                                        {theme.badge}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                                <Text
                                  style={[
                                    styles.themeTileSubtitle,
                                    {color: colors.textSecondary},
                                  ]}
                                  numberOfLines={1}
                                >
                                  {theme.subtitle}
                                </Text>
                              </View>
                              {active && (
                                <View
                                  style={[
                                    styles.themeTileCheck,
                                    {backgroundColor: modernPalette.accent},
                                  ]}
                                >
                                  <Check
                                    size={10}
                                    color="#FFFFFF"
                                    strokeWidth={3}
                                  />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <TouchableOpacity
                        testID="modern-theme-more-button"
                        accessibilityRole="button"
                        accessibilityLabel={`More color themes, ${MODERN_THEMES.length} available`}
                        activeOpacity={0.8}
                        onPress={() => setAppearanceModalTab('themes')}
                        style={[
                          styles.themeMoreButton,
                          {
                            backgroundColor: modernPalette.surface,
                            borderColor: modernPalette.border,
                          },
                        ]}
                      >
                        <View style={styles.themeMoreButtonLeft}>
                          <Palette size={15} color={modernPalette.accent} />
                          <Text
                            style={[
                              styles.themeMoreButtonText,
                              {color: colors.textPrimary},
                            ]}
                          >
                            More themes
                          </Text>
                          <Text
                            style={[
                              styles.themeMoreButtonCount,
                              {color: colors.textSecondary},
                            ]}
                          >
                            {MODERN_THEMES.length} styles
                          </Text>
                        </View>
                        <ChevronRight size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    <View
                      style={[
                        styles.settingDivider,
                        {backgroundColor: colors.divider},
                      ]}
                    />
                    <View
                      style={styles.themePickerBlock}
                      testID="modern-ai-button-selector"
                    >
                      <View style={styles.themePickerHeader}>
                        <View style={styles.themePickerHeaderCopy}>
                          <Text
                            style={[
                              styles.interfaceTitle,
                              {color: colors.textPrimary},
                            ]}
                          >
                            AI Button Design
                          </Text>
                          <Text
                            style={[
                              styles.themePickerSubtitle,
                              {color: colors.textSecondary},
                            ]}
                          >
                            The look of the AI button in the tab bar
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.themeActiveBadge,
                            {backgroundColor: modernPalette.softViolet},
                          ]}
                          testID="modern-ai-button-active-badge"
                        >
                          <Text
                            style={[
                              styles.themeActiveBadgeText,
                              {color: modernPalette.accent},
                            ]}
                          >
                            {modernAiButtonDesignMeta.label}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={styles.themeGrid}
                        accessibilityRole="radiogroup"
                        accessibilityLabel="AI button design"
                      >
                        {quickAiButtonDesigns.map(design => {
                          const active = modernAiButtonDesign === design.id;
                          return (
                            <TouchableOpacity
                              key={design.id}
                              testID={`modern-ai-button-${design.id}`}
                              accessibilityRole="radio"
                              accessibilityState={{
                                checked: active,
                                selected: active,
                              }}
                              accessibilityLabel={`${design.label}${
                                design.animated ? ' (Animated)' : ''
                              } AI button — ${design.subtitle}`}
                              activeOpacity={0.8}
                              onPress={() => setModernAiButtonDesign(design.id)}
                              style={[
                                styles.themeTile,
                                {
                                  backgroundColor: active
                                    ? modernPalette.softViolet
                                    : modernPalette.surface,
                                  borderColor: active
                                    ? modernPalette.accent
                                    : modernPalette.border,
                                },
                              ]}
                            >
                              <LafinaSynthOrb
                                design={design.id}
                                size={28}
                                isActive={active}
                                isDarkMode={isDarkMode}
                                modernTheme={modernTheme}
                                modernPalette={modernPalette}
                                modernThemeExtras={modernThemeExtras}
                                animate={false}
                                testID={`modern-ai-button-preview-${design.id}`}
                              />
                              <View style={styles.themeTileTextCol}>
                                <View style={styles.themeTileTitleRow}>
                                  <Text
                                    style={[
                                      styles.themeTileLabel,
                                      {
                                        color: active
                                          ? modernPalette.accent
                                          : colors.textPrimary,
                                      },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {design.label}
                                  </Text>
                                  {design.animated ? (
                                    <Sparkles
                                      size={10}
                                      color={modernPalette.accent}
                                    />
                                  ) : null}
                                </View>
                                <Text
                                  style={[
                                    styles.themeTileSubtitle,
                                    {color: colors.textSecondary},
                                  ]}
                                  numberOfLines={1}
                                >
                                  {design.subtitle}
                                </Text>
                              </View>
                              {active && (
                                <View
                                  style={[
                                    styles.themeTileCheck,
                                    {backgroundColor: modernPalette.accent},
                                  ]}
                                >
                                  <Check
                                    size={10}
                                    color="#FFFFFF"
                                    strokeWidth={3}
                                  />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <TouchableOpacity
                        testID="modern-ai-button-more-button"
                        accessibilityRole="button"
                        accessibilityLabel={`More AI button designs, ${MODERN_AI_BUTTON_DESIGNS.length} available`}
                        activeOpacity={0.8}
                        onPress={() => setAppearanceModalTab('ai_button')}
                        style={[
                          styles.themeMoreButton,
                          {
                            backgroundColor: modernPalette.surface,
                            borderColor: modernPalette.border,
                          },
                        ]}
                      >
                        <View style={styles.themeMoreButtonLeft}>
                          <Sparkles size={15} color={modernPalette.accent} />
                          <Text
                            style={[
                              styles.themeMoreButtonText,
                              {color: colors.textPrimary},
                            ]}
                          >
                            More designs
                          </Text>
                          <Text
                            style={[
                              styles.themeMoreButtonCount,
                              {color: colors.textSecondary},
                            ]}
                          >
                            {MODERN_AI_BUTTON_DESIGNS.length} · incl. animated
                          </Text>
                        </View>
                        <ChevronRight size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </View>

            {isDevMode && (
              <>
                {renderGroupHeader('Developer', 'Testing tools')}
                <View
                  style={[
                    styles.settingsGroupCard,
                    cardSurfaceStyle,
                    themed.settingsGroupCard,
                  ]}
                >
                  <View style={styles.interfaceSelectorBlock}>
                    <Text
                      style={[
                        styles.interfaceTitle,
                        {color: colors.textPrimary},
                      ]}
                    >
                      App Interface
                    </Text>
                    <Text
                      style={[
                        styles.interfaceSubtitle,
                        {color: colors.textSecondary},
                      ]}
                    >
                      Choose how LAFINA looks
                    </Text>
                    <View style={styles.interfaceCardsRow}>
                      <TouchableOpacity
                        testID="ui-variant-modern"
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked: uiVariant === 'modern',
                          selected: uiVariant === 'modern',
                        }}
                        accessibilityLabel="Modern — UniGuide-inspired interface"
                        activeOpacity={0.8}
                        onPress={() => setUIVariant('modern')}
                        style={[
                          styles.interfaceCard,
                          {
                            backgroundColor:
                              uiVariant === 'modern'
                                ? modernPalette.softViolet
                                : colors.inputBg,
                            borderColor:
                              uiVariant === 'modern'
                                ? modernPalette.accent
                                : colors.border,
                          },
                        ]}
                      >
                        <View style={styles.interfaceCardTop}>
                          <Sparkles
                            size={16}
                            color={
                              uiVariant === 'modern'
                                ? modernPalette.accent
                                : colors.textSecondary
                            }
                          />
                          {uiVariant === 'modern' && (
                            <View
                              style={[
                                styles.interfaceCheckBadge,
                                {backgroundColor: modernPalette.accent},
                              ]}
                            >
                              <Check
                                size={11}
                                color="#FFFFFF"
                                strokeWidth={3}
                              />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.interfaceCardTitle,
                            {
                              color:
                                uiVariant === 'modern'
                                  ? modernPalette.accent
                                  : colors.textPrimary,
                            },
                          ]}
                        >
                          Modern
                        </Text>
                        <Text
                          style={[
                            styles.interfaceCardDesc,
                            {color: colors.textSecondary},
                          ]}
                        >
                          UniGuide-inspired interface
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        testID="ui-variant-classic"
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked: uiVariant === 'classic',
                          selected: uiVariant === 'classic',
                        }}
                        accessibilityLabel="Classic — Original LAFINA interface"
                        activeOpacity={0.8}
                        onPress={() => setUIVariant('classic')}
                        style={[
                          styles.interfaceCard,
                          {
                            backgroundColor:
                              uiVariant === 'classic'
                                ? colors.primary + '14'
                                : colors.inputBg,
                            borderColor:
                              uiVariant === 'classic'
                                ? colors.primary
                                : colors.border,
                          },
                        ]}
                      >
                        <View style={styles.interfaceCardTop}>
                          <LayoutGrid
                            size={16}
                            color={
                              uiVariant === 'classic'
                                ? colors.primary
                                : colors.textSecondary
                            }
                          />
                          {uiVariant === 'classic' && (
                            <View
                              style={[
                                styles.interfaceCheckBadge,
                                {backgroundColor: colors.primary},
                              ]}
                            >
                              <Check
                                size={11}
                                color="#FFFFFF"
                                strokeWidth={3}
                              />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.interfaceCardTitle,
                            {
                              color:
                                uiVariant === 'classic'
                                  ? colors.primary
                                  : colors.textPrimary,
                            },
                          ]}
                        >
                          Classic
                        </Text>
                        <Text
                          style={[
                            styles.interfaceCardDesc,
                            {color: colors.textSecondary},
                          ]}
                        >
                          Original LAFINA interface
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View
                    style={[styles.settingDivider, themed.settingDivider]}
                  />
                  <SettingItem
                    text="Developer Testing Hub"
                    type="link"
                    valueText="Triggers & Diagnostics"
                    onPress={() => setDeveloperModalVisible(true)}
                  />
                  <View
                    style={[styles.settingDivider, themed.settingDivider]}
                  />
                  <SettingItem
                    text="Simulate Incoming Call (Now)"
                    type="clickable"
                    onPress={handleQuickIncomingCall}
                  />
                  <View
                    style={[styles.settingDivider, themed.settingDivider]}
                  />
                  <SettingItem
                    text="Schedule Native Alarm (in 5s)"
                    type="clickable"
                    onPress={handleQuickAlarm}
                  />
                  <View
                    style={[styles.settingDivider, themed.settingDivider]}
                  />
                  <SettingItem
                    text="Force Cloud Sync Now"
                    type="clickable"
                    onPress={handleQuickSync}
                  />
                  <View
                    style={[styles.settingDivider, themed.settingDivider]}
                  />
                  <SettingItem
                    text="Seed Sample Student Data"
                    type="clickable"
                    onPress={handleQuickSeedData}
                  />
                  {backendSelection.isAvailable() && (
                    <>
                      <View
                        style={[styles.settingDivider, themed.settingDivider]}
                      />
                      <ServerSwitchItem
                        isGuest={isGuest}
                        endSession={endSessionForServerSwitch}
                        onSessionEnded={() => onLogout?.(false)}
                      />
                    </>
                  )}
                  {onReplayOnboarding && (
                    <>
                      <View
                        style={[styles.settingDivider, themed.settingDivider]}
                      />
                      <SettingItem
                        text="Replay onboarding"
                        type="link"
                        onPress={onReplayOnboarding}
                      />
                    </>
                  )}
                  <View
                    style={[styles.settingDivider, themed.settingDivider]}
                  />
                  <SettingItem
                    text="Clear all data & reset onboarding"
                    type="clickable"
                    isDestructive
                    onPress={handleClearAllDataAndResetOnboarding}
                  />
                </View>
              </>
            )}

            <View onLayout={rememberSection('about')}>
              {renderGroupHeader('About & help')}
              <View
                style={[
                  styles.settingsGroupCard,
                  cardSurfaceStyle,
                  themed.settingsGroupCard,
                ]}
              >
                <SettingItem
                  text="App version"
                  type="value"
                  icon={Info}
                  tone="blue"
                  valueText={APP_VERSION}
                  onPress={handleVersionTap}
                />
                {rowDivider}
                <AppUpdateItem />
                {rowDivider}
                {onReplayTour && (
                  <>
                    <SettingItem
                      text="Show the walkthrough again"
                      subtitle="A quick tour of every tab"
                      icon={Compass}
                      tone="violet"
                      onPress={onReplayTour}
                    />
                    {rowDivider}
                  </>
                )}
                <SettingItem
                  text="Privacy Policy"
                  icon={Lock}
                  tone="lilac"
                  onPress={() => setPrivacyModalVisible(true)}
                />
              </View>
            </View>

            {renderGroupHeader('Your data')}
            <View
              style={[
                styles.settingsGroupCard,
                cardSurfaceStyle,
                themed.settingsGroupCard,
                styles.clearDataGroupCard,
                isModern && styles.modernLastGroupCard,
              ]}
            >
              <TouchableOpacity
                testID="profile-clear-all-data-btn"
                onPress={handleClearData}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel="Clear All Data"
                style={styles.clearDataActionRow}
              >
                <View
                  style={[
                    styles.clearDataIconBadge,
                    {
                      backgroundColor: isModern
                        ? modernPalette.dangerSoft
                        : colors.bannerBg,
                      borderColor: isModern
                        ? `${modernPalette.danger}2E`
                        : `${colors.error}2E`,
                      borderRadius: isModern ? 12 : 10,
                    },
                  ]}
                >
                  <Trash2
                    size={17}
                    color={isModern ? modernPalette.danger : colors.error}
                  />
                </View>
                <View style={styles.clearDataTextCol}>
                  <Text
                    style={[
                      styles.clearDataTitle,
                      {color: isModern ? modernPalette.danger : colors.error},
                    ]}
                  >
                    Clear All Data
                  </Text>
                  <Text
                    style={[
                      styles.clearDataSubtitle,
                      {
                        color: isModern
                          ? modernPalette.muted
                          : colors.textSecondary,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    Delete notes, tasks, schedule, chats &amp; event defaults
                  </Text>
                </View>
                <ChevronRight
                  size={17}
                  color={isModern ? modernPalette.danger : colors.error}
                />
              </TouchableOpacity>
            </View>
          </View>

          {isGuest ? (
            <View
              style={[
                styles.guestPromptCard,
                ...cardSurfaceStyle,
                isModern && styles.modernGuestPromptCard,
              ]}
            >
              <Text style={[styles.guestPromptTitle, themed.settingText]}>
                Save & Sync Your Data
              </Text>
              <Text style={[styles.guestPromptBody, themed.settingValue]}>
                Create an account or sign in to back up your schedule across
                devices and use Online AI mode.
              </Text>
              <TouchableOpacity
                onPress={handleCreateAccount}
                style={[
                  styles.createAccountBtn,
                  themed.createAccountBtn,
                  isModern && {
                    backgroundColor: modernPalette.accent,
                    borderRadius: ModernLayout.borderRadiusPill,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.createAccountBtnText,
                    themed.createAccountBtnText,
                  ]}
                >
                  Create Account
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSignOut}
                style={styles.signOutLink}
              >
                <Text style={[styles.signOutLinkText, themed.signOutLinkText]}>
                  Dismiss Guest & Sign Out
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleSignOut}
              activeOpacity={0.82}
              style={[
                styles.signOutBtn,
                themed.signOutBtn,
                isModern && {
                  borderColor: modernPalette.danger + '38',
                  backgroundColor: modernPalette.dangerSoft,
                  borderRadius: ModernLayout.borderRadiusPill,
                  borderWidth: 1,
                  flexDirection: 'row',
                  gap: 8,
                },
              ]}
            >
              {isModern && <LogOut size={16} color={modernPalette.danger} />}
              <Text
                style={[
                  styles.signOutText,
                  themed.signOutText,
                  isModern && {color: modernPalette.danger},
                ]}
              >
                Sign Out
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <ScreenOverlays>
          {preferencesVisible && (
            <Modal
              visible={preferencesVisible}
              animationType="slide"
              onRequestClose={() => setPreferencesVisible(false)}
            >
              <PreferencesSettingsScreen
                userId={userId}
                onBack={() => setPreferencesVisible(false)}
                onSaved={(_preferences: UserPreferences) => {
                  loadSettings();
                  onRefresh();
                }}
              />
            </Modal>
          )}
          {corReviewOpen && (
            <Modal
              visible
              animationType="slide"
              onRequestClose={closeCorReview}
              testID="profile-cor-review-modal"
            >
              <CorReviewFlow userId={userId} onClose={closeCorReview} />
            </Modal>
          )}
          {avatarModalVisible && (
            <ProfileAvatarModal
              visible={avatarModalVisible}
              photoSource={photoSource}
              avatarSeed={avatarSeed}
              isGuest={isGuest}
              onClose={() => setAvatarModalVisible(false)}
              onUseCharacter={() => void switchToRandomCharacter()}
              onChoosePhoto={() => void handleChoosePhotoFromModal()}
              onRemovePhoto={() => void handleRemovePhotoFromModal()}
              onResetToDefault={() => void resetToDefaultAvatar()}
            />
          )}
          {privacyModalVisible && (
            <PrivacyModal
              visible={privacyModalVisible}
              onClose={() => setPrivacyModalVisible(false)}
            />
          )}
          {clearDataModalVisible && (
            <ClearAllDataModal
              visible={clearDataModalVisible}
              onCancel={handleCancelClearData}
              onConfirm={handleConfirmClearData}
            />
          )}
          {Boolean(clearDataResult) && (
            <ClearDataResultModal
              visible={Boolean(clearDataResult)}
              result={clearDataResult}
              onClose={() => setClearDataResult(null)}
            />
          )}
          {studentSetupVisible && (
            <StudentSetupModal
              visible={studentSetupVisible}
              setup={studentSetup}
              eligible={getUstpEligibility(userId).eligible}
              onClose={() => setStudentSetupVisible(false)}
              onUploadCor={() => {
                setStudentSetupVisible(false);
                handleUploadCor();
              }}
              onSwitchMode={() => {
                setStudentSetupVisible(false);
                switchToSchedulingMode();
              }}
            />
          )}
          {statsModalVisible && (
            <ProfileStatsModal
              visible={statsModalVisible}
              statistics={statistics}
              onClose={() => setStatsModalVisible(false)}
            />
          )}
          {healthVisible && (
            <ReminderHealth
              userId={userId}
              visible={healthVisible}
              onClose={() => setHealthVisible(false)}
            />
          )}
          {alertSettingsVisible && (
            <AlertAndNotificationSettings
              userId={userId}
              visible={alertSettingsVisible}
              onClose={() => {
                setAlertSettingsVisible(false);
                setAlertSummary(readAlertSettingsSummary(userId));
              }}
              onChanged={() => {
                setAlertSummary(readAlertSettingsSummary(userId));
                setCallSettingsSummary(readCallSettingsSummary(userId));
              }}
            />
          )}
          {callSettingsVisible && (
            <ReminderCallSettings
              userId={userId}
              visible={callSettingsVisible}
              onClose={() => {
                setCallSettingsVisible(false);
                setCallSettingsSummary(readCallSettingsSummary(userId));
              }}
              onChanged={() => {
                setCallSettingsSummary(readCallSettingsSummary(userId));
                setAlertSummary(readAlertSettingsSummary(userId));
              }}
              onOpenOfflineVoice={() => {
                setCallSettingsVisible(false);
                setVoiceVisible(true);
              }}
              onOpenOnlineVoice={() => {
                setCallSettingsVisible(false);
                setOnlineVoiceVisible(true);
              }}
              onPreviewCall={() => {
                setCallSettingsVisible(false);
                void developerTestService
                  .triggerImmediateCall(
                    userId,
                    'Sample Reminder: Review Capstone Notes',
                  )
                  .then(res => {
                    if (!res.success) {
                      Alert.alert('Call Preview Unavailable', res.message);
                    }
                  });
              }}
            />
          )}
          {chatMemoryVisible && (
            <ChatMemorySettings
              userId={userId}
              isGuest={isGuest}
              visible={chatMemoryVisible}
              onClose={() => {
                setChatMemoryVisible(false);
                setChatMemorySummary(readChatMemorySummary());
              }}
              onChanged={() => {
                setChatMemorySummary(readChatMemorySummary());
                setStudentSetup(studentSetupStore.get(userId));
              }}
              onUpdateCor={() => {
                setChatMemoryVisible(false);
                handleUploadCor();
              }}
            />
          )}
          {memoryVisible && (
            <PersonalMemory
              userId={userId}
              visible={memoryVisible}
              onClose={() => setMemoryVisible(false)}
              onChanged={loadEventDefaultsSummary}
            />
          )}
          {onlineVoiceVisible && (
            <OnlineVoice
              key={`online-${userId}`}
              userId={userId}
              visible={onlineVoiceVisible}
              onClose={() => setOnlineVoiceVisible(false)}
              onChanged={loadOnlineVoiceSummary}
            />
          )}
          {voiceVisible && (
            <OfflineVoice
              userId={userId}
              visible={voiceVisible}
              onClose={() => setVoiceVisible(false)}
              onChanged={loadVoiceSummary}
            />
          )}
          {floatingVisible && (
            <FloatingAssistantSettings
              key={`floating-${userId}`}
              userId={userId}
              visible={floatingVisible}
              onClose={() => {
                setFloatingVisible(false);
                refreshFloatingSummary();
              }}
              onChanged={refreshFloatingSummary}
            />
          )}
          {appearanceModalTab !== null && (
            <AppearancePickerModal
              visible={true}
              initialTab={appearanceModalTab}
              onClose={() => setAppearanceModalTab(null)}
            />
          )}
          {signOutModalVisible && (
            <SignOutModal
              visible={signOutModalVisible}
              isGuest={isGuest}
              busy={signingOut}
              onCancel={() => {
                if (!signingOut) {
                  setSignOutModalVisible(false);
                }
              }}
              onConfirm={() => {
                void handleConfirmSignOut();
              }}
              onCreateAccount={
                isGuest
                  ? () => {
                      setSignOutModalVisible(false);
                      handleCreateAccount();
                    }
                  : undefined
              }
            />
          )}
          {isDevMode && developerModalVisible && (
            <DeveloperModal
              visible={developerModalVisible}
              userId={userId}
              isGuest={isGuest}
              onClose={() => setDeveloperModalVisible(false)}
              onRefreshProfile={onRefresh}
              onReplayTour={onReplayTour}
              onReplayOnboarding={onReplayOnboarding}
              onResetFromOnboarding={onResetFromOnboarding}
              endSessionForServerSwitch={endSessionForServerSwitch}
              onLogout={onLogout}
            />
          )}
        </ScreenOverlays>
      </ScrollView>
    </View>
  );
});

const getProfileThemedStyles = (colors: ThemeColors) => ({
  container: {backgroundColor: colors.background},
  headerTitle: {color: colors.textPrimary},
  userName: {color: colors.textPrimary},
  userEmail: {color: colors.textSecondary},
  settingsGroupHeader: {color: colors.textSecondary},
  settingsGroupCard: {backgroundColor: colors.cardBg},
  settingText: {color: colors.textPrimary},
  settingValue: {color: colors.textSecondary},
  settingDivider: {backgroundColor: colors.divider},
  avatarCircle: {borderColor: colors.cardBg},
  editBadge: {backgroundColor: colors.cardBg, borderColor: colors.border},
  createAccountBtn: {backgroundColor: colors.blue},
  createAccountBtnText: {color: colors.white},
  signOutLinkText: {color: colors.textMuted},
  signOutBtn: {borderColor: colors.red},
  signOutText: {color: colors.red},
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 130,
  },
  modernContentContainer: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 120,
    gap: 14,
  },
  modernTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  modernPageTitle: {
    fontSize: 26,
    fontFamily: Fonts.heading,
    fontWeight: '800',
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  modernHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modernHeaderCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackground: {
    width: '100%',
    height: 180,
    overflow: 'hidden',
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: -80,
    marginBottom: 14,
  },
  avatarWrapper: {
    position: 'relative',
    width: 120,
    height: 120,
    marginBottom: 12,
  },
  modernAvatarWrapper: {
    width: 96,
    height: 96,
    marginBottom: 10,
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Shadows.card,
  },
  modernAvatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  randomizeBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  modernAvatarBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
  },
  mainContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  modernMainContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    gap: 14,
  },
  nameRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  userName: {
    fontSize: 18,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
  },
  userNameAlign: {
    width: '100%',
    textAlign: 'center',
    includeFontPadding: false,
  },
  userEmail: {
    width: '100%',
    paddingHorizontal: 16,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: Fonts.body,
    marginTop: 4,
  },
  modernUserEmail: {
    fontSize: 13,
    marginTop: 3,
  },
  modernHeroAcademicBlock: {
    width: '100%',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  modernHeroPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modernHeroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: ModernLayout.borderRadiusPill,
  },
  modernHeroPillText: {
    fontSize: 11.5,
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  academicSubtitlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: '90%',
  },
  academicSubtitleIcon: {
    flexShrink: 0,
  },
  academicSubtitleText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
  },
  academicCard: {
    borderRadius: Layout.borderRadiusCard,
    padding: 16,
    marginBottom: 16,
  },
  modernAcademicCard: {
    padding: ModernLayout.cardPadding,
    marginBottom: 0,
  },
  modernCardIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  modernCardTitle: {
    fontSize: 16,
  },
  modernCardSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  academicCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  academicCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  academicHeaderIcon: {
    flexShrink: 0,
  },
  academicCardTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  academicCardTitle: {
    fontSize: 15,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    flexShrink: 1,
  },
  academicCardSubtitle: {
    fontSize: 11,
    fontFamily: Fonts.body,
    fontWeight: '600',
    marginTop: 1,
    flexShrink: 1,
  },
  academicUpdateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  modernCorPillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: ModernLayout.borderRadiusPill,
  },
  academicUpdateBtnDisabled: {
    opacity: 0.6,
  },
  academicUpdateBtnText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    fontWeight: '700',
  },
  modernCorPillBtnText: {
    fontSize: 12,
    fontFamily: Fonts.heading,
  },
  academicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 12,
  },
  modernAcademicRow: {
    paddingVertical: 10,
  },
  academicLabel: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '600',
    minWidth: 100,
    flexShrink: 0,
  },
  modernAcademicLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  academicValue: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  modernAcademicValue: {
    fontSize: 13,
    fontFamily: Fonts.heading,
    fontWeight: '600',
    lineHeight: 18,
  },
  modernSubjectsToggleRow: {
    marginTop: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: 'center',
    gap: 8,
  },
  modernSubjectsLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  modernSubjectsToggleLabel: {
    minWidth: 0,
    fontSize: 12.5,
    fontFamily: Fonts.heading,
    fontWeight: '600',
  },
  academicSubjectsValueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  modernSubjectsValueWrap: {
    flex: 0,
    flexShrink: 0,
  },
  academicSubjectsValue: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  modernSubjectsValueText: {
    fontSize: 12,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    flexShrink: 0,
  },
  academicSubjectsList: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  modernAcademicSubjectsList: {
    marginTop: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  modernSubjectItem: {
    paddingVertical: 12,
    gap: 6,
  },
  modernSubjectTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  modernSubjectTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  modernSubjectCodeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  modernSubjectCodeText: {
    fontSize: 11,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  modernSubjectTitle: {
    fontSize: 13.5,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    lineHeight: 18,
  },
  modernSubjectUnitsPill: {
    borderRadius: ModernLayout.borderRadiusPill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  modernSubjectUnitsText: {
    fontSize: 11,
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  modernSubjectDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 1,
  },
  modernSubjectDetailIcon: {
    marginTop: 2.5,
    flexShrink: 0,
  },
  modernSubjectScheduleText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.body,
    lineHeight: 17,
  },
  modernSubjectMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 1,
  },
  modernSubjectSectionChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: ModernLayout.borderRadiusPill,
  },
  modernSubjectSectionText: {
    fontSize: 11,
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  modernSubjectFacultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  modernSubjectFacultyText: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    fontWeight: '500',
    flexShrink: 1,
  },
  academicSubjectItem: {
    paddingVertical: 8,
  },
  academicSubjectItemBorder: {
    borderTopWidth: 1,
  },
  academicSubjectTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  academicSubjectTitle: {
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '600',
  },
  academicSubjectUnits: {
    fontSize: 11,
    fontFamily: Fonts.body,
    fontWeight: '600',
    flexShrink: 0,
  },
  academicSubjectMeta: {
    fontSize: 11,
    fontFamily: Fonts.body,
    marginTop: 2,
  },
  settingsContainer: {
    marginBottom: 24,
  },
  modernSettingsContainer: {
    marginBottom: 0,
  },
  settingsGroupHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modernSettingsGroupHeader: {
    fontSize: 11,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    letterSpacing: 0.7,
    paddingHorizontal: 4,
    marginTop: 2,
    marginBottom: 8,
  },
  modernHeroCard: {
    marginTop: 0,
    marginBottom: 0,
    marginHorizontal: 0,
    borderRadius: ModernLayout.borderRadiusCard,
    borderWidth: 1,
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  modernHeroAccentBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 64,
  },
  interfaceSelectorBlock: {
    paddingVertical: 14,
  },
  interfaceTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.heading,
  },
  interfaceSubtitle: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
    fontFamily: Fonts.body,
  },
  interfaceCardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  interfaceCard: {
    flex: 1,
    borderRadius: ModernLayout.borderRadiusSubCard,
    borderWidth: 1.5,
    padding: 12,
  },
  interfaceCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  interfaceCheckBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interfaceCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.heading,
  },
  interfaceCardDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
    fontFamily: Fonts.body,
  },
  themePickerBlock: {
    paddingVertical: 14,
  },
  themePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  themePickerHeaderCopy: {
    flex: 1,
  },
  themePickerSubtitle: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: Fonts.body,
  },
  themeActiveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  themeActiveBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: Fonts.heading,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeTile: {
    width: '48.2%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: ModernLayout.borderRadiusSubCard,
    borderWidth: 1.5,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  themeSwatchCluster: {
    width: 28,
    height: 24,
    position: 'relative',
    justifyContent: 'center',
  },
  themeSwatchPrimary: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  themeSwatchSecondary: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  themeTileTextCol: {
    flex: 1,
    minWidth: 0,
  },
  themeTileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  themeTileLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.heading,
    flexShrink: 1,
  },
  themeTileBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
  },
  themeTileBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
    fontFamily: Fonts.heading,
  },
  themeTileSubtitle: {
    fontSize: 10.5,
    marginTop: 1,
    fontFamily: Fonts.body,
  },
  themeTileCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeMoreButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: ModernLayout.borderRadiusSubCard,
    borderWidth: 1,
  },
  themeMoreButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  themeMoreButtonText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.heading,
  },
  themeMoreButtonCount: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
  },
  settingsGroupCard: {
    borderRadius: Layout.borderRadiusCard,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  clearDataGroupCard: {
    paddingVertical: 4,
  },
  clearDataActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  clearDataIconBadge: {
    width: 38,
    height: 38,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  clearDataTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  clearDataTitle: {
    fontSize: 14.5,
    fontFamily: Fonts.heading,
    fontWeight: '700',
    includeFontPadding: false,
  },
  clearDataSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.body,
    lineHeight: 16,
  },
  modernLastGroupCard: {
    marginBottom: 0,
  },
  settingDivider: {
    height: 1,
  },
  settingDividerInset: {
    marginLeft: 46,
  },
  groupHeaderBlock: {
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 10,
  },
  groupHeaderTitle: {
    fontSize: 16,
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  groupHeaderHint: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    marginTop: 2,
  },
  sectionJumpScroll: {
    marginHorizontal: -4,
    marginBottom: 10,
  },
  sectionJumpRow: {
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  sectionJumpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionJumpText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '600',
  },
  guestPromptCard: {
    borderRadius: Layout.borderRadiusCard,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  modernGuestPromptCard: {
    marginBottom: 0,
  },
  guestPromptTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  guestPromptBody: {
    fontFamily: Fonts.body,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  createAccountBtn: {
    width: '100%',
    height: 44,
    borderRadius: Layout.borderRadiusButton,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  createAccountBtnText: {
    fontFamily: Fonts.body,
    fontWeight: 'bold',
    fontSize: 14,
  },
  signOutLink: {
    paddingVertical: 8,
  },
  signOutLinkText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  signOutBtn: {
    width: '100%',
    height: 48,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  signOutText: {
    fontWeight: 'bold',
    fontSize: 14,
    fontFamily: Fonts.body,
  },
});
