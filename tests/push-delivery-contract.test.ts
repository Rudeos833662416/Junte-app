import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const clientSource = readFileSync(resolve(process.cwd(), "lib/push-notifications.ts"), "utf8");
const functionSource = readFileSync(resolve(process.cwd(), "supabase/functions/notify-activity/index.ts"), "utf8");
const onboardingSource = readFileSync(resolve(process.cwd(), "components/permissions-onboarding.tsx"), "utf8");
const layoutSource = readFileSync(resolve(process.cwd(), "app/_layout.tsx"), "utf8");

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
  });
});
