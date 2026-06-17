'use strict';
const { geminiGenerate } = require('./gemini-call');

async function runSelfDoubtEngine(winningCandidateObj) {
  console.log(`[Self-Doubt Engine] Challenging the Tournament Winner: ${winningCandidateObj.candidate.angleType}...`);

  const prompt = `You are the Self-Doubt Engine for an elite Football Media System.
Your job is to relentlessly question the decision to select this candidate as the winner.
"What if the Critic is wrong?"

Winner Data:
${JSON.stringify(winningCandidateObj, null, 2)}

Generate a brutal, objective Uncertainty Report.
List reasons why the Critic may be mistaken (e.g., small sample bias, overvaluing novelty, underestimating emotional impact of the alternative, over-penalizing simplicity).

Output JSON Schema:
{
  "uncertaintyReport": {
    "isCriticWrongProbability": number, // 0.0 to 1.0
    "reasonsCriticMightBeMistaken": ["string"],
    "blindSpots": ["string"],
    "finalWarning": "string"
  }
}

Return JSON ONLY. No markdown wrapping.`;

  const res = await geminiGenerate({ text: prompt, json: true });
  if (!res.ok) {
      console.warn('[!] Self-Doubt Engine failed:', res.reason);
      return { 
          isCriticWrongProbability: 0.5, 
          reasonsCriticMightBeMistaken: ["API Failed - could not generate self-doubt."], 
          blindSpots: ["Unknown blindspots due to API failure."], 
          finalWarning: "Proceed with caution." 
      };
  }

  try {
    let raw = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[!] Self-Doubt Engine JSON parsing failed:', e.message);
    return { isCriticWrongProbability: 0.5, reasonsCriticMightBeMistaken: ["Parse failed"], blindSpots: [], finalWarning: "" };
  }
}

module.exports = { runSelfDoubtEngine };
