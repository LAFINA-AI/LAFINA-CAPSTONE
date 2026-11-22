import {SkillHalo} from './SkillMotion';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  AppState,
  NativeModules,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Pause, Play, RotateCcw, SkipForward} from 'lucide-react-native';
import {tasksStore} from '../../../storage/tasksStore';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {
  finishPomodoro,
  localDay,
  MODE_SECONDS,
  newPomodoro,
  reconcilePomodoro,
} from '../../../skills/studyLogic';
import type {PomodoroMode, PomodoroState} from '../../../skills/studyLogic';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {Choices, SkillButton, SkillCard, SkillText, ui} from './SkillUI';
import {SkillRing} from './SkillRing';
import {useStorageRevision} from '../../hooks/useStorageRevision';
import {
  applyPomodoro,
  readPomodoro,
  subscribePomodoro,
} from '../../../skills/pomodoroService';
import type {SkillLaunchRequest} from '../../../skills/skillLaunch';
const TASK_TABLES = ['tasks'] as const;

interface FocusNative {
  schedule: (
    owner: string,
    deadline: number,
    focus: boolean,
    silence: boolean,
  ) => Promise<boolean>;
  cancel: () => Promise<boolean>;
  silenceAccess: () => Promise<boolean>;
  openSilenceSettings: () => Promise<boolean>;
}
export function PomodoroSkill({
  userId,
  onOpenTodo,
  launch,
  onLaunchHandled,
}: {
  userId: string;
  onOpenTodo: (id?: string) => void;
  /** LAFINA opened Pomodoro (ADR-041); "start" starts it once. */
  launch?: SkillLaunchRequest | null;
  onLaunchHandled?: (id: string) => void;
}) {
  const p = useSkillsPalette();
  const native = NativeModules.LafinaFocus as FocusNative | undefined;
  const [timer, setTimer] = useState<PomodoroState>(() =>
    reconcilePomodoro(
      readSkillState(userId, 'pomodoro', newPomodoro()),
      Date.now(),
    ),
  );
  const ref = useRef(timer);
  ref.current = timer;
  const busy = useRef(false);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [pickTask, setPickTask] = useState(false);
  const taskRevision = useStorageRevision(TASK_TABLES);
  const [tasks, setTasks] = useState(() =>
    tasksStore.getAllTasks(userId).filter(t => !t.isCompleted),
  );
  useEffect(() => {
    setTasks(tasksStore.getAllTasks(userId).filter(t => !t.isCompleted));
  }, [userId, taskRevision]);
  const save = useCallback(
    (state: PomodoroState) => {
      try {
        writeSkillState(userId, 'pomodoro', state);
        ref.current = state;
        setTimer(state);
      } catch (e) {
        setErrorMsg((e as Error).message || 'Could not save timer.');
      }
    },
    [userId],
  );
  useEffect(() => {
    const refresh = () => {
      const current = ref.current;
      const next = reconcilePomodoro(current, Date.now());
      if (current.deadline && next.deadline === null) {
        save(next);
        setNotice('Session complete. Choose when to start the next session.');
      } else setTimer(next);
    };
    // Persist any completion reconciled from a session that ended with JS suspended.
    save(ref.current);
    const t = setInterval(refresh, 1000);
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') refresh();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [save]);
  // LAFINA can pause or resume the timer during a call; show what she did.
  useEffect(
    () =>
      subscribePomodoro(userId, () => {
        if (busy.current) return;
        const next = readPomodoro(userId);
        ref.current = next;
        setTimer(next);
      }),
    [userId],
  );
  const apply = async (
    draft: PomodoroState,
    options?: {starting?: boolean},
  ): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setNotice('');
    setErrorMsg('');
    try {
      // Save first; a failed local write must not start a timer the UI cannot restore.
      const result = await applyPomodoro(userId, draft, options);
      save(result.state);
      if (result.notice) setNotice(result.notice);
      if (result.error) setErrorMsg(result.error);
      return true;
    } catch (e) {
      setErrorMsg((e as Error).message || 'Could not save timer.');
      return false;
    } finally {
      busy.current = false;
    }
  };
  // A launch from LAFINA (ADR-041): start the focus session or a break the
  // student asked for, once. A session already running is left alone.
  const handledLaunch = useRef<string | null>(null);
  useEffect(() => {
    if (!launch || handledLaunch.current === launch.id) return;
    handledLaunch.current = launch.id;
    onLaunchHandled?.(launch.id);
    if (launch.action !== 'start' && launch.action !== 'break') return;
    const current = reconcilePomodoro(ref.current, Date.now());
    if (current.deadline) {
      setNotice('Your focus session is already running.');
      return;
    }
    const mode: PomodoroMode =
      launch.action === 'break'
        ? launch.breakKind === 'long'
          ? 'Long 15'
          : 'Break 5'
        : 'Focus 25';
    const draft =
      current.mode === mode && current.remaining > 0
        ? {...current, deadline: null}
        : {...current, mode, remaining: MODE_SECONDS[mode], deadline: null};
    void apply(draft, {starting: true}).then(started => {
      if (started)
        setNotice(
          mode === 'Focus 25'
            ? 'LAFINA started your focus session. Tap Pause any time.'
            : 'LAFINA started your break. Tap Pause any time.',
        );
    });
    // Runs once per launch id; apply reads the latest timer through ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch]);
  const changeMode = (mode: PomodoroMode) => {
    void apply({
      ...reconcilePomodoro(ref.current, Date.now()),
      mode,
      remaining: MODE_SECONDS[mode],
      deadline: null,
    });
  };
  const toggle = () => {
    const current = reconcilePomodoro(ref.current, Date.now());
    if (current.deadline) {
      void apply({...current, deadline: null});
    } else {
      void apply({...current, deadline: null}, {starting: true});
    }
  };
  const silence = async (value: boolean) => {
    if (value && (!native || !(await native.silenceAccess()))) {
      Alert.alert(
        'Allow focus silence',
        'Allow LAFINA to manage Do Not Disturb, then return and turn this on again. Alarms remain allowed.',
        [
          {text: 'Later', style: 'cancel'},
          {
            text: 'Open settings',
            onPress: () => {
              void native
                ?.openSilenceSettings()
                .catch(() =>
                  setErrorMsg('Could not open notification policy settings.'),
                );
            },
          },
        ],
      );
      return;
    }
    const current = reconcilePomodoro(ref.current, Date.now());
    await apply({...current, silence: value});
  };
  const todayKey = localDay(Date.now());
  const today = timer.counts[todayKey] ?? 0;
  const todayMinutes = timer.countsMinutes?.[todayKey] ?? today * 25;
  const selectedTask = timer.taskId
    ? tasks.find(t => t.id === timer.taskId) ?? null
    : null;
  return (
    <>
      <Choices
        label="Mode"
        values={['Focus 25', 'Break 5', 'Long 15'] as const}
        value={timer.mode}
        onChange={changeMode}
      />
      <View style={[ui.center, {marginTop: 24}]}>
        <SkillHalo active={timer.deadline !== null}>
          <SkillRing progress={timer.remaining / MODE_SECONDS[timer.mode]}>
            <Text
              accessibilityRole="timer"
              accessibilityLabel={`${Math.floor(
                timer.remaining / 60,
              )} minutes ${timer.remaining % 60} seconds remaining`}
              style={{
                fontFamily: SkillFonts.semibold,
                fontSize: 56,
                color: p.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {String(Math.floor(timer.remaining / 60)).padStart(2, '0')}:
              {String(timer.remaining % 60).padStart(2, '0')}
            </Text>
            <SkillText muted>
              {timer.deadline
                ? 'Stay with it'
                : timer.remaining === MODE_SECONDS[timer.mode]
                ? 'Ready when you are'
                : 'Paused'}
            </SkillText>
          </SkillRing>
        </SkillHalo>
      </View>
      <View style={[ui.center, {marginTop: 22, gap: 8}]}>
        <View
          style={ui.row}
          accessible
          accessibilityLabel={`${
            timer.cycle % 4
          } of 4 focus sessions in this cycle`}
        >
          {[0, 1, 2, 3].map(i => (
            <View
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: i < timer.cycle % 4 ? p.accent : p.border,
              }}
            />
          ))}
        </View>
        <SkillText muted size={13}>
          Session {(timer.cycle % 4) + 1} of 4 · Long break after 4
        </SkillText>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Choose a to-do to work on"
        onPress={() => setPickTask(!pickTask)}
        style={[
          ui.choice,
          {
            alignSelf: 'center',
            marginTop: 16,
            borderRadius: 20,
            backgroundColor: p.card,
            paddingHorizontal: 14,
          },
        ]}
      >
        <SkillText size={13}>
          Working on ·{' '}
          {selectedTask?.title ??
            (timer.taskId
              ? 'Task no longer open (Clear)'
              : 'Choose a to-do')}{' '}
          ›
        </SkillText>
      </TouchableOpacity>
      {pickTask && (
        <SkillCard>
          {timer.taskId && !selectedTask && (
            <SkillText muted size={12}>
              Your previously selected to-do was completed or removed.
            </SkillText>
          )}
          {tasks.length ? (
            <ScrollView
              style={{maxHeight: 220}}
              nestedScrollEnabled
              contentContainerStyle={{gap: 8}}
            >
              {tasks.map(t => (
                <SkillButton
                  key={t.id}
                  secondary
                  label={t.title}
                  onPress={() => {
                    save({...ref.current, taskId: t.id});
                    setPickTask(false);
                  }}
                />
              ))}
            </ScrollView>
          ) : (
            <SkillText muted>No open to-dos yet.</SkillText>
          )}
          {!!timer.taskId && (
            <SkillButton
              secondary
              label="Clear task"
              onPress={() => {
                save({...ref.current, taskId: null});
                setPickTask(false);
              }}
            />
          )}
          <SkillButton
            secondary
            label="Open To-do"
            onPress={() => onOpenTodo(selectedTask?.id)}
          />
        </SkillCard>
      )}
      <View
        style={[ui.row, {justifyContent: 'center', gap: 28, marginTop: 28}]}
      >
        <TouchableOpacity
          style={[
            ui.icon,
            {
              width: 56,
              height: 56,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: p.border,
              backgroundColor: p.card,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Reset timer"
          onPress={() => {
            const current = reconcilePomodoro(ref.current, Date.now());
            void apply({
              ...current,
              remaining: MODE_SECONDS[current.mode],
              deadline: null,
            });
          }}
        >
          <RotateCcw size={22} color={p.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            ui.icon,
            {
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: p.accent,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={timer.deadline ? 'Pause timer' : 'Start timer'}
          onPress={toggle}
        >
          {timer.deadline ? (
            <Pause size={30} color={p.onAccent} />
          ) : (
            <Play size={30} color={p.onAccent} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            ui.icon,
            {
              width: 56,
              height: 56,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: p.border,
              backgroundColor: p.card,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Skip to next session"
          onPress={() => {
            void apply(
              finishPomodoro(
                reconcilePomodoro(ref.current, Date.now()),
                false,
                Date.now(),
              ),
            );
          }}
        >
          <SkipForward size={22} color={p.text} />
        </TouchableOpacity>
      </View>
      <SkillCard style={{marginTop: 28}}>
        <View style={ui.between}>
          <SkillText muted>Today</SkillText>
          <SkillText strong>
            {today} sessions · {todayMinutes} min
          </SkillText>
        </View>
        <View style={ui.between}>
          <View style={ui.fill}>
            <SkillText>Silence notifications while focusing</SkillText>
            <SkillText muted size={12}>
              Optional Do Not Disturb access. Alarms stay on.
            </SkillText>
          </View>
          <Switch
            hitSlop={12}
            accessibilityLabel="Silence notifications while focusing"
            value={timer.silence}
            onValueChange={v => {
              void silence(v).catch(e =>
                setErrorMsg(
                  (e as Error).message || 'Could not update focus silence.',
                ),
              );
            }}
            trackColor={{true: p.accent, false: p.border}}
          />
        </View>
      </SkillCard>
      {!!errorMsg && <SkillText danger>{errorMsg}</SkillText>}
      {!!notice && <SkillText muted>{notice}</SkillText>}
    </>
  );
}
