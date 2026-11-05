import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Info, Trash2, Upload, Users } from 'lucide-react-native';
import { STATUS_LABELS, isBusy } from '../../../meetings';
import type { RecordedMeeting } from '../../../storage';
import {
  formatWhen,
  ToolScreenHeader,
  ToolSheet,
  useToolBack,
} from '../../components/tools';
import type { RegisterToolBack } from '../../components/tools';
import { useMeetings } from '../../contexts/MeetingsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import { Fonts, FontSize, Layout, Spacing } from '../../theme';
import { formatDuration } from './meetingCopy';
import { getMeetingThemedStyles, meetingStyles } from './meetingStyles';
import { MeetingDetail } from './MeetingDetail';
import { PrivacyNotice } from './PrivacyNotice';
import { RecorderCard } from './RecorderCard';

interface MeetingsScreenProps {
  onBack: () => void;
  registerBack?: RegisterToolBack;
  onNotesSaved?: () => void;
}

export const MeetingsScreen: React.FC<MeetingsScreenProps> = ({
  onBack,
  registerBack,
  onNotesSaved,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getMeetingThemedStyles);
  const {
    meetings,
    recorder,
    processing,
    deleteMeeting,
    available,
    importAudio,
  } = useMeetings();
  const insets = useSafeAreaInsets();
  const statusBarHeight =
    Platform.OS === 'android' ? StatusBar.currentHeight || 36 : 0;
  const topPadding =
    Platform.OS === 'android'
      ? Math.max(insets.top, statusBarHeight, 44) + 18
      : Math.max(insets.top, 20) + 14;

  const [openId, setOpenId] = useState<string | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const processingId = processing?.meetingId;
  useEffect(() => {
    if (processingId) setOpenId(processingId);
  }, [processingId]);

  const open = useMemo(
    () => meetings.find((meeting) => meeting.id === openId) ?? null,
    [meetings, openId],
  );
  useEffect(() => {
    if (openId && !open) setOpenId(null);
  }, [openId, open]);

  const closeMeeting = useCallback((): boolean => {
    setOpenId(null);
    return true;
  }, []);
  useToolBack(registerBack, openId ? closeMeeting : null);

  const confirmDelete = (meeting: RecordedMeeting): void => {
    Alert.alert(
      'Delete this recording?',
      `“${meeting.title}”, its recording, transcript and notes will be deleted. Anything already saved into Notes or Tasks is kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteMeeting(meeting.id);
            setOpenId(null);
          },
        },
      ],
    );
  };

  const privacySheet = (
    <ToolSheet
      visible={privacyOpen}
      title="Where your lecture data goes"
      onClose={() => setPrivacyOpen(false)}
    >
      <PrivacyNotice />
      <Text style={[meetingStyles.small, themed.textMuted]}>
        Nothing leaves this phone during recording or Whisper transcription.
        Only optional AI note generation uses an online connection.
      </Text>
    </ToolSheet>
  );
  const privacyAction = {
    key: 'privacy',
    label: 'Where your audio goes',
    icon: Info,
    onPress: () => setPrivacyOpen(true),
  };
  const importAction = {
    key: 'import',
    label: 'Import audio recording from phone',
    icon: Upload,
    onPress: () => {
      void importAudio();
    },
  };

  if (open) {
    return (
      <View
        style={[styles.container, { paddingTop: topPadding }]}
        testID="meeting-detail-screen"
      >
        <StatusBar
          barStyle={colors.statusBarStyle}
          backgroundColor={colors.background}
        />
        <ToolScreenHeader
          title="Lecture & Meeting"
          subtitle={STATUS_LABELS[open.status]}
          onBack={closeMeeting}
          actions={
            isBusy(open.status)
              ? [privacyAction]
              : [
                  privacyAction,
                  {
                    key: 'delete',
                    label: 'Delete recording',
                    icon: Trash2,
                    onPress: () => confirmDelete(open),
                  },
                ]
          }
        />
        <MeetingDetail meeting={open} onNotesSaved={onNotesSaved} />
        {privacySheet}
      </View>
    );
  }

  const history = meetings.filter(
    (meeting) => meeting.id !== recorder?.meetingId,
  );

  return (
    <View
      style={[styles.container, { paddingTop: topPadding }]}
      testID="meetings-screen"
    >
      <StatusBar
        barStyle={colors.statusBarStyle}
        backgroundColor={colors.background}
      />
      <ToolScreenHeader
        title="Lecture & Meeting Recorder"
        subtitle="Recorded and transcribed offline on this phone"
        onBack={onBack}
        actions={[importAction, privacyAction]}
      />
      <FlatList
        data={history}
        keyExtractor={(meeting) => meeting.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          available ? (
            <RecorderCard />
          ) : (
            <View style={[meetingStyles.card, themed.card]}>
              <Text style={[meetingStyles.body, themed.textSecondary]}>
                Recording requires the latest native Android build with meeting recorder support. Reinstall the app with 'npm run android'. Previous transcripts still appear below.
              </Text>
            </View>
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Users size={40} color={colors.red} />
            <Text style={[styles.emptyTitle, themed.textPrimary]}>
              No recordings yet
            </Text>
            <Text
              style={[
                meetingStyles.body,
                styles.emptyText,
                themed.textSecondary,
              ]}
            >
              Lectures and study sessions you record appear here, with their
              timestamped transcript and optional AI summary notes.
            </Text>
            <TouchableOpacity
              style={[
                meetingStyles.secondaryButton,
                styles.emptyImportBtn,
                themed.secondaryButton,
              ]}
              onPress={() => void importAudio()}
              accessibilityRole="button"
              accessibilityLabel="Import audio recording from phone"
              testID="meeting-empty-import-btn"
            >
              <Upload size={16} color={colors.textPrimary} />
              <Text style={[meetingStyles.secondaryLabel, themed.textPrimary]}>
                Import audio recording
              </Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: meeting }) => {
          const running = processing?.meetingId === meeting.id;
          return (
            <TouchableOpacity
              style={[styles.row, themed.card]}
              onPress={() => setOpenId(meeting.id)}
              onLongPress={() =>
                isBusy(meeting.status) ? undefined : confirmDelete(meeting)
              }
              accessibilityRole="button"
              accessibilityHint="Double tap to open. Double tap and hold to delete."
              testID={`meeting-row-${meeting.id}`}
            >
              <Users size={20} color={colors.red} />
              <View style={styles.rowText}>
                <Text
                  style={[styles.rowTitle, themed.textPrimary]}
                  numberOfLines={1}
                >
                  {meeting.title}
                </Text>
                <Text style={[meetingStyles.small, themed.textSecondary]}>
                  {formatWhen(meeting.startedAt)}
                  {meeting.durationSeconds > 0
                    ? ` · ${formatDuration(meeting.durationSeconds)}`
                    : ''}
                </Text>
              </View>
              <View
                style={[
                  meetingStyles.chip,
                  meeting.status === 'error' ? themed.chipError : themed.chip,
                ]}
              >
                <Text style={[meetingStyles.chipLabel, themed.textPrimary]}>
                  {running
                    ? `${processing.percent}%`
                    : STATUS_LABELS[meeting.status]}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      {privacySheet}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  listContent: {
    paddingBottom: 140,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  emptyTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    fontWeight: 'bold',
    marginTop: Spacing.md,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  emptyImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rowText: {
    flex: 1,
    marginHorizontal: Spacing.md,
  },
  rowTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    fontWeight: 'bold',
  },
});
