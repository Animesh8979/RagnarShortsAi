'use strict';

require('./env-d-drive-only');
const { geminiGenerate } = require('./gemini-call');

/**
 * Task 1: Concept War Room Scoring Engine
 * Scores concepts across 8 dimensions.
 * Dimensions: narrativeStrength, curiosity, emotionalImpact, commentPotential, predictionPotential, followUpPotential, subscriptionPotential, shareability.
 * 
 * Score < 65: AUTO-REJECT
 * Score 65-74: REVIEW REQUIRED
 * Score 75+: AUTO-APPROVE
 */

async function scoreConcept(concept) {
  const prompt = `You are the Supreme Council Concept War Room for a Football Media Empire.
Score the following concept on 8 dimensions from 0 to 10.
Be extremely critical. Most concepts are garbage.

Concept Details:
${typeof concept === 'string' ? concept : JSON.stringify(concept, null, 2)}

The 8 Scoring Dimensions (0-10):
1. narrativeStrength (Kill < 6): Does this belong to a defined arc? Is there a through-line?
2. curiosity (Kill < 7): Does the hook create an unanswered question the viewer must resolve?
3. emotionalImpact (Kill < 6): Does this trigger pride, outrage, hope, or fear?
4. commentPotential (Kill < 7): Who disagrees? Who defends their club/player? Can nobody stay silent? (Comment Magnet Test: If < 3 of 6 fanbases would argue, score < 7).
5. predictionPotential (Kill < 5): Does this make a falsifiable claim that creates suspense?
6. followUpPotential (Kill < 6): Do 3 follow-up videos emerge naturally from this concept?
7. subscriptionPotential (Kill < 6): Why does a viewer NEED future videos after watching this? (Subscribe Test: If "no reason", score < 6. If "to see prediction play out", score >= 8).
8. shareability (Kill < 5): Would a fan share this to win an argument or prove a point?

Return JSON ONLY:
{
  "scores": {
    "narrativeStrength": number,
    "curiosity": number,
    "emotionalImpact": number,
    "commentPotential": number,
    "predictionPotential": number,
    "followUpPotential": number,
    "subscriptionPotential": number,
    "shareability": number
  },
  "killReasons": ["reason 1 if any dimension below kill threshold", ...],
  "followUpVideos": ["title 1", "title 2", "title 3"]
}`;

  const res = await geminiGenerate({ text: prompt, json: true });
  if (!res.ok) {
    throw new Error('Gemini failed: ' + res.reason);
  }

  let parsed;
  try {
    let raw = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const startIdx = raw.indexOf('{');
    const endIdx = raw.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      raw = raw.substring(startIdx, endIdx + 1);
    }
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('Failed to parse Gemini response: ' + e.message + ' | ' + res.text);
  }

  const scores = parsed.scores || {};
  const commentP = scores.commentPotential || 0;
  const followUpP = scores.followUpPotential || 0;
  
  // Total score = weighted average (commentPotential × 1.4, followUpPotential × 1.3, others × 1.0)
  const weightTotal = 1.4 + 1.3 + 6.0;
  let rawTotal = 
    (commentP * 1.4) + 
    (followUpP * 1.3) + 
    (scores.narrativeStrength || 0) + 
    (scores.curiosity || 0) + 
    (scores.emotionalImpact || 0) + 
    (scores.predictionPotential || 0) + 
    (scores.subscriptionPotential || 0) + 
    (scores.shareability || 0);

  const totalScore = Math.round((rawTotal / weightTotal) * 10);

  let verdict = 'reject';
  if (totalScore >= 75 && (!parsed.killReasons || parsed.killReasons.length === 0)) {
    verdict = 'approve';
  } else if (totalScore >= 65 && totalScore < 75 && (!parsed.killReasons || parsed.killReasons.length === 0)) {
    verdict = 'review';
  }

  // Force reject if any dimension is below kill threshold
  if (scores.narrativeStrength < 6 ||
      scores.curiosity < 7 ||
      scores.emotionalImpact < 6 ||
      scores.commentPotential < 7 ||
      scores.predictionPotential < 5 ||
      scores.followUpPotential < 6 ||
      scores.subscriptionPotential < 6 ||
      scores.shareability < 5) {
      verdict = 'reject';
      if (!parsed.killReasons) parsed.killReasons = [];
      parsed.killReasons.push("One or more dimensions failed the kill threshold.");
  }

  return {
    scores,
    totalScore,
    verdict,
    killReasons: parsed.killReasons || [],
    followUpVideos: parsed.followUpVideos || []
  };
}

async function runWarRoom(concepts) {
  const results = [];
  for (const c of concepts) {
    try {
      const res = await scoreConcept(c);
      results.push({ concept: c, ...res });
    } catch (e) {
      console.error('War room failed for concept:', c, e.message);
    }
  }
  // Return ranked survivors (approve or review)
  return results.filter(r => r.verdict !== 'reject').sort((a, b) => b.totalScore - a.totalScore);
}

module.exports = { scoreConcept, runWarRoom };

if (require.main === module) {
  const arg = process.argv[2] || "The Ballon d'Or was stolen";
  scoreConcept(arg).then(console.log).catch(console.error);
}
