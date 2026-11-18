export type CachedChatMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  client_message_id?: string | null;
  pending?: boolean;
};

export type CachedConversation = {
  otherId: string;
  name: string;
  avatarUrl: string | null;
  lastBody: string;
  lastAt: string;
  unread: number;
};

let inboxCache: CachedConversation[] = [];
const conversationCache = new Map<string, CachedChatMessage[]>();

export function getCachedInbox() {
  return inboxCache;
}

export function setCachedInbox(items: CachedConversation[]) {
  inboxCache = items;
}

export function getCachedConversation(otherId: string) {
  return conversationCache.get(otherId) ?? [];
}

export function setCachedConversation(otherId: string, messages: CachedChatMessage[]) {
  conversationCache.set(otherId, messages);
}

export function mergeCachedMessage(messages: CachedChatMessage[], message: CachedChatMessage) {
  const byId = messages.findIndex((item) => item.id === message.id);
  if (byId >= 0) {
    const next = [...messages];
    next[byId] = { ...message, pending: false };
    return next;
  }
  const byClientId = message.client_message_id
    ? messages.findIndex((item) => item.client_message_id === message.client_message_id)
    : -1;
  if (byClientId >= 0) {
    const next = [...messages];
    next[byClientId] = { ...message, pending: false };
    return next;
  }
  return [message, ...messages].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function replaceCachedMessage(messages: CachedChatMessage[], message: CachedChatMessage) {
  return mergeCachedMessage(messages, message);
}

export function clearChatStore() {
  inboxCache = [];
  conversationCache.clear();
}
