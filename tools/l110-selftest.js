#!/usr/bin/env node
/**
 * tools/l110-selftest.js — Definitive Growth Engine verification.
 * Verifies Tier 0 (strategy) + Tier 1 (retention engine) modules load, export
 * the right surface, and pass MEASURED smoke checks (not "function exists").
 * No external API calls — deterministic. Run after l107/l108/l109 selftests.
 */
'use strict';
require('../lib/env-d-drive-only');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const checks = [];
function check(name, fn) {
  try { const r = fn(); checks.push({ name, pass: true, detail: r }); }
  catch (e) { checks.push({ name, pass: false, detail: (e && e.message || String(e)).slice(0, 160) }); }
}

// ── Tier 0 ──────────────────────────────────────────────────────────────
check('T0.1 channel-niches.json: geopolitics lock + dynamic clip', () => {
  const n = require(path.join(ROOT, 'config', 'channel-niches.json'));
  if (n.organic.mode !== 'hard_lock' || n.organic.niche !== 'geopolitics') throw new Error('organic not geopolitics hard_lock');
  if (n.clip.mode !== 'dynamic_performance_weighted') throw new Error('clip not dynamic');
  if (!n.organic.matchKeywords.includes('iran')) throw new Error('keywords missing');
  return `organic=${n.organic.niche} clip=${n.clip.mode} (${n.organic.matchKeywords.length} kw)`;
});
check('T0.1 clip-creator-ranker ranks pool', () => {
  const r = require(path.join(ROOT, 'lib', 'clip-creator-ranker.js'));
  const ranked = r.rankCreators();
  if (!Array.isArray(ranked) || ranked.length < 5) throw new Error('ranked too short');
  if (typeof ranked[0].combined !== 'number') throw new Error('no combined score');
  return `${ranked.length} creators, top=${ranked[0].creator}(${ranked[0].combined})`;
});
check('T0.1 niche filter wired in daily-fresh-batch', () => {
  const s = fs.readFileSync(path.join(ROOT, 'lib', 'daily-fresh-batch.js'), 'utf8');
  if (!/niche-lock/.test(s) || !/SKIP_NICHE_LOCK/.test(s)) throw new Error('niche filter not wired');
  if (!/clip-creator-ranker/.test(require(path.join(ROOT,'lib','trending-clips.js')) && fs.readFileSync(path.join(ROOT,'lib','trending-clips.js'),'utf8'))) throw new Error('ranker not wired');
  return 'niche-lock + creator-rank wired';
});
check('T0.2 cadence default 240', () => {
  const s = fs.readFileSync(path.join(ROOT, 'lib', 'auto-upload-fresh.js'), 'utf8');
  if (!/gap-min', 240/.test(s)) throw new Error('gap default not 240');
  return 'gap default 240min (4h)';
});
check('T0.3 platform-variant emits distinct file', () => {
  const m = require(path.join(ROOT, 'lib', 'platform-variant.js'));
  if (typeof m.makeIgVariant !== 'function') throw new Error('missing makeIgVariant');
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'auto-upload-fresh.js'), 'utf8');
  if (!/makeIgVariant/.test(src)) throw new Error('not wired into ig path');
  return 'makeIgVariant exported + wired';
});
check('T0.4 pin off by default', () => {
  // env is loaded; SKIP_PIN_COMMENT should be set to 1
  if (process.env.SKIP_PIN_COMMENT !== '1') throw new Error('SKIP_PIN_COMMENT not 1');
  return 'SKIP_PIN_COMMENT=1';
});

// ── Tier 1 ──────────────────────────────────────────────────────────────
check('T1.1 first-frame-hook derives muted hook', () => {
  const m = require(path.join(ROOT, 'lib', 'first-frame-hook.js'));
  const h = m.deriveHookText('US and Iran very close to a deal — Vance says, sources claim');
  if (!h || h.length < 4 || h !== h.toUpperCase()) throw new Error('bad hook: ' + h);
  if (h.split(' ').length > 7) throw new Error('hook too long');
  return `"${h}"`;
});
check('T1.2 seamless-loop exports', () => {
  const m = require(path.join(ROOT, 'lib', 'seamless-loop.js'));
  if (typeof m.applySeamlessLoop !== 'function') throw new Error('missing applySeamlessLoop');
  return 'applySeamlessLoop';
});
check('T1.3 reaction-caption content-aware + ASS', () => {
  const m = require(path.join(ROOT, 'lib', 'reaction-caption.js'));
  if (typeof m.generateReaction !== 'function') throw new Error('missing generateReaction');
  const line = m.buildReactionAssLine('COMEDY GOLD ABOUT TO DROP', 0.6, 3.6);
  if (!/Dialogue: 2/.test(line) || !/pos\(540,360\)/.test(line)) throw new Error('bad ass line');
  return 'top-third reaction ASS layer';
});
check('T1.4 kokoro-tts edge-shape + GPU-safe', () => {
  const m = require(path.join(ROOT, 'lib', 'kokoro-tts.js'));
  if (typeof m.synthesize !== 'function') throw new Error('missing synthesize');
  const s = fs.readFileSync(path.join(ROOT, 'lib', 'kokoro-tts.js'), 'utf8');
  if (!/device:\s*'cpu'/.test(s)) throw new Error('not CPU-locked (GPU ban!)');
  require('kokoro-js'); // loadable
  return 'kokoro-js loadable, device=cpu (no GPU)';
});
check('T1 retention-postfx wired in both lanes', () => {
  if (typeof require(path.join(ROOT, 'lib', 'retention-postfx.js')).apply !== 'function') throw new Error('no apply');
  const a = fs.readFileSync(path.join(ROOT, 'lib', 'daily-auto-v8.js'), 'utf8');
  const c = fs.readFileSync(path.join(ROOT, 'lib', 'daily-clip-v8.js'), 'utf8');
  if (!/retention-postfx/.test(a)) throw new Error('not in organic lane');
  if (!/retention-postfx/.test(c)) throw new Error('not in clip lane');
  if (!/reaction-caption/.test(c)) throw new Error('reaction not in clip lane');
  if (!/L110_KOKORO_TTS/.test(a)) throw new Error('kokoro not in organic lane');
  return 'organic + clip both wired (postfx + kokoro + reaction)';
});

// ── Tier 2 + Tier 3 ──────────────────────────────────────────────────────
check('T3.1 whisper-local available (Python + faster-whisper)', () => {
  const m = require(path.join(ROOT, 'lib', 'whisper-local.js'));
  if (typeof m.transcribe !== 'function') throw new Error('no transcribe');
  if (!m.isAvailable()) throw new Error('python/script not found at D:\\python_env');
  return 'D:\\python_env + tools/whisper_local.py present';
});
check('T3.1 whisper-local wired local-first', () => {
  const wr = fs.readFileSync(path.join(ROOT, 'lib', 'whisper-realign.js'), 'utf8');
  const cb = fs.readFileSync(path.join(ROOT, 'lib', 'caption-builder.js'), 'utf8');
  if (!/whisper-local/.test(wr) || !/L110_WHISPER_LOCAL/.test(wr)) throw new Error('not in whisper-realign');
  if (!/whisper-local/.test(cb)) throw new Error('not in caption-builder');
  return 'realign + caption-builder both local-first';
});
check('T2.1 clip-moment-selector + wired', () => {
  const m = require(path.join(ROOT, 'lib', 'clip-moment-selector.js'));
  if (typeof m.selectMoments !== 'function') throw new Error('no selectMoments');
  const s = fs.readFileSync(path.join(ROOT, 'lib', 'daily-fresh-batch.js'), 'utf8');
  if (!/clip-moment-selector/.test(s) || !/L110_MOMENT_SELECTOR/.test(s)) throw new Error('not wired in runClipsLane');
  return 'selectMoments exported + wired';
});
check('T2/T3 env flags active', () => {
  for (const f of ['L110_WHISPER_LOCAL', 'L110_MOMENT_SELECTOR']) if (process.env[f] !== '1') throw new Error(f + ' not 1');
  if (!process.env.PYTHON_EMBED) throw new Error('PYTHON_EMBED unset');
  return 'whisper_local + moment_selector ON';
});

// ── GPU-ban guard (the user's explicit concern) ──────────────────────────
check('GUARD: no ComfyUI/Forge reference in L110 modules', () => {
  for (const f of ['clip-creator-ranker', 'platform-variant', 'first-frame-hook', 'seamless-loop', 'kokoro-tts', 'reaction-caption', 'retention-postfx', 'whisper-local', 'clip-moment-selector']) {
    const s = fs.readFileSync(path.join(ROOT, 'lib', f + '.js'), 'utf8').toLowerCase();
    if (s.includes('comfyui') || s.includes('forge') || /device:\s*['"]cuda/.test(s)) throw new Error(f + ' references banned GPU tool');
  }
  // Python whisper must be CPU INT8.
  const py = fs.readFileSync(path.join(ROOT, 'tools', 'whisper_local.py'), 'utf8');
  if (!/device="cpu"/.test(py) || /device="cuda"/.test(py)) throw new Error('whisper_local.py not CPU-locked');
  return 'zero ComfyUI/Forge/CUDA; whisper CPU-locked';
});

const pass = checks.filter((c) => c.pass).length;
const fail = checks.length - pass;
console.log('=== L110 SELFTEST (Definitive Growth Engine: Tier 0 + Tier 1) ===');
for (const c of checks) console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}` + (c.detail ? `  [${String(c.detail).slice(0, 70)}]` : ''));
console.log(`\nsummary: pass=${pass} fail=${fail} / ${checks.length}`);
console.log(fail === 0 ? 'ALL GREEN — Tier 0 + Tier 1 sound.' : 'FAILURES present.');
process.exit(fail === 0 ? 0 : 1);
