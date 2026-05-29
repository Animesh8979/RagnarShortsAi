#!/usr/bin/env node
/**
 * .claude/hooks/l108-phaseb-autoretry.js — L108 P7
 *
 * PostToolUse hook. Reads the Bash tool's stdout from the hook payload.
 * If it contains a Phase B "metadata_too_similar" failure pattern for a
 * clip (B1-B9), spawns the appropriate clip retry script async (no
 * blocking — the harness waits 10s max for this hook).
 *
 * Stays D-drive only. Self-suppresses recursive triggers via PID file.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = 'D:\\anitgravity work';
const LOG_FILE = path.join(ROOT, 'renders', 'logs', '.phaseb-autoretry.log');
const LOCK_FILE = path.join(ROOT, 'renders', 'logs', '.phaseb-autoretry.lock');

function log(msg) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) {}
}

function readStdin() {
  // Claude Code passes hook payload as JSON on stdin.
  try {
    const buf = fs.readFileSync(0, 'utf8');
    return JSON.parse(buf || '{}');
  } catch (_) { return {}; }
}

function main() {
  const payload = readStdin();
  // We only care about Bash output (the upload chain log accumulates there).
  if (!payload || payload.tool_name !== 'Bash') return;
  const stdout = String((payload.tool_response && payload.tool_response.stdout) || '');
  // Detect Phase B failure for a clip.
  const m = /metadata_too_similar[\s\S]{0,400}?\((B\d+)\)/.exec(stdout);
  if (!m) return;
  const clipId = m[1];

  // Rate-limit: don't fire same clip twice in a row.
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const last = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      if (last.clipId === clipId && Date.now() - new Date(last.ts).getTime() < 5 * 60 * 1000) {
        log(`skip ${clipId} — already retried ${Math.round((Date.now() - new Date(last.ts).getTime()) / 1000)}s ago`);
        return;
      }
    }
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ clipId, ts: new Date().toISOString() }));
  } catch (_) {}

  // Locate the retry script for the current batch date.
  const today = new Date().toISOString().slice(0, 10);
  const retryScript = path.join(ROOT, 'tools', `retry-${today}-clips-yt.js`);
  if (!fs.existsSync(retryScript)) {
    log(`no retry script for today (${retryScript}); skip`);
    return;
  }

  const logPath = path.join(ROOT, 'renders', 'logs', `autoretry-${clipId}-${Date.now()}.log`);
  // PowerShell Start-Process — survives this hook's exit.
  const psCmd = [
    `Start-Process -FilePath 'node.exe' -ArgumentList @(`,
    `  '${retryScript.replace(/\\/g, '\\\\')}','--clip','${clipId}'`,
    `) -WorkingDirectory '${ROOT.replace(/'/g, "''")}' \`\n  -RedirectStandardOutput '${logPath.replace(/'/g, "''")}' \`\n  -RedirectStandardError '${logPath.replace(/'/g, "''")}.err' \`\n  -WindowStyle Hidden | Out-Null`,
  ].join('\n');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCmd], { encoding: 'utf8', timeout: 5000 });
  log(`autoretry ${clipId} fired (exit=${r.status}) log=${logPath}`);
}

try { main(); } catch (e) { log(`fatal: ${e.message}`); }
process.exit(0);
