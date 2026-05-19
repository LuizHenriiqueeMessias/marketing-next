-- App users table for user management
create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

alter table public.app_users enable row level security;

-- Authenticated users can read all app_users
create policy "Authenticated users can read app_users"
  on public.app_users for select
  to authenticated
  using (true);

-- Authenticated users can insert app_users
create policy "Authenticated users can insert app_users"
  on public.app_users for insert
  to authenticated
  with check (true);

-- Authenticated users can delete app_users
create policy "Authenticated users can delete app_users"
  on public.app_users for delete
  to authenticated
  using (true);
