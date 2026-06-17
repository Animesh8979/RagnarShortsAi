'use strict';
const fs = require('fs');
const path = require('path');

const MEMORY_FILE = path.join(__dirname, '..', 'scratch', 'pattern-memory.json');

function loadMemory() {
  if (fs.existsSync(MEMORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveMemory(memory) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

function calculateJaccardSimilarity(str1, str2) {
  const words1 = new Set(str1.toLowerCase().split(/\\W+/).filter(Boolean));
  const words2 = new Set(str2.toLowerCase().split(/\\W+/).filter(Boolean));
  if (words1.size === 0 && words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Compares the candidate's angleType and first hook beat against historical outputs.
 * Returns { uniquenessScore: number (0-100), noveltyPenalty: number, evidence: string }
 */
function calculateNoveltyPenalty(candidate) {
  const memory = loadMemory();
  if (memory.length === 0) {
    return { uniquenessScore: 100, noveltyPenalty: 0, evidence: "First candidate generated; no historical patterns to match." };
  }

  // Extract core fingerprint from candidate
  let hookFingerprint = candidate.angleType + " ";
  if (candidate.escalationPlan && candidate.escalationPlan[0]) {
      hookFingerprint += JSON.stringify(candidate.escalationPlan[0].narrativeState || {});
  }

  let maxSimilarity = 0;
  for (const past of memory) {
    const sim = calculateJaccardSimilarity(hookFingerprint, past.fingerprint);
    if (sim > maxSimilarity) maxSimilarity = sim;
  }

  // maxSimilarity is 0.0 to 1.0. 
  // Uniqueness = 100 - (similarity * 100)
  const uniquenessScore = Math.max(0, Math.floor(100 - (maxSimilarity * 100)));
  
  let noveltyPenalty = 0;
  let evidence = `Candidate uniqueness compared to history is ${uniquenessScore}%.`;
  
  if (uniquenessScore < 50) {
    noveltyPenalty = 15; // Hard penalty for repeating content
    evidence += " High repetition detected. Narrative structures are too similar to past videos.";
  } else if (uniquenessScore < 70) {
    noveltyPenalty = 5;
    evidence += " Moderate repetition detected.";
  } else {
    evidence += " Candidate is highly novel compared to historical timeline.";
  }

  return { uniquenessScore, noveltyPenalty, evidence };
}

function memorizeWinner(candidate) {
  const memory = loadMemory();
  let hookFingerprint = candidate.angleType + " ";
  if (candidate.escalationPlan && candidate.escalationPlan[0]) {
      hookFingerprint += JSON.stringify(candidate.escalationPlan[0].narrativeState || {});
  }
  
  memory.push({
    timestamp: new Date().toISOString(),
    angleType: candidate.angleType,
    fingerprint: hookFingerprint
  });

  // Keep last 50 only
  if (memory.length > 50) memory.shift();
  
  saveMemory(memory);
}

module.exports = { calculateNoveltyPenalty, memorizeWinner };
