import { supabase } from "@/lib/supabase";
import { uploadUriToStorage } from "@/lib/media-upload";

/** Nombre real del bucket en Supabase Storage. */
export const OFFICIAL_FEED_BUCKET = "official-feed";
export const VENUE_ASSETS_BUCKET = "venue-assets";

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
  await uploadUriToStorage(OFFICIAL_FEED_BUCKET, path, params.uri, mime);
  const { data } = supabase.storage.from(OFFICIAL_FEED_BUCKET).getPublicUrl(path);
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
  name?: string | null;
  address?: string | null;
  city?: string | null;
  description?: string | null;
  website_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  whatsapp_number?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  admin_rank?: number | null;
  admin_photo_url?: string | null;
  category?: string;
  opening_hours?: string | null;
  venue_status?: string;
  rating?: number | null;
  active_promotion?: string | null;
}) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.name !== undefined) payload.name = params.name;
  if (params.address !== undefined) payload.address = params.address;
  if (params.city !== undefined) payload.city = params.city;
  if (params.description !== undefined) payload.description = params.description;
  if (params.website_url !== undefined) payload.website_url = params.website_url;
  if (params.facebook_url !== undefined) payload.facebook_url = params.facebook_url;
  if (params.instagram_url !== undefined) payload.instagram_url = params.instagram_url;
  if (params.tiktok_url !== undefined) payload.tiktok_url = params.tiktok_url;
  if (params.whatsapp_number !== undefined) payload.whatsapp_number = params.whatsapp_number;
  if (params.latitude !== undefined) payload.latitude = params.latitude;
  if (params.longitude !== undefined) payload.longitude = params.longitude;
  if (params.admin_rank !== undefined) payload.admin_rank = params.admin_rank;
  if (params.admin_photo_url !== undefined) payload.admin_photo_url = params.admin_photo_url;
  if (params.category !== undefined) payload.category = params.category;
  if (params.opening_hours !== undefined) payload.opening_hours = params.opening_hours;
  if (params.venue_status !== undefined) payload.venue_status = params.venue_status;
  if (params.rating !== undefined) payload.rating = params.rating;
  if (params.active_promotion !== undefined) payload.active_promotion = params.active_promotion;
  const { error } = await supabase.from("venues").update(payload as never).eq("id", params.venueId);
  if (error) throw error;
}

export async function deleteVenueAdmin(venueId: number) {
  const { error } = await supabase.from("venues").delete().eq("id", venueId);
  if (error) throw error;
}

export async function createVenueAdmin(params: {
  name: string;
  address?: string | null;
  city?: string | null;
  description?: string | null;
  website_url?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  whatsapp_number?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  admin_rank?: number | null;
  category?: string;
  opening_hours?: string | null;
  venue_status?: string;
  rating?: number | null;
  active_promotion?: string | null;
}) {
  const { data, error } = await supabase
    .from("venues")
    .insert({
      name: params.name,
      address: params.address ?? null,
      city: params.city ?? null,
      description: params.description ?? null,
      website_url: params.website_url ?? null,
      facebook_url: params.facebook_url ?? null,
      instagram_url: params.instagram_url ?? null,
      tiktok_url: params.tiktok_url ?? null,
      whatsapp_number: params.whatsapp_number ?? null,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      admin_rank: params.admin_rank ?? null,
      category: params.category ?? "bar",
      opening_hours: params.opening_hours ?? null,
      venue_status: params.venue_status ?? "unknown",
      rating: params.rating ?? null,
      active_promotion: params.active_promotion ?? null,
      source: "admin",
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: number };
}

export async function uploadVenuePhoto(venueId: number, uri: string) {
  const path = `venues/${venueId}/${Date.now()}.jpg`;
  await uploadUriToStorage(VENUE_ASSETS_BUCKET, path, uri, "image/jpeg");
  const { data } = supabase.storage.from(VENUE_ASSETS_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Upload falló");
  await updateVenueAdmin({ venueId, admin_photo_url: data.publicUrl });
  return data.publicUrl;
}
