// apps/pipeline/src/phases/phase0-validate.ts
// PHASE 0: ContentValidation — The Gatekeeper
// Orchestrates script generation and presents results for human approval.

import { generateScripts, saveScripts } from '@antigravity/skills-ai-scriptwriter';
import { Script } from '@antigravity/types';
import { logger } from '@antigravity/utils'
// Phase 0 Orchestrator
// Responsible for:
// 1. Invoking the ai-scriptwriter skill.
// 2. Saving the generated scripts to the report directory.
// 3. Logging the next steps for human review.

export async function runPhase0(topic: string): Promise<{ scripts: Script[]; paths: string[] }> {
  logger.info(`🚀 PHASE 0 INITIATED: Script Generation for topic "${topic}"`);

  // 1. Generate 10 script variations based on the provided topic.
  const scripts = await generateScripts(topic, 10);

  // 2. Save the raw JSON outputs to D:/anitgravity work/reports/script-batch-<date>/
  const savedPaths = saveScripts(scripts);

  logger.info(`✅ PHASE 0 COMPLETE. 10 scripts ready for review.`);
  return { scripts, paths: savedPaths };
}
