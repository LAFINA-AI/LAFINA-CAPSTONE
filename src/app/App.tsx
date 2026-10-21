import {useEffect, useState} from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import type {PreferencesRepository} from '../core/domain/preferences';
import {openPreferences} from '../core/storage/openPreferences';
import {ThemeContext, useTheme} from '../core/theme/ThemeContext';
import {
  dimensions,
  resolveTheme,
  spacing,
  typography,
} from '../core/theme/theme';
import {Button, Message} from '../core/ui/controls';
import {PreferencesForm} from '../features/onboarding/PreferencesForm';
import {useLocalPreferences} from './useLocalPreferences';

const systemNow = () => new Date();
type Tab = 'Today' | 'Calendar' | 'Chat' | 'Settings';
const tabs: Tab[] = ['Today', 'Calendar', 'Chat', 'Settings'];

export function App({
  repositoryFactory = openPreferences,
  now = systemNow,
}: {
  repositoryFactory?: () => PreferencesRepository;
  now?: () => Date;
}) {
  const {state, save, retry} = useLocalPreferences(repositoryFactory);
  const scheme = useColorScheme();
  const [tab, setTab] = useState<Tab>('Today');
  const [confirmRetake, setConfirmRetake] = useState(false);
  const [resetError, setResetError] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const preferences = state.kind === 'ready' ? state.preferences : null;
  const theme = resolveTheme(preferences?.theme ?? 'system', scheme);
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (confirmRetake) {
        setConfirmRetake(false);
        return true;
      }
      if (tab !== 'Today') {
        setTab('Today');
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [tab, confirmRetake]);
  async function retake() {
    if (!preferences) {
      return;
    }
    setResetBusy(true);
    try {
      await save({...preferences, onboardingCompletedAt: null});
      setConfirmRetake(false);
      setTab('Today');
      setResetError(false);
    } catch {
      setResetError(true);
    } finally {
      setResetBusy(false);
    }
  }
  const onboarded = preferences?.onboardingCompletedAt != null;
  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={theme}>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
        <SafeAreaView
          style={[styles.root, {backgroundColor: theme.colors.background}]}
        >
          <View style={styles.root}>
            <ScrollView
              style={styles.viewport}
              key={onboarded ? tab : 'onboarding'}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scroll}
            >
              <View style={styles.content}>
                <Text style={[styles.brand, {color: theme.colors.primary}]}>
                  LAFINA{' '}
                  <Text style={{color: theme.colors.muted}}> / STUDENT</Text>
                </Text>
                {state.kind === 'loading' ? (
                  <Message text="Opening your local planner…" />
                ) : state.kind === 'error' ? (
                  <View style={styles.padded}>
                    <Message
                      error
                      text="Local settings could not be opened. Your saved data has not been reset. Try again."
                    />
                    <Button label="Retry opening settings" onPress={retry} />
                  </View>
                ) : !onboarded ? (
                  <PreferencesForm
                    initial={state.preferences}
                    onboarding
                    onSave={async next => {
                      await save({
                        ...next,
                        onboardingCompletedAt: now().toISOString(),
                      });
                      setTab('Today');
                    }}
                  />
                ) : (
                  <>
                    {tab === 'Settings' ? (
                      <>
                        <PreferencesForm
                          initial={state.preferences}
                          onboarding={false}
                          onSave={save}
                        />
                        <View style={styles.padded}>
                          {confirmRetake ? (
                            <>
                              <Message text="Reopen setup? Your preferences will be kept. This does not erase local data." />
                              <Button
                                label={
                                  resetBusy
                                    ? 'Reopening setup…'
                                    : 'Reopen onboarding'
                                }
                                disabled={resetBusy}
                                onPress={() => {
                                  void retake();
                                }}
                              />
                              <Button
                                label="Keep current setup"
                                secondary
                                disabled={resetBusy}
                                onPress={() => setConfirmRetake(false)}
                              />
                            </>
                          ) : (
                            <Button
                              label="Review onboarding"
                              secondary
                              onPress={() => setConfirmRetake(true)}
                            />
                          )}
                          {resetError ? (
                            <Message
                              error
                              text="Setup could not be reopened. Your current preferences are unchanged. Try again."
                            />
                          ) : null}
                          {__DEV__ ? (
                            <>
                              <Button
                                label={
                                  diagnostics
                                    ? 'Hide diagnostics'
                                    : 'Show diagnostics'
                                }
                                secondary
                                onPress={() => setDiagnostics(value => !value)}
                              />
                              {diagnostics ? (
                                <Message text="Local settings: SQLite loaded. Network features: absent. Alarm, STT, TTS and intent adapters: not implemented. No microphone or notification permission is requested by this build." />
                              ) : null}
                            </>
                          ) : null}
                        </View>
                      </>
                    ) : (
                      <Overview
                        tab={tab}
                        nickname={state.preferences.nickname}
                        timezone={state.preferences.timezone}
                        date={now()}
                        onSettings={() => setTab('Settings')}
                      />
                    )}
                  </>
                )}
              </View>
            </ScrollView>
            {onboarded ? (
              <View
                accessible={false}
                collapsable={false}
                style={[
                  styles.tabs,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                {tabs.map(item => (
                  <Pressable
                    key={item}
                    accessibilityRole="tab"
                    accessibilityState={{selected: tab === item}}
                    onPress={() => {
                      setTab(item);
                      setConfirmRetake(false);
                    }}
                    style={[
                      styles.tab,
                      {
                        backgroundColor:
                          tab === item
                            ? theme.colors.selected
                            : theme.colors.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        {
                          color:
                            tab === item
                              ? theme.colors.primary
                              : theme.colors.muted,
                        },
                      ]}
                    >
                      {tab === item ? '• ' : ''}
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

function Overview({
  tab,
  nickname,
  timezone,
  date,
  onSettings,
}: {
  tab: Exclude<Tab, 'Settings'>;
  nickname: string;
  timezone: string;
  date: Date;
  onSettings: () => void;
}) {
  const {colors} = useTheme();
  return (
    <View style={styles.padded}>
      <Text
        accessibilityRole="header"
        style={[styles.title, {color: colors.text}]}
      >
        {tab === 'Today' ? `You're set, ${nickname || 'Student'}.` : tab}
      </Text>
      {tab === 'Today' ? (
        <>
          <Message
            text={new Intl.DateTimeFormat('en', {
              dateStyle: 'full',
              timeZone: timezone,
            }).format(date)}
          />
          <Text style={[styles.heading, {color: colors.text}]}>
            A quieter place for your academic plans.
          </Text>
          <Message text="Your local setup is saved. Task, event and reminder tools are not available in this foundation build." />
          <Message
            text={`Timezone: ${timezone}. No account or connection required.`}
          />
          <Button label="Adjust my preferences" onPress={onSettings} />
        </>
      ) : (
        <>
          <Message
            text={
              tab === 'Calendar'
                ? 'Your academic calendar will appear here. Creating tasks, events and reminders is not available yet.'
                : 'Your scheduling conversations will appear here. Text commands and hold-to-talk are not available yet.'
            }
          />
          <Message text="Your local preferences remain available in Settings." />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  viewport: {flex: 1, overflow: 'hidden'},
  scroll: {flexGrow: 1},
  content: {
    width: '100%',
    maxWidth: dimensions.contentMax,
    alignSelf: 'center',
  },
  brand: {
    fontSize: typography.small,
    fontWeight: '700',
    letterSpacing: 1,
    padding: spacing.lg,
  },
  padded: {padding: spacing.lg},
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  heading: {
    fontSize: typography.heading,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  tabs: {
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: dimensions.border,
    padding: spacing.xs,
  },
  tab: {
    flexGrow: 1,
    minHeight: dimensions.control,
    justifyContent: 'center',
    padding: spacing.sm,
    borderRadius: dimensions.radius,
  },
  tabText: {fontSize: typography.small, fontWeight: '600', textAlign: 'center'},
});
