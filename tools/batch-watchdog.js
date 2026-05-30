#!/usr/bin/env node
/**
 * tools/batch-watchdog.js — "nothing falls" guard for the autonomous batch.
 *
 * The daily batch runs ~16h (render + 4×4h-gap uploads) as one detached process.
 * If that process dies mid-run (crash, reboot, OOM), later uploads never happen.
 * This watchdog — run every ~20 min by a Windows Scheduled Task — detects a dead
 * batch with unfinished work and RESPAWNS it. Phase-B metadata dedup guards
 * against re-uploading anything already live, so a resume is safe (done items get
 * skipped/regen'd, only pending ones go out).
 *
 *   node tools/batch-watchdog.js [YYYY-MM-DD]   (default: today)
 *
 * Exit 0 always (so the scheduled task never shows "failed"). Logs every tick.
 */
'use strict';
require('../lib/env-d-drive-only');
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

const DATE = process.argv[2] || new Date().toISOString().slice(0, 10);
const manifestPath = path.join(ROOT, 'renders', `fresh-batch-${DATE}.json`);
const resultsPath = path.join(ROOT, 'renders', `fresh-batch-upload-${DATE}.json`);
const logPath = path.join(ROOT, 'renders', 'logs', `watchdog-${DATE}.log`);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try { fs.appendFileSync(logPath, line + '\n'); } catch (_) {}
  console.log(line);
}

// Is a batch/upload node process currently alive? (match by command line)
function batchAlive() {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'daily-fresh-batch|auto-upload-fresh' } | Measure-Object | ForEach-Object { $_.Count }",
  ], { encoding: 'utf8', timeout: 30000 });
  const n = parseInt(String(r.stdout || '0').trim(), 10);
  return Number.isFinite(n) && n > 0;
}

function uploadComplete() {
  if (!fs.existsSync(resultsPath)) return false;
  try {
    const j = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const items = j.items || [];
    if (!items.length) return false;
    // complete = every item has at least one platform result (yt or ig) resolved
    return items.every((it) => it && (it.youtube || it.instagram));
  } catch (_) { return false; }
}

function respawn(args, tag) {
  log(`RESPAWN (${tag}): node ${args.join(' ')}`);
  const out = fs.openSync(path.join(ROOT, 'renders', 'logs', `watchdog-respawn-${DATE}.log`), 'a');
  const child = spawn('node', args, { cwd: ROOT, detached: true, stdio: ['ignore', out, out] });
  child.unref();
}

(function main() {
  // 1. Done? → nothing to guard. (Best-effort: also disable the scheduled task.)
  if (uploadComplete()) {
    log('OK — upload complete; batch fully shipped. Watchdog standing down.');
    try { spawnSync('schtasks', ['/change', '/tn', 'RagnarBatchWatchdog', '/disable'], { timeout: 15000 }); } catch (_) {}
    process.exit(0);
  }
  // 2. Still running? → healthy, do nothing.
  if (batchAlive()) { log('healthy — batch process alive, work in progress.'); process.exit(0); }
  // 3. Dead + not done → resume.
  if (fs.existsSync(manifestPath)) {
    // render finished (manifest written) but uploads didn't complete → resume uploads
    respawn(['lib/auto-upload-fresh.js', '--date', DATE, '--upload-gap-min', '240'], 'resume-uploads');
  } else {
    // render never finished → restart the whole batch
    respawn(['lib/daily-fresh-batch.js', '--organic', '2', '--clips', '2', '--auto-upload', '--upload-gap-min', '240'], 'restart-batch');
  }
  process.exit(0);
})();
