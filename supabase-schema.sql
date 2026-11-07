-- Run this in Supabase Dashboard > SQL Editor.
-- Anonymous users receive the authenticated database role after signing in.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'in_review', 'done')),
  description text,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists comments_task_id_idx on public.comments(task_id);

alter table public.tasks enable row level security;
alter table public.comments enable row level security;

grant usage on schema public to authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.comments from anon, authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
grant select, insert, delete on table public.comments to authenticated;

drop policy if exists "Users can read their own tasks" on public.tasks;
create policy "Users can read their own tasks"
  on public.tasks for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own tasks" on public.tasks;
create policy "Users can create their own tasks"
  on public.tasks for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own tasks" on public.tasks;
create policy "Users can update their own tasks"
  on public.tasks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own tasks" on public.tasks;
create policy "Users can delete their own tasks"
  on public.tasks for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read comments on their own tasks" on public.comments;
create policy "Users can read comments on their own tasks"
  on public.comments for select to authenticated
  using (exists (
    select 1 from public.tasks
    where tasks.id = comments.task_id
      and tasks.user_id = (select auth.uid())
  ));

drop policy if exists "Users can add comments to their own tasks" on public.comments;
create policy "Users can add comments to their own tasks"
  on public.comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.tasks
      where tasks.id = comments.task_id
        and tasks.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete comments on their own tasks" on public.comments;
create policy "Users can delete comments on their own tasks"
  on public.comments for delete to authenticated
  using (exists (
    select 1 from public.tasks
    where tasks.id = comments.task_id
      and tasks.user_id = (select auth.uid())
  ));
