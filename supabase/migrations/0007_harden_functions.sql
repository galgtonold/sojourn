-- Tighten the SECURITY DEFINER helpers: only authenticated users (whose RLS
-- policies reference them) need EXECUTE. anon never does, and the new-user
-- trigger function should not be callable over RPC at all.
revoke execute on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

revoke execute on function public.can_edit_trip(uuid) from public;
grant execute on function public.can_edit_trip(uuid) to authenticated;

revoke execute on function public.can_edit_post(uuid) from public;
grant execute on function public.can_edit_post(uuid) to authenticated;

revoke execute on function public.handle_new_user() from public;

-- Clear the mutable search_path warning on the pre-existing trigger function.
alter function public.touch_updated_at() set search_path = public;
