import AsyncStorage from "@react-native-async-storage/async-storage";

export type StoryItem = {
  id: number;
  user_id: string;
  media_url: string | null;
  media_type: "image" | "video" | "text";
  audio_url: string | null;
  audio_name: string | null;
  music_title?: string | null;
  caption: string | null;
  visibility: "friends" | "public";
  privacy?: "all_friends" | "close_friends" | "public";
  created_at: string;
  expires_at: string;
  user_name?: string;
  avatar_url?: string | null;
  text_content?: string | null;
  text_background_color?: string | null;
  text_font_family?: string | null;
  trim_start_sec?: number | null;
  trim_end_sec?: number | null;
  is_muted?: boolean | null;
  isOptimistic?: boolean;
};

export type GroupedStoryUser = {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  isSelf: boolean;
  stories: StoryItem[];
  latestCreatedAt: string;
};

type StoryGroupsListener = (groups: GroupedStoryUser[]) => void;

let cachedGroups: GroupedStoryUser[] = [];
const listeners = new Set<StoryGroupsListener>();
let activeScope: string | null = null;
let hydrationGeneration = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (!activeScope) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void AsyncStorage.setItem(`junta2:stories-store:v1:${activeScope}`, JSON.stringify(cachedGroups)).catch(() => undefined);
  }, 50);
}

export async function hydrateStoryStore(scope: string) {
  const generation = ++hydrationGeneration;
  activeScope = scope;
  cachedGroups = [];
  listeners.forEach((listener) => listener(cachedGroups));
  try {
    const raw = await AsyncStorage.getItem(`junta2:stories-store:v1:${scope}`);
    if (generation !== hydrationGeneration || activeScope !== scope) return;
    if (!raw) return;
    const parsed = JSON.parse(raw) as GroupedStoryUser[];
    if (Array.isArray(parsed)) setCachedStoryGroups(parsed);
  } catch {
    // Un snapshot corrupto no debe bloquear la pantalla.
  }
}

export function getCachedStoryGroups() {
  return cachedGroups;
}

export function setCachedStoryGroups(groups: GroupedStoryUser[]) {
  cachedGroups = groups;
  schedulePersist();
  listeners.forEach((listener) => listener(cachedGroups));
}

export function subscribeStoryGroups(listener: StoryGroupsListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
