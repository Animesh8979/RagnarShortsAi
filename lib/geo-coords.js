/**
 * lib/geo-coords.js — place-name → map coordinates for the geopolitics MapScene.
 *
 * Competitor research (World Wide View, Geopolitics Daily): animated maps with
 * the REAL countries named in the script are THE format that wins this niche.
 * This maps the geopolitics niche-lock keywords to lon/lat + a clean display
 * name, and projects lon/lat → x,y on an equirectangular canvas so the Remotion
 * MapScene can drop pins + draw arcs between the actual places in each beat.
 *
 * Pure data + math. $0, no deps.
 */
'use strict';

// lon (−180..180), lat (−90..90), display label. Capitals/centroids of the
// places our geopolitics lane actually talks about.
const PLACES = {
  iran:        { lon: 53.7, lat: 32.4, name: 'IRAN' },
  israel:      { lon: 34.9, lat: 31.5, name: 'ISRAEL' },
  gaza:        { lon: 34.4, lat: 31.4, name: 'GAZA' },
  ukraine:     { lon: 31.2, lat: 49.0, name: 'UKRAINE' },
  russia:      { lon: 37.6, lat: 55.8, name: 'RUSSIA' },
  moscow:      { lon: 37.6, lat: 55.8, name: 'MOSCOW' },
  kremlin:     { lon: 37.6, lat: 55.8, name: 'KREMLIN' },
  china:       { lon: 104.2, lat: 35.9, name: 'CHINA' },
  beijing:     { lon: 116.4, lat: 39.9, name: 'BEIJING' },
  taiwan:      { lon: 121.0, lat: 23.7, name: 'TAIWAN' },
  usa:         { lon: -98.6, lat: 39.8, name: 'USA' },
  america:     { lon: -98.6, lat: 39.8, name: 'USA' },
  washington:  { lon: -77.0, lat: 38.9, name: 'WASHINGTON' },
  pentagon:    { lon: -77.06, lat: 38.87, name: 'PENTAGON' },
  tehran:      { lon: 51.4, lat: 35.7, name: 'TEHRAN' },
  nato:        { lon: 4.4, lat: 50.8, name: 'NATO' },
  europe:      { lon: 10.0, lat: 50.0, name: 'EUROPE' },
  india:       { lon: 78.9, lat: 22.6, name: 'INDIA' },
  pakistan:    { lon: 69.3, lat: 30.4, name: 'PAKISTAN' },
  'north korea': { lon: 127.5, lat: 40.3, name: 'N. KOREA' },
  korea:       { lon: 127.5, lat: 38.0, name: 'KOREA' },
  japan:       { lon: 138.3, lat: 36.2, name: 'JAPAN' },
  syria:       { lon: 39.0, lat: 34.8, name: 'SYRIA' },
  iraq:        { lon: 43.7, lat: 33.2, name: 'IRAQ' },
  yemen:       { lon: 48.5, lat: 15.6, name: 'YEMEN' },
  'saudi arabia': { lon: 45.1, lat: 23.9, name: 'SAUDI ARABIA' },
  saudi:       { lon: 45.1, lat: 23.9, name: 'SAUDI ARABIA' },
  lebanon:     { lon: 35.9, lat: 33.9, name: 'LEBANON' },
  turkey:      { lon: 35.2, lat: 39.0, name: 'TURKEY' },
  egypt:       { lon: 30.8, lat: 26.8, name: 'EGYPT' },
  venezuela:   { lon: -66.6, lat: 6.4, name: 'VENEZUELA' },
  hormuz:      { lon: 56.5, lat: 26.6, name: 'STRAIT OF HORMUZ' },
  'red sea':   { lon: 38.0, lat: 20.0, name: 'RED SEA' },
};

// alias → key (handles adjectives/demonyms in scripts)
const ALIASES = {
  iranian: 'iran', israeli: 'israel', ukrainian: 'ukraine', russian: 'russia',
  chinese: 'china', american: 'usa', 'u.s.': 'usa', 'u.s': 'usa', us: 'usa',
  taiwanese: 'taiwan', korean: 'korea', japanese: 'japan', syrian: 'syria',
  iraqi: 'iraq', saudis: 'saudi', european: 'europe', indian: 'india',
  pakistani: 'pakistan', turkish: 'turkey', egyptian: 'egypt',
};

function project(lon, lat, W = 1080, H = 1080) {
  // equirectangular
  const x = (lon + 180) / 360 * W;
  const y = (90 - lat) / 180 * H;
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Find the places named in a block of text, in order of first appearance.
 * @returns [{ key, name, lon, lat }]
 */
function placesInText(text) {
  const lower = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9.\s]/g, ' ') + ' ';
  const hits = [];
  const seen = new Set();
  // multi-word keys first (north korea, saudi arabia, ...)
  const keys = Object.keys(PLACES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const idx = lower.indexOf(' ' + k + ' ');
    if (idx >= 0 && !seen.has(PLACES[k].name)) { hits.push({ key: k, at: idx, ...PLACES[k] }); seen.add(PLACES[k].name); }
  }
  for (const a of Object.keys(ALIASES)) {
    const idx = lower.indexOf(' ' + a + ' ');
    const k = ALIASES[a];
    if (idx >= 0 && PLACES[k] && !seen.has(PLACES[k].name)) { hits.push({ key: k, at: idx, ...PLACES[k] }); seen.add(PLACES[k].name); }
  }
  hits.sort((p, q) => p.at - q.at);
  return hits.map(({ key, name, lon, lat }) => ({ key, name, lon, lat }));
}

module.exports = { PLACES, project, placesInText };

if (require.main === module) {
  const t = process.argv.slice(2).join(' ') || 'Trump weighs an Israel strike on Iran near the Strait of Hormuz';
  const places = placesInText(t);
  console.log('places:', places.map((p) => p.name).join(' → '));
  for (const p of places) console.log('  ', p.name, project(p.lon, p.lat, 1080, 1080));
}
