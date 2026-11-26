import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { APP_VERSION } from '../../../appVersion';
import { appUpdater } from '../../../updates';
import type { UpdateService, UpdateState } from '../../../updates';
import {
  markSeen,
  shouldAutoCheck,
  shouldAutoDownload,
  shouldPrompt,
  SNOOZE_MS,
  whatsNewToShow,
  type NetworkKind,
  type UpdateMemory,
} from '../../../updates/updatePrompt';
import { loadUpdateMemory, onUpdateSheetRequest, saveUpdateMemory } from './updateMemory';
import { UpdateSheet, type UpdateSheetMode } from './UpdateSheet';

export const useUpdateState = (service: UpdateService): UpdateState => {
  const [state, setState] = useState(service.getState);
  useEffect(() => {
    setState(service.getState());
    return service.subscribe(setState);
  }, [service]);
  return state;
};

export const readNetwork = async (): Promise<NetworkKind> => {
  try {
    const net = await NetInfo.fetch();
    const details = (net.details ?? null) as { isConnectionExpensive?: boolean } | null;
    const connected = net.isConnected !== false && net.isInternetReachable !== false;
    const unmeteredType = net.type === 'wifi' || net.type === 'ethernet';
    return { connected, unmetered: unmeteredType && details?.isConnectionExpensive !== true };
  } catch {
    return { connected: false, unmetered: false };
  }
};

interface AppUpdatePromptProps {
  /** True while something must not be covered: a call, the walkthrough, a permission prompt. */
  suppressed: boolean;
  service?: UpdateService;
  now?: () => number;
}

/**
 * LAFINA's automatic updates, mounted once in the signed-in app:
 *  - checks the GitHub release on start and when the app comes back (at most hourly);
 *  - on Wi-Fi, downloads a new version by itself, then offers to apply it;
 *  - on mobile data, offers it with its size first;
 *  - after an update, shows its release notes once ("What's new");
 *  - opens the same sheet for Profile > Check for updates.
 * It never interrupts a call, the walkthrough or a permission prompt.
 */
export const AppUpdatePrompt: React.FC<AppUpdatePromptProps> = ({
  suppressed,
  service = appUpdater,
  now = Date.now,
}) => {
  const state = useUpdateState(service);
  const [initialMemory] = useState(loadUpdateMemory);
  const memory = useRef<UpdateMemory>(initialMemory);
  const [sheet, setSheet] = useState<UpdateSheetMode | null>(null);
  const [queuedWhatsNew, setQueuedWhatsNew] = useState<UpdateSheetMode | null>(null);
  const [network, setNetwork] = useState<NetworkKind | null>(null);
  /** The version already offered this session, so it is not offered twice. */
  const offeredVersion = useRef<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const remember = useCallback((next: UpdateMemory) => {
    memory.current = next;
    saveUpdateMemory(next);
  }, []);

  // Once per start: the notes of an update that has just been applied.
  useEffect(() => {
    const whatsNew = whatsNewToShow(memory.current, APP_VERSION);
    remember(markSeen(memory.current, APP_VERSION));
    if (whatsNew) setQueuedWhatsNew({ mode: 'whats-new', whatsNew });
  }, [remember]);

  const autoCheck = useCallback(
    async (force: boolean) => {
      const at = now();
      if (!force && !shouldAutoCheck(memory.current, at)) return;
      remember({ ...memory.current, lastAutoCheckAt: at });
      const result = await service.check({ quiet: true });
      if (!mountedRef.current || result.phase !== 'available') return;
      const net = await readNetwork();
      if (!mountedRef.current) return;
      setNetwork(net);
      if (shouldAutoDownload(result, net)) void service.download();
    },
    [now, remember, service],
  );

  // On start (always) and on return to the app (at most hourly).
  useEffect(() => {
    void autoCheck(true);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void autoCheck(false);
    });
    return () => subscription.remove();
  }, [autoCheck]);

  // Profile > Check for updates.
  useEffect(
    () =>
      onUpdateSheetRequest(() => {
        const current = service.getState();
        if (
          current.phase === 'idle' ||
          current.phase === 'up-to-date' ||
          (current.phase === 'error' && !current.version)
        ) {
          void service.check();
        }
        void readNetwork().then(net => {
          if (mountedRef.current) setNetwork(net);
        });
        setSheet({ mode: 'update' });
      }),
    [service],
  );

  // Offer what was found, once per version per session, unless "Later" was chosen.
  useEffect(() => {
    if (suppressed || sheet) return;
    if (queuedWhatsNew) {
      setSheet(queuedWhatsNew);
      setQueuedWhatsNew(null);
      return;
    }
    if (!state.version || offeredVersion.current === `${state.version}:${state.phase}`) return;
    if (!shouldPrompt(state, memory.current, now())) return;
    offeredVersion.current = `${state.version}:${state.phase}`;
    void readNetwork().then(net => {
      if (mountedRef.current) setNetwork(net);
    });
    setSheet({ mode: 'update' });
  }, [suppressed, sheet, queuedWhatsNew, state, now]);

  // A call or the walkthrough starting hides the sheet; it comes back afterwards.
  const hiddenBySuppression = suppressed && sheet !== null;

  const close = useCallback(
    (later: boolean) => {
      if (later && sheet?.mode === 'update') {
        const version = service.getState().version;
        if (version) {
          remember({ ...memory.current, snoozedVersion: version, snoozedUntil: now() + SNOOZE_MS });
        }
      }
      setSheet(null);
    },
    [now, remember, service, sheet],
  );

  const applying = useCallback(
    (applied: UpdateState) => {
      if (!applied.version) return;
      remember({
        ...memory.current,
        whatsNew: { version: applied.version, title: applied.title, notes: applied.notes },
      });
    },
    [remember],
  );

  // A downloaded update starts by itself on the next launch even if nobody taps
  // Restart, so its notes are kept as soon as it is ready.
  useEffect(() => {
    if (state.phase === 'ready' && state.version && memory.current.whatsNew?.version !== state.version) {
      applying(state);
    }
  }, [state, applying]);

  if (!sheet) return null;
  return (
    <UpdateSheet
      visible={!hiddenBySuppression}
      sheet={sheet}
      service={service}
      state={state}
      network={network}
      onClose={close}
      onApplying={applying}
    />
  );
};
