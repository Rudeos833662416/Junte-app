import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const stories = readFileSync(resolve(root, "app/(tabs)/stories.tsx"), "utf8");
const friends = readFileSync(resolve(root, "app/(tabs)/friends.tsx"), "utf8");
const profile = readFileSync(resolve(root, "app/profile/[id].tsx"), "utf8");
const drinkCircle = readFileSync(resolve(root, "components/drink-circle.tsx"), "utf8");

describe("mejoras confirmadas en la grabación", () => {
  it("permite estados de video de hasta cinco minutos con validación visible", () => {
    expect(stories).toContain("MAX_STORY_DURATION_SECONDS = 300");
    expect(stories).toContain("videoMaxDuration: MAX_STORY_DURATION_SECONDS");
    expect(stories).toContain("300 segundos");
  });

	it("usa un compositor de estado a pantalla completa y precarga el visor", () => {
		expect(stories).toContain('presentationStyle="fullScreen"');
		expect(stories).toContain("prefetch");
		expect(stories).toContain("transition={120}");
		expect(stories).toContain("onSwipeUp");
	});

	it("espera al primer frame y aísla el ciclo de vida del reproductor", () => {
		expect(stories).toContain("onFirstFrameRender={onReady}");
		expect(stories).toContain('key={`story-video-${activeStory.id}`}');
		expect(stories).toContain("try { player.play(); }");
		expect(stories).toContain("try { player.pause(); }");
	});

	it("limpia el timer de pulsación larga al desmontar el visor", () => {
		expect(stories).toContain("clearTimeout(longPressTimerRef.current)");
		expect(stories).toContain("longPressTimerRef.current = null");
	});

  it("cierra el visor al perder foco y consume el deep link una sola vez", () => {
    expect(stories).toContain("useFocusEffect");
    expect(stories).toContain("setActiveGroupIndex(null);");
    expect(stories).toContain("requestedUserConsumedRef");
    expect(stories).toContain('router.replace("/(tabs)/stories")');
  });

  it("elimina la acción QR redundante y conserva una acción explícita para escanear", () => {
    expect(friends).toContain("Escanear QR");
    expect(friends).not.toContain("Mostrar mi QR");
  });

	it("verifica que bloquear haya sido persistido por Supabase", () => {
		expect(profile).toContain("set_friendship_status");
		expect(profile).toContain("status: \"blocked\"");
		expect(profile).toContain("friendship_not_found_or_forbidden");
		expect(profile).toContain("La amistad ya no está disponible");
	});

  it("mantiene contraste explícito en el control principal de Inicio", () => {
    expect(drinkCircle).toContain("colors.onPrimary");
  });
});
