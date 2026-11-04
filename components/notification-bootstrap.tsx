import { useEffect } from "react";
import {
  registerForPushNotificationsAsync,
  setupNotificationHandler,
  registerNotificationCategories,
} from "@/lib/push-notifications";
import { supabase } from "@/lib/supabase";

/**
 * Registers Expo/FCM push tokens when the user signs in.
 * Mount once near the root of the app.
 */
export function NotificationBootstrap() {
  useEffect(() => {
    setupNotificationHandler();
    let cancelled = false;

    const run = async (userId?: string | null) => {
      if (cancelled) return;
      try {
        await registerNotificationCategories();
        await registerForPushNotificationsAsync(userId);
      } catch (e) {
        console.warn("[push] bootstrap error", e);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.id) run(data.session.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) run(session.user.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}

export default NotificationBootstrap;
