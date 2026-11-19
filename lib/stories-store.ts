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

export function getCachedStoryGroups() {
  return cachedGroups;
}

export function setCachedStoryGroups(groups: GroupedStoryUser[]) {
  cachedGroups = groups;
  listeners.forEach((listener) => listener(cachedGroups));
}

export function subscribeStoryGroups(listener: StoryGroupsListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
