import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

/** Canal Android alineado con notify-activity (producción). */
export const PUSH_CHANNEL_ID = "friend-activity-v4";

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

async function ensureAndroidChannel(Notifications: typeof import("expo-notifications")) {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: "Actividad de amigos",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 120, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: "default",
  });
  await Notifications.setNotificationChannelAsync("friend-activity", {
    name: "Actividad de amigos (legado)",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 120, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: "default",
  });
}

async function registerCategories(Notifications: typeof import("expo-notifications")) {
  await Notifications.setNotificationCategoryAsync("FRIEND_ACTIVITY", [
    ...REACTION_ACTIONS.map((action) => ({
      identifier: action.identifier,
      buttonTitle: action.buttonTitle,
      options: { opensAppToForeground: true },
    })),
  ]);
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

export async function registerPushNotifications(userId: string) {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
    await ensureAndroidChannel(Notifications);

    const existing = await Notifications.getPermissionsAsync();
    const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;

    await registerCategories(Notifications);

    const projectId =
      Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn("Push notifications require an EAS projectId in the native build.");
      return;
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResult.data;
    if (!expoPushToken) return;

    let fcmToken: string | null = null;
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      if (deviceToken?.data && typeof deviceToken.data === "string") {
        fcmToken = deviceToken.data;
      }
    } catch {
      // FCM nativo no disponible; Expo token basta.
    }

    const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown";
    const payload = {
      user_id: userId,
      expo_push_token: expoPushToken,
      platform,
      fcm_token: fcmToken,
      updated_at: new Date().toISOString(),
    };

    const { error: tokenError } = await supabase.from("push_tokens").upsert(payload, {
      onConflict: "expo_push_token",
    });
    if (tokenError) throw tokenError;
  } catch (error) {
    console.warn("Push registration failed:", error instanceof Error ? error.message : error);
  }
}

export async function saveNotificationReaction(activityId: string, reaction: string, userId: string) {
  const { error } = await supabase
    .from("activities")
    .update({ reaction, reaction_emoji: reaction })
    .eq("id", activityId)
    .eq("recipient_id", userId);
  if (error) console.warn("Could not save notification reaction:", error.message);
}

export async function respondToFriendRequest(
  friendshipId: string,
  status: "accepted" | "blocked",
  userId: string,
) {
  const id = Number(friendshipId);
  if (!Number.isFinite(id)) return;
  const { error } = await supabase
    .from("friendships")
    .update({ status })
    .eq("id", id)
    .eq("friend_id", userId)
    .eq("status", "pending");
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

/** Envía un DM con client_message_id para dedupe con notification-action. */
export async function sendDirectMessage(
  senderId: string,
  recipientId: string,
  body: string,
  clientMessageId?: string,
) {
  const payload = {
    sender_id: senderId,
    recipient_id: recipientId,
    body,
    client_message_id: clientMessageId || newClientMessageId(),
  };
  const { error } = await supabase.from("direct_messages").insert(payload);
  if (error && error.code !== "23505") {
    console.warn("Could not send notification reply:", error.message);
  }
  return { error: error && error.code !== "23505" ? error : null };
}

/**
 * Intenta la edge notification-action (tokens nativos).
 * Si no hay actionToken o falla, el caller puede usar fallback local.
 */
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
  const reactions: Record<string, string> = {
    REACTION_BEER: "🍺",
    REACTION_FIRE: "🔥",
    REACTION_CHEERS: "🍻",
    REACTION_HEART: "❤️",
  };
  return reactions[identifier] ?? null;
}
