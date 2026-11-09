import {NativeModules} from 'react-native';
import {directProviderTestEnabled, directTestChat, directTestVoiceApi} from '../../src/cloud/directProviderTest';

const native = NativeModules as Record<string, unknown>;
const original = native.CapstoneBuild;
const originalFetch = global.fetch;

beforeEach(() => {
  native.CapstoneBuild = {providerTestingEnabled: true, directElevenKey: 'test-eleven',
    directDeepseekKey: 'test-deepseek', directAgentId: 'agent-test', directVoiceId: 'voice-test'};
});
afterEach(() => { native.CapstoneBuild = original; global.fetch = originalFetch; });

test('direct mode is limited to explicitly configured QA builds', () => {
  expect(directProviderTestEnabled()).toBe(true);
  native.CapstoneBuild = {providerTestingEnabled: false, directElevenKey: 'test'};
  expect(directProviderTestEnabled()).toBe(false);
});

test('chat uses DeepSeek directly and carries bounded memory context', async () => {
  const mock = jest.fn().mockResolvedValue({ok: true, json: async () => ({choices: [{message: {content: 'Hello'}}]})});
  global.fetch = mock as unknown as typeof fetch;
  const result = await directTestChat([{role: 'user', content: 'Hi'}], [{id: '1', text: 'Likes studying at night'}]);
  expect(result.data?.reply).toBe('Hello');
  expect(mock.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
  expect(mock.mock.calls[0][1].body).toContain('Likes studying at night');
});

test('voice obtains its signed session directly from ElevenLabs', async () => {
  const mock = jest.fn().mockResolvedValue({ok: true, json: async () => ({signed_url: 'wss://api.elevenlabs.io/test'})});
  global.fetch = mock as unknown as typeof fetch;
  const result = await directTestVoiceApi.createSession({requestId: 'test', voiceId: null, useHandbook: false}, new AbortController().signal);
  expect(result.ok).toBe(true);
  expect(mock.mock.calls[0][0]).toContain('api.elevenlabs.io/v1/convai/conversation/get-signed-url');
});

test('direct chat does not fabricate handbook-backed answers', async () => {
  const mock = jest.fn();
  global.fetch = mock as unknown as typeof fetch;
  const result = await directTestChat([{role: 'user', content: 'What is the USTP tuition policy?'}]);
  expect(result.status).toBe('server_unavailable');
  expect(mock).not.toHaveBeenCalled();
});
