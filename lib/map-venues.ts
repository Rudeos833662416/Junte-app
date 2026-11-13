export const VENUE_CATEGORIES = ["all", "bar", "club", "event", "cafe", "restaurant", "other"] as const;
export type VenueCategory = (typeof VENUE_CATEGORIES)[number];

export type MapVenue = {
  id: number;
  name: string;
  category: VenueCategory;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  admin_photo_url: string | null;
  rating: number | null;
  opening_hours: string | null;
  status: "open" | "closed" | "unknown";
  active_promotion: string | null;
};

export const VENUE_CATEGORY_LABELS: Record<VenueCategory, string> = {
  all: "Todos",
  bar: "Bares",
  club: "Discotecas",
  event: "Eventos",
  cafe: "Cafés",
  restaurant: "Restaurantes",
  other: "Otros",
};

export function normalizeMapVenue(row: {
  id?: number | string | null;
  name?: string | null;
  category?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string | null;
  city?: string | null;
  admin_photo_url?: string | null;
  rating?: number | string | null;
  opening_hours?: string | null;
  venue_status?: string | null;
  active_promotion?: string | null;
}): MapVenue | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const category = VENUE_CATEGORIES.includes(row.category as VenueCategory) ? row.category as VenueCategory : "other";
  const status = row.venue_status === "open" || row.venue_status === "closed" ? row.venue_status : "unknown";
  const rating = row.rating == null || row.rating === "" ? null : Number(row.rating);
  return {
    id: Number(row.id),
    name: row.name?.trim() || "Local",
    category,
    latitude,
    longitude,
    address: row.address ?? null,
    city: row.city ?? null,
    admin_photo_url: row.admin_photo_url ?? null,
    rating: Number.isFinite(rating) ? rating : null,
    opening_hours: row.opening_hours ?? null,
    status,
    active_promotion: row.active_promotion ?? null,
  };
}

export function venueCategoryIcon(category: VenueCategory) {
  if (category === "club") return "nightlife" as const;
  if (category === "event") return "event" as const;
  if (category === "cafe") return "local-cafe" as const;
  if (category === "restaurant") return "restaurant" as const;
  if (category === "other") return "place" as const;
  return "local-bar" as const;
}

export function filterMapVenues(venues: MapVenue[], category: VenueCategory) {
  return category === "all" ? venues : venues.filter((venue) => venue.category === category);
}

export function distanceInKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const radius = 6371;
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLng = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatVenueDistance(distanceKm: number | null) {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return "Distancia no disponible";
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
}

export function venueStatusLabel(status: MapVenue["status"]) {
  if (status === "open") return "Abierto ahora";
  if (status === "closed") return "Cerrado ahora";
  return "Horario no disponible";
}
