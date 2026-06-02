/**
 * lib/story-thread.js — L113 GODMODE Pillar 1 (serialized continuity).
 *
 * A running-arc ledger so Ragnar's channel is a SHOW, not a feed: today's video
 * can reference yesterday's thread ("Yesterday we said X — here's what happened")
 * and tease tomorrow, driving a returning audience + binge behavior.
 *
 * Pure JSON at renders/analytics/story-thread.json. $0, no deps.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'renders', 'analytics', 'story-thread.json');
const MAX = 60; // keep last 60 entries

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return { entries: [] }; }
}
function save(s) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  s.entries = (s.entries || []).slice(-MAX);
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
}

/** Append today's beat to the arc. @param {object} e {date, topic, summary, teaser, videoUrl} */
function recordEntry(e) {
  const s = load();
  s.entries.push({ date: e.date || new Date().toISOString().slice(0, 10), topic: e.topic || '', summary: (e.summary || '').slice(0, 240), teaser: (e.teaser || '').slice(0, 160), videoUrl: e.videoUrl || null });
  save(s);
  return { ok: true, count: s.entries.length };
}

/** The most recent entry (yesterday's thread) for a callback. */
function latest() {
  const s = load();
  return s.entries.length ? s.entries[s.entries.length - 1] : null;
}

/**
 * A short callback line to inject into today's script prompt so the video opens
 * with continuity. Empty string when there's no prior thread.
 */
function buildCallbackPromptLine() {
  const last = latest();
  if (!last) return '';
  return `## CONTINUITY (open with a quick callback)\n- Yesterday's thread: "${last.topic}" — ${last.summary}\n- Open by referencing it in one line ("Yesterday we tracked X — today it just escalated"), then move on. Build the ongoing story.`;
}

module.exports = { recordEntry, latest, buildCallbackPromptLine };

if (require.main === module) {
  require('./env-d-drive-only');
  if (process.argv[2] === 'add') recordEntry({ topic: process.argv[3] || 'test topic', summary: 'test summary', teaser: 'tomorrow: the fallout' });
  console.log('latest:', JSON.stringify(latest(), null, 2));
  console.log('\ncallback line:\n' + buildCallbackPromptLine());
}
