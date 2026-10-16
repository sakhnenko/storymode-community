-- The AI editor's current speed tiers (Fast on Gemini 2.5 Flash and kept
-- short, Thoughtful on Gemini 3.6 Flash) reach admins first; everyone else
-- keeps the earlier tiers until this flag is opened to all.
insert into public.feature_flags (key, enabled_for_all)
values ('editor_speed_tiers', false)
on conflict (key) do nothing;

-- Real AI editor usage for admins, from what each charge records: per speed,
-- kind of question, model and tiers, how many answers, what they cost, how
-- soon text appeared and how many came back empty. Benchmark runs are left out.
create or replace function public.admin_editor_usage(_days integer default 7)
returns table (
  speed text, context text, model text, tiers text, answers bigint, writers bigint,
  credits numeric, median_credits numeric, median_input_tokens numeric, median_output_tokens numeric,
  median_first_text_ms numeric, p95_first_text_ms numeric, empty_answers bigint, cached_share numeric
)
language sql stable security invoker set search_path = '' as $$
  select
    l.metadata->>'speed', l.metadata->>'context', l.metadata->>'model', coalesce(l.metadata->>'tiers', 'earlier'),
    count(*), count(distinct l.user_id),
    sum(-l.delta),
    percentile_cont(0.5) within group (order by -l.delta),
    percentile_cont(0.5) within group (order by (l.metadata->>'input_tokens')::numeric),
    percentile_cont(0.5) within group (order by (l.metadata->>'output_tokens')::numeric),
    percentile_cont(0.5) within group (order by (l.metadata->>'first_text_ms')::numeric),
    percentile_cont(0.95) within group (order by (l.metadata->>'first_text_ms')::numeric),
    count(*) filter (where (l.metadata->>'answer_chars')::numeric = 0),
    sum((l.metadata->>'cached_tokens')::numeric) / nullif(sum((l.metadata->>'input_tokens')::numeric), 0)
  from public.credit_ledger l
  where public.has_role(auth.uid(), 'admin'::public.app_role)
    and l.kind = 'spend'
    and l.reason in ('chat_flash', 'chat_gpt5')
    and l.metadata ? 'speed'
    and not l.metadata ? 'bench'
    and l.created_at > now() - make_interval(days => greatest(1, least(_days, 90)))
  group by 1, 2, 3, 4
  order by 1, 2, 3, 4;
$$;

revoke all on function public.admin_editor_usage(integer) from public, anon;
grant execute on function public.admin_editor_usage(integer) to authenticated;

notify pgrst, 'reload schema';