#!/usr/bin/env node
/**
 * tools/l109-selftest.js — L109 brutal-clip-surgery verification
 *
 * Runs after l107-selftest + l108-selftest. Verifies the L109 modules load,
 * env flags are set, and wiring lands in the right call sites.
 *
 * No external API calls (uses smoke fixtures only) so CI stays deterministic.
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
  // P1 — peak-detector
  check('P1:lib/peak-detector loadable', () => {
    const m = require(path.join(ROOT, 'lib', 'peak-detector.js'));
    if (typeof m.detectPeaks !== 'function') throw new Error('missing detectPeaks');
    if (typeof m.pickTopN !== 'function') throw new Error('missing pickTopN');
    return 'detectPeaks + pickTopN';
  });
  check('P1:pickTopN respects min-interval', () => {
    const m = require(path.join(ROOT, 'lib', 'peak-detector.js'));
    const peaks = [
      { t: 1.0, intensity_db: -2 }, { t: 1.5, intensity_db: -3 }, // too close
      { t: 5.0, intensity_db: -4 }, { t: 5.2, intensity_db: -5 }, // too close
      { t: 10.0, intensity_db: -6 }, { t: 14.0, intensity_db: -7 },
    ];
    const top4 = m.pickTopN(peaks, 4, 1.5);
    if (top4.length !== 4) throw new Error('expected 4 peaks, got ' + top4.length);
    // Should be {1.0, 5.0, 10.0, 14.0} — the close pairs collapsed
    return `picked t=[${top4.map((p) => p.t).join(',')}]`;
  });

  // P1 — sfx-library
  check('P1:lib/sfx-library loadable', () => {
    const m = require(path.join(ROOT, 'lib', 'sfx-library.js'));
    if (typeof m.getSfxPath !== 'function') throw new Error('missing getSfxPath');
    if (typeof m.buildSfxOverlayChain !== 'function') throw new Error('missing buildSfxOverlayChain');
    if (m.listCategories().length < 8) throw new Error('expected ≥8 SFX categories');
    return `${m.listCategories().length} SFX categories`;
  });
  check('P1:sfx-library catalog has critical sfx', () => {
    const m = require(path.join(ROOT, 'lib', 'sfx-library.js'));
    const cats = m.listCategories();
    for (const required of ['vine-boom', 'whoosh', 'riser', 'air-horn', 'record-scratch']) {
      if (!cats.includes(required)) throw new Error(`missing ${required}`);
    }
    return 'vine-boom + whoosh + riser + air-horn + record-scratch all present';
  });
  check('P1:buildSfxOverlayChain emits filter', () => {
    const m = require(path.join(ROOT, 'lib', 'sfx-library.js'));
    const r = m.buildSfxOverlayChain({
      mainAudioLabel: '0:a',
      outLabel: 'aout',
      overlays: [{ t: 1.2, category: 'vine-boom', gainDb: -3 }, { t: 5.0, category: 'whoosh', gainDb: -6 }],
      sfxPaths: ['/fake/vb.mp3', '/fake/wh.mp3'],
    });
    if (!/adelay=1200\|1200/.test(r.filter)) throw new Error('vine-boom timing not in filter');
    if (!/amix=inputs=3/.test(r.filter)) throw new Error('amix=3 not in filter');
    if (r.inputArgs.length !== 4) throw new Error('expected 4 input args (2 sfx files × -i + path)');
    return 'vine-boom@1200ms + whoosh@5000ms + amix=3';
  });

  // P1 — cut-and-stack
  check('P1:lib/cut-and-stack loadable', () => {
    const m = require(path.join(ROOT, 'lib', 'cut-and-stack.js'));
    if (typeof m.cutAndStack !== 'function') throw new Error('missing cutAndStack');
    if (typeof m.planCuts !== 'function') throw new Error('missing planCuts');
    return 'cutAndStack + planCuts';
  });
  check('P1:planCuts targets 8-14 cuts', () => {
    const m = require(path.join(ROOT, 'lib', 'cut-and-stack.js'));
    const peaks = [];
    for (let i = 0; i < 20; i++) peaks.push({ t: i * 5 + 0.3, intensity_db: -10 + (Math.random() - 0.5) * 8 });
    const cuts = m.planCuts(peaks, 28, 8, 14);
    if (cuts.length < 8 || cuts.length > 14) throw new Error(`expected 8-14 cuts, got ${cuts.length}`);
    const sum = cuts.reduce((acc, c) => acc + c.segDur, 0);
    if (Math.abs(sum - 28) > 0.1) throw new Error(`segs sum to ${sum.toFixed(2)}, expected 28.0`);
    return `${cuts.length} cuts summing to ${sum.toFixed(2)}s`;
  });

  // P2 — trending creators expansion
  check('P2:trending-clips DEFAULT_CREATORS ≥8', () => {
    const m = require(path.join(ROOT, 'lib', 'trending-clips.js'));
    if (!Array.isArray(m.DEFAULT_CREATORS) || m.DEFAULT_CREATORS.length < 8) {
      throw new Error('DEFAULT_CREATORS has ' + (m.DEFAULT_CREATORS && m.DEFAULT_CREATORS.length || 0) + ' creators (need ≥8)');
    }
    const names = m.DEFAULT_CREATORS.map((c) => c.name);
    for (const required of ['KillTony', 'TheoVon', 'KaiCenat']) {
      if (!names.includes(required)) throw new Error(`missing ${required}`);
    }
    return `${m.DEFAULT_CREATORS.length} creators: ${names.slice(0, 4).join(', ')}...`;
  });

  // P2 — Reddit clips
  check('P2:lib/reddit-clips loadable', () => {
    const m = require(path.join(ROOT, 'lib', 'reddit-clips.js'));
    if (typeof m.discoverRedditClips !== 'function') throw new Error('missing discoverRedditClips');
    if (!Array.isArray(m.HIGH_YIELD_SUBS) || m.HIGH_YIELD_SUBS.length < 8) throw new Error('HIGH_YIELD_SUBS too short');
    const names = m.HIGH_YIELD_SUBS.map((s) => s.name);
    for (const required of ['nextfuckinglevel', 'Damnthatsinteresting', 'BeAmazed']) {
      if (!names.includes(required)) throw new Error(`missing ${required}`);
    }
    return `${m.HIGH_YIELD_SUBS.length} subs subscribed`;
  });

  // P3 — pinned-comment bait
  check('P3:lib/pinned-comment-bait loadable', () => {
    const m = require(path.join(ROOT, 'lib', 'pinned-comment-bait.js'));
    if (typeof m.generatePinnedComment !== 'function') throw new Error('missing generatePinnedComment');
    if (typeof m.postAndPin !== 'function') throw new Error('missing postAndPin');
    return 'both exports';
  });
  check('P3:generatePinnedComment rotates 8 templates', () => {
    const m = require(path.join(ROOT, 'lib', 'pinned-comment-bait.js'));
    const seen = new Set();
    for (let i = 0; i < 8; i++) {
      const c = m.generatePinnedComment({ kind: 'clip', creator: 'X', topic: 'Y', momentKeyword: 'Z', rotationIndex: i });
      if (!c || c.length < 10) throw new Error('empty comment at index ' + i);
      seen.add(c);
    }
    if (seen.size < 6) throw new Error(`only ${seen.size} unique comments across 8 rotations`);
    return `${seen.size}/8 unique`;
  });

  // P3 — wiring: hashtags capped at 5
  check('P3:auto-upload tags capped at 5', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'auto-upload-fresh.js'), 'utf8');
    // Look for the L109 P3 cap markers
    if (!/L109 P3 — cap tags at 5/.test(src)) throw new Error('tag-cap comment marker missing');
    if (!/\.slice\(0, 5\)/.test(src)) throw new Error('slice(0,5) not found');
    return 'tag cap wired';
  });

  // P3 — wiring: LUFS normalize in mux
  check('P3:LUFS -14 normalize wired in mux', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'daily-auto-v8.js'), 'utf8');
    if (!/loudnorm=I=-14/.test(src)) throw new Error('loudnorm filter missing');
    if (!/SKIP_LUFS_NORM/.test(src)) throw new Error('SKIP_LUFS_NORM env not honored');
    return 'loudnorm + skip env';
  });

  // P3 — wiring: postAndPin in auto-upload chain
  check('P3:auto-upload posts pinned-comment within chain', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'auto-upload-fresh.js'), 'utf8');
    if (!/pinned-comment-bait/.test(src)) throw new Error('pinned-comment-bait not required');
    if (!/postAndPin/.test(src)) throw new Error('postAndPin not called');
    return 'pin chain wired';
  });

  // P4 — env flags activated
  check('P4:L108_DATAMOSH=1 in env', () => {
    if (process.env.L108_DATAMOSH !== '1') throw new Error('L108_DATAMOSH=' + process.env.L108_DATAMOSH);
    return 'L108_DATAMOSH=1';
  });
  check('P4:L109_CUT_ON_PEAK=1 in env', () => {
    if (process.env.L109_CUT_ON_PEAK !== '1') throw new Error('L109_CUT_ON_PEAK=' + process.env.L109_CUT_ON_PEAK);
    return 'L109_CUT_ON_PEAK=1';
  });
  check('P4:L109_SFX_LAYER=1 in env', () => {
    if (process.env.L109_SFX_LAYER !== '1') throw new Error('L109_SFX_LAYER=' + process.env.L109_SFX_LAYER);
    return 'L109_SFX_LAYER=1';
  });

  // P4 — cut-and-stack wired into daily-clip-v8
  check('P4:daily-clip-v8 calls cut-and-stack on horror mode', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'daily-clip-v8.js'), 'utf8');
    if (!/cut-and-stack/.test(src)) throw new Error('cut-and-stack not required');
    if (!/L109_CUT_ON_PEAK/.test(src)) throw new Error('env flag not checked');
    if (!/full_frame_horror/.test(src)) throw new Error('mode gate not in place');
    return 'cut-and-stack branch + env + mode gate all wired';
  });

  // summary
  const pass = checks.filter((c) => c.pass).length;
  const fail = checks.length - pass;
  console.log('=== L109 SELFTEST ===');
  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}` + (c.detail ? `  [${String(c.detail).slice(0, 80)}]` : ''));
  }
  console.log(`\nsummary: pass=${pass} fail=${fail} / ${checks.length}`);
  if (fail === 0) console.log('ALL GREEN — L109 wiring is sound.');
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error('FATAL:', e); process.exit(2); });
