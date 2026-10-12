-- #93: every synced local row (sets, questions, attempts, reviews, cards, some meta keys) as one JSON
-- document, owned by one user. RLS is on from the start with no policies, so nothing is reachable until #94.

create table public.sync_rows (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null check (tbl in ('sets', 'questions', 'attempts', 'reviews', 'cards', 'meta')),
  id         text        not null check (length(id) between 1 and 200),
  -- null for a deleted row (tombstone); tombstones are kept so a long-offline device cannot bring a row back.
  data       jsonb,
  deleted    boolean     not null default false,
  -- The client's change stamp (ms). The newer stamp wins; enforced by the trigger in #94.
  mtime      bigint      not null check (mtime > 0),
  device_id  text        check (length(device_id) <= 100),
  -- Server time of the last write: the pull cursor.
  updated_at timestamptz not null default now(),
  primary key (user_id, tbl, id),
  constraint sync_rows_tombstone check (deleted = (data is null)),
  -- A question with an imported picture is at most about 0.5 MB; anything far larger is a bug.
  constraint sync_rows_size check (data is null or octet_length(data::text) < 1500000)
);

comment on table public.sync_rows is 'CASN Set Builder: one row per synced local record, per user (#90).';

-- Pull reads one user's rows in (updated_at, tbl, id) order.
create index sync_rows_pull on public.sync_rows (user_id, updated_at, tbl, id);

alter table public.sync_rows enable row level security;
