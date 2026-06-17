'use strict';
const { geminiGenerate } = require('./gemini-call');

async function runCandidateTournament(candidatesWithJudgments) {
  console.log('[Candidate Selector] Running Adversarial Tournament (Round-Robin)...');
  
  if (!candidatesWithJudgments || candidatesWithJudgments.length === 0) {
    throw new Error('No candidates provided to tournament.');
  }

  // Pre-filter: apply novelty penalties if any
  candidatesWithJudgments.forEach(item => {
      let score = item.verdict.finalScore || 0;
      if (item.noveltyPenalty) {
          console.log(`[Penalty] Applied -${item.noveltyPenalty} to ${item.candidate.angleType} for repetition.`);
          score -= item.noveltyPenalty;
      }
      item.adjustedJudgeScore = score;
  });

  // Construct tournament payload
  const tournamentPayload = candidatesWithJudgments.map((c, i) => ({
      id: `Candidate_${i+1}`,
      angle: c.candidate.angleType,
      judgeScore: c.adjustedJudgeScore,
      defenseHighlights: c.defense.overallDefenseScore,
      prosecutorVulnerability: c.prosecutor.overallProsecutorScore,
      hook: c.candidate.escalationPlan ? c.candidate.escalationPlan[0] : "N/A"
  }));

  const prompt = `You are the Tournament Director for an elite Football Media System.
You have ${tournamentPayload.length} narrative candidates.
You must conduct a mental round-robin tournament (A vs B, A vs C, etc.).
Compare their angles, judge scores, and hooks. 

Candidates:
${JSON.stringify(tournamentPayload, null, 2)}

Calculate wins and losses for each candidate.
Return JSON ONLY. No markdown wrapping.

Output JSON Schema:
{
  "matchups": [
    { "match": "Candidate_1 vs Candidate_2", "winner": "Candidate_X", "reason": "string" }
  ],
  "standings": [
    { "id": "Candidate_X", "angle": "string", "wins": number, "losses": number }
  ],
  "overallWinnerId": "Candidate_X"
}`;

  console.log('[Tournament Engine] Simulating matchups...');
  const res = await geminiGenerate({ text: prompt, json: true });
  if (!res.ok) {
      console.warn('[!] Tournament LLM failed, falling back to math-based selection. Reason:', res.reason);
      return mathFallbackSelection(candidatesWithJudgments);
  }

  try {
    let raw = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const tournamentResult = JSON.parse(raw);
    
    console.log(`[Tournament] Winner declared: ${tournamentResult.overallWinnerId}`);
    
    // Find the winning object
    const winnerIndex = parseInt(tournamentResult.overallWinnerId.replace('Candidate_', '')) - 1;
    // PHASE 7: CHAMPION-CHALLENGER VALIDATION
    // 15% chance to promote a random lower-ranked candidate to test Judge accuracy.
    if (Math.random() < 0.15 && candidatesWithJudgments.length > 1) {
        console.log('[Champion-Challenger] Promoting a random candidate to validate Judge accuracy.');
        let randomIndex = Math.floor(Math.random() * candidatesWithJudgments.length);
        while (randomIndex === winnerIndex && candidatesWithJudgments.length > 1) {
            randomIndex = Math.floor(Math.random() * candidatesWithJudgments.length);
        }
        const challenger = candidatesWithJudgments[randomIndex];
        challenger.tournamentResult = tournamentResult;
        challenger.isChallenger = true; // Mark it for outcome registry
        return challenger;
    }

    if (winnerIndex >= 0 && winnerIndex < candidatesWithJudgments.length) {
        const winner = candidatesWithJudgments[winnerIndex];
        winner.tournamentResult = tournamentResult;
        winner.isChallenger = false;
        return winner;
    }
    
    return mathFallbackSelection(candidatesWithJudgments);
  } catch (e) {
    console.warn('[!] Tournament JSON parsing failed:', e.message);
    return mathFallbackSelection(candidatesWithJudgments);
  }
}

function mathFallbackSelection(candidatesWithJudgments) {
  let bestScore = -999;
  let best = null;
  candidatesWithJudgments.forEach(item => {
    if (item.adjustedJudgeScore > bestScore) {
        bestScore = item.adjustedJudgeScore;
        best = item;
    }
  });
  return best;
}

module.exports = { runCandidateTournament };
