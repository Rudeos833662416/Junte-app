import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("sistema de marca Junta2", () => {
  it("usa los colores del manual de marca", () => {
    const theme = readFileSync(resolve(root, "theme.config.js"), "utf8");
    expect(theme).toContain("#FC4C02");
    expect(theme).toContain("#FF7A18");
    expect(theme).toContain("#FFF1D0");
    expect(theme).toContain("#0A0A0A");
  });

  it("mantiene icono, isotipo adaptativo y splash oficiales", () => {
    for (const asset of [
      "assets/brand/icon.png",
      "assets/brand/wordmark.png",
      "assets/brand/wordmark-light.png",
      "assets/brand/wordmark-dark.png",
      "assets/brand/adaptive-foreground.png",
      "assets/brand/adaptive-monochrome.png",
      "assets/brand/splash.png",
    ]) {
      expect(existsSync(resolve(root, asset)), asset).toBe(true);
    }
    const config = readFileSync(resolve(root, "app.config.ts"), "utf8");
    expect(config).toContain('icon: "./assets/brand/icon.png"');
    expect(config).toContain('foregroundImage: "./assets/brand/adaptive-foreground.png"');
    expect(config).toContain('image: "./assets/brand/splash.png"');
  });

  it("expone una interacción de marca rápida y respetuosa con reduced motion", () => {
    const css = readFileSync(resolve(root, "global.css"), "utf8");
    expect(css).toContain("--ease-brand");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("scale(0.975)");
  });
});
