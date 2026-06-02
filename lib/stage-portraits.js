/**
 * lib/stage-portraits.js — resolve REAL Wikimedia portraits for leader_portrait
 * beats and stage them into the Remotion render public dir. Shared by the live
 * organic renderer (daily-auto-v8) and the V9 sidecar tool.
 *
 * Mutates each leader_portrait beat to add `portraitClip` (a path relative to
 * publicDir, e.g. 'v9-portraits/donald-trump.jpg'). Silent no-op on failure so
 * the scene falls back to the beat's hero clip. $0, cached after first fetch.
 */
'use strict';

const fs = require('fs');
const path = require('path');

async function stagePortraits(directorPlan, publicDir) {
  let getPortrait;
  try { ({ getPortrait } = require('./person-portrait')); } catch (_) { return; }
  const beats = (directorPlan && directorPlan.beats) || [];
  if (!beats.some((b) => b.module === 'leader_portrait' && b.personQuery)) return;
  const destDir = path.join(publicDir, 'v9-portraits');
  fs.mkdirSync(destDir, { recursive: true });
  for (const beat of beats) {
    if (beat.module !== 'leader_portrait' || !beat.personQuery) continue;
    try {
      const res = await getPortrait({ name: beat.personQuery });
      if (res && res.ok && res.path && fs.existsSync(res.path)) {
        const slug = String(beat.personQuery).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const dest = path.join(destDir, slug + (path.extname(res.path) || '.jpg'));
        fs.copyFileSync(res.path, dest);
        beat.portraitClip = 'v9-portraits/' + path.basename(dest);
      }
    } catch (_) { /* fall back to hero clip in the scene */ }
  }
}

module.exports = { stagePortraits };
