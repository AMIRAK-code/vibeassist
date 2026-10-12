# VibeAssist Anti-Fragile Engine action

The three Anti-Fragile Engine modules that have to run your code live here. Each one reports
to your VibeAssist account, and the results show on the Anti-Fragile Engine page next to the
checks VibeAssist runs itself (Pre-flight, Red Team, Context & Drift).

| Module | What it does |
|---|---|
| `mutation` | Mutates the changed source files and checks your tests catch it, using Stryker (vitest or jest) or mutmut (pytest). It reports the mutation score, the mutants that survived, and test files that can never fail. It stops after `mutate-timeout-minutes`. |
| `vision` | Starts your app and takes screenshots at 390, 768 and 1440 px with Playwright (6 at most). It checks for overflow, broken images and console errors. VibeAssist then asks Claude to look at the screenshots for layout problems. |
| `snapshot` | On a passing push to the default branch, tags the commit `vibe-snapshot-<time>-<sha>` and keeps the newest 30 tags. The Engine page lists them with rewind steps. |

## Set it up

1. Publish this folder as a **public** repository, for example `your-name/vibeassist-engine`, and
   tag it `v1`. Actions in private repositories can't be used from other repositories.
2. On the Anti-Fragile Engine page, add your repository, then create an **engine key**.
3. In your repository, go to Settings → Secrets and variables → Actions and add the key as
   `VIBEASSIST_KEY`.
4. Copy `workflow-template.yml` to `.github/workflows/vibeassist.yml` and replace `OWNER`.

Pull requests from forks don't get secrets, so they run the checks without reporting.

## Local hooks

```bash
sh path/to/vibeassist-engine/hooks/install.sh
```

On Windows, use `hooks/install.ps1` instead. It installs:

- **pre-commit:** a secret scan of the lines you're committing, with the same patterns as the
  Pre-flight Scanner.
- **post-commit:** a local checkpoint under `refs/vibe/checkpoints/` after every commit.
- **`.vibeassist/vibe-rewind`:** run it to list checkpoints and snapshot tags, or as
  `vibe-rewind <name>` to start a new branch from one. Your current work is never touched.

`scripts/secret-patterns.json` must stay identical to
`supabase/functions/_shared/engine/secret-patterns.json`. A test checks this.
