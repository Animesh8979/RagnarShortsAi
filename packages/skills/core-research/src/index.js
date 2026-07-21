import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { safeExec } from "@antigravity/security";
import { logger } from "@antigravity/utils";
export class CoreResearch {
    transport;
    client;
    braveSearch;
    tavilySearch;
    async init() {
        this.transport = new StdioClientTransport({
            command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"]
        });
        this.client = new Client({ name: "core-research", version: "1.0.0" }, { capabilities: {} });
        await this.client.connect(this.transport);
        logger.info("core-research MCP connected");
    }
    async searchBrave(query, count = 10) {
        await this.ensureConnected();
        const res = await safeExec("npx", ["-y", "@modelcontextprotocol/server-brave-search", "--query", query, "--count", String(count)], { env: { BRAVE_API_KEY: process.env.BRAVE_API_KEY } });
        return JSON.parse(res.stdout || "[]");
    }
    async searchTavily(query, count = 10) {
        await this.ensureConnected();
        const res = await safeExec("npx", ["-y", "@mdp/tavily-mcp-server"], { env: { TAVILY_API_KEY: process.env.TAVILY_API_KEY } });
        return JSON.parse(res.stdout || "[]");
    }
    async fetchPage(url) {
        try {
            const res = await fetch(url);
            return await res.text();
        }
        catch (err) {
            logger.error(`fetchPage failed for ${url}: ${err.message}`);
            return "";
        }
    }
    async thinkSequentially(problem) {
        const res = await this.client.callTool({ name: "sequential-thinking", arguments: { thought: problem } });
        return String(res.content || "");
    }
    async ensureConnected() {
        if (!this.client)
            await this.init();
    }
    async close() {
        await this.transport?.close();
    }
}
//# sourceMappingURL=index.js.map