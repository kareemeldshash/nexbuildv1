-- Run once in Supabase SQL Editor for an existing NexBuild database.
-- Verification is performed by a security-definer function so users cannot verify themselves.
create or replace function public.admin_verify_creator(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.profiles set verified = true where id = p_id and is_admin = false;
end $$;
grant execute on function public.admin_verify_creator(uuid) to authenticated;
