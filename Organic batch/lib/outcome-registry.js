'use strict';
const fs = require('fs');
const path = require('path');

const REGISTRY_FILE = path.join(__dirname, '..', 'scratch', 'outcome-registry.json');
const BIAS_REPORT_FILE = path.join(__dirname, '..', 'scratch', 'bias-report.json');

// Phase 1: Outcome Registry
function loadRegistry() {
  if (fs.existsSync(REGISTRY_FILE)) {
    try { return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); } 
    catch (e) { return []; }
  }
  return [];
}

function saveRegistry(data) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}

// Store a generation prediction before the video is published
function logPrediction(candidateObj, tournamentResult) {
  const registry = loadRegistry();
  
  const entry = {
    id: `vid_${Date.now()}_${Math.floor(Math.random()*1000)}`,
    timestamp: new Date().toISOString(),
    topic: candidateObj.candidate.angleType, // Or the actual topic if passed
    hookType: candidateObj.candidate.escalationPlan ? "Standard" : "Unknown",
    judgeScore: candidateObj.adjustedJudgeScore || 0,
    agreementIndex: candidateObj.verdict ? candidateObj.verdict.agreementIndex : 0,
    uncertaintyScore: candidateObj.verdict && candidateObj.verdict.uncertaintyLevel === 'High' ? 1.0 : 0.5,
    predictedRetention: 0.65, // Base expectation
    actualRetention: null,
    completionRate: null,
    watchTime: null,
    calibrationError: null,
    isChallenger: !!candidateObj.isChallenger
  };
  
  registry.push(entry);
  saveRegistry(registry);
  return entry.id;
}

// Phase 2 & 3: Real Outcome Collection & Prediction Tracking
function ingestRealOutcome(videoId, actualMetrics) {
  const registry = loadRegistry();
  const entry = registry.find(e => e.id === videoId);
  
  if (entry) {
    entry.actualRetention = actualMetrics.retention || 0;
    entry.completionRate = actualMetrics.completionRate || 0;
    entry.watchTime = actualMetrics.watchTime || 0;
    
    // Phase 4: Confidence Calibration
    // Error = absolute difference between predicted and actual retention
    entry.calibrationError = Math.abs(entry.predictedRetention - (entry.actualRetention / 100));
    
    saveRegistry(registry);
    analyzeBiases(registry);
  }
}

// Phase 5: Bias Discovery
function analyzeBiases(registry) {
  const completed = registry.filter(e => e.actualRetention !== null);
  if (completed.length < 5) return; // Need sample size

  let overvaluedNovelty = 0;
  let totalCalError = 0;

  completed.forEach(c => {
    totalCalError += c.calibrationError || 0;
    // Example heuristic: if judge score > 90 but actual retention < 40%, we are heavily biased.
    if (c.judgeScore > 90 && c.actualRetention < 40) {
       overvaluedNovelty++;
    }
  });

  const report = {
    historicalAccuracy: 1.0 - (totalCalError / completed.length),
    biasFlags: []
  };

  if (overvaluedNovelty > completed.length * 0.3) {
    report.biasFlags.push("Overvaluing Novelty/Complexity");
  }

  fs.writeFileSync(BIAS_REPORT_FILE, JSON.stringify(report, null, 2));
}

// Phase 6: Adaptive Scoring (Reads bias report to adjust weights)
function getAdaptiveWeights() {
  let weights = { hook: 1.0, emotion: 1.0, novelty: 1.0, clarity: 1.0 };
  if (fs.existsSync(BIAS_REPORT_FILE)) {
    const report = JSON.parse(fs.readFileSync(BIAS_REPORT_FILE, 'utf8'));
    if (report.biasFlags.includes("Overvaluing Novelty/Complexity")) {
      weights.novelty = 0.5; // Penalize novelty dynamically
      weights.emotion = 1.5; // Boost emotion dynamically
    }
  }
  return weights;
}

module.exports = { logPrediction, ingestRealOutcome, getAdaptiveWeights };
