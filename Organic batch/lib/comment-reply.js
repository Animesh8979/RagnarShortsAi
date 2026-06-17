/**
 * lib/comment-reply.js — L113 GODMODE Pillar 4 (engagement flywheel).
 *
 * After a video uploads: post the two-sided DEBATE question as the creator (the
 * pinned-prompt substitute) and REPLY to the top comments in Ragnar's voice.
 * Pulling each commenter back = a notification → a return view → an engagement
 * spike inside the algorithm's first-hour eval window. Directly attacks the wall
 * the analytics exposed (saves/shares/comments ≈ 0).
 *
 * Standalone + gated (`COMMENT_REPLY=1`), fail-open. Reuses the youtube-engagement
 * OAuth pattern (yt-credentials.json → refresh_token). Caller passes the right
 * channel's creds. NOT yet wired into auto-upload-fresh — that wiring + a live
 * run get tested tomorrow.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const persona = require('./ragnar-persona');

const ROOT = path.resolve(__dirname, '..');

function authFor(credsPath) {
  const p = credsPath || path.join(ROOT, 'yt-credentials.json');
  const creds = JSON.parse(fs.readFileSync(p, 'utf8'));
  const o = new google.auth.OAuth2(creds.client_id, creds.client_secret, 'urn:ietf:wg:oauth:2.0:oob');
  o.setCredentials({ refresh_token: creds.refresh_token });
  return o;
}

/**
 * @param {object} opts
 *   videoId    (required) the uploaded YT video id
 *   question   debate question (defaults to a persona debate-CTA)
 *   topicClass for picking a matching debate-CTA
 *   topReplies how many top comments to reply to (default 3)
 *   credsPath  channel creds (default root yt-credentials.json)
 * @returns {Promise<{ok, posted?, replied?, reason?}>}
 */
async function pinDebateAndReply(opts = {}) {
  if (process.env.COMMENT_REPLY !== '1') return { ok: false, reason: 'disabled (set COMMENT_REPLY=1)' };
  const videoId = opts.videoId;
  if (!videoId) return { ok: false, reason: 'no_videoId' };
  const question = opts.question || persona.pickDebateCTA(opts.topicClass || 'general_news');
  const topReplies = Math.max(0, Number(opts.topReplies != null ? opts.topReplies : 3));
  try {
    const auth = authFor(opts.credsPath);
    const yt = google.youtube({ version: 'v3', auth });
    // 1. Post the debate question as the creator (drives the comment war).
    let posted = false;
    try {
      await yt.commentThreads.insert({ part: ['snippet'], requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: question } } } } });
      posted = true;
    } catch (e) { /* fail-open */ }
    // 2. Reply to the top comments in Ragnar's voice (pulls commenters back).
    let replied = 0;
    if (topReplies > 0) {
      try {
        const list = await yt.commentThreads.list({ part: ['snippet'], videoId, order: 'relevance', maxResults: Math.min(20, topReplies * 4) });
        const items = (list.data.items || []).slice(0, topReplies);
        for (const it of items) {
          const parentId = it.id;
          const reply = `Solid take — ${persona.pickCatchphraseClose()}`; // v1 in-voice ack; LLM-personalised reply is a later upgrade
          try { await yt.comments.insert({ part: ['snippet'], requestBody: { snippet: { parentId, textOriginal: reply } } }); replied++; } catch (_) {}
        }
      } catch (_) {}
    }
    return { ok: posted || replied > 0, posted, replied, question };
  } catch (e) {
    return { ok: false, reason: (e && e.message || e).toString().slice(0, 140) };
  }
}

module.exports = { pinDebateAndReply };

if (require.main === module) {
  require('./env-d-drive-only');
  const videoId = process.argv[2];
  if (!videoId) { console.error('Usage: COMMENT_REPLY=1 node lib/comment-reply.js <videoId> [credsPath]'); process.exit(2); }
  pinDebateAndReply({ videoId, credsPath: process.argv[3] }).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
}
