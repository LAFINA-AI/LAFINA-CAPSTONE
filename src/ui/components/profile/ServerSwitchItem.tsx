/**
 * Debug and test builds only (see `backendSelection`): switch the server
 * between the Vercel backend and a backend on the developer's computer.
 *
 * Sign-ins belong to one server, so a signed-in account is signed out first
 * (at the old server). Planner data stays on this phone; the student signs in
 * again on the new server. A guest is simply switched.
 */
import React, {useState} from 'react';
import {
  Alert,
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {SettingItem} from './SettingItem';
import {
  BACKEND_LABELS,
  localBackendUrl,
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
  const {colors} = useTheme();
  const [editingLocal, setEditingLocal] = useState(false);
  const [localUrl, setLocalUrl] = useState(localBackendUrl);
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
      'For Wi-Fi, enter your computer’s private IP address and port, such as http://192.168.1.20:8000. Both devices must be on the same network. Keep the computer and backend running.',
    ];
    if (!isGuest) {
      lines.push(
        'Switching signs you out. Your planner data stays on this phone; sign in again on the other server.',
      );
    }
    Alert.alert('Server (debug build)', lines.join('\n\n'), [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Set local Wi-Fi address', onPress: () => setEditingLocal(true)},
      ...CHOICES.filter(choice => choice !== current).map(choice => ({
        text: `Use ${SHORT_LABELS[choice]}`,
        onPress: () => {
          void switchTo(choice);
        },
      })),
    ]);
  };

  return (
    <>
      <Modal
        visible={editingLocal}
        transparent
        onRequestClose={() => setEditingLocal(false)}
      >
        <View style={styles.overlay}>
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <Text
              accessibilityRole="header"
              style={{color: colors.textPrimary}}
            >
              Local backend address
            </Text>
            <Text style={{color: colors.textSecondary}}>
              Use the computer’s Wi-Fi IPv4 address, with port 8000. USB uses
              http://127.0.0.1:8000.
            </Text>
            <TextInput
              accessibilityLabel="Local backend URL"
              value={localUrl}
              onChangeText={setLocalUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[
                styles.input,
                {color: colors.textPrimary, borderColor: colors.border},
              ]}
            />
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.button}
              onPress={() => {
                const value = localUrl.trim().replace(/\/+$/, '');
                if (!backendSelection.saveLocalUrl(value)) {
                  Alert.alert(
                    'Address not saved',
                    'Enter http:// followed by a private IPv4 address and port, for example http://192.168.1.20:8000.',
                  );
                  return;
                }
                setEditingLocal(false);
                void switchTo('local');
              }}
            >
              <Text style={{color: colors.primary}}>Save and use local</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.button}
              onPress={() => setEditingLocal(false)}
            >
              <Text style={{color: colors.textPrimary}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <SettingItem
        text="Server (debug)"
        type="link"
        valueText={current ? SHORT_LABELS[current] : 'Custom'}
        onPress={handlePress}
      />
    </>
  );
};
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#0008',
    justifyContent: 'center',
    padding: 24,
  },
  card: {padding: 20, borderRadius: 16, gap: 12},
  input: {borderWidth: 1, padding: 12, minHeight: 48, borderRadius: 8},
  button: {minHeight: 48, justifyContent: 'center'},
});
