import {useEffect, useMemo, useRef, useState} from 'react';
import {AppState, View} from 'react-native';
import type {ReplyMode, SpeechPreferences} from '../domain/preferences';
import {speechClient, type SpeechClient} from '../native/textToSpeech';
import {Button, Message} from '../ui/controls';

export interface WrittenReply {
  id: string;
  text: string;
}
const fallback =
  'Voice is unavailable or was interrupted. Your written reply and planner controls remain available.';

/** Written confirmation renders before optional, bounded native speech effects. */
export function ReplyMessage({
  reply,
  mode,
  options,
  client = speechClient,
}: {
  reply: WrittenReply;
  mode: ReplyMode;
  options: SpeechPreferences;
  client?: SpeechClient;
}) {
  const [notice, setNotice] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const cancel = useRef<() => void>(() => undefined);
  const {enginePackage, voiceName, languageTag, rate, pitch} = options;
  const selection = useMemo(
    () => ({enginePackage, voiceName, languageTag, rate, pitch}),
    [enginePackage, voiceName, languageTag, rate, pitch],
  );
  useEffect(() => {
    setNotice('');
    setSpeaking(false);
    cancel.current = () => undefined;
    if (mode === 'text') return;
    let active = true;
    let mounted = true;
    let terminal = false;
    cancel.current = () => {
      active = false;
      terminal = true;
      setSpeaking(false);
      setNotice('Voice stopped. Your written reply remains available.');
      void client.stop('reply-stopped').catch(() => {
        if (mounted) setNotice(fallback);
      });
    };
    const unsubscribe = client.subscribe(event => {
      if (!active || terminal || event.requestId !== reply.id) return;
      if (event.type === 'start') {
        setSpeaking(true);
        setNotice('Android started reading this reply.');
      } else if (['done', 'error', 'cancelled'].includes(event.type)) {
        terminal = true;
        setSpeaking(false);
        setNotice(event.type === 'done' ? '' : fallback);
      }
    });
    const background = AppState.addEventListener('change', state => {
      if (state !== 'active' && active) {
        active = false;
        terminal = true;
        setSpeaking(false);
        setNotice(
          'Voice stopped while the app was in the background. The written reply remains available.',
        );
        void client.dispose().catch(() => undefined);
      }
    });
    setSpeaking(true);
    setNotice('The written reply is ready. Preparing optional voice…');
    void (async () => {
      try {
        const inventory = await client.initialize(selection);
        if (!active) return;
        if (!inventory.available) {
          setSpeaking(false);
          setNotice(fallback);
          return;
        }
        const result = await client.speak(reply.id, reply.text);
        if (active && !terminal) {
          setSpeaking(result.accepted);
          setNotice(
            result.accepted
              ? 'Voice requested. The written reply is ready.'
              : fallback,
          );
        }
      } catch {
        if (active) {
          setSpeaking(false);
          setNotice(fallback);
        }
      }
    })();
    return () => {
      active = false;
      mounted = false;
      unsubscribe();
      background.remove();
      // Queue disposal now, before a newly mounted foreground client initializes.
      // Waiting for a stop Promise before disposing could shut down that new client.
      void client.dispose().catch(() => undefined);
    };
  }, [client, mode, selection, reply.id, reply.text]);
  return (
    <View>
      <Message text={reply.text} />
      {notice ? <Message text={notice} /> : null}
      {speaking ? (
        <Button
          label="Stop reading reply"
          secondary
          onPress={() => cancel.current()}
        />
      ) : null}
    </View>
  );
}
