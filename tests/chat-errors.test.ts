import { describe, expect, it } from "vitest";
import { friendlyChatError } from "../lib/chat-errors";

describe("friendlyChatError", () => {
  it("explica un rechazo RLS sin culpar a la conexión", () => {
    expect(friendlyChatError({ code: "42501", message: "new row violates row-level security policy" })).toContain("permiso");
  });

  it("solo muestra error de Internet cuando el cliente realmente falló en red", () => {
    expect(friendlyChatError({ message: "Network request failed" })).toContain("Internet");
  });
});
