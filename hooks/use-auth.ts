import { supabase } from "@/lib/supabase";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

export type SocialUser = {
  id: string;
  openId: string;
  name: string;
  email: string;
  loginMethod: "email" | "oauth";
  lastSignedIn: Date;
};

type UseAuthOptions = {
  autoFetch?: boolean;
};

function mapUser(user: SupabaseUser, session?: Session | null): SocialUser {
  const metadata = user.user_metadata ?? {};
  const email = user.email ?? "";
  const displayName =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) ||
    email.split("@")[0] ||
    "Usuario";

  return {
    id: user.id,
    openId: user.id,
    name: displayName,
    email,
    loginMethod: metadata.provider && metadata.provider !== "email" ? "oauth" : "email",
    lastSignedIn: new Date(session?.user.last_sign_in_at ?? user.last_sign_in_at ?? Date.now()),
  };
}

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const [user, setUser] = useState<SocialUser | null>(null);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<Error | null>(null);

  const applySession = useCallback((session: Session | null) => {
    setUser(session?.user ? mapUser(session.user, session) : null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      applySession(data.session);
    } catch (cause) {
      const nextError = cause instanceof Error ? cause : new Error("No se pudo comprobar la sesión");
      setError(nextError);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  const logout = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError);
      throw signOutError;
    }
    setUser(null);
  }, []);

  useEffect(() => {
    if (!autoFetch) {
      setLoading(false);
      return;
    }

    void refresh();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, [applySession, autoFetch, refresh]);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  return {
    user,
    loading,
    error,
    isAuthenticated,
    refresh,
    logout,
  };
}
