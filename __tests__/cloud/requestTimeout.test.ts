/**
 * cloudClient.request gives up on a silent server after 25 s by default,
 * while slow AI work (documents, meeting notes, transcription, whole chat
 * replies) passes a longer `timeoutMs` and is not cut off early.
 */
import {cloudClient, setMockOnlineState} from '../../src/cloud/cloudClient';

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  setMockOnlineState(true);
  cloudClient.setBaseUrl('https://example.test');
  // A server that never answers until the request is aborted.
  fetchMock = jest.fn(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  setMockOnlineState(null);
  jest.useRealTimers();
});

const settle = async (ms: number) => {
  await jest.advanceTimersByTimeAsync(ms);
};

it('a plain request times out after 25 s', async () => {
  let result: Awaited<ReturnType<typeof cloudClient.request>> | null = null;
  void cloudClient.request('/v1/x', {}, false).then(r => {
    result = r;
  });
  await settle(24_000);
  expect(result).toBeNull();
  await settle(6_000);
  expect(result).toMatchObject({status: 'server_unavailable'});
  expect((result as unknown as {error: string}).error).toMatch(/timed out/);
});

it('a request with its own timeoutMs waits that long instead', async () => {
  let result: Awaited<ReturnType<typeof cloudClient.request>> | null = null;
  void cloudClient
    .request('/v1/ai/documents', {method: 'POST', timeoutMs: 90_000}, false)
    .then(r => {
      result = r;
    });
  await settle(60_000);
  expect(result).toBeNull();
  await settle(35_000);
  expect(result).toMatchObject({status: 'server_unavailable'});
  // The limit is not passed on to fetch itself.
  expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('timeoutMs');
});

it('a caller cancelling is reported as cancelled, not as a timeout', async () => {
  const controller = new AbortController();
  const pending = cloudClient.request(
    '/v1/x',
    {signal: controller.signal},
    false,
  );
  await settle(1_000);
  controller.abort();
  await expect(pending).resolves.toMatchObject({
    status: 'server_unavailable',
    error: 'Request cancelled.',
  });
});
