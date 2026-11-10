import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(process.cwd(), "supabase/migrations/0044_blocking_server_guards.sql");
const migrationSource = readFileSync(migrationPath, "utf8");
const friendshipGuardSource = readFileSync(resolve(process.cwd(), "supabase/migrations/0042_friend_controls_and_push_guards.sql"), "utf8");
const notifySource = readFileSync(resolve(process.cwd(), "supabase/functions/notify-activity/index.ts"), "utf8");

describe("contrato de bloqueo a nivel servidor", () => {
  it("define una guarda central idempotente para relaciones bloqueadas", () => {
    expect(migrationSource).toContain("is_blocked_between");
    expect(migrationSource).toContain("create or replace function public.is_blocked_between");
    expect(migrationSource).toContain("status = 'blocked'");
  });

  it("oculta bloqueados de perfiles, búsqueda, historias, mapa y actividades", () => {
    expect(migrationSource).toContain("search_public_profiles");
    expect(migrationSource).toContain("get_visible_profiles");
    expect(migrationSource).toContain("stories_select_visible");
    expect(migrationSource).toContain("can_view_checkin");
    expect(migrationSource).toContain("activities_select_related");
    expect(migrationSource).toContain("not public.is_blocked_between");
  });

  it("impide mensajes y nuevas actividades derivadas entre usuarios bloqueados", () => {
    expect(migrationSource).toContain("direct_messages_insert_sender");
    expect(migrationSource).toContain("create_activity_from_direct_message");
    expect(migrationSource).toContain("create_activity_from_story_reaction");
    expect(migrationSource).toContain("create_checkin_activity");
    expect(friendshipGuardSource).toContain("raise exception 'friendship_blocked'");
  });

  it("revalida el bloqueo justo antes de enviar push", () => {
    expect(notifySource).toContain('rpc("is_blocked_between"');
    expect(notifySource).toContain("reason: \"blocked_relationship\"");
  });
});
