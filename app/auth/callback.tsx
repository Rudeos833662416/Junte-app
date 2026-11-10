import { ScreenContainer } from "@/components/screen-container";
import { completeSupabaseAuthUrl, supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

function callbackErrorMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (message.includes("network") || message.includes("fetch")) return "No hay conexión estable. Revisa internet e inténtalo de nuevo.";
  if (message.includes("expired") || message.includes("invalid")) return "El enlace ya no es válido. Solicita uno nuevo e inténtalo otra vez.";
  return "No se pudo confirmar la sesión. Vuelve a intentarlo.";
}

export default function SupabaseAuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("Confirmando tu cuenta…");

  useEffect(() => {
    let cancelled = false;

    const completeAuth = async () => {
      if (params.error_description) {
        setStatus("error");
        setMessage("El enlace de confirmación no es válido o ya expiró.");
        return;
      }
      if (!params.code) {
        setStatus("error");
        setMessage("El enlace de confirmación está incompleto. Solicita uno nuevo.");
        return;
      }

      const currentUrl = `socialsip://auth/callback?code=${encodeURIComponent(params.code)}`;
      try {
        await completeSupabaseAuthUrl(currentUrl);
      } catch (cause) {
        setStatus("error");
        setMessage(callbackErrorMessage(cause));
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setStatus("error");
        setMessage(error ? callbackErrorMessage(error) : "No se pudo confirmar la sesión. Vuelve a intentarlo.");
        return;
      }

      if (!cancelled) {
        setStatus("success");
        setMessage("Cuenta confirmada. Abriendo Junta2…");
        timeoutRef.current = setTimeout(() => {
          if (!cancelled) router.replace("/(tabs)");
        }, 400);
      }
    };

    void completeAuth();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };
  }, [params.code, params.error_description, router]);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View className="flex-1 items-center justify-center gap-4 px-8">
        {status === "processing" ? <ActivityIndicator size="large" /> : null}
        <Text accessibilityRole={status === "error" ? "alert" : undefined} className="text-center text-base text-foreground">{message}</Text>
        {status === "error" ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Volver al inicio de sesión" onPress={() => router.replace("/login")} style={{ minHeight: 48, minWidth: 180, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#FF5A00" }}>
            <Text style={{ color: "#17130F", fontWeight: "800" }}>Volver al inicio</Text>
          </Pressable>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
