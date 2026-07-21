import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { logger } from "@antigravity/utils";

export class CoreMemory {
  private transport!: StdioClientTransport;
  private client!: Client;

  async init() {
    this.transport = new StdioClientTransport({
      command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"]
    });
    this.client = new Client({ name: "core-memory", version: "1.0.0" }, { capabilities: {} });
    await this.client.connect(this.transport);
    logger.info("core-memory MCP connected");
  }

  async store(key: string, value: string, tags?: string[]): Promise<void> {
    await this.client.callTool({ name: "memory-store", arguments: { key, value, tags } });
  }

  async retrieve(key: string): Promise<string | null> {
    try {
      const res = await this.client.callTool({ name: "memory-retrieve", arguments: { key } });
      return String(res.content || "");
    } catch { return null; }
  }

  async search(query: string, limit = 5): Promise<any[]> {
    const res = await this.client.callTool({ name: "memory-search", arguments: { query, limit } });
    return JSON.parse(String(res.content || "[]"));
  }

  async rememberInteraction(prompt: string, response: string): Promise<void> {
    await this.store(`interaction:${Date.now()}`, JSON.stringify({ prompt, response, timestamp: Date.now() }));
  }

  async recallRelevant(query: string): Promise<any[]> {
    return this.search(query, 10);
  }

  async close() {
    await this.transport?.close();
  }
}
