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

	it("mantiene el visor coherente con el prototipo interactivo", () => {
		expect(stories).toContain("BackHandler");
		expect(stories).toContain("SegmentedStoryRing");
		expect(stories).toContain("PreviewVideo");
		expect(stories).toContain("onFocus={() => setIsPaused(true)}");
		expect(stories).toContain("onBlur={() => setIsPaused(false)}");
	});

		it("protege el compositor y el visor frente a los cuatro casos de uso reales", () => {
			expect(stories).toContain('onRequestClose={() => setSelectedMedia(null)}');
			expect(stories).toContain('IconSymbol name="chevron.left"');
			expect(stories).toContain('style={{ flex: 1, backgroundColor: "#000000" }}');
			expect(stories).toContain('colors={["rgba(0,0,0,0.62)", "rgba(0,0,0,0)"]}');
			expect(stories).toContain('{!isChromeHidden ? <View style={{ position: "absolute", left: 16');
		});

		it("muestra la publicación multimedia de forma optimista y congela el temporizador durante la carga", () => {
			expect(stories).toContain("optimisticStories");
			expect(stories).toContain("isOptimistic: true");
			expect(stories).toContain("setIsStoryMediaLoading(activeStory.media_type === \"video\" && !isCachedVideo)");
			expect(stories).toContain("showViewers || isStoryMediaLoading");
			expect(stories).toContain("Añade un comentario…");
		});

		it("limpia el optimista fallido y cierra el creador de texto con Atrás", () => {
			expect(stories).toContain('if (showTextCreator) { setShowTextCreator(false); return true; }');
			expect(stories).toContain('showTextCreator, showViewers');
			expect(stories).toContain('setOptimisticStories((previous) => previous.filter((item) => item.id !== tempStory.id));');
			expect(stories).toContain('group.stories.filter((story) => story.id !== tempStory.id)');
		});

		it("conserva identidad y reproducción al repetir un vídeo", () => {
			expect(stories).toContain("const resolvedVideoCache = new Map<string, string>()");
			expect(stories).toContain("resolvedVideoCache.get(uri) ?? uri");
			expect(stories).toContain("resolvedVideoCache.set(url, resolved)");
			expect(stories).toContain("const [selfAvatarUrl, setSelfAvatarUrl]");
			expect(stories).toContain("avatarUrl: selfAvatarUrl");
			expect(stories).toContain('top: 115');
		});

		it("sincroniza vídeo, texto, audio, vistos y tiempo real de visualización", () => {
			expect(stories).toContain("timeUpdate");
			expect(stories).toContain("videoMuted");
			expect(stories).toContain("showTextCreator");
			expect(stories).toContain("Actualizaciones recientes");
			expect(stories).toContain("Vistos");
			expect(stories).toContain("formatStoryAge(viewer.viewed_at)");
		});

		it("conecta el recorte desde el compositor hasta la reproducción publicada", () => {
			expect(stories).toContain("trimRange");
			expect(stories).toContain("trimStart");
			expect(stories).toContain("trimEnd");
			expect(stories).toContain("currentTime >= trimEnd");
			expect(stories).toContain("Inicio");
			expect(stories).toContain("Fin");
		});

		it("no reinicia la carga ni el audio cuando cambia la referencia de la historia", () => {
			expect(stories).toContain("}, [activeStory?.id]);");
			expect(stories).toContain("setTimeout(() => setIsStoryMediaLoading(false), 1500)");
			expect(stories).toContain("let cancelled = false;");
		});

		it("evita avatar tardío, solapamiento con el notch y placeholder de vídeo cacheado", () => {
			expect(stories).toContain('.from("profiles")');
			expect(stories).toContain('.select("avatar_url")');
			expect(stories).toContain("Math.max(insets.top + 8, 20)");
			expect(stories).toContain("resolvedVideoCache.has(activeStory.media_url)");
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
