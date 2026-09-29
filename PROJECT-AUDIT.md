# VibeAssist project and experience audit

Reviewed: 29 September 2026.

## Assessment

VibeAssist is currently an interactive frontend prototype, not a working business-management service. Its strongest foundation is a small, understandable React application with a recognizable warm background, Outfit typography, pink/cyan identity, and consistent icons. Its main weakness is the gap between what the interface promises and what its actions actually do.

The highest-value next step is to complete one credible journey: create a project, connect a real data source, understand performance, and choose a next action. Adding more top-level features before that journey works would increase complexity without increasing usefulness.

This is a broad source review, not a guarantee that every defect has been found. Backend security, production deployment, real provider connections, payments, and assistive-technology behavior cannot be certified from this repository.

## Scope and verification

- Reviewed all ten page components, routing, shared styles, Firebase setup, entry point, build/lint configuration, package manifests, and promotional rendering scripts. Inspected selected sections of the large promotional HTML rather than treating it as production application code.
- Installed the locked app dependencies with lifecycle scripts disabled. The install reported zero known vulnerabilities; this is a dependency advisory result, not a security audit.
- Production build succeeded: one JavaScript bundle of 670.83 kB, 198.81 kB gzip. Vite warned that the chunk exceeds 500 kB.
- Lint completed with 14 warnings: seven component-definition warnings, six unused imports, and one unused-expression warning in the promotional renderer.
- No automated application test suite or CI configuration was found in the inspected repository.
- Visual/layout conclusions below are source-supported unless explicitly identified as browser-verified. The built-in browser failed to initialize due to a local sandbox helper error; an isolated agent-browser session subsequently enabled the checks recorded below.

## Priorities

| Priority | Meaning | Main work |
|---|---|---|
| P0 | Before presenting this as a working paid service | Truthful demo state; real authentication and payment verification; no unsupported live-data or AI claims |
| P1 | Before broader user testing | Working primary actions; readable theme; mobile navigation; keyboard access; correct metrics; shorter onboarding |
| P2 | Improve usefulness and maintainability | Project model; richer analytics; shared components; data services; contextual recommendations; performance |
| P3 | After the core loop is validated | Broader ad integrations, advanced developer automation, community/news expansion |

## Confirmed functional and trust problems

| ID | Priority | Evidence | Problem and recommendation |
|---|---|---|---|
| F01 | P0 | `src/App.jsx:91`; `src/pages/Onboarding.jsx:39` | Authentication is a component boolean. Signup waits 1.5 seconds and sets it true; no account is created. Introduce an explicit demo mode or implement real signup, sign-in, session restoration, password recovery, and sign-out. |
| F02 | P0 | `src/App.jsx:92`; `src/pages/PremiumPaywall.jsx:9` | Upgrade displays an alert and immediately grants premium. There is no checkout or payment confirmation. Actual paid access must derive from trusted backend subscription state. A frontend guard is only a presentation control. |
| F03 | P1 | `src/App.jsx:91` | Reload resets authentication and premium. Protected deep links redirect to onboarding; intended destination is not preserved. Restore sessions before evaluating guards and return users to the requested page after login. |
| F04 | P1 | `src/pages/Landing.jsx:18` | Sign In and Get Started both open registration. Provide a distinct returning-user path. |
| F05 | P0 | `src/pages/Dashboard.jsx:5`; `src/pages/AdManager.jsx` | Revenue, users, advertising results, and active networks are static and unlabeled. Show a persistent Sample data badge and a way to connect real data. Never imply an account is connected before authorization. |
| F06 | P0 | `src/pages/AIAnalyzer.jsx:17` | Every query receives the same answer, including exact pricing, CPA, and profit claims unrelated to user input. Label it as a demo; real recommendations need supporting inputs, assumptions, dates, and uncertainty. |
| F07 | P1 | `src/pages/Integrations.jsx:5` | Google and custom API start connected without authorization. State is local and resets after navigating away. Use a persisted provider lifecycle: disconnected, authorizing, syncing, connected, stale, failed. |
| F08 | P1 | `src/pages/Integrations.jsx:103` | View API Keys only toggles a boolean; Generate API Key does not generate anything. Implement key management with real credentials, or mark this feature unavailable. |
| F09 | P1 | `src/pages/Landing.jsx:42`; `Dashboard.jsx:23`; `AdManager.jsx:56`; `PublishingGuide.jsx:21`; `Newsletter.jsx:58`; `Orchestrator.jsx:86` | Watch Demo, Refresh Data, campaign management, guides, document generation, newsletter subscription, simulator, and API specs have no handlers. Every visible action should complete a useful task or explain its availability. |
| F10 | P1 | `src/pages/Newsletter.jsx:11` | All community URLs are placeholders, and cards do not render anchors. Replace with genuine source links, dates, and useful summaries. |
| F11 | P1 | `src/pages/PublishingGuide.jsx:30` | The 20-tester statement is outdated. Google's current documentation specifies at least 12 testers continuously opted in for 14 days for the applicable new personal developer accounts. Include applicability, source, and review date rather than a universal rule. |
| F12 | P0 | `src/pages/Landing.jsx:26`; `PremiumPaywall.jsx:104`; `Orchestrator.jsx:61` | “#1”, automatic legal compliance, document generation, active security agents, and scaffolded APIs are not substantiated by the application implementation. Rewrite around delivered capabilities and clearly identify planned capabilities. |
| F13 | P1 | `src/pages/PremiumPaywall.jsx:95` | Annual pricing shows a monthly equivalent but not the full annual charge ($191.88 at the displayed price). The promotional offer omits renewal price and timing. Make total charged, renewal terms, and cancellation behavior explicit. The selected cycle also never reaches a checkout request. |
| F14 | P1 | `src/pages/PremiumPaywall.jsx:23`; `src/App.jsx:120` | Continue Free/close calls `onSkip`, which sets premium false even for an already-premium session revisiting the page. Closing an upsell should not change a subscription. |
| F15 | P1 | `src/pages/PublishingGuide.jsx:62`; `PremiumPaywall.jsx:104` | Document generation is sold as premium but displayed as an ordinary active button on the free publishing page. Align feature availability, previews, and upgrade messaging. |

Source for F11: [Google Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en). Broader legal/store content still needs a separate, jurisdiction- and platform-specific editorial review.

## UI, UX, and design findings

| ID | Priority | Evidence | Finding and better direction |
|---|---|---|---|
| U01 | P1 | `src/index.css:3`; `Dashboard.jsx:79`; `Integrations.jsx:51`; `Orchestrator.jsx:47`; `Landing.jsx:51` | Theme migration is incomplete: pale/white chart axes on a light surface, a white Apple icon, white selected-module text, cyan logs on light cards, and dark inherited text in the landing page's dark preview. Define coherent surface/text pairs and semantic chart colors. |
| U02 | P1 | `src/index.css:9`; `Dashboard.jsx:33` | Bright cyan and pink are used for small text and white-text buttons. Some combinations have poor contrast. Reserve bright accents for decoration and use tested darker variants for text and action fills. Test gradient contrast throughout the area behind text. |
| U03 | P1 | `src/index.css:60` | Every panel lifts on hover, including noninteractive metrics and containers. This falsely suggests clickability and moves nested UI under the pointer. Apply motion only to actual interactive elements. |
| U04 | P2 | `src/index.css:45` | Heavy inset and outer shadows on almost every card flatten the hierarchy: everything competes for attention. Use calm white surfaces, subtle borders, restrained elevation, and stronger typography for the main result. Preserve the brand in selected accents. |
| U05 | P1 | `src/index.css:234` | On mobile the full seven-link sidebar becomes a full-width block above the content. Use a compact header with an accessible navigation drawer; keep project context and the primary action immediately visible. |
| U06 | P1 | `src/pages/Landing.jsx:11,29`; `Newsletter.jsx:56`; `PremiumPaywall.jsx:47` | Fixed 72px hero type, nonwrapping action rows, fixed padding, and horizontal input/button pairs risk overflow at narrow widths. Global `overflow-x: hidden` can conceal clipped content. Use fluid type, wrapping/stacking, `min-width: 0`, and test 320–1440px plus zoom. Exact clipping requires runtime verification. |
| U07 | P1 | `src/pages/Onboarding.jsx:82`; `PremiumPaywall.jsx:33`; `AIAnalyzer.jsx:83`; `Orchestrator.jsx:30` | Most form labels lack programmatic association; icon-only close/send controls have no accessible name; module selectors are clickable divs without keyboard behavior. Use native controls, linked labels, and clear selected/focus states. |
| U08 | P1 | `src/App.jsx:76`; `src/index.css:143`; `Onboarding.jsx:189` | No main landmark or skip link, no `aria-current` for navigation, faint custom input focus, and no announced error/loading state. Add landmarks, visible focus, field error associations, and appropriate live announcements. |
| U09 | P2 | `src/index.css:242` | Animations and widespread movement have no reduced-motion preference handling. Respect reduced motion and eliminate unnecessary container animation. |
| U10 | P1 | `src/pages/Onboarding.jsx` | Three steps collect age, ambitions, and profit expectations before demonstrating value. There is no Back control or explicit optional-step skip. Start with the project and one useful outcome; defer profile questions that do not influence the experience. |
| U11 | P1 | `src/pages/Onboarding.jsx:6,130,166` | Experience defaults to `Beginner`, but no option has that value. Email is described as optional “if skipping save” without a skip-save path, while Create Account succeeds without email. Match defaults and options; separate demo exploration from account creation. |
| U12 | P1 | `src/pages/Onboarding.jsx:191` | Inputs are not in a submitted form; email validity is not checked by a form submission; errors appear only after clicking. Add an actual form, autocomplete hints, accessible inline validation, and password visibility. The error's `borderColor` has no effect while `.input-field` uses `border: none`. |
| U13 | P1 | `src/pages/Dashboard.jsx:5,41` | Daily downloads sum to 30,406, while the total card says 30,288. Revenue does reconcile to 19,550. Compute cards and charts from the same period and dataset. |
| U14 | P1 | `src/pages/Dashboard.jsx:67` | Dollars and downloads share one unlabeled y-axis; there is no visible legend or unit formatting. Prefer a Revenue/Downloads metric switch with appropriate units, or separate aligned charts. Add date range, comparison range, and a text/table alternative. |
| U15 | P1 | `src/pages/Dashboard.jsx:64` | A 100%-height chart sits alongside a heading inside a fixed-height padded panel. The heading is not deducted from the chart allocation, creating an overflow risk. Give the plot its own bounded container. |
| U16 | P2 | `src/pages/Dashboard.jsx:20` | “Empire HUD” and “vibes across all platforms” obscure the task. “Overview” and “Revenue and growth across your products” are easier to understand. Add data freshness, project selection, and a next-action area. |
| U17 | P1 | `src/App.jsx:24` | Integrations are entirely paid while the free dashboard has no way to acquire real data. Let users connect one source or import a dataset so the free tier delivers a complete useful loop. |
| U18 | P2 | `src/App.jsx:20` | Navigation prioritizes income, legal content, and news before data setup and recommendations. It mixes developer infrastructure and commercial operations. Organize around user tasks and move secondary content out of primary navigation. |
| U19 | P1 | `src/pages/AIAnalyzer.jsx` | There is no thinking state, failure state, retry/cancel, preserved conversation, or automatic scroll. Newlines in the plain-string response collapse in normal HTML. Use structured output or safe formatted rendering, a multiline composer, and conversation persistence. Ignore whitespace-only input. |
| U20 | P2 | `src/pages/Newsletter.jsx:43` | An external search iframe is an uncontrolled experience, with no loading/failure fallback. Embedding may also be restricted by the remote service; this was not browser-confirmed. Prefer a curated source feed or an explicit external link. |
| U21 | P2 | `src/pages/Orchestrator.jsx` | Infrastructure terminology and internal implementation-phase instructions are shown as customer-facing content. If retained, explain an outcome such as “Check your app before launch,” then show findings, evidence, severity, and fixes. |
| U22 | P1 | Cross-page | Real empty/loading/error/stale/offline states are missing because screens assume successful sample data. Design these before adding live integrations; otherwise real usage will feel less polished than the prototype. |

Accessibility reference: [WCAG 2.2](https://www.w3.org/TR/wcag/). Use normal-text contrast of at least 4.5:1, applicable large-text contrast of 3:1, visible keyboard focus, reflow, and appropriately sized targets as acceptance criteria. This review is not a formal conformance assessment.

## Engineering and operational findings

1. **Route guards are defined inside App.** Lint flags this seven times. Parent rerenders recreate their component identity, potentially remounting children and resetting state. Move them to stable definitions and use one shared layout/outlet.
2. **No working data/service layer.** `firebase.js` contains placeholder configuration and is not imported by the app. Connecting it alone will not implement provider data, billing, permissions, or background sync. Define a small authenticated backend and provider adapters around the chosen first journey. Client Firebase configuration is not itself a server secret; credentials used to access third-party services belong server-side.
3. **Every page is eagerly imported.** The charting code ships with the landing page. Split route bundles and load heavy visualization code on demand; then measure startup on a slower device/network. The current bundle warning is a confirmed output, not a measured poor Core Web Vitals score.
4. **Styling is dispersed through inline declarations.** Shared buttons, cards, form fields, page headers, and status badges should become reusable components with explicit variants.
5. **Unresolved design primitives.** `--panel-border` is referenced but never defined. `gap-2`, `mt-2`, `mb-2`, `mt-8`, and `mt-auto` are used without definitions in the loaded stylesheet. `App.css` contains unused template styles and is not imported. Audit tokens/utilities rather than patching each page independently.
6. **No reliability safeguards were found.** Add focused tests for sign-in/session restoration, free/premium permissions, onboarding validation, navigation persistence, metric reconciliation, and keyboard-critical actions. Introduce error boundaries, application error reporting, and CI build/lint checks as real services arrive.
7. **No production runbook.** README is the React/Vite template. Document local setup, configuration, demo/live modes, deployment, SPA route fallback requirements, testing, and integration limitations. Confirm deep-link handling on the eventual host; it was not tested here.
8. **Metadata remains skeletal.** Add an informative page title, description, social preview, and route-specific titles. Inspect the included template assets before shipping; remove unused starter files.
9. **Promo tooling is machine-specific.** Chrome is hardcoded to one Windows path; file paths are derived from URL pathname manipulation rather than `fileURLToPath`; no separate promo lockfile was found. Make browser paths configurable, use URL-safe path conversion, lock dependencies, and validate numeric render arguments.
10. **Promo render recovery is weak.** Browser workers lack `try/finally` cleanup; shared output frames are cleared at startup, so concurrent runs can collide. Use per-run output folders and deterministic cleanup. During playback, arrow-key changes to the current time do not update the playback clock or audio position, so the next animation tick can override the seek. Paused stepping does render. Re-rendering was not performed.

## Recommended product direction

Working hypothesis: serve solo builders who already have an app and want to understand what to improve next. Validate this with users before committing to a large rebuild.

**Core promise:** “See how your apps are doing, and what to improve next.”

**First useful session:** choose a project → connect one source or explore clearly labeled sample data → see understandable metrics → inspect one supported recommendation → save a next action.

| Area | Suggested navigation | Purpose |
|---|---|---|
| Daily work | Overview | Performance, freshness, important changes, next action |
| Investigation | Analytics | Trends, product/source breakdowns, metric definitions |
| Decisions | Recommendations | Evidence-backed opportunities and experiments |
| Setup | Connections | Authorization, sync health, permissions, reconnect |
| Launch preparation | Launch checklist | Platform-specific tasks, source links, saved progress |
| Secondary menu | Settings, billing, help | Account, workspace, subscription, support |

News can sit under Resources. Defer or separate the developer orchestrator unless user research shows it belongs to this same workflow. Rename “Legal & Publishing” to a bounded launch-preparation experience; do not imply that a checklist certifies compliance.

## Visual design direction

Keep the warm off-white canvas, Outfit font, friendly tone, and pink/cyan signature. Make the working interface calmer and more precise:

- **Surfaces:** off-white canvas, white cards, visible neutral borders, shallow shadows only when helpful. Use generous whitespace between sections, tighter spacing inside related content.
- **Hierarchy:** one strong page title, one primary action, a short explanatory subtitle, then the main result. Let metrics be visually stronger than card decoration.
- **Type:** fluid marketing headings; restrained application headings; readable body text; tabular numerals for money and percentages. Avoid tiny, bright status text.
- **Color:** use one accessible primary action color. Reserve gradients for the logo, hero emphasis, or occasional decorative accent. Separate success, warning, error, selection, and brand colors.
- **Components:** consistent heights, corner radii, icon sizes, focus rings, loading states, empty states, and disabled styling. Avoid borders that exist only through barely visible shadows.
- **Motion:** brief feedback for user actions; no hover lift on static panels; reduced-motion support.
- **Mobile:** compact header and drawer, vertically stacked forms/actions, scrollable tables where necessary, readable chart labels, no hidden overflow as a substitute for layout.

## Screen-by-screen redesign brief

| Screen | Proposed change | Acceptance signal |
|---|---|---|
| Landing | Concrete outcome-led headline, actual product preview, working demo, clear capabilities/pricing, real sign-in | A new visitor can explain what the product does and choose the right entry point |
| Onboarding | Account/demo choice, project details, connect or skip; Back and named progress steps | A user reaches useful information without answering unrelated profile questions |
| Pricing | Show value after first use; clear free limitations, total annual charge, renewal terms | Users can explain what they will pay and what they receive before proceeding |
| Overview | Project/date selectors, data health, reconciled metric cards, one main chart, next-action list | Users can identify what changed and what to do next |
| Connections | Provider identity, account name, scopes, last sync, status, retry/reconnect | Users know whether their data is current and can recover from failure |
| Advisor | Suggested questions and structured recommendations: evidence, assumption, action, expected outcome | Every recommendation can be traced to inputs; unavailable data is explicit |
| Ads | Campaign table with spend, revenue, ROAS, status and filters; clear supported networks | Users can find an underperforming campaign and complete the intended action |
| Launch | Platform selector, task checklist, blockers, authoritative sources, review dates | Users can save progress and understand what remains |
| News | Small curated feed with dates, sources, working links, preferences | Every story opens correctly and subscriptions provide clear feedback |
| Orchestrator | Either defer, or show a genuine scan workflow with readable results | A user can run a real check and understand a specific finding |

## Brainstorm: useful differentiators

These are hypotheses to prototype and validate, not claims of proven demand.

1. **Weekly “what changed?” brief:** summarize major movements, their data sources, and one useful next step. More actionable than four static totals.
2. **Recommendation → experiment:** turn a suggested pricing or marketing change into a saved hypothesis, baseline, target, review date, and measured result.
3. **Data confidence panel:** show which sources are current or missing and how gaps affect a conclusion. Trust can be a product feature.
4. **Project-specific launch checklist:** derive tasks from platform and monetization choices; persist progress and link each rule to its source.
5. **Assumption editor:** let users adjust conversion, price, and acquisition cost in a forecast and see how results change. Show assumptions before predictions.
6. **Metric explanation drawer:** define revenue, active users, conversion, CAC, and ROAS, including period and denominator, directly where people read them.
7. **Portfolio overview:** once single-project analytics work, compare products by a consistent metric and period without mixing currencies or definitions.
8. **One-source free tier:** let users experience a complete workflow; charge for additional sources, history, collaboration, or more advanced analysis after value is evident.

## Delivery order and checks

**Pass 1 — Credible prototype:** explicit demo labels, no unsupported claims, repair/remove dead actions, fix token/theme bugs, reconcile sample metrics, correct published guidance. Exit: every visible primary action has a defined outcome.

**Pass 2 — Experience foundation:** shared components, accessible forms, mobile shell, clearer navigation, shorter onboarding, real empty/error/loading states. Exit: complete the main demo journey using keyboard only and at 320px, 390px, 768px, and 1440px, including zoom/reduced-motion checks.

**Pass 3 — One working vertical slice:** real account/session, project persistence, one provider connection, real metrics, one defensible recommendation. Exit: reload and navigation preserve state; expired credentials recover; cards reconcile to charts.

**Pass 4 — Monetization and expansion:** real billing/entitlements, transparent pricing, additional connections and workflows based on observed use. Exit: canceled/failed checkout grants no paid entitlement, confirmed subscription does, and billing changes synchronize reliably.

Track time to first useful result, successful connection rate, onboarding completion, recommendation saves/completions, return usage, and support requests. Establish a baseline before inventing numerical targets. A decorative redesign alone will not fix the missing product loop.


## Browser-verified evidence

The isolated browser successfully exercised landing → onboarding → free plan → dashboard. No real account or purchase was created.

- Blank-email signup succeeds with a demo password.
- The pricing close control appears as an unnamed button in the accessibility snapshot.
- The desktop dashboard shows nearly invisible axis labels and a dark tooltip heading against a dark tooltip background.
- At 390 × 844, the mobile navigation occupies the first 612px; the dashboard heading and first metric only appear below it.
- Reloading `/dashboard` redirects to `/onboarding`, confirming session loss.
- Captured evidence: [desktop landing](audit-landing.png), [desktop dashboard](audit-dashboard.png), [mobile dashboard](audit-mobile.png), [mobile landing](audit-landing-mobile.png).

These checks do not cover every premium screen, every viewport, screen readers, or real provider/payment behavior. Findings for those areas remain source-based.

- The 390px landing screenshot confirms the Get Started button is clipped at the right edge and the fixed-size hero consumes most of the first screen.
