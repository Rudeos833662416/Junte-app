import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chat = readFileSync("app/chat/[id].tsx", "utf8");
const stories = readFileSync("app/(tabs)/stories.tsx", "utf8");

describe("Phase 6 chat and story action contracts", () => {
  it("edits and deletes only messages owned by the authenticated sender", () => {
    expect(chat).toContain("message.sender_id !== user.id");
    expect(chat).toContain('.update({ body: body.trim(), edited_at: editedAt })');
    expect(chat).toContain('.update({ body: "", deleted_at: deletedAt })');
  });

  it("keeps message reactions optimistic and uses the reaction RPC", () => {
    expect(chat).toContain('supabase.rpc("toggle_message_reaction"');
    expect(chat).toContain("previousReactions");
    expect(chat).toContain("countMessageReactions");
  });

  it("does not show obsolete migration alerts for story reactions or replies", () => {
    expect(stories).not.toContain("Ejecuta la migración 0011");
    expect(stories).not.toContain("Ejecuta la migración 0020");
    expect(stories).toContain("No se pudo enviar la reacción");
    expect(stories).toContain("No se pudo enviar la respuesta");
  });
});
