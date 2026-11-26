import {cloudClient} from '../cloud/cloudClient';
import {chatSyncStore} from '../storage/chatSyncStore';
import {getSessionGeneration} from '../storage/sessionEpoch';
import {userStore} from '../storage/userStore';
import {syncWorker} from './syncWorker';

/**
 * Student-facing controls for chat history sync (ADR-040): the on/off switch
 * and "Delete chat history from cloud". Turning sync off keeps the cloud copy;
 * deleting the cloud copy also turns sync off on this phone, so its chats stay
 * here and are not uploaded again.
 */

export type ChatCloudDeleteResult =
  | {status: 'deleted'; deletedSessions: number; deletedMessages: number}
  | {
      status: 'offline' | 'sign_in_required' | 'unsupported' | 'failed';
      message: string;
    };

interface PurgeResponse {
  deletedSessions?: number;
  deletedMessages?: number;
}

export const chatHistorySync = {
  isEnabled: (userId: string): boolean => chatSyncStore.isEnabled(userId),

  /** False until this account's server stores chat history (backend deployed). */
  serverSupportsChat: (userId: string): boolean =>
    chatSyncStore.serverSupportsChat(userId),

  /** Chats kept on this phone only because the account had its most chats. */
  heldChatCount: (userId: string): number =>
    chatSyncStore.heldChatCount(userId),

  setEnabled: (userId: string, enabled: boolean): void => {
    chatSyncStore.setEnabled(userId, enabled);
    // Turning it on uploads and downloads right away when online.
    void syncWorker.performSync().catch(() => undefined);
  },

  deleteCloudCopy: async (userId: string): Promise<ChatCloudDeleteResult> => {
    const ownerAtStart = userStore.getActiveSessionToken().userId;
    const generation = getSessionGeneration();
    const accountChanged = (): boolean =>
      userStore.getActiveSessionToken().userId !== ownerAtStart ||
      getSessionGeneration() !== generation;
    chatSyncStore.setEnabled(userId, false);
    // A pass already running may still send chats; wait for it (and the
    // follow-up pass, which no longer sends chat) so none land after the purge.
    await syncWorker.performSync().catch(() => undefined);
    if (accountChanged()) {
      return {
        status: 'sign_in_required',
        message:
          'Active account changed before the cloud copy could be deleted.',
      };
    }
    const result = await cloudClient.request<PurgeResponse>(
      '/v1/sync/chat/purge',
      {method: 'POST'},
      true,
    );
    if (accountChanged()) {
      return {
        status: 'sign_in_required',
        message: 'Active account changed while deleting the cloud copy.',
      };
    }
    if (result.status === 'success') {
      try {
        chatSyncStore.forgetCloudState(userId);
      } catch {
        // Until this runs, turning sync back on would treat this phone's
        // chats as deleted in the cloud. Deleting again is safe.
        return {
          status: 'failed',
          message:
            'The cloud copy was deleted, but this phone could not finish. Keep chat sync off and tap Delete again.',
        };
      }
      return {
        status: 'deleted',
        deletedSessions: Number(result.data?.deletedSessions ?? 0),
        deletedMessages: Number(result.data?.deletedMessages ?? 0),
      };
    }
    if (result.status === 'offline') {
      return {
        status: 'offline',
        message: 'Connect to the internet, then try again.',
      };
    }
    if (result.status === 'auth_required') {
      return {
        status: 'sign_in_required',
        message: 'Sign in again, then try again.',
      };
    }
    if (result.httpStatus === 404 || result.httpStatus === 405) {
      return {
        status: 'unsupported',
        message: "LAFINA's server does not store chat history yet.",
      };
    }
    return {
      status: 'failed',
      message: result.error || 'The cloud copy could not be deleted.',
    };
  },
};
