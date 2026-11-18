import { afterEach, describe, expect, it } from "vitest";
import {
  clearChatStore,
  formatChatDateLabel,
  getDraft,
  isSameMessageGroup,
  mergeCachedMessage,
  setCachedConversation,
  setDraft,
} from "../lib/chat-store";

const base = {
  sender_id: "a",
  recipient_id: "b",
  body: "hola",
  created_at: "2026-01-01T00:00:00.000Z",
  read_at: null,
};

afterEach(() => clearChatStore());

describe("chat-store", () => {
  it("reemplaza un mensaje optimista por su eco real sin duplicarlo", () => {
    const pending = { ...base, id: "local-1", client_message_id: "client-1", pending: true };
    const confirmed = { ...base, id: "real-1", client_message_id: "client-1", pending: false };

    setCachedConversation("b", [pending]);
    const next = mergeCachedMessage([pending], confirmed);

    expect(next).toEqual([confirmed]);
  });

  it("inserta mensajes nuevos del más reciente al más antiguo", () => {
    const older = { ...base, id: "old", created_at: "2026-01-01T00:00:00.000Z" };
    const newer = { ...base, id: "new", created_at: "2026-01-01T01:00:00.000Z" };

    expect(mergeCachedMessage([older], newer).map((message) => message.id)).toEqual(["new", "old"]);
  });

  it("conserva borradores por conversación", () => {
    setDraft("b", "te escribo luego");
    expect(getDraft("b")).toBe("te escribo luego");
  });

  it("agrupa mensajes del mismo usuario dentro de dos minutos", () => {
    const first = { ...base, id: "first", created_at: "2026-01-01T00:00:00.000Z" };
    const second = { ...base, id: "second", created_at: "2026-01-01T00:01:00.000Z" };
    expect(isSameMessageGroup(second, first)).toBe(true);
  });

  it("etiqueta días relativos como HOY y AYER", () => {
    const now = new Date("2026-01-03T12:00:00.000Z");
    expect(formatChatDateLabel("2026-01-03T08:00:00.000Z", now)).toBe("HOY");
    expect(formatChatDateLabel("2026-01-02T08:00:00.000Z", now)).toBe("AYER");
  });
});
