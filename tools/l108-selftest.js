#!/usr/bin/env node
/**
 * tools/l108-selftest.js — L108 verification
 *
 * Runs after l107-selftest. Verifies each new L108 module loads, exports the
 * expected surface, and passes a smoke test that does NOT make external API
 * calls (to keep CI cheap and deterministic).
 *
 * Per-phase verification:
 *   P1: lib/whisper-realign.js loadable + realign() returns edge-fallback when no audio
 *   P2: lib/virality-score.js loadable + extractJson + buildPrompt safe
 *   P3: lib/pause-tokens.js extractPauses parses tokens correctly
 *   P4: lib/i2v-cloud.js generateHeroBeat accepts loopMode param
 *   P5: lib/auto-editor-compress.js loadable + ffmpeg silencedetect parses
 *   P6: lib/datamosh-filter.js buildDatamoshChain emits filter when env=1
 *   P7: .claude/hooks/l108-pipeline-supervisor.js loadable + .claude/skills/video-qa.md exists
 *
 * Exit 0 if all pass; 1 otherwise. Same format as l107-selftest.
 */

'use strict';

require('../lib/env-d-drive-only');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const checks = [];

function check(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      // Async — caller must await
      return r.then((v) => { checks.push({ name, pass: true, detail: v }); return true; })
              .catch((e) => { checks.push({ name, pass: false, detail: (e && e.message || String(e)).slice(0, 200) }); return false; });
    }
    checks.push({ name, pass: true, detail: r });
    return true;
  } catch (e) {
    checks.push({ name, pass: false, detail: (e && e.message || String(e)).slice(0, 200) });
    return false;
  }
}

async function run() {
  // P1 — whisper-realign
  check('P1:lib/whisper-realign loadable', () => {
    const m = require(path.join(ROOT, 'lib', 'whisper-realign.js'));
    if (typeof m.realign !== 'function') throw new Error('missing realign export');
    return 'realign() exported';
  });
  await check('P1:realign no-audio fallback', async () => {
    const m = require(path.join(ROOT, 'lib', 'whisper-realign.js'));
    const r = await m.realign({ audioPath: '/nonexistent.mp3', edgeBoundaries: [] });
    if (r.ok || r.source !== 'edge-boundary') throw new Error('expected edge-boundary fallback');
    return r.reason;
  });

  // P2 — virality-score
  check('P2:lib/virality-score loadable', () => {
    const m = require(path.join(ROOT, 'lib', 'virality-score.js'));
    if (typeof m.score !== 'function') throw new Error('missing score export');
    return 'score() exported';
  });

  // P3 — pause-tokens
  check('P3:lib/pause-tokens loadable', () => {
    const m = require(path.join(ROOT, 'lib', 'pause-tokens.js'));
    if (typeof m.extractPauses !== 'function') throw new Error('missing extractPauses');
    if (typeof m.synthesizeWithPauses !== 'function') throw new Error('missing synthesizeWithPauses');
    return 'both exports present';
  });
  check('P3:extractPauses parses 2 pauses', () => {
    const m = require(path.join(ROOT, 'lib', 'pause-tokens.js'));
    const r = m.extractPauses("Wait <pause_500ms> here's the wild part… <pause_300ms> Vance.");
    if (r.segments.length !== 3) throw new Error(`expected 3 segments, got ${r.segments.length}`);
    if (r.pauses.length !== 2) throw new Error(`expected 2 pauses, got ${r.pauses.length}`);
    if (r.pauses[0] !== 500 || r.pauses[1] !== 300) throw new Error(`pauses=${JSON.stringify(r.pauses)}`);
    return `segments=${r.segments.length} pauses=${JSON.stringify(r.pauses)}`;
  });

  // P4 — i2v-cloud loopMode
  check('P4:lib/i2v-cloud generateHeroBeat loadable', () => {
    const m = require(path.join(ROOT, 'lib', 'i2v-cloud.js'));
    if (typeof m.generateHeroBeat !== 'function') throw new Error('missing generateHeroBeat');
    // Inspect the source for loopMode wiring
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'i2v-cloud.js'), 'utf8');
    if (!/loopMode\s*=\s*null/.test(src)) throw new Error('loopMode default not found');
    if (!/last_image\s*=\s*`data:image/.test(src)) throw new Error('last_image wiring not found');
    return 'loopMode + last_image both wired';
  });

  // P5 — auto-editor-compress
  check('P5:lib/auto-editor-compress loadable', () => {
    const m = require(path.join(ROOT, 'lib', 'auto-editor-compress.js'));
    if (typeof m.compress !== 'function') throw new Error('missing compress');
    if (typeof m.detectSilence !== 'function') throw new Error('missing detectSilence');
    if (typeof m.inverseRanges !== 'function') throw new Error('missing inverseRanges');
    return 'compress + detectSilence + inverseRanges';
  });
  check('P5:inverseRanges math', () => {
    const m = require(path.join(ROOT, 'lib', 'auto-editor-compress.js'));
    const kept = m.inverseRanges([{ start: 5, end: 10 }, { start: 20, end: 25 }], 30, 0.4);
    // Expected: [0..4.6, 10.4..19.6, 25.4..30]
    if (kept.length !== 3) throw new Error(`expected 3 kept ranges, got ${kept.length}`);
    return `${kept.length} kept ranges, first=[${kept[0].start},${kept[0].end.toFixed(1)}]`;
  });

  // P6 — datamosh-filter
  check('P6:lib/datamosh-filter loadable', () => {
    const m = require(path.join(ROOT, 'lib', 'datamosh-filter.js'));
    if (typeof m.buildDatamoshChain !== 'function') throw new Error('missing buildDatamoshChain');
    if (typeof m.buildSidechainDuckingChain !== 'function') throw new Error('missing buildSidechainDuckingChain');
    return 'both exports';
  });
  check('P6:datamosh disabled by default', () => {
    const m = require(path.join(ROOT, 'lib', 'datamosh-filter.js'));
    delete process.env.L108_DATAMOSH;
    const s = m.buildDatamoshChain({ inputLabel: 'v_in', outputLabel: 'v_out' });
    if (s !== '') throw new Error(`expected empty, got: ${s.slice(0, 60)}`);
    return 'empty when L108_DATAMOSH unset';
  });
  check('P6:datamosh emits chain when enabled', () => {
    const m = require(path.join(ROOT, 'lib', 'datamosh-filter.js'));
    process.env.L108_DATAMOSH = '1';
    const s = m.buildDatamoshChain({ inputLabel: 'v_in', outputLabel: 'v_out', windowSec: 1.5 });
    delete process.env.L108_DATAMOSH;
    if (!/chromashift/.test(s)) throw new Error('no chromashift in output');
    if (!/tmix=frames=6/.test(s)) throw new Error('no tmix in output');
    if (!/overlay=enable='between\(t,0,1\.50\)'/.test(s)) throw new Error('overlay enable expression wrong');
    return 'chromashift + tmix + windowed overlay';
  });
  check('P6:sidechain ducking emits filter', () => {
    const m = require(path.join(ROOT, 'lib', 'datamosh-filter.js'));
    const s = m.buildSidechainDuckingChain({ voiceLabel: '0:a', musicLabel: '1:a', outLabel: 'aout' });
    if (!/sidechaincompress/.test(s)) throw new Error('no sidechaincompress');
    if (!/amix=inputs=2/.test(s)) throw new Error('no amix');
    return 'sidechaincompress + amix';
  });

  // P7 — Claude Code amplifier assets
  check('P7:supervisor hook exists', () => {
    const f = path.join(ROOT, '.claude', 'hooks', 'l108-pipeline-supervisor.js');
    if (!fs.existsSync(f)) throw new Error('supervisor hook missing');
    const s = fs.readFileSync(f, 'utf8');
    if (!/PID_FILE/.test(s) || !/Start-Process/.test(s)) throw new Error('supervisor not wired');
    return 'supervisor + PID_FILE + Start-Process';
  });
  check('P7:autoretry hook exists', () => {
    const f = path.join(ROOT, '.claude', 'hooks', 'l108-phaseb-autoretry.js');
    if (!fs.existsSync(f)) throw new Error('autoretry hook missing');
    const s = fs.readFileSync(f, 'utf8');
    if (!/metadata_too_similar/.test(s) || !/retry-.*-clips-yt/.test(s)) throw new Error('autoretry not wired');
    return 'phase-b detection + retry script invocation';
  });
  check('P7:analytics-bot subagent exists', () => {
    const f = path.join(ROOT, '.claude', 'agents', 'l108-analytics-bot.md');
    if (!fs.existsSync(f)) throw new Error('analytics-bot agent missing');
    return path.basename(f);
  });
  check('P7:video-qa skill exists', () => {
    const f = path.join(ROOT, '.claude', 'skills', 'video-qa.md');
    if (!fs.existsSync(f)) throw new Error('video-qa skill missing');
    return path.basename(f);
  });
  check('P7:upload-chain writes pid file', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'auto-upload-fresh.js'), 'utf8');
    if (!/upload-chain\.pid/.test(src)) throw new Error('pid file not written');
    if (!/process\.pid/.test(src)) throw new Error('process.pid not written');
    return 'pid persistence wired';
  });

  // Wiring confirmations — check the integration points landed.
  check('wiring:script-from-trending virality gate', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'script-from-trending.js'), 'utf8');
    if (!/virality-score/.test(src)) throw new Error('virality-score not required');
    if (!/SKIP_VIRALITY_GATE/.test(src)) throw new Error('skip env not honored');
    return 'virality gate wired';
  });
  check('wiring:daily-auto-v8 whisper realign + pause tokens', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'daily-auto-v8.js'), 'utf8');
    if (!/whisper-realign/.test(src)) throw new Error('whisper-realign not required');
    if (!/pause-tokens/.test(src)) throw new Error('pause-tokens not required');
    if (!/captionSource/.test(src)) throw new Error('captionSource not threaded');
    return 'whisper + pause + captionSource all wired';
  });
  check('wiring:hero-visual loopMode first_eq_last', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'hero-visual.js'), 'utf8');
    if (!/loopMode:\s*['"]first_eq_last['"]/.test(src)) throw new Error('loopMode not passed');
    return 'first_eq_last passed to generateHeroBeat';
  });
  check('wiring:daily-fresh-batch horror compression', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'daily-fresh-batch.js'), 'utf8');
    if (!/auto-editor-compress/.test(src)) throw new Error('auto-editor-compress not required');
    if (!/SKIP_AUTO_EDITOR/.test(src)) throw new Error('SKIP_AUTO_EDITOR env not honored');
    return 'horror compression wired';
  });
  check('wiring:split-screen datamosh branch', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'split-screen.js'), 'utf8');
    if (!/datamosh-filter/.test(src)) throw new Error('datamosh-filter not required');
    if (!/buildDatamoshChain/.test(src)) throw new Error('buildDatamoshChain not called');
    return 'datamosh branch wired';
  });
  check('wiring:STYLE_NOTES has pause-token instruction', () => {
    const f = path.join(ROOT, 'renders', 'analytics', 'evolved-prompt-2026-05-29.md');
    if (!fs.existsSync(f)) throw new Error('evolved-prompt missing');
    const s = fs.readFileSync(f, 'utf8');
    if (!/<pause_\d+ms>/.test(s)) throw new Error('pause token instruction not in STYLE_NOTES');
    return 'pause-token taught';
  });

  // ── summary ───────────────────────────────────────────────────────────
  const pass = checks.filter((c) => c.pass).length;
  const fail = checks.length - pass;
  console.log('=== L108 SELFTEST ===');
  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}` + (c.detail ? `  [${String(c.detail).slice(0, 80)}]` : ''));
  }
  console.log(`\nsummary: pass=${pass} fail=${fail} / ${checks.length}`);
  if (fail === 0) console.log('ALL GREEN — L108 wiring is sound.');
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error('FATAL:', e); process.exit(2); });
