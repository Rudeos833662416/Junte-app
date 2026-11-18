-- 0062: notificación de nuevos Estados respetando privacidad y bloqueos

create or replace function public.create_activities_from_story()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.expires_at <= now() then
    return new;
  end if;

  insert into public.activities (recipient_id, actor_id, type, story_id, message)
  select
    case when f.user_id = new.user_id then f.friend_id else f.user_id end,
    new.user_id,
    'story_new',
    new.id,
    'acaba de subir una historia nueva'
  from public.friendships f
  where f.status = 'accepted'
    and (f.user_id = new.user_id or f.friend_id = new.user_id)
    and case when f.user_id = new.user_id then f.friend_id else f.user_id end <> new.user_id
    and not public.is_blocked_between(
      new.user_id,
      case when f.user_id = new.user_id then f.friend_id else f.user_id end
    )
    and (
      coalesce(new.privacy, new.visibility, 'friends') in ('all_friends', 'public')
      or (
        coalesce(new.privacy, new.visibility, 'friends') = 'close_friends'
        and exists (
          select 1
          from public.close_friends cf
          where cf.owner_id = new.user_id
            and cf.friend_id = case when f.user_id = new.user_id then f.friend_id else f.user_id end
        )
      )
    )
  on conflict (story_id, recipient_id) where type = 'story_new' do nothing;

  return new;
exception when others then
  raise warning 'No se pudo crear el aviso de historia %, pero la historia sí fue publicada: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists stories_activity_after_insert on public.stories;
create trigger stories_activity_after_insert
after insert on public.stories
for each row execute function public.create_activities_from_story();

revoke all on function public.create_activities_from_story() from public;

notify pgrst, 'reload schema';
