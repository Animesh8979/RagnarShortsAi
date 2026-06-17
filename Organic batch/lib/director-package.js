'use strict';

const fs = require('fs');
const path = require('path');
const { geminiGenerate } = require('./gemini-call');

/**
 * Task 2: Director Package Generator
 * Generates 22-field Director Package.
 */

async function generatePackage({ concept, warRoomResult, topic, lane }) {
  const prompt = `You are an elite Football Media Director.
Create a Director Package for the following concept.
Return JSON ONLY containing all 22 fields.

Concept Info:
${typeof concept === 'string' ? concept : JSON.stringify(concept)}
War Room Result (Context):
${JSON.stringify(warRoomResult)}

Requirements:
1. PREMIER LEAGUE EXPANSION TEST: Your narrative MUST find an angle to pull Premier League, Serie A, or Bundesliga fans into the discussion to widen the engagement loop beyond Real Madrid/Barcelona tribalism.
2. MEMORABLE MOMENT ENGINE (VeoPlan): REJECT silhouettes, empty stadiums, dramatic lighting, slow pushes. REQUIRE action, consequence, tension, symbolism, and unique visual events in 'shotBrief'. A silhouette is a mood. Action is a memory.
3. VEO PROMPT DIRECTOR V3: 
   - PROMPT STRUCTURE: SUBJECT (Who), ACTION (What they do), CONSEQUENCE (What happens), CAMERA (How it's filmed), STYLE (Feel).
   - FORBIDDEN: Story summaries, explanations, analysis, football opinions, historical context, tactics, predictions, multi-step plots.
   - FORBIDDEN WORDS: 'aggressively tackles', 'destroys', 'injures', 'breaks', 'attacks', 'career-ending', 'violence'.
   - FORBIDDEN BEHAVIOR: Never force Veo to tell the whole story. Generate exactly one action, one emotion, one visual moment per prompt.
4. TEXT REDUCTION RULE: Your 'headline' in escalationPlan must be 1-3 words maximum. Text must not explain; it must emphasize, punctuate, reveal, or escalate. The visuals tell the story.
5. VISUAL ESCALATION: Field 10 (escalationPlan) must have increasing 'escalationLevel' (1-10) as stakes rise. Level 10 means maximum visual/kinetic emphasis.
6. VISUAL CATEGORY ENFORCEMENT: Every beat in escalationPlan must include a 'category'. Allowed: PRESSURE, ACTION, CONFLICT, CONSEQUENCE, REACTION, PREDICTION, MEDIA, CELEBRATION, FAILURE, ISOLATION, TRIUMPH, BETRAYAL. NO adjacent beats may share the same category.
7. SCRIPT SPECIFICITY GATE: Your script must sound uniquely tailored to the specific player, event, or context. Reject generic drama language. Reject 'THE FAVORITE', 'THE LIE', 'THE THREAT' unless strictly grounded in specific context. If the script could simultaneously work for Messi, Ronaldo, Mbappe, and Yamal, it is generic and must be rewritten.
8. Field 12 (followUpVideos): Exactly 3 items, each an object { title, arcType }.

The 22 fields required in the JSON response:
1. concept (string)
2. narrative (string)
3. opportunityGap (string)
4. competitiveAdv (string)
5. hook (string)
6. hookMechanism (string)
7. storyStructure (string)
8. scenePlan (array of 6 objects: {beat, subject, action, environment, cameraIntent, motionIntent, emotionIntent})
9. retentionPlan (string)
10. escalationPlan (array of 6 objects: {beat, escalationLevel(1-10), emotionShift, retentionTrigger, cameraMove, cutType, voiceover, headline})
11. commentStrategy (string)
12. followUpVideos (array of 3 objects: {title, arcType})
13. veoPlan (array of objects per-gen: {beat, shotBrief, emotionalPurpose, roiJustification})
14. omniPlan (string)
15. remotionPlan (string)
16. editingPlan (string)
17. colorGradingPlan (string)
18. motionDesignPlan (string)
19. audioPlan (string)
20. thumbnailStrategy (string)
21. risks (string)
22. confidenceScore (number 0-100)

Return JSON ONLY. No markdown wrapping.`;

  let res;
  let attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      res = await geminiGenerate({ text: prompt, json: true });
      if (res && res.ok) break;
      console.warn(`[director-pkg] API attempt ${attempt}/${attempts} failed: ${res ? res.reason : 'unknown'}`);
    } catch (err) {
      console.warn(`[director-pkg] API attempt ${attempt}/${attempts} error: ${err.message}`);
    }
    if (attempt < attempts) {
      console.log(`[director-pkg] Waiting 5s before retry...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  if (!res || !res.ok) {
    throw new Error('Gemini failed to generate director package after ' + attempts + ' attempts: ' + (res ? res.reason : 'unknown'));
  }

  let pkg;
  try {
    let raw = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
    const startIdx = raw.indexOf('{');
    const endIdx = raw.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      raw = raw.substring(startIdx, endIdx + 1);
    }
    pkg = JSON.parse(raw);
  } catch (e) {
    throw new Error('Failed to parse Director Package JSON: ' + e.message + ' | ' + res.text);
  }

  // Hook validation rule
  if (pkg.hook && (pkg.hook.toLowerCase().startsWith('here is') || pkg.hook.toLowerCase().includes('what happened'))) {
      throw new Error('Hook validation failed: Hook sounds like reporting facts rather than tension.');
  }

  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const slug = (typeof concept === 'string' ? concept : (pkg.concept || 'video')).replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 20);
  const outPath = path.join(__dirname, '..', 'renders', 'packages');
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(outPath, { recursive: true });
  }

  const fileOut = path.join(outPath, `${date}-${slug}.json`);
  fs.writeFileSync(fileOut, JSON.stringify(pkg, null, 2));

  return pkg;
}

module.exports = { generatePackage };

if (require.main === module) {
  require('./env-d-drive-only');
  generatePackage({ concept: "The Wrong Man Won", warRoomResult: {}, topic: "Ballon d'Or", lane: "organic" })
    .then(p => console.log('Package generated with score:', p.confidenceScore))
    .catch(console.error);
}
