import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const eventsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/events.tsx"), "utf8");
const tabsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/_layout.tsx"), "utf8");
const homeSource = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const iconSource = readFileSync(resolve(process.cwd(), "components/ui/icon-symbol.tsx"), "utf8");
const migrationSource = readFileSync(resolve(process.cwd(), "supabase/migrations/0021_events_official_feed.sql"), "utf8");
const safetyMigrationSource = readFileSync(resolve(process.cwd(), "supabase/migrations/0023_official_feed_author_delete_safety.sql"), "utf8");
const deleteMigrationSource = readFileSync(resolve(process.cwd(), "supabase/migrations/0024_official_post_delete_rpc.sql"), "utf8");
const authorMigrationSource = readFileSync(resolve(process.cwd(), "supabase/migrations/0025_official_author_identity.sql"), "utf8");

describe("Eventos: feed, multimedia y comentarios", () => {
  it("usa FlatList con viewability para reproducir videos solo dentro del viewport", () => {
    expect(eventsSource).toContain("<FlatList");
    expect(eventsSource).toContain("onViewableItemsChanged={onViewableItemsChanged}");
    expect(eventsSource).toContain("viewabilityConfig={viewabilityConfig}");
    expect(eventsSource).toContain("isVisible={visiblePostIds.has(post.id) && !fullMedia}");
    expect(eventsSource).toContain("player.pause()");
    expect(eventsSource).toContain('contentFit="contain"');
    expect(eventsSource).toContain('player.play()');
    expect(eventsSource).toContain("admin_soft_delete_official_post");
    expect(eventsSource).toContain("deletedPostIdsRef");
    expect(eventsSource).toContain('admin_soft_delete_official_post');
    expect(eventsSource).toContain('if (fullMedia?.isVideo && fullMedia.uri === post.media_url)');
    expect(eventsSource).not.toContain('return () => player.pause()');
  });

  it("mantiene el encabezado de cada publicación en avatar, autor y fecha/hora", () => {
    expect(eventsSource).toContain("post.authorAvatarUrl");
    expect(eventsSource).toContain("post.authorName");
    expect(eventsSource).toContain("formatDate(post.created_at)");
    expect(eventsSource).toContain('hour: "2-digit"');
    expect(eventsSource).toContain('minute: "2-digit"');
    expect(eventsSource).toContain('second: "2-digit"');
    expect(eventsSource).toContain('get_official_post_authors');
    expect(eventsSource).toContain('author?.avatar_url');
    expect(eventsSource).toContain("post.media_type === \"video\" ? 9 / 16");
  });

  it("persiste comentarios y respuestas, con fallback para caché de esquema antigua", () => {
    expect(eventsSource).toContain("parent_comment_id: replyingTo?.id ?? null");
    expect(eventsSource).toContain("official_post_comments");
    expect(eventsSource).toContain("schema cache");
    expect(eventsSource).toContain("const fallback = await supabase.from(\"official_post_comments\")");
    expect(eventsSource).toContain("await loadComments(commentFor)");
    expect(migrationSource).toContain("add column if not exists parent_comment_id");
    expect(migrationSource).toContain("create policy official_post_comments_insert_own");
  });
});

describe("Navegación y consistencia visual", () => {
  it("ofrece swipe horizontal incluyendo Eventos", () => {
    expect(tabsSource).toContain("PanResponder.create");
    expect(tabsSource).toContain("/(tabs)/friends");
    expect(tabsSource).toContain("/(tabs)/map");
    expect(tabsSource).toContain("/(tabs)/activity");
    expect(tabsSource).toContain("/(tabs)/profile");
    expect(tabsSource).toContain("/(tabs)/events");
    expect(tabsSource).toContain('title: "Eventos"');
    expect(tabsSource).toContain("router.replace(nextRoute)");
  });

  it("usa el icono de calendario compartido en el tab Eventos y no duplica el botón en Home", () => {
    expect(tabsSource).toContain('name="calendar"');
    expect(homeSource).not.toContain('IconSymbol name="calendar"');
    expect(iconSource).toContain('"calendar": "event"');
  });

  it("incluye SQL para ocultar eliminados y revelar autoría oficial sin depender de amistades", () => {
    expect(migrationSource).toContain("add column if not exists deleted_at timestamptz");
    expect(safetyMigrationSource).toContain("get_official_post_authors");
    expect(safetyMigrationSource).toContain("security definer");
    expect(safetyMigrationSource).toContain("deleted_at is null");
    expect(safetyMigrationSource).toContain("replica identity full");
    expect(deleteMigrationSource).toContain("admin_soft_delete_official_post");
    expect(deleteMigrationSource).toContain("grant execute");
    expect(authorMigrationSource).toContain("from unnest");
    expect(authorMigrationSource).toContain("auth.users");
    expect(authorMigrationSource).toContain("avatar_url");
  });
});
