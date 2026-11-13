import { describe, expect, it } from "vitest";
import { normalizeVenueUrl, normalizeWhatsAppUrl } from "../lib/venue-contacts";

describe("venue contacts", () => {
  it("normaliza URLs web y de redes sin inventar enlaces vacíos", () => {
    expect(normalizeVenueUrl("instagram.com/junta2")).toBe("https://instagram.com/junta2");
    expect(normalizeVenueUrl("  https://facebook.com/local  ")).toBe("https://facebook.com/local");
    expect(normalizeVenueUrl("   ")).toBeNull();
    expect(normalizeVenueUrl("javascript:alert(1)")).toBeNull();
  });

  it("convierte WhatsApp a wa.me usando solo dígitos", () => {
    expect(normalizeWhatsAppUrl("+58 412-123-4567")).toBe("https://wa.me/584121234567");
    expect(normalizeWhatsAppUrl("0058 412 123 4567")).toBe("https://wa.me/584121234567");
    expect(normalizeWhatsAppUrl("123")).toBeNull();
  });

  it("mantiene vacíos los contactos no configurados", () => {
    for (const value of [null, undefined, ""]) {
      expect(normalizeVenueUrl(value)).toBeNull();
      expect(normalizeWhatsAppUrl(value)).toBeNull();
    }
  });
});
