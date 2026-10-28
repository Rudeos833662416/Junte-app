import { supabase } from "@/lib/supabase";
import { uploadUriToStorage } from "@/lib/media-upload";

export async function publishOfficialPost(params: {
  userId: string;
  uri: string;
  mediaType: "image" | "video";
  caption: string;
  width?: number | null;
  height?: number | null;
}) {
  const path = `official/${params.userId}/${Date.now()}.${params.mediaType === "video" ? "mp4" : "jpg"}`;
  const mime = params.mediaType === "video" ? "video/mp4" : "image/jpeg";
  await uploadUriToStorage("official-posts", path, params.uri, mime);
  const { data } = supabase.storage.from("official-posts").getPublicUrl(path);
  const publicUrl = data.publicUrl;
  if (!publicUrl) throw new Error("No se obtuvo URL pública");
  const { error } = await supabase.from("official_posts").insert({
    created_by: params.userId,
    media_url: publicUrl,
    media_type: params.mediaType,
    caption: params.caption.trim() || null,
    media_width: params.width ?? null,
    media_height: params.height ?? null,
  });
  if (error) throw error;
  return publicUrl;
}

export async function updateVenueAdmin(params: {
  venueId: number;
  admin_rank?: number | null;
  admin_photo_url?: string | null;
  description?: string | null;
}) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.admin_rank !== undefined) payload.admin_rank = params.admin_rank;
  if (params.admin_photo_url !== undefined) payload.admin_photo_url = params.admin_photo_url;
  if (params.description !== undefined) payload.description = params.description;
  const { error } = await supabase.from("venues").update(payload).eq("id", params.venueId);
  if (error) throw error;
}
