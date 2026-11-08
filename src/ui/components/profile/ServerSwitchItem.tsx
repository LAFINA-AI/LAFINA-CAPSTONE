/**
 * Debug and test builds only (see `backendSelection`): switch the server
 * between the Vercel backend and a backend on the developer's computer.
 *
 * Sign-ins belong to one server, so a signed-in account is signed out first
 * (at the old server). Planner data stays on this phone; the student signs in
 * again on the new server. A guest is simply switched.
 */
import React, {useState} from 'react';
import {Alert} from 'react-native';
import {SettingItem} from './SettingItem';
import {
  BACKEND_LABELS,
  backendSelection,
} from '../../../cloud/backendSelection';
import type {BackendChoice} from '../../../cloud/backendSelection';

const SHORT_LABELS: Record<BackendChoice, string> = {
  vercel: 'Vercel',
  local: 'Local',
};

const CHOICES: readonly BackendChoice[] = ['vercel', 'local'];

interface ServerSwitchItemProps {
  isGuest: boolean;
  /** Signs out at the current server and clears the session on this phone. */
  endSession: () => Promise<void>;
  /** Called after a signed-in account was signed out for the switch. */
  onSessionEnded: () => void;
}

export const ServerSwitchItem: React.FC<ServerSwitchItemProps> = ({
  isGuest,
  endSession,
  onSessionEnded,
}) => {
  const [current, setCurrent] = useState(() => backendSelection.current());

  const switchTo = async (next: BackendChoice) => {
    if (!isGuest) {
      try {
        await endSession();
      } catch {
        // The session on this phone is cleared either way; carry on.
      }
    }
    const result = backendSelection.select(next);
    setCurrent(backendSelection.current());
    if (!result.switched) {
      Alert.alert('Not changed', 'This build cannot switch servers.');
      return;
    }
    const remembered = result.saved
      ? ''
      : '\n\nThis choice could not be saved and resets when the app restarts.';
    Alert.alert(
      'Server changed',
      `Now using ${BACKEND_LABELS[next]}.${
        isGuest ? '' : ' Sign in again with an account on this server.'
      }${remembered}`,
    );
    if (!isGuest) onSessionEnded();
  };

  const handlePress = () => {
    const now = current ? BACKEND_LABELS[current] : 'a custom server';
    const lines = [
      `Now using ${now}.`,
      'Local needs the LAFINA backend running on your computer (port 8000) and "adb reverse tcp:8000 tcp:8000".',
    ];
    if (!isGuest) {
      lines.push(
        'Switching signs you out. Your planner data stays on this phone; sign in again on the other server.',
      );
    }
    Alert.alert('Server (debug build)', lines.join('\n\n'), [
      {text: 'Cancel', style: 'cancel'},
      ...CHOICES.filter(choice => choice !== current).map(choice => ({
        text: `Use ${SHORT_LABELS[choice]}`,
        onPress: () => {
          void switchTo(choice);
        },
      })),
    ]);
  };

  return (
    <SettingItem
      text="Server (debug)"
      type="link"
      valueText={current ? SHORT_LABELS[current] : 'Custom'}
      onPress={handlePress}
    />
  );
};
