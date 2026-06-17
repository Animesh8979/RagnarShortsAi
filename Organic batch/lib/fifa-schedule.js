/**
 * lib/fifa-schedule.js — FIFA World Cup 2026 data backbone (L115).
 *
 * $0, no API key. Fetches fixtures from openfootball/worldcup.json (raw JSON) with
 * a resilient curated fallback, plus a countdown to kickoff (2026-06-11) and a
 * rights-safe TOPIC GENERATOR that feeds the existing organic + clip lanes (Lane A
 * = zero-footage cinematic data; the category broadcasters/clippers can't out-volume).
 *
 * Used by the FIFA test videos + the FIFA batch lane. Never throws — always returns
 * a usable topic so the FIFA lane can't starve (same resilience as trending-news).
 */
'use strict';

const fetch = require('node-fetch');

const KICKOFF = Date.UTC(2026, 5, 11); // 2026-06-11 (USA/Canada/Mexico)
const FINAL = Date.UTC(2026, 6, 19);   // 2026-07-19

// Curated $0 fallback knowledge (used when live fixtures aren't fetchable).
const FAVOURITES = ['Argentina', 'France', 'Brazil', 'England', 'Spain', 'Portugal', 'Germany', 'Netherlands'];
const HOST_CITIES = ['New York/NJ', 'Los Angeles', 'Dallas', 'Mexico City', 'Toronto', 'Miami', 'Atlanta', 'Seattle', 'Vancouver', 'Kansas City', 'Houston', 'Philadelphia', 'Boston', 'San Francisco', 'Guadalajara', 'Monterrey'];
const STORYLINES = [
  "Messi's last dance: can Argentina go back-to-back?",
  'First 48-team World Cup — 104 matches, 39 days, 3 nations',
  "France's golden generation: Mbappé's tournament to lose?",
  'Can a CONCACAF host nation finally make a deep run?',
  "Brazil's rebuild: a new era after the Neymar years",
  'The dark horses: which nation crashes the favourites\' party?',
  'England\'s 60-year wait — is this finally the squad?',
  'Spain vs the world after their Euro dominance',
];

function daysToKickoff(now = Date.now()) { return Math.ceil((KICKOFF - now) / 86400000); }

async function fetchFixtures() {
  // openfootball publishes raw JSON; try a couple of likely paths, fail soft.
  const urls = [
    'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
    'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026--qatar/worldcup.json',
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const j = await r.json();
      const matches = [];
      for (const round of (j.rounds || [])) for (const m of (round.matches || [])) {
        matches.push({ date: m.date, team1: (m.team1 && m.team1.name) || m.team1, team2: (m.team2 && m.team2.name) || m.team2, group: round.name });
      }
      if (matches.length) return { ok: true, matches, source: url };
    } catch (_) { /* next */ }
  }
  return { ok: false, matches: [] };
}

/**
 * Generate a rights-safe FIFA topic for a lane.
 * @param {object} opts { lane: 'organic'|'clip', seed?: number }
 * @returns {Promise<{title, summary, sources, fifa:true, lane}>}
 */
async function generateTopic(opts = {}) {
  const lane = opts.lane === 'clip' ? 'clip' : 'organic';
  const days = daysToKickoff();
  const phase = days > 0 ? `pre-tournament (${days} days to kickoff)` : (Date.now() <= FINAL ? 'live tournament' : 'post-tournament');
  const fx = await fetchFixtures();
  const seedN = Number.isFinite(opts.seed) ? opts.seed : Math.floor(Date.now() / 3600000);

  if (lane === 'clip') {
    // Clip lane = a FUNNY/hype football-culture moment-tease (no raw match footage;
    // the clip pipeline supplies the actual creator source). Reaction/analysis framing.
    const story = STORYLINES[seedN % STORYLINES.length];
    return {
      title: `World Cup 2026 is ${days > 0 ? days + ' days away' : 'HERE'} and football fans are losing it`,
      summary: `Hype/reaction angle on: ${story}. Big-emotion football-culture moment for a Shorts clip. ${phase}.`,
      sources: ['fifa-wc26'], fifa: true, lane: 'clip', days, phase,
    };
  }

  // Organic lane = cinematic data Short (Lane A: zero footage, rights-clean).
  let title, summary;
  if (days > 0) {
    const fav = FAVOURITES[seedN % FAVOURITES.length];
    title = `World Cup 2026 starts in ${days} days: the favourites, 16 host cities, and why ${fav} could win it all`;
    summary = `FIFA World Cup 2026 — first 48-team edition, 104 matches across USA/Canada/Mexico from June 11. Cinematic preview: the title favourites (${FAVOURITES.slice(0, 4).join(', ')}), the host cities, and the biggest storyline — "${STORYLINES[seedN % STORYLINES.length]}". Data + map driven, no match footage.`;
  } else {
    title = `World Cup 2026 LIVE: the bracket, the upsets, and who's still standing`;
    summary = `Live cinematic recap/preview of the FIFA World Cup 2026 — group permutations, knockout bracket, the storylines. Data + map driven.`;
  }
  if (fx.ok && fx.matches.length) summary += ` (live fixtures loaded: ${fx.matches.length} matches).`;
  return { title, summary, sources: ['fifa-wc26'], fifa: true, lane: 'organic', days, phase, fixtures: fx.ok ? fx.matches.length : 0 };
}

module.exports = { generateTopic, fetchFixtures, daysToKickoff, KICKOFF, FINAL, FAVOURITES, HOST_CITIES, STORYLINES };

if (require.main === module) {
  require('./env-d-drive-only');
  (async () => {
    console.log('days to kickoff:', daysToKickoff());
    console.log('ORGANIC topic:', JSON.stringify(await generateTopic({ lane: 'organic' }), null, 1));
    console.log('CLIP topic:', JSON.stringify(await generateTopic({ lane: 'clip' }), null, 1));
  })();
}
