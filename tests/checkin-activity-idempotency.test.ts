import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0054_remove_duplicate_checkin_activity_trigger.sql"),
  "utf8",
);

const canonicalSource = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0044_blocking_server_guards.sql"),
  "utf8",
);

describe("idempotencia de actividades de check-in", () => {
  it("deja un solo productor de actividades y elimina el trigger duplicado", () => {
    expect(migrationSource).toContain(
      "drop trigger if exists trigger_on_checkin_created on public.checkins",
    );
    expect(migrationSource).toContain("create_checkin_activity");
    expect(migrationSource).toContain("notify pgrst, 'reload schema'");
    expect(canonicalSource).toContain("on conflict (recipient_id, checkin_id, type) do nothing");
  });
});
