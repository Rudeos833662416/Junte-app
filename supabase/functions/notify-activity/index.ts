// Supabase Edge Function: notify-activity
// La fuente versionada debe coincidir con la función desplegada.
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "https://esm.sh/jose@5.9.6";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
const googlePlacesKey = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";
const fcmServiceAccountJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "";
const BRINDAR_HEALTH = "BRINDAR_HEALTH";
const BRINDAR_ON_WAY = "BRINDAR_ON_WAY";
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createNativeActionToken(userId: string, activityId: string, details: Record<string, unknown> = {}) {
  const raw = crypto.randomUUID();
  const { error } = await supabase.from("notification_action_tokens").insert({
    token_hash: await sha256(raw),
    user_id: userId,
    activity_id: activityId,
    friendship_id_bigint: details.friendshipIdBigint || null,
    sender_id: details.senderId || null,
    recipient_id: userId,
    action_type: details.actionType || null,
  });
  return error ? null : raw;
}

async function getFcmAccessToken() {
  if (!fcmServiceAccountJson) return null;
  const account = JSON.parse(fcmServiceAccountJson);
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json();
  return result.access_token as string | undefined;
}

const COMMERCIAL_WORDS = /bar|pub|discoteca|club|restaurante|restaurant|café|cafe|cervec|licorer|taverna|taberna|lounge|terraza|hotel|casino|nightlife|night club|food|fast food|pizzeria|pizzería/i;
const GENERIC_LOCATION_NAMES = /ubicación gps actual|ubicacion gps actual|lugar seleccionado|usuario|venue|ubicación actual/i;
function cleanText(value: unknown) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""; }
function neighborhoodFromAddress(address: Record<string, unknown> | undefined, fallback = "tu zona") {
  if (!address) return fallback;
  return [address.neighbourhood, address.suburb, address.quarter, address.city_district, address.town, address.city, address.municipality].map(cleanText).find(Boolean) || fallback;
}
async function fetchJson(url: string, headers: Record<string, string> = {}, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } finally { clearTimeout(timer); }
}
async function googlePlaceContext(latitude: number, longitude: number) {
  if (!googlePlacesKey || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const data = await fetchJson("https://places.googleapis.com/v1/places:searchNearby", {
    "Content-Type": "application/json", "X-Goog-Api-Key": googlePlacesKey,
    "X-Goog-FieldMask": "places.displayName,places.types,places.location",
  }, { method: "POST", body: JSON.stringify({ includedTypes: ["bar", "night_club", "restaurant", "cafe", "liquor_store"], maxResultCount: 5, rankPreference: "DISTANCE", locationRestriction: { circle: { center: { latitude, longitude }, radius: 60 } } }) });
  const place = data?.places?.[0];
  return place?.displayName?.text ? { commercial: true, name: cleanText(place.displayName.text), neighborhood: "" } : null;
}
async function nominatimContext(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(latitude)); url.searchParams.set("lon", String(longitude)); url.searchParams.set("format", "jsonv2"); url.searchParams.set("zoom", "18");
  const data = await fetchJson(url.toString(), { Accept: "application/json", "User-Agent": "JunteApp/1.0 contact: support@junte.app" });
  if (!data) return null;
  const category = cleanText(data.category); const type = cleanText(data.type); const displayName = cleanText(data.display_name);
  const commercial = Boolean(data.name) && (COMMERCIAL_WORDS.test(`${data.name} ${category} ${type}`) || ["amenity", "shop", "tourism", "leisure"].includes(category));
  return { commercial, name: commercial ? cleanText(data.name || displayName.split(",")[0]) : "", neighborhood: neighborhoodFromAddress(data.address), displayName };
}
async function googleGeocodeContext(latitude: number, longitude: number) {
  if (!googlePlacesKey || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${latitude},${longitude}`); url.searchParams.set("language", "es"); url.searchParams.set("key", googlePlacesKey);
  const data = await fetchJson(url.toString()); const result = data?.results?.[0];
  if (!result) return null;
  const components = (result.address_components ?? []) as Array<{ long_name?: string; types?: string[] }>;
  const neighborhood = components.find((item) => item.types?.some((type) => ["neighborhood", "sublocality", "sublocality_level_1", "locality", "administrative_area_level_2"].includes(type)))?.long_name;
  return { commercial: false, name: "", neighborhood: cleanText(neighborhood) || "tu zona" };
}
async function getVenueContext(venueId: number | string | null) {
  if (venueId == null) return { commercial: false, name: "", neighborhood: "tu zona" };
  const { data: venue } = await supabase.from("venues").select("name, address, city, latitude, longitude, source, source_id").eq("id", venueId).maybeSingle();
  if (!venue) return { commercial: false, name: "", neighborhood: "tu zona" };
  const venueName = cleanText(venue.name); const isGeneric = GENERIC_LOCATION_NAMES.test(venueName);
  const sourceLooksCommercial = Boolean(venue.source && !["device", "user"].includes(String(venue.source).toLowerCase()) && !isGeneric);
  const nameLooksCommercial = !isGeneric && COMMERCIAL_WORDS.test(venueName);
  if (sourceLooksCommercial || nameLooksCommercial) return { commercial: true, name: venueName, neighborhood: cleanText(venue.city) || "tu zona" };
  const [googleResult, googleAddressResult] = await Promise.allSettled([googlePlaceContext(Number(venue.latitude), Number(venue.longitude)), googleGeocodeContext(Number(venue.latitude), Number(venue.longitude))]);
  if (googleResult.status === "fulfilled" && googleResult.value) return googleResult.value;
  if (googleAddressResult.status === "fulfilled" && googleAddressResult.value) return googleAddressResult.value;
  try { const osm = await nominatimContext(Number(venue.latitude), Number(venue.longitude)); if (osm) return osm; } catch (error) { console.warn("Reverse geocoding unavailable:", error?.message ?? error); }
  return { commercial: false, name: "", neighborhood: cleanText(venue.city) || "tu zona" };
}
async function checkInBody(activity: Record<string, unknown>, actorName: string) {
  const context = await getVenueContext((activity.venue_id ?? null) as number | string | null);
  if (context.commercial && context.name) return `${actorName} está tomando algo en ${context.name}`;
  return `${actorName} está tomando algo cerca de ${context.neighborhood}`;
}
async function areAcceptedFriends(actorId: string, recipientId: string) {
  if (!actorId || !recipientId || actorId === recipientId) return false;
  const { data, error } = await supabase.from("friendships").select("id").eq("status", "accepted").or(`and(user_id.eq.${actorId},friend_id.eq.${recipientId}),and(user_id.eq.${recipientId},friend_id.eq.${actorId})`).limit(1).maybeSingle();
  return !error && Boolean(data);
}
async function canReceiveCheckin(checkinId: number | string, actorId: string, recipientId: string) {
  if (!checkinId || !actorId || !recipientId || actorId === recipientId) return false;
  const { data: checkin, error } = await supabase.from("checkins").select("user_id, visibility, excluded_user_ids, allowed_user_ids").eq("id", checkinId).maybeSingle();
  if (error || !checkin || checkin.user_id !== actorId) return false;
  const { data: allowed, error: permissionError } = await supabase.rpc("can_view_checkin", { p_checkin_user: actorId, p_viewer: recipientId, p_visibility: checkin.visibility ?? "friends", p_excluded: checkin.excluded_user_ids ?? [], p_allowed: checkin.allowed_user_ids ?? [] });
  return !permissionError && allowed === true;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!serviceRoleKey) return Response.json({ error: "Missing Supabase service role configuration" }, { status: 500 });
  try {
    const payload = await request.json(); const activity = payload.record ?? payload.new ?? payload;
    const activityType = activity.type ?? (activity.sender_id && activity.body ? "direct_message" : undefined);
    const recipientId = activity.recipient_id as string | undefined; const actorId = (activity.actor_id ?? activity.sender_id) as string | undefined;
    const supportedTypes = ["check_in", "check_out", "friend_request", "reaction_story", "direct_message", "official_post", "story_new", "comment_reply"];
    if (!recipientId || !actorId || !supportedTypes.includes(activityType)) return Response.json({ skipped: true, reason: "unsupported_activity" });
    const { data: blocked, error: blockedError } = await supabase.rpc("is_blocked_between", {
      p_left: actorId,
      p_right: recipientId,
    });
    if (blockedError) return Response.json({ skipped: true, reason: "blocked_relationship_guard_unavailable" }, { status: 503 });
    if (blocked === true) return Response.json({ skipped: true, reason: "blocked_relationship" });
    const isFriendActivity = activityType === "check_in" || activityType === "check_out";
    const isFriendRequest = activityType === "friend_request"; const isStoryReaction = activityType === "reaction_story"; const isDirectMessage = activityType === "direct_message"; const isOfficialPost = activityType === "official_post"; const isNewStory = activityType === "story_new"; const isCommentReply = activityType === "comment_reply";
    if (activityType === "check_in" && activity.checkin_id != null) {
      const { data: currentCheckin, error: currentCheckinError } = await supabase.from("checkins").select("user_id, status, is_active, expires_at").eq("id", activity.checkin_id).maybeSingle();
      if (currentCheckinError || !currentCheckin || currentCheckin.user_id !== actorId || currentCheckin.status !== "active" || currentCheckin.is_active === false || (currentCheckin.expires_at && new Date(currentCheckin.expires_at).getTime() <= Date.now())) return Response.json({ skipped: true, reason: "checkin_not_active" });
    }
    if (isFriendActivity) {
      const canReceive = activity.checkin_id != null ? await canReceiveCheckin(activity.checkin_id, actorId, recipientId) : await areAcceptedFriends(actorId, recipientId);
      if (!canReceive) return Response.json({ skipped: true, reason: "checkin_recipient_is_outside_audience" });
    }
    if (isDirectMessage) {
      const { data: pendingMessages, error: pendingError } = await supabase.from("activities").select("id").eq("recipient_id", recipientId).eq("actor_id", actorId).eq("type", "direct_message").is("read_at", null).neq("id", activity.id).limit(1);
      if (!pendingError && pendingMessages?.length) return Response.json({ skipped: true, reason: "chat_notification_already_pending" });
    }
    const [{ data: tokens }, { data: actor }] = await Promise.all([supabase.from("push_tokens").select("id, expo_push_token, fcm_token, platform, updated_at").eq("user_id", recipientId), supabase.from("profiles").select("name, username, avatar_url").eq("id", actorId).maybeSingle()]);
    const actorName = cleanText(actor?.name) || cleanText(actor?.username) || "Un usuario"; const avatarUrl = cleanText(actor?.avatar_url) || null;
    const body = isDirectMessage ? activity.body ?? activity.message ?? "Te envió un mensaje" : isFriendRequest ? "Te envió una solicitud de amistad" : isStoryReaction ? `Reaccionó a tu Estado ${activity.reaction_emoji ?? "💬"}` : isOfficialPost ? activity.message ?? "La cuenta oficial publicó contenido nuevo en Eventos" : isNewStory ? `${actorName} acaba de subir una historia nueva` : isCommentReply ? `${actorName} respondió a tu comentario` : isFriendActivity ? await checkInBody(activity, actorName) : "Terminó su visita. Toca para reaccionar.";
    const categoryId = isDirectMessage ? "CHAT_MESSAGE_V2" : isFriendRequest ? "FRIEND_REQUEST" : isFriendActivity ? "BRINDAR_ACTIVITY" : isOfficialPost ? "OFFICIAL_POST" : isNewStory ? "STORY_ACTIVITY" : "FRIEND_ACTIVITY";
    const logicalActivityKey = isFriendActivity ? [activityType, activity.checkin_id ?? "unknown", recipientId, actorId].join(":") : isDirectMessage ? [activityType, activity.direct_message_id ?? activity.id ?? activity.created_at ?? "unknown", recipientId].join(":") : isNewStory ? [activityType, activity.story_id ?? activity.id ?? activity.created_at ?? "unknown", recipientId].join(":") : [activityType, activity.id ?? activity.official_post_id ?? activity.created_at ?? "unknown", recipientId].join(":");
    const latestByPlatform = new Map<string, any>();
    for (const token of tokens ?? []) { if (!token.expo_push_token || token.id == null) continue; const platform = cleanText(token.platform) || "unknown"; const previous = latestByPlatform.get(platform); if (!previous || String(token.updated_at ?? "") > String(previous.updated_at ?? "")) latestByPlatform.set(platform, token); }
    const claimedTokens: any[] = [];
    for (const token of latestByPlatform.values()) {
      try {
        const { data: claim, error: claimError } = await supabase.from("activity_push_deliveries").insert({ delivery_key: logicalActivityKey, token_id: token.id }, { onConflict: "delivery_key,token_id", ignoreDuplicates: true }).select("token_id").maybeSingle();
        if (claimError) console.error("Push deduplication unavailable; delivery skipped:", claimError.message); else if (claim) claimedTokens.push(token);
      } catch (error) { console.error("Push deduplication unavailable; delivery skipped:", error?.message ?? error); }
    }
    const isInteractive = ["CHAT_MESSAGE_V2", "FRIEND_REQUEST", "BRINDAR_ACTIVITY"].includes(categoryId) && !isCommentReply;
    const fcmAccessToken = await getFcmAccessToken().catch((error) => { console.error("FCM direct token unavailable:", error?.message ?? error); return null; });
    // Las acciones de respuesta dependen de la categoría de Expo; enviar mensajes
    // interactivos por Expo garantiza que el botón siga disponible con la app cerrada.
    for (const token of claimedTokens) if (isInteractive) token.actionToken = await createNativeActionToken(recipientId, String(activity.direct_message_id ?? activity.id ?? ""), { friendshipIdBigint: activity.friendship_id, senderId: actorId, actionType: categoryId });
    const nativeTokens = claimedTokens.filter((token) => Boolean(fcmAccessToken && token.fcm_token && !isInteractive)); const expoTokens = claimedTokens.filter((token) => !nativeTokens.includes(token));
    const title = isOfficialPost ? "Junte App oficial" : actorName;
    const actionButtons = isDirectMessage ? ["CHAT_REPLY"] : isFriendRequest ? ["ACCEPT_FRIEND", "REJECT_FRIEND"] : isFriendActivity ? ["BRINDAR_HEALTH", "BRINDAR_ON_WAY"] : [];
    const messages = expoTokens.map((token) => ({ to: token.expo_push_token, priority: "high", sound: "default", channelId: "friend-activity-v4", title: title, body: body, categoryId, ...(avatarUrl ? { richContent: { image: avatarUrl } } : {}), data: { activityId: String(activity.id ?? ""), sentAt: String(activity.created_at ?? new Date().toISOString()), friendshipId: activity.friendship_id ? String(activity.friendship_id) : undefined, senderId: String(actorId), directMessageId: activity.direct_message_id ? String(activity.direct_message_id) : undefined, postId: activity.official_post_id ? String(activity.official_post_id) : undefined, storyId: activity.story_id ? String(activity.story_id) : undefined, storyUserId: isNewStory || isStoryReaction ? String(actorId) : undefined, commentId: activity.comment_id ? String(activity.comment_id) : undefined, screen: isDirectMessage ? "chat" : isOfficialPost || isCommentReply ? "events" : isNewStory || isStoryReaction ? "stories" : isFriendRequest ? "friends" : "activity", avatarUrl, avatar: avatarUrl, collapseId: isDirectMessage ? `junte-chat-${actorId}` : `junte-activity-${actorId}`, actions: actionButtons, quickActions: isFriendActivity ? [BRINDAR_HEALTH, BRINDAR_ON_WAY] : undefined, ...(token.actionToken ? { actionToken: token.actionToken } : {}) } }));
    let fcmSent = 0;
    if (fcmAccessToken && nativeTokens.length) {
      const account = JSON.parse(fcmServiceAccountJson);
      const results = await Promise.all(nativeTokens.map(async (token) => { const data = Object.fromEntries(Object.entries({ type: categoryId, notificationId: logicalActivityKey, activityId: String(activity.id ?? ""), directMessageId: activity.direct_message_id ? String(activity.direct_message_id) : "", senderId: String(actorId), friendshipId: activity.friendship_id ? String(activity.friendship_id) : "", title, body, avatarUrl: avatarUrl ?? "", collapseId: isDirectMessage ? `junte-chat-${actorId}` : `junte-activity-${actorId}`, postId: isOfficialPost || isCommentReply ? String(activity.official_post_id ?? "") : "", storyId: activity.story_id ? String(activity.story_id) : "", commentId: activity.comment_id ? String(activity.comment_id) : "", screen: isDirectMessage ? "chat" : isFriendRequest ? "friends" : isOfficialPost || isCommentReply ? "events" : isNewStory || isStoryReaction ? "stories" : "activity" }).filter(([, value]) => value !== "")); const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${fcmAccessToken}` }, body: JSON.stringify({ message: { token: token.fcm_token, data, notification: { title, body, ...(avatarUrl ? { image: avatarUrl } : {}) }, android: { priority: "HIGH", notification: { channel_id: "friend-activity-v4", sound: "default", ...(avatarUrl ? { image: avatarUrl } : {}) } } } }) }); return response.ok; }));
      fcmSent = results.filter(Boolean).length;
    }
    if (messages.length === 0 && fcmSent === 0) return Response.json({ sent: 0, fcmSent: 0 });
    const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(messages) });
    const expoResult = await response.json(); const invalidTokenIds = (expoResult?.data ?? []).map((ticket: any, index: number) => ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered" ? expoTokens[index]?.id : null).filter(Boolean); const ticketIds = (expoResult?.data ?? []).map((ticket: any) => ticket?.id).filter(Boolean);
    if (ticketIds.length) { await new Promise((resolve) => setTimeout(resolve, 1200)); try { const receiptResponse = await fetch("https://exp.host/--/api/v2/push/getReceipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ticketIds }) }); const receiptResult = await receiptResponse.json(); for (const [index, ticketId] of ticketIds.entries()) if (receiptResult?.data?.[ticketId]?.details?.error === "DeviceNotRegistered") invalidTokenIds.push(expoTokens[index]?.id); } catch (receiptError) { console.warn("Expo receipt lookup unavailable:", receiptError?.message ?? receiptError); } }
    const uniqueInvalidTokenIds = [...new Set(invalidTokenIds.filter(Boolean))]; if (uniqueInvalidTokenIds.length) await supabase.from("push_tokens").delete().in("id", uniqueInvalidTokenIds);
    return Response.json({ sent: messages.length + fcmSent, fcmSent, activityType, removedInvalidTokens: uniqueInvalidTokenIds.length, expo: expoResult });
  } catch (error) { console.error("notify-activity error", error); return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 }); }
});
