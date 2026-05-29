/**
 * lib/horror-detector.js — detect horror gameplay clips by title.
 *
 * Used by trending-clips.js + clip-source-fetcher.js to route IShowSpeed /
 * other creator horror VODs into FULL-FRAME mode (no Subway-Surfers b-roll
 * below) so the jumpscare cadence + facecam reaction stay center-stage.
 *
 * Two entry points:
 *   - isHorror(title)               → boolean
 *   - getCuratedHorrorVODs(creator) → array of high-yield horror VOD seeds
 *
 * Curated list sourced from agent research (2026-05-29): IShowSpeed horror
 * VODs with verified high jumpscare/reaction density on the main channel
 * `UCWsDFcIhY2DBi3GB5uykGXA`. Worst-case copyright outcome: temporary claim
 * (Thumb Media precedent Aug 2022 — claims released within 72h, no
 * terminations). Mitigation: reactive captions + ≤28s + credit + link.
 */

'use strict';

const HORROR_TITLE_REGEX = /\b(FNAF|Five Nights at Freddys?|Outlast|Resident Evil|RE\s*\d|Doors|Granny|Don'?t\s*Scream|Backrooms|Scariest|Horror|Phasmophobia|Visage|Slender|Amnesia|Layers of Fear|Poppy Playtime|Bendy|Demonologist|Devour|Lethal Company|Iron Lung|REPO|Choo[\s-]?Choo|Garten of Banban|Mama Tattletail|Tattletail|Cry of Fear|Alien Isolation|Until Dawn|Silent Hill|Dead Space|Madison|The Mortuary Assistant|Paranormal|Buckshot Roulette|R\.E\.P\.O\.|Skinwalker)\b|scariest game|jumpscare|haunted/i;

const ISHOWSPEED_MAIN_CHANNEL_ID = 'UCWsDFcIhY2DBi3GB5uykGXA';

/**
 * Curated horror VODs from IShowSpeed's main channel. Each row:
 *   { videoId, title, game, durationMin, expectedReactionDensity, hotMoments? }
 * hotMoments are best-effort timestamp seeds (seconds into video) for the
 * clip moment-picker to anchor around. The pipeline still re-scans for
 * audio peaks, but these seeds improve hit-rate.
 */
const ISHOWSPEED_HORROR_VODS = [
  { videoId: 'v4MbjYVmlwo', title: 'IShowSpeed Plays FNAF PLUS Horror Game (FULL VIDEO)', game: 'FNAF Plus',     durationMin: 110, hotMoments: [320, 720, 1280, 1850, 2400] },
  { videoId: 'UcnkYCLInII', title: 'IShowSpeed Plays FNAF 4 [FULL GAME]',                  game: 'FNAF 4',         durationMin: 95,  hotMoments: [240, 600, 1100, 1700, 2200] },
  { videoId: '0qzaGoB4jzo', title: 'IShowSpeed plays FNAF 4 again',                        game: 'FNAF 4',         durationMin: 70,  hotMoments: [180, 540, 980, 1500] },
  { videoId: 'O4SLIxC3s8I', title: 'BEATING OUTLAST (HORROR GAME)',                        game: 'Outlast',        durationMin: 140, hotMoments: [420, 900, 1450, 2100, 2750] },
  { videoId: 'bptQokOMqpg', title: 'IShowSpeed Plays Resident Evil 7 [FULL GAME]',         game: 'RE7',            durationMin: 180, hotMoments: [600, 1200, 1900, 2600, 3400] },
  { videoId: 'g9zRZkEKP60', title: 'IShowSpeed Beats Resident Evil: Requiem (FULL STREAM)', game: 'RE Requiem',    durationMin: 240, hotMoments: [720, 1500, 2400, 3300, 4200] },
  { videoId: 'FaC_44iNcMo', title: 'IShowSpeed Plays Don\'t Scream Horror Game',           game: "Don't Scream",   durationMin: 40,  hotMoments: [60, 180, 420, 800, 1200] },
  { videoId: 'QRGUyrBf-NI', title: 'iShowSpeed Reacts To The BACKROOMS',                   game: 'Backrooms',      durationMin: 25,  hotMoments: [120, 400, 700, 1100] },
  { videoId: 'yMXStCfXPP8', title: 'iShowSpeed Plays The SCARIEST Roblox Game (Doors)',    game: 'Roblox Doors',   durationMin: 80,  hotMoments: [200, 540, 980, 1500, 2200] },
  { videoId: '1vxwWcskX6Y', title: 'iShowSpeed Plays The SCARIEST Game Of 2023',           game: 'Indie horror',   durationMin: 60,  hotMoments: [180, 540, 1100, 1800] },
];

function isHorror(title) {
  return HORROR_TITLE_REGEX.test(String(title || ''));
}

/**
 * Return curated horror VOD seeds for a given creator. Today only IShowSpeed.
 * Future creators can be added by extending the switch.
 */
function getCuratedHorrorVODs(creator) {
  const c = String(creator || '').toLowerCase();
  if (c.includes('speed') || c.includes('ishowspeed')) {
    return ISHOWSPEED_HORROR_VODS.map((v) => ({
      ...v,
      sourceUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
      sourceChannelId: ISHOWSPEED_MAIN_CHANNEL_ID,
      sourceCreator: 'IShowSpeed',
      mode: 'full_frame_horror',
    }));
  }
  return [];
}

module.exports = { isHorror, getCuratedHorrorVODs, ISHOWSPEED_HORROR_VODS, ISHOWSPEED_MAIN_CHANNEL_ID };

if (require.main === module) {
  const tests = [
    'IShowSpeed Plays FNAF 4 [FULL GAME]',
    'MrBeast Last to Leave $1M Wins',
    'IShowSpeed reacts to scariest Roblox game',
    'JD Vance speaks at podium',
    'Outlast SCARED ME!!!',
  ];
  for (const t of tests) console.log(`${isHorror(t) ? '✓' : '✗'} ${t}`);
  console.log('\ncurated IShowSpeed VODs:');
  for (const v of getCuratedHorrorVODs('IShowSpeed').slice(0, 3)) console.log(`  ${v.videoId} → ${v.title}`);
}
