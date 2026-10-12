-- #94: who can read and write sync_rows, and the rule that an older change never replaces a newer one.

-- Signed-in users only, and never a hard delete: a removal is a tombstone (deleted = true, data = null).
revoke all on public.sync_rows from anon, authenticated;
grant select, insert, update on public.sync_rows to authenticated;

create policy "sync_rows: read own" on public.sync_rows
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "sync_rows: add own" on public.sync_rows
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "sync_rows: change own" on public.sync_rows
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Every write path (sync_push or a direct upsert) goes through this: the server stamps the pull cursor,
-- and an update carrying an older client stamp is skipped, so a device that was offline for a week
-- cannot overwrite what another device changed since.
create function public.sync_rows_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.mtime < old.mtime then
    return null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger sync_rows_guard
  before insert or update on public.sync_rows
  for each row execute function public.sync_rows_guard();

-- Upload a batch. Returns the rows that were written; a row left out lost to a newer stamp on the server.
create function public.sync_push(rows jsonb)
returns table (applied_tbl text, applied_id text, applied_mtime bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(rows) is distinct from 'array' then
    raise exception 'sync_push: rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(rows) > 500 then
    raise exception 'sync_push: at most 500 rows per call' using errcode = '22023';
  end if;

  return query
  with written as (
    insert into public.sync_rows as s (tbl, id, data, deleted, mtime, device_id)
    -- One row per (tbl, id), the newest: Postgres refuses to update the same row twice in one statement.
    select distinct on (r.tbl, r.id)
      r.tbl, r.id, case when coalesce(r.deleted, false) then null else r.data end, coalesce(r.deleted, false), r.mtime, r.device_id
    from jsonb_to_recordset(rows) as r (tbl text, id text, data jsonb, deleted boolean, mtime bigint, device_id text)
    order by r.tbl, r.id, r.mtime desc
    on conflict (user_id, tbl, id) do update
      set data = excluded.data,
          deleted = excluded.deleted,
          mtime = excluded.mtime,
          device_id = excluded.device_id
      where excluded.mtime >= s.mtime
    returning s.tbl, s.id, s.mtime
  )
  select w.tbl, w.id, w.mtime from written w;
end;
$$;

-- Download one page of changes after a cursor, in (updated_at, tbl, id) order. The caller starts a pull a
-- little before its last cursor (rows written in one push share updated_at, and transactions can commit
-- out of order), and pages on with the last row it got.
create function public.sync_pull(
  after_at timestamptz,
  after_tbl text default '',
  after_id text default '',
  max_rows integer default 500
)
returns table (tbl text, id text, data jsonb, deleted boolean, mtime bigint, updated_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.tbl, s.id, s.data, s.deleted, s.mtime, s.updated_at
  from public.sync_rows s
  where s.user_id = (select auth.uid())
    and (s.updated_at, s.tbl, s.id) > (after_at, after_tbl, after_id)
  order by s.updated_at, s.tbl, s.id
  limit least(greatest(max_rows, 1), 1000);
$$;

revoke execute on function public.sync_rows_guard() from public, anon, authenticated;
revoke execute on function public.sync_push(jsonb) from public, anon;
revoke execute on function public.sync_pull(timestamptz, text, text, integer) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;
grant execute on function public.sync_pull(timestamptz, text, text, integer) to authenticated;
