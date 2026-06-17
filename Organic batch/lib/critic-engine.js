'use strict';
const { geminiGenerate } = require('./gemini-call');

async function runDefenseCritic(candidate) {
  const prompt = `You are the Defense Critic for an elite Football Media System.
Your job is to objectively evaluate the strengths of the following Director Package candidate.
Return JSON ONLY. No markdown wrapping.

Candidate Package to Evaluate:
${JSON.stringify(candidate)}

Evaluate based on these 6 criteria (Score 1-10). For EACH score, provide evidence, reasoning, and confidence (0.0 to 1.0):
1. Hook Strength
2. Escalation Quality
3. Emotional Impact
4. Narrative Clarity
5. Payoff Strength
6. Novelty

Output JSON Schema:
{
  "scores": {
    "hookStrength": { "score": number, "evidence": "string", "reasoning": "string", "confidence": number },
    "escalationQuality": { "score": number, "evidence": "string", "reasoning": "string", "confidence": number },
    "emotionalImpact": { "score": number, "evidence": "string", "reasoning": "string", "confidence": number },
    "narrativeClarity": { "score": number, "evidence": "string", "reasoning": "string", "confidence": number },
    "payoffStrength": { "score": number, "evidence": "string", "reasoning": "string", "confidence": number },
    "novelty": { "score": number, "evidence": "string", "reasoning": "string", "confidence": number }
  },
  "overallDefenseScore": number
}`;

  console.log(`[Defense Critic] Evaluating angle: ${candidate.angleType || 'Unknown'}...`);
  const res = await geminiGenerate({ text: prompt, json: true });
  if (!res.ok) throw new Error('Defense Critic failed: ' + res.reason);

  try {
    let raw = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Failed to parse Defense JSON: ' + e.message);
  }
}

async function runProsecutorCritic(candidate) {
  const prompt = `You are the Prosecutor Critic for an elite Football Media System.
Your job is to relentlessly attack the following Director Package candidate and find its flaws.
Assume the candidate is weak. Find narrative holes, predictable repetition, emotional flatness, and weak hooks.
Return JSON ONLY. No markdown wrapping.

Candidate Package to Evaluate:
${JSON.stringify(candidate)}

Output a Retention Risk Report mapping the probability of viewer drop-off. For EACH risk, provide level, evidence, reasoning, and confidence (0.0 to 1.0):

Output JSON Schema:
{
  "retentionRisk": {
    "hookFailureRisk": { "level": "Low" | "Medium" | "High", "evidence": "string", "reasoning": "string", "confidence": number },
    "midVideoDropRisk": { "level": "Low" | "Medium" | "High", "evidence": "string", "reasoning": "string", "confidence": number },
    "endingFailureRisk": { "level": "Low" | "Medium" | "High", "evidence": "string", "reasoning": "string", "confidence": number }
  },
  "flawsDetected": ["string"],
  "overallProsecutorScore": number // How vulnerable is this video? 100 = completely flawed, 0 = bulletproof.
}`;

  console.log(`[Prosecutor Critic] Attacking angle: ${candidate.angleType || 'Unknown'}...`);
  const res = await geminiGenerate({ text: prompt, json: true });
  if (!res.ok) throw new Error('Prosecutor Critic failed: ' + res.reason);

  try {
    let raw = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Failed to parse Prosecutor JSON: ' + e.message);
  }
}

async function runJudgeCritic(candidate, defense, prosecutor) {
  const prompt = `You are the Final Judge for an elite Football Media System.
Review the candidate alongside the Defense and Prosecutor arguments.
Return JSON ONLY. No markdown wrapping.

Candidate Package:
${JSON.stringify(candidate)}

Defense Argument:
${JSON.stringify(defense)}

Prosecutor Argument:
${JSON.stringify(prosecutor)}

Task:
Calculate a final score (1-100).
If Defense and Prosecutor strongly disagree, penalize the confidence.
Return the Final Output Schema:

Output JSON Schema:
{
  "finalScore": number,
  "confidence": number,
  "uncertaintyLevel": "Low" | "Medium" | "High",
  "judgeReasoning": "string",
  "retentionRisk": {
    "hookFailureRisk": { "level": "Low" | "Medium" | "High", "evidence": "string" },
    "midVideoDropRisk": { "level": "Low" | "Medium" | "High", "evidence": "string" }
  }
}`;

  console.log(`[Judge] Delivering verdict for angle: ${candidate.angleType || 'Unknown'}...`);
  const res = await geminiGenerate({ text: prompt, json: true });
  if (!res.ok) throw new Error('Judge failed: ' + res.reason);

  try {
    let raw = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const verdict = JSON.parse(raw);
    
    // Calculate Agreement Index mathematically
    const defScore = defense.overallDefenseScore || 0;
    const prosScore = 100 - (prosecutor.overallProsecutorScore || 0); // Convert vulnerability to quality score
    verdict.agreementIndex = 100 - Math.abs(defScore - prosScore);
    verdict.defenseScore = defScore;
    verdict.prosecutorScore = prosecutor.overallProsecutorScore || 0;
    
    return verdict;
  } catch (e) {
    throw new Error('Failed to parse Judge JSON: ' + e.message);
  }
}

module.exports = { runDefenseCritic, runProsecutorCritic, runJudgeCritic };
