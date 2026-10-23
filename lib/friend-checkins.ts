import { supabase } from "@/lib/supabase";

export type FriendCheckinMarker = {
  id: number;
  userId: string;
  name: string;
  venueName: string;
  latitude: number;
  longitude: number;
  createdAt: string;
};

export type MapActivity = {
  totalCount: number;
  hotZoneCount: number;
  hotZoneRadius: number;
  center: { latitude: number; longitude: number } | null;
  markers: FriendCheckinMarker[];
};

type ActivityMarkerRow = {
  id: number;
  user_id: string;
  name?: string | null;
  venue_name?: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
};

type ActivityPayload = {
  total_count?: number;
  hot_zone_count?: number;
  hot_zone_radius?: number;
  center_latitude?: number | null;
  center_longitude?: number | null;
  markers?: ActivityMarkerRow[];
};

/**
 * Returns the aggregate active count/center plus only markers visible to the
 * current viewer (friends or public profiles). Private strangers are never
 * returned as individual coordinates.
 */
export async function fetchMapActivity(): Promise<MapActivity> {
  const { data, error } = await supabase.rpc("get_map_activity");
  if (error) throw error;

  const payload = (data ?? {}) as ActivityPayload;
  const center = Number.isFinite(payload.center_latitude) && Number.isFinite(payload.center_longitude)
    ? { latitude: Number(payload.center_latitude), longitude: Number(payload.center_longitude) }
    : null;
  const markers = (payload.markers ?? [])
    .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name?.trim() || "Amigo",
      venueName: row.venue_name?.trim() || "Lugar compartido",
      latitude: row.latitude,
      longitude: row.longitude,
      createdAt: row.created_at,
    }));

  return {
    totalCount: Math.max(0, Number(payload.total_count ?? 0)),
    hotZoneCount: Math.max(0, Number(payload.hot_zone_count ?? 0)),
    hotZoneRadius: Math.max(50, Number(payload.hot_zone_radius ?? 50)),
    center,
    markers,
  };
}

/** Backwards-compatible helper for any screen that only needs visible friends. */
export async function fetchFriendCheckinMarkers(userId: string): Promise<FriendCheckinMarker[]> {
  const activity = await fetchMapActivity();
  return activity.markers.filter((marker) => marker.userId !== userId);
}
