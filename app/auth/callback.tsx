import { ScreenContainer } from "@/components/screen-container";
import { completeSupabaseAuthUrl, supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

export default function SupabaseAuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [message, setMessage] = useState("Confirmando tu cuenta…");

  useEffect(() => {
    let cancelled = false;

    const completeAuth = async () => {
      if (params.error_description) {
        setMessage(params.error_description);
        return;
      }

      const currentUrl = `socialsip://auth/callback${params.code ? `?code=${encodeURIComponent(params.code)}` : ""}`;
      try {
        await completeSupabaseAuthUrl(currentUrl);
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : "No se pudo confirmar la sesión.");
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setMessage(error?.message ?? "No se pudo confirmar la sesión.");
        return;
      }

      if (!cancelled) {
        setMessage("Cuenta confirmada. Abriendo Tragos Sociales…");
        setTimeout(() => router.replace("/(tabs)"), 400);
      }
    };

    void completeAuth();
    return () => {
      cancelled = true;
    };
  }, [params.code, params.error_description, router]);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View className="flex-1 items-center justify-center gap-4 px-8">
        <ActivityIndicator size="large" />
        <Text className="text-center text-base text-foreground">{message}</Text>
      </View>
    </ScreenContainer>
  );
}
