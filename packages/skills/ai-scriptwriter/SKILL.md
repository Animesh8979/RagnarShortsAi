# SKILL: ai-scriptwriter

## Purpose
Generate short-form video scripts using a local Ollama LLM.

## Usage
```typescript
import { ScriptGenerator } from '@antigravity/skills-ai-scriptwriter';

const generator = new ScriptGenerator('glm-5.2:cloud');
const scripts = await generator.generate('Historical mysteries', 10);
```

## Environment
- `OLLAMA_MODEL` — Model name (default: glm-5.2:cloud)
- `OLLAMA_BASE_URL` — Ollama server URL (default: http://localhost:11434)
- `SCRIPT_TOPIC` — Default topic for runner
- `SCRIPT_COUNT` — Number of scripts to generate

## Files
- `src/ollama.ts` — Ollama API client
- `src/prompts.ts` — Prompt builder
- `src/generator.ts` — Script generation logic
- `src/runner.ts` — CLI batch runner
