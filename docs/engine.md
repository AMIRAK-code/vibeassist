# Anti-Fragile Engine: setup

The engine works in three parts:

| Part | Where it runs | What it needs |
|---|---|---|
| Pre-flight Scanner, Red Team, Context & Drift | `engine` Edge Function, against GitHub | A fine-grained GitHub token for each user (pasted on the page). Red Team and written drift rules also need Claude. |
| Mutation Validator, Vision Grounding, Snapshot Engine | The user's own GitHub Actions (`github-action/`), reporting to `engine-ingest` | An engine key saved as the `VIBEASSIST_KEY` repository secret, and the action published as a public repo |
| Smart Token Gateway | `gateway` Edge Function | The user's own provider keys, routes and gateway keys, all set up on the page |

## Deploy

1. Apply `supabase/migrations/20261008150000_engine.sql`. It only touches `public`, plus
   VibeAssist's own Vault secret names (`github_token:…`, `gateway_key:…`). It doesn't add any
   extensions.
2. Deploy the functions:
   - `engine`, with JWT checks on.
   - `engine-ingest` and `gateway`, with **JWT checks off**. GitHub and apps call them with
     VibeAssist keys, which the functions check themselves.
3. The website must be deployed after the migration. Integrations now asks only for
   metrics-scoped API keys, which needs the new `scope` column.

## Who pays for Claude

Engine reviews use the user's own Anthropic key when they've added one under Smart Token
Gateway → Provider keys. In that case they get up to 50 AI runs a day, and runs don't count
against VibeAssist's shared pool.

Otherwise reviews use VibeAssist's `ANTHROPIC_API_KEY`:

- At most 8 AI runs a day (Red Team and written drift rules).
- Each call also counts against the 30-a-day pool the advisor and analyzer share.
- One Red Team run is two Claude calls and costs roughly $0.50–0.80 on Opus.

To cut that cost, set the `ENGINE_MODEL` secret to a smaller model. Engine runs use it; the
analyzer and plans keep the advisor's model.

Pre-flight (secrets, dependencies through OSV.dev, workflow settings) never uses AI and has no
daily cap.

## Limits and housekeeping

- Up to 5 repositories per user.
- Up to 5 gateway keys and 10 provider keys per user.
- Gateway: 60 requests a minute, 5,000 a day.
- Vision checks: 8 a day.
- A run still going after 10 minutes is marked timed out. Red Team on a pull request (rather
  than a whole branch) keeps runs short.
- `engine_prune()` runs now and then from the `engine` function. It deletes run logs and
  gateway usage after 30 days, and runs and findings after 180.

## Testing it end to end

You need a throwaway sandbox repository with:

- a vulnerable pin, for example `lodash@4.17.15` in `package-lock.json`;
- a fake secret, such as an `AKIA` + 16 characters string in a config file;
- an open pull request that builds SQL by joining strings;
- a `CLAUDE.md` with a couple of architecture rules;
- a small Vite app, and the workflow from `github-action/workflow-template.yml` with
  `VIBEASSIST_KEY` set.

Then:

1. Run Pre-flight. You should see the secret, the lodash advisory, and "No tests found" if you
   left tests out.
2. Run Red Team on the pull request. The SQL injection should come back as a verified finding.
3. Use Suggest from CLAUDE.md, add a rule, and run Context & Drift.
4. Push to `main` and watch the Mutation, Vision and Snapshot reports arrive.
5. Add a provider key with a deliberately wrong first target in a route. Call the gateway: the
   reply should come from the second target, and the request should show as a fallback in
   usage.
