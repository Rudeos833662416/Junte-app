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
