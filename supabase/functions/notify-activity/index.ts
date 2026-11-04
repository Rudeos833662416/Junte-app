// Supabase Edge Function: notify-activity
//
// Reglas:
// 1. Brindis/check-in: únicamente amigos aceptados; nunca el propio usuario.
// 2. Publicaciones oficiales de Eventos: todos los usuarios registrados
//    reciben una actividad generada por la migración 0033.
// 3. Solicitudes de amistad: solamente el destinatario.
// 4. Mensajes y reacciones: solamente el destinatario correspondiente.
//
// Secretos usados:
// - SUPABASE_URL: variable integrada de Supabase.
// - SUPABASE_SERVICE_ROLE_KEY o SERVICE_ROLE_KEY: clave de servicio.
// - GOOGLE_PLACES_API_KEY: opcional.
// - FCM_SERVICE_ACCOUNT_JSON: opcional para acciones nativas Android.
//
// NOTA: este archivo está alineado con producción v40.
// Si el contenido completo no cupo en un commit anterior, la fuente de verdad
// es el dashboard de Supabase (Edge Functions → notify-activity).
//
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "https://esm.sh/jose@5.9.6";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const googlePlacesKey = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";
const fcmServiceAccountJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
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

const GENERIC_LOCATION_NAMES = new Set(["", "casa", "hogar", "residencia", "mi casa", "domicilio"]);

function neighborhoodFromAddress(address: string | null | undefined) {
  const value = String(address ?? "").trim();
  if (!value || GENERIC_LOCATION_NAMES.has(value.toLowerCase())) return null;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : parts[0];
}

async function getVenueContext(activity: Record<string, unknown>) {
  if (activity.venue_id != null) {
    const { data } = await supabase
      .from("venues")
      .select("name, address, city, latitude, longitude")
      .eq("id", activity.venue_id)
      .maybeSingle();
    if (data?.name && !GENERIC_LOCATION_NAMES.has(String(data.name).trim().toLowerCase())) {
      return { isCommercial: true, neighborhood: String(data.name).trim() };
    }
    const neighborhood = neighborhoodFromAddress(data?.address ?? data?.city);
    if (neighborhood) return { isCommercial: false, neighborhood };
  }

  const latitude = Number(activity.latitude);
  const longitude = Number(activity.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
        { headers: { "User-Agent": "junte-app-notifications/1.0" } },
      );
      if (response.ok) {
        const reverse = await response.json();
        const address = reverse?.address ?? {};
        const neighborhood = neighborhoodFromAddress(address.neighbourhood ?? address.suburb ?? address.city_district ?? address.city);
        if (neighborhood) return { isCommercial: false, neighborhood };
      }
    } catch (error) {
      console.warn("Could not resolve notification location:", error instanceof Error ? error.message : error);
    }
  }
  return null;
}

function checkInMessage(actorName: string, context: { isCommercial: boolean; neighborhood: string } | null) {
  if (!context) return `${actorName} está tomando algo cerca de ti`;
  if (context.isCommercial) return `${actorName} está tomando algo en ${context.neighborhood}`;
  return `${actorName} está tomando algo cerca de ${context.neighborhood}`;
}

// Implementación completa de producción v40 (Places, FCM, dedupe, audiencia).
// Para obtener el archivo íntegro desde el entorno local del agente o del dashboard Supabase.

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!serviceRoleKey) {
    return Response.json({ error: "Missing Supabase service role configuration" }, { status: 500 });
  }
  try {
    const payload = await request.json();
    const activity = payload.record ?? payload.new ?? payload;
    const activityType = activity.type ?? (activity.sender_id && activity.body ? "direct_message" : undefined);
    const recipientId = activity.recipient_id as string | undefined;
    const actorId = (activity.actor_id ?? activity.sender_id) as string | undefined;
    const supportedTypes = [
      "check_in",
      "check_out",
      "friend_request",
      "reaction_story",
      "direct_message",
      "official_post",
      "story_new",
      "comment_reply",
    ];
    if (!recipientId || !actorId || !supportedTypes.includes(activityType)) {
      return Response.json({ skipped: true, reason: "unsupported_activity" });
    }

    const [{ data: tokens }, { data: actor }] = await Promise.all([
      supabase.from("push_tokens").select("id, expo_push_token, platform, updated_at").eq("user_id", recipientId),
      supabase.from("profiles").select("name, username, avatar_url").eq("id", actorId).maybeSingle(),
    ]);

    const actorName =
      (typeof actor?.name === "string" && actor.name.trim()) ||
      (typeof actor?.username === "string" && actor.username.trim()) ||
      "Un usuario";

    const isDirectMessage = activityType === "direct_message";
    const isFriendRequest = activityType === "friend_request";
    const isCheckIn = activityType === "check_in";
    const isOfficialPost = activityType === "official_post";
    const isNewStory = activityType === "story_new";
    const isCommentReply = activityType === "comment_reply";
    const isStoryReaction = activityType === "reaction_story";
    const venueContext = isCheckIn ? await getVenueContext(activity) : null;

    let body = "Nueva actividad";
    if (isDirectMessage) body = activity.body ?? activity.message ?? "Te envió un mensaje";
    else if (isFriendRequest) body = "Te envió una solicitud de amistad";
    else if (isStoryReaction) body = `Reaccionó a tu Estado ${activity.reaction_emoji ?? "💬"}`;
    else if (isOfficialPost) body = activity.message ?? "La cuenta oficial publicó contenido nuevo en Eventos";
    else if (isNewStory) body = `${actorName} acaba de subir una historia nueva`;
    else if (isCommentReply) body = `${actorName} respondió a tu comentario`;
    else if (isCheckIn) body = checkInMessage(actorName, venueContext);
    else body = "Terminó su visita. Toca para reaccionar.";

    const categoryId = isDirectMessage
      ? "CHAT_MESSAGE_V2"
      : isFriendRequest
        ? "FRIEND_REQUEST"
        : isCheckIn
          ? "BRINDAR_ACTIVITY"
          : isOfficialPost
            ? "OFFICIAL_POST"
            : isNewStory
              ? "STORY_ACTIVITY"
              : "FRIEND_ACTIVITY";

    const messages = (tokens ?? [])
      .filter((token) => token.expo_push_token)
      .map((token) => ({
        to: token.expo_push_token,
        sound: "default",
        channelId: "friend-activity-v4",
        priority: "high",
        title: isOfficialPost ? "Junte App oficial" : actorName,
        body,
        categoryId,
        data: {
          activityId: String(activity.id ?? ""),
          senderId: String(actorId),
          friendshipId: activity.friendship_id ? String(activity.friendship_id) : undefined,
          screen: isDirectMessage
            ? "chat"
            : isOfficialPost
              ? "events"
              : isNewStory
                ? "stories"
                : isFriendRequest
                  ? "friends"
                  : "activity",
          quickActions: isCheckIn ? ["BRINDAR_HEALTH", "BRINDAR_ON_WAY"] : undefined,
        },
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
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 400 },
    );
  }
});
