import {cloudClient} from '../cloudClient';
import type {CloudResult} from '../cloudClient';
import type {
  ApiOutcome,
  VoiceCapabilities,
  VoiceConversationApi,
  VoiceSessionGrant,
  VoiceSessionStatus,
} from './types';

const SESSION_ID = /^[0-9a-f-]{36}$/i;

const outcome = <T>(
  result: CloudResult<T>,
  valid: (data: T | undefined) => data is T,
): ApiOutcome<T> => {
  if (result.status === 'success' && valid(result.data)) {
    return {ok: true, data: result.data};
  }
  if (result.status === 'success') {
    return {
      ok: false,
      status: 'server_error',
      message: 'The server sent an unexpected answer.',
    };
  }
  const status =
    result.status === 'subscription_required' || result.status === 'conflict'
      ? 'validation_error'
      : result.httpStatus === 404
      ? 'not_found'
      : result.status;
  return {
    ok: false,
    status,
    httpStatus: result.httpStatus,
    message: result.error || 'Voice conversation is unavailable right now.',
  };
};

const isCapabilities = (data: unknown): data is VoiceCapabilities =>
  !!data &&
  typeof (data as VoiceCapabilities).enabled === 'boolean' &&
  typeof (data as VoiceCapabilities).maxDurationSeconds === 'number';

const isGrant = (data: unknown): data is VoiceSessionGrant => {
  const value = data as VoiceSessionGrant | undefined;
  return (
    !!value &&
    typeof value.sessionId === 'string' &&
    SESSION_ID.test(value.sessionId) &&
    typeof value.signedUrl === 'string' &&
    value.signedUrl.length < 4096 &&
    typeof value.grant === 'string' &&
    value.grant.length < 4096 &&
    typeof value.voiceId === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(value.voiceId) &&
    typeof value.maxDurationSeconds === 'number'
  );
};

const isStatus = (data: unknown): data is VoiceSessionStatus =>
  !!data && typeof (data as VoiceSessionStatus).status === 'string';

/**
 * Authenticated calls to LAFINA's server. The signed URL and grant returned
 * by `createSession` are bearer credentials: callers keep them in memory for
 * the start only, and nothing here logs or stores them.
 */
export const voiceConversationApi: VoiceConversationApi = {
  async capabilities(signal) {
    const result = await cloudClient.request<VoiceCapabilities>(
      '/v1/ai/voice/capabilities',
      {method: 'GET', signal},
      true,
    );
    return outcome(result, isCapabilities);
  },
  async createSession(body, signal) {
    const result = await cloudClient.request<VoiceSessionGrant>(
      '/v1/ai/voice/sessions',
      {method: 'POST', body: JSON.stringify(body), signal},
      true,
    );
    return outcome(result, isGrant);
  },
  async connected(sessionId, conversationId) {
    if (!SESSION_ID.test(sessionId)) return null;
    return cloudClient.request(
      `/v1/ai/voice/sessions/${sessionId}/connected`,
      {method: 'POST', body: JSON.stringify({conversationId})},
      true,
    );
  },
  async end(sessionId, conversationId) {
    if (!SESSION_ID.test(sessionId)) return null;
    return cloudClient.request(
      `/v1/ai/voice/sessions/${sessionId}/end`,
      {
        method: 'POST',
        body: JSON.stringify(conversationId ? {conversationId} : {}),
      },
      true,
    );
  },
  async status(sessionId) {
    if (!SESSION_ID.test(sessionId)) {
      return {ok: false, status: 'not_found', message: 'Unknown session.'};
    }
    const result = await cloudClient.request<VoiceSessionStatus>(
      `/v1/ai/voice/sessions/${sessionId}`,
      {method: 'GET'},
      true,
    );
    return outcome(result, isStatus);
  },
};
