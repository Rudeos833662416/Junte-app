-- 0065_advisor_hardening.sql
-- Phase 2: FK covering indexes, RLS initplan (select auth.uid()), revoke internal SECURITY DEFINER from clients.

-- 1) Indexes on unindexed foreign keys (Supabase Advisor)
CREATE INDEX IF NOT EXISTS idx_activities_actor_id ON public.activities (actor_id);
CREATE INDEX IF NOT EXISTS idx_activities_checkin_id ON public.activities (checkin_id);
CREATE INDEX IF NOT EXISTS idx_activities_venue_id ON public.activities (venue_id);
CREATE INDEX IF NOT EXISTS idx_activity_push_deliveries_token_id ON public.activity_push_deliveries (token_id);
CREATE INDEX IF NOT EXISTS idx_checkin_reactions_user_id ON public.checkin_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_home_collage_images_created_by ON public.home_collage_images (created_by);
CREATE INDEX IF NOT EXISTS idx_home_collage_settings_updated_by ON public.home_collage_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_notification_action_tokens_user_id ON public.notification_action_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_official_post_comment_reactions_user_id ON public.official_post_comment_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_official_post_comments_parent_comment_id ON public.official_post_comments (parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_official_post_likes_user_id ON public.official_post_likes (user_id);
CREATE INDEX IF NOT EXISTS idx_official_post_shares_user_id ON public.official_post_shares (user_id);
CREATE INDEX IF NOT EXISTS idx_stories_music_track_id ON public.stories (music_track_id);
CREATE INDEX IF NOT EXISTS idx_story_reactions_user_id ON public.story_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer_id ON public.story_views (viewer_id);

-- 2) RLS: wrap auth.uid() in (select auth.uid()) so Postgres evaluates once per query (initplan)
DO $$
DECLARE
  r record;
  new_qual text;
  new_check text;
  role_list text;
  cmd_clause text;
  using_clause text;
  check_clause text;
  create_sql text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND position('auth.uid()' in qual) > 0 AND position('(select auth.uid())' in lower(qual)) = 0)
        OR (with_check IS NOT NULL AND position('auth.uid()' in with_check) > 0 AND position('(select auth.uid())' in lower(with_check)) = 0)
      )
  LOOP
    new_qual := r.qual;
    new_check := r.with_check;
    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, '(select (select auth.uid()))', '(select auth.uid())');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
      new_check := replace(new_check, '(select (select auth.uid()))', '(select auth.uid())');
    END IF;

    role_list := array_to_string(ARRAY(SELECT quote_ident(x) FROM unnest(r.roles) AS x), ', ');
    IF role_list IS NULL OR role_list = '' THEN
      role_list := 'public';
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);

    cmd_clause := upper(r.cmd);
    using_clause := CASE WHEN new_qual IS NOT NULL THEN format(' USING (%s)', new_qual) ELSE '' END;
    check_clause := CASE WHEN new_check IS NOT NULL THEN format(' WITH CHECK (%s)', new_check) ELSE '' END;

    create_sql := format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname,
      r.tablename,
      r.permissive,
      cmd_clause,
      role_list,
      using_clause,
      check_clause
    );
    EXECUTE create_sql;
  END LOOP;
END $$;

-- 3) Revoke EXECUTE on internal trigger/cron SECURITY DEFINER helpers from client roles
REVOKE ALL ON FUNCTION public.create_activity_from_checkin_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_activity_from_checkin_change() TO service_role, postgres;

REVOKE ALL ON FUNCTION public.dispatch_notification_outbox() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_notification_outbox() TO service_role, postgres;

REVOKE ALL ON FUNCTION public.handle_official_post_comment_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_official_post_comment_count() TO service_role, postgres;

REVOKE ALL ON FUNCTION public.handle_official_post_like_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_official_post_like_count() TO service_role, postgres;

REVOKE ALL ON FUNCTION public.prevent_request_to_blocked_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_request_to_blocked_user() TO service_role, postgres;

REVOKE ALL ON FUNCTION public.purge_expired_stories() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_stories() TO service_role, postgres;
