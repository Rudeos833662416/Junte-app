import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

type AppRefreshContextValue = {
  revision: number;
  refreshNow: () => void;
};

const AppRefreshContext = createContext<AppRefreshContextValue>({
  revision: 0,
  refreshNow: () => undefined,
});

/**
 * Increments a lightweight revision whenever the app returns to the foreground.
 * Screens that read this value re-fetch their Supabase data without requiring a logout,
 * a restart, or manual navigation away and back.
 */
export function AppRefreshProvider({ children }: { children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastRefreshAt = useRef(0);

  const refreshNow = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAt.current < 1_000) return;
    lastRefreshAt.current = now;
    setRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const cameBackToForeground = appState.current !== "active" && nextState === "active";
      appState.current = nextState;
      if (cameBackToForeground) refreshNow();
    });
    const interval = setInterval(() => {
      if (appState.current === "active") refreshNow();
    }, 20_000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [refreshNow]);

  return <AppRefreshContext.Provider value={{ revision, refreshNow }}>{children}</AppRefreshContext.Provider>;
}

export function useAppRefresh() {
  return useContext(AppRefreshContext);
}
