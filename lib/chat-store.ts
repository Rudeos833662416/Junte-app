import AsyncStorage from "@react-native-async-storage/async-storage";

export type ChatMessageKind = "text" | "story_reaction" | "story_reply" | "story_quick_reaction";

export type CachedChatMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  client_message_id?: string | null;
  pending?: boolean;
  story_id?: number | null;
  kind?: ChatMessageKind | string;
  audio_path?: string | null;
  duration_ms?: number | null;
  audio_url?: string | null;
  reply_to_message_id?: string | null;
  reply_to_body?: string | null;
  reply_to_sender_id?: string | null;
};

export type CachedConversation = {
  otherId: string;
  name: string;
  avatarUrl: string | null;
  lastBody: string;
  lastAt: string;
  unread: number;
};

type PersistedChatStore = { inbox: CachedConversation[]; conversations: Record<string, CachedChatMessage[]>; drafts: Record<string, string> };
const STORAGE_PREFIX = "junta2:chat-store:v1:";
let activeScope: string | null = null;
let hydrationGeneration = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let inboxCache: CachedConversation[] = [];
const conversationCache = new Map<string, CachedChatMessage[]>();
const draftsByPeerId = new Map<string, string>();

function schedulePersist() {
  if (!activeScope) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const conversations: Record<string, CachedChatMessage[]> = {};
    for (const [peerId, messages] of conversationCache) conversations[peerId] = messages.slice(0, 100);
    const drafts: Record<string, string> = {};
    for (const [peerId, draft] of draftsByPeerId) drafts[peerId] = draft;
    void AsyncStorage.setItem(`${STORAGE_PREFIX}${activeScope}`, JSON.stringify({ inbox: inboxCache.slice(0, 300), conversations, drafts })).catch(() => undefined);
  }, 50);
}

export async function hydrateChatStore(scope: string) {
  const generation = ++hydrationGeneration;
  activeScope = scope;
  inboxCache = [];
  conversationCache.clear();
  draftsByPeerId.clear();
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${scope}`);
    if (generation !== hydrationGeneration || activeScope !== scope) return;
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<PersistedChatStore>;
    inboxCache = Array.isArray(parsed.inbox) ? parsed.inbox : [];
    const conversations = parsed.conversations && typeof parsed.conversations === "object" && !Array.isArray(parsed.conversations) ? parsed.conversations : {};
    const drafts = parsed.drafts && typeof parsed.drafts === "object" && !Array.isArray(parsed.drafts) ? parsed.drafts : {};
    for (const [peerId, messages] of Object.entries(conversations)) if (Array.isArray(messages)) conversationCache.set(peerId, messages);
    for (const [peerId, draft] of Object.entries(drafts)) if (typeof draft === "string" && draft) draftsByPeerId.set(peerId, draft);
  } catch {
    // Un snapshot corrupto no debe bloquear el arranque offline.
  }
}

export function getCachedInbox() {
  return inboxCache;
}

export function setCachedInbox(items: CachedConversation[]) {
  inboxCache = items;
  schedulePersist();
}

export function markInboxConversationRead(otherId: string) {
  inboxCache = inboxCache.map((item) => item.otherId === otherId ? { ...item, unread: 0 } : item);
  schedulePersist();
}

export function getCachedConversation(otherId: string) {
  return conversationCache.get(otherId) ?? [];
}

export function setCachedConversation(otherId: string, messages: CachedChatMessage[]) {
  conversationCache.set(otherId, messages.slice(0, 100));
  schedulePersist();
}

export function getDraft(otherId: string) {
  return draftsByPeerId.get(otherId) ?? "";
}

export function setDraft(otherId: string, draft: string) {
  if (draft) draftsByPeerId.set(otherId, draft);
  else draftsByPeerId.delete(otherId);
  schedulePersist();
}

export function clearDraft(otherId: string) {
  draftsByPeerId.delete(otherId);
  schedulePersist();
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
  return [message, ...messages].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 100);
}

export function replaceCachedMessage(messages: CachedChatMessage[], message: CachedChatMessage) {
  return mergeCachedMessage(messages, message);
}

export function isSameMessageGroup(current: CachedChatMessage, previous?: CachedChatMessage) {
  if (!previous || current.sender_id !== previous.sender_id) return false;
  return Math.abs(new Date(current.created_at).getTime() - new Date(previous.created_at).getTime()) <= 2 * 60 * 1000;
}

export function formatChatDateLabel(value: string, now = new Date()) {
  const date = new Date(value);
  const startOfDay = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days === 0) return "HOY";
  if (days === 1) return "AYER";
  return date.toLocaleDateString([], { day: "2-digit", month: "short" }).toUpperCase();
}

export function clearChatStore() {
  inboxCache = [];
  conversationCache.clear();
  draftsByPeerId.clear();
  activeScope = null;
  hydrationGeneration += 1;
  if (persistTimer) clearTimeout(persistTimer);
}
