// Supabase Edge Function: notify-activity
// Clasifica el lugar del brindis sin exponer direcciones residenciales.
// Usa Google Places opcionalmente y Nominatim como respaldo.
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
const googlePlacesKey = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey);

const reactionActions = [
  { action: "REACTION_BEER", title: "🍺" },
  { action: "REACTION_FIRE", title: "🔥" },
  { action: "REACTION_CHEERS", title: "🍻" },
  { action: "REACTION_HEART", title: "❤️" },
];
const friendRequestActions = [
  { action: "ACCEPT_FRIEND", title: "Aceptar" },
  { action: "REJECT_FRIEND", title: "Rechazar" },
];
const brindarActions = [
  { action: "BRINDAR_HEALTH", title: "Salud 🍻" },
  { action: "BRINDAR_ON_WAY", title: "Voy en camino 🚗" },
];

const COMMERCIAL_WORDS = /bar|pub|discoteca|club|restaurante|restaurant|café|cafe|cervec|licorer|taverna|taberna|lounge|terraza|hotel|casino|nightlife|night club|food|fast food|pizzeria|pizzería/i;
const GENERIC_LOCATION_NAMES = /ubicación gps actual|ubicacion gps actual|lugar seleccionado|usuario|venue|ubicación actual/i;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function neighborhoodFromAddress(address: Record<string, unknown> | undefined, fallback = "tu zona") {
  if (!address) return fallback;
  const value = [
    address.neighbourhood,
    address.suburb,
    address.quarter,
    address.city_district,
    address.town,
    address.city,
    address.municipality,
  ].map(cleanText).find(Boolean);
  return value || fallback;
}

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function googlePlaceContext(latitude: number, longitude: number) {
  if (!googlePlacesKey || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${latitude},${longitude}`);
  url.searchParams.set("radius", "60");
  url.searchParams.set("keyword", "bar nightclub restaurant cafe");
  url.searchParams.set("key", googlePlacesKey);
  const data = await fetchJson(url.toString());
  const place = data?.results?.[0];
  if (!place?.name) return null;
  return { commercial: true, name: cleanText(place.name), neighborhood: "" };
}

async function nominatimContext(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "18");
  const data = await fetchJson(url.toString(), {
    Accept: "application/json",
    "User-Agent": "TragosSociales/1.0 contact: support@tragos.sociales",
  });
  if (!data) return null;
  const displayName = cleanText(data.display_name);
  const category = cleanText(data.category);
  const type = cleanText(data.type);
  const commercial = Boolean(data.name) && (COMMERCIAL_WORDS.test(`${data.name} ${category} ${type}`) || ["amenity", "shop", "tourism", "leisure"].includes(category));
  return {
    commercial,
    name: commercial ? cleanText(data.name || data.display_name?.split(",")?.[0]) : "",
    neighborhood: neighborhoodFromAddress(data.address),
    displayName,
  };
}

async function getVenueContext(venueId: number | string | null) {
  if (venueId == null) return { commercial: false, name: "", neighborhood: "tu zona" };
  const { data: venue } = await supabase
    .from("venues")
    .select("name, address, city, latitude, longitude, source, source_id")
    .eq("id", venueId)
    .maybeSingle();
  if (!venue) return { commercial: false, name: "", neighborhood: "tu zona" };

  const venueName = cleanText(venue.name);
  const isGeneric = GENERIC_LOCATION_NAMES.test(venueName);
  const sourceLooksCommercial = Boolean(venue.source && !["device", "user"].includes(String(venue.source).toLowerCase()) && !isGeneric);
  const nameLooksCommercial = !isGeneric && COMMERCIAL_WORDS.test(venueName);
  if (sourceLooksCommercial || nameLooksCommercial) {
    return { commercial: true, name: venueName, neighborhood: cleanText(venue.city) || "tu zona" };
  }

  try {
    const google = await googlePlaceContext(Number(venue.latitude), Number(venue.longitude));
    if (google) return google;
  } catch (error) {
    console.warn("Google Places unavailable:", error?.message ?? error);
  }

  try {
    const osm = await nominatimContext(Number(venue.latitude), Number(venue.longitude));
    if (osm) return osm;
  } catch (error) {
    console.warn("Reverse geocoding unavailable:", error?.message ?? error);
  }

  return { commercial: false, name: "", neighborhood: cleanText(venue.city) || "tu zona" };
}

async function checkInBody(activity: Record<string, unknown>, actorName: string) {
  const context = await getVenueContext((activity.venue_id ?? null) as number | string | null);
  if (context.commercial && context.name) {
    return `${actorName} está tomando algo en ${context.name}`;
  }
  return `${actorName} está tomando algo cerca de ${context.neighborhood || "tu zona"}`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!serviceRoleKey) return new Response("Missing Supabase service role configuration", { status: 500 });

  try {
    const payload = await request.json();
    const activity = payload.record ?? payload.new ?? payload;
    const activityType = activity.type ?? (activity.sender_id && activity.body ? "direct_message" : undefined);
    const recipientId = activity.recipient_id as string | undefined;
    if (!recipientId || !["check_in", "check_out", "friend_request", "reaction_story", "direct_message"].includes(activityType)) {
      return Response.json({ skipped: true });
    }

    const actorId = activity.actor_id ?? activity.sender_id;
    const [{ data: tokens }, { data: actor }] = await Promise.all([
      supabase.from("push_tokens").select("expo_push_token").eq("user_id", recipientId),
      supabase.from("profiles").select("name, username").eq("id", actorId).maybeSingle(),
    ]);
    const actorName = cleanText(actor?.name) || cleanText(actor?.username) || "Un usuario";
    const isFriendRequest = activityType === "friend_request";
    const isStoryReaction = activityType === "reaction_story";
    const isDirectMessage = activityType === "direct_message";
    const isCheckIn = activityType === "check_in";
    const body = isDirectMessage
      ? (activity.body ?? activity.message ?? "Te envió un mensaje")
      : isFriendRequest
        ? "Te envió una solicitud de amistad"
        : isStoryReaction
          ? `Reaccionó a tu Estado ${activity.reaction_emoji ?? "💬"}`
          : isCheckIn
            ? await checkInBody(activity, actorName)
            : "Terminó su visita. Toca para reaccionar.";

    const messages = (tokens ?? []).map((token) => ({
      to: token.expo_push_token,
      sound: "default",
      channelId: "friend-activity",
      priority: "high",
      title: actorName,
      body,
      categoryId: isDirectMessage ? "CHAT_MESSAGE" : isFriendRequest ? "FRIEND_REQUEST" : isCheckIn ? "BRINDAR_ACTIVITY" : "FRIEND_ACTIVITY",
      data: {
        activityId: String(activity.id ?? ""),
        friendshipId: activity.friendship_id ? String(activity.friendship_id) : undefined,
        senderId: String(actorId ?? ""),
        screen: isDirectMessage ? "chat" : "activity",
      },
      _actions: isFriendRequest ? friendRequestActions : isCheckIn ? brindarActions : reactionActions,
    }));

    if (messages.length === 0) return Response.json({ sent: 0 });
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    return Response.json({ sent: messages.length, expo: await response.json() });
  } catch (error) {
    console.error("notify-activity error", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 });
  }
});
