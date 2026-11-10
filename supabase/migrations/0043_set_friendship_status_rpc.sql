-- 0043: persistencia verificable de controles de amistad
-- Actualiza una relación existente desde cualquiera de sus extremos y devuelve la fila guardada.
create or replace function public.set_friendship_status(p_friendship_id bigint, p_status text)
returns public.friendships
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved public.friendships;
begin
  if p_status not in ('accepted', 'blocked') then
    raise exception 'invalid_friendship_status' using errcode = '22023';
  end if;

  update public.friendships
     set status = p_status
   where id = p_friendship_id
     and (user_id = auth.uid() or friend_id = auth.uid())
  returning * into saved;

  if saved.id is null then
    raise exception 'friendship_not_found_or_forbidden' using errcode = '42501';
  end if;

  return saved;
end;
$$;

grant execute on function public.set_friendship_status(bigint, text) to authenticated;
notify pgrst, 'reload schema';
