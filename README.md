# VibeAssist

A responsive, local-first product workspace preview for independent makers. Built with React, Vite, React Router, and Recharts.

## Run locally

Use Node.js 24 (the version used for verification), then:

```sh
npm ci
npm run dev
```

## What works

- Two-step project setup with Back, skip, sample-data exploration, and inline validation.
- Browser-local project/platform/source preferences, restored on reload. No account is created.
- Sample revenue/download metrics derived from a single dataset, period selection, separate chart units, and a daily data table.
- Accessible mobile navigation drawer and desktop navigation organized around Overview, Connections, Recommendations, and Launch checklist.
- Secondary Growth, Resources, and Tools areas. Existing route URLs are preserved.
- Explicit empty states and planned-feature explanations instead of simulated live services.

Live data connections, authentication, paid billing, AI analysis, ad management, legal document generation, and developer scans are **not implemented**. Selecting a provider only saves a preference. Clearing browser storage removes the local project. No secrets or provider credentials should be entered into this preview.

## Checks

```sh
npm test
npm run build
npm run lint
```

Unit tests cover metric reconciliation, onboarding transitions, storage restoration, and theme contrast. The app build lazy-loads the charting code. One existing lint warning remains in the unrelated `promo/render.mjs` renderer.

### Browser verification

`tests/browser-verification.mjs` exercises the user journey, keyboard drawer behavior, all ten pages at 320/390/768/1440px, reduced motion, and automated accessibility checks. It saves reports/screenshots in `verification/` (ignored by Git).

Use a separately installed `agent-browser` CLI; it is not a runtime dependency. With the dev server running, initialize the isolated browser session first:

```sh
agent-browser --session vibeassist-build open http://127.0.0.1:5173/
node tests/browser-verification.mjs
```

Set `AGENT_BROWSER_BIN` to the native CLI executable if it is not on PATH (required for the native Windows runner). Optional variables: `VIBEASSIST_URL` and `VIBEASSIST_BROWSER_SESSION`. The test closes its session when done. It clears local storage only in that isolated browser session.

Representative reviewed screenshots and the verification summary are in `docs/ui/`.

## Deploying the preview

`npm run build` outputs `dist/`. Configure your host to serve `index.html` for application routes so refresh and deep links work. This repository does not configure a production backend or real subscription enforcement.

The original promotional video and rendering tools remain in `promo/`; see its README for their separate setup.
