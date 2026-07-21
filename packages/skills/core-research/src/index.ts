import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { safeExec } from "@antigravity/security";
import { logger } from "@antigravity/utils";

declare const process: { env: Record<string, string | undefined> };

interface ResearchConfig {
  braveApiKey?: string;
  tavilyApiKey?: string;
  timeout?: number;
}

export class CoreResearch {
  private transport!: StdioClientTransport;
  private client!: Client;
  private braveSearch?: any;
  private tavilySearch?: any;

  async init() {
    this.transport = new StdioClientTransport({
      command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    });
    this.client = new Client({ name: "core-research", version: "1.0.0" }, { capabilities: {} });
    await this.client.connect(this.transport);
    logger.info("core-research MCP connected");
  }

  async searchBrave(query: string, count = 10): Promise<any[]> {
    await this.ensureConnected();
    const res = await safeExec("npx", ["-y", "@modelcontextprotocol/server-brave-search", "--query", query, "--count", String(count)], { env: { BRAVE_API_KEY: process.env.BRAVE_API_KEY } });
    return JSON.parse(res.stdout || "[]");
  }

  async searchTavily(query: string, count = 10): Promise<any[]> {
    await this.ensureConnected();
    const res = await safeExec("npx", ["-y", "@mdp/tavily-mcp-server"], { env: { TAVILY_API_KEY: process.env.TAVILY_API_KEY } });
    return JSON.parse(res.stdout || "[]");
  }

  async fetchPage(url: string): Promise<string> {
    try {
      const res = await fetch(url);
      return await res.text();
    } catch (err: any) {
      logger.error(`fetchPage failed for ${url}: ${err.message}`);
      return "";
    }
  }

  async thinkSequentially(problem: string): Promise<string> {
    const res = await this.client.callTool({ name: "sequential-thinking", arguments: { thought: problem } });
    return String(res.content || "");
  }

  private async ensureConnected() {
    if (!this.client) await this.init();
  }

  async close() {
    await this.transport?.close();
  }
}
