import React, {useEffect, useState} from 'react';
import {
  getActiveVoiceConversation,
  subscribeVoiceConversation,
} from '../../../cloud/voiceConversation';
import {MiniCallBar} from './MiniCallBar';

/** Meter events never reach AppContent; this component needs only call status. */
export function LiveMiniCallBar({
  bottomOffset,
  onExpand,
  onEnd,
}: {
  bottomOffset: number;
  onExpand: () => void;
  onEnd: () => void;
}) {
  const [controller, setController] = useState(getActiveVoiceConversation);
  useEffect(
    () =>
      subscribeVoiceConversation(() =>
        setController(getActiveVoiceConversation()),
      ),
    [],
  );
  const [status, setStatus] = useState(() => controller?.getSnapshot());
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (!controller) return;
    const update = () => {
      const next = controller.getSnapshot();
      setStatus(previous =>
        previous?.phase === next.phase && previous?.muted === next.muted
          ? previous
          : next,
      );
      if (['ended', 'idle', 'failed', 'restart_required'].includes(next.phase))
        onEnd();
    };
    update();
    const unsubscribe = controller.subscribe(update);
    const tick = () => {
      const start = controller.getSnapshot().connectedAt;
      setDuration(
        start ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0,
      );
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [controller, onEnd]);
  if (!status) return null;
  return (
    <MiniCallBar
      phase={status.phase}
      muted={status.muted}
      durationSeconds={duration}
      bottomOffset={bottomOffset}
      onExpand={onExpand}
      onToggleMute={() => controller?.setMuted(!controller.getSnapshot().muted)}
      onEndCall={() => {
        controller?.end();
        onEnd();
      }}
    />
  );
}
