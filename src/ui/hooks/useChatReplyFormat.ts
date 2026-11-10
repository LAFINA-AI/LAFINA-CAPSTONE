import {useEffect, useState} from 'react';
import {chatReplyFormatStore} from '../../storage/chatReplyFormatStore';
import type {ChatReplyFormat} from '../../storage/chatReplyFormatStore';

/** The account's reply format, kept current when it changes in Profile. */
export const useChatReplyFormat = (userId: string): ChatReplyFormat => {
  const [format, setFormat] = useState<ChatReplyFormat>(() =>
    chatReplyFormatStore.read(userId),
  );

  useEffect(() => {
    setFormat(chatReplyFormatStore.read(userId));
    return chatReplyFormatStore.subscribe((changedUserId, next) => {
      if (changedUserId === userId) setFormat(next);
    });
  }, [userId]);

  return format;
};
