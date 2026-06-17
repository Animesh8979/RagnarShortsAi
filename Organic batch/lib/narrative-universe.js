'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Task 3: Narrative Universe Tracker
 */

const UNIVERSE_FILE = path.join(__dirname, '..', 'renders', 'narrative-universe.json');

function getUniverse() {
  if (fs.existsSync(UNIVERSE_FILE)) {
    return JSON.parse(fs.readFileSync(UNIVERSE_FILE, 'utf8'));
  }
  return [];
}

function saveUniverse(data) {
  fs.writeFileSync(UNIVERSE_FILE, JSON.stringify(data, null, 2));
}

function logToUniverse(entry) {
  const universe = getUniverse();
  universe.push(entry);
  saveUniverse(universe);
}

function suggestNext() {
  const universe = getUniverse();
  const now = new Date();
  
  const suggestions = [];

  // Group by arcType
  const arcs = {};
  for (const entry of universe) {
    if (!arcs[entry.arcType]) arcs[entry.arcType] = [];
    arcs[entry.arcType].push(entry);
  }

  // Iterate over arcs
  for (const [arcType, entries] of Object.entries(arcs)) {
    // Sort by publishedAt descending
    entries.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const latest = entries[0];
    const daysSince = (now - new Date(latest.publishedAt)) / (1000 * 60 * 60 * 24);

    if (daysSince >= 5 && latest.followUpVideos && latest.followUpVideos.length > 0) {
      suggestions.push({
        arcType,
        concept: latest.followUpVideos[0].title || latest.followUpVideos[0],
        arcPhase: latest.followUpVideos[0].arcPhase || 'follow-up',
        reason: `Follow-up to ${latest.title} published ${Math.round(daysSince)} days ago`
      });
    }
  }

  // Add default opportunity arcs if we don't have enough suggestions
  if (suggestions.length < 3) {
    suggestions.push({ arcType: 'world_cup', concept: "A rising star's path to the 2026 World Cup", arcPhase: 'opportunity', reason: 'Opportunity window' });
    suggestions.push({ arcType: 'rivalry', concept: "The hidden truth behind football's biggest current rivalry", arcPhase: 'opportunity', reason: 'Opportunity window' });
    suggestions.push({ arcType: 'ballon_dor', concept: "Why the current favorite won't win the Ballon d'Or", arcPhase: 'opportunity', reason: 'Opportunity window' });
  }

  return suggestions.slice(0, 3);
}

module.exports = { logToUniverse, suggestNext, getUniverse };

if (require.main === module) {
  if (process.argv.includes('--log')) {
    logToUniverse({
      videoId: 'test-1',
      title: 'The Wrong Man Won',
      arcType: 'ballon_dor',
      arcPhase: 'accusation',
      publishedAt: new Date().toISOString().split('T')[0],
      followUpVideos: [
        { title: 'He Is Coming Back For It', arcPhase: 'follow-up', readyAfter: '2026-06-18' }
      ]
    });
    console.log('Logged test entry to universe.');
  } else if (process.argv.includes('--suggest')) {
    console.log('Suggestions:', suggestNext());
  }
}
