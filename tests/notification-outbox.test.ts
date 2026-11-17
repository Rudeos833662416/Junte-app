import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0055_notification_outbox.sql"),
  "utf8",
);

describe("outbox durable de notificaciones", () => {
  it("guarda una actividad una sola vez y define estados, leases y reintentos", () => {
    expect(migrationSource).toContain("create table if not exists public.notification_outbox");
    expect(migrationSource).toContain("unique (activity_id)");
    expect(migrationSource).toContain("status in ('queued', 'processing', 'dispatched', 'failed')");
    expect(migrationSource).toContain("for update skip locked");
    expect(migrationSource).toContain("next_attempt_at");
    expect(migrationSource).toContain("cron.schedule");
  });

  it("reemplaza el HTTP directo del trigger por un insert idempotente", () => {
    expect(migrationSource).toContain("insert into public.notification_outbox");
    expect(migrationSource).toContain("on conflict (activity_id) do nothing");
    expect(migrationSource).toContain("create or replace function public.enqueue_activity_push()");
  });
});
