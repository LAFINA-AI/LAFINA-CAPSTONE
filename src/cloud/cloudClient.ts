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
      const detail =
        typeof errorData.detail === 'string' ? errorData.detail : 'FastAPI request failed.';

      if (response.status === 401) {
        return {
          status: 'auth_required',
          error: requiresAuth ? 'Cloud session expired. Sign in again while online.' : detail,
          httpStatus: response.status,
        };
      }
      if (response.status === 403) {
        const isDisabled = detail.toLowerCase().includes('disabled');
        return {
          status: isDisabled ? 'account_disabled' : 'subscription_required',
          error: detail,
          httpStatus: response.status,
        };
      }
      if (response.status === 409) {
        return { status: 'conflict', error: detail, httpStatus: response.status };
      }
      if (response.status === 429) {
        return { status: 'rate_limited', error: detail, httpStatus: response.status };
      }
      if (response.status >= 500) {
        console.error(
          `[cloud] ${options.method || 'GET'} ${endpoint} -> ${response.status}: ${detail}`,
        );
        return {
          status: 'server_error',
          error: `LAFINA's server had a problem (${response.status} on ${endpoint}${
            typeof errorData.detail === 'string' ? `: ${detail}` : ''
          }). Please try again.`,
          httpStatus: response.status,
        };
      }
      return { status: 'validation_error', error: detail, httpStatus: response.status };
    }

    const data = await response.json().catch(() => ({}));
    return { status: 'success', data: data as T, httpStatus: response.status };
  },
};
