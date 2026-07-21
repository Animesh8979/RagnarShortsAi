import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { logger } from "@antigravity/utils";

interface ThoughtStep {
  thought: string;
  conclusion: string;
  confidence: number;
}

export class CoreThinking {
  private transport!: StdioClientTransport;
  private client!: Client;

  async init() {
    this.transport = new StdioClientTransport({
      command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    });
    this.client = new Client({ name: "core-thinking", version: "1.0.0" }, { capabilities: {} });
    await this.client.connect(this.transport);
    logger.info("core-thinking MCP connected");
  }

  async decompose(problem: string): Promise<ThoughtStep[]> {
    const steps: ThoughtStep[] = [];
    let current = problem;
    for (let i = 0; i < 5; i++) {
      const res = await this.client.callTool({ name: "sequential-thinking", arguments: { thought: current, step: i + 1 } });
      const content = String(res.content || "");
      const conclusionMatch = content.match(/Conclusion:\s*(.+)/i);
      const confidenceMatch = content.match(/Confidence:\s*(\d+)%/i);
      steps.push({
        thought: content.substring(0, 500),
        conclusion: conclusionMatch?.[1] || "",
        confidence: Number(confidenceMatch?.[1] || 70)
      });
      if (confidenceMatch && Number(confidenceMatch[1]) > 90) break;
      current = `Based on: ${conclusionMatch?.[1] || content}, continue solving: ${problem}`;
    }
    return steps;
  }

  async reason(problem: string): Promise<string> {
    const steps = await this.decompose(problem);
    return steps.map((s, i) => `Step ${i + 1}: ${s.thought}\nConclusion: ${s.conclusion} (${s.confidence}%)`).join("\n\n");
  }

  async close() {
    await this.transport?.close();
  }
}
