import {SkillHalo} from './SkillMotion';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  AppState,
  NativeModules,
  PermissionsAndroid,
  Platform,
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
}: {
  userId: string;
  onOpenTodo: (id?: string) => void;
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
  const [pickTask, setPickTask] = useState(false);
  const tasks = tasksStore.getAllTasks(userId).filter(t => !t.isCompleted);
  const save = useCallback(
    (state: PomodoroState) => {
      ref.current = state;
      setTimer(state);
      try {
        writeSkillState(userId, 'pomodoro', state);
      } catch (e) {
        setNotice((e as Error).message);
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
  const apply = async (next: PomodoroState) => {
    if (busy.current) return;
    busy.current = true;
    setNotice('');
    try {
      // Save first; a failed local write must not start a timer the UI cannot restore.
      writeSkillState(userId, 'pomodoro', next);
      if (next.deadline) {
        if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED)
            setNotice('Notifications are off. The visual timer still works.');
        }
        const exact = await native?.schedule(
          userId,
          next.deadline,
          next.mode === 'Focus 25',
          next.silence,
        );
        if (exact === false)
          setNotice(
            'Exact alarms are not allowed. The session notification may arrive late.',
          );
        if (!native)
          setNotice('Background notifications are unavailable in this build.');
      } else await native?.cancel();
      save(next);
    } catch (e) {
      save(next);
      setNotice(
        `Timer saved; notification setup failed. ${(e as Error).message}`,
      );
    } finally {
      busy.current = false;
    }
  };
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
    void apply(
      current.deadline
        ? {...current, deadline: null}
        : {...current, deadline: Date.now() + current.remaining * 1000},
    );
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
                  setNotice('Could not open notification policy settings.'),
                );
            },
          },
        ],
      );
      return;
    }
    await apply({...ref.current, silence: value});
  };
  const today = timer.counts[localDay(Date.now())] ?? 0;
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
          {tasks.find(t => t.id === timer.taskId)?.title ?? 'Choose a to-do'} ›
        </SkillText>
      </TouchableOpacity>
      {pickTask && (
        <SkillCard>
          {tasks.length ? (
            tasks.map(t => (
              <SkillButton
                key={t.id}
                secondary
                label={t.title}
                onPress={() => {
                  save({...ref.current, taskId: t.id});
                  setPickTask(false);
                }}
              />
            ))
          ) : (
            <SkillText muted>No open to-dos yet.</SkillText>
          )}
          <SkillButton
            secondary
            label="Open To-do"
            onPress={() => onOpenTodo(timer.taskId ?? undefined)}
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
            void apply({
              ...reconcilePomodoro(ref.current, Date.now()),
              remaining: MODE_SECONDS[ref.current.mode],
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
            {today} sessions · {today * 25} min
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
            accessibilityLabel="Silence notifications while focusing"
            value={timer.silence}
            onValueChange={v => {
              void silence(v).catch(e => setNotice((e as Error).message));
            }}
            trackColor={{true: p.accent, false: p.border}}
          />
        </View>
      </SkillCard>
      {!!notice && <SkillText muted>{notice}</SkillText>}
    </>
  );
}
