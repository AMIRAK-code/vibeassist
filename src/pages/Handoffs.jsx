import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/auth';
import { useToast } from '../components/ui/toast-context';
import { friendlyError, supabase } from '../lib/supabase';
import { formatDateTime } from '../lib/format';
import { aiLabel, effectiveAiChoice } from '../lib/engine';
import { LIMITS, sourceLabel } from '../lib/handoffs';
import PageHeader from '../components/ui/PageHeader';
import Notice from '../components/ui/Notice';
import HandoffCreate from '../components/handoffs/HandoffCreate';
import HandoffView from '../components/handoffs/HandoffView';

// Context Handoffs: carry a conversation from one AI, account or device to another
export default function Handoffs() {
  const { hasPremium } = useAuth();
  const toast = useToast();
  const [handoffs, setHandoffs] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [ai, setAi] = useState({ label: "VibeAssist's Claude", ownKey: false });
  const [runsLeft, setRunsLeft] = useState(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 864e5).toISOString();
    const [list, settings, keys, handoffRuns, allRuns] = await Promise.all([
      supabase.from('handoffs').select('*').order('created_at', { ascending: false }),
      supabase.from('engine_ai_settings').select('*').maybeSingle(),
      supabase.from('gateway_provider_keys').select('id, provider, label, key_prefix, created_at').order('created_at'),
      supabase.from('ai_usage').select('id', { count: 'exact', head: true }).eq('feature', 'handoff').gte('created_at', since),
      supabase.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', since),
    ]);
    if (list.error) {
      setLoadError(friendlyError(list.error, 'Could not load your handoffs.'));
      setHandoffs((h) => h ?? []);
      return;
    }
    setLoadError('');
    setHandoffs(list.data);

    // The same choice of AI the handoffs function makes: Engine AI, else VibeAssist's Claude
    const providerKeys = keys.data ?? [];
    const { keyId } = effectiveAiChoice(settings.data ?? null, providerKeys);
    const ownKey = providerKeys.some((k) => k.id === keyId);
    setAi({ label: aiLabel(settings.data ?? null, providerKeys), ownKey, canChoose: hasPremium });
    if (ownKey) {
      const today = list.data.filter((h) => h.method === 'ai' && h.created_at >= since).length;
      setRunsLeft(Math.max(0, LIMITS.ownPerDay - today));
    } else {
      setRunsLeft(Math.max(0, Math.min(LIMITS.sharedPerDay - (handoffRuns.count ?? 0), 30 - (allRuns.count ?? 0))));
    }
  }, [hasPremium]);

  useEffect(() => {
    load();
  }, [load]);

  const created = (handoff) => {
    setSelectedId(handoff.id);
    load();
    toast.show({ message: 'Handoff saved. Use "Copy for another AI" to carry it over.' });
  };

  const remove = async (handoff) => {
    const { error } = await supabase.from('handoffs').delete().eq('id', handoff.id);
    if (error) {
      toast.show({ message: friendlyError(error, 'Could not delete the handoff. Try again.'), tone: 'error' });
      return;
    }
    if (selectedId === handoff.id) setSelectedId(null);
    await load();
    toast.show({
      message: `Deleted “${handoff.title}”.`,
      actionLabel: 'Undo',
      onAction: async () => {
        const { id, title, source, method, sections, conversation_date, message_count, model, created_at } = handoff;
        const { error: undoError } = await supabase.from('handoffs').insert({ id, title, source, method, sections, conversation_date, message_count, model, created_at });
        if (undoError) toast.show({ message: 'Could not restore the handoff. Its share links are gone either way.', tone: 'error' });
        else setSelectedId(id);
        await load();
      },
    });
  };

  const selected = handoffs?.find((h) => h.id === selectedId) ?? handoffs?.[0] ?? null;
  const limit = hasPremium ? LIMITS.premiumHandoffs : LIMITS.freeHandoffs;
  const atLimit = (handoffs?.length ?? 0) >= limit;

  return (
    <>
      <PageHeader
        title="Context Handoffs"
        description="Carry a conversation from one AI, account or device to another, without starting over."
      />
      {loadError && <Notice tone="error" actions={<button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{loadError}</Notice>}

      <HandoffCreate atLimit={atLimit} hasPremium={hasPremium} ai={ai} runsLeft={runsLeft} onCreated={created} onMaybeLater={() => setTimeout(load, 60_000)} />

      {handoffs === null ? (
        <div className="skeleton section" style={{ height: 120 }} aria-busy="true" aria-label="Loading your handoffs" />
      ) : handoffs.length === 0 ? (
        <div className="card empty-state section">
          <h3>No handoffs yet</h3>
          <p>Make one above. Then press “Copy for another AI” and paste it as the first message in your next chat.</p>
        </div>
      ) : (
        <div className="legal-docs section">
          <div>
            <ul className="card card--flush legal-doc-list" aria-label="Your handoffs">
              {handoffs.map((h) => (
                <li key={h.id}>
                  <button type="button" aria-current={selected?.id === h.id ? 'true' : undefined} onClick={() => setSelectedId(h.id)}>
                    <strong>{h.title}</strong>
                    <span className="field-help">{sourceLabel(h.source)} · {formatDateTime(h.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!hasPremium && <p className="field-help" style={{ marginTop: 8 }}>{handoffs.length} of {LIMITS.freeHandoffs} handoffs used on the Free plan.</p>}
          </div>
          {selected && (
            <HandoffView
              key={selected.id}
              handoff={selected}
              hasPremium={hasPremium}
              onSaved={(updated) => setHandoffs((list) => list.map((h) => (h.id === updated.id ? updated : h)))}
              onDelete={remove}
            />
          )}
        </div>
      )}
    </>
  );
}
