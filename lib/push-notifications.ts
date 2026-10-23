import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

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
  { identifier: "CHAT_REPLY", buttonTitle: "Responder", textInput: { submitButtonTitle: "Enviar", placeholder: "Escribe una respuesta…" } },
];
const BRINDAR_ACTIONS = [
  { identifier: "BRINDAR_HEALTH", buttonTitle: "Salud 🍻" },
  { identifier: "BRINDAR_ON_WAY", buttonTitle: "Voy en camino 🚗" },
];

export async function registerPushNotifications(userId: string) {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("friend-activity", {
      name: "Actividad de amigos",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 120, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: "default",
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return;

  await Notifications.setNotificationCategoryAsync("FRIEND_ACTIVITY", [
    ...REACTION_ACTIONS.map((action) => ({
      identifier: action.identifier,
      buttonTitle: action.buttonTitle,
      options: { opensAppToForeground: true },
    })),
  ]);
  await Notifications.setNotificationCategoryAsync("FRIEND_REQUEST", FRIEND_REQUEST_ACTIONS.map((action) => ({
    identifier: action.identifier,
    buttonTitle: action.buttonTitle,
    options: { opensAppToForeground: true, ...action.options },
  })));
  await Notifications.setNotificationCategoryAsync("CHAT_MESSAGE", CHAT_ACTIONS.map((action) => ({
    identifier: action.identifier,
    buttonTitle: action.buttonTitle,
    textInput: action.textInput,
    options: { opensAppToForeground: false },
  })));
  await Notifications.setNotificationCategoryAsync("BRINDAR_ACTIVITY", BRINDAR_ACTIONS.map((action) => ({
    identifier: action.identifier,
    buttonTitle: action.buttonTitle,
    options: { opensAppToForeground: false },
  })));

    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn("Push notifications require an EAS projectId in the native build.");
      return;
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult.data;
    if (!token) return;

    const { error: tokenError } = await supabase.from("push_tokens").upsert(
      { user_id: userId, expo_push_token: token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: "expo_push_token" },
    );
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

export async function respondToFriendRequest(friendshipId: string, status: "accepted" | "blocked", userId: string) {
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

export async function sendDirectMessage(senderId: string, recipientId: string, body: string) {
  const { error } = await supabase.from("direct_messages").insert({ sender_id: senderId, recipient_id: recipientId, body });
  if (error) console.warn("Could not send notification reply:", error.message);
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
