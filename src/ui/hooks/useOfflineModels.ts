import {useEffect, useState} from 'react';
import {
  getActiveModelDownload,
  isOfflineModelEngineAvailable,
  subscribeModelDownload,
  type ActiveModelDownload,
} from '../../ai/nlu/modelManager';

/**
 * Whether this build can run downloaded GGUF models. `null` while checking;
 * screens must not offer downloads until it is `true` (audit H4).
 */
export function useOfflineModelEngine(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void isOfflineModelEngineAvailable()
      .then(value => {
        if (!cancelled) setAvailable(value);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

/**
 * The one model download in progress, shared by Chat's engine sheet and
 * Preferences, and still shown after leaving and reopening a screen
 * (audit M3).
 */
export function useSharedModelDownload(): ActiveModelDownload | null {
  const [download, setDownload] = useState<ActiveModelDownload | null>(() =>
    getActiveModelDownload(),
  );
  useEffect(() => {
    setDownload(getActiveModelDownload());
    return subscribeModelDownload(setDownload);
  }, []);
  return download;
}
