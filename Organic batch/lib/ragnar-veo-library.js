/**
 * lib/ragnar-veo-library.js
 *
 * Reusable Veo character-action library for the "Ragnar" presenter.
 *
 * Replaces the broken prompt-hash random reuse in i2v-cloud.js:189-220 that
 * picked random cached clips with mismatched content. This library keys clips
 * by ACTION + EMOTION (not scene prompt) so a beat asking for "talking
 * with gravitas" reliably gets the same talk-loop clip every time.
 *
 * Manifest format: public/ragnar-veo/manifest.json
 *   [{
 *     "action": "talk-loop" | "walk-in" | "walk-out" | "point" | "react" |
 *               "warroom-idle" | "count" | "cta",
 *     "emotion": "neutral" | "tension" | "concern" | "alarm" | "doubt" |
 *                "gravitas" | "cta",
 *     "path": "ragnar-veo/talk-loop-neutral.mp4",       // relative to public/
 *     "absolutePath": "D:/anitgravity work/public/ragnar-veo/talk-loop-neutral.mp4",
 *     "loopable": true,
 *     "durationSec": 8.0,
 *     "generatedAt": "2026-06-15T..."
 *   }, ...]
 *
 * Public API:
 *   pickClip({ action, emotion, fallbackAction })
 *   listClips()
 *   hasManifest()
 *   stagePath(clip, v8PublicDir)   // copies the file into v8-public/ so
 *                                   // staticFile() resolves at render time
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'public', 'ragnar-veo', 'manifest.json');

let _manifestCache = null;
let _manifestMtime = 0;

function loadManifest() {
  try {
    const st = fs.statSync(MANIFEST_PATH);
    if (_manifestCache && _manifestMtime === st.mtimeMs) return _manifestCache;
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    _manifestCache = Array.isArray(parsed) ? parsed : (parsed.clips || []);
    _manifestMtime = st.mtimeMs;
    return _manifestCache;
  } catch (_) {
    return [];
  }
}

function hasManifest() {
  const clips = loadManifest();
  return clips.length > 0;
}

function listClips() {
  return loadManifest().slice();
}

// Emotion adjacency — if exact (action, emotion) match misses, fall back to a
// semantically close emotion before failing.
const EMOTION_FALLBACKS = {
  tension:  ['alarm', 'concern', 'gravitas', 'neutral'],
  alarm:    ['tension', 'concern', 'neutral'],
  concern:  ['doubt', 'gravitas', 'tension', 'neutral'],
  doubt:    ['concern', 'gravitas', 'neutral'],
  gravitas: ['concern', 'doubt', 'neutral'],
  cta:      ['neutral', 'gravitas', 'tension'],
  neutral:  ['gravitas', 'concern'],
};

// Action adjacency — if a beat asks "point" but only "cta" + "talk-loop" exist,
// fall back to a related action of similar visual energy.
const ACTION_FALLBACKS = {
  'walk-in':       ['walk-out', 'talk-loop', 'warroom-idle'],
  'walk-out':      ['walk-in', 'talk-loop', 'warroom-idle'],
  'talk-loop':     ['warroom-idle', 'cta'],
  'warroom-idle':  ['talk-loop'],
  'point':         ['cta', 'talk-loop'],
  'count':         ['point', 'talk-loop'],
  'react':         ['point', 'talk-loop'],
  'cta':           ['talk-loop', 'warroom-idle'],
};

/**
 * Pick the best clip matching action + emotion. Returns the manifest entry
 * (with absolutePath) or null if nothing remotely matches.
 *
 * @param {object} opts
 * @param {string} opts.action       e.g. 'talk-loop'
 * @param {string} [opts.emotion]    e.g. 'gravitas'; default 'neutral'
 * @param {string} [opts.fallbackAction]  override the action fallback chain
 * @returns {object|null}
 */
function pickClip({ action, emotion = 'neutral', fallbackAction = null } = {}) {
  const clips = loadManifest();
  if (!clips.length) return null;

  const tryActions = [action, ...(ACTION_FALLBACKS[action] || []), fallbackAction].filter(Boolean);
  const tryEmotions = [emotion, ...(EMOTION_FALLBACKS[emotion] || []), 'neutral'];

  // Exact match preferred, then loosened by emotion, then by action.
  for (const a of tryActions) {
    for (const e of tryEmotions) {
      const hit = clips.find((c) => c.action === a && c.emotion === e);
      if (hit) return hit;
    }
  }
  // Last-ditch: any clip with the right action, any emotion
  for (const a of tryActions) {
    const hit = clips.find((c) => c.action === a);
    if (hit) return hit;
  }
  // Last-last-ditch: any clip with the right emotion
  for (const e of tryEmotions) {
    const hit = clips.find((c) => c.emotion === e);
    if (hit) return hit;
  }
  // Give up — caller should fall back to FLUX-still + parallax
  return null;
}

/**
 * Copy a clip into the v8-public staging dir so staticFile('v8-hero/...')
 * resolves at render time. Returns the relative staticFile path.
 */
function stagePath(clip, v8PublicDir) {
  if (!clip || !clip.absolutePath || !fs.existsSync(clip.absolutePath)) return null;
  const v8HeroDir = path.join(v8PublicDir, 'v8-hero');
  try { fs.mkdirSync(v8HeroDir, { recursive: true }); } catch (_) {}
  const ext = path.extname(clip.absolutePath) || '.mp4';
  const name = `ragnar-${clip.action}-${clip.emotion}${ext}`;
  const dest = path.join(v8HeroDir, name);
  try {
    // Only copy if missing or older
    if (!fs.existsSync(dest) || fs.statSync(clip.absolutePath).mtimeMs > fs.statSync(dest).mtimeMs) {
      fs.copyFileSync(clip.absolutePath, dest);
    }
  } catch (e) {
    return null;
  }
  return 'v8-hero/' + name;
}

module.exports = { pickClip, listClips, hasManifest, stagePath, MANIFEST_PATH };

if (require.main === module) {
  const action = process.argv[2] || 'talk-loop';
  const emotion = process.argv[3] || 'neutral';
  console.log('hasManifest:', hasManifest());
  console.log('listClips:', listClips().length, 'clips');
  console.log(`pickClip({action:"${action}",emotion:"${emotion}"}):`, JSON.stringify(pickClip({ action, emotion }), null, 2));
}
