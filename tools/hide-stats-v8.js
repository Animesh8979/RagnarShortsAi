#!/usr/bin/env node
/**
 * tools/hide-stats-v8.js — Hide like/view/comment counts on the 4 live V8 uploads.
 *
 * YouTube: `videos.update(part=status)` with `publicStatsViewable=false`
 *   → hides like count, view count, dislike count from the public watch page.
 *   (YT Data API v3 has NO field to disable comments; that requires a manual
 *    toggle in YouTube Studio. We log a reminder per-video.)
 *
 * Instagram: edit the published media via Graph API
 *   POST /{ig-media-id}?comments_disabled=true                  (hides comment count + section)
 *   POST /{ig-media-id}?like_and_view_counts_disabled=true      (hides like+view counts)
 *
 * Sources:
 *   https://developers.google.com/youtube/v3/docs/videos/update
 *   https://developers.facebook.com/docs/instagram-platform/reference/instagram-media#updating
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { google } = require('googleapis');

const ROOT = path.resolve(__dirname, '..');

const TARGETS = [
  { id: 'A1', yt: { videoId: 'F_kvfZJ0sk4', creds: 'yt-credentials.json',  channel: 'RagnarShortsAi'       }, ig: { mediaId: null, permalink: 'https://www.instagram.com/reel/DYnWMXZj0Eu/' } },
  { id: 'A2', yt: { videoId: 'dsfHx2l9vgA', creds: 'yt-credentials.json',  channel: 'RagnarShortsAi'       }, ig: { mediaId: null, permalink: 'https://www.instagram.com/reel/DYndNaEEq5_/' } },
  { id: 'B1', yt: { videoId: '5dNOzIgN04s', creds: 'yt-credentials-2.json', channel: 'RagnarShortsUltimate' }, ig: { mediaId: null, permalink: 'https://www.instagram.com/reel/DYnkTxSkWv-/' } },
  { id: 'B2', yt: { videoId: 'ieUJFlbixuQ', creds: 'yt-credentials-2.json', channel: 'RagnarShortsUltimate' }, ig: { mediaId: null, permalink: 'https://www.instagram.com/reel/DYnrSQiivKE/' } },
];

function hydrateIgMediaIds() {
  // Pull mediaId from the V8 organic + clip upload result logs.
  const organicLog = path.join(ROOT, 'renders', 'premium-clips-v2', 'V8-upload-results-2026-05-21.json');
  const clipLog = path.join(ROOT, 'renders', 'creator-clips-v2', 'V8-upload-results-2026-05-21.json');
  const tryLoad = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } };
  const sources = [tryLoad(organicLog), tryLoad(clipLog)].filter(Boolean);
  for (const t of TARGETS) {
    for (const src of sources) {
      const hit = (src.results || []).find((r) => r.variant === t.id);
      if (hit && hit.instagram && hit.instagram.mediaId) { t.ig.mediaId = hit.instagram.mediaId; break; }
    }
  }
}

async function hideYouTubeStats(videoId, credsPath) {
  const c = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  const oauth2 = new google.auth.OAuth2(c.client_id, c.client_secret);
  oauth2.setCredentials({ refresh_token: c.refresh_token });
  const yt = google.youtube({ version: 'v3', auth: oauth2 });
  try {
    const get = await yt.videos.list({ id: videoId, part: ['snippet', 'status'] });
    const v = (get.data.items || [])[0];
    if (!v) return { ok: false, error: 'video_not_found' };
    const upd = await yt.videos.update({
      part: ['status'],
      requestBody: {
        id: videoId,
        status: {
          publicStatsViewable: false,                                      // hides like / view count
          privacyStatus: v.status && v.status.privacyStatus || 'public',   // preserve
          selfDeclaredMadeForKids: !!(v.status && v.status.selfDeclaredMadeForKids),
          embeddable: v.status && v.status.embeddable !== false,
        },
      },
    });
    return {
      ok: true,
      publicStatsViewable: upd.data.status && upd.data.status.publicStatsViewable,
      note: 'YT API cannot disable comments — toggle "Comments off" manually in YouTube Studio if needed.',
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 240) };
  }
}

async function hideInstagramStats(mediaId) {
  if (!mediaId) return { ok: false, error: 'no_media_id' };
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return { ok: false, error: 'no_INSTAGRAM_ACCESS_TOKEN' };
  // Meta Graph API edit endpoint actual field names (per #100 error response):
  //   comment_enabled=false           → hides comment count + section
  //   like_and_view_counts_disabled=true → hides like + view counts
  // Two POSTs because each field needs its own call.
  const results = {};
  for (const [field, value] of [['comment_enabled', 'false'], ['like_and_view_counts_disabled', 'true']]) {
    try {
      const url = `https://graph.facebook.com/v24.0/${mediaId}?${field}=${value}&access_token=${encodeURIComponent(token)}`;
      const r = await fetch(url, { method: 'POST' });
      const body = await r.text();
      results[field] = { status: r.status, ok: r.ok, body: body.slice(0, 240) };
    } catch (e) {
      results[field] = { ok: false, error: String(e && e.message || e).slice(0, 240) };
    }
  }
  const allOk = Object.values(results).every((r) => r.ok);
  return { ok: allOk, results };
}

async function main() {
  hydrateIgMediaIds();
  const log = { ranAt: new Date().toISOString(), items: [] };
  for (const t of TARGETS) {
    console.log('\n=== ' + t.id + ' ===');
    const item = { id: t.id, youtube: null, instagram: null };

    console.log('  YT: hiding public stats on ' + t.yt.videoId + ' (' + t.yt.channel + ')...');
    item.youtube = await hideYouTubeStats(t.yt.videoId, path.join(ROOT, t.yt.creds));
    if (item.youtube.ok) console.log('  YT: OK publicStatsViewable=' + item.youtube.publicStatsViewable);
    else console.log('  YT: FAILED ' + item.youtube.error);
    if (item.youtube.note) console.log('  ⚠  ' + item.youtube.note);

    console.log('  IG: hiding comments + like/view counts on ' + (t.ig.mediaId || '(no mediaId)') + '...');
    item.instagram = await hideInstagramStats(t.ig.mediaId);
    if (item.instagram.ok) console.log('  IG: OK both fields set');
    else console.log('  IG: PARTIAL/FAIL ' + JSON.stringify(item.instagram.results || item.instagram.error).slice(0, 300));

    log.items.push(item);
  }

  const outPath = path.join(ROOT, 'renders', 'analytics', 'hide-stats-v8-2026-05-22.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(log, null, 2));
  console.log('\nLog: ' + outPath);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
