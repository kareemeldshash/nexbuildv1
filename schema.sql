-- NexBuild schema. Supabase: SQL Editor > New query > paste > Run (once).
create table public.profiles(
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Creator' check (char_length(display_name) <= 40),
  is_admin boolean not null default false,
  verified boolean not null default false,
  created_at timestamptz not null default now());

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data->>'name', 40), ''), 'Creator'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

create table public.projects(
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 60),
  description text not null check (char_length(description) between 40 and 800),
  category text not null check (char_length(category) <= 30),
  formats text not null check (char_length(formats) <= 60),
  includes text not null check (char_length(includes) <= 400),
  price_cents int not null check (price_cents = 0 or price_cents between 500 and 50000),
  cover_path text not null,
  file_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now());

create table public.payouts(
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id),
  amount_cents int not null,
  method text not null check (char_length(method) <= 30),
  details text not null check (char_length(details) <= 200),
  status text not null default 'requested' check (status in ('requested','paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz);

create table public.purchases(
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  project_id uuid not null references public.projects(id),
  seller_id uuid not null references public.profiles(id),
  amount_cents int not null,
  seller_share_cents int not null,
  available_at timestamptz not null,
  ls_order_id text not null unique,
  payout_id uuid references public.payouts(id),
  created_at timestamptz not null default now());

create table public.reports(
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  reporter_id uuid not null default auth.uid(),
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now());

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.purchases enable row level security;
alter table public.payouts enable row level security;
alter table public.reports enable row level security;

create policy "profiles are public" on public.profiles for select using (true);
create policy "edit own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "see approved, own or all if admin" on public.projects for select using (status = 'approved' or seller_id = auth.uid() or public.is_admin());
create policy "sellers submit pending" on public.projects for insert to authenticated with check (seller_id = auth.uid() and status = 'pending');
create policy "admin reviews" on public.projects for update using (public.is_admin());
create policy "delete own pending" on public.projects for delete using ((seller_id = auth.uid() and status = 'pending') or public.is_admin());

create policy "see own sales and purchases" on public.purchases for select using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());
create policy "see own payouts" on public.payouts for select using (seller_id = auth.uid() or public.is_admin());
create policy "send report" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "admin reads reports" on public.reports for select using (public.is_admin());
-- purchases and payouts have no insert/update policies: only the server (webhook) and the functions below can change them.

create function public.my_balance() returns table(pending int, available int, paid int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(seller_share_cents) filter (where payout_id is null and available_at > now()), 0)::int,
         coalesce(sum(seller_share_cents) filter (where payout_id is null and available_at <= now()), 0)::int,
         coalesce(sum(seller_share_cents) filter (where payout_id is not null), 0)::int
  from purchases where seller_id = auth.uid()
$$;

create function public.request_payout(p_method text, p_details text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_total int; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select coalesce(sum(seller_share_cents), 0) into v_total from purchases
    where seller_id = auth.uid() and payout_id is null and available_at <= now();
  if v_total < 1000 then raise exception 'Minimum payout is $10 of available money'; end if;
  insert into payouts(seller_id, amount_cents, method, details) values (auth.uid(), v_total, p_method, p_details) returning id into v_id;
  update purchases set payout_id = v_id where seller_id = auth.uid() and payout_id is null and available_at <= now();
  return v_id;
end $$;

create function public.admin_mark_paid(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update payouts set status = 'paid', paid_at = now() where id = p_id and status = 'requested';
end $$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
  ('covers', 'covers', true, 2097152, array['image/png','image/jpeg','image/webp']),
  ('files', 'files', false, 52428800, null)
on conflict (id) do nothing;
create policy "upload own cover" on storage.objects for insert to authenticated with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "upload own file" on storage.objects for insert to authenticated with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own or admin files" on storage.objects for select to authenticated using (bucket_id = 'files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
