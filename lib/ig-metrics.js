/**
 * lib/ig-metrics.js — Phase 1.3
 *
 * Pull per-reel insights for every Instagram media shipped in the last N
 * days. Mirrors what `refresh-youtube-analytics.js` does for YouTube so the
 * feedback model in `analytics-feedback.js` can score Reels alongside Shorts.
 *
 * Source of mediaIds: scan `renders/fresh-batch-upload-*.json` and the
 * legacy `renders/{premium,creator}-clips-v2/V8-upload-results-*.json`
 * files for `item.instagram.mediaId`.
 *
 * Metrics requested per Reels media (free-tier-safe; subset of insights
 * that work without business-account approval):
 *   - reach, plays, saved, shares, total_interactions, likes, comments
 *
 * Output: `renders/analytics/ig-metrics-{date}.jsonl` (one row per pull).
 *
 * The Graph API insights endpoint shape:
 *   GET /{media-id}/insights?metric=reach,plays,saved,shares,comments,likes,total_interactions
 *     &access_token={token}
 *   Returns: { data: [{ name, period, values:[{value, end_time}], title, description, id }] }
 */

'use strict';

require('./env-d-drive-only');  // dotenv override + force ALL caches/temp to D:\ (no C: writes)
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const ROOT = path.resolve(__dirname, '..');
const ANALYTICS_DIR = path.join(ROOT, 'renders', 'analytics');
const GRAPH_V = 'v24.0';

function ensureDir(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function todayDate() { return new Date().toISOString().slice(0, 10); }

function collectShippedMedia({ sinceDays = 14 } = {}) {
  const cutoff = Date.now() - sinceDays * 86_400_000;
  const items = [];

  // Fresh-batch upload results
  if (fs.existsSync(path.join(ROOT, 'renders'))) {
    const rendersDir = path.join(ROOT, 'renders');
    const files = fs.readdirSync(rendersDir).filter((f) => /^fresh-batch-upload-\d{4}-\d{2}-\d{2}\.json$/.test(f));
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(rendersDir, f), 'utf8'));
        for (const it of j.items || []) {
          if (it.instagram && it.instagram.mediaId) {
            const startedAtMs = Date.parse(it.startedAt || it.finishedAt || j.ranAt || 0);
            if (startedAtMs >= cutoff) {
              items.push({
                mediaId: String(it.instagram.mediaId),
                permalink: it.instagram.permalink || null,
                kind: it.kind || 'organic',
                title: it.title || null,
                postedAt: it.startedAt || it.finishedAt || j.ranAt,
                source: f,
              });
            }
          }
        }
      } catch (_) {}
    }
  }

  // Legacy V8 batch upload results (premium + creator)
  for (const lane of ['premium-clips-v2', 'creator-clips-v2']) {
    const dir = path.join(ROOT, 'renders', lane);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => /^V8-upload-results-\d{4}-\d{2}-\d{2}\.json$/.test(f));
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        for (const res of j.results || []) {
          if (res.instagram && res.instagram.mediaId) {
            const startedAtMs = Date.parse(res.startedAt || j.startedAt || 0);
            if (startedAtMs >= cutoff) {
              items.push({
                mediaId: String(res.instagram.mediaId),
                permalink: res.instagram.permalink || null,
                kind: lane === 'creator-clips-v2' ? 'clip' : 'organic',
                title: res.title || null,
                postedAt: res.startedAt || j.startedAt,
                source: `${lane}/${f}`,
              });
            }
          }
        }
      } catch (_) {}
    }
  }

  // Dedupe by mediaId; keep the latest postedAt.
  const byId = new Map();
  for (const i of items) {
    const prev = byId.get(i.mediaId);
    if (!prev || Date.parse(i.postedAt || 0) > Date.parse(prev.postedAt || 0)) byId.set(i.mediaId, i);
  }
  return [...byId.values()];
}

async function fetchInsights(mediaId, token) {
  // Reels metric set for Graph API v24.0:
  //   `views` replaces deprecated `plays` from v22.0+
  //   `total_interactions` is the umbrella engagement count
  //   `ig_reels_video_view_total_time` is fine-grained but requires extra approval — skip
  // Keep this list conservative so a single bad metric doesn't 400 the whole call.
  const metrics = ['views', 'reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions'].join(',');
  const url = `https://graph.facebook.com/${GRAPH_V}/${encodeURIComponent(mediaId)}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const body = await r.text();
    if (!r.ok) return { ok: false, status: r.status, body: body.slice(0, 240) };
    let json;
    try { json = JSON.parse(body); } catch (_) { return { ok: false, reason: 'bad_json', body: body.slice(0, 240) }; }
    const flat = {};
    for (const d of json.data || []) {
      if (Array.isArray(d.values) && d.values[0] && typeof d.values[0].value !== 'undefined') {
        flat[d.name] = d.values[0].value;
      }
    }
    return { ok: true, metrics: flat };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e).slice(0, 240) };
  }
}

async function refresh({ sinceDays = 14 } = {}) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return { ok: false, reason: 'no_INSTAGRAM_ACCESS_TOKEN' };

  const shipped = collectShippedMedia({ sinceDays });
  console.log(`[ig-metrics] ${shipped.length} IG media in last ${sinceDays}d`);

  ensureDir(ANALYTICS_DIR);
  const outFile = path.join(ANALYTICS_DIR, `ig-metrics-${todayDate()}.jsonl`);
  // Reset today's file so each daily run is a clean snapshot of current insights.
  fs.writeFileSync(outFile, '');

  let ok = 0, fail = 0;
  for (const m of shipped) {
    const r = await fetchInsights(m.mediaId, token);
    const row = {
      ts: new Date().toISOString(),
      mediaId: m.mediaId,
      permalink: m.permalink,
      kind: m.kind,
      title: m.title,
      postedAt: m.postedAt,
      ok: r.ok,
      ...(r.ok ? { metrics: r.metrics } : { error: r.reason || r.body || `http_${r.status}` }),
    };
    fs.appendFileSync(outFile, JSON.stringify(row) + '\n');
    if (r.ok) { ok += 1; } else { fail += 1; }
    // tiny pause to keep under Graph's 200/h burst
    await new Promise((res) => setTimeout(res, 300));
  }
  console.log(`[ig-metrics] ok=${ok}  fail=${fail}  → ${outFile}`);
  return { ok: true, path: outFile, okCount: ok, failCount: fail, totalShipped: shipped.length };
}

module.exports = { refresh, collectShippedMedia };

if (require.main === module) {
  const args = process.argv.slice(2);
  const sinceIdx = args.indexOf('--since');
  let sinceDays = 14;
  if (sinceIdx >= 0 && args[sinceIdx + 1]) {
    const v = String(args[sinceIdx + 1]);
    if (v.endsWith('h')) sinceDays = Math.max(1, Math.ceil(Number(v.slice(0, -1)) / 24));
    else if (v.endsWith('d')) sinceDays = Number(v.slice(0, -1)) || 14;
    else sinceDays = Number(v) || 14;
  }
  refresh({ sinceDays }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => { console.error('FATAL:', e); process.exit(2); });
}
