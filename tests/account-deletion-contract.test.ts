import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profile = readFileSync("app/(tabs)/profile.tsx", "utf8");
const functionSource = readFileSync("supabase/functions/delete-account/index.ts", "utf8");

describe("contrato de eliminación de cuenta", () => {
  it("requiere confirmación escrita y muestra estado destructivo", () => {
    expect(profile).toContain("Eliminar cuenta");
    expect(profile).toContain("ELIMINAR");
    expect(profile).toContain("isDeletingAccount");
    expect(profile).toContain('supabase.functions.invoke("delete-account")');
  });

  it("valida el JWT y elimina el usuario Auth desde el servidor", () => {
    expect(functionSource).toContain("auth.getUser");
    expect(functionSource).toContain("auth.admin.deleteUser");
    expect(functionSource).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(functionSource).toContain("verify_jwt");
  });
});
