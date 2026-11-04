import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

const EAS_PROJECT_ID_FALLBACK = "a595b360-16d9-40e4-9df4-7a3630257f39";

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
  await Notifications.setNotificationChannelAsync("friend-activity-v4", {
    name: "Actividad de amigos",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF231F7C",
    sound: "default",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** Request permission, get Expo+FCM tokens, UPSERT into public.push_tokens. */
export async function registerForPushNotificationsAsync(userId?: string | null) {
  if (!canUseNativeNotifications()) {
    console.log("[push] Simulator/web — push nativo no disponible");
    return null;
  }

  try {
    await ensureAndroidNotificationChannel();

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
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
      EAS_PROJECT_ID_FALLBACK;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    if (!token) {
      console.warn("[push] Empty Expo push token");
      return null;
    }

    let fcmToken: string | null = null;
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      if (deviceToken?.data && typeof deviceToken.data === "string") {
        fcmToken = deviceToken.data;
      }
    } catch (error) {
      console.warn("[push] FCM device token unavailable:", error);
    }

    let uid = userId ?? null;
    if (!uid) {
      const { data } = await supabase.auth.getSession();
      uid = data.session?.user?.id ?? null;
    }
    if (!uid) {
      console.warn("[push] No authenticated user — token not saved");
      return token;
    }

    const platform = Platform.OS === "ios" ? "ios" : "android";
    const payload = {
      user_id: uid,
      expo_push_token: token,
      fcm_token: fcmToken,
      platform,
      updated_at: new Date().toISOString(),
    };

    // Prefer unique (user_id, platform); fall back to expo_push_token unique
    let error = (await supabase.from("push_tokens").upsert(payload, {
      onConflict: "user_id,platform",
    })).error;

    if (error) {
      console.warn("[push] upsert user_id,platform failed:", error.message);
      error = (await supabase.from("push_tokens").upsert(payload, {
        onConflict: "expo_push_token",
      })).error;
    }
    if (error) {
      console.warn("[push] upsert expo_push_token failed:", error.message);
      const { error: insErr } = await supabase.from("push_tokens").insert(payload);
      if (insErr) {
        console.warn("[push] insert failed:", insErr.message);
        return null;
      }
    }

    console.log("[push] Token saved", platform, "fcm=", Boolean(fcmToken));
    return token;
  } catch (error) {
    console.warn("[push] Registration error:", error);
    return null;
  }
}

export async function registerNotificationCategories() {
  if (!canUseNativeNotifications()) return;
  try {
    await Notifications.setNotificationCategoryAsync("CHAT_MESSAGE_V2", [
      {
        identifier: "REPLY",
        buttonTitle: "Responder",
        textInput: { submitButtonTitle: "Enviar", placeholder: "Escribe un mensaje..." },
        options: { opensAppToForeground: false },
      },
      {
        identifier: "MARK_READ",
        buttonTitle: "Marcar leído",
        options: { opensAppToForeground: false },
      },
    ]);
    await Notifications.setNotificationCategoryAsync("FRIEND_REQUEST", [
      { identifier: "ACCEPT", buttonTitle: "Aceptar", options: { opensAppToForeground: false } },
      { identifier: "REJECT", buttonTitle: "Rechazar", options: { isDestructive: true, opensAppToForeground: false } },
    ]);
    await Notifications.setNotificationCategoryAsync("BRINDAR_ACTIVITY", [
      { identifier: "BRINDAR_REPLY_VOY", buttonTitle: "¡Voy!", options: { opensAppToForeground: false } },
      { identifier: "BRINDAR_REPLY_SALUD", buttonTitle: "¡Salud!", options: { opensAppToForeground: false } },
      {
        identifier: "BRINDAR_REPLY_CUSTOM",
        buttonTitle: "Responder",
        textInput: { submitButtonTitle: "Enviar", placeholder: "Escribe tu respuesta..." },
        options: { opensAppToForeground: false },
      },
    ]);
  } catch (error) {
    console.warn("[push] Categories error:", error);
  }
}

export function getPushData(notification: Notifications.Notification) {
  return (notification.request.content.data ?? {}) as Record<string, unknown>;
}

export function getActionFromResponse(response: Notifications.NotificationResponse) {
  return {
    actionIdentifier: response.actionIdentifier,
    userText: response.userText,
    data: getPushData(response.notification),
  };
}

export function mapBrindarActionToReaction(identifier: string) {
  const reactions: Record<string, string> = {
    BRINDAR_REPLY_VOY: "🚀",
    BRINDAR_REPLY_SALUD: "🍻",
    BRINDAR_REPLY_CERCA: "🔥",
    BRINDAR_REPLY_HEART: "❤️",
  };
  return reactions[identifier] ?? null;
}
