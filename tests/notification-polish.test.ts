import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const clientSource = readFileSync(resolve(process.cwd(), "lib/push-notifications.ts"), "utf8");
const layoutSource = readFileSync(resolve(process.cwd(), "app/_layout.tsx"), "utf8");
const functionSource = readFileSync(resolve(process.cwd(), "supabase/functions/notify-activity/index.ts"), "utf8");
const chatSource = readFileSync(resolve(process.cwd(), "app/chat/[id].tsx"), "utf8");
const audioMigrationSource = readFileSync(resolve(process.cwd(), "supabase/migrations/0063_chat_voice_mime_types.sql"), "utf8");

describe("pulido de notificaciones", () => {
  it("define un canal Android de alta prioridad exclusivo para chat", () => {
    expect(clientSource).toContain('CHAT_PUSH_CHANNEL_ID = "direct-messages-v1"');
    expect(clientSource).toContain("setActiveChatId");
    expect(clientSource).toContain("shouldShowBanner: !isActiveChat");
    expect(chatSource).toContain("setActiveChatId");
  });

  it("publica y procesa la acción de marcar el chat como leído", () => {
    expect(clientSource).toContain('identifier: "CHAT_MARK_READ"');
    expect(functionSource).toContain('["CHAT_REPLY", "CHAT_MARK_READ"]');
    expect(layoutSource).toContain('response.actionIdentifier === "CHAT_MARK_READ"');
    expect(layoutSource).toContain('action: "mark_read"');
  });

  it("acepta los MIME que Expo Audio puede producir", () => {
    expect(audioMigrationSource).toContain("audio/mpeg");
    expect(audioMigrationSource).toContain("audio/x-m4a");
    expect(audioMigrationSource).toContain("audio/ogg");
  });

  it("descarta la notificación al aceptar o rechazar una solicitud", () => {
    expect(layoutSource).toContain("dismissNotificationAsync");
    expect(layoutSource).toContain('response.actionIdentifier === "ACCEPT_FRIEND"');
    expect(layoutSource).toContain('response.actionIdentifier === "REJECT_FRIEND"');
  });

  it("usa el remitente oficial Junta2_Oficial y conserva el post específico", () => {
    expect(functionSource).toContain('"Junta2_Oficial"');
    expect(functionSource).toContain("postId:");
    expect(functionSource).toContain('screen: isDirectMessage ? "chat" : isOfficialPost || isCommentReply ? "events"');
  });
});
