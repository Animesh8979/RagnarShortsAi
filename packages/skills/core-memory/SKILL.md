# Core Memory Skill

**Purpose**: Persistent memory for AI agents using MCP memory server.

**Dependencies**: @modelcontextprotocol/sdk, @antigravity/utils

**Usage**:
```typescript
import { CoreMemory } from "@antigravity/skills/core-memory";

const memory = new CoreMemory();
await memory.init();
await memory.store("user-preference", JSON.stringify({ topic: "space" }));
const pref = await memory.retrieve("user-preference");
```
