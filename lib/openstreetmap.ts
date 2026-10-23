export type PlaceSearchResult = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  category: string;
  source: "openstreetmap";
};

type NominatimResult = {
  place_id: number;
  osm_type: string;
  osm_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  category?: string;
  address?: Record<string, string>;
  namedetails?: { name?: string };
};

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
let lastNominatimRequestAt = 0;
const nominatimCache = new Map<string, PlaceSearchResult[]>();

async function respectNominatimRateLimit() {
  const waitMs = Math.max(0, 1_100 - (Date.now() - lastNominatimRequestAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastNominatimRequestAt = Date.now();
}

function toPlace(result: NominatimResult): PlaceSearchResult {
  const address = result.address ?? {};
  const name = result.namedetails?.name?.trim() || result.display_name.split(",")[0]?.trim() || "Lugar para beber";
  const city = address.city || address.town || address.municipality || address.village || null;
  return {
    id: `osm:${result.osm_type}:${result.osm_id}`,
    name,
    address: result.display_name,
    city,
    country: address.country || null,
    latitude: Number(result.lat),
    longitude: Number(result.lon),
    category: result.type || result.category || "place",
    source: "openstreetmap",
  };
}

export async function searchPlacesByAddress(query: string, countryCode = "ve") {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 3) return [];
  const cacheKey = `${countryCode}:${normalized}`;
  const cached = nominatimCache.get(cacheKey);
  if (cached) return cached;

  await respectNominatimRateLimit();
  const params = new URLSearchParams({
    q: query.trim(),
    format: "jsonv2",
    addressdetails: "1",
    namedetails: "1",
    limit: "8",
    countrycodes: countryCode,
    "accept-language": "es",
  });
  const response = await fetch(`${NOMINATIM_URL}/search?${params.toString()}`, {
    headers: { Accept: "application/json", "Accept-Language": "es", "X-Sky-Night-Client": "Sky Night mobile" },
  });
  if (!response.ok) throw new Error("No se pudo buscar esa dirección.");
  const results = (await response.json()) as NominatimResult[];
  const places = results.filter((result) => Number.isFinite(Number(result.lat)) && Number.isFinite(Number(result.lon))).map(toPlace);
  nominatimCache.set(cacheKey, places);
  return places;
}

export async function searchNearbyDrinkingPlaces(latitude: number, longitude: number, radiusMeters = 5_000) {
  const radius = Math.min(Math.max(radiusMeters, 500), 10_000);
  const query = `[out:json][timeout:20];(nwr(around:${radius},${latitude},${longitude})[amenity~"^(bar|pub|nightclub|biergarten|wine_bar)$"];);out center tags;`;
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain", Accept: "application/json" },
    body: query,
  });
  if (!response.ok) throw new Error("No se pudieron cargar lugares cercanos.");
  const payload = (await response.json()) as { elements?: OverpassElement[] };
  return (payload.elements ?? []).flatMap((element) => {
    const point = element.lat !== undefined && element.lon !== undefined ? { lat: element.lat, lon: element.lon } : element.center;
    const name = element.tags?.name?.trim();
    if (!point || !name) return [];
    return [{
      id: `osm:${element.type}:${element.id}`,
      name,
      address: [element.tags?.["addr:street"], element.tags?.["addr:housenumber"]].filter(Boolean).join(" ") || "Ubicación aproximada en el mapa",
      city: element.tags?.["addr:city"] || null,
      country: "Venezuela",
      latitude: point.lat,
      longitude: point.lon,
      category: element.tags?.amenity || "place",
      source: "openstreetmap" as const,
    }];
  });
}

export async function reverseGeocode(latitude: number, longitude: number) {
  await respectNominatimRateLimit();
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: "jsonv2",
    addressdetails: "1",
    "accept-language": "es",
  });
  const response = await fetch(`${NOMINATIM_URL}/reverse?${params.toString()}`, {
    headers: { Accept: "application/json", "Accept-Language": "es", "X-Sky-Night-Client": "Sky Night mobile" },
  });
  if (!response.ok) throw new Error("No se pudo resolver la dirección del punto seleccionado.");
  const result = (await response.json()) as NominatimResult;
  return result.display_name || "Punto seleccionado en el mapa";
}
