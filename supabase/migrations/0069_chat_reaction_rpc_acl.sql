-- 0069: la RPC de reacciones solo está disponible para usuarios autenticados.
revoke execute on function public.toggle_message_reaction(uuid, text) from anon;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;
