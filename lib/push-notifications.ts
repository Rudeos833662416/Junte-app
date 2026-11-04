import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

export const PUSH_CHANNEL_ID = "friend-activity-v4";
const EAS_PROJECT_ID_FALLBACK = "a595b360-16d9-40e4-9df4-7a3630257f39";

const REACTION_ACTIONS = [
  { identifier: "REACTION_BEER", buttonTitle: "🍺" },
  { identifier: "REACTION_FIRE", buttonTitle: "🔥" },
  { identifier: "REACTION_CHEERS", buttonTitle: "🍻" },
  { identifier: "REACTION_HEART", buttonTitle: "❤️" },
];
const FRIEND_REQUEST_ACTIONS = [
  { identifier: "ACCEPT_FRIEND", buttonTitle: "Aceptar" },
  { identifier: "REJECT_FRIEND", buttonTitle: "Rechazar", options: { isDestructive: true } },
];
const CHAT_ACTIONS = [
  {
    identifier: "CHAT_REPLY",
    buttonTitle: "Responder",
    textInput: { submitButtonTitle: "Enviar", placeholder: "Escribe una respuesta…" },
  },
];
const BRINDAR_ACTIONS = [
  { identifier: "BRINDAR_HEALTH", buttonTitle: "Salud 🍻" },
  { identifier: "BRINDAR_ON_WAY", buttonTitle: "Voy en camino 🚗" },
];

export function canUseNativeNotifications() {
  return Platform.OS !== "web" && Device.isDevice;
}

export function setupNotificationHandler() {
  if (!canUseNativeNotifications()) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: "Actividad de amigos",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 120, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: "default",
  });
}

async function registerCategories() {
  if (!canUseNativeNotifications()) return;
  await Notifications.setNotificationCategoryAsync("FRIEND_ACTIVITY", REACTION_ACTIONS.map((action) => ({
    identifier: action.identifier,
    buttonTitle: action.buttonTitle,
    options: { opensAppToForeground: true },
  })));
  await Notifications.setNotificationCategoryAsync(
    "FRIEND_REQUEST",
    FRIEND_REQUEST_ACTIONS.map((action) => ({
      identifier: action.identifier,
      buttonTitle: action.buttonTitle,
      options: { opensAppToForeground: true, ...action.options },
    })),
  );
  const chatCategory = CHAT_ACTIONS.map((action) => ({
    identifier: action.identifier,
    buttonTitle: action.buttonTitle,
    textInput: action.textInput,
    options: { opensAppToForeground: false },
  }));
  await Notifications.setNotificationCategoryAsync("CHAT_MESSAGE", chatCategory);
  await Notifications.setNotificationCategoryAsync("CHAT_MESSAGE_V2", chatCategory);
  await Notifications.setNotificationCategoryAsync(
    "BRINDAR_ACTIVITY",
    BRINDAR_ACTIONS.map((action) => ({
      identifier: action.identifier,
      buttonTitle: action.buttonTitle,
      options: { opensAppToForeground: false },
    })),
  );
  await Notifications.setNotificationCategoryAsync("OFFICIAL_POST", []);
  await Notifications.setNotificationCategoryAsync("STORY_ACTIVITY", []);
}

/** Solicita permiso, obtiene token Expo/FCM y lo guarda en public.push_tokens. */
export async function registerForPushNotificationsAsync(userId?: string | null) {
  if (!canUseNativeNotifications()) {
    console.log("[push] Simulator/web — push nativo no disponible");
    return null;
  }

  try {
    await ensureAndroidNotificationChannel();
    await registerCategories();
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      console.warn("[push] Permission not granted:", finalStatus);
      return null;
    }

    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId ??
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
      EAS_PROJECT_ID_FALLBACK;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return null;

    let fcmToken: string | null = null;
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      if (typeof deviceToken?.data === "string") fcmToken = deviceToken.data;
    } catch (error) {
      console.warn("[push] FCM device token unavailable:", error instanceof Error ? error.message : error);
    }

    let uid = userId ?? null;
    if (!uid) uid = (await supabase.auth.getSession()).data.session?.user?.id ?? null;
    if (!uid) return token;

    const payload = {
      user_id: uid,
      expo_push_token: token,
      fcm_token: fcmToken,
      platform: Platform.OS === "ios" ? "ios" : "android",
      updated_at: new Date().toISOString(),
    };
    let error = (await supabase.from("push_tokens").upsert(payload, { onConflict: "user_id,platform" })).error;
    if (error) {
      console.warn("[push] upsert user_id,platform failed:", error.message);
      error = (await supabase.from("push_tokens").upsert(payload, { onConflict: "expo_push_token" })).error;
    }
    if (error) {
      console.warn("[push] upsert expo_push_token failed:", error.message);
      const insertError = (await supabase.from("push_tokens").insert(payload)).error;
      if (insertError) throw insertError;
    }
    console.log("[push] Token saved", payload.platform, "fcm=", Boolean(fcmToken));
    return token;
  } catch (error) {
    console.warn("[push] Registration error:", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function registerPushNotifications(userId: string) {
  return registerForPushNotificationsAsync(userId);
}

export async function registerNotificationCategories() {
  try {
    await registerCategories();
  } catch (error) {
    console.warn("[push] Categories error:", error instanceof Error ? error.message : error);
  }
}

export async function saveNotificationReaction(activityId: string, reaction: string, userId: string) {
  const { error } = await supabase.from("activities").update({ reaction, reaction_emoji: reaction }).eq("id", activityId).eq("recipient_id", userId);
  if (error) console.warn("Could not save notification reaction:", error.message);
}

export async function respondToFriendRequest(friendshipId: string, status: "accepted" | "blocked", userId: string) {
  const id = Number(friendshipId);
  if (!Number.isFinite(id)) return;
  const { error } = await supabase.from("friendships").update({ status }).eq("id", id).eq("friend_id", userId).eq("status", "pending");
  if (error) console.warn("Could not respond to friend request:", error.message);
}

function newClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function sendDirectMessage(senderId: string, recipientId: string, body: string, clientMessageId?: string) {
  const { error } = await supabase.from("direct_messages").insert({
    sender_id: senderId,
    recipient_id: recipientId,
    body,
    client_message_id: clientMessageId || newClientMessageId(),
  });
  if (error && error.code !== "23505") console.warn("Could not send notification reply:", error.message);
  return { error: error && error.code !== "23505" ? error : null };
}

export async function invokeNotificationAction(params: {
  actionToken?: string | null;
  action: "reply" | "mark_read" | "friend_accept" | "friend_reject" | "brindar_reply";
  body?: string;
  clientMessageId?: string;
}) {
  if (!params.actionToken) return { ok: false as const, reason: "no_token" as const };
  const { data, error } = await supabase.functions.invoke("notification-action", {
    body: {
      actionToken: params.actionToken,
      action: params.action,
      body: params.body ?? "",
      clientMessageId: params.clientMessageId ?? newClientMessageId(),
    },
  });
  if (error) {
    console.warn("notification-action failed:", error.message);
    return { ok: false as const, reason: "invoke_error" as const, error };
  }
  return { ok: true as const, data };
}

export function quickBrindarMessage(identifier: string) {
  if (identifier === "BRINDAR_HEALTH") return "Salud 🍻";
  if (identifier === "BRINDAR_ON_WAY") return "Voy en camino 🚗";
  return null;
}

export function reactionFromNotificationAction(identifier: string) {
  return ({
    REACTION_BEER: "🍺",
    REACTION_FIRE: "🔥",
    REACTION_CHEERS: "🍻",
    REACTION_HEART: "❤️",
  } as Record<string, string>)[identifier] ?? null;
}
