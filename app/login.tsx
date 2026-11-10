import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { completeSupabaseAuthUrl, SUPABASE_AUTH_REDIRECT, supabase } from "@/lib/supabase";
import { BrandBackdrop } from "@/components/brand-backdrop";
import { useThemeContext } from "@/lib/theme-provider";
import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

if (Platform.OS === "web") {
  WebBrowser.maybeCompleteAuthSession();
}

function authErrorMessage(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (message.includes("invalid login credentials")) return "El email o la contraseña no son correctos.";
  if (message.includes("email not confirmed")) return "Confirma tu email antes de iniciar sesión.";
  if (message.includes("cancel")) return "El inicio de sesión fue cancelado.";
  if (message.includes("network") || message.includes("fetch")) return "No hay conexión estable. Revisa internet e inténtalo de nuevo.";
  return fallback;
}

export default function LoginScreen() {
  const colors = useColors();
  const { colorScheme } = useThemeContext();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: SUPABASE_AUTH_REDIRECT,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error("Supabase no devolvió la URL de Google.");

      const result = await WebBrowser.openAuthSessionAsync(data.url, SUPABASE_AUTH_REDIRECT);
      if (result.type === "success" && result.url) {
        await completeSupabaseAuthUrl(result.url);
      } else if (result.type !== "success") {
        setErrorMessage("El inicio de sesión con Google fue cancelado.");
      }
    } catch (cause) {
      setErrorMessage(authErrorMessage(cause, "No se pudo iniciar sesión con Google. Inténtalo de nuevo."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || password.length < 6 || (mode === "signup" && name.trim().length < 2)) {
      setErrorMessage(
        mode === "signup"
          ? "Introduce tu nombre, un email válido y una contraseña de al menos 6 caracteres."
          : "Introduce tu email y una contraseña de al menos 6 caracteres.",
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: SUPABASE_AUTH_REDIRECT,
          },
        });
        if (error) throw error;
        if (!data.session) {
          Alert.alert("Revisa tu correo", "Supabase ha enviado un enlace para confirmar tu cuenta.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
      }
    } catch (cause) {
      setErrorMessage(authErrorMessage(cause, "No se pudo completar el acceso. Revisa tus datos e inténtalo de nuevo."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-6">
      <BrandBackdrop>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingVertical: 40, justifyContent: "center" }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View className="items-center">
          <Image
            source={colorScheme === "light" ? require("@/assets/brand/wordmark-light.png") : require("@/assets/brand/wordmark-dark.png")}
            accessibilityLabel="Junta2"
            resizeMode="contain"
            style={{ width: 248, height: 116 }}
          />
          <Text className="-mt-1 text-sm font-bold uppercase tracking-[2px] text-primary">Tus panas, tu plan, tu junte</Text>
          <Text className="mt-3 max-w-xs text-center text-base leading-6 text-muted">
            Conecta con tus panas, descubre planes y brinda juntos.
          </Text>
        </View>

        <View className="gap-4">

          {mode === "signup" ? (
            <TextInput
              accessibilityLabel="Nombre"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="Nombre"
              placeholderTextColor={colors.muted}
              className="rounded-xl border bg-surface px-4 py-3 text-foreground"
              style={{ borderColor: colors.border }}
            />
          ) : null}
          <TextInput
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor={colors.muted}
            className="rounded-xl border bg-surface px-4 py-3 text-foreground"
            style={{ borderColor: colors.border }}
          />
          <View className="relative">
            <TextInput
              accessibilityLabel="Contraseña"
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoComplete={mode === "signup" ? "new-password" : "password"}
              secureTextEntry={!showPassword}
              placeholder="Contraseña"
              placeholderTextColor={colors.muted}
              className="rounded-xl border bg-surface px-4 py-3 pr-12 text-foreground"
              style={{ borderColor: colors.border }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onPress={() => setShowPassword((current) => !current)}
              style={({ pressed }) => [
                {
                  position: "absolute",
                  right: 8,
                  top: 0,
                  bottom: 0,
                  width: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.55 : 1,
                },
              ]}
            >
              <IconSymbol
                name={showPassword ? "eye.slash.fill" : "eye.fill"}
                size={21}
                color={colors.muted}
              />
            </Pressable>
          </View>

          {errorMessage ? (
            <View accessibilityRole="alert" className="rounded-xl border border-error/30 bg-error/10 p-4">
              <Text className="text-sm leading-5 text-error">{errorMessage}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            disabled={isSubmitting}
            onPress={handleSubmit}
            style={({ pressed }) => [
              {
                minHeight: 56,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 18,
                backgroundColor: colors.primary,
                opacity: isSubmitting ? 0.7 : pressed ? 0.88 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            {isSubmitting ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold" style={{ color: colors.onPrimary }}>{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</Text>}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continuar con Google"
            onPress={handleGoogleLogin}
            disabled={isSubmitting}
            style={({ pressed }) => [
              {
                minHeight: 50,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                opacity: isSubmitting ? 0.55 : pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text className="text-base font-semibold text-foreground">Continuar con Google</Text>
          </Pressable>

          <Pressable accessibilityRole="button" accessibilityLabel={mode === "login" ? "Crear una cuenta" : "Volver a iniciar sesión"} onPress={() => { setMode(mode === "login" ? "signup" : "login"); setErrorMessage(null); }}>
            <Text className="text-center text-sm font-semibold" style={{ color: colors.primary }}>
              {mode === "login" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Iniciar sesión"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      </BrandBackdrop>
    </ScreenContainer>
  );
}
