'use strict';
const fs = require('fs');
const path = require('path');
const { geminiGenerate } = require('./gemini-call');

async function generateCandidates(topic) {
  console.log(`[Candidate Generator] Generating 5 narratives sequentially to avoid API quota errors...`);
  
  const angles = [
    "Underdog Story",
    "Betrayal Story",
    "Collapse Story",
    "Redemption Story",
    "Conspiracy Story"
  ];
  
  const packages = [];

  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i];
    const prompt = `You are an elite Football Media Director.
Your task is to generate a completely distinct Director Package for the following topic: "${topic}".

The narrative angle MUST be exactly: ${angle}

Return JSON ONLY representing a single object.

The object must contain the following 22 fields:
1. angleType (string - exactly "${angle}")
2. concept (string)
3. narrative (string)
4. opportunityGap (string)
5. hook (string) - MUST NOT start with a fact. Start with tension.
6. storyStructure (string)
7. narrativeState (object: { escalation: 1-10, curiosity: 1-10, emotion: 1-10, novelty: 1-10, credibility: 1-10, payoff: 1-10 })
8. scenePlan (array of 6 objects: {beat, subject, action, environment})
9. retentionPlan (string)
10. escalationPlan (array of 6 objects: {beat, narrativeState: {escalation, curiosity, emotion, novelty, credibility, payoff}, retentionTrigger, cameraMove, cutType, voiceover, headline (1-3 words max)})
11. commentStrategy (string)
12. followUpVideos (array of 3 objects: {title, arcType})
13. veoPlan (array of 6 objects: {beat, shotBrief, emotionalPurpose}) - REJECT silhouettes/empty stadiums. REQUIRE action, consequence, tension.
14. omniPlan (string)
15. remotionPlan (string)
16. editingPlan (string)
17. colorGradingPlan (string)
18. motionDesignPlan (string)
19. audioPlan (string)
20. thumbnailStrategy (string)
21. risks (string)
22. baselineScore (number 0-100)

Return JSON ONLY. No markdown wrapping.`;

    console.log(`  -> Generating ${angle}...`);
    const res = await geminiGenerate({ text: prompt, json: true });
    
    if (!res.ok) {
      console.warn(`[!] Gemini failed for ${angle}: ${res.reason}, skipping.`);
      continue;
    }

    try {
      let raw = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
      packages.push(JSON.parse(raw));
    } catch (e) {
      console.warn(`[!] Failed to parse Candidate JSON for ${angle}, skipping.`);
    }

    // Sleep 1.5 seconds between generations to prevent 429 errors
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  if (packages.length === 0) {
    throw new Error('All 5 candidate generations failed due to API errors.');
  }

  return packages;
}

module.exports = { generateCandidates };
