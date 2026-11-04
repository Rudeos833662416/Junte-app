import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { useAuth } from "@/hooks/use-auth";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { AppRefreshProvider } from "@/lib/app-refresh";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import {
  reactionFromNotificationAction,
  registerPushNotifications,
  saveNotificationReaction,
  respondToFriendRequest,
  sendDirectMessage,
  quickBrindarMessage,
  invokeNotificationAction,
} from "@/lib/push-notifications";
import { PermissionsOnboarding } from "@/components/permissions-onboarding";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AppRefreshProvider>
            <AuthGate />
            <StatusBar style="auto" />
          </AppRefreshProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const firstSegment = segments[0] as string | undefined;
  const isAuthRoute = firstSegment === "login" || firstSegment === "oauth" || firstSegment === "auth";

  useEffect(() => {
    if (loading) return;
    if (!user && !isAuthRoute) {
      router.replace("/login" as never);
      return;
    }
    if (user && firstSegment === "login") {
      router.replace("/(tabs)");
    }
  }, [firstSegment, isAuthRoute, loading, router, user]);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    let disposed = false;
    let responseSubscription: { remove: () => void } | null = null;

    void registerPushNotifications(user.id).catch((error) => {
      if (!disposed) console.warn("Push notifications unavailable:", error);
    });

    void import("expo-notifications").then((Notifications) => {
      if (disposed) return;
      const handleNotificationResponse = (response: import("expo-notifications").NotificationResponse) => {
        const data = response.notification.request.content.data as {
          activityId?: string;
          friendshipId?: string;
          senderId?: string;
          chatId?: string;
          actionToken?: string;
        };
        const actionToken = data.actionToken;
        const reaction = reactionFromNotificationAction(response.actionIdentifier);
        if (data.activityId && reaction) void saveNotificationReaction(data.activityId, reaction, user.id);

        if (response.actionIdentifier === "ACCEPT_FRIEND") {
          void (async () => {
            const edge = await invokeNotificationAction({ actionToken, action: "friend_accept" });
            if (!edge.ok && data.friendshipId) {
              await respondToFriendRequest(data.friendshipId, "accepted", user.id);
            }
          })();
        }
        if (response.actionIdentifier === "REJECT_FRIEND") {
          void (async () => {
            const edge = await invokeNotificationAction({ actionToken, action: "friend_reject" });
            if (!edge.ok && data.friendshipId) {
              await respondToFriendRequest(data.friendshipId, "blocked", user.id);
            }
          })();
        }

        if (response.actionIdentifier === "CHAT_REPLY" && response.userText?.trim() && data.senderId) {
          const body = response.userText.trim();
          void (async () => {
            const clientMessageId =
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : undefined;
            const edge = await invokeNotificationAction({
              actionToken,
              action: "reply",
              body,
              clientMessageId,
            });
            if (!edge.ok) {
              await sendDirectMessage(user.id, data.senderId!, body, clientMessageId);
            }
          })();
        }

        const quickMessage = quickBrindarMessage(response.actionIdentifier);
        if (data.senderId && quickMessage) {
          void (async () => {
            const edge = await invokeNotificationAction({
              actionToken,
              action: "brindar_reply",
              body: quickMessage,
            });
            if (!edge.ok) {
              await sendDirectMessage(user.id, data.senderId!, quickMessage);
            }
          })();
        }
      };
      responseSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!disposed && response) handleNotificationResponse(response);
      });
    }).catch(() => undefined);

    return () => {
      disposed = true;
      responseSubscription?.remove();
    };
  }, [user?.id]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background">
        <ActivityIndicator size="large" />
        <Text className="text-sm text-muted">Comprobando tu sesión…</Text>
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="oauth/callback" />
        <Stack.Screen name="auth/callback" />
      </Stack>
      {user ? <PermissionsOnboarding /> : null}
    </>
  );
}
