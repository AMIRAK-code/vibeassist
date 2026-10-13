-- Indexes for the foreign keys in public that had none, as flagged by the performance advisor.
-- Without them, deleting an account, a repository rule, a gateway key or a run has to scan the
-- whole referencing table. Only public: the examer schema belongs to EXAMassist.
create index engine_ai_settings_provider_key_idx on public.engine_ai_settings (provider_key_id);
create index engine_context_rules_user_idx on public.engine_context_rules (user_id);
create index engine_findings_rule_idx on public.engine_findings (rule_id);
create index engine_findings_user_idx on public.engine_findings (user_id);
create index engine_run_events_user_idx on public.engine_run_events (user_id);
create index engine_runs_backtest_of_idx on public.engine_runs (backtest_of);
create index engine_snapshots_user_idx on public.engine_snapshots (user_id);
create index gateway_provider_keys_user_idx on public.gateway_provider_keys (user_id);
create index newsletter_sends_user_idx on public.newsletter_sends (user_id);

-- Rollback:
-- drop index public.engine_ai_settings_provider_key_idx, public.engine_context_rules_user_idx,
--   public.engine_findings_rule_idx, public.engine_findings_user_idx, public.engine_run_events_user_idx,
--   public.engine_runs_backtest_of_idx, public.engine_snapshots_user_idx,
--   public.gateway_provider_keys_user_idx, public.newsletter_sends_user_idx;
