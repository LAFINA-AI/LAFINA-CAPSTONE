import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import {Colors, Fonts, Layout, Shadows} from '../theme';
import {preferencesStore, userStore} from '../../storage';
import type {UserPreferences, User} from '../../storage';
import {useTheme} from '../contexts/ThemeContext';
import {useThemedStyles} from '../theme/createThemedStyles';
import type {ThemeColors} from '../contexts/ThemeContext';
import {APP_VERSION} from '../../appVersion';
import {GUEST_USER_ID} from '../../constants';
import {SvgXml} from 'react-native-svg';
import {ARC_SCREEN_XML} from '../../assets/arc_screen_xml';
import {Camera} from 'lucide-react-native';
import {authService} from '../../cloud/authService';
import {isStudentProAccount} from '../../cloud';
import {
  avatarSource,
  pickAvatarImage,
  removeAvatarImage,
} from '../components/profile/avatarFile';
import {ProfileStats} from '../components/profile/ProfileStats';
import {SettingItem} from '../components/profile/SettingItem';
import {ServerSwitchItem} from '../components/profile/ServerSwitchItem';
import {backendSelection} from '../../cloud/backendSelection';
import {PrivacyModal} from '../components/profile/PrivacyModal';
import {StudentProTag} from '../components/profile/StudentProTag';
import {AppUpdateItem} from '../components/profile/AppUpdateItem';
import {PreferencesSettingsScreen} from './PreferencesSettingsScreen';
import {ReminderHealth} from '../components/profile/ReminderHealth';
import {PersonalMemory} from '../components/profile/PersonalMemory';
import {ChatMemorySettings} from '../components/profile/ChatMemorySettings';
import {chatMemoryStore} from '../../storage/chatMemoryStore';
import {OfflineVoice} from '../components/profile/OfflineVoice';
import {OnlineVoice} from '../components/profile/OnlineVoice';
import {onlineVoiceSettingsStore} from '../../storage/onlineVoiceSettingsStore';
import {chatReplyFormatStore} from '../../storage/chatReplyFormatStore';
import {useChatReplyFormat} from '../hooks/useChatReplyFormat';
import {speechSettingsStore} from '../../storage/speechSettingsStore';
import {profileStatisticsStore} from '../../storage/profileStatisticsStore';
import type {ProfileStatistics} from '../../storage/profileStatisticsStore';
import {personalMemoryStore} from '../../storage/personalMemoryStore';
import {
  authorizeDataReset,
  finishAttachmentCleanup,
  hasAttachmentCleanup,
  resetPersonalData,
} from '../../storage/accountDataReset';
import type {DataResetAuthority} from '../../storage/accountDataReset';

function getInitials(username: string | null | undefined): string {
  if (!username || username.trim().length === 0) {
    return '?';
  }
  const words = username
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
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
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
  onLogout,
  onNavigateToRegister,
  onReplayTour,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      return userStore.getUserById(userId);
    } catch {
      return null;
    }
  });

  const [statistics, setStatistics] = useState<ProfileStatistics>(() =>
    profileStatisticsStore.read(userId),
  );
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
  const [chatMemorySummary, setChatMemorySummary] = useState(readChatMemorySummary);
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
      Alert.alert('Not saved', 'Could not save the chat reply format. Try again.');
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

  const {colors, isDarkMode, toggleTheme} = useTheme();
  const themed = useThemedStyles(getProfileThemedStyles);

  const isGuest = userId === GUEST_USER_ID;
  const photoSource = avatarSource(currentUser?.avatarUri ?? null);
  const studentPro = currentUser ? isStudentProAccount(userId) : false;

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
    setStatistics(profileStatisticsStore.read(userId));
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

  const handleEditProfile = () => {
    const hasPhoto = Boolean(currentUser?.avatarUri);
    Alert.alert(
      'Profile Photo',
      hasPhoto
        ? 'Change or remove your profile photo.'
        : 'Pick a photo from this device.',
      [
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

  return (
    <ScrollView
      style={[styles.container, themed.container]}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.headerBackground}>
        <SvgXml
          xml={ARC_SCREEN_XML}
          width="100%"
          height={180}
          preserveAspectRatio="none"
        />
      </View>

      <View style={styles.avatarSection}>
        <View style={styles.avatarWrapper}>
          <TouchableOpacity
            onPress={handleEditProfile}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={
              photoSource ? 'Change profile photo' : 'Add a profile photo'
            }
            style={[
              styles.avatarCircle,
              themed.avatarCircle,
              {backgroundColor: colors.blue},
            ]}
          >
            {photoSource ? (
              <Image
                source={photoSource}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={[styles.avatarInitials, {color: colors.white}]}>
                {getInitials(currentUser?.username)}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleEditProfile}
            style={[styles.editBadge, themed.editBadge, Shadows.card]}
            accessibilityRole="button"
            accessibilityLabel={
              photoSource ? 'Change profile photo' : 'Add a profile photo'
            }
          >
            <Camera size={16} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.nameRow}>
          <Text style={[styles.userName, themed.userName]} numberOfLines={1}>
            {currentUser?.username || 'Student'}
          </Text>
          {studentPro && <StudentProTag />}
        </View>
        <Text style={[styles.userEmail, themed.userEmail]}>
          {currentUser?.email || 'No email set'}
        </Text>
      </View>

      <View style={styles.mainContent}>
        <ProfileStats statistics={statistics} />

        <View style={styles.settingsContainer}>
          <Text
            style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
          >
            Preferences
          </Text>
          <View
            style={[
              styles.settingsGroupCard,
              Shadows.card,
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
          </View>

          <Text
            style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
          >
            AI & Voice
          </Text>
          <View
            style={[
              styles.settingsGroupCard,
              Shadows.card,
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
              Shadows.card,
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
              text="Reminder Health"
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
            style={[
              styles.settingsGroupCard,
              Shadows.card,
              themed.settingsGroupCard,
            ]}
          >
            <SettingItem
              text="Dark Mode"
              type="toggle"
              value={isDarkMode}
              onValueChange={(_enabled, origin) => toggleTheme(origin)}
            />
          </View>

          <Text
            style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
          >
            Data Settings
          </Text>
          <View style={[styles.settingsGroupCard, themed.settingsGroupCard]}>
            <SettingItem
              text="Clear All Data"
              type="clickable"
              onPress={handleClearData}
              isDestructive
            />
          </View>

          {backendSelection.isAvailable() && (
            <>
              <Text
                style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
              >
                Developer
              </Text>
              <View
                style={[styles.settingsGroupCard, themed.settingsGroupCard]}
              >
                <ServerSwitchItem
                  isGuest={isGuest}
                  endSession={endSessionForServerSwitch}
                  onSessionEnded={() => onLogout?.(false)}
                />
              </View>
            </>
          )}

          <Text
            style={[styles.settingsGroupHeader, themed.settingsGroupHeader]}
          >
            About
          </Text>
          <View style={[styles.settingsGroupCard, themed.settingsGroupCard]}>
            <SettingItem
              text="App Version"
              type="value"
              valueText={`${APP_VERSION} (Mobile)`}
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
            style={[
              styles.guestPromptCard,
              Shadows.card,
              themed.settingsGroupCard,
            ]}
          >
            <Text style={[styles.guestPromptTitle, themed.settingText]}>
              Go Full Access
            </Text>
            <Text style={[styles.guestPromptBody, themed.settingValue]}>
              Create an account to save your data across devices and unlock all
              features.
            </Text>
            <TouchableOpacity
              onPress={handleCreateAccount}
              style={styles.createAccountBtn}
            >
              <Text style={styles.createAccountBtnText}>Create Account</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSignOut}
              style={styles.signOutLink}
            >
              <Text style={styles.signOutLinkText}>
                Dismiss Guest & Sign Out
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.bottomSpacer} />

      {privacyModalVisible && (
        <PrivacyModal
          visible={privacyModalVisible}
          onClose={() => setPrivacyModalVisible(false)}
        />
      )}
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
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 140,
  },
  headerBackground: {
    width: '100%',
    height: 180,
    overflow: 'hidden',
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: -80,
    marginBottom: 24,
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
  avatarInitials: {
    fontSize: 40,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
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
    paddingTop: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 24,
  },
  userName: {
    flexShrink: 1,
    fontSize: 18,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
  },
  userEmail: {
    fontSize: 12,
    fontFamily: Fonts.body,
    marginTop: 4,
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
    backgroundColor: Colors.blue,
    borderRadius: Layout.borderRadiusButton,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  createAccountBtnText: {
    fontFamily: Fonts.body,
    color: Colors.textLight,
    fontWeight: 'bold',
    fontSize: 14,
  },
  signOutLink: {
    paddingVertical: 8,
  },
  signOutLinkText: {
    fontFamily: Fonts.body,
    color: Colors.textMuted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  signOutBtn: {
    width: '100%',
    height: 48,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1.5,
    borderColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  signOutText: {
    color: Colors.red,
    fontWeight: 'bold',
    fontSize: 14,
    fontFamily: Fonts.body,
  },
  bottomSpacer: {
    height: 120,
  },
});
