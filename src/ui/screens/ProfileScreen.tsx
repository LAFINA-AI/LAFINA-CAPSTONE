import React, {useState, useEffect, useRef} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Fonts,
  Layout,
  MODERN_THEMES,
  ModernLayout,
  ModernTypography,
  Shadows,
} from '../theme';
import {
  preferencesStore,
  userStore,
  academicProfileStore,
  avatarSeedStore,
  mapCorCoursesToAcademicRecords,
} from '../../storage';
import type {UserPreferences, User, AcademicProfileRecord} from '../../storage';
import {useTheme} from '../contexts/ThemeContext';
import {useThemedStyles} from '../theme/createThemedStyles';
import type {ThemeColors} from '../contexts/ThemeContext';
import {APP_VERSION} from '../../appVersion';
import {GUEST_USER_ID} from '../../constants';
import {SvgXml} from 'react-native-svg';
import {ARC_SCREEN_XML} from '../../assets/arc_screen_xml';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Dices,
  FileText,
  GraduationCap,
  LayoutGrid,
  Sparkles,
} from 'lucide-react-native';
import {authService} from '../../cloud/authService';
import {
  avatarSource,
  pickAvatarImage,
  removeAvatarImage,
} from '../components/profile/avatarFile';
import {CharacterAvatar} from '../components/profile/CharacterAvatar';
import {
  areTraitsVisuallyDistinct,
  resolveCharacterTraits,
} from '../components/profile/characterAvatarGenerator';
import {ProfileStats} from '../components/profile/ProfileStats';
import {ProfileStatsModal} from '../components/profile/ProfileStatsModal';
import {SettingItem} from '../components/profile/SettingItem';
import {ServerSwitchItem} from '../components/profile/ServerSwitchItem';
import {backendSelection} from '../../cloud/backendSelection';
import {PrivacyModal} from '../components/profile/PrivacyModal';
import {AppUpdateItem} from '../components/profile/AppUpdateItem';
import {PreferencesSettingsScreen} from './PreferencesSettingsScreen';
import {ReminderHealth} from '../components/profile/ReminderHealth';
import {PersonalMemory} from '../components/profile/PersonalMemory';
import {ChatMemorySettings} from '../components/profile/ChatMemorySettings';
import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {
  readOnboardingIdentity,
  saveOnboardingMemories,
} from '../../storage/onboardingMemory';
import {OfflineVoice} from '../components/profile/OfflineVoice';
import {OnlineVoice} from '../components/profile/OnlineVoice';
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
} from '../../storage/accountDataReset';
import type {DataResetAuthority} from '../../storage/accountDataReset';
import {DeveloperModal} from '../components/profile/DeveloperModal';
import {developerTestService} from '../components/profile/developerTestService';
import {visionService} from '../../ai/vision/visionService';

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

interface ProfileScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
  onLogout?: (isGuest?: boolean) => void;
  onNavigateToRegister?: () => void;
  onReplayTour?: () => void;
  onReplayOnboarding?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
  onLogout,
  onNavigateToRegister,
  onReplayTour,
  onReplayOnboarding,
}) => {
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
        return academicProfileStore.get(userId);
      } catch {
        return null;
      }
    });
  const [corUploading, setCorUploading] = useState(false);
  const [subjectsExpanded, setSubjectsExpanded] = useState(false);

  const [statistics, setStatistics] = useState<DetailedProfileStatistics>(() =>
    profileStatisticsStore.readDetailed(userId),
  );
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [healthVisible, setHealthVisible] = useState(false);
  const [memoryVisible, setMemoryVisible] = useState(false);
  const [chatMemoryVisible, setChatMemoryVisible] = useState(false);
  const readChatMemorySummary = () => {
    try {
      if (!chatMemoryStore.isEnabled(userId)) return 'Off';
      const count = chatMemoryStore.list(userId).length;
      return count === 1 ? '1 memory' : `${count} memories`;
    } catch {
      return 'Unavailable';
    }
  };
  const [chatMemorySummary, setChatMemorySummary] = useState(
    readChatMemorySummary,
  );
  const [eventDefaultsSummary, setEventDefaultsSummary] = useState('Off');
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [voiceSummary, setVoiceSummary] = useState('Default');
  const [onlineVoiceVisible, setOnlineVoiceVisible] = useState(false);
  const [onlineVoiceSummary, setOnlineVoiceSummary] = useState(() => {
    try {
      return onlineVoiceSettingsStore.read(userId)?.name ?? 'Server default';
    } catch {
      return 'Choose again';
    }
  });
  const loadOnlineVoiceSummary = () => {
    try {
      setOnlineVoiceSummary(
        onlineVoiceSettingsStore.read(userId)?.name ?? 'Server default',
      );
    } catch {
      setOnlineVoiceSummary('Choose again');
    }
  };

  const [weekStartsMonday, setWeekStartsMonday] = useState(() => {
    try {
      return userStore.getWeekStartsMonday(userId);
    } catch {
      return false;
    }
  });
  const [summaryStyleDetailed, setSummaryStyleDetailed] = useState(false);
  const replyFormat = useChatReplyFormat(userId);
  const handleMarkdownRepliesChange = (enabled: boolean) => {
    if (!chatReplyFormatStore.save(userId, enabled ? 'markdown' : 'plain')) {
      Alert.alert(
        'Not saved',
        'Could not save the chat reply format. Try again.',
      );
    }
  };
  const [dailyBriefingEnabled, setDailyBriefingEnabled] = useState(true);
  const [preferenceSummary, setPreferenceSummary] = useState(() => {
    try {
      const preferences = preferencesStore.get(userId);
      return `${
        preferences.reminderLeadMinutes
      } min, ${getSnoozePreferenceLabel(preferences)}`;
    } catch {
      return '15 min, Snooze once';
    }
  });
  const [preferencesVisible, setPreferencesVisible] = useState(false);

  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
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
          ? 'Developer Mode enabled! Test triggers and developer tools are now visible.'
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
  const [ttsTesting, setTtsTesting] = useState(false);

  // Remediation audit P1: a Clear All Data confirmation is honoured only while
  // this screen is mounted and still shows the account that opened it.
  const alive = useRef(true);
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

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
    modernShadows,
    setModernTheme,
  } = useTheme();
  const themed = useThemedStyles(getProfileThemedStyles);
  const cardSurfaceStyle = isModern
    ? [
        themed.settingsGroupCard,
        modernShadows.card,
        {
          borderRadius: ModernLayout.borderRadiusCard,
          borderWidth: 1,
          borderColor: modernPalette.border,
        },
      ]
    : [Shadows.card, themed.settingsGroupCard];

  const isGuest = userId === GUEST_USER_ID;
  const photoSource = avatarSource(currentUser?.avatarUri ?? null);
  const [avatarSeed, setAvatarSeed] = useState<string>(() =>
    avatarSeedStore.getOrCreate(userId),
  );

  useEffect(() => {
    setSubjectsExpanded(false);
    setAvatarSeed(avatarSeedStore.getOrCreate(userId));
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
    setAcademicProfile(academicProfileStore.get(userId));
    setAvatarSeed(avatarSeedStore.getOrCreate(userId));
    setChatMemorySummary(readChatMemorySummary());

    const mondayStart = userStore.getWeekStartsMonday(userId);
    setWeekStartsMonday(mondayStart);

    const preferences = preferencesStore.get(userId);
    setPreferenceSummary(
      `${preferences.reminderLeadMinutes} min, ${getSnoozePreferenceLabel(
        preferences,
      )}`,
    );
    loadEventDefaultsSummary();
    loadVoiceSummary();
    loadOnlineVoiceSummary();
  };

  const loadVoiceSummary = () => {
    try {
      setVoiceSummary(
        speechSettingsStore.read(userId).explicit ? 'Custom' : 'Default',
      );
    } catch {
      setVoiceSummary('Unavailable');
    }
  };

  const loadEventDefaultsSummary = () => {
    try {
      const saved = personalMemoryStore.read(userId);
      setEventDefaultsSummary(saved.enabled && saved.value ? 'On' : 'Off');
    } catch {
      setEventDefaultsSummary('Unavailable');
    }
  };

  const handleToggleWeekStart = (value: boolean) => {
    setWeekStartsMonday(value);
    userStore.setWeekStartsMonday(userId, value);
    onRefresh();
  };

  const handleUploadCor = async () => {
    if (corUploading) return;
    try {
      const picked = await visionService.pickCorDocument();
      if (!picked) return;

      setCorUploading(true);
      const cor = await visionService.scanUstpCorFromUri(picked.uri);
      if (
        !cor ||
        (cor.courses.length === 0 &&
          !cor.profile.studentNo &&
          !cor.profile.fullName)
      ) {
        Alert.alert(
          'COR Not Recognized',
          'Could not extract USTP COR details from that file. Please try a clearer COR PDF or screenshot.',
        );
        return;
      }

      const savedProfile = academicProfileStore.save(userId, {
        ...cor.profile,
        isUstpStudent: true,
        courses: mapCorCoursesToAcademicRecords(cor.courses),
      });

      const scheduledCount = academicProfileStore.persistRecurringSchedule(
        userId,
        cor.sessions,
      );

      const prefs = preferencesStore.get(userId);
      const ident = readOnboardingIdentity(userId);
      saveOnboardingMemories(
        userId,
        {
          preferredName: cor.profile.preferredName || ident.preferredName,
          tone: ident.tone,
        },
        prefs.studyPeakHours,
        savedProfile,
      );

      setAcademicProfile(savedProfile);
      setCurrentUser(userStore.getUserById(userId));
      setChatMemorySummary(readChatMemorySummary());
      loadStats();
      onRefresh();

      Alert.alert(
        'USTP COR Updated',
        `Updated profile for ${savedProfile.formattedName || 'Student'} (${
          savedProfile.program || 'USTP'
        }) and scheduled ${scheduledCount} recurring class sessions in your Calendar.`,
      );
    } catch (error) {
      console.error('[ProfileScreen] Failed uploading USTP COR:', error);
      Alert.alert(
        'COR Upload Failed',
        'Could not process the selected COR file.',
      );
    } finally {
      setCorUploading(false);
    }
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

      Alert.alert(
        'Synthesizing…',
        'Synthesizing text to speech. Keep media volume up.',
      );
      const result = await provider.speakText(
        'Hey! This is lafina. Text to speech is working.',
      );
      if (result.source === 'cancelled') {
        Alert.alert('TTS Test Stopped', 'Voice playback was cancelled.');
      } else if (result.source === 'elevenlabs') {
        Alert.alert(
          'TTS Test (ElevenLabs)',
          'Playback finished using the configured ElevenLabs online voice.',
        );
      } else {
        Alert.alert(
          'TTS Test (Native Offline TTS)',
          result.fallbackReason ||
            'Playback finished using react-native-tts (Android TextToSpeech). Enable Online Mode in Chat for ElevenLabs.',
        );
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[Profile] TTS test failed:', e);
      Alert.alert('TTS Test Error', message);
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
    const prevTraits = resolveCharacterTraits(avatarSeed);
    let nextSeed = avatarSeedStore.randomize(userId, avatarSeed);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const nextTraits = resolveCharacterTraits(nextSeed);
      if (areTraitsVisuallyDistinct(prevTraits, nextTraits)) {
        break;
      }
      nextSeed = avatarSeedStore.randomize(userId, nextSeed);
    }
    setAvatarSeed(nextSeed);
  };

  const switchToRandomCharacter = async () => {
    randomizeCharacterAvatar();
    await clearPhoto();
  };

  const handleEditProfile = () => {
    const hasPhoto = Boolean(currentUser?.avatarUri);
    Alert.alert(
      'Profile Avatar',
      hasPhoto
        ? 'Change your photo or switch back to a character avatar.'
        : 'Roll a new random character or pick a photo from this device.',
      [
        {
          text: hasPhoto ? 'Use Random Character' : 'New Random Character',
          onPress: () => {
            if (hasPhoto) {
              void switchToRandomCharacter();
            } else {
              randomizeCharacterAvatar();
            }
          },
        },
        {
          text: hasPhoto ? 'Choose New Photo' : 'Choose Photo',
          onPress: () => void choosePhoto(),
        },
        ...(hasPhoto
          ? [
              {
                text: 'Remove Photo',
                style: 'destructive' as const,
                onPress: () => void clearPhoto(),
              },
            ]
          : []),
        {text: 'Cancel', style: 'cancel' as const},
      ],
    );
  };

  /**
   * Remediation audit P1/P2 (ADR-025). The confirmation belongs to the sign-in
   * and the screen that opened it; resetPersonalData refuses it otherwise and
   * changes nothing. The result names only the steps it confirmed.
   */
  const confirmClearData = async (authority: DataResetAuthority | null) => {
    const outcome = resetPersonalData(
      authority,
      () => alive.current && currentUserId.current === authority?.userId,
    );
    if (!outcome.admitted || !authority) {
      Alert.alert(
        'Not Cleared',
        'Nothing was deleted, because the account, sign-in or screen changed after Clear All Data was opened. Open Profile and choose Clear All Data again to clear the account that is signed in now.',
      );
      return;
    }
    // Clear-data audit C1 (ADR-026): every saved attachment cleanup for this
    // owner, from this attempt or an earlier one, gets one bounded pass. Only
    // obligations still saved afterwards count as files not removed. Audit C2:
    // progress the pass could not save is never reported as done.
    const cleanup = hasAttachmentCleanup(authority)
      ? await finishAttachmentCleanup(authority)
      : {removed: 0, pending: 0, interrupted: false, unsaved: 0};
    const plannerCleared = outcome.planner === 'cleared';
    const chatCleared = outcome.chat === 'cleared';
    const defaultsCleared = outcome.defaults === 'cleared';
    const filesPending = cleanup.pending;
    const refused = outcome.refusedAttachments;
    const unsaved = cleanup.unsaved;
    const filesConfirmed = filesPending === 0 && refused === 0 && unsaved === 0;

    if (plannerCleared && chatCleared && defaultsCleared && filesConfirmed) {
      Alert.alert(
        'Data Cleared',
        'All personal scheduling data and saved event defaults have been deleted.',
      );
    } else {
      const done: string[] = [];
      const notDone: string[] = [];
      (plannerCleared ? done : notDone).push(
        'notes, tasks, events, reminders and calendar blocks',
      );
      (chatCleared ? done : notDone).push('chat history');
      (defaultsCleared ? done : notDone).push('saved event defaults');
      const lines = [
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
      Alert.alert('Data Partly Cleared', lines.filter(Boolean).join(' '));
    }
    if (alive.current) {
      setCurrentUser(userStore.getUserById(userId));
      setAcademicProfile(academicProfileStore.get(userId));
      setChatMemorySummary(readChatMemorySummary());
      loadStats();
      loadEventDefaultsSummary();
      onRefresh();
    }
  };

  const handleClearData = () => {
    // Captured now: a confirmation answered after a sign-in change is refused.
    const authority = authorizeDataReset(userId);
    Alert.alert(
      'Clear All Data',
      'This will delete all your notes, tasks, events, reminders, calendar blocks, chat history and saved event defaults. Device settings such as the offline voice, theme and time format are kept; Offline Voice has its own Reset. This action cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            void confirmClearData(authority);
          },
        },
      ],
    );
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
      userStore.logout();
    }
  };

  const handleSignOut = () => {
    const title = isGuest ? 'Dismiss Guest Session' : 'Sign Out';
    const message = isGuest
      ? 'Your temporary data will be cleared when you sign out. Create an account to keep it.'
      : 'Are you sure you want to sign out?';
    Alert.alert(title, message, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: title,
        style: 'destructive',
        onPress: async () => {
          try {
            if (!isGuest) {
              await authService.logout();
            }
          } finally {
            userStore.logout();
            if (onLogout) {
              onLogout(isGuest);
            } else {
              Alert.alert(
                'Signed Out',
                'You have been signed out. Sync pipeline suspended.',
              );
            }
          }
        },
      },
    ]);
  };

  if (preferencesVisible) {
    return (
      <PreferencesSettingsScreen
        userId={userId}
        onBack={() => setPreferencesVisible(false)}
        onSaved={(_preferences: UserPreferences) => {
          loadSettings();
          onRefresh();
        }}
      />
    );
  }

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
        {label: 'Student No.', value: academicProfile.studentNo},
        {label: 'Academic Term', value: academicTerm},
        {label: 'Curriculum', value: academicProfile.curriculum},
      ].filter(row => Boolean(row.value))
    : [];

  return (
    <ScrollView
      style={[styles.container, themed.container]}
      contentContainerStyle={styles.contentContainer}
    >
      {!isModern && (
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
        <View style={styles.avatarWrapper}>
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
              themed.avatarCircle,
              {
                backgroundColor: colors.cardBg,
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
            ) : (
              <CharacterAvatar
                seed={avatarSeed}
                size={112}
                testID="profile-character-avatar"
              />
            )}
          </TouchableOpacity>
          {!photoSource && (
            <TouchableOpacity
              onPress={randomizeCharacterAvatar}
              style={[styles.randomizeBadge, themed.editBadge, Shadows.card]}
              testID="profile-randomize-avatar-btn"
              accessibilityRole="button"
              accessibilityLabel="Randomize character avatar"
            >
              <Dices size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleEditProfile}
            style={[styles.editBadge, themed.editBadge, Shadows.card]}
            testID="profile-photo-badge-btn"
            accessibilityRole="button"
            accessibilityLabel={
              photoSource ? 'Change profile photo' : 'Add a profile photo'
            }
          >
            <Camera size={16} color={colors.textPrimary} />
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
          style={[styles.userEmail, themed.userEmail]}
          numberOfLines={1}
          testID="profile-display-email"
        >
          {currentUser?.email ||
            (isGuest ? 'Offline Guest Account' : 'No email set')}
        </Text>
        {academicProfile &&
          (academicProfile.program ||
            academicProfile.yearLevelShort ||
            academicProfile.yearLevel ||
            academicSection) && (
            <View
              testID="profile-academic-subtitle"
              style={[
                styles.academicSubtitlePill,
                {
                  backgroundColor: isModern
                    ? modernPalette.blueSoft
                    : colors.cardBg,
                  borderColor: isModern ? 'transparent' : colors.border,
                },
              ]}
            >
              <GraduationCap
                size={14}
                color={isModern ? modernPalette.blueInk : colors.blue}
                style={styles.academicSubtitleIcon}
              />
              <Text
                style={[
                  styles.academicSubtitleText,
                  {
                    color: isModern
                      ? modernPalette.blueInk
                      : colors.textPrimary,
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
          )}
      </View>

      <View style={styles.mainContent}>
        {academicProfile && (
          <View
            testID="profile-academic-card"
            style={[styles.academicCard, ...cardSurfaceStyle]}
          >
            <View style={styles.academicCardHeader}>
              <View style={styles.academicCardTitleRow}>
                <GraduationCap
                  size={18}
                  color={colors.blue}
                  style={styles.academicHeaderIcon}
                />
                <View style={styles.academicCardTitleGroup}>
                  <Text
                    style={[
                      styles.academicCardTitle,
                      {color: colors.textPrimary},
                    ]}
                  >
                    Academic Profile
                  </Text>
                  <Text
                    style={[
                      styles.academicCardSubtitle,
                      {color: colors.textSecondary},
                    ]}
                    numberOfLines={1}
                  >
                    USTP COR
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                testID="profile-attach-cor-btn"
                accessibilityRole="button"
                accessibilityLabel={
                  corUploading ? 'Scanning USTP COR' : 'Update COR'
                }
                onPress={() => void handleUploadCor()}
                disabled={corUploading}
                style={[
                  styles.academicUpdateBtn,
                  {borderColor: colors.blue},
                  corUploading && styles.academicUpdateBtnDisabled,
                ]}
              >
                {corUploading ? (
                  <ActivityIndicator size="small" color={colors.blue} />
                ) : (
                  <FileText size={12} color={colors.blue} />
                )}
                <Text
                  style={[styles.academicUpdateBtnText, {color: colors.blue}]}
                >
                  {corUploading ? 'Scanning…' : 'Update COR'}
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
                <View style={styles.academicRow}>
                  <Text
                    style={[
                      styles.academicLabel,
                      {color: colors.textSecondary},
                    ]}
                  >
                    {row.label}
                  </Text>
                  <Text
                    style={[styles.academicValue, {color: colors.textPrimary}]}
                  >
                    {row.value}
                  </Text>
                </View>
              </React.Fragment>
            ))}

            {academicProfile.courses.length > 0 ? (
              <>
                {academicRows.length > 0 && (
                  <View
                    style={[styles.settingDivider, themed.settingDivider]}
                  />
                )}
                <TouchableOpacity
                  testID="profile-toggle-subjects-btn"
                  accessibilityRole="button"
                  accessibilityState={{expanded: subjectsExpanded}}
                  onPress={() => setSubjectsExpanded(prev => !prev)}
                  activeOpacity={0.7}
                  style={styles.academicRow}
                >
                  <Text
                    style={[
                      styles.academicLabel,
                      {color: colors.textSecondary},
                    ]}
                  >
                    Enrolled Subjects
                  </Text>
                  <View style={styles.academicSubjectsValueWrap}>
                    <Text
                      style={[
                        styles.academicSubjectsValue,
                        {color: colors.textPrimary},
                      ]}
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
                      <ChevronUp size={15} color={colors.blue} />
                    ) : (
                      <ChevronDown size={15} color={colors.blue} />
                    )}
                  </View>
                </TouchableOpacity>

                {subjectsExpanded && (
                  <View
                    testID="profile-academic-subjects-list"
                    style={[
                      styles.academicSubjectsList,
                      {
                        backgroundColor: colors.inputBg,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {academicProfile.courses.map((course, idx) => (
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
                    ))}
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
                <View style={styles.academicRow}>
                  <Text
                    style={[
                      styles.academicLabel,
                      {color: colors.textSecondary},
                    ]}
                  >
                    Total Units
                  </Text>
                  <Text
                    style={[styles.academicValue, {color: colors.textPrimary}]}
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

        <View style={styles.settingsContainer}>
          <Text
            style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
          >
            Preferences
          </Text>
          <View
            style={[
              styles.settingsGroupCard,
              cardSurfaceStyle,
              themed.settingsGroupCard,
            ]}
          >
            <SettingItem
              text="Scheduling & Reminder Preferences"
              type="link"
              valueText={preferenceSummary}
              onPress={() => setPreferencesVisible(true)}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text="Week Starts on Monday"
              type="toggle"
              value={weekStartsMonday}
              onValueChange={handleToggleWeekStart}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text="Event Defaults"
              type="link"
              valueText={eventDefaultsSummary}
              onPress={() => setMemoryVisible(true)}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text="Memory"
              type="link"
              valueText={chatMemorySummary}
              onPress={() => setChatMemoryVisible(true)}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text={
                corUploading
                  ? 'Scanning USTP COR…'
                  : academicProfile
                  ? 'Update USTP COR'
                  : 'Attach USTP COR'
              }
              type="link"
              valueText={
                academicProfile?.studentNo ||
                academicProfile?.yearLevelShort ||
                'PDF / Image'
              }
              onPress={() => void handleUploadCor()}
            />
          </View>

          <Text
            style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
          >
            AI & Voice
          </Text>
          <View
            style={[
              styles.settingsGroupCard,
              cardSurfaceStyle,
              themed.settingsGroupCard,
            ]}
          >
            <SettingItem
              text="Detailed AI Summaries"
              type="toggle"
              value={summaryStyleDetailed}
              onValueChange={setSummaryStyleDetailed}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text="Markdown Chat Replies"
              type="toggle"
              value={replyFormat === 'markdown'}
              onValueChange={handleMarkdownRepliesChange}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text={ttsTesting ? 'Testing TTS…' : 'Test TTS Voice'}
              type="clickable"
              onPress={handleTestTtsVoice}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text="Offline Voice"
              type="link"
              valueText={voiceSummary}
              onPress={() => setVoiceVisible(true)}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text="Online Voice · ElevenLabs"
              type="link"
              valueText={onlineVoiceSummary}
              onPress={() => setOnlineVoiceVisible(true)}
            />
          </View>

          <Text
            style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
          >
            Notifications
          </Text>
          <View
            style={[
              styles.settingsGroupCard,
              cardSurfaceStyle,
              themed.settingsGroupCard,
            ]}
          >
            <SettingItem
              text="Daily Morning Briefing"
              type="toggle"
              value={dailyBriefingEnabled}
              onValueChange={setDailyBriefingEnabled}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <SettingItem
              text="Alarm & Reminder Health"
              type="link"
              onPress={() => setHealthVisible(true)}
            />
          </View>

          <Text
            style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
          >
            Appearance
          </Text>
          <View
            style={[styles.settingsGroupCard, ...cardSurfaceStyle]}
          >
            <SettingItem
              text="Dark Mode"
              type="toggle"
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
                        Choose your palette across Modern mode
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
                    {MODERN_THEMES.map(theme => {
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
                              <Check size={10} color="#FFFFFF" strokeWidth={3} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            )}
          </View>

          <Text
            style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
          >
            Data Settings
          </Text>
          <View
            style={[
              styles.settingsGroupCard,
              cardSurfaceStyle,
              themed.settingsGroupCard,
            ]}
          >
            <SettingItem
              text="Clear All Data"
              type="clickable"
              onPress={handleClearData}
              isDestructive
            />
          </View>

          {isDevMode && (
            <>
              <Text
                style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
              >
                Developer
              </Text>
              <View
                style={[
                  styles.settingsGroupCard,
                  cardSurfaceStyle,
                  themed.settingsGroupCard,
                ]}
              >
                <View style={styles.interfaceSelectorBlock}>
                  <Text style={[styles.interfaceTitle, {color: colors.textPrimary}]}>
                    App Interface
                  </Text>
                  <Text
                    style={[styles.interfaceSubtitle, {color: colors.textSecondary}]}
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
                            <Check size={11} color="#FFFFFF" strokeWidth={3} />
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
                            <Check size={11} color="#FFFFFF" strokeWidth={3} />
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
                <View style={[styles.settingDivider, themed.settingDivider]} />
                <SettingItem
                  text="Developer Testing Hub"
                  type="link"
                  valueText="Triggers & Diagnostics"
                  onPress={() => setDeveloperModalVisible(true)}
                />
                <View style={[styles.settingDivider, themed.settingDivider]} />
                <SettingItem
                  text="Simulate Incoming Call (Now)"
                  type="clickable"
                  onPress={handleQuickIncomingCall}
                />
                <View style={[styles.settingDivider, themed.settingDivider]} />
                <SettingItem
                  text="Schedule Native Alarm (in 5s)"
                  type="clickable"
                  onPress={handleQuickAlarm}
                />
                <View style={[styles.settingDivider, themed.settingDivider]} />
                <SettingItem
                  text="Force Cloud Sync Now"
                  type="clickable"
                  onPress={handleQuickSync}
                />
                <View style={[styles.settingDivider, themed.settingDivider]} />
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
              </View>
            </>
          )}

          <Text
            style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
          >
            About
          </Text>
          <View
            style={[
              styles.settingsGroupCard,
              cardSurfaceStyle,
              themed.settingsGroupCard,
            ]}
          >
            <SettingItem
              text="App Version"
              type="value"
              valueText={`${APP_VERSION} (Mobile)`}
              onPress={handleVersionTap}
            />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            <AppUpdateItem />
            <View style={[styles.settingDivider, themed.settingDivider]} />
            {onReplayTour && (
              <>
                <SettingItem
                  text="Show the walkthrough again"
                  type="link"
                  onPress={onReplayTour}
                />
                <View style={[styles.settingDivider, themed.settingDivider]} />
              </>
            )}
            <SettingItem
              text="Privacy Policy"
              type="link"
              onPress={() => setPrivacyModalVisible(true)}
            />
          </View>
        </View>

        {isGuest ? (
          <View
            style={[styles.guestPromptCard, ...cardSurfaceStyle]}
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
              <Text style={[styles.createAccountBtnText, themed.createAccountBtnText]}>Create Account</Text>
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
            style={[
              styles.signOutBtn,
              themed.signOutBtn,
              isModern && {
                borderColor: modernPalette.danger,
                backgroundColor: modernPalette.dangerSoft,
                borderRadius: ModernLayout.borderRadiusPill,
              },
            ]}
          >
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

      {privacyModalVisible && (
        <PrivacyModal
          visible={privacyModalVisible}
          onClose={() => setPrivacyModalVisible(false)}
        />
      )}
      <ProfileStatsModal
        visible={statsModalVisible}
        statistics={statistics}
        onClose={() => setStatsModalVisible(false)}
      />
      <ReminderHealth
        userId={userId}
        visible={healthVisible}
        onClose={() => setHealthVisible(false)}
      />
      <ChatMemorySettings
        userId={userId}
        isGuest={isGuest}
        visible={chatMemoryVisible}
        onClose={() => {
          setChatMemoryVisible(false);
          setChatMemorySummary(readChatMemorySummary());
        }}
        onChanged={() => setChatMemorySummary(readChatMemorySummary())}
      />
      <PersonalMemory
        userId={userId}
        visible={memoryVisible}
        onClose={() => setMemoryVisible(false)}
        onChanged={loadEventDefaultsSummary}
      />
      <OnlineVoice
        key={`online-${userId}`}
        userId={userId}
        visible={onlineVoiceVisible}
        onClose={() => setOnlineVoiceVisible(false)}
        onChanged={loadOnlineVoiceSummary}
      />
      <OfflineVoice
        userId={userId}
        visible={voiceVisible}
        onClose={() => setVoiceVisible(false)}
        onChanged={loadVoiceSummary}
      />
      {isDevMode && developerModalVisible && (
        <DeveloperModal
          visible={developerModalVisible}
          userId={userId}
          isGuest={isGuest}
          onClose={() => setDeveloperModalVisible(false)}
          onRefreshProfile={onRefresh}
          onReplayTour={onReplayTour}
          onReplayOnboarding={onReplayOnboarding}
          endSessionForServerSwitch={endSessionForServerSwitch}
          onLogout={onLogout}
        />
      )}
    </ScrollView>
  );
};

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
  mainContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
    gap: 8,
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
  academicUpdateBtnDisabled: {
    opacity: 0.6,
  },
  academicUpdateBtnText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    fontWeight: '700',
  },
  academicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 12,
  },
  academicLabel: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '600',
    minWidth: 100,
    flexShrink: 0,
  },
  academicValue: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  academicSubjectsValueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  academicSubjectsValue: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  academicSubjectsList: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
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
  settingsGroupHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modernHeroCard: {
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: ModernLayout.borderRadiusCard,
    borderWidth: 1,
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  modernHeroAccentBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 76,
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
  themeTileLabel: {
    fontSize: 13,
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
  settingsGroupCard: {
    borderRadius: Layout.borderRadiusCard,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  settingDivider: {
    height: 1,
  },
  guestPromptCard: {
    borderRadius: Layout.borderRadiusCard,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
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
