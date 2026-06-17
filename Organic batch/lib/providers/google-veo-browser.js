/**
 * lib/providers/google-veo-browser.js — L116 B1: Google Veo 3.1 / Imagen via the
 * user's Google AI Pro **Flow** session, driven by Playwright. $0 (the sub's Flow
 * app, ~100 gens/month — NOT the paid Gemini-API Veo).
 *
 * Design (all the $0-safe parts work today; the live Flow DOM step finalizes once the
 * user logs in once):
 *   - PERSISTENT browser context at .runtime-cache/playwright-google so the login
 *     sticks across runs. User logs into labs.google/flow ONE time (headful).
 *   - BUDGET ledger renders/analytics/veo-budget-{month}.json hard-caps at ~100 gens;
 *     over budget → throw `veo_budget_exhausted` so the provider-router cascades to
 *     NVIDIA-FLUX (zero regression).
 *   - CACHE .runtime-cache/veo/{sha1}.{mp4,png}; identical prompt = free re-use.
 *   - GRACEFUL no-op: Playwright missing, GOOGLE_FLOW_SESSION!=1, or no login →
 *     {ok:false, reason} so the cascade falls back. NEVER throws into the render.
 *   - Veo = 8s clips → one clip per hero beat (caller trims/loops to beat length).
 *
 * The Flow selectors are env-overridable (FLOW_PROMPT_SELECTOR, FLOW_SUBMIT_SELECTOR,
 * FLOW_RESULT_SELECTOR) and tolerant — they may need a one-time tweak against the live
 * Flow UI after login; until then the provider cleanly no-ops and FLUX serves.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const CTX_DIR = path.join(ROOT, '.runtime-cache', 'playwright-google');
const CACHE_DIR = path.join(ROOT, '.runtime-cache', 'veo');
// 2026-06-15: Flow's canonical URL moved to /fx/tools/flow/. Old /flow/ still
// redirects but adds a hop that can confuse the loggedIn detection.
const FLOW_URL = process.env.FLOW_URL || 'https://labs.google/fx/tools/flow/';
const MONTHLY_CAP = Number(process.env.VEO_MONTHLY_CAP || 95); // sub gives ~100; leave headroom
const ENABLED = process.env.GOOGLE_FLOW_SESSION === '1';

function ensure(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16); }

// ---- budget ledger --------------------------------------------------------
function budgetFile() { return path.join(ROOT, 'renders', 'analytics', 'veo-budget-' + new Date().toISOString().slice(0, 7) + '.json'); }
function getBudget() {
  try { return JSON.parse(fs.readFileSync(budgetFile(), 'utf8')); } catch (_) { return { used: 0, cap: MONTHLY_CAP }; }
}
function spendBudget(n = 1) {
  ensure(path.dirname(budgetFile()));
  const b = getBudget(); b.used = (b.used || 0) + n; b.cap = MONTHLY_CAP; b.updatedAt = new Date().toISOString();
  try { fs.writeFileSync(budgetFile(), JSON.stringify(b, null, 2)); } catch (_) {}
  return b;
}
function budgetLeft() { const b = getBudget(); return Math.max(0, (b.cap || MONTHLY_CAP) - (b.used || 0)); }

function loadPlaywright() {
  try { return require('playwright'); } catch (_) { return null; }
}

/**
 * @param {object} o {prompt, imagePath?, durationSec=8, kind:'video'|'image'}
 * @returns {Promise<{ok, path?, provider, cached?, reason?, budgetLeft?}>}
 */
async function generate(o = {}) {
  const kind = o.kind === 'image' ? 'image' : 'video';
  const provider = kind === 'image' ? 'google-imagen-flow' : 'google-veo-flow';
  const prompt = String(o.prompt || '').trim();
  if (!prompt) return { ok: false, provider, reason: 'no_prompt' };
  if (!ENABLED) return { ok: false, provider, reason: 'flow_session_disabled (set GOOGLE_FLOW_SESSION=1 + log in once)' };

  // cache hit?
  ensure(CACHE_DIR);
  const ext = kind === 'image' ? 'png' : 'mp4';
  const cachePath = path.join(CACHE_DIR, provider + '-' + sha1(prompt + '|' + (o.imagePath || '') + '|' + (o.durationSec || 8)) + '.' + ext);
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 1000) return { ok: true, path: cachePath, provider, cached: true };

  // budget gate → cascade to FLUX when exhausted
  if (budgetLeft() <= 0) return { ok: false, provider, reason: 'veo_budget_exhausted', budgetLeft: 0 };

  const pw = loadPlaywright();
  if (!pw) return { ok: false, provider, reason: 'playwright_not_installed (npm i playwright && npx playwright install chromium)' };

  let context = null, browser = null;
  const cdp = process.env.GOOGLE_FLOW_CDP; // e.g. http://127.0.0.1:9222 — ATTACH to a real browser you launched + logged into (no automation flag at login = no "not safe" wall)
  const closeCtx = async () => { try { if (cdp && browser) await browser.close(); else if (context) await context.close(); } catch (_) {} }; // on CDP, browser.close() only DISCONNECTS playwright — your browser stays open + logged in
  try {
    let page;
    if (cdp) {
      browser = await pw.chromium.connectOverCDP(cdp);
      context = browser.contexts()[0] || (await browser.newContext());
      const pages = context.pages();
      page = pages.find((p) => /labs\.google|aistudio\.google\.com/.test(p.url() || '')) || pages[0] || (await context.newPage());
      if (!/labs\.google/.test(page.url() || '')) { try { await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 }); } catch (_) {} }
    } else {
      ensure(CTX_DIR);
      context = await pw.chromium.launchPersistentContext(CTX_DIR, { headless: process.env.FLOW_HEADFUL === '1' ? false : true, viewport: { width: 1280, height: 900 } });
      page = context.pages()[0] || (await context.newPage());
      await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    }

    // login wall detection — race three signals so we are robust to Flow UI
    // changes: (a) a textbox/prompt box appearing (editor view), (b) a "Create"
    // button (landing or editor), (c) a "New project" button (landing). If NONE
    // of these are visible within 20s, treat as not-logged-in. 2026-06-15: the
    // old 8s text-regex was too tight (text changed; new URL adds a redirect).
    const loggedIn = await Promise.race([
      page.locator('[role="textbox"], textarea').first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false),
      page.locator('button:has-text("Create"), button:has-text("New project")').first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false),
    ]);
    if (!loggedIn) { await closeCtx(); return { ok: false, provider, reason: cdp ? 'cdp_connected_but_flow_not_logged_in (log into Flow in that browser)' : 'no_session (log in once: FLOW_HEADFUL=1)' }; }

    // Flow flow (verified via DOM): landing → "New project" → editor (prompt textarea) → "Create".
    const newProj = page.locator('button:has-text("New project")').first();
    if (await newProj.count().catch(() => 0) && await newProj.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newProj.click().catch(() => {});
      await page.waitForTimeout(6500); // editor load
    }
    // fill the VISIBLE prompt textarea. 2026-06-15: Flow's prompt is a
    // div[role="textbox"][contenteditable="true"]; we keep both the
    // contenteditable-strict variant (matches Flow today) and a more permissive
    // [role="textbox"] fallback (in case the attribute is rendered later in life)
    // plus a textarea fallback for any future refactor.
    const promptSel = process.env.FLOW_PROMPT_SELECTOR || 'div[role="textbox"][contenteditable="true"], [role="textbox"], textarea:not(.g-recaptcha-response)';
    const box = page.locator(promptSel).first();
    await box.click({ timeout: 15_000 }).catch(() => {});
    try { await box.fill(prompt, { timeout: 8000 }); } catch (_) { await box.type(prompt, { delay: 6 }); } // contenteditable fallback
    if (o.imagePath && fs.existsSync(o.imagePath)) {
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count()) await fileInput.setInputFiles(o.imagePath).catch(() => {});
    }
    // generate — Flow's submit is the "Create" button (arrow_forward); fall back to Enter.
    const submitSel = process.env.FLOW_SUBMIT_SELECTOR || 'button[aria-label*="Create" i], button:has-text("Create"), button:has-text("Generate")';
    
    // V15 FIX: Collect existing result URLs to prevent identical duplicate downloads
    const resultSel = process.env.FLOW_RESULT_SELECTOR || (kind === 'image' ? 'img[src*="blob"], img[src*="googleusercontent"]' : 'video source, video[src]');
    const existingUrls = new Set();
    const existingEls = await page.locator(resultSel).all().catch(() => []);
    for (const el of existingEls) {
      const src = await el.getAttribute(kind === 'image' ? 'src' : 'src').catch(() => null);
      if (src) existingUrls.add(src);
    }

    const submit = page.locator(submitSel).last();
    if (await submit.count().catch(() => 0)) await submit.click({ timeout: 15_000 }).catch(() => page.keyboard.press('Enter'));
    else await page.keyboard.press('Enter');

    // poll for a downloadable result (video/img) — Veo can take 1–4 min
    const deadline = Date.now() + Number(process.env.FLOW_TIMEOUT_MS || 300_000);
    let srcUrl = null;
    while (Date.now() < deadline && !srcUrl) {
      const currentEls = await page.locator(resultSel).all().catch(() => []);
      for (let i = currentEls.length - 1; i >= 0; i--) {
        const src = await currentEls[i].getAttribute(kind === 'image' ? 'src' : 'src').catch(() => null);
        if (src && !existingUrls.has(src)) {
          srcUrl = src;
          break;
        }
      }
      if (!srcUrl) await page.waitForTimeout(5000);
    }
    if (!srcUrl) { await closeCtx(); return { ok: false, provider, reason: 'flow_result_timeout_or_no_new_result' }; }

    // download the asset
    const bufArray = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    }, srcUrl);
    const buf = Buffer.from(bufArray);
    fs.writeFileSync(cachePath, buf);
    await closeCtx();
    if (fs.statSync(cachePath).size < 1000) return { ok: false, provider, reason: 'download_too_small' };
    const b = spendBudget(1);
    return { ok: true, path: cachePath, provider, cached: false, budgetLeft: Math.max(0, b.cap - b.used) };
  } catch (e) {
    await closeCtx();
    return { ok: false, provider, reason: 'flow_automation_error: ' + String(e && e.message || e).slice(0, 160) };
  }
}

module.exports = { generate, budgetLeft, getBudget, ENABLED, MONTHLY_CAP };

if (require.main === module) {
  require('../env-d-drive-only');
  const kind = process.argv.includes('--image') ? 'image' : 'video';
  const pi = process.argv.indexOf('--prompt');
  const prompt = pi >= 0 ? process.argv[pi + 1] : 'cinematic situation room, volumetric light, slow dolly';
  console.log('veo budget left this month:', budgetLeft(), '/', MONTHLY_CAP, '| enabled:', ENABLED);
  generate({ prompt, kind, durationSec: 8 }).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
}
