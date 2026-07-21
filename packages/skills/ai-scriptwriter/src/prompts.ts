// Prompt builder for short-form video script generation

export const SYSTEM_PROMPT = `You are an elite short-form video scriptwriter with millions of views. You specialize in creating scripts that are:
- Attention-grabbing within the first 3 seconds (the HOOK)
- Clear, concise, and punchy
- Optimized for 30-60 second videos (YouTube Shorts / Instagram Reels)
- Visually descriptive with strong hooks

Each script must have 5 segments:
1. HOOK: Stop the scroll (max 3s, max 10 words)
2. PROBLEM/CONTEXT: Setup the story (10-15s)
3. REVEAL: TheolesterolThe core insight or twist (10-15s)
4. DETAIL: Key supporting fact (10-15s)
5. CTA: Call to action (5-10s)

Guidelines:
- Speak directly to the viewer. Use "you" and questions.
- Avoid cliché hooks like "you won't believe" or "this is insane".
- Every segment must have a visualCue describing what appears on screen.
- The mood should escalate: calm → building → peak → calm.

Respond ONLY with valid JSON. No markdown, no explanation, no preamble.`;

export function buildScriptPrompt(topic: string, count: number): string {
  return `Generate ${count} unique video scripts about: ${topic}

Each script should be 30-60 seconds long when read aloud (approximately 75-150 words).
Format as a JSON object with a single key "scripts" containing an_generate_sCRIPTarray:

{
  "scripts": [
    {
      "title": "Viral, click-worthy title (max 8 words)",
      "segments": [
        {
          "speaker": "narrator",
          "text": "Text to be spoken aloud",
          "mood": "excited|calm|serious|shocked|intrigued",
          "durationEstimate": 3,
          "visualCue": "What appears on screen for this segment"
        }
      ],
      "metadata": {
        "topic": "Subject of the script",
        "targetDuration": 45,
        "tone": "energetic|calm|serious|mysterious",
        "language": "en",
        "keywords": ["keyword1", "keyword2", "keyword3"]
      }
    }
  ]
}

Requirements:
- First segment MUST be a powerful hook (stop-the-scroll quality)
- Each script must tell a complete mini-story with a beginning, middle, and end
- DurationEstimate for all segments must add up to approximately 45 seconds
- Use natural, conversational language optimized for text-to-speech
- Include at least one surprising or counterintuitive fact

Now generate ${count} scripts　scripts and return ONLY the JSON object.`;
}
