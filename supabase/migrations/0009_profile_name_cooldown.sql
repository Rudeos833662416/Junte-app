-- Sky Night: limitar el cambio de nombre a una vez cada 7 días

alter table if exists public.profiles
  add column if not exists last_name_changed_at timestamptz;

create or replace function public.enforce_profile_name_cooldown()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.name is not distinct from new.name then
    new.last_name_changed_at := old.last_name_changed_at;
    return new;
  end if;

  if old.last_name_changed_at is not null
     and old.last_name_changed_at > now() - interval '7 days' then
    raise exception 'PROFILE_NAME_COOLDOWN'
      using errcode = 'check_violation',
            detail = 'El nombre solo puede cambiarse una vez cada 7 días.';
  end if;

  new.last_name_changed_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_name_cooldown_before_update on public.profiles;
create trigger profiles_name_cooldown_before_update
before update of name on public.profiles
for each row execute function public.enforce_profile_name_cooldown();

revoke all on function public.enforce_profile_name_cooldown() from public;
