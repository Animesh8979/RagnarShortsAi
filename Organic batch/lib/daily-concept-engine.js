'use strict';

require('./env-d-drive-only');
const { suggestNext } = require('./narrative-universe');
const { runWarRoom } = require('./concept-war-room');
const { generatePackage } = require('./director-package');
const { allocate } = require('./veo-budget');

/**
 * Task 6: Daily Production Chain Integration - Concept Engine
 * Runs before fresh-batch
 */

async function runDailyConceptEngine() {
  console.log('[concept-engine] Suggesting 3 narrative follow-ups...');
  const suggestions = suggestNext();
  if (suggestions.length === 0) {
    console.log('[concept-engine] No suggestions found. Generating default concepts...');
    suggestions.push({ concept: "A rising star's path to the 2026 World Cup" });
  }

  const conceptsToScore = suggestions.map(s => s.concept);
  console.log(`[war-room] Running war room on ${conceptsToScore.length} concepts...`);
  
  const warRoomResults = await runWarRoom(conceptsToScore);
  const approved = warRoomResults.filter(r => r.verdict === 'approve');
  
  console.log(`[war-room] Scored ${conceptsToScore.length} concepts: ${approved.length} approved, ${conceptsToScore.length - approved.length} rejected or need review.`);

  const packages = [];
  for (const survivor of approved) {
    console.log(`[director-pkg] Generating package for "${survivor.concept}"...`);
    const pkg = await generatePackage({ concept: survivor.concept, warRoomResult: survivor });
    console.log(`[director-pkg] Generated package for "${pkg.concept || survivor.concept}" (confidence=${pkg.confidenceScore})`);
    
    const budgetRes = allocate(pkg);
    console.log(`[veo-budget] Allocated ${budgetRes.allocated} gens (balance: ${budgetRes.balance}/95 remaining)`);
    
    packages.push(pkg);
  }

  return packages;
}

module.exports = { runDailyConceptEngine };

if (require.main === module) {
  runDailyConceptEngine().catch(console.error);
}
