import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AppState,
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  getAlarmHealth,
  getReminderPermissionStatus,
  needsBatteryGuidance,
  openBatterySettings,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
} from '../../../scheduler';
import type {AlarmHealth, ReminderPermissionStatus} from '../../../scheduler';
import {getOfflineModelPreset} from '../../../ai/nlu';
import {useSharedModelDownload} from '../../hooks/useOfflineModels';
import {
  Card,
  Notice,
  OnboardingPage,
  SecondaryButton,
  Tag,
  onboardingStyles,
  useOnboardingTokens,
} from './onboardingUi';

export interface PermissionsStepProps {
  headLabel: string;
  onBack?: () => void;
  backLabel?: string;
  progress: {count: number; active: number};
  onContinue: () => void;
}

interface PermissionState {
  checked: boolean;
  notificationsOk: boolean;
  exactAlarmsOk: boolean;
  fullScreenOk: boolean;
  microphoneOk: boolean;
  batteryAvailable: boolean;
  batteryOk: boolean;
  reminderStatusKnown: boolean;
}

const INITIAL_STATE: PermissionState = {
  checked: false,
  notificationsOk: false,
  exactAlarmsOk: false,
  fullScreenOk: false,
  microphoneOk: false,
  batteryAvailable: false,
  batteryOk: true,
  reminderStatusKnown: false,
};

export const PermissionsStep: React.FC<PermissionsStepProps> = ({
  headLabel,
  onBack,
  backLabel,
  progress,
  onContinue,
}) => {
  const t = useOnboardingTokens();
  const sharedDownload = useSharedModelDownload();
  const [state, setState] = useState<PermissionState>(INITIAL_STATE);
  const [runtimePrompted, setRuntimePrompted] = useState(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const refreshPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') {
      if (mounted.current) {
        setState({
          checked: true,
          notificationsOk: true,
          exactAlarmsOk: true,
          fullScreenOk: true,
          microphoneOk: true,
          batteryAvailable: false,
          batteryOk: true,
          reminderStatusKnown: true,
        });
      }
      return;
    }

    let status: ReminderPermissionStatus | null = null;
    let health: AlarmHealth | null = null;
    let micOk = false;
    let notifRuntimeOk: boolean | null = null;

    try {
      status = await getReminderPermissionStatus();
    } catch {
      status = null;
    }
    try {
      health = await getAlarmHealth();
    } catch {
      health = null;
    }
    try {
      if (PermissionsAndroid.PERMISSIONS.RECORD_AUDIO) {
        micOk = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
      }
    } catch {
      micOk = false;
    }
    try {
      if (PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) {
        notifRuntimeOk = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      }
    } catch {
      notifRuntimeOk = null;
    }

    if (!mounted.current) return;

    const notificationsOk = status
      ? status.notificationsEnabled
      : Boolean(notifRuntimeOk);

    setState({
      checked: true,
      notificationsOk,
      exactAlarmsOk: status?.canScheduleExactAlarms ?? false,
      fullScreenOk: status?.canUseFullScreenIntent ?? false,
      microphoneOk: micOk,
      batteryAvailable: Boolean(health?.available),
      batteryOk: health ? !needsBatteryGuidance(health) : true,
      reminderStatusKnown: status !== null,
    });
  }, []);

  useEffect(() => {
    void refreshPermissions();
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void refreshPermissions();
      }
    });
    return () => sub.remove();
  }, [refreshPermissions]);

  const requestNotifications = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      if (permission) {
        const result = await PermissionsAndroid.request(permission);
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          await openNotificationSettings();
        }
      } else {
        await openNotificationSettings();
      }
    } catch {
      await openNotificationSettings();
    }
    await refreshPermissions();
  };

  const requestMicrophone = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
      if (permission) {
        const result = await PermissionsAndroid.request(permission);
        if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          await Linking.openSettings();
        }
      }
    } catch {
      // Ignore permission prompt errors; user can still use text mode.
    }
    await refreshPermissions();
  };

  const requestRuntimeAll = async () => {
    setRuntimePrompted(true);
    if (Platform.OS !== 'android') {
      onContinue();
      return;
    }
    try {
      if (
        !state.notificationsOk &&
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      ) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      }
      if (!state.microphoneOk && PermissionsAndroid.PERMISSIONS.RECORD_AUDIO) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
      }
    } catch {
      // Keep onboarding non-blocking even if an OS dialog fails.
    }
    await refreshPermissions();
  };

  const openAlarmSettings = async () => {
    await openExactAlarmSettings();
    await refreshPermissions();
  };

  const openFullScreenSettings = async () => {
    await openFullScreenIntentSettings();
    await refreshPermissions();
  };

  const openBattery = async () => {
    await openBatterySettings();
    await refreshPermissions();
  };

  const showQuickRuntimeCta =
    Platform.OS === 'android' &&
    !runtimePrompted &&
    (!state.notificationsOk || !state.microphoneOk);

  return (
    <OnboardingPage
      pageKey="permissions"
      headLabel={headLabel}
      onBack={onBack}
      backLabel={backLabel}
      progress={progress}
      scrollable
      title="Enable alerts & voice."
      copy="Allow notifications, exact alarms, and mic so LAFINA can remind you on time and listen when you tap to speak."
      note="You can change any permission later in Profile or Android Settings."
      primary={
        showQuickRuntimeCta
          ? {
              label: 'Allow Notifications & Mic',
              onPress: () => void requestRuntimeAll(),
              testID: 'onboarding-perm-allow-all',
            }
          : {
              label: 'Continue',
              onPress: onContinue,
              testID: 'onboarding-continue',
            }
      }
      secondary={
        showQuickRuntimeCta
          ? {
              label: 'Skip for now',
              onPress: onContinue,
              testID: 'onboarding-continue',
            }
          : undefined
      }
      testID="onboarding-permissions"
    >
      {sharedDownload ? (
        <Notice
          testID="onboarding-perm-ai-downloading"
          text={`Downloading ${
            getOfflineModelPreset(sharedDownload.modelId).shortLabel
          } (${sharedDownload.progress.percent}%) in the background…`}
        />
      ) : null}

      <PermissionRow
        title="Notifications"
        description="Shows class alerts, deadline reminders, and heads-up call banners."
        granted={state.notificationsOk}
        actionLabel="Allow"
        onAction={() => void requestNotifications()}
        testID="onboarding-perm-notifications"
      />

      {!state.checked || state.reminderStatusKnown ? (
        <>
          <PermissionRow
            title="Alarms & Reminders"
            description="Fires class and deadline alarms at the exact scheduled minute."
            granted={state.exactAlarmsOk}
            actionLabel="Enable"
            onAction={() => void openAlarmSettings()}
            testID="onboarding-perm-alarms"
          />

          <PermissionRow
            title="Full-Screen Reminder Calls"
            description="Presents incoming reminder calls even when the screen is locked."
            granted={state.fullScreenOk}
            actionLabel="Enable"
            onAction={() => void openFullScreenSettings()}
            testID="onboarding-perm-fullscreen"
          />
        </>
      ) : null}

      <PermissionRow
        title="Microphone"
        description="Used only when you tap to speak in voice mode or answer a reminder call."
        granted={state.microphoneOk}
        actionLabel="Allow"
        onAction={() => void requestMicrophone()}
        testID="onboarding-perm-mic"
      />

      {state.batteryAvailable && !state.batteryOk ? (
        <PermissionRow
          title="Battery Saver"
          description="Set LAFINA to Unrestricted so background alarms are not stopped."
          granted={state.batteryOk}
          actionLabel="Open"
          onAction={() => void openBattery()}
          testID="onboarding-perm-battery"
        />
      ) : null}

      <Text style={[onboardingStyles.small, {color: t.muted}]}>
        Text scheduling and handbook chat work even if you skip permissions now.
      </Text>
    </OnboardingPage>
  );
};

const PermissionRow: React.FC<{
  title: string;
  description: string;
  granted: boolean;
  actionLabel: string;
  onAction: () => void;
  testID: string;
}> = ({title, description, granted, actionLabel, onAction, testID}) => {
  const t = useOnboardingTokens();
  return (
    <Card testID={testID}>
      <View style={styles.rowHeader}>
        <View style={onboardingStyles.flex1}>
          <Text style={[onboardingStyles.strong, {color: t.ink}]}>{title}</Text>
        </View>
        {granted ? (
          <Tag label="Allowed" tone="good" />
        ) : (
          <SecondaryButton
            label={actionLabel}
            onPress={onAction}
            testID={`${testID}-btn`}
            style={styles.actionBtn}
          />
        )}
      </View>
      <Text style={[onboardingStyles.small, {color: t.muted}]}>
        {description}
      </Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
});
