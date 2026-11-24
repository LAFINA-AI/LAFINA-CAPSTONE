import {cloudClient, setMockOnlineState} from '../../src/cloud/cloudClient';
import {userStore} from '../../src/storage/userStore';
import {noteSessionChange} from '../../src/storage/sessionEpoch';
import {authService} from '../../src/cloud/authService';

const savedFetch = global.fetch;
let owner = 'audit-a';
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return {promise, resolve};
};
beforeEach(() => {
  owner = 'audit-a';
  cloudClient.setBaseUrl('https://audit.invalid');
  setMockOnlineState(true);
  jest.spyOn(userStore, 'getActiveSessionToken').mockImplementation(() => ({
    userId: owner,
    accessToken: owner,
    refreshToken: null,
  }));
  jest.spyOn(cloudClient, 'getAccessToken').mockImplementation(() => owner);
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => '{}',
  })) as unknown as typeof fetch;
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  global.fetch = savedFetch;
  setMockOnlineState(null);
  cloudClient.resetBaseUrls();
});

test.each(['request', 'stream'] as const)(
  '%s refuses a payload if the account switches during connectivity lookup',
  async kind => {
    const online = deferred<boolean>();
    jest.spyOn(cloudClient, 'isOnline').mockReturnValue(online.promise);
    const pending =
      kind === 'request'
        ? cloudClient.request('/v1/sync/batch', {body: 'private-a'})
        : cloudClient.stream(
            '/v1/ai/chat',
            {private: 'a'},
            {onText: jest.fn()},
          );
    owner = 'audit-b';
    online.resolve(true);
    expect(await pending).toMatchObject({
      status: 'server_unavailable',
      error: expect.stringMatching(/sign-in changed/),
    });
    expect(global.fetch).not.toHaveBeenCalled();
  },
);

test('signing back into the same owner invalidates an older request', async () => {
  const online = deferred<boolean>();
  jest.spyOn(cloudClient, 'isOnline').mockReturnValue(online.promise);
  const pending = cloudClient.request('/v1/ai/chat');
  noteSessionChange();
  online.resolve(true);
  expect((await pending).status).toBe('server_unavailable');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('same-owner re-login cannot reuse the previous sign-in cached access token', () => {
  (cloudClient.getAccessToken as jest.Mock).mockRestore();
  (userStore.getActiveSessionToken as jest.Mock).mockReturnValue({
    userId: owner,
    accessToken: 'old-secret',
    refreshToken: null,
  });
  cloudClient.resetSessionCache();
  expect(cloudClient.getAccessToken()).toBe('old-secret');
  noteSessionChange();
  (userStore.getActiveSessionToken as jest.Mock).mockReturnValue({
    userId: owner,
    accessToken: null,
    refreshToken: null,
  });
  expect(cloudClient.getAccessToken()).toBeNull();
  cloudClient.resetSessionCache();
});

test('an old logout completion never clears a newer sign-in for the same owner', async () => {
  const reply = deferred<{status: 'success'}>();
  jest.spyOn(cloudClient, 'request').mockReturnValue(reply.promise);
  const clear = jest.spyOn(cloudClient, 'clearActiveSession');
  const pending = authService.logout();
  noteSessionChange();
  reply.resolve({status: 'success'});
  await pending;
  expect(clear).not.toHaveBeenCalled();
});

test('a response from the previous sign-in is not returned to a new sign-in', async () => {
  const body = deferred<string>();
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: () => body.promise,
  })) as unknown as typeof fetch;
  const pending = cloudClient.request('/v1/me');
  await Promise.resolve();
  await Promise.resolve();
  owner = 'audit-b';
  body.resolve('{"private":"a"}');
  expect((await pending).status).toBe('server_unavailable');
});

test.each([200, 500])(
  'the deadline covers a stalled HTTP %s response body',
  async status => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => ({
      ok: status === 200,
      status,
      text: () => new Promise(() => undefined),
      json: () => new Promise(() => undefined),
    })) as unknown as typeof fetch;
    const pending = cloudClient.request('/v1/test', {timeoutMs: 100}, false);
    await jest.advanceTimersByTimeAsync(101);
    expect(await pending).toMatchObject({
      status: 'server_unavailable',
      error: expect.stringMatching(/timed out/),
    });
  },
);

test('cancellation remains connected while the body is being read', async () => {
  const reading = deferred<boolean>();
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: () => {
      reading.resolve(true);
      return new Promise(() => undefined);
    },
  })) as unknown as typeof fetch;
  const controller = new AbortController();
  const pending = cloudClient.request(
    '/v1/test',
    {signal: controller.signal},
    false,
  );
  await reading.promise;
  controller.abort();
  expect(await pending).toMatchObject({
    status: 'server_unavailable',
    error: 'Request cancelled.',
  });
});

test('stream chunks arriving after an account switch are neither delivered nor returned', async () => {
  const original = global.XMLHttpRequest;
  const xhr = {
    readyState: 1,
    status: 200,
    responseText: '',
    timeout: 0,
    open: jest.fn(),
    setRequestHeader: jest.fn(),
    send: jest.fn(),
    abort: jest.fn(),
    onprogress: null as (() => void) | null,
    onload: null as (() => void) | null,
  };
  global.XMLHttpRequest = jest.fn(
    () => xhr,
  ) as unknown as typeof XMLHttpRequest;
  try {
    const onText = jest.fn();
    const pending = cloudClient.stream('/v1/chat', {}, {onText});
    await Promise.resolve();
    await Promise.resolve();
    expect(xhr.send).toHaveBeenCalled();
    owner = 'audit-b';
    xhr.responseText = 'private old-account chunk';
    xhr.onprogress?.();
    xhr.onload?.();
    expect((await pending).status).toBe('server_unavailable');
    expect(onText).not.toHaveBeenCalled();
  } finally {
    global.XMLHttpRequest = original;
  }
});
