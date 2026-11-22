import {DeviceEventEmitter} from 'react-native';

/** Emitted with {userId} after synced chat changes from the cloud are saved. */
export const CHAT_REMOTE_CHANGED_EVENT = 'LAFINA_CHAT_REMOTE_CHANGED';

export interface ChatRemoteChangedEvent {
  userId: string;
}

export const emitChatRemoteChanged = (userId: string): void => {
  DeviceEventEmitter.emit(CHAT_REMOTE_CHANGED_EVENT, {
    userId,
  } satisfies ChatRemoteChangedEvent);
};
