create table if not exists public.marc_rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.marc_rate_limits enable row level security;
revoke all on table public.marc_rate_limits from public, anon, authenticated;

create or replace function public.marc_rate_limit(
  p_key text,
  p_max_hits integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.marc_rate_limits%rowtype;
begin
  if p_key is null or length(trim(p_key)) = 0 or p_max_hits <= 0 or p_window_seconds <= 0 then
    return false;
  end if;

  select *
    into v_row
    from public.marc_rate_limits
   where key = left(p_key, 200)
   for update;

  if not found then
    insert into public.marc_rate_limits(key, window_started_at, hit_count, updated_at)
    values(left(p_key, 200), v_now, 1, v_now);
    return true;
  end if;

  if extract(epoch from (v_now - v_row.window_started_at)) >= p_window_seconds then
    update public.marc_rate_limits
       set window_started_at = v_now, hit_count = 1, updated_at = v_now
     where key = v_row.key;
    return true;
  end if;

  if v_row.hit_count >= p_max_hits then
    update public.marc_rate_limits
       set updated_at = v_now
     where key = v_row.key;
    return false;
  end if;

  update public.marc_rate_limits
     set hit_count = v_row.hit_count + 1, updated_at = v_now
   where key = v_row.key;

  return true;
end;
$function$;

revoke all on function public.marc_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.marc_rate_limit(text, integer, integer) to service_role;
