import { useEffect } from "react";

export function PushRegistrar() {
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const push = await import("@/lib/push-notifications");
        const { supabase } = await import("@/lib/supabase");
        try { push.setupNotificationHandler(); } catch {}

        const run = async (userId?: string | null) => {
          if (cancelled || !userId) return;
          try {
            await push.registerNotificationCategories().catch(() => {});
            await push.registerForPushNotificationsAsync(userId);
          } catch (e) {
            console.warn("[push] register failed", e);
          }
        };

        const { data } = await supabase.auth.getSession();
        if (data.session?.user?.id) await run(data.session.user.id);

        const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
          if (session?.user?.id) run(session.user.id);
        });
        unsub = () => sub.subscription.unsubscribe();
      } catch (e) {
        console.warn("[push] init failed", e);
      }
    })();

    return () => {
      cancelled = true;
      try { unsub?.(); } catch {}
    };
  }, []);

  return null;
}

export default PushRegistrar;
