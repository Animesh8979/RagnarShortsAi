/**
 * lib/pinned-comment-bait.js — L109 P3
 *
 * Generate + post a pinned comment within ~90s of upload using the 8
 * 2026-tested templates (Agent 3 growth-manager research). Pinned-comment
 * within 90s of upload drives reply rate +30% which is a known algorithm
 * signal in 2026.
 *
 * Templates (rotate based on content kind):
 *   1. "Pt 2 drops {day} — comment '{word}' if you want it"
 *   2. "Did you catch [easter egg at {ts}]? 👀"
 *   3. "Hot take: {controversial claim}. Agree?"
 *   4. "I almost cut [specific detail] — should I have?"
 *   5. "Which of these did you spot first — A, B, or C?"
 *   6. "Reply '{emoji}' if {thing} also confused you"
 *   7. "Full breakdown on {topic} — search 'channel + {keyword}'"
 *   8. "Wrong! {provocative correction of own video}"
 *
 * Exports:
 *   - generatePinnedComment({ kind, topic, creator, momentKeyword, durationSec })
 *     → string ready to post
 *   - postAndPin({ videoId, channelLabel, comment })
 *     → uses youtube-engagement.js postTopLevelComment
 */

'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const REACTION_EMOJIS = ['🔥', '💀', '🤯', '👀', '😱', '💯'];

function pickTemplate(index, total = 8) {
  // Deterministic rotation by upload index — so consecutive videos
  // don't both use Pt-2 bait.
  return Math.abs(index) % total;
}

/**
 * Generate a pinned-comment string based on content shape.
 *
 * @param {object} ctx
 * @param {'organic'|'clip'} ctx.kind
 * @param {string} ctx.topic                  organic: news topic, clip: source title
 * @param {string} [ctx.creator]              for clips
 * @param {string} [ctx.momentKeyword]        for clips
 * @param {string} [ctx.tsHint='0:14']        timestamp hint for "did you catch" template
 * @param {number} [ctx.rotationIndex=0]      bumps template selection
 * @returns {string}
 */
function generatePinnedComment(ctx) {
  const kind = ctx.kind || 'organic';
  const idx = pickTemplate(ctx.rotationIndex || 0);
  const tomorrow = DAYS[(new Date().getDay() + 1) % 7];
  const emoji = REACTION_EMOJIS[(ctx.rotationIndex || 0) % REACTION_EMOJIS.length];
  const tsHint = ctx.tsHint || '0:14';
  const topic = String(ctx.topic || '').slice(0, 50);
  const creator = String(ctx.creator || 'this creator').slice(0, 30);
  const momentKeyword = String(ctx.momentKeyword || 'this moment').slice(0, 30);

  const templates = kind === 'clip' ? [
    `Pt 2 of ${creator}'s best moments drops ${tomorrow} — drop "next" if you want it 👇`,
    `Did you catch what happened at ${tsHint}? 👀`,
    `Hot take: ${creator} actually played this better than everyone gave them credit for. Agree?`,
    `I almost cut the ${momentKeyword} reaction — should I have? 🤔`,
    `Which moment hit harder — A, B, or C? 👇`,
    `Reply ${emoji} if you thought ${momentKeyword} was the wildest part`,
    `Full ${creator} breakdown coming Friday — search "${creator} ${momentKeyword}" if you want a heads up`,
    `Wrong! Actually ${creator}'s ${momentKeyword} was the smarter play. Here's why 👇`,
  ] : [
    `Pt 2 with the deeper analysis drops ${tomorrow} — drop "${topic.split(' ')[0] || 'next'}" if you want it 👇`,
    `Did you catch what gets said at ${tsHint}? 👀`,
    `Hot take: ${topic} is more about ${(topic.split(' ').slice(-1)[0] || 'context')} than headlines admit. Agree?`,
    `I almost cut the third beat — was it the strongest? 🤔`,
    `Which beat hit hardest — A, B, or C? Drop your pick 👇`,
    `Reply ${emoji} if you also didn't know about ${topic.split(' ').slice(-2).join(' ')}`,
    `Full breakdown on ${topic.split(' ').slice(0, 3).join(' ')} comes Friday — search it`,
    `Hot take: I was actually wrong about ${topic.split(' ').slice(0, 3).join(' ')}. Here's why 👇`,
  ];

  return templates[idx];
}

/**
 * Post the comment as the channel owner. The YouTube API does NOT allow
 * setting "pinned" via the comments.insert endpoint — pinning is owner-side
 * UI only. But the API DOES auto-surface owner comments to the top of the
 * default sort within 30s, which is functionally equivalent for the first
 * 90 minutes of distribution.
 *
 * @param {object} opts
 * @param {string} opts.videoId
 * @param {string} opts.channelLabel    'RagnarShortsUltimate' | 'RagnarShortsAI'
 * @param {string} opts.comment
 * @returns {Promise<{ok, commentId?, reason?}>}
 */
async function postAndPin(opts) {
  if (!opts || !opts.videoId || !opts.comment) return { ok: false, reason: 'missing_args' };
  if (process.env.SKIP_PIN_COMMENT === '1') return { ok: false, reason: 'SKIP_PIN_COMMENT=1' };
  try {
    // Set creds path based on channelLabel.
    const credsByLabel = {
      'RagnarShortsUltimate': path.join(ROOT, 'yt-credentials.json'),
      'RagnarShortsAI':       path.join(ROOT, 'yt-credentials-2.json'),
    };
    const credsPath = credsByLabel[opts.channelLabel] || credsByLabel['RagnarShortsUltimate'];
    process.env.YOUTUBE_CREDENTIALS_PATH = credsPath; // youtube-engagement.js reads this

    const engagement = require(path.join(ROOT, 'youtube-engagement.js'));
    const r = await engagement.postTopLevelComment(opts.videoId, opts.comment);
    return { ok: !!(r && r.id), commentId: r && r.id, reason: r && r.error ? r.error : null };
  } catch (e) {
    return { ok: false, reason: (e && e.message || String(e)).slice(0, 200) };
  }
}

module.exports = { generatePinnedComment, postAndPin };

if (require.main === module) {
  require('./env-d-drive-only');
  console.log('=== sample organic comments ===');
  for (let i = 0; i < 8; i++) {
    console.log(`  [${i}]`, generatePinnedComment({
      kind: 'organic',
      topic: 'US Iran framework deal Vance',
      tsHint: '0:18',
      rotationIndex: i,
    }));
  }
  console.log('\n=== sample clip comments ===');
  for (let i = 0; i < 8; i++) {
    console.log(`  [${i}]`, generatePinnedComment({
      kind: 'clip',
      creator: 'IShowSpeed',
      momentKeyword: 'foxy jumpscare',
      topic: 'FNAF Plus reaction',
      tsHint: '0:12',
      rotationIndex: i,
    }));
  }
}
