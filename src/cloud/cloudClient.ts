import { secureKeystore } from '../utils/keystore';
import { userStore } from '../storage/userStore';
import { NativeModules, Platform } from 'react-native';

export type CloudResultStatus =
  | 'success'
  | 'offline'
  | 'auth_required'
  | 'account_disabled'
  | 'conflict'
  | 'subscription_required'
  | 'server_unavailable'
  | 'rate_limited'
  | 'validation_error'
  | 'server_error';

export interface CloudResult<T> {
  status: CloudResultStatus;
  data?: T;
  error?: string;
  httpStatus?: number;
}

let inMemoryAccessToken: string | null = null;
let inMemoryUserId: string | null = null;
export const CLOUD_API_BASE_URL = 'https://lafina-backend.vercel.app';
export const LOCAL_API_BASE_URL = 'http://127.0.0.1:8000';

export const apiBaseUrlsFor = (isDevelopment: boolean): readonly string[] =>
  isDevelopment ? [CLOUD_API_BASE_URL, LOCAL_API_BASE_URL] : [CLOUD_API_BASE_URL];

const defaultApiBaseUrls: readonly string[] = apiBaseUrlsFor(
  typeof __DEV__ !== 'undefined' && __DEV__,
);
let apiBaseUrls: readonly string[] = defaultApiBaseUrls;

interface AndroidConnectivityModule {
  isOnline: () => Promise<boolean>;
  canResolve?: (host: string) => Promise<boolean>;
}

const androidConnectivity = (): AndroidConnectivityModule | undefined =>
  NativeModules.AndroidConnectivityModule as AndroidConnectivityModule | undefined;

const DNS_CHECK_TIMEOUT_MS = 5_000;

const hostOf = (baseUrl: string): string =>
  baseUrl.replace(/^[a-z]+:\/\//i, '').replace(/[/:].*$/, '');

const canResolveHost = async (host: string): Promise<boolean | null> => {
  const connectivity = Platform.OS === 'android' ? androidConnectivity() : undefined;
  if (!connectivity?.canResolve) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      connectivity.canResolve(host),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), DNS_CHECK_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const describeConnectionFailure = async (baseUrl: string, error: unknown): Promise<string> => {
  const host = hostOf(baseUrl);
  if ((await canResolveHost(host)) === false) {
    return `This device can't look up ${host}: the connection is up, but its DNS isn't answering. Check the Wi-Fi or mobile data (on an emulator, restart it).`;
  }
  const reason = error instanceof Error && error.message ? error.message : 'no response';
  return `LAFINA's server at ${host} didn't answer (${reason}).`;
};

/** Maps a non-2xx backend response to the CloudResult every caller expects. */
const errorResult = (
  httpStatus: number,
  errorData: { detail?: unknown } | null,
  endpoint: string,
  method: string,
  requiresAuth: boolean,
): CloudResult<never> => {
  const rawDetail = errorData?.detail;
  const detail = (() => {
    if (typeof rawDetail === 'string' && rawDetail.trim()) {
      return rawDetail.trim();
    }
    if (Array.isArray(rawDetail)) {
      const messages = rawDetail
        .map((item: unknown) => {
          if (typeof item === 'string') return item.trim();
          if (
            item &&
            typeof item === 'object' &&
            'msg' in item &&
            typeof (item as { msg?: unknown }).msg === 'string'
          ) {
            return ((item as { msg: string }).msg || '').trim();
          }
          return '';
        })
        .filter(Boolean);
      if (messages.length > 0) {
        return messages.join('; ');
      }
    }
    if (
      rawDetail &&
      typeof rawDetail === 'object' &&
      'message' in rawDetail &&
      typeof (rawDetail as { message?: unknown }).message === 'string'
    ) {
      const msg = ((rawDetail as { message: string }).message || '').trim();
      if (msg) return msg;
    }
    return 'FastAPI request failed.';
  })();

  if (httpStatus === 401) {
    return {
      status: 'auth_required',
      error: requiresAuth ? 'Cloud session expired. Sign in again while online.' : detail,
      httpStatus: httpStatus,
    };
  }
  if (httpStatus === 403) {
    const isDisabled = detail.toLowerCase().includes('disabled');
    return {
      status: isDisabled ? 'account_disabled' : 'subscription_required',
      error: detail,
      httpStatus: httpStatus,
    };
  }
  if (httpStatus === 409) {
    return { status: 'conflict', error: detail, httpStatus: httpStatus };
  }
  if (httpStatus === 429) {
    return { status: 'rate_limited', error: detail, httpStatus: httpStatus };
  }
  if (httpStatus >= 500) {
    console.error(
      `[cloud] ${method} ${endpoint} -> ${httpStatus}: ${detail}`,
    );
    return {
      status: 'server_error',
      error: `LAFINA's server had a problem (${httpStatus} on ${endpoint}${
        typeof errorData?.detail === 'string' ? `: ${detail}` : ''
      }). Please try again.`,
      httpStatus: httpStatus,
    };
  }
  return { status: 'validation_error', error: detail, httpStatus: httpStatus };
};

export interface CloudStreamOptions {
  /** Called with each newly received piece of the response body. */
  onText: (chunk: string) => void;
  signal?: AbortSignal;
  /** Whole-request limit; the backend's own function limit is 60 s. */
  timeoutMs?: number;
}

type StreamOutcome =
  | { kind: 'response'; status: number; text: string }
  | { kind: 'failed'; error: Error }
  | { kind: 'aborted' };

/** Minimal surface of XMLHttpRequest used here, so tests can provide one. */
interface StreamXhr {
  readyState: number;
  status: number;
  responseText: string;
  timeout: number;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: string): void;
  abort(): void;
  onprogress: (() => void) | null;
  onreadystatechange: (() => void) | null;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
}

const STREAM_TIMEOUT_MS = 65_000;

/**
 * POSTs and hands the body over as it arrives. React Native's fetch cannot
 * read a response incrementally, but its XMLHttpRequest updates responseText
 * while the download is still running.
 */
const postStreaming = (
  url: string,
  headers: Record<string, string>,
  body: string,
  options: CloudStreamOptions,
): Promise<StreamOutcome> =>
  new Promise((resolve) => {
    const Xhr = (globalThis as { XMLHttpRequest?: new () => StreamXhr }).XMLHttpRequest;
    if (!Xhr) {
      resolve({ kind: 'failed', error: new Error('streaming is not available') });
      return;
    }
    if (options.signal?.aborted) {
      resolve({ kind: 'aborted' });
      return;
    }
    const xhr = new Xhr();
    let delivered = 0;
    let settled = false;
    const finish = (outcome: StreamOutcome) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', onAbort);
      resolve(outcome);
    };
    const onAbort = () => xhr.abort();
    const deliver = () => {
      if (xhr.status < 200 || xhr.status >= 300) return;
      const text = xhr.responseText || '';
      if (text.length > delivered) {
        const chunk = text.slice(delivered);
        delivered = text.length;
        options.onText(chunk);
      }
    };
    xhr.open('POST', url);
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.timeout = options.timeoutMs ?? STREAM_TIMEOUT_MS;
    xhr.onprogress = deliver;
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3) deliver();
    };
    xhr.onload = () => {
      deliver();
      finish({ kind: 'response', status: xhr.status, text: xhr.responseText || '' });
    };
    xhr.onerror = () => finish({ kind: 'failed', error: new Error('Network request failed') });
    xhr.ontimeout = () => finish({ kind: 'failed', error: new Error('timed out') });
    xhr.onabort = () => finish({ kind: 'aborted' });
    options.signal?.addEventListener('abort', onAbort);
    xhr.send(body);
  });

let isOnlineMockState: boolean | null = null;

export const setMockOnlineState = (online: boolean | null) => {
  isOnlineMockState = online;
};

export const cloudClient = {
  setBaseUrl: (url: string) => {
    apiBaseUrls = [url.replace(/\/+$/, '')];
  },

  getBaseUrl: (): string => {
    return apiBaseUrls[0];
  },

  resetBaseUrls: (): void => {
    apiBaseUrls = defaultApiBaseUrls;
  },

  setAccessToken: (token: string | null) => {
    try {
      const session = userStore.getActiveSessionToken();
      if (session.userId) {
        userStore.saveSessionTokens(session.userId, token);
      }
      inMemoryUserId = session.userId;
      inMemoryAccessToken = token;
    } catch (e) {
      console.warn('Error saving access token to userStore:', e);
    }
  },

  getAccessToken: (): string | null => {
    try {
      const session = userStore.getActiveSessionToken();
      if (session.userId !== inMemoryUserId) {
        inMemoryUserId = session.userId;
        inMemoryAccessToken = session.accessToken;
      } else if (!inMemoryAccessToken && session.accessToken) {
        inMemoryAccessToken = session.accessToken;
      }
    } catch (e) {
      console.warn('Error restoring active session token:', e);
    }
    return inMemoryAccessToken;
  },

  establishSession: async (
    localUserId: string,
    accessToken: string,
    refreshToken: string,
  ): Promise<void> => {
    const session = userStore.getActiveSessionToken();
    if (session.userId !== localUserId) {
      throw new Error('Cloud credentials could not be associated with the active local account.');
    }
    const encryptedRefreshToken = await secureKeystore.encryptString(refreshToken);
    userStore.saveSessionTokens(localUserId, accessToken, encryptedRefreshToken);
    inMemoryUserId = localUserId;
    inMemoryAccessToken = accessToken;
  },

  storeEncryptedRefreshToken: async (refreshToken: string): Promise<void> => {
    const session = userStore.getActiveSessionToken();
    if (!session.userId || !inMemoryAccessToken) {
      throw new Error('No active local cloud session is available.');
    }
    await cloudClient.establishSession(session.userId, inMemoryAccessToken, refreshToken);
  },

  getEncryptedRefreshToken: async (): Promise<string | null> => {
    const session = userStore.getActiveSessionToken();
    if (!session.refreshToken) {
      return null;
    }
    return await secureKeystore.decryptString(session.refreshToken);
  },

  clearActiveSession: (): void => {
    const session = userStore.getActiveSessionToken();
    try {
      if (session.userId) {
        userStore.clearSessionTokens(session.userId);
      }
    } finally {
      inMemoryAccessToken = null;
      inMemoryUserId = session.userId;
    }
  },

  resetSessionCache: (): void => {
    inMemoryAccessToken = null;
    inMemoryUserId = null;
  },

  isOnline: async (): Promise<boolean> => {
    if (isOnlineMockState !== null) {
      return isOnlineMockState;
    }
    const connectivity = Platform.OS === 'android' ? androidConnectivity() : undefined;
    if (connectivity) {
      try {
        return await connectivity.isOnline();
      } catch {
        return false;
      }
    }
    const navigatorState = (
      globalThis as { navigator?: { onLine?: boolean } }
    ).navigator;
    return navigatorState?.onLine !== false;
  },

  request: async <T>(
    endpoint: string,
    options: RequestInit = {},
    requiresAuth: boolean = true,
  ): Promise<CloudResult<T>> => {
    const online = await cloudClient.isOnline();
    if (!online) {
      return { status: 'offline', error: 'Device is offline. Cloud feature unavailable.' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (requiresAuth) {
      const token = cloudClient.getAccessToken();
      if (!token) {
        return { status: 'auth_required', error: 'Authentication required. Please sign in.' };
      }
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response | null = null;
    let lastConnectionError: unknown = null;

    for (let index = 0; index < apiBaseUrls.length; index += 1) {
      const baseUrl = apiBaseUrls[index];
      const hasFallback = index < apiBaseUrls.length - 1;

      try {
        const candidateResponse = await fetch(`${baseUrl}${endpoint}`, {
          ...options,
          headers,
        });

        const isTemporarilyUnavailable = [502, 503, 504].includes(candidateResponse.status);
        if (isTemporarilyUnavailable && hasFallback) {
          continue;
        }

        response = candidateResponse;
        break;
      } catch (error: unknown) {
        lastConnectionError = error;
        if (!hasFallback) {
          break;
        }
      }
    }

    if (!response) {
      const reason = await describeConnectionFailure(apiBaseUrls[0], lastConnectionError);
      console.warn(`[cloud] ${options.method || 'GET'} ${endpoint} got no response: ${reason}`);
      return { status: 'server_unavailable', error: reason };
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: null }));
      return errorResult(response.status, errorData, endpoint, options.method || 'GET', requiresAuth);
    }

    const data = await response.json().catch(() => ({}));
    return { status: 'success', data: data as T, httpStatus: response.status };
  },

  /**
   * POST that delivers the response body piece by piece through
   * `options.onText` (for Server-Sent Events). Resolves once the body is
   * complete with the whole text as `data`; HTTP errors map exactly as in
   * `request`. A connection lost part-way resolves `server_unavailable`
   * after whatever already reached `onText`.
   */
  stream: async (
    endpoint: string,
    body: unknown,
    options: CloudStreamOptions,
    requiresAuth: boolean = true,
  ): Promise<CloudResult<string>> => {
    if (!(await cloudClient.isOnline())) {
      return { status: 'offline', error: 'Device is offline. Cloud feature unavailable.' };
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (requiresAuth) {
      const token = cloudClient.getAccessToken();
      if (!token) {
        return { status: 'auth_required', error: 'Authentication required. Please sign in.' };
      }
      headers.Authorization = `Bearer ${token}`;
    }
    const payload = JSON.stringify(body);
    let received = false;
    const forward: CloudStreamOptions = {
      ...options,
      onText: (chunk) => {
        received = true;
        options.onText(chunk);
      },
    };

    let lastError: unknown = null;
    for (let index = 0; index < apiBaseUrls.length; index += 1) {
      const baseUrl = apiBaseUrls[index];
      const hasFallback = index < apiBaseUrls.length - 1;
      const outcome = await postStreaming(`${baseUrl}${endpoint}`, headers, payload, forward);
      if (outcome.kind === 'aborted') {
        return { status: 'server_unavailable', error: 'cancelled' };
      }
      if (outcome.kind === 'failed') {
        lastError = outcome.error;
        // Never retry elsewhere once part of a reply was shown.
        if (received || !hasFallback) break;
        continue;
      }
      if ([502, 503, 504].includes(outcome.status) && hasFallback) {
        continue;
      }
      if (outcome.status < 200 || outcome.status >= 300) {
        let errorData: { detail?: unknown } | null = null;
        try {
          errorData = JSON.parse(outcome.text);
        } catch {
          errorData = { detail: null };
        }
        return errorResult(outcome.status, errorData, endpoint, 'POST', requiresAuth);
      }
      return { status: 'success', data: outcome.text, httpStatus: outcome.status };
    }
    const reason = received
      ? 'The connection dropped while the reply was arriving.'
      : await describeConnectionFailure(apiBaseUrls[0], lastError);
    console.warn(`[cloud] POST ${endpoint} stream ended without a response: ${reason}`);
    return { status: 'server_unavailable', error: reason };
  },
};
