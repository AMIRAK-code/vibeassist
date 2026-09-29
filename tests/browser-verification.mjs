// Optional end-to-end verification. Requires a running Vite server and agent-browser on PATH.
// Set AGENT_BROWSER_BIN to the native executable if it is not on PATH.
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const executable = process.env.AGENT_BROWSER_BIN || "agent-browser";
const base = process.env.VIBEASSIST_URL || "http://127.0.0.1:5173";
const output = path.resolve("verification");
mkdirSync(output, { recursive: true });
const checks = [];
function run(...args) {
  const result = spawnSync(
    executable,
    [
      "--session",
      process.env.VIBEASSIST_BROWSER_SESSION || "vibeassist-build",
      "--json",
      ...args,
    ],
    { encoding: "utf8", timeout: 45000, windowsHide: true },
  );
  if (result.error) throw result.error;
  const lines = result.stdout.trim().split("\n");
  let parsed;
  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      if ("success" in item) parsed = item;
    } catch {}
  }
  if (result.status !== 0 || !parsed?.success)
    throw new Error(`${args[0]}: ${result.stderr || result.stdout}`);
  return parsed.data;
}
const evaluate = (code) => run("eval", code).result;
function snapshot() {
  run("snapshot", "-i");
}
function open(route) {
  run("open", base + route);
  run("wait", "h1");
  snapshot();
}
function clickText(text) {
  assert.equal(
    evaluate(
      `(() => { const el = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`,
    ),
    true,
    `Button: ${text}`,
  );
  snapshot();
}
function record(name, details = {}) {
  checks.push({ name, passed: true, ...details });
  console.log(`PASS ${name}`);
}
function layout(route, width) {
  run("set", "viewport", String(width), "900");
  open(route);
  const dimensions = evaluate(
    `({width: innerWidth, scroll: document.documentElement.scrollWidth, mainTop: document.querySelector('.main-content')?.getBoundingClientRect().top, heading: document.querySelector('h1')?.textContent, overlay: Boolean(document.querySelector('vite-error-overlay'))})`,
  );
  assert.ok(
    dimensions.scroll <= width + 1,
    `${route} overflows at ${width}: ${dimensions.scroll}`,
  );
  assert.equal(dimensions.overlay, false);
  assert.ok(dimensions.heading);
  if (route === "/dashboard" && width <= 768)
    assert.ok(
      dimensions.mainTop < 100,
      `Header occupies ${dimensions.mainTop}px`,
    );
  record(`${route} at ${width}px`, dimensions);
}
try {
  open("/");
  evaluate("localStorage.clear()");
  open("/onboarding");
  clickText("Choose a data source");
  assert.equal(
    evaluate(
      "document.querySelector('#project-name').getAttribute('aria-invalid')",
    ),
    "true",
  );
  run("fill", "#project-name", "Launch Lab");
  run("select", "#project-platform", "Android");
  clickText("Choose a data source");
  run("check", 'input[value="google"]');
  clickText("Back to project");
  assert.equal(
    evaluate("document.querySelector('#project-name').value"),
    "Launch Lab",
  );
  assert.equal(
    evaluate("document.querySelector('#project-platform').value"),
    "Android",
  );
  clickText("Choose a data source");
  assert.equal(
    evaluate("document.querySelector('input[value=google]').checked"),
    true,
  );
  record("Onboarding validates and preserves Back/Next choices");
  clickText("Skip for now");
  run("wait", ".empty-state");
  assert.ok(
    evaluate(
      "document.body.innerText.includes('Your project is ready. Your data comes next.')",
    ),
  );
  record("Skip opens the empty overview without fake data");
  clickText("Explore with sample data");
  run("wait", ".metric-value");
  assert.deepEqual(
    evaluate(
      "[...document.querySelectorAll('.metric-value')].map(el => el.textContent)",
    ),
    ["$19,550", "30,406"],
  );
  run("select", "#metric-period", "3");
  assert.deepEqual(
    evaluate(
      "[...document.querySelectorAll('.metric-value')].map(el => el.textContent)",
    ),
    ["$7,770", "12,900"],
  );
  clickText("Downloads");
  assert.equal(
    evaluate("document.querySelector('#chart-title').textContent"),
    "Downloads by day",
  );
  run("click", "summary");
  assert.equal(
    evaluate("document.querySelector('tfoot').innerText.includes('12,900')"),
    true,
  );
  record("Metric switches, selected periods, cards and table reconcile");
  run("reload");
  run("wait", ".metric-value");
  assert.ok(
    evaluate(
      "location.pathname === '/dashboard' && document.body.innerText.includes('Launch Lab')",
    ),
  );
  record("Workspace survives a reload");
  run("set", "viewport", "390", "844");
  run("click", ".mobile-header button");
  snapshot();
  assert.equal(
    evaluate(
      "document.querySelector('dialog').open && document.body.style.overflow === 'hidden'",
    ),
    true,
  );
  run("focus", "dialog button");
  run("press", "Shift+Tab");
  assert.equal(
    evaluate("document.activeElement.classList.contains('preview-link')"),
    true,
  );
  run("press", "Tab");
  assert.equal(
    evaluate("document.activeElement.getAttribute('aria-label')"),
    "Close navigation",
  );
  run("press", "Escape");
  assert.equal(
    evaluate(
      "!document.querySelector('dialog').open && document.activeElement === document.querySelector('.mobile-header button') && document.body.style.overflow !== 'hidden'",
    ),
    true,
  );
  record(
    "Drawer traps focus, closes with Escape, restores focus and scrolling",
  );
  run("click", ".mobile-header button");
  run("click", 'dialog a[href="/integrations"]');
  snapshot();
  assert.equal(
    evaluate(
      "location.pathname === '/integrations' && !document.querySelector('dialog').open",
    ),
    true,
  );
  assert.equal(
    evaluate(
      "document.querySelector('dialog a[aria-current=page]').textContent.trim()",
    ),
    "Connections",
  );
  record("Drawer navigation closes and marks the active destination");
  run("click", ".mobile-header button");
  const drawerAudit = run("a11y", "--tags", "wcag2a,wcag2aa,wcag21a,wcag21aa");
  assert.equal(drawerAudit.counts.violations, 0);
  run("screenshot", path.join(output, "navigation-390.png"));
  run("press", "Escape");
  record("Open mobile drawer accessibility scan", { violations: 0 });
  clickText("Preferred source");
  clickText("Set as preferred source");
  run("reload");
  snapshot();
  assert.ok(
    evaluate("document.querySelector('button[aria-pressed=true]') !== null"),
  );
  record("Connection preferences persist without connecting an account");
  for (const width of [320, 390, 768, 1440]) {
    for (const route of [
      "/",
      "/onboarding",
      "/dashboard",
      "/integrations",
      "/ai-analyzer",
      "/publishing",
      "/newsletter",
      "/ads",
      "/orchestrator",
      "/premium",
    ])
      layout(route, width);
    open("/");
    run("screenshot", path.join(output, `landing-${width}.png`), "--full");
    open("/dashboard");
    run("wait", ".metric-value");
    run("screenshot", path.join(output, `overview-${width}.png`), "--full");
    open("/onboarding");
    clickText("Choose a data source");
    assert.ok(
      evaluate("document.documentElement.scrollWidth <= innerWidth + 1"),
    );
    run(
      "screenshot",
      path.join(output, `onboarding-source-${width}.png`),
      "--full",
    );
    record(`Onboarding source selection at ${width}px`);
  }
  for (const route of [
    "/",
    "/onboarding",
    "/dashboard",
    "/integrations",
    "/ai-analyzer",
    "/publishing",
    "/newsletter",
    "/ads",
    "/orchestrator",
    "/premium",
  ]) {
    open(route);
    const result = run("a11y", "--tags", "wcag2a,wcag2aa,wcag21a,wcag21aa");
    writeFileSync(
      path.join(output, `a11y-${route.replaceAll("/", "") || "landing"}.json`),
      JSON.stringify(result, null, 2),
    );
    assert.equal(
      result.counts.violations,
      0,
      `Accessibility violations on ${route}`,
    );
    record(`Accessibility scan ${route}`, {
      violations: result.counts.violations,
      manualReview: result.counts.incomplete,
    });
  }
  open("/dashboard");
  run("set", "media", "light", "reduced-motion");
  assert.equal(
    evaluate(
      "getComputedStyle(document.querySelector('.btn')).transitionDuration",
    ),
    "0s",
  );
  record("Reduced motion disables transitions");
  writeFileSync(
    path.join(output, "browser-results.json"),
    JSON.stringify(checks, null, 2),
  );
  assert.deepEqual(run("errors").errors, []);
  record("No browser runtime errors");
} finally {
  run("close");
}
