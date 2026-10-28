export type Venue = {
  id: number;
  name: string;
  address: string | null;
  description: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  admin_rank: number | null;
  admin_photo_url: string | null;
};

export type OfficialPost = {
  id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
  created_by: string;
  media_width: number | null;
  media_height: number | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  authorName: string;
  authorAvatarUrl: string | null;
};

export type OfficialAuthor = {
  id: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  parent_comment_id: string | null;
  reactionCount: number;
  reacted: boolean;
};

export type FullMedia = { uri: string; isVideo: boolean; aspectRatio?: number };

export const rankColors = ["#F4C542", "#C9D1D9", "#B8794A", "#3B82F6", "#A855F7"];

const postDateTimeFormat = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatDate(value: string) {
  return postDateTimeFormat.format(new Date(value));
}
