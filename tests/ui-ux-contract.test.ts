import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screens = [
  "app/(tabs)/friends.tsx",
  "app/(tabs)/activity.tsx",
  "app/(tabs)/stories.tsx",
  "app/(tabs)/profile.tsx",
  "app/profile/[id].tsx",
];
const friendsSource = readFileSync("app/(tabs)/friends.tsx", "utf8");
const scannerSource = readFileSync("app/scan-qr.tsx", "utf8");
const mapRouteSource = readFileSync("app/(tabs)/map.tsx", "utf8");
const activitySource = readFileSync("app/(tabs)/activity.tsx", "utf8");
const loginSource = readFileSync("app/login.tsx", "utf8");
const callbackSource = readFileSync("app/auth/callback.tsx", "utf8");
const permissionsSource = readFileSync("components/permissions-onboarding.tsx", "utf8");
const chatSource = readFileSync("app/chat/[id].tsx", "utf8");
const messagesSource = readFileSync("app/messages/index.tsx", "utf8");

describe("contratos UX transversales", () => {
  it("mantiene refresh manual y feedback accesible en las superficies sociales", () => {
    for (const file of screens) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("RefreshControl");
      expect(source, file).toContain("accessibilityLabel");
      expect(source, file).toContain("isRefreshing");
    }
  });

	it("mantiene reintento accionable y touch targets de 44dp", () => {
    for (const file of screens.slice(0, 4)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("Reintentar");
      expect(source, file).toMatch(/minHeight: 44|minWidth: 44/);
    }
	});

	it("mantiene un único contrato QR de perfil", () => {
		expect(friendsSource).toContain("socialsip://profile/");
		expect(friendsSource).not.toContain("tragos://profile/");
		expect(scannerSource).toContain('parsed.protocol === "socialsip:"');
	});

	it("expone la pantalla funcional del mapa en la ruta activa", () => {
		expect(mapRouteSource).toContain("SocialMapScreen");
		expect(mapRouteSource).not.toContain("NativeMap");
	});

	it("protege mutaciones de solicitudes y conserva datos ante errores", () => {
		expect(friendsSource).toContain("respondingRequestId");
		expect(friendsSource).toContain("disabled={respondingRequestId === request.id}");
		expect(friendsSource).toContain("requestsError");
		expect(friendsSource).toContain("No se pudieron buscar personas cercanas.");
	});

	it("no convierte una recarga fallida de Actividad en una lista vacía", () => {
		expect(activitySource).toContain("No se pudo actualizar la actividad");
		expect(activitySource).toContain("Conservamos las novedades anteriores");
	});

	it("mantiene estados terminales y reintento seguro en autenticación y permisos", () => {
		expect(loginSource).toContain("accessibilityLabel=\"Email\"");
		expect(loginSource).toContain("No se pudo completar el acceso. Revisa tus datos e inténtalo de nuevo.");
		expect(callbackSource).toContain("clearTimeout(timeoutRef.current)");
		expect(callbackSource).toContain("status === \"error\"");
		expect(permissionsSource).toContain("isProcessing");
		expect(permissionsSource).toContain("No se pudo obtener el permiso de ubicación.");
	});

	it("distingue error de carga de chat y bandeja vacía", () => {
		expect(chatSource).toContain("No se pudo actualizar la conversación");
		expect(chatSource).toContain("Conservamos los mensajes anteriores");
		expect(chatSource).toContain('accessibilityLabel="Mensaje"');
		expect(messagesSource).toContain("No se pudo actualizar tus mensajes");
		expect(messagesSource).toContain("Reintentar");
	});
});
