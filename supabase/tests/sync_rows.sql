-- #95: RLS and stamp rules of sync_rows, checked as two signed-in users and as anon.
-- Run as the postgres role (SQL editor or the Supabase MCP execute_sql). Everything it writes, test users
-- included, is rolled back: the block always ends by raising, with "SYNC_ROWS TESTS PASSED" on success
-- or "FAIL: ..." naming the first broken rule.
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  n integer;
  v jsonb;
  checks integer := 0;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', 'sync-test-a@example.invalid', now(), now()),
         ('00000000-0000-0000-0000-000000000000', b, 'authenticated', 'authenticated', 'sync-test-b@example.invalid', now(), now());

  -- ---------- as A ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.sync_push('[
    {"tbl":"sets","id":"s1","data":{"name":"Set A"},"mtime":1000,"device_id":"hp"},
    {"tbl":"questions","id":"q1","data":{"stem":"Soal A"},"mtime":1000}
  ]'::jsonb);
  if n <> 2 then raise exception 'FAIL: A push wrote % rows, expected 2', n; end if;
  checks := checks + 1;

  -- An older stamp is ignored, through sync_push and through a direct update.
  select count(*) into n from public.sync_push('[{"tbl":"sets","id":"s1","data":{"name":"lama"},"mtime":999}]'::jsonb);
  if n <> 0 then raise exception 'FAIL: older stamp was applied by sync_push'; end if;
  update public.sync_rows set data = '{"name":"lama"}', mtime = 500 where tbl = 'sets' and id = 's1';
  select data into v from public.sync_rows where tbl = 'sets' and id = 's1';
  if v->>'name' <> 'Set A' then raise exception 'FAIL: older stamp overwrote the row (%)', v; end if;
  checks := checks + 1;

  -- A newer stamp wins; an equal stamp is applied again (idempotent retry).
  select count(*) into n from public.sync_push('[{"tbl":"sets","id":"s1","data":{"name":"Set A2"},"mtime":2000}]'::jsonb);
  if n <> 1 then raise exception 'FAIL: newer stamp not applied'; end if;
  select count(*) into n from public.sync_push('[{"tbl":"sets","id":"s1","data":{"name":"Set A2"},"mtime":2000}]'::jsonb);
  if n <> 1 then raise exception 'FAIL: equal stamp retry not applied'; end if;
  checks := checks + 1;

  -- Two versions of one row in a batch: the newest is kept, no "affect row a second time" error.
  select count(*) into n from public.sync_push('[
    {"tbl":"cards","id":"c1","data":{"v":1},"mtime":3000},
    {"tbl":"cards","id":"c1","data":{"v":2},"mtime":3001}
  ]'::jsonb);
  select data into v from public.sync_rows where tbl = 'cards' and id = 'c1';
  if n <> 1 or (v->>'v') <> '2' then raise exception 'FAIL: duplicate in batch gave % rows, data %', n, v; end if;
  checks := checks + 1;

  -- Tombstone: data is dropped even if sent, and the row stays readable as deleted.
  perform public.sync_push('[{"tbl":"questions","id":"q1","deleted":true,"data":{"stem":"x"},"mtime":4000}]'::jsonb);
  select data into v from public.sync_rows where tbl = 'questions' and id = 'q1' and deleted;
  if v is not null or not found then raise exception 'FAIL: tombstone not stored as deleted with null data'; end if;
  checks := checks + 1;

  -- The server sets updated_at; a client cannot push it into the future to hide a row from pulls.
  insert into public.sync_rows (tbl, id, data, mtime, updated_at) values ('reviews', 'r1', '{}', 1, now() + interval '1 year');
  select count(*) into n from public.sync_rows where tbl = 'reviews' and id = 'r1' and updated_at <= now();
  if n <> 1 then raise exception 'FAIL: client-chosen updated_at was kept'; end if;
  checks := checks + 1;

  -- Hard delete is not allowed.
  begin
    delete from public.sync_rows where tbl = 'reviews';
    raise exception 'FAIL: delete was allowed';
  exception when insufficient_privilege then null;
  end;
  checks := checks + 1;

  -- Writing a row for someone else is refused, directly and by moving one's own row.
  begin
    insert into public.sync_rows (user_id, tbl, id, data, mtime) values (b, 'sets', 'evil', '{}', 1);
    raise exception 'FAIL: A inserted a row owned by B';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.sync_rows set user_id = b, mtime = 9999 where tbl = 'reviews' and id = 'r1';
    raise exception 'FAIL: A moved a row to B';
  exception when insufficient_privilege then null;
  end;
  checks := checks + 1;

  -- Unknown table names and oversized rows are rejected.
  begin
    perform public.sync_push('[{"tbl":"keys","id":"k1","data":{},"mtime":1}]'::jsonb);
    raise exception 'FAIL: tbl "keys" was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.sync_push(jsonb_build_array(jsonb_build_object('tbl', 'questions', 'id', 'big', 'mtime', 1,
      'data', jsonb_build_object('image', repeat('x', 1600000)))));
    raise exception 'FAIL: row over 1.5 MB was accepted';
  exception when check_violation then null;
  end;
  checks := checks + 1;

  -- More than 500 rows per call is refused.
  begin
    perform public.sync_push((select jsonb_agg(jsonb_build_object('tbl', 'cards', 'id', 'c' || i, 'data', '{}'::jsonb, 'mtime', 1))
                              from generate_series(1, 501) i));
    raise exception 'FAIL: 501 rows accepted';
  exception when invalid_parameter_value then null;
  end;
  checks := checks + 1;

  -- ---------- as B ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  -- Same tbl and id as A: a separate row of B's own.
  select count(*) into n from public.sync_push('[{"tbl":"sets","id":"s1","data":{"name":"Set B"},"mtime":1}]'::jsonb);
  if n <> 1 then raise exception 'FAIL: B could not write its own s1'; end if;
  checks := checks + 1;

  -- B sees only its own rows, through the table and through sync_pull.
  select count(*) into n from public.sync_rows;
  if n <> 1 then raise exception 'FAIL: B sees % rows, expected 1', n; end if;
  select count(*) into n from public.sync_pull('-infinity');
  if n <> 1 then raise exception 'FAIL: B pulls % rows, expected 1', n; end if;
  checks := checks + 1;

  -- B cannot change A's rows.
  update public.sync_rows set data = '{"name":"dirusak"}', mtime = 99999 where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B updated % of A''s rows', n; end if;
  checks := checks + 1;

  -- ---------- as A again: pull order and paging ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into n from public.sync_pull('-infinity');
  if n <> 4 then raise exception 'FAIL: A pulls % rows, expected 4 (s1, q1 tombstone, c1, r1)', n; end if;
  select data into v from public.sync_rows where tbl = 'sets' and id = 's1';
  if v->>'name' <> 'Set A2' then raise exception 'FAIL: B''s write changed A''s s1 (%)', v; end if;
  -- Paging with the last row as the cursor visits every row exactly once.
  with p1 as (select * from public.sync_pull('-infinity', '', '', 2)),
       last as (select * from p1 order by updated_at desc, tbl desc, id desc limit 1),
       p2 as (select s.* from last, public.sync_pull(last.updated_at, last.tbl, last.id, 10) s)
  select (select count(*) from p1) + (select count(*) from p2) into n;
  if n <> 4 then raise exception 'FAIL: paging visited % rows, expected 4', n; end if;
  checks := checks + 1;

  -- ---------- as anon ----------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    perform count(*) from public.sync_rows;
    raise exception 'FAIL: anon can read sync_rows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.sync_push('[]'::jsonb);
    raise exception 'FAIL: anon can call sync_push';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.sync_pull('-infinity');
    raise exception 'FAIL: anon can call sync_pull';
  exception when insufficient_privilege then null;
  end;
  checks := checks + 1;

  execute 'reset role';
  raise exception 'SYNC_ROWS TESTS PASSED: % checks', checks;
end;
$$;
