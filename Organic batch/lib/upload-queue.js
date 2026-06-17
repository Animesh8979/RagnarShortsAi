/**
 * lib/upload-queue.js — L116 A1: persistent, resumable upload queue.
 *
 * The structural resilience fix. Renderers ENQUEUE a job (the same `render` object
 * auto-upload-fresh already consumes) + which lane; a separate long-lived daemon
 * (tools/upload-daemon.js) drains it via the EXISTING auto-upload-fresh.uploadOne().
 * Because the queue is a file on D:\, process death / network outage / reboot can
 * never lose a batch — the daemon resumes from the queue when it restarts.
 *
 * Per-PLATFORM idempotency: each job tracks youtube/instagram success stickily, so a
 * retry passes skipYt/skipIg to uploadOne and never double-posts a platform that's
 * already live (the exact dup-risk that made hand-recovery scary today).
 *
 * Single JSON file with atomic write (temp + rename). $0, D:\ only.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'renders', 'queue');
const QUEUE_FILE = path.join(QUEUE_DIR, 'upload-queue.json');

// exponential backoff schedule (ms) by retry count, capped.
const BACKOFF = [60_000, 120_000, 300_000, 600_000, 1_800_000]; // 1m,2m,5m,10m,30m
const MAX_RETRIES = Number(process.env.UPLOAD_QUEUE_MAX_RETRIES || 12);

function ensureDir() { try { fs.mkdirSync(QUEUE_DIR, { recursive: true }); } catch (_) {} }

function load() {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    const j = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    return Array.isArray(j) ? j : (Array.isArray(j.jobs) ? j.jobs : []);
  } catch (_) { return []; }
}

function save(jobs) {
  ensureDir();
  const tmp = QUEUE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2));
  fs.renameSync(tmp, QUEUE_FILE); // atomic on same volume
}

/**
 * Enqueue an upload job. `render` is the manifest-item shape auto-upload-fresh expects
 * (outputPath/videoPath, igPath, spec/file, topic, etc.). Idempotent on `dedupeKey`
 * (the video path) so re-enqueuing the same render won't create duplicates.
 * @returns {object} the job
 */
function enqueue({ render, kind, channel, dedupeKey }) {
  ensureDir();
  const jobs = load();
  const key = dedupeKey || (render && (render.outputPath || render.videoPath)) || crypto.randomUUID();
  const existing = jobs.find((j) => j.dedupeKey === key && j.status !== 'done');
  if (existing) return existing; // idempotent enqueue
  const job = {
    id: crypto.randomUUID(),
    dedupeKey: key,
    kind: kind || (render && render.kind) || 'organic',
    channel: channel || null,
    render,
    status: 'pending', // pending → running → done | retriable | failed
    retries: 0,
    queuedAt: new Date().toISOString(),
    nextAttemptAt: Date.now(),
    startedAt: null,
    completedAt: null,
    youtube: null,   // sticky {success,url}
    instagram: null, // sticky {success,permalink}
    lastError: null,
  };
  jobs.push(job);
  save(jobs);
  return job;
}

/** Claim the next runnable job (pending|retriable with nextAttemptAt≤now). Marks it running.
 *  Enforces per-channel cadence: UPLOAD_GAP_HOURS_PER_CHANNEL (default 4) and
 *  UPLOAD_MAX_PER_DAY_PER_CHANNEL (default 4). */
function claimNext() {
  const jobs = load();
  const now = Date.now();
  const gapHours = Number(process.env.UPLOAD_GAP_HOURS_PER_CHANNEL || 4);
  const dailyCap = Number(process.env.UPLOAD_MAX_PER_DAY_PER_CHANNEL || 4);
  const gapMs = gapHours * 3600_000;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const runnable = jobs.filter((j) => (j.status === 'pending' || j.status === 'retriable') && (Number(j.nextAttemptAt) || 0) <= now);
  for (const job of runnable) {
    const ch = job.channel || job.kind || 'default';
    const channelDone = jobs.filter((j) => j.status === 'done' && (j.channel || j.kind || 'default') === ch);
    const lastUpload = channelDone.reduce((max, j) => {
      const t = j.completedAt ? new Date(j.completedAt).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    if (lastUpload && (now - lastUpload) < gapMs) continue;
    const todayCount = channelDone.filter((j) => j.completedAt && new Date(j.completedAt).getTime() >= todayMs).length;
    if (todayCount >= dailyCap) continue;
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    save(jobs);
    return job;
  }
  return null;
}

function _update(id, mutate) {
  const jobs = load();
  const job = jobs.find((j) => j.id === id);
  if (!job) return null;
  mutate(job);
  save(jobs);
  return job;
}

/** Merge a uploadOne() result item. Marks done if both platforms are success/skip. */
function recordResult(id, item, opts = {}) {
  return _update(id, (job) => {
    if (item.youtube && item.youtube.success) job.youtube = { success: true, url: item.youtube.url || item.youtube.videoUrl || null };
    if (item.instagram && item.instagram.success) job.instagram = { success: true, permalink: item.instagram.permalink || null };
    const ytDone = !!(job.youtube && job.youtube.success) || opts.skipYt;
    const igDone = !!(job.instagram && job.instagram.success) || opts.skipIg;
    if (ytDone && igDone) {
      job.status = 'done';
      job.completedAt = new Date().toISOString();
    } else {
      // a platform still failing → schedule a retry with backoff
      job.retries = (job.retries || 0) + 1;
      job.lastError = (item.youtube && item.youtube.error) || (item.instagram && item.instagram.error) || 'partial';
      if (job.retries > MAX_RETRIES) { job.status = 'failed'; job.completedAt = new Date().toISOString(); }
      else { job.status = 'retriable'; job.nextAttemptAt = Date.now() + (BACKOFF[Math.min(job.retries - 1, BACKOFF.length - 1)]); }
    }
  });
}

/** Mark a job as transiently failed (threw) → backoff retry. */
function recordFailure(id, error) {
  return _update(id, (job) => {
    job.retries = (job.retries || 0) + 1;
    job.lastError = String(error && error.message || error || '').slice(0, 280);
    if (job.retries > MAX_RETRIES) { job.status = 'failed'; job.completedAt = new Date().toISOString(); }
    else { job.status = 'retriable'; job.nextAttemptAt = Date.now() + (BACKOFF[Math.min(job.retries - 1, BACKOFF.length - 1)]); }
  });
}

function stats() {
  const jobs = load();
  const by = {};
  for (const j of jobs) by[j.status] = (by[j.status] || 0) + 1;
  return { total: jobs.length, ...by, pendingNow: jobs.filter((j) => (j.status === 'pending' || j.status === 'retriable') && (Number(j.nextAttemptAt) || 0) <= Date.now()).length };
}

/** Remove done/failed jobs older than `keepHours` to keep the file small. */
function compact(keepHours = 72) {
  const cutoff = Date.now() - keepHours * 3600_000;
  const jobs = load().filter((j) => {
    if (j.status !== 'done' && j.status !== 'failed') return true;
    return new Date(j.completedAt || j.queuedAt).getTime() > cutoff;
  });
  save(jobs);
  return jobs.length;
}

module.exports = { enqueue, claimNext, recordResult, recordFailure, stats, compact, load, QUEUE_FILE, BACKOFF, MAX_RETRIES };

if (require.main === module) {
  require('./env-d-drive-only');
  console.log('queue stats:', JSON.stringify(stats(), null, 1));
}
