import {
  authService,
  AuthResponseData,
  resolveEffectiveProfileRole,
  UserProfileData,
} from './authService';
import { cloudClient, CloudResultStatus } from './cloudClient';
import { normalizeEmail, validatePassword } from '../storage/authUtils';
import { userStore } from '../storage/userStore';
import { secureKeystore } from '../utils/keystore';

export type AccountFlowStatus =
  | 'success'
  | 'offline_only'
  | 'local_only'
  | 'validation_error'
  | 'local_email_exists'
  | 'incorrect_local_password'
  | 'incorrect_cloud_password'
  | 'account_disabled'
  | 'offline'
  | 'server_unavailable'
  | 'registration_failed'
  | 'profile_failed'
  | 'auth_required'
  | 'rate_limited'
  | 'student_pro_required';

export interface AccountFlowResult {
  status: AccountFlowStatus;
  message: string;
  localUserId?: string;
  role?: string;
  cloudStatus?: AccountFlowStatus;
  restoredFromCloud?: boolean;
  detail?: string;
}

interface RegistrationInput {
  username: string;
  email: string;
  password: string;
}

const mapCloudFailure = (
  status: CloudResultStatus,
  fallbackMessage: string,
): AccountFlowResult => {
  switch (status) {
    case 'offline':
      return {
        status: 'offline',
        message: 'The device is offline. FastAPI was not contacted.',
      };
    case 'server_unavailable':
    case 'server_error':
      return {
        status: 'server_unavailable',
        message: `${fallbackMessage} The cloud account was not linked.`,
        detail: fallbackMessage,
      };
    case 'account_disabled':
      return {
        status: 'account_disabled',
        message: 'The FastAPI cloud account is disabled. Contact an administrator.',
      };
    case 'auth_required':
      return {
        status: 'incorrect_cloud_password',
        message:
          'This email already has a FastAPI account, but the app password does not match it. Automatic cloud linking was skipped.',
      };
    case 'rate_limited':
      return { status: 'rate_limited', message: fallbackMessage };
    default:
      return { status: 'registration_failed', message: fallbackMessage };
  }
};

const attachAuthenticatedCloudSession = async (
  localUserId: string,
  authData: AuthResponseData,
): Promise<AccountFlowResult> => {
  const localUser = userStore.getUserById(localUserId);
  if (!localUser?.email) {
    return {
      status: 'profile_failed',
      message: 'The active local account has no email address to link.',
    };
  }

  if (normalizeEmail(authData.email) !== normalizeEmail(localUser.email)) {
    return {
      status: 'profile_failed',
      message: 'FastAPI authenticated a different email. No local account was changed.',
    };
  }

  try {
    await cloudClient.establishSession(
      localUserId,
      authData.access_token,
      authData.refresh_token,
    );
  } catch (error: unknown) {
    return {
      status: 'profile_failed',
      message:
        error instanceof Error
          ? error.message
          : 'Cloud credentials could not be stored securely.',
    };
  }

  const profileResult = await authService.getMe();
  if (profileResult.status !== 'success' || !profileResult.data) {
    cloudClient.clearActiveSession();
    return {
      status: profileResult.status === 'auth_required' ? 'auth_required' : 'profile_failed',
      message: profileResult.error || 'The live FastAPI profile could not be verified.',
    };
  }

  const profile = profileResult.data;
  if (normalizeEmail(profile.email) !== normalizeEmail(localUser.email)) {
    cloudClient.clearActiveSession();
    return {
      status: 'profile_failed',
      message: 'The FastAPI profile email does not match the active local account.',
    };
  }

  const effectiveRole = resolveEffectiveProfileRole(profile);

  try {
    userStore.linkCloudAccount(localUserId, profile.id, effectiveRole);
    userStore.clearPendingCloudCredential(localUserId);
  } catch {
    cloudClient.clearActiveSession();
    return {
      status: 'profile_failed',
      message: 'The FastAPI account authenticated, but the local link could not be saved.',
    };
  }

  return {
    status: 'success',
    localUserId,
    role: effectiveRole,
    message: 'FastAPI authentication succeeded and Online Mode is linked.',
  };
};

const authenticateExistingCloudAccount = async (
  email: string,
  password: string,
): Promise<AccountFlowResult | AuthResponseData> => {
  const loginResult = await authService.login(email, password);
  if (loginResult.status === 'success' && loginResult.data) {
    return loginResult.data;
  }
  return mapCloudFailure(
    loginResult.status,
    loginResult.error || 'FastAPI login failed. Online Mode remains unavailable.',
  );
};

const registerOrAuthenticateCloudAccount = async (
  email: string,
  password: string,
): Promise<AccountFlowResult | AuthResponseData> => {
  const registrationResult = await authService.register(email, password);
  if (registrationResult.status === 'success' && registrationResult.data) {
    return registrationResult.data;
  }
  if (registrationResult.status === 'conflict') {
    return await authenticateExistingCloudAccount(email, password);
  }
  return mapCloudFailure(
    registrationResult.status,
    registrationResult.error || 'FastAPI registration failed. No linked local account was created.',
  );
};

const isFlowResult = (
  result: AccountFlowResult | AuthResponseData,
): result is AccountFlowResult => 'status' in result;

const persistDeferredCloudCredential = async (
  localUserId: string,
  password: string,
): Promise<boolean> => {
  try {
    const encryptedCredential = await secureKeystore.encryptString(password);
    userStore.savePendingCloudCredential(localUserId, encryptedCredential);
    return true;
  } catch (error: unknown) {
    console.warn(
      '[AccountLink] Deferred FastAPI credential could not be stored securely:',
      error instanceof Error ? error.message : 'Unknown secure-storage error.',
    );
    return false;
  }
};

const clearDeferredCredentialSafely = (localUserId: string): void => {
  try {
    userStore.clearPendingCloudCredential(localUserId);
  } catch (error: unknown) {
    console.warn(
      '[AccountLink] Deferred FastAPI credential could not be erased:',
      error instanceof Error ? error.message : 'Unknown storage error.',
    );
  }
};

const shouldDiscardDeferredCredential = (status: AccountFlowStatus): boolean =>
  status === 'incorrect_cloud_password' ||
  status === 'account_disabled' ||
  status === 'validation_error';

const runDeferredCloudLink = async (
  localUserId: string,
): Promise<AccountFlowResult> => {
  const localUser = userStore.getUserById(localUserId);
  const activeSession = userStore.getActiveSessionToken();

  if (!localUser?.email || activeSession.userId !== localUserId) {
    return {
      status: 'auth_required',
      message: 'The active local account cannot be matched to a FastAPI login.',
    };
  }

  if (activeSession.accessToken) {
    return {
      status: 'success',
      localUserId,
      role: localUser.role,
      message: 'A FastAPI-authenticated session is already stored.',
    };
  }

  if (!activeSession.pendingCloudCredential) {
    return {
      status: 'auth_required',
      localUserId,
      role: localUser.role,
      message:
        'Automatic FastAPI linking is unavailable for this older local session. Sign out and sign in once while online; no separate FastAPI password is required.',
    };
  }

  if (!(await cloudClient.isOnline())) {
    return {
      status: 'offline',
      localUserId,
      role: localUser.role,
      message: 'FastAPI linking is queued and will retry when the connection returns.',
    };
  }

  let password = '';
  try {
    password = await secureKeystore.decryptString(
      activeSession.pendingCloudCredential,
    );
  } catch (error: unknown) {
    clearDeferredCredentialSafely(localUserId);
    return {
      status: 'auth_required',
      localUserId,
      role: localUser.role,
      message:
        error instanceof Error
          ? `${error.message} Sign in once to retry automatic FastAPI linking.`
          : 'The secure FastAPI link could not be resumed. Sign in once to retry.',
    };
  }

  try {
    const cloudAuth = await registerOrAuthenticateCloudAccount(
      normalizeEmail(localUser.email),
      password,
    );
    if (isFlowResult(cloudAuth)) {
      if (shouldDiscardDeferredCredential(cloudAuth.status)) {
        clearDeferredCredentialSafely(localUserId);
      }
      return cloudAuth;
    }
    return await attachAuthenticatedCloudSession(localUserId, cloudAuth);
  } finally {
    password = '';
  }
};

const deferredLinkAttempts = new Map<string, Promise<AccountFlowResult>>();

const INCORRECT_CREDENTIALS = 'Incorrect email or password.';
const INCORRECT_CREDENTIALS_OFFLINE =
  'Incorrect email or password. If this account was created on another device, connect to the internet and sign in again to set it up on this phone.';
const RESTORE_UNREACHABLE =
  "LAFINA couldn't reach the server to check this sign-in. Try again in a moment.";

const restoreUnreachable = (detail?: string): string =>
  detail ? `LAFINA couldn't reach the server to check this sign-in. ${detail}` : RESTORE_UNREACHABLE;

const restoreAttempts = new Map<string, Promise<AccountFlowResult>>();

const runCloudRestore = async (email: string, password: string): Promise<AccountFlowResult> => {
  if (!(await cloudClient.isOnline())) {
    return { status: 'incorrect_local_password', message: INCORRECT_CREDENTIALS_OFFLINE };
  }

  const cloudAuth = await authenticateExistingCloudAccount(email, password);
  if (isFlowResult(cloudAuth)) {
    if (cloudAuth.status === 'incorrect_cloud_password') {
      return { status: 'incorrect_local_password', message: INCORRECT_CREDENTIALS };
    }
    if (cloudAuth.status === 'offline') {
      return { status: cloudAuth.status, message: RESTORE_UNREACHABLE };
    }
    if (cloudAuth.status === 'server_unavailable') {
      return {
        status: cloudAuth.status,
        message: restoreUnreachable(cloudAuth.detail),
        detail: cloudAuth.detail,
      };
    }
    return cloudAuth;
  }

  if (normalizeEmail(cloudAuth.email) !== email || !cloudAuth.user_id) {
    return {
      status: 'profile_failed',
      message: 'The server signed in a different account, so nothing was set up on this phone.',
    };
  }

  let localUserId: string;
  try {
    localUserId = await userStore.createFromCloud({
      email,
      password,
      cloudAccountId: cloudAuth.user_id,
      role: cloudAuth.role,
    });
  } catch (error: unknown) {
    return {
      status: 'registration_failed',
      message: `Your account signed in, but it couldn't be set up on this phone: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    };
  }

  userStore.setCurrentUser(localUserId);
  cloudClient.resetSessionCache();
  await persistDeferredCloudCredential(localUserId, password);

  const linkResult = await attachAuthenticatedCloudSession(localUserId, cloudAuth);
  if (linkResult.status !== 'success') {
    return {
      ...linkResult,
      status: 'local_only',
      cloudStatus: linkResult.status,
      localUserId,
      role: cloudAuth.role,
      restoredFromCloud: true,
      message: `Your account is set up on this phone. ${linkResult.message} It will finish connecting automatically.`,
    };
  }
  return {
    ...linkResult,
    restoredFromCloud: true,
    message: 'Welcome back. Your account was restored from the cloud.',
  };
};

const restoreAccountFromCloud = async (
  email: string,
  password: string,
): Promise<AccountFlowResult> => {
  const running = restoreAttempts.get(email);
  if (running) return await running;
  const attempt = runCloudRestore(email, password);
  restoreAttempts.set(email, attempt);
  try {
    return await attempt;
  } finally {
    if (restoreAttempts.get(email) === attempt) restoreAttempts.delete(email);
  }
};

const completeDeferredCloudLink = async (
  localUserId: string,
): Promise<AccountFlowResult> => {
  const existingAttempt = deferredLinkAttempts.get(localUserId);
  if (existingAttempt) {
    return await existingAttempt;
  }

  const attempt = runDeferredCloudLink(localUserId);
  deferredLinkAttempts.set(localUserId, attempt);
  try {
    return await attempt;
  } finally {
    if (deferredLinkAttempts.get(localUserId) === attempt) {
      deferredLinkAttempts.delete(localUserId);
    }
  }
};

export const accountLinkService = {
  registerCloudFirst: async (
    input: RegistrationInput,
  ): Promise<AccountFlowResult> => {
    const passwordValidation = validatePassword(input.password);
    if (!passwordValidation.isValid) {
      return {
        status: 'validation_error',
        message: passwordValidation.error || 'Password validation failed.',
      };
    }

    const normalizedEmail = normalizeEmail(input.email);
    if (userStore.getUserByEmail(normalizedEmail)) {
      return {
        status: 'local_email_exists',
        message: 'This email already exists locally. Sign in to preserve its local data.',
      };
    }

    if (!(await cloudClient.isOnline())) {
      return {
        status: 'offline',
        message: 'The device is offline. Choose offline-only registration to continue.',
      };
    }

    const cloudResult = await registerOrAuthenticateCloudAccount(
      normalizedEmail,
      input.password,
    );
    if (isFlowResult(cloudResult)) {
      return cloudResult;
    }

    let localUserId: string;
    try {
      localUserId = await userStore.register(
        input.username.trim(),
        normalizedEmail,
        input.password,
      );
      userStore.setCurrentUser(localUserId);
      cloudClient.resetSessionCache();
      await persistDeferredCloudCredential(localUserId, input.password);
    } catch (error: unknown) {
      return {
        status: 'registration_failed',
        message:
          error instanceof Error
            ? `FastAPI registration succeeded, but local account creation failed: ${error.message}`
            : 'FastAPI registration succeeded, but local account creation failed.',
      };
    }

    const linkResult = await attachAuthenticatedCloudSession(localUserId, cloudResult);
    if (linkResult.status !== 'success') {
      return {
        ...linkResult,
        status: 'local_only',
        cloudStatus: linkResult.status,
        localUserId,
        message: `${linkResult.message} The new local account remains available offline.`,
      };
    }
    return linkResult;
  },

  registerOfflineOnly: async (
    input: RegistrationInput,
  ): Promise<AccountFlowResult> => {
    const passwordValidation = validatePassword(input.password);
    if (!passwordValidation.isValid) {
      return {
        status: 'validation_error',
        message: passwordValidation.error || 'Password validation failed.',
      };
    }
    const normalizedEmail = normalizeEmail(input.email);
    if (userStore.getUserByEmail(normalizedEmail)) {
      return {
        status: 'local_email_exists',
        message: 'This email already exists locally. Sign in instead.',
      };
    }
    try {
      const localUserId = await userStore.register(
        input.username.trim(),
        normalizedEmail,
        input.password,
      );
      userStore.setCurrentUser(localUserId);
      cloudClient.resetSessionCache();
      const credentialStored = await persistDeferredCloudCredential(
        localUserId,
        input.password,
      );
      return {
        status: 'offline_only',
        localUserId,
        role: 'student',
        message: credentialStored
          ? 'Offline-only account created. FastAPI will link automatically when the connection returns.'
          : 'Offline-only account created. Sign in once while online to link FastAPI.',
      };
    } catch (error: unknown) {
      return {
        status: 'registration_failed',
        message: error instanceof Error ? error.message : 'Local registration failed.',
      };
    }
  },

  login: async (email: string, password: string): Promise<AccountFlowResult> => {
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return {
        status: 'validation_error',
        message: passwordValidation.error || 'Password validation failed.',
      };
    }
    const normalizedEmail = normalizeEmail(email);
    const localUser = userStore.getUserByEmail(normalizedEmail);
    if (!localUser) {
      return await restoreAccountFromCloud(normalizedEmail, password);
    }
    const authenticatedLocalUser = await userStore.login(normalizedEmail, password);
    if (!authenticatedLocalUser) {
      return {
        status: 'incorrect_local_password',
        message: (await cloudClient.isOnline())
          ? INCORRECT_CREDENTIALS
          : INCORRECT_CREDENTIALS_OFFLINE,
      };
    }

    userStore.setCurrentUser(authenticatedLocalUser.id);
    cloudClient.resetSessionCache();
    const credentialStored = await persistDeferredCloudCredential(
      authenticatedLocalUser.id,
      password,
    );

    if (!(await cloudClient.isOnline())) {
      return {
        status: 'local_only',
        cloudStatus: 'offline',
        localUserId: authenticatedLocalUser.id,
        role: authenticatedLocalUser.role,
        message: credentialStored
          ? 'Signed in locally. FastAPI will link automatically when the connection returns.'
          : 'Signed in locally while offline. Sign in once while online to link FastAPI.',
      };
    }

    const linkResult = credentialStored
      ? await completeDeferredCloudLink(authenticatedLocalUser.id)
      : await (async (): Promise<AccountFlowResult> => {
          const cloudAuth = await registerOrAuthenticateCloudAccount(
            normalizedEmail,
            password,
          );
          return isFlowResult(cloudAuth)
            ? cloudAuth
            : await attachAuthenticatedCloudSession(
                authenticatedLocalUser.id,
                cloudAuth,
              );
        })();
    if (linkResult.status !== 'success') {
      return {
        status: 'local_only',
        cloudStatus: linkResult.status,
        localUserId: authenticatedLocalUser.id,
        role: authenticatedLocalUser.role,
        message: `${linkResult.message} Offline access remains available.`,
      };
    }
    return linkResult;
  },

  completeDeferredCloudLink,

  refreshCloudProfile: async (localUserId: string): Promise<AccountFlowResult> => {
    const localUser = userStore.getUserById(localUserId);
    let activeSession = userStore.getActiveSessionToken();
    if (!localUser?.email || activeSession.userId !== localUserId) {
      return {
        status: 'auth_required',
        message: 'The active local account cannot be matched to a FastAPI login.',
      };
    }
    if (!activeSession.accessToken) {
      const linkResult = await completeDeferredCloudLink(localUserId);
      if (linkResult.status !== 'success') {
        return linkResult;
      }
      activeSession = userStore.getActiveSessionToken();
      if (!activeSession.accessToken) {
        return {
          status: 'auth_required',
          message: 'FastAPI linking completed without a usable authenticated session.',
        };
      }
    }
    const profileResult = await authService.getMe();
    if (profileResult.status !== 'success' || !profileResult.data) {
      const mapped = mapCloudFailure(
        profileResult.status,
        profileResult.error || 'The live FastAPI profile could not be loaded.',
      );
      return profileResult.status === 'auth_required'
        ? { ...mapped, status: 'auth_required', message: profileResult.error || mapped.message }
        : mapped;
    }
    const profile: UserProfileData = profileResult.data;
    if (normalizeEmail(profile.email) !== normalizeEmail(localUser.email)) {
      cloudClient.clearActiveSession();
      return {
        status: 'auth_required',
        message:
          'The stored cloud session belongs to a different email. Sign in again while online.',
      };
    }
    const effectiveRole = resolveEffectiveProfileRole(profile);
    userStore.linkCloudAccount(localUserId, profile.id, effectiveRole);
    return {
      status: 'success',
      localUserId,
      role: effectiveRole,
      message: 'Cloud profile and role synchronized.',
    };
  },

  authorizeOnlineMode: async (localUserId: string): Promise<AccountFlowResult> => {
    const profileResult = await accountLinkService.refreshCloudProfile(localUserId);
    if (profileResult.status !== 'success') {
      return profileResult;
    }
    const isPro =
      profileResult.role === 'student_pro' || profileResult.role === 'admin';

    if (!isPro) {
      return {
        status: 'student_pro_required',
        localUserId,
        role: profileResult.role,
        message: 'The live FastAPI account does not have Student Pro access.',
      };
    }
    return profileResult;
  },
};
