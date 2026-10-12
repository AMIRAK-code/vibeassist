import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabaseUrl } from '../lib/supabase';
import PageHeader from '../components/ui/PageHeader';

const functions = `${supabaseUrl}/functions/v1`;

const openaiExample = `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.VIBEASSIST_GATEWAY_KEY, // va_…
  baseURL: '${functions}/gateway/v1',
});
const reply = await client.chat.completions.create({
  model: 'smart-default', // a route name
  messages: [{ role: 'user', content: 'Hello' }],
});`;

const anthropicExample = `import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.VIBEASSIST_GATEWAY_KEY, // va_…, sent as x-api-key
  baseURL: '${functions}/gateway',
});
const message = await client.messages.create({
  model: 'claude-route', // a route name that uses the Anthropic format
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});`;

const curlExample = `curl ${functions}/gateway/v1/chat/completions \\
  -H "Authorization: Bearer va_…" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "smart-default", "messages": [{"role": "user", "content": "Hello"}], "stream": true}'`;

const ingestExample = `curl -X POST ${functions}/engine-ingest \\
  -H "Authorization: Bearer va_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "repo": "you/your-app",
    "sha": "<full 40-character commit SHA>",
    "ref": "main",
    "run_url": "https://github.com/you/your-app/actions/runs/123",
    "module": "mutation",
    "status": "succeeded",
    "summary": "Mutation score 82% (41 caught, 9 survived).",
    "stats": { "score": 82 },
    "findings": [
      { "severity": "medium", "title": "Survived: ConditionalExpression", "file": "src/price.ts",
        "line_start": 12, "line_end": 12, "explanation": "The tests still pass with this change.", "fix": "Add a test for the discount branch." }
    ]
  }'`;

// "View API Specs": how apps call the Smart Token Gateway and how CI reports to the engine
export default function OrchestratorApi() {
  return (
    <>
      <PageHeader title="Anti-Fragile Engine API" description="The Smart Token Gateway for your apps, and the report endpoint the GitHub Action uses.">
        <Link to="/orchestrator" className="btn btn-ghost"><ArrowLeft aria-hidden="true" /> Back to the engine</Link>
      </PageHeader>

      <section className="card section api-doc" aria-labelledby="gw-title">
        <h2 id="gw-title" className="card-title">Smart Token Gateway</h2>
        <dl className="api-table">
          <div><dt>Base URL</dt><dd><code>{functions}/gateway/v1</code></dd></div>
          <div><dt>Auth</dt><dd>A gateway key (<code>va_…</code>) as <code>Authorization: Bearer</code> or <code>x-api-key</code>. Create keys on the engine page.</dd></div>
          <div><dt><code>POST /chat/completions</code></dt><dd>OpenAI format, for routes set to OpenAI (OpenAI, OpenRouter, Groq, Gemini, Mistral, DeepSeek).</dd></div>
          <div><dt><code>POST /messages</code></dt><dd>Anthropic format, for routes set to Anthropic.</dd></div>
          <div><dt><code>GET /models</code></dt><dd>Your route names, as a model list.</dd></div>
          <div><dt><code>model</code></dt><dd>A route name. The gateway swaps in each target's real model.</dd></div>
          <div><dt>Fallback</dt><dd>On 408, 409, 429, 5xx, timeouts and connection errors, the next target is tried. One quick retry happens first when a provider says it's ready within 2 seconds. Other errors (400, 401, 403) come back as they are. A stream only falls back before its first byte.</dd></div>
          <div><dt>Streaming</dt><dd><code>"stream": true</code> is passed straight through as server-sent events.</dd></div>
          <div><dt>Response headers</dt><dd><code>x-vibeassist-provider</code> and <code>x-vibeassist-model</code> say which target answered.</dd></div>
          <div><dt>Limits</dt><dd>60 requests a minute and 5,000 a day per account, bodies up to 4 MB, 4 targets per route.</dd></div>
          <div><dt>Errors</dt><dd>401 bad or revoked key (or Premium ended) · 404 unknown route · 400 wrong format for the route · 413 body too large · 429 gateway limit · other codes come from the last provider tried. Bodies follow each SDK's error shape.</dd></div>
          <div><dt>Billing</dt><dd>Requests use your own provider keys; providers bill you directly. VibeAssist stores token counts, not prompts or replies.</dd></div>
        </dl>
        <h3>OpenAI SDK</h3>
        <pre className="code-block">{openaiExample}</pre>
        <h3>Anthropic SDK</h3>
        <pre className="code-block">{anthropicExample}</pre>
        <h3>curl</h3>
        <pre className="code-block">{curlExample}</pre>
      </section>

      <section className="card section api-doc" aria-labelledby="ingest-title">
        <h2 id="ingest-title" className="card-title">Engine report endpoint</h2>
        <p className="field-help">The GitHub Action uses this; you can call it from any CI.</p>
        <dl className="api-table">
          <div><dt><code>POST {functions}/engine-ingest</code></dt><dd>Auth: an engine key (<code>va_…</code>) as <code>Authorization: Bearer</code>. The repository must be added on the engine page first.</dd></div>
          <div><dt><code>module</code></dt><dd><code>mutation</code>, <code>vision</code> or <code>snapshot</code></dd></div>
          <div><dt><code>status</code></dt><dd><code>succeeded</code>, <code>failed</code> or <code>skipped</code></dd></div>
          <div><dt><code>findings[]</code></dt><dd>Up to 200: <code>severity</code> (critical, high, medium, low, info), <code>title</code>, and optionally <code>category</code>, <code>file</code>, <code>line_start</code>, <code>line_end</code>, <code>evidence</code>, <code>explanation</code>, <code>fix</code>. Evidence that looks like a secret is removed.</dd></div>
          <div><dt><code>images[]</code></dt><dd>Vision only: up to 6 JPEG screenshots <code>{'{ url, viewport, data }'}</code> (base64, 1.5 MB each). Your Engine AI checks them for layout problems (choose a model that accepts images); at most 8 checks a day.</dd></div>
          <div><dt><code>snapshot</code></dt><dd>Snapshot only: <code>{'{ tag: "vibe-snapshot-…", branch, checks }'}</code></dd></div>
          <div><dt>Reply</dt><dd><code>{'{ run_id, url }'}</code>, where <code>url</code> opens the run in VibeAssist.</dd></div>
          <div><dt>Errors</dt><dd>401 bad key or Premium ended · 404 repository not added · 400 bad body.</dd></div>
        </dl>
        <pre className="code-block">{ingestExample}</pre>
      </section>
    </>
  );
}
