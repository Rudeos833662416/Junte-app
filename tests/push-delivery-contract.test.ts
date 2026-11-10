import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const clientSource = readFileSync(resolve(process.cwd(), "lib/push-notifications.ts"), "utf8");
const functionSource = readFileSync(resolve(process.cwd(), "supabase/functions/notify-activity/index.ts"), "utf8");
const onboardingSource = readFileSync(resolve(process.cwd(), "components/permissions-onboarding.tsx"), "utf8");
const layoutSource = readFileSync(resolve(process.cwd(), "app/_layout.tsx"), "utf8");
const migrationSource = readFileSync(resolve(process.cwd(), "supabase/migrations/0042_friend_controls_and_push_guards.sql"), "utf8");

describe("contrato de entrega push", () => {
  it("persiste un diagnóstico por etapa y expone cómo recuperar el último error", () => {
    expect(clientSource).toContain("getPushRegistrationDiagnostic");
    expect(clientSource).toContain("savePushDiagnostic");
    expect(clientSource).toContain('stage: "permission"');
    expect(clientSource).toContain('stage = "supabase"');
    expect(clientSource).toContain('stage = "expo_token"');
  });

  it("reintenta al volver la app a primer plano", () => {
    expect(layoutSource).toContain("AppState.addEventListener");
    expect(layoutSource).toContain('nextState === "active"');
    expect(layoutSource).toContain("registerPushNotifications(user.id)");
  });

  it("configura el handler de presentación antes de registrar el token", () => {
    expect(layoutSource).toContain("setupNotificationHandler");
    expect(layoutSource).toContain("setupNotificationHandler();");
    expect(clientSource).toContain("safeSetNotificationCategory");
  });

  it("muestra al usuario dónde falló el registro y permite reintentarlo", () => {
    expect(onboardingSource).toContain("getPushRegistrationDiagnostic");
    expect(onboardingSource).toContain("Alert.alert");
    expect(onboardingSource).toContain("Reintentar");
  });

	it("envía contenido visible también para acciones interactivas", () => {
		expect(functionSource).toContain("title:");
		expect(functionSource).toContain("body,");
    expect(functionSource).toContain('sound: "default"');
    expect(functionSource).toContain('channelId: "friend-activity-v4"');
    expect(functionSource).toContain("categoryId");
    expect(functionSource).not.toContain('...(isInteractive ? { _contentAvailable: true, data }');
    expect(functionSource).toContain("richContent");
		expect(functionSource).toContain("isInteractive");
		expect(functionSource).toContain("android: {");
		expect(functionSource).toContain("actions:");
		expect(functionSource).toContain("avatarUrl");
	});

  it("protege la audiencia de brindis y permite controles de amistad", () => {
    expect(migrationSource).toContain("friendships_delete_related");
    expect(migrationSource).toContain("friendship_blocked");
    expect(migrationSource).toContain("<> new.user_id");
  });

	it("acepta o rechaza solicitudes desde el push y abre el perfil al tocarlo", () => {
    expect(clientSource).toContain('identifier: "ACCEPT_FRIEND"');
    expect(clientSource).toContain('identifier: "REJECT_FRIEND"');
    expect(layoutSource).toContain('response.actionIdentifier === "ACCEPT_FRIEND"');
    expect(layoutSource).toContain('response.actionIdentifier === "REJECT_FRIEND"');
    expect(layoutSource).toContain("Notifications.DEFAULT_ACTION_IDENTIFIER");
		expect(layoutSource).toContain("const route = routeForNotification(data)");
		expect(layoutSource).toContain("if (route) router.push(route as never)");
	});

	it("expone desbloqueo persistente y un único acceso para conectar por QR", () => {
		const profileSource = readFileSync(resolve(process.cwd(), "app/profile/[id].tsx"), "utf8");
		const friendsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/friends.tsx"), "utf8");
		expect(profileSource).toContain("unblockUser");
		expect(profileSource).toContain('.delete()');
		expect(profileSource).toContain("Desbloquear");
		expect(friendsSource).toContain("Conectar con QR");
		expect(friendsSource).toContain("Escanear QR");
		expect(friendsSource).not.toContain("Mostrar mi QR");
	});
});
