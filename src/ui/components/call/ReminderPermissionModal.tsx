import React from 'react';
import {
  Modal,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  PhoneCall,
  X,
} from 'lucide-react-native';
import type { ReminderPermissionStatus } from '../../../scheduler';
import {
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
} from '../../../scheduler';
import { Fonts, Layout, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

interface ReminderPermissionModalProps {
  visible: boolean;
  status: ReminderPermissionStatus | null;
  onClose: () => void;
  onRefreshStatus?: () => void;
}

export const ReminderPermissionModal: React.FC<ReminderPermissionModalProps> = ({
  visible,
  status,
  onClose,
  onRefreshStatus,
}) => {
  const { isDarkMode, colors } = useTheme();

  if (!visible) return null;

  const notificationsOk = status?.notificationsEnabled ?? false;
  const exactAlarmsOk = status?.canScheduleExactAlarms ?? false;
  const fullScreenOk = status?.canUseFullScreenIntent ?? false;

  const handleRequestNotifications = async () => {
    if (Platform.OS === 'android') {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          // If denied, open system notification settings directly
          await openNotificationSettings();
        }
      } catch {
        await openNotificationSettings();
      }
      onRefreshStatus?.();
    }
  };

  const handleOpenAlarmSettings = async () => {
    await openExactAlarmSettings();
    onRefreshStatus?.();
  };

  const handleOpenFullScreenSettings = async () => {
    await openFullScreenIntentSettings();
    onRefreshStatus?.();
  };

  const themed = {
    card: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
    },
    itemBg: {
      backgroundColor: isDarkMode
        ? 'rgba(255, 255, 255, 0.04)'
        : 'rgba(0, 0, 0, 0.03)',
      borderColor: colors.border,
    },
    primaryText: { color: colors.textPrimary },
    secondaryText: { color: colors.textSecondary },
    mutedText: { color: colors.textMuted },
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.dialogCard, themed.card]}>
          <View style={styles.headerRow}>
            <View style={styles.titleWithIcon}>
              <View
                style={[
                  styles.headerIconCircle,
                  { backgroundColor: `${colors.blue}18` },
                ]}
              >
                <PhoneCall size={22} color={colors.blue} />
              </View>
              <View>
                <Text style={[styles.dialogTitle, themed.primaryText]}>
                  Reminder Permissions
                </Text>
                <Text style={[styles.dialogSubtitle, themed.mutedText]}>
                  Required for simulated reminder calls
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close permission dialog"
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.descriptionText, themed.secondaryText]}>
            LAFINA needs Android alarm and alert permissions to simulate incoming
            calls on time, even when the screen is locked or the app is closed.
          </Text>

          {/* 1. Notifications */}
          <View style={[styles.permissionItem, themed.itemBg]}>
            <View style={styles.itemIconContainer}>
              <Bell
                size={22}
                color={notificationsOk ? colors.success : colors.blue}
              />
            </View>
            <View style={styles.itemContent}>
              <View style={styles.itemHeader}>
                <Text style={[styles.itemTitle, themed.primaryText]}>
                  Notifications
                </Text>
                {notificationsOk ? (
                  <View style={styles.statusBadgeGranted}>
                    <CheckCircle2 size={14} color={colors.success} />
                    <Text style={[styles.statusTextGranted, { color: colors.success }]}>
                      Allowed
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.blue }]}
                    onPress={handleRequestNotifications}
                    accessibilityRole="button"
                  >
                    <Text style={styles.actionButtonText}>Allow</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.itemDescription, themed.mutedText]}>
                Shows notification alerts and heads-up incoming call banners.
              </Text>
            </View>
          </View>

          {/* 2. Exact Alarms */}
          <View style={[styles.permissionItem, themed.itemBg]}>
            <View style={styles.itemIconContainer}>
              <Clock
                size={22}
                color={exactAlarmsOk ? colors.success : colors.yellow}
              />
            </View>
            <View style={styles.itemContent}>
              <View style={styles.itemHeader}>
                <Text style={[styles.itemTitle, themed.primaryText]}>
                  Alarms & Reminders
                </Text>
                {exactAlarmsOk ? (
                  <View style={styles.statusBadgeGranted}>
                    <CheckCircle2 size={14} color={colors.success} />
                    <Text style={[styles.statusTextGranted, { color: colors.success }]}>
                      Allowed
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.yellow }]}
                    onPress={handleOpenAlarmSettings}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.actionButtonText, { color: '#000000' }]}>
                      Enable
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.itemDescription, themed.mutedText]}>
                Triggers reminder alarms at the exact minute scheduled.
              </Text>
            </View>
          </View>

          {/* 3. Full-Screen Intent */}
          <View style={[styles.permissionItem, themed.itemBg]}>
            <View style={styles.itemIconContainer}>
              <PhoneCall
                size={22}
                color={fullScreenOk ? colors.success : colors.red}
              />
            </View>
            <View style={styles.itemContent}>
              <View style={styles.itemHeader}>
                <Text style={[styles.itemTitle, themed.primaryText]}>
                  Full-Screen Calls
                </Text>
                {fullScreenOk ? (
                  <View style={styles.statusBadgeGranted}>
                    <CheckCircle2 size={14} color={colors.success} />
                    <Text style={[styles.statusTextGranted, { color: colors.success }]}>
                      Allowed
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: colors.red }]}
                    onPress={handleOpenFullScreenSettings}
                    accessibilityRole="button"
                  >
                    <Text style={styles.actionButtonText}>Enable</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.itemDescription, themed.mutedText]}>
                Wakes screen and presents incoming call UI over the lockscreen.
              </Text>
            </View>
          </View>

          {!notificationsOk || !exactAlarmsOk || !fullScreenOk ? (
            <View style={styles.warningNoteRow}>
              <AlertCircle size={15} color={colors.warning} />
              <Text style={[styles.warningNoteText, { color: colors.warning }]}>
                Tap the buttons above to enable missing accesses.
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: colors.primary }]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1,
    padding: 22,
    ...Shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  dialogSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  descriptionText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  permissionItem: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  itemIconContainer: {
    width: 32,
    alignItems: 'center',
    marginTop: 2,
    marginRight: 10,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemTitle: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  itemDescription: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  statusBadgeGranted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusTextGranted: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  actionButtonText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  warningNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  warningNoteText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  doneButton: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  doneButtonText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
