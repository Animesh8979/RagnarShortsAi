import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { logger } from "@antigravity/utils";
export class CoreMemory {
    transport;
    client;
    async init() {
        this.transport = new StdioClientTransport({
            command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"]
        });
        this.client = new Client({ name: "core-memory", version: "1.0.0" }, { capabilities: {} });
        await this.client.connect(this.transport);
        logger.info("core-memory MCP connected");
    }
    async store(key, value, tags) {
        await this.client.callTool({ name: "memory-store", arguments: { key, value, tags } });
    }
    async retrieve(key) {
        try {
            const res = await this.client.callTool({ name: "memory-retrieve", arguments: { key } });
            return String(res.content || "");
        }
        catch {
            return null;
        }
    }
    async search(query, limit = 5) {
        const res = await this.client.callTool({ name: "memory-search", arguments: { query, limit } });
        return JSON.parse(String(res.content || "[]"));
    }
    async rememberInteraction(prompt, response) {
        await this.store(`interaction:${Date.now()}`, JSON.stringify({ prompt, response, timestamp: Date.now() }));
    }
    async recallRelevant(query) {
        return this.search(query, 10);
    }
    async close() {
        await this.transport?.close();
    }
}
//# sourceMappingURL=index.js.map