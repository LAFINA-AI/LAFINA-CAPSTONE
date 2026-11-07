/**
 * Access tokens last 15 minutes. An authenticated request that gets 401
 * renews once with the stored refresh token and retries, so online chat and
 * ElevenLabs speech do not silently fall back to offline after 15 minutes.
 */
import {cloudClient, setMockOnlineState} from '../../src/cloud/cloudClient';
import type {CloudStreamOptions} from '../../src/cloud/cloudClient';
import {userStore} from '../../src/storage/userStore';
import {authService} from '../../src/cloud/authService';

type FakeResponse = {status: number; body: unknown};
const reply = (status: number, body: unknown = {}): FakeResponse => ({
  status,
  body,
});

let token: string | null;
let owner: string | null;
let fetchMock: jest.Mock;

const route = (
  handler: (
    url: string,
    init: RequestInit,
  ) => FakeResponse | Promise<FakeResponse>,
) => {
  fetchMock = jest.fn(async (url: string, init: RequestInit) => {
    const {status, body} = await handler(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
  (globalThis as {fetch: unknown}).fetch = fetchMock;
};
const authOf = (init: RequestInit) =>
  (init.headers as Record<string, string>).Authorization;
const calls = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));

beforeEach(() => {
  token = 'expired-access';
  owner = 'renew-user';
  setMockOnlineState(true);
  cloudClient.setBaseUrl('https://api.example.invalid');
  jest.spyOn(cloudClient, 'getAccessToken').mockImplementation(() => token);
  jest.spyOn(userStore, 'getActiveSessionToken').mockImplementation(() => ({
    userId: owner,
    accessToken: token,
    refreshToken: 'encrypted',
  }));
  jest
    .spyOn(cloudClient, 'getEncryptedRefreshToken')
    .mockResolvedValue('refresh-1');
  jest
    .spyOn(cloudClient, 'establishSession')
    .mockImplementation(async (_user: string, access: string) => {
      token = access;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
  setMockOnlineState(null);
  cloudClient.resetBaseUrls();
});

const refreshOk = reply(200, {
  access_token: 'fresh-access',
  refresh_token: 'refresh-2',
});

it('renews an expired token once and retries the request with the new one', async () => {
  route((url, init) => {
    if (url.endsWith('/v1/auth/refresh')) return refreshOk;
    return authOf(init) === 'Bearer fresh-access'
      ? reply(200, {reply: 'Hi!'})
      : reply(401, {detail: 'Token expired'});
  });
  const result = await cloudClient.request<{reply: string}>('/v1/ai/chat', {
    method: 'POST',
    body: '{"messages":[]}',
  });
  expect(result).toMatchObject({status: 'success', data: {reply: 'Hi!'}});
  expect(calls('/v1/auth/refresh')).toHaveLength(1);
  const [, refreshInit] = calls('/v1/auth/refresh')[0];
  expect(JSON.parse(String(refreshInit.body))).toEqual({
    refresh_token: 'refresh-1',
  });
  expect(authOf(refreshInit)).toBeUndefined(); // the refresh call itself is unauthenticated
  expect(cloudClient.establishSession).toHaveBeenCalledWith(
    'renew-user',
    'fresh-access',
    'refresh-2',
  );
  const chat = calls('/v1/ai/chat');
  expect(chat.map(([, init]) => authOf(init))).toEqual([
    'Bearer expired-access',
    'Bearer fresh-access',
  ]);
  expect(chat[1][1].body).toBe('{"messages":[]}');
});

it('shares one renewal between requests that expire together (the server rotates refresh tokens)', async () => {
  let releaseRefresh: () => void = () => undefined;
  const refreshGate = new Promise<void>(resolve => {
    releaseRefresh = resolve;
  });
  route(async (url, init) => {
    if (url.endsWith('/v1/auth/refresh')) {
      await refreshGate;
      return refreshOk;
    }
    return authOf(init) === 'Bearer fresh-access' ? reply(200, {}) : reply(401);
  });
  const pending = [
    cloudClient.request('/v1/ai/chat', {method: 'POST', body: '{}'}),
    cloudClient.request('/v1/ai/tts', {method: 'POST', body: '{}'}),
    cloudClient.request('/v1/ai/tts/capabilities'),
  ];
  await new Promise(resolve => setTimeout(resolve, 0));
  releaseRefresh();
  const results = await Promise.all(pending);
  expect(results.map(r => r.status)).toEqual(['success', 'success', 'success']);
  expect(calls('/v1/auth/refresh')).toHaveLength(1);
});

it('retries without renewing when another request already renewed the token', async () => {
  route((url, init) => {
    if (url.endsWith('/v1/auth/refresh')) return refreshOk;
    if (authOf(init) === 'Bearer expired-access') {
      token = 'renewed-elsewhere'; // renewed while this request was in flight
      return reply(401);
    }
    return reply(200, {});
  });
  expect((await cloudClient.request('/v1/ai/chat')).status).toBe('success');
  expect(calls('/v1/auth/refresh')).toHaveLength(0);
});

it('a failed renewal returns the original sign-in error and never signs out', async () => {
  const signOut = jest.spyOn(cloudClient, 'clearActiveSession');
  route(url =>
    url.endsWith('/v1/auth/refresh')
      ? reply(401, {detail: 'Invalid or expired refresh token.'})
      : reply(401),
  );
  const result = await cloudClient.request('/v1/ai/chat');
  expect(result).toMatchObject({status: 'auth_required', httpStatus: 401});
  expect(calls('/v1/ai/chat')).toHaveLength(1);
  expect(calls('/v1/auth/refresh')).toHaveLength(1);
  expect(signOut).not.toHaveBeenCalled();
  expect(cloudClient.establishSession).not.toHaveBeenCalled();
});

it('never attaches renewed tokens to an account that changed meanwhile', async () => {
  route(url => {
    if (url.endsWith('/v1/auth/refresh')) {
      owner = 'someone-else';
      return refreshOk;
    }
    return reply(401);
  });
  const result = await cloudClient.request('/v1/ai/chat');
  expect(result.status).toBe('auth_required');
  expect(cloudClient.establishSession).not.toHaveBeenCalled();
  expect(calls('/v1/ai/chat')).toHaveLength(1);
});

it('does not renew for unauthenticated calls, other errors, or without a refresh token', async () => {
  route(() => reply(401));
  await cloudClient.request(
    '/v1/auth/login',
    {method: 'POST', body: '{}'},
    false,
  );
  route(() => reply(403, {detail: 'Plan required'}));
  await cloudClient.request('/v1/ai/chat');
  expect(calls('/v1/auth/refresh')).toHaveLength(0);

  (cloudClient.getEncryptedRefreshToken as jest.Mock).mockResolvedValue(null);
  route(() => reply(401));
  expect((await cloudClient.request('/v1/ai/chat')).status).toBe(
    'auth_required',
  );
  expect(calls('/v1/auth/refresh')).toHaveLength(0);
});

it('streaming chat renews the same way before any text arrives', async () => {
  route(url =>
    url.endsWith('/v1/auth/refresh')
      ? refreshOk
      : reply(500, {detail: 'unexpected'}),
  );
  const streamOnce = jest
    .spyOn(cloudClient, 'streamOnce')
    .mockImplementationOnce(async () => ({
      status: 'auth_required',
      error: 'expired',
      httpStatus: 401,
    }))
    .mockImplementationOnce(
      async (_path, _body, options: CloudStreamOptions) => {
        options.onText('data: {"type":"delta","text":"Hi"}\n\n');
        return {status: 'success', data: '', httpStatus: 200};
      },
    );
  const onText = jest.fn();
  const result = await cloudClient.stream('/v1/ai/chat/stream', {}, {onText});
  expect(result.status).toBe('success');
  expect(streamOnce).toHaveBeenCalledTimes(2);
  expect(calls('/v1/auth/refresh')).toHaveLength(1);
  expect(onText).toHaveBeenCalledTimes(1);
});

it('renews when no access token is held but a refresh token is stored', async () => {
  token = null;
  route((url, init) => {
    if (url.endsWith('/v1/auth/refresh')) return refreshOk;
    return authOf(init) === 'Bearer fresh-access' ? reply(200, {}) : reply(401);
  });
  expect((await cloudClient.request('/v1/ai/tts/capabilities')).status).toBe(
    'success',
  );
  expect(calls('/v1/auth/refresh')).toHaveLength(1);
  // Nothing was sent without a token.
  expect(calls('/v1/ai/tts/capabilities')).toHaveLength(1);
});

it('says the sign-in ended only when the refresh token is gone or rejected', async () => {
  route(url =>
    url.endsWith('/v1/auth/refresh')
      ? reply(401, {detail: 'Invalid or expired refresh token.'})
      : reply(401),
  );
  expect((await cloudClient.request('/v1/ai/chat')).sessionEnded).toBe(true);

  route(url =>
    url.endsWith('/v1/auth/refresh') ? reply(503, {detail: 'busy'}) : reply(401),
  );
  const passing = await cloudClient.request('/v1/ai/chat');
  expect(passing.status).toBe('auth_required');
  expect(passing.sessionEnded).toBeUndefined();

  (cloudClient.getEncryptedRefreshToken as jest.Mock).mockResolvedValue(null);
  route(() => reply(401));
  expect((await cloudClient.request('/v1/ai/chat')).sessionEnded).toBe(true);
});

describe('profile check (authService.getMe)', () => {
  it('keeps the stored sign-in when renewal fails for a passing reason', async () => {
    const signOut = jest.spyOn(cloudClient, 'clearActiveSession');
    route(url =>
      url.endsWith('/v1/auth/refresh')
        ? Promise.reject(new Error('Network request failed'))
        : reply(401),
    );
    const result = await authService.getMe();
    expect(result.status).toBe('server_unavailable');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out locally only when the server rejected the refresh token', async () => {
    const signOut = jest
      .spyOn(cloudClient, 'clearActiveSession')
      .mockImplementation(() => undefined);
    route(url =>
      url.endsWith('/v1/auth/refresh')
        ? reply(401, {detail: 'Invalid or expired refresh token.'})
        : reply(401),
    );
    const result = await authService.getMe();
    expect(result).toMatchObject({status: 'auth_required', sessionEnded: true});
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(calls('/v1/auth/refresh')).toHaveLength(1);
  });

  it('a profile check and online chat expiring together renew once and both succeed', async () => {
    const signOut = jest.spyOn(cloudClient, 'clearActiveSession');
    route((url, init) => {
      if (url.endsWith('/v1/auth/refresh')) return refreshOk;
      if (authOf(init) !== 'Bearer fresh-access') return reply(401);
      return url.endsWith('/v1/auth/me')
        ? reply(200, {id: 'c1', email: 'a@example.invalid'})
        : reply(200, {reply: 'Hi!'});
    });
    const [profile, chat] = await Promise.all([
      authService.getMe(),
      cloudClient.request('/v1/ai/chat', {method: 'POST', body: '{}'}),
    ]);
    expect(profile.status).toBe('success');
    expect(chat.status).toBe('success');
    expect(calls('/v1/auth/refresh')).toHaveLength(1);
    expect(signOut).not.toHaveBeenCalled();
  });
});
