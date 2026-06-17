/**
 * lib/checkpoint.js — Phase 6.5 idempotent step wrapper
 *
 * Long renders (daily-auto-v8, daily-clip-v8) are 6-12 minute pipelines
 * of N sequential FFmpeg / network / Remotion calls. A crash at step N
 * forces re-doing steps 1..N-1 from scratch. With this wrapper, each
 * step writes a tiny `<outDir>/checkpoint.json` after success; a re-run
 * reads it and skips completed steps.
 *
 * Usage:
 *   const cp = require('./checkpoint').open(outDir);
 *   const tts = await cp.step('tts', () => synthesizeTTS(...));
 *   for (let i = 0; i < beats.length; i++) {
 *     const hero = await cp.step(`beat-${i}-hero`, () => generateHero(beats[i]));
 *     // ...
 *   }
 *   await cp.step('render', () => remotionRender(...));
 *   await cp.step('mux', () => muxAudio(...));
 *
 * The result of each step is JSON.stringify'd into the checkpoint, so
 * step bodies should return small JSON-serializable summaries (paths,
 * urls, ids) — NOT large buffers.
 *
 * Resume rules:
 *   - If checkpoint.json exists AND the step's previous result is there,
 *     the body is SKIPPED and the cached result returned.
 *   - If the step body throws, the checkpoint is NOT updated; the next
 *     run retries that step.
 *   - `cp.reset()` deletes the checkpoint (for a forced clean re-run).
 *
 * The checkpoint also records the wall-clock time of each step and the
 * outDir's source-script slug, so an operator can diff two runs.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function open(outDir, opts = {}) {
  try { fs.mkdirSync(outDir, { recursive: true }); } catch (_) {}
  const file = path.join(outDir, 'checkpoint.json');
  let state;
  try {
    state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  } catch (_) { state = null; }
  if (!state) state = { createdAt: new Date().toISOString(), steps: {} };

  function save() {
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
  }

  async function step(name, body) {
    if (state.steps[name] && state.steps[name].ok && !opts.force) {
      // already done — return cached
      const cached = state.steps[name].result;
      if (opts.verbose) console.log(`[checkpoint] SKIP ${name} (cached at ${state.steps[name].finishedAt})`);
      return cached;
    }
    const t0 = Date.now();
    try {
      const result = await body();
      state.steps[name] = {
        ok: true,
        startedAt: new Date(t0).toISOString(),
        finishedAt: new Date().toISOString(),
        elapsedSec: +((Date.now() - t0) / 1000).toFixed(2),
        result: result === undefined ? null : result,
      };
      save();
      if (opts.verbose) console.log(`[checkpoint] OK ${name} in ${state.steps[name].elapsedSec}s`);
      return result;
    } catch (err) {
      state.steps[name] = {
        ok: false,
        startedAt: new Date(t0).toISOString(),
        failedAt: new Date().toISOString(),
        error: String(err && err.message || err).slice(0, 600),
      };
      save();
      throw err;
    }
  }

  function reset() {
    try { fs.unlinkSync(file); } catch (_) {}
    state = { createdAt: new Date().toISOString(), steps: {} };
  }

  function summary() {
    const steps = Object.entries(state.steps).map(([k, v]) => ({ name: k, ok: v.ok, elapsedSec: v.elapsedSec, error: v.error }));
    return { file, createdAt: state.createdAt, updatedAt: state.updatedAt, stepCount: steps.length, steps };
  }

  return { step, reset, summary, _state: () => state, _file: file };
}

module.exports = { open };
