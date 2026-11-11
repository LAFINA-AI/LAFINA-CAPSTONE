import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  X,
  Phone,
  Bell,
  RefreshCw,
  Database,
  Cpu,
  Layers,
  Sparkles,
  Trash2,
  ExternalLink,
  Play,
  CheckCircle,
} from 'lucide-react-native';
import { Fonts, Shadows, Layout, Colors } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import type { ThemeColors } from '../../contexts/ThemeContext';
import {
  developerTestService,
  type DatabaseDiagnostics,
  type SyncDiagnostics,
  type AlarmDiagnostics,
} from './developerTestService';
import { ServerSwitchItem } from './ServerSwitchItem';
import type { ValidatedIntent } from '../../../ai/nlu/types';

interface DeveloperModalProps {
  visible: boolean;
  userId: string;
  isGuest: boolean;
  onClose: () => void;
  onRefreshProfile: () => void;
  onReplayTour?: () => void;
  onReplayOnboarding?: () => void;
  endSessionForServerSwitch?: () => Promise<void>;
  onLogout?: (isGuest?: boolean) => void;
}

type TabType = 'alarms' | 'sync' | 'nlu' | 'data';

export const DeveloperModal: React.FC<DeveloperModalProps> = ({
  visible,
  userId,
  isGuest,
  onClose,
  onRefreshProfile,
  onReplayTour,
  onReplayOnboarding,
  endSessionForServerSwitch,
  onLogout,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const [activeTab, setActiveTab] = useState<TabType>('alarms');

  // Alarms State
  const [alarmSeconds, setAlarmSeconds] = useState<number>(5);
  const [callTaskTitle, setCallTaskTitle] = useState('CS402 Capstone Progress Check');
  const [alarmTaskTitle, setAlarmTaskTitle] = useState('Native Alarm Test');
  const [alarmDiag, setAlarmDiag] = useState<AlarmDiagnostics | null>(null);
  const [alarmBusy, setAlarmBusy] = useState(false);

  // Sync State
  const [syncDiag, setSyncDiag] = useState<SyncDiagnostics | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // NLU State
  const [nluPrompt, setNluPrompt] = useState('Remind me to submit thesis tomorrow at 9 AM');
  const [nluResult, setNluResult] = useState<ValidatedIntent | null>(null);
  const [nluBusy, setNluBusy] = useState(false);
  const [nluActionNotice, setNluActionNotice] = useState<string | null>(null);

  // DB & Data State
  const [dbDiag, setDbDiag] = useState<DatabaseDiagnostics | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  // Load diagnostics when tab changes or modal opens
  const refreshDiagnostics = useCallback(async () => {
    try {
      if (activeTab === 'alarms') {
        const diag = await developerTestService.getAlarmDiagnostics(userId);
        setAlarmDiag(diag);
      } else if (activeTab === 'sync') {
        const diag = developerTestService.getSyncDiagnostics(userId);
        setSyncDiag(diag);
      } else if (activeTab === 'data') {
        const diag = developerTestService.getDatabaseDiagnostics(userId);
        setDbDiag(diag);
      }
    } catch (e) {
      console.warn('[DeveloperModal] Error loading tab data:', e);
    }
  }, [activeTab, userId]);

  useEffect(() => {
    if (visible) {
      void refreshDiagnostics();
    }
  }, [visible, refreshDiagnostics]);

  // Handlers for Tab 1: Alarms & Calls
  const handleTriggerImmediateCall = async () => {
    setAlarmBusy(true);
    try {
      const res = await developerTestService.triggerImmediateCall(
        userId,
        callTaskTitle || 'CS402 Capstone Progress Check',
      );
      if (res.success) {
        onRefreshProfile();
        // Give time for modal close or show notification
        Alert.alert('Simulated Call Dispatched', 'The incoming reminder call has been emitted to the UI.');
      } else {
        Alert.alert('Call Trigger Failed', res.message);
      }
    } finally {
      setAlarmBusy(false);
      void refreshDiagnostics();
    }
  };

  const handleScheduleExactAlarm = async () => {
    setAlarmBusy(true);
    try {
      const res = await developerTestService.scheduleExactAlarmInSeconds(
        userId,
        alarmSeconds,
        alarmTaskTitle || 'Native Alarm Test',
      );
      if (res.success) {
        onRefreshProfile();
        Alert.alert('Alarm Registered', res.message);
      } else {
        Alert.alert('Alarm Failed', res.message);
      }
    } finally {
      setAlarmBusy(false);
      void refreshDiagnostics();
    }
  };

  const handleCancelTestReminders = async () => {
    setAlarmBusy(true);
    try {
      const res = await developerTestService.cancelAllTestReminders(userId);
      onRefreshProfile();
      Alert.alert('Test Reminders Cancelled', `Dismissed and cancelled ${res.count} test reminder(s).`);
    } finally {
      setAlarmBusy(false);
      void refreshDiagnostics();
    }
  };

  // Handlers for Tab 2: Sync & Cloud
  const handleForceSync = async () => {
    setSyncBusy(true);
    setSyncNotice(null);
    try {
      const res = await developerTestService.triggerForceSync();
      setSyncNotice(res.message);
      onRefreshProfile();
      void refreshDiagnostics();
    } finally {
      setSyncBusy(false);
    }
  };

  const handleResetCursor = () => {
    developerTestService.resetSyncCursor(userId);
    setSyncNotice('Sync cursor reset to 0. Next sync will perform a full pull.');
    void refreshDiagnostics();
  };

  const handleClearOutbox = () => {
    Alert.alert(
      'Clear Sync Outbox',
      'Remove all pending mutations from the local outbox? Use this if a broken mutation is stuck.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Outbox',
          style: 'destructive',
          onPress: () => {
            const count = developerTestService.clearSyncOutbox(userId);
            setSyncNotice(`Cleared ${count} pending outbox items.`);
            void refreshDiagnostics();
          },
        },
      ],
    );
  };

  // Handlers for Tab 3: NLU & Voice
  const handleTestNlu = async (textToParse?: string) => {
    const text = textToParse || nluPrompt;
    if (!text.trim()) return;
    setNluBusy(true);
    setNluActionNotice(null);
    try {
      const res = await developerTestService.testNluIntent(text);
      setNluResult(res);
    } catch (e) {
      Alert.alert('NLU Error', e instanceof Error ? e.message : String(e));
    } finally {
      setNluBusy(false);
    }
  };

  const handleExecuteNlu = async () => {
    if (!nluResult) return;
    setNluBusy(true);
    try {
      const res = await developerTestService.executeNluIntent(nluResult, userId);
      setNluActionNotice(res.reply || 'Action executed successfully!');
      onRefreshProfile();
      Alert.alert('Action Executed', res.reply || 'Intent action executed in database.');
    } catch (e) {
      Alert.alert('Execution Error', e instanceof Error ? e.message : String(e));
    } finally {
      setNluBusy(false);
    }
  };

  // Handlers for Tab 4: Data & DB
  const handleSeedData = async () => {
    setSeedBusy(true);
    setSeedNotice(null);
    try {
      const res = await developerTestService.seedStudentSampleData(userId);
      if (res.success) {
        const { created } = res;
        setSeedNotice(
          `Created ${created.tasks} tasks, ${created.events} events, ${created.timeBlocks} time block, ${created.reminders} reminders, ${created.notes} notes.`,
        );
        onRefreshProfile();
        void refreshDiagnostics();
        Alert.alert(
          'Sample Data Seeded',
          'Academic test data created. Switch to Calendar, Notes, or Chat to verify!',
        );
      } else {
        Alert.alert('Seeding Failed', 'Could not create sample data.');
      }
    } finally {
      setSeedBusy(false);
    }
  };

  const handleClearSeededData = async () => {
    setSeedBusy(true);
    try {
      const res = await developerTestService.clearSeededStudentData(userId);
      setSeedNotice(`Removed ${res.removed} seeded test records.`);
      onRefreshProfile();
      void refreshDiagnostics();
      Alert.alert('Test Records Cleared', `Successfully removed ${res.removed} seeded items.`);
    } finally {
      setSeedBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, themed.container]} edges={['top', 'bottom', 'left', 'right']}>
        {/* Header */}
        <View style={[styles.header, themed.header]}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, themed.textPrimary]}>Developer Tools</Text>
            <View style={styles.devBadge}>
              <Text style={styles.devBadgeText}>DEV MODE</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, themed.cardBg]}
            accessibilityLabel="Close developer tools"
          >
            <X size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Tab Navigator */}
        <View style={[styles.tabBar, themed.tabBar]}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'alarms' && styles.tabItemActive]}
            onPress={() => setActiveTab('alarms')}
          >
            <Bell size={16} color={activeTab === 'alarms' ? colors.white : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'alarms' ? styles.tabTextActive : themed.tabTextInactive]}>
              Alarms & Calls
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'sync' && styles.tabItemActive]}
            onPress={() => setActiveTab('sync')}
          >
            <RefreshCw size={16} color={activeTab === 'sync' ? colors.white : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'sync' ? styles.tabTextActive : themed.tabTextInactive]}>
              Sync & Cloud
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'nlu' && styles.tabItemActive]}
            onPress={() => setActiveTab('nlu')}
          >
            <Cpu size={16} color={activeTab === 'nlu' ? colors.white : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'nlu' ? styles.tabTextActive : themed.tabTextInactive]}>
              NLU & Voice
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'data' && styles.tabItemActive]}
            onPress={() => setActiveTab('data')}
          >
            <Database size={16} color={activeTab === 'data' ? colors.white : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'data' ? styles.tabTextActive : themed.tabTextInactive]}>
              Data & DB
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          {/* TAB 1: ALARMS & CALLS */}
          {activeTab === 'alarms' && (
            <View style={styles.tabContent}>
              {/* Immediate Call Trigger */}
              <View style={[styles.card, themed.card, Shadows.card]}>
                <View style={styles.cardHeader}>
                  <Phone size={18} color={colors.blue} />
                  <Text style={[styles.cardTitle, themed.textPrimary]}>Simulate Incoming Call (Now)</Text>
                </View>
                <Text style={[styles.cardDescription, themed.textSecondary]}>
                  Dispatches a simulated reminder call immediately with the custom ringer, answer/decline flows, and voice recognition.
                </Text>
                <TextInput
                  style={[styles.input, themed.input]}
                  value={callTaskTitle}
                  onChangeText={setCallTaskTitle}
                  placeholder="Task or reminder title"
                  placeholderTextColor={colors.textSecondary}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.blue }]}
                  onPress={handleTriggerImmediateCall}
                  disabled={alarmBusy}
                >
                  {alarmBusy ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Phone size={16} color="#FFF" style={styles.btnIcon} />
                      <Text style={styles.primaryBtnText}>Trigger Incoming Call Now</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Exact Native Alarm Countdown */}
              <View style={[styles.card, themed.card, Shadows.card]}>
                <View style={styles.cardHeader}>
                  <Bell size={18} color={'#8B5CF6'} />
                  <Text style={[styles.cardTitle, themed.textPrimary]}>Schedule Native Alarm (AlarmManager)</Text>
                </View>
                <Text style={[styles.cardDescription, themed.textSecondary]}>
                  Registers an exact alarm via Android AlarmManager. Lock your screen or minimize the app to test background alarm firing and full-screen intent!
                </Text>
                <TextInput
                  style={[styles.input, themed.input]}
                  value={alarmTaskTitle}
                  onChangeText={setAlarmTaskTitle}
                  placeholder="Alarm reminder title"
                  placeholderTextColor={colors.textSecondary}
                />
                <View style={styles.pillRow}>
                  {[5, 10, 30, 60].map(sec => (
                    <TouchableOpacity
                      key={sec}
                      style={[
                        styles.durationPill,
                        themed.pillBg,
                        alarmSeconds === sec && { backgroundColor: colors.blue },
                      ]}
                      onPress={() => setAlarmSeconds(sec)}
                    >
                      <Text
                        style={[
                          styles.durationPillText,
                          alarmSeconds === sec ? { color: '#FFF', fontWeight: 'bold' } : themed.textPrimary,
                        ]}
                      >
                        {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#8B5CF6' }]}
                  onPress={handleScheduleExactAlarm}
                  disabled={alarmBusy}
                >
                  {alarmBusy ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Play size={16} color="#FFF" style={styles.btnIcon} />
                      <Text style={styles.primaryBtnText}>Schedule in {alarmSeconds} Seconds</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Alarm Permissions */}
              <View style={[styles.card, themed.card, Shadows.card]}>
                <View style={styles.cardHeader}>
                  <CheckCircle size={18} color={colors.success} />
                  <Text style={[styles.cardTitle, themed.textPrimary]}>Android Alarm Permissions</Text>
                </View>
                <View style={styles.permRow}>
                  <View style={styles.permInfo}>
                    <Text style={[styles.permTitle, themed.textPrimary]}>Exact Alarms</Text>
                    <Text style={[styles.permStatus, { color: alarmDiag?.permissions?.canScheduleExactAlarms ? colors.success : colors.error }]}>
                      {alarmDiag?.permissions?.canScheduleExactAlarms ? 'Allowed' : 'Blocked'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.smallBtn, themed.smallBtn]}
                    onPress={() => developerTestService.openExactAlarmSettings()}
                  >
                    <ExternalLink size={14} color={colors.textPrimary} />
                    <Text style={[styles.smallBtnText, themed.textPrimary]}>OS Settings</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.permRow}>
                  <View style={styles.permInfo}>
                    <Text style={[styles.permTitle, themed.textPrimary]}>Full-Screen Intent</Text>
                    <Text style={[styles.permStatus, { color: alarmDiag?.permissions?.canUseFullScreenIntent ? colors.success : colors.error }]}>
                      {alarmDiag?.permissions?.canUseFullScreenIntent ? 'Allowed' : 'Blocked'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.smallBtn, themed.smallBtn]}
                    onPress={() => developerTestService.openFullScreenIntentSettings()}
                  >
                    <ExternalLink size={14} color={colors.textPrimary} />
                    <Text style={[styles.smallBtnText, themed.textPrimary]}>OS Settings</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.permRow}>
                  <View style={styles.permInfo}>
                    <Text style={[styles.permTitle, themed.textPrimary]}>Post Notifications</Text>
                    <Text style={[styles.permStatus, { color: alarmDiag?.permissions?.notificationsEnabled ? colors.success : colors.error }]}>
                      {alarmDiag?.permissions?.notificationsEnabled ? 'Allowed' : 'Blocked'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.smallBtn, themed.smallBtn]}
                    onPress={() => developerTestService.openNotificationSettings()}
                  >
                    <ExternalLink size={14} color={colors.textPrimary} />
                    <Text style={[styles.smallBtnText, themed.textPrimary]}>OS Settings</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.outlineBtn, { borderColor: colors.red, marginTop: 12 }]}
                  onPress={handleCancelTestReminders}
                  disabled={alarmBusy}
                >
                  <Trash2 size={14} color={colors.red} style={styles.btnIcon} />
                  <Text style={[styles.outlineBtnText, { color: colors.red }]}>Cancel Test Reminders</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* TAB 2: SYNC & CLOUD */}
          {activeTab === 'sync' && (
            <View style={styles.tabContent}>
              {/* Server Switch Component */}
              {endSessionForServerSwitch && (
                <View style={[styles.card, themed.card, Shadows.card]}>
                  <View style={styles.cardHeader}>
                    <ExternalLink size={18} color={colors.blue} />
                    <Text style={[styles.cardTitle, themed.textPrimary]}>Backend Server Selection</Text>
                  </View>
                  <ServerSwitchItem
                    isGuest={isGuest}
                    endSession={endSessionForServerSwitch}
                    onSessionEnded={() => onLogout?.(false)}
                  />
                </View>
              )}

              {/* Force Sync Action */}
              <View style={[styles.card, themed.card, Shadows.card]}>
                <View style={styles.cardHeader}>
                  <RefreshCw size={18} color={colors.blue} />
                  <Text style={[styles.cardTitle, themed.textPrimary]}>Cloud Sync Control</Text>
                </View>
                <Text style={[styles.cardDescription, themed.textSecondary]}>
                  Trigger a manual sync roundtrip to Vercel/local backend now.
                </Text>
                {syncNotice && (
                  <View style={[styles.noticeBanner, themed.noticeBanner]}>
                    <Text style={[styles.noticeText, themed.textPrimary]}>{syncNotice}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.blue }]}
                  onPress={handleForceSync}
                  disabled={syncBusy}
                >
                  {syncBusy ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <RefreshCw size={16} color="#FFF" style={styles.btnIcon} />
                      <Text style={styles.primaryBtnText}>Force Full Sync Now</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, themed.secondaryBtn]}
                    onPress={handleResetCursor}
                  >
                    <Text style={[styles.secondaryBtnText, themed.textPrimary]}>Reset Cursor to 0</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, themed.secondaryBtn, { borderColor: colors.red }]}
                    onPress={handleClearOutbox}
                  >
                    <Text style={[styles.secondaryBtnText, { color: colors.red }]}>Clear Outbox</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sync Diagnostics View */}
              {syncDiag && (
                <View style={[styles.card, themed.card, Shadows.card]}>
                  <Text style={[styles.cardTitle, themed.textPrimary, { marginBottom: 12 }]}>Sync Metrics</Text>
                  <View style={styles.metricRow}>
                    <Text style={[styles.metricLabel, themed.textSecondary]}>Status</Text>
                    <Text style={[styles.metricValue, { color: colors.blue, fontWeight: 'bold' }]}>
                      {syncDiag.status}
                    </Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={[styles.metricLabel, themed.textSecondary]}>Last Synced</Text>
                    <Text style={[styles.metricValue, themed.textPrimary]}>
                      {syncDiag.lastSyncedAt ? new Date(syncDiag.lastSyncedAt).toLocaleTimeString() : 'Never'}
                    </Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={[styles.metricLabel, themed.textSecondary]}>Cursor</Text>
                    <Text style={[styles.metricValue, themed.textPrimary]}>{syncDiag.cursor}</Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={[styles.metricLabel, themed.textSecondary]}>Pending Outbox</Text>
                    <Text style={[styles.metricValue, themed.textPrimary]}>{syncDiag.outboxPending}</Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={[styles.metricLabel, themed.textSecondary]}>Failed Outbox</Text>
                    <Text style={[styles.metricValue, { color: syncDiag.outboxFailed > 0 ? colors.red : colors.textPrimary }]}>
                      {syncDiag.outboxFailed}
                    </Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={[styles.metricLabel, themed.textSecondary]}>Conflicts</Text>
                    <Text style={[styles.metricValue, themed.textPrimary]}>{syncDiag.conflictCount}</Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={[styles.metricLabel, themed.textSecondary]}>Active URL</Text>
                    <Text style={[styles.metricValue, themed.textPrimary, { fontSize: 11 }]} numberOfLines={1}>
                      {syncDiag.activeBaseUrl}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* TAB 3: NLU & VOICE */}
          {activeTab === 'nlu' && (
            <View style={styles.tabContent}>
              <View style={[styles.card, themed.card, Shadows.card]}>
                <View style={styles.cardHeader}>
                  <Cpu size={18} color={colors.blue} />
                  <Text style={[styles.cardTitle, themed.textPrimary]}>NLU & Intent Playground</Text>
                </View>
                <Text style={[styles.cardDescription, themed.textSecondary]}>
                  Test intent parsing (&lt; 5ms deterministic fast path or SmolLM2) on any natural language voice command.
                </Text>

                {/* Quick chip presets */}
                <Text style={[styles.chipHeader, themed.textSecondary]}>Tap a preset or write your own:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  {[
                    'Remind me to submit thesis tomorrow at 9 AM',
                    'Add assignment Math 301 due Friday 5 PM',
                    'Schedule study block tonight from 7 to 9 PM',
                    'Create note about Operating Systems semaphore',
                    'What is my schedule for today?',
                  ].map(phrase => (
                    <TouchableOpacity
                      key={phrase}
                      style={[styles.presetChip, themed.pillBg]}
                      onPress={() => {
                        setNluPrompt(phrase);
                        void handleTestNlu(phrase);
                      }}
                    >
                      <Text style={[styles.presetChipText, themed.textPrimary]} numberOfLines={1}>
                        {phrase}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TextInput
                  style={[styles.input, themed.input, { height: 70, textAlignVertical: 'top' }]}
                  value={nluPrompt}
                  onChangeText={setNluPrompt}
                  multiline
                  placeholder="Speak or type a command..."
                  placeholderTextColor={colors.textSecondary}
                />

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.blue }]}
                  onPress={() => handleTestNlu()}
                  disabled={nluBusy}
                >
                  {nluBusy ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Sparkles size={16} color="#FFF" style={styles.btnIcon} />
                      <Text style={styles.primaryBtnText}>Parse Intent</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Parsed Result Display */}
                {nluResult && (
                  <View style={[styles.nluResultBox, themed.resultBox]}>
                    <View style={styles.metricRow}>
                      <Text style={[styles.metricLabel, themed.textSecondary]}>Intent</Text>
                      <View style={[styles.intentTag, { backgroundColor: colors.blue }]}>
                        <Text style={styles.intentTagText}>{nluResult.intent}</Text>
                      </View>
                    </View>
                    {nluResult.title && (
                      <View style={styles.metricRow}>
                        <Text style={[styles.metricLabel, themed.textSecondary]}>Title</Text>
                        <Text style={[styles.metricValue, themed.textPrimary]}>{nluResult.title}</Text>
                      </View>
                    )}
                    {(nluResult.date || nluResult.time) && (
                      <View style={styles.metricRow}>
                        <Text style={[styles.metricLabel, themed.textSecondary]}>Date / Time</Text>
                        <Text style={[styles.metricValue, themed.textPrimary]}>
                          {nluResult.date || ''} {nluResult.time || ''}
                        </Text>
                      </View>
                    )}
                    <View style={styles.metricRow}>
                      <Text style={[styles.metricLabel, themed.textSecondary]}>Route</Text>
                      <Text style={[styles.metricValue, themed.textPrimary]}>{nluResult.source}</Text>
                    </View>
                    <View style={styles.metricRow}>
                      <Text style={[styles.metricLabel, themed.textSecondary]}>Confidence</Text>
                      <Text style={[styles.metricValue, themed.textPrimary]}>
                        {Math.round((nluResult.confidence || 0) * 100)}%
                      </Text>
                    </View>

                    {nluActionNotice && (
                      <View style={[styles.noticeBanner, themed.noticeBanner, { marginTop: 8 }]}>
                        <Text style={[styles.noticeText, themed.textPrimary]}>{nluActionNotice}</Text>
                      </View>
                    )}

                    <TouchableOpacity
                      style={[styles.outlineBtn, { borderColor: colors.success, marginTop: 10 }]}
                      onPress={handleExecuteNlu}
                      disabled={nluBusy}
                    >
                      <Play size={14} color={colors.success} style={styles.btnIcon} />
                      <Text style={[styles.outlineBtnText, { color: colors.success }]}>
                        Execute Action in Database
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* TAB 4: DATA & DB */}
          {activeTab === 'data' && (
            <View style={styles.tabContent}>
              {/* Sample Data Seeder */}
              <View style={[styles.card, themed.card, Shadows.card]}>
                <View style={styles.cardHeader}>
                  <Layers size={18} color={colors.blue} />
                  <Text style={[styles.cardTitle, themed.textPrimary]}>Student Data Fixtures</Text>
                </View>
                <Text style={[styles.cardDescription, themed.textSecondary]}>
                  Seed realistic student courses, assignments, lectures, reminders, and study notes in 1 tap for rapid UI testing.
                </Text>

                {seedNotice && (
                  <View style={[styles.noticeBanner, themed.noticeBanner]}>
                    <Text style={[styles.noticeText, themed.textPrimary]}>{seedNotice}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.blue }]}
                  onPress={handleSeedData}
                  disabled={seedBusy}
                >
                  {seedBusy ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Layers size={16} color="#FFF" style={styles.btnIcon} />
                      <Text style={styles.primaryBtnText}>Seed Sample Student Data</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.outlineBtn, { borderColor: colors.red, marginTop: 10 }]}
                  onPress={handleClearSeededData}
                  disabled={seedBusy}
                >
                  <Trash2 size={14} color={colors.red} style={styles.btnIcon} />
                  <Text style={[styles.outlineBtnText, { color: colors.red }]}>Remove Seeded Items</Text>
                </TouchableOpacity>
              </View>

              {/* SQLite DB Diagnostics */}
              {dbDiag && (
                <View style={[styles.card, themed.card, Shadows.card]}>
                  <View style={styles.cardHeader}>
                    <Database size={18} color={'#8B5CF6'} />
                    <Text style={[styles.cardTitle, themed.textPrimary]}>SQLite Table Row Counts</Text>
                  </View>
                  <Text style={[styles.cardDescription, themed.textSecondary]}>
                    Live counts across local SQLite database ({dbDiag.health.status}):
                  </Text>

                  <View style={styles.countsGrid}>
                    <View style={[styles.countCell, themed.pillBg]}>
                      <Text style={[styles.countNumber, themed.textPrimary]}>{dbDiag.counts.tasks}</Text>
                      <Text style={[styles.countLabel, themed.textSecondary]}>Tasks</Text>
                    </View>
                    <View style={[styles.countCell, themed.pillBg]}>
                      <Text style={[styles.countNumber, themed.textPrimary]}>{dbDiag.counts.events}</Text>
                      <Text style={[styles.countLabel, themed.textSecondary]}>Events</Text>
                    </View>
                    <View style={[styles.countCell, themed.pillBg]}>
                      <Text style={[styles.countNumber, themed.textPrimary]}>{dbDiag.counts.timeBlocks}</Text>
                      <Text style={[styles.countLabel, themed.textSecondary]}>Blocks</Text>
                    </View>
                    <View style={[styles.countCell, themed.pillBg]}>
                      <Text style={[styles.countNumber, themed.textPrimary]}>{dbDiag.counts.reminders}</Text>
                      <Text style={[styles.countLabel, themed.textSecondary]}>Reminders</Text>
                    </View>
                    <View style={[styles.countCell, themed.pillBg]}>
                      <Text style={[styles.countNumber, themed.textPrimary]}>{dbDiag.counts.notes}</Text>
                      <Text style={[styles.countLabel, themed.textSecondary]}>Notes</Text>
                    </View>
                    <View style={[styles.countCell, themed.pillBg]}>
                      <Text style={[styles.countNumber, themed.textPrimary]}>{dbDiag.counts.customCategories}</Text>
                      <Text style={[styles.countLabel, themed.textSecondary]}>Categories</Text>
                    </View>
                    <View style={[styles.countCell, themed.pillBg]}>
                      <Text style={[styles.countNumber, themed.textPrimary]}>{dbDiag.counts.outbox}</Text>
                      <Text style={[styles.countLabel, themed.textSecondary]}>Outbox</Text>
                    </View>
                    <View style={[styles.countCell, themed.pillBg]}>
                      <Text style={[styles.countNumber, themed.textPrimary]}>{dbDiag.counts.deliveryJobs}</Text>
                      <Text style={[styles.countLabel, themed.textSecondary]}>Jobs</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.smallBtn, themed.smallBtn, { marginTop: 12, alignSelf: 'flex-start' }]}
                    onPress={() => refreshDiagnostics()}
                  >
                    <RefreshCw size={14} color={colors.textPrimary} />
                    <Text style={[styles.smallBtnText, themed.textPrimary]}>Refresh Counts</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Walkthrough & Onboarding triggers */}
              <View style={[styles.card, themed.card, Shadows.card]}>
                <Text style={[styles.cardTitle, themed.textPrimary, { marginBottom: 12 }]}>App Flow Triggers</Text>
                {onReplayTour && (
                  <TouchableOpacity
                    style={[styles.secondaryBtn, themed.secondaryBtn, { marginBottom: 8 }]}
                    onPress={() => {
                      onClose();
                      onReplayTour();
                    }}
                  >
                    <Text style={[styles.secondaryBtnText, themed.textPrimary]}>Replay Product Tour Walkthrough</Text>
                  </TouchableOpacity>
                )}
                {onReplayOnboarding && (
                  <TouchableOpacity
                    style={[styles.secondaryBtn, themed.secondaryBtn]}
                    onPress={() => {
                      onClose();
                      onReplayOnboarding();
                    }}
                  >
                    <Text style={[styles.secondaryBtnText, themed.textPrimary]}>Replay Onboarding Screen</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  container: { backgroundColor: colors.background },
  header: { borderBottomColor: colors.border },
  cardBg: { backgroundColor: colors.cardBg },
  textPrimary: { color: colors.textPrimary },
  textSecondary: { color: colors.textSecondary },
  tabBar: { backgroundColor: colors.cardBg, borderBottomColor: colors.border },
  tabTextInactive: { color: colors.textSecondary },
  card: { backgroundColor: colors.cardBg },
  input: {
    backgroundColor: colors.background,
    color: colors.textPrimary,
    borderColor: colors.border,
  },
  pillBg: { backgroundColor: colors.background },
  smallBtn: { backgroundColor: colors.background, borderColor: colors.border },
  secondaryBtn: { backgroundColor: colors.background, borderColor: colors.border },
  noticeBanner: { backgroundColor: colors.background },
  resultBox: { backgroundColor: colors.background, borderColor: colors.border },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
  },
  devBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  devBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    gap: 4,
  },
  tabItemActive: {
    backgroundColor: Colors.blue,
  },
  tabText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFF',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  tabContent: {
    gap: 16,
  },
  card: {
    borderRadius: Layout.borderRadiusCard,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
  },
  cardDescription: {
    fontSize: 13,
    fontFamily: Fonts.body,
    lineHeight: 18,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: Fonts.body,
    marginBottom: 12,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  durationPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationPillText: {
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: Layout.borderRadiusButton,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: Fonts.body,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '600',
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusButton,
    paddingVertical: 10,
  },
  outlineBtnText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: 'bold',
  },
  btnIcon: {
    marginRight: 6,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB22',
  },
  permInfo: {
    flex: 1,
  },
  permTitle: {
    fontSize: 14,
    fontFamily: Fonts.body,
    fontWeight: '600',
  },
  permStatus: {
    fontSize: 12,
    fontFamily: Fonts.body,
    marginTop: 2,
    fontWeight: 'bold',
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  smallBtnText: {
    fontSize: 12,
    fontFamily: Fonts.body,
  },
  noticeBanner: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  noticeText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  metricLabel: {
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  metricValue: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '600',
  },
  chipHeader: {
    fontSize: 12,
    fontFamily: Fonts.body,
    marginBottom: 6,
  },
  chipsScroll: {
    marginBottom: 10,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    maxWidth: 240,
  },
  presetChipText: {
    fontSize: 12,
    fontFamily: Fonts.body,
  },
  nluResultBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  intentTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  intentTagText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: Fonts.body,
  },
  countsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  countCell: {
    width: '22%',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Fonts.heading,
  },
  countLabel: {
    fontSize: 11,
    fontFamily: Fonts.body,
    marginTop: 2,
  },
});
