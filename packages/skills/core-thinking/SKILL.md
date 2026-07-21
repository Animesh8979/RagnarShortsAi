# Core Thinking Skill

**Purpose**: Decompose problems into sequential reasoning steps.

**Dependencies**: @modelcontextprotocol/sdk, @antigravity/utils

**Usage**:
```typescript
import { CoreThinking } from "@antigravity/skills/core-thinking";

const think = new CoreThinking();
await think.init();
const result = await think.reason("How to make a viral video about space?");
```
