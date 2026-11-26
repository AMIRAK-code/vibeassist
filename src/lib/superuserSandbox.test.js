import { beforeEach, describe, expect, it } from 'vitest';
import { isActivePremium } from './billing';
import {
  SUPERUSER_ID,
  activateSuperuserSession,
  deactivateSuperuserSession,
  getSuperuserSession,
  isLocalHandoffToken,
  isSuperuserActive,
  isSuperuserCredentials,
  onSuperuserAuthChange,
  resetSuperuserDb,
  superuserCallFunction,
  superuserFrom,
  superuserRpc,
} from './superuserSandbox';

describe('superuserSandbox (`test` / `1234`)', () => {
  beforeEach(() => {
    deactivateSuperuserSession();
    resetSuperuserDb();
  });

  it('validates test:1234 credentials case-insensitively and rejects wrong passwords', () => {
    expect(isSuperuserCredentials('test', '1234')).toBe(true);
    expect(isSuperuserCredentials(' TEST ', '1234')).toBe(true);
    expect(isSuperuserCredentials('test@vibeassist.app', '1234')).toBe(true);
    expect(isSuperuserCredentials('test', 'wrong')).toBe(false);
    expect(isSuperuserCredentials('other', '1234')).toBe(false);
  });

  it('activates/deactivates session and provides permanent admin Premium subscription', async () => {
    const events = [];
    const { data: { subscription: listener } } = onSuperuserAuthChange((ev, sess) => {
      events.push({ ev, id: sess?.user?.id ?? null });
    });

    expect(isSuperuserActive()).toBe(false);
    expect(getSuperuserSession()).toBeNull();

    const session = activateSuperuserSession();
    expect(isSuperuserActive()).toBe(true);
    expect(session.user.id).toBe(SUPERUSER_ID);
    expect(session.user.user_metadata.role).toBe('superuser');

    const subRes = await superuserFrom('subscriptions').select('*').eq('user_id', SUPERUSER_ID).maybeSingle();
    expect(subRes.error).toBeNull();
    expect(subRes.data.plan).toBe('premium');
    expect(subRes.data.source).toBe('admin');
    expect(isActivePremium(subRes.data)).toBe(true);

    deactivateSuperuserSession();
    expect(isSuperuserActive()).toBe(false);
    expect(events).toEqual([
      { ev: 'SIGNED_IN', id: SUPERUSER_ID },
      { ev: 'SIGNED_OUT', id: null },
    ]);
    listener.unsubscribe();
  });

  it('supports PostgREST CRUD, optimistic updated_at locking, head counts, and relational advisor_plans', async () => {
    activateSuperuserSession();

    const profileBefore = await superuserFrom('profiles').select('*').eq('id', SUPERUSER_ID).single();
    expect(profileBefore.error).toBeNull();

    const updated = await superuserFrom('profiles')
      .update({ name: 'Ada Test', currency: 'EUR' })
      .eq('id', SUPERUSER_ID)
      .eq('updated_at', profileBefore.data.updated_at)
      .select()
      .single();
    expect(updated.error).toBeNull();
    expect(updated.data.name).toBe('Ada Test');
    expect(updated.data.updated_at).not.toBe(profileBefore.data.updated_at);

    // Stale updated_at should match 0 rows cleanly
    const stale = await superuserFrom('profiles')
      .update({ name: 'Should Not Overwrite' })
      .eq('id', SUPERUSER_ID)
      .eq('updated_at', profileBefore.data.updated_at)
      .select();
    expect(stale.data).toEqual([]);

    const plans = await superuserFrom('advisor_plans')
      .select('id, summary, plan_steps(id, title, status)')
      .order('created_at', { ascending: false })
      .limit(5);
    expect(plans.error).toBeNull();
    expect(plans.data.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(plans.data[0].plan_steps)).toBe(true);
    expect(plans.data[0].plan_steps.length).toBeGreaterThanOrEqual(3);

    const countOnly = await superuserFrom('daily_metrics').select('day', { count: 'exact', head: true });
    expect(countOnly.error).toBeNull();
    expect(countOnly.data).toBeNull();
    expect(countOnly.count).toBeGreaterThanOrEqual(60);
  });

  it('handles RPCs (API keys, metrics ingestion, handoff links) and Edge Functions', async () => {
    activateSuperuserSession();

    const keyRes = await superuserRpc('create_api_key');
    expect(keyRes.error).toBeNull();
    expect(keyRes.data).toMatch(/^va_test_metrics_/);

    const ingestRes = await superuserRpc('ingest_metrics', {
      p_api_key: keyRes.data,
      p_rows: [{ date: '2026-11-25', revenue: 49.5, purchases: 2 }],
    });
    expect(ingestRes.error).toBeNull();
    expect(ingestRes.data).toBe(1);

    const plansBefore = await superuserFrom('advisor_plans').select('id');
    const handoffsRes = await superuserFrom('handoffs').select('id').limit(1).single();
    const linkRes = await superuserRpc('create_handoff_link', { p_handoff: handoffsRes.data.id, p_days: 7 });
    expect(isLocalHandoffToken(linkRes.data.token)).toBe(true);

    const shared = await superuserRpc('get_shared_handoff', { p_token: linkRes.data.token });
    expect(shared.data.status).toBe('ok');
    expect(shared.data.handoff.id).toBe(handoffsRes.data.id);

    const genPlan = await superuserCallFunction('ai-advisor', { mode: 'plan', period_days: 30, focus: 'revenue' });
    expect(genPlan.status).toBe(200);
    expect(genPlan.data.plan.plan_steps.length).toBe(3);

    const plansAfter = await superuserFrom('advisor_plans').select('id');
    expect(plansAfter.data.length).toBe(plansBefore.data.length + 1);

    const repos = await superuserCallFunction('engine', { action: 'github_repos' });
    expect(repos.status).toBe(200);
    expect(repos.data.repos.length).toBeGreaterThanOrEqual(1);

    const repo = (await superuserFrom('engine_repos').select('id').limit(1).single()).data;
    const runRes = await superuserCallFunction('engine', {
      action: 'run',
      repo_id: repo.id,
      module: 'preflight',
      target: { kind: 'branch', ref: 'main' },
    });
    expect(runRes.status).toBe(200);
    expect(runRes.data.run_id).toBeTruthy();
  });
});
