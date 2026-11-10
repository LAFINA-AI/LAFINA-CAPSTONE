import {NativeModules} from 'react-native';
import {nativeVoiceTransport} from '../../src/cloud/voiceConversation/nativeTransport';

test('app-owned playback fails closed on an older native bridge', async () => {
  const modules = NativeModules as Record<string, unknown>;
  const previous = modules.LafinaVoiceConversation;
  const start = jest.fn();
  modules.LafinaVoiceConversation = {start};
  try {
    await expect(nativeVoiceTransport.start({sessionKey: 'key', url: 'wss://example.invalid', initiation: '{}', appOwnedAudio: true})).rejects.toThrow(/safely control/);
    expect(start).not.toHaveBeenCalled();
  } finally { modules.LafinaVoiceConversation = previous; }
});

test('app-owned playback flag reaches the supporting native bridge', async () => {
  const modules = NativeModules as Record<string, unknown>;
  const previous = modules.LafinaVoiceConversation;
  const start = jest.fn().mockResolvedValue(true);
  modules.LafinaVoiceConversation = {start, supportsAppOwnedAudio: async () => true};
  try {
    await nativeVoiceTransport.start({sessionKey: 'key', url: 'wss://example.invalid', initiation: '{}', appOwnedAudio: true});
    expect(start).toHaveBeenCalledWith(expect.objectContaining({appOwnedAudio: true}));
  } finally { modules.LafinaVoiceConversation = previous; }
});
