import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  Cpu,
  Download,
  Gauge,
  Play,
  Square,
  Trash2,
} from 'lucide-react-native';
import {Fonts, Layout, Shadows} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {
  benchmarkResultsStore,
  chatTimingStore,
  describePlannedRun,
  EXECUTION_PATH_LABEL,
  formatMs,
  getModelEnvironment,
  isPerfTrackingSwitchOn,
  MAX_REPEATS,
  monotonicNow,
  runBenchmark,
  runOnlinePreflight,
  setPerfTrackingEnabled,
  SUITES,
  timingBreakdown,
  type AttemptResult,
  type BenchmarkMode,
  type BenchmarkRun,
  type ChatTimingEntry,
  type LatencyStats,
  type ModelEnvironment,
  type RunProgress,
  type SuiteId,
} from '../../../ai/benchmark';
import {warmUpOfflineModel} from '../../../ai/nlu/intentService';
import {exportBenchmarkRun, clearBenchmarkExports} from './benchmarkFiles';

interface Props {
  userId: string;
}

const REPEAT_CHOICES = [1, 3, 5, MAX_REPEATS];

const statusColor = (status: string, colors: ThemeColors): string =>
  status === 'PASS'
    ? colors.success
    : status === 'FAIL'
    ? colors.error
    : colors.textSecondary;

const statsLine = (s: LatencyStats): string => {
  if (s.n === 0) return 'no samples';
  const parts = [`n=${s.n}`, `min ${formatMs(s.min ?? 0)}`];
  if (s.median !== null) parts.push(`median ${formatMs(s.median)}`);
  if (s.p95 !== null) parts.push(`p95 ${formatMs(s.p95)}`);
  parts.push(`max ${formatMs(s.max ?? 0)}`);
  return parts.join(' · ') + (s.note ? ` (${s.note})` : '');
};

/**
 * Developer Testing Hub → Performance: per-message chat timing, one-click
 * benchmarks through the real chat pipeline, results and CSV/JSON exports.
 */
export const DeveloperPerformanceTab: React.FC<Props> = ({userId}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

  const [tracking, setTracking] = useState(isPerfTrackingSwitchOn);
  const [timings, setTimings] = useState<readonly ChatTimingEntry[]>(() =>
    chatTimingStore.list(),
  );
  const [openTiming, setOpenTiming] = useState<string | null>(null);

  const [modelEnv, setModelEnv] = useState<ModelEnvironment | null>(null);
  const [warmup, setWarmup] = useState<string | null>(null);
  const [warmBusy, setWarmBusy] = useState(false);

  const [repeats, setRepeats] = useState(1);
  const [customText, setCustomText] = useState('');
  const [customMode, setCustomMode] = useState<BenchmarkMode>('offline');
  const [includeContent, setIncludeContent] = useState(false);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [lastRun, setLastRun] = useState<BenchmarkRun | null>(() =>
    benchmarkResultsStore.latest(),
  );
  const [showResults, setShowResults] = useState(true);
  const [openAttempt, setOpenAttempt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = chatTimingStore.subscribe(() =>
      setTimings([...chatTimingStore.list()]),
    );
    void getModelEnvironment(userId).then(env => {
      if (mountedRef.current) setModelEnv(env);
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
      // Leaving the hub cancels a run in progress.
      abortRef.current?.abort();
    };
  }, [userId]);

  const toggleTracking = (next: boolean) => {
    if (setPerfTrackingEnabled(next)) setTracking(next);
  };

  const handleWarmup = async () => {
    setWarmBusy(true);
    const started = monotonicNow();
    try {
      const ready = await warmUpOfflineModel(userId);
      setWarmup(
        ready
          ? `Model ready in ${formatMs(
              monotonicNow() - started,
            )} (includes load if it was not already loaded).`
          : 'No model loaded: none installed, Fast-Path Only selected, or this build has no engine.',
      );
      setModelEnv(await getModelEnvironment(userId));
    } finally {
      setWarmBusy(false);
    }
  };

  const startRun = useCallback(
    async (
      args: {
        suiteId?: SuiteId;
        customPrompt?: {text: string; mode: BenchmarkMode};
      },
      preflight: Awaited<ReturnType<typeof runOnlinePreflight>> | null,
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      setProgress(null);
      try {
        const run = await runBenchmark({
          userId,
          ...args,
          repeats,
          includeContent,
          signal: controller.signal,
          onlinePreflight: preflight,
          onProgress: next => {
            if (mountedRef.current) setProgress({...next});
          },
        });
        benchmarkResultsStore.save(run);
        if (mountedRef.current) {
          setLastRun(run);
          setShowResults(true);
        }
      } catch (error) {
        Alert.alert(
          'Benchmark stopped',
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        abortRef.current = null;
        if (mountedRef.current) setRunning(false);
      }
    },
    [userId, repeats, includeContent],
  );

  /** Online runs show the preflight, request count and quota notice first. */
  const confirmAndRun = async (args: {
    suiteId?: SuiteId;
    customPrompt?: {text: string; mode: BenchmarkMode};
  }) => {
    if (running) return;
    const plan = describePlannedRun({...args, repeats});
    if (plan.providerRequests === 0) {
      void startRun(args, null);
      return;
    }
    setRunning(true);
    let preflight: Awaited<ReturnType<typeof runOnlinePreflight>>;
    try {
      preflight = await runOnlinePreflight(userId);
    } finally {
      setRunning(false);
    }
    const lines = preflight.checks
      .map(c => `${c.status} · ${c.name}: ${c.detail}`)
      .join('\n');
    const quota = `${plan.total} request(s) planned, ${plan.providerRequests} sent to the online provider. Online tests use your account's AI quota. Nothing is confirmed, saved or scheduled.`;
    Alert.alert(
      preflight.ok ? 'Run online test?' : 'Online preflight failed',
      `${lines}\n\n${quota}${
        preflight.ok
          ? ''
          : '\n\nOnline cases will be SKIPPED. Simulated and offline cases still run.'
      }`,
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Run', onPress: () => void startRun(args, preflight)},
      ],
    );
  };

  const runCustom = () => {
    const text = customText.trim();
    if (!text) return;
    void confirmAndRun({customPrompt: {text, mode: customMode}});
  };

  const cancelRun = () => abortRef.current?.abort();

  const handleExport = async (format: 'csv' | 'json') => {
    if (!lastRun) return;
    try {
      await exportBenchmarkRun(lastRun, format);
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const clearResults = () => {
    Alert.alert(
      'Clear benchmark results',
      'Removes saved benchmark runs and exported benchmark files. Your planner, chats and memories are not touched.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            benchmarkResultsStore.clear();
            void clearBenchmarkExports();
            setLastRun(null);
          },
        },
      ],
    );
  };

  const suiteButton = (suiteId: SuiteId, label: string, color: string) => (
    <TouchableOpacity
      key={suiteId}
      style={[styles.primaryBtn, {backgroundColor: color}]}
      onPress={() => void confirmAndRun({suiteId})}
      disabled={running}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled: running}}
    >
      <Play size={16} color="#FFF" style={styles.btnIcon} />
      <Text style={styles.primaryBtnText}>
        {label} ({describePlannedRun({suiteId, repeats}).total})
      </Text>
    </TouchableOpacity>
  );

  const renderAttempt = (a: AttemptResult) => {
    const open = openAttempt === a.attemptId;
    const total = a.trace?.marks.replyReady ?? a.trace?.totalMs ?? null;
    return (
      <View key={a.attemptId} style={[styles.attemptRow, themed.border]}>
        <TouchableOpacity
          onPress={() => setOpenAttempt(open ? null : a.attemptId)}
          accessibilityRole="button"
          accessibilityLabel={`${a.caseName}, ${a.requestedMode}, ${a.status}`}
        >
          <View style={styles.attemptHeader}>
            <Text
              style={[styles.attemptTitle, themed.textPrimary]}
              numberOfLines={1}
            >
              {a.index}. {a.caseName} · {a.requestedMode}
              {a.repeatIndex > 0 ? ` #${a.repeatIndex + 1}` : ''}
            </Text>
            <Text
              style={[styles.badge, {color: statusColor(a.status, colors)}]}
            >
              {a.status}
            </Text>
          </View>
          <Text style={[styles.small, themed.textSecondary]}>
            {a.trace ? EXECUTION_PATH_LABEL[a.trace.executionPath] : '—'}
            {a.trace?.facts.modelState &&
            a.trace.facts.modelState !== 'not_used'
              ? ` · ${a.trace.facts.modelState}`
              : ''}
            {total !== null ? ` · ${formatMs(total)}` : ''}
            {a.simulationLabel ? ` · ${a.simulationLabel}` : ''}
            {a.modeMismatch ? ' · mode/route mismatch' : ''}
          </Text>
        </TouchableOpacity>
        {open ? (
          <View style={styles.detail}>
            {a.reason ? (
              <Text style={[styles.small, themed.textSecondary]}>
                Note: {a.reason}
              </Text>
            ) : null}
            {a.assertions.map(x => (
              <Text
                key={x.name}
                style={[styles.small, {color: statusColor(x.status, colors)}]}
              >
                {x.status} {x.name}: expected {x.expected}; got {x.actual}
              </Text>
            ))}
            {a.trace
              ? timingBreakdown(a.trace).map(row => (
                  <Text
                    key={row.key}
                    style={[styles.small, themed.textSecondary]}
                  >
                    {row.label}:{' '}
                    {row.ms !== null
                      ? formatMs(row.ms)
                      : `unavailable (${row.unavailable})`}
                  </Text>
                ))
              : null}
            {a.trace?.bypassed.length ? (
              <Text style={[styles.small, themed.textSecondary]}>
                Skipped on purpose: {a.trace.bypassed.join(', ')}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.tabContent}>
      {/* Per-message timing */}
      <View style={[styles.card, themed.card, Shadows.card]}>
        <View style={styles.cardHeader}>
          <Gauge size={18} color={colors.blue} />
          <Text style={[styles.cardTitle, themed.textPrimary]}>
            Per-message timing
          </Text>
        </View>
        <View style={styles.switchRow}>
          <Text style={[styles.body, themed.textPrimary, styles.flex]}>
            Show timing under chat replies
          </Text>
          <Switch
            value={tracking}
            onValueChange={toggleTracking}
            accessibilityLabel="Show timing under chat replies"
          />
        </View>
        <Text style={[styles.description, themed.textSecondary]}>
          Measured on this phone from the moment you tap Send, with a monotonic
          clock. “On screen” means the first frame after the text was committed.
          Online times are the whole round trip, not the server’s own thinking
          time. Kept in memory only, without message text.
        </Text>
        {timings.length === 0 ? (
          <Text style={[styles.small, themed.textSecondary]}>
            {tracking
              ? 'Send a chat message to see its timing here.'
              : 'Turn timing on, then send a chat message.'}
          </Text>
        ) : (
          timings.slice(0, 8).map(entry => {
            const snap = entry.snapshot;
            const open = openTiming === snap.requestId;
            return (
              <View
                key={snap.requestId}
                style={[styles.attemptRow, themed.border]}
              >
                <TouchableOpacity
                  onPress={() => setOpenTiming(open ? null : snap.requestId)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.attemptTitle, themed.textPrimary]}>
                    {snap.requestedMode} →{' '}
                    {EXECUTION_PATH_LABEL[snap.executionPath]}
                    {snap.totalMs !== null
                      ? ` · ${formatMs(snap.totalMs)}`
                      : ''}
                  </Text>
                  <Text style={[styles.small, themed.textSecondary]}>
                    {snap.startedAt.slice(11, 19)} · {snap.outcome ?? 'open'}
                    {snap.facts.intent ? ` · ${snap.facts.intent}` : ''}
                    {snap.facts.fallbackReason
                      ? ` · ${snap.facts.fallbackReason}`
                      : ''}
                  </Text>
                </TouchableOpacity>
                {open ? (
                  <View style={styles.detail}>
                    {timingBreakdown(snap).map(row => (
                      <Text
                        key={row.key}
                        style={[styles.small, themed.textSecondary]}
                      >
                        {row.label}:{' '}
                        {row.ms !== null
                          ? formatMs(row.ms)
                          : `unavailable (${row.unavailable})`}
                      </Text>
                    ))}
                    <Text style={[styles.small, themed.textSecondary]}>
                      Provider/model:{' '}
                      {snap.facts.onlineModelId ??
                        snap.facts.offlineModelId ??
                        'unknown'}
                      {snap.facts.transportNote
                        ? ` · ${snap.facts.transportNote}`
                        : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
        {timings.length > 0 ? (
          <TouchableOpacity
            style={[styles.smallBtn, themed.smallBtn]}
            onPress={() => chatTimingStore.clear()}
          >
            <Trash2 size={14} color={colors.textPrimary} />
            <Text style={[styles.small, themed.textPrimary]}>
              Clear timings
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Offline model */}
      <View style={[styles.card, themed.card, Shadows.card]}>
        <View style={styles.cardHeader}>
          <Cpu size={18} color={colors.blue} />
          <Text style={[styles.cardTitle, themed.textPrimary]}>
            Offline model check
          </Text>
        </View>
        <Text style={[styles.body, themed.textPrimary]}>
          {modelEnv
            ? `${modelEnv.selectedModelId} · ${modelEnv.availability}${
                modelEnv.engineAvailable === false
                  ? ' · no engine in this build'
                  : ''
              }`
            : 'Checking…'}
        </Text>
        <Text style={[styles.description, themed.textSecondary]}>
          Loads the installed model to test initialization. It never downloads
          anything.
        </Text>
        {warmup ? (
          <Text style={[styles.small, themed.textPrimary]}>{warmup}</Text>
        ) : null}
        <TouchableOpacity
          style={[styles.outlineBtn, {borderColor: colors.blue}]}
          onPress={handleWarmup}
          disabled={warmBusy || running}
          accessibilityRole="button"
        >
          {warmBusy ? (
            <ActivityIndicator size="small" color={colors.blue} />
          ) : (
            <Text style={[styles.outlineBtnText, {color: colors.blue}]}>
              Load model now and time it
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* One-click tests */}
      <View style={[styles.card, themed.card, Shadows.card]}>
        <View style={styles.cardHeader}>
          <Activity size={18} color={colors.blue} />
          <Text style={[styles.cardTitle, themed.textPrimary]}>
            One-click tests
          </Text>
        </View>
        <Text style={[styles.description, themed.textSecondary]}>
          Runs prepared prompts one at a time through the real Chat pipeline.
          Each stops at the review card or question: nothing is confirmed, saved
          to chat, remembered or scheduled. Simulated failures are labelled and
          left out of the latency numbers.
        </Text>
        <Text style={[styles.small, themed.textSecondary]}>Repeat count</Text>
        <View style={styles.pillRow}>
          {REPEAT_CHOICES.map(n => (
            <TouchableOpacity
              key={n}
              style={[
                styles.pill,
                themed.pillBg,
                repeats === n && {backgroundColor: colors.blue},
              ]}
              onPress={() => setRepeats(n)}
              disabled={running}
              accessibilityRole="button"
              accessibilityState={{selected: repeats === n}}
            >
              <Text
                style={[
                  styles.small,
                  repeats === n ? styles.pillTextActive : themed.textPrimary,
                ]}
              >
                ×{n}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.buttonStack}>
          {suiteButton('quick_offline', 'Run Quick Offline Test', colors.blue)}
          {suiteButton('quick_online', 'Run Quick Online Test', colors.blue)}
          {suiteButton('compare', 'Compare Supported Commands', colors.blue)}
          {suiteButton('extended', `Run ${SUITES.extended.name}`, colors.blue)}
        </View>

        <Text style={[styles.small, themed.textSecondary, styles.spaced]}>
          Custom prompt
        </Text>
        <TextInput
          style={[styles.input, themed.input]}
          value={customText}
          onChangeText={setCustomText}
          placeholder="Type a prompt to time"
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel="Custom prompt"
          multiline
        />
        <View style={styles.pillRow}>
          {(['offline', 'online'] as BenchmarkMode[]).map(m => (
            <TouchableOpacity
              key={m}
              style={[
                styles.pill,
                themed.pillBg,
                customMode === m && {backgroundColor: colors.blue},
              ]}
              onPress={() => setCustomMode(m)}
              accessibilityRole="button"
              accessibilityState={{selected: customMode === m}}
            >
              <Text
                style={[
                  styles.small,
                  customMode === m ? styles.pillTextActive : themed.textPrimary,
                ]}
              >
                {m === 'offline' ? 'Offline' : 'Online'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.switchRow}>
          <Text style={[styles.small, themed.textPrimary, styles.flex]}>
            Keep prompt and reply text in results and exports
          </Text>
          <Switch
            value={includeContent}
            onValueChange={setIncludeContent}
            accessibilityLabel="Keep prompt and reply text in results and exports"
          />
        </View>
        <TouchableOpacity
          style={[styles.primaryBtn, {backgroundColor: colors.blue}]}
          onPress={runCustom}
          disabled={running || !customText.trim()}
          accessibilityRole="button"
        >
          <Play size={16} color="#FFF" style={styles.btnIcon} />
          <Text style={styles.primaryBtnText}>Run Custom Prompt</Text>
        </TouchableOpacity>

        {running ? (
          <View style={[styles.progressBox, themed.resultBox]}>
            <View style={styles.attemptHeader}>
              <ActivityIndicator size="small" color={colors.blue} />
              <Text style={[styles.body, themed.textPrimary, styles.flex]}>
                {progress
                  ? `${progress.completed}/${progress.total} · ${
                      progress.currentCase ?? 'finishing'
                    }${
                      progress.currentMode ? ` (${progress.currentMode})` : ''
                    }`
                  : 'Preparing…'}
              </Text>
            </View>
            {progress ? (
              <>
                <View style={[styles.progressTrack, themed.pillBg]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: colors.blue,
                        width: `${Math.round(
                          (progress.completed / Math.max(1, progress.total)) *
                            100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.small, themed.textSecondary]}>
                  Elapsed {formatMs(progress.elapsedMs)}
                </Text>
              </>
            ) : null}
            <TouchableOpacity
              style={[styles.outlineBtn, {borderColor: colors.error}]}
              onPress={cancelRun}
              accessibilityRole="button"
              accessibilityLabel="Cancel run"
            >
              <Square size={14} color={colors.error} style={styles.btnIcon} />
              <Text style={[styles.outlineBtnText, {color: colors.error}]}>
                Cancel Run
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Results */}
      <View style={[styles.card, themed.card, Shadows.card]}>
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => setShowResults(v => !v)}
          accessibilityRole="button"
          accessibilityLabel="View Last Results"
        >
          <Gauge size={18} color={colors.blue} />
          <Text style={[styles.cardTitle, themed.textPrimary, styles.flex]}>
            View Last Results
          </Text>
          <Text style={[styles.small, themed.textSecondary]}>
            {showResults ? 'Hide' : 'Show'}
          </Text>
        </TouchableOpacity>
        {!lastRun ? (
          <Text style={[styles.small, themed.textSecondary]}>
            No saved runs yet.
          </Text>
        ) : showResults ? (
          <>
            <Text style={[styles.body, themed.textPrimary]}>
              {lastRun.suiteName} · {lastRun.status} ·{' '}
              {lastRun.startedAt.replace('T', ' ').slice(0, 19)}
            </Text>
            <Text style={[styles.small, themed.textSecondary]}>
              Attempted {lastRun.summary.attempted} · pass{' '}
              {lastRun.summary.passed} · fail {lastRun.summary.failed} ·
              unavailable {lastRun.summary.unavailable} · skipped{' '}
              {lastRun.summary.skipped} · cancelled {lastRun.summary.cancelled}
            </Text>
            {lastRun.isolation.sideEffectCheck ? (
              <Text
                style={[
                  styles.small,
                  {
                    color: statusColor(
                      lastRun.isolation.sideEffectCheck.status,
                      colors,
                    ),
                  },
                ]}
              >
                Personal data unchanged:{' '}
                {lastRun.isolation.sideEffectCheck.status}
                {lastRun.isolation.sideEffectCheck.changed.length
                  ? ` (changed: ${lastRun.isolation.sideEffectCheck.changed.join(
                      ', ',
                    )})`
                  : ''}
              </Text>
            ) : null}
            {lastRun.isolation.bypassedStages.length ? (
              <Text style={[styles.small, themed.textSecondary]}>
                Skipped on purpose:{' '}
                {lastRun.isolation.bypassedStages.join(', ')}
              </Text>
            ) : null}
            {lastRun.notes.map(note => (
              <Text key={note} style={[styles.small, themed.textSecondary]}>
                {note}
              </Text>
            ))}
            <Text style={[styles.subTitle, themed.textPrimary]}>
              Latency (successful, real runs; Send → reply ready)
            </Text>
            <Text style={[styles.small, themed.textSecondary]}>
              Grouped by case, mode, path and cold/warm. Not a ranking of online
              against offline: they answer different work.
            </Text>
            {lastRun.summary.latency.length === 0 ? (
              <Text style={[styles.small, themed.textSecondary]}>
                No successful real samples.
              </Text>
            ) : (
              lastRun.summary.latency.map(g => (
                <View key={g.key} style={[styles.attemptRow, themed.border]}>
                  <Text style={[styles.attemptTitle, themed.textPrimary]}>
                    {g.caseName} · {g.requestedMode} ·{' '}
                    {EXECUTION_PATH_LABEL[g.executionPath]} · {g.modelState}
                  </Text>
                  <Text style={[styles.small, themed.textSecondary]}>
                    {statsLine(g.replyReady)}
                  </Text>
                  {g.firstContent ? (
                    <Text style={[styles.small, themed.textSecondary]}>
                      First text: {statsLine(g.firstContent)}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
            <Text style={[styles.subTitle, themed.textPrimary]}>Attempts</Text>
            {lastRun.attempts.map(renderAttempt)}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, themed.secondaryBtn]}
                onPress={() => void handleExport('csv')}
                accessibilityRole="button"
              >
                <Download size={14} color={colors.textPrimary} />
                <Text style={[styles.small, themed.textPrimary]}>
                  Export CSV
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, themed.secondaryBtn]}
                onPress={() => void handleExport('json')}
                accessibilityRole="button"
              >
                <Download size={14} color={colors.textPrimary} />
                <Text style={[styles.small, themed.textPrimary]}>
                  Export JSON
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
        <TouchableOpacity
          style={[styles.outlineBtn, {borderColor: colors.error}]}
          onPress={clearResults}
          disabled={running}
          accessibilityRole="button"
        >
          <Trash2 size={14} color={colors.error} style={styles.btnIcon} />
          <Text style={[styles.outlineBtnText, {color: colors.error}]}>
            Clear benchmark results
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  card: {backgroundColor: colors.cardBg},
  textPrimary: {color: colors.textPrimary},
  textSecondary: {color: colors.textSecondary},
  border: {borderColor: colors.border},
  pillBg: {backgroundColor: colors.background},
  input: {
    backgroundColor: colors.background,
    color: colors.textPrimary,
    borderColor: colors.border,
  },
  smallBtn: {backgroundColor: colors.background, borderColor: colors.border},
  secondaryBtn: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  resultBox: {backgroundColor: colors.background, borderColor: colors.border},
});

const styles = StyleSheet.create({
  tabContent: {gap: 16},
  card: {borderRadius: Layout.borderRadiusCard, padding: 16, gap: 8},
  cardHeader: {flexDirection: 'row', alignItems: 'center', gap: 8},
  cardTitle: {fontSize: 16, fontFamily: Fonts.heading, fontWeight: 'bold'},
  subTitle: {
    fontSize: 14,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
    marginTop: 8,
  },
  description: {fontSize: 13, fontFamily: Fonts.body, lineHeight: 18},
  body: {fontSize: 13, fontFamily: Fonts.body},
  small: {fontSize: 12, fontFamily: Fonts.body, lineHeight: 16},
  flex: {flex: 1},
  spaced: {marginTop: 8},
  switchRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  pillRow: {flexDirection: 'row', gap: 8},
  pill: {
    flex: 1,
    minHeight: 36,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillTextActive: {color: '#FFF', fontWeight: 'bold'},
  buttonStack: {gap: 8},
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: Fonts.body,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: Layout.borderRadiusButton,
    minHeight: 44,
  },
  outlineBtnText: {fontSize: 13, fontFamily: Fonts.body, fontWeight: 'bold'},
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    minHeight: 36,
  },
  btnIcon: {marginRight: 6},
  input: {
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: Fonts.body,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  progressBox: {borderWidth: 1, borderRadius: 8, padding: 12, gap: 8},
  progressTrack: {height: 6, borderRadius: 3, overflow: 'hidden'},
  progressFill: {height: 6},
  attemptRow: {borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8},
  attemptHeader: {flexDirection: 'row', alignItems: 'center', gap: 8},
  attemptTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.body,
    fontWeight: '600',
  },
  badge: {fontSize: 12, fontFamily: Fonts.body, fontWeight: 'bold'},
  detail: {marginTop: 6, gap: 2},
  actionRow: {flexDirection: 'row', gap: 8, marginTop: 8},
});
