#!/usr/bin/env node
/**
 * .claude/hooks/l108-pipeline-supervisor.js — L108 P7
 *
 * SessionStart hook. Checks if the daily upload chain is alive by reading
 * `renders/.upload-chain.pid`. If the pid file exists and the process is
 * dead, respawn the chain via PowerShell Start-Process so it survives
 * the Claude Code session.
 *
 * Stays D-drive only. Idempotent — safe to fire on every session start.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = 'D:\\anitgravity work';
const PID_FILE = path.join(ROOT, 'renders', '.upload-chain.pid');
const LOG_FILE = path.join(ROOT, 'renders', 'logs', '.supervisor.log');

function log(msg) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

function isAlive(pid) {
  try {
    // On Windows, signal 0 throws if process is gone, succeeds if alive.
    process.kill(Number(pid), 0);
    return true;
  } catch (_) { return false; }
}

function main() {
  if (!fs.existsSync(PID_FILE)) {
    // No chain expected — nothing to supervise.
    log('no pid file; nothing to supervise');
    return;
  }
  let stateRaw;
  try { stateRaw = JSON.parse(fs.readFileSync(PID_FILE, 'utf8')); }
  catch (e) { log(`pid file corrupt: ${e.message}`); return; }

  const { pid, date, gapMin, startedAt } = stateRaw;
  if (!pid) { log('pid file missing pid field'); return; }

  if (isAlive(pid)) {
    log(`chain alive pid=${pid} started=${startedAt}`);
    return;
  }

  log(`chain pid=${pid} DEAD — respawning for date=${date} gap=${gapMin}`);

  // Compute start-at based on what's already in fresh-batch-upload-{date}.json
  const uploadManifest = path.join(ROOT, 'renders', `fresh-batch-upload-${date}.json`);
  let startAt = 0;
  try {
    if (fs.existsSync(uploadManifest)) {
      const j = JSON.parse(fs.readFileSync(uploadManifest, 'utf8'));
      // Count items per lane that already shipped.
      const organicDone = (j.items || []).filter((it) => it.kind === 'organic' && it.youtube && it.youtube.success).length;
      const clipDone    = (j.items || []).filter((it) => it.kind === 'clip'    && it.youtube && it.youtube.success).length;
      startAt = Math.min(organicDone, clipDone);
      log(`resume startAt=${startAt} (organic done=${organicDone}, clip done=${clipDone})`);
    }
  } catch (e) { log(`could not parse upload manifest: ${e.message}`); }

  const logPath = path.join(ROOT, 'renders', 'logs', `upload-${date}-supervisor.log`);
  // PowerShell respawn so the new node process survives this hook script's exit.
  const psCmd = [
    `$p = Start-Process -FilePath 'node.exe' -ArgumentList @(`,
    `  'lib/auto-upload-fresh.js','--date','${date}','--gap-min','${gapMin || 180}','--start-at','${startAt}'`,
    `) -WorkingDirectory '${ROOT.replace(/'/g, "''")}' \`\n  -RedirectStandardOutput '${logPath.replace(/'/g, "''")}' \`\n  -RedirectStandardError '${logPath.replace(/'/g, "''")}.err' \`\n  -PassThru -WindowStyle Hidden;`,
    `Write-Output $p.Id`,
  ].join('\n');

  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCmd], { encoding: 'utf8' });
  if (r.status === 0) {
    const newPid = Number((r.stdout || '').trim());
    if (newPid > 0) {
      try {
        fs.writeFileSync(PID_FILE, JSON.stringify({ ...stateRaw, pid: newPid, respawnedAt: new Date().toISOString() }, null, 2));
        log(`respawned as pid=${newPid}`);
      } catch (e) { log(`could not update pid file: ${e.message}`); }
    } else {
      log(`PowerShell returned no pid; stdout=${r.stdout} stderr=${r.stderr}`);
    }
  } else {
    log(`PowerShell respawn failed exit=${r.status} stderr=${(r.stderr || '').slice(0, 200)}`);
  }
}

try { main(); } catch (e) { log(`fatal: ${e.message}`); }
process.exit(0);
