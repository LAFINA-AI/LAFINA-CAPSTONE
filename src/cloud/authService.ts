import { cloudClient, CloudResult } from './cloudClient';
import { normalizeEmail, validatePassword } from '../storage/authUtils';
import { userStore } from '../storage/userStore';
import type { SubscriptionPlan, SystemRole } from '../storage/syncTypes';

export interface AuthResponseData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
  email: string;
  role: string;
  system_role?: SystemRole;
  subscription_plan?: SubscriptionPlan;
  recovery_codes?: string[];
}

export interface UserProfileData {
  id: string;
  email: string;
  role: string;
  system_role?: SystemRole;
  subscription_plan?: SubscriptionPlan;
  effective_subscription_plan?: SubscriptionPlan;
  is_active: boolean;
  created_at: string;
}

export const resolveEffectiveProfileRole = (profile: UserProfileData): string => {
  if (
    profile.role === 'student_pro' ||
    profile.effective_subscription_plan === 'student_pro' ||
    profile.subscription_plan === 'student_pro'
  ) {
    return 'student_pro';
  }
  if (profile.role === 'admin' || profile.system_role === 'admin') {
    return 'admin';
  }
  return 'student';
};

export const authService = {
  register: async (email: string, password: string): Promise<CloudResult<AuthResponseData>> => {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return {
        status: 'validation_error',
        error: passwordValidation.error || 'Password validation failed.',
      };
    }
    return await cloudClient.request<AuthResponseData>(
      '/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email: normalizeEmail(email), password }),
      },
      false,
    );
  },

  login: async (
    email: string,
    password: string,
    deviceInfo?: string,
  ): Promise<CloudResult<AuthResponseData>> => {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return {
        status: 'validation_error',
        error: passwordValidation.error || 'Password validation failed.',
      };
    }
    return await cloudClient.request<AuthResponseData>(
      '/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          email: normalizeEmail(email),
          password,
          device_info: deviceInfo || 'Android Client',
        }),
      },
      false,
    );
  },

  refresh: async (refreshToken: string): Promise<CloudResult<AuthResponseData>> => {
    const res = await cloudClient.request<AuthResponseData>(
      '/v1/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
      false,
    );
    if (res.status === 'success' && res.data) {
      const activeSession = userStore.getActiveSessionToken();
      if (!activeSession.userId) {
        return { status: 'auth_required', error: 'No active local account is available.' };
      }
      await cloudClient.establishSession(
        activeSession.userId,
        res.data.access_token,
        res.data.refresh_token,
      );
    }
    return res;
  },

  logout: async (): Promise<CloudResult<null>> => {
    try {
      return await cloudClient.request<null>('/v1/auth/logout', { method: 'POST' }, true);
    } finally {
      cloudClient.clearActiveSession();
    }
  },

  getMe: async (): Promise<CloudResult<UserProfileData>> => {
    const requestProfile = (): Promise<CloudResult<UserProfileData>> =>
      cloudClient.request<UserProfileData>('/v1/auth/me', { method: 'GET' }, true);

    const initialResult = await requestProfile();
    if (initialResult.status !== 'auth_required') {
      return initialResult;
    }

    let refreshToken: string | null = null;
    try {
      refreshToken = await cloudClient.getEncryptedRefreshToken();
    } catch {
      cloudClient.clearActiveSession();
      return {
        status: 'auth_required',
        error: 'Refresh-token renewal failed. Sign in again while online.',
      };
    }
    if (!refreshToken) {
      cloudClient.clearActiveSession();
      return initialResult;
    }

    let refreshResult: CloudResult<AuthResponseData>;
    try {
      refreshResult = await authService.refresh(refreshToken);
    } catch {
      cloudClient.clearActiveSession();
      return {
        status: 'auth_required',
        error: 'Refresh-token renewal failed. Sign in again while online.',
      };
    }
    if (refreshResult.status !== 'success') {
      cloudClient.clearActiveSession();
      return {
        status: 'auth_required',
        error: 'Refresh-token renewal failed. Sign in again while online.',
      };
    }

    const renewedProfile = await requestProfile();
    if (renewedProfile.status === 'auth_required') {
      cloudClient.clearActiveSession();
      return {
        status: 'auth_required',
        error: 'Cloud authentication expired. Sign in again while online.',
      };
    }
    return renewedProfile;
  },
};
