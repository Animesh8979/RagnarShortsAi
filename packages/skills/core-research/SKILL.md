# Core Research Skill

**Purpose**: Web scraping, search (Brave, Tavily), and sequential thinking integration.

**Dependencies**: @modelcontextprotocol/sdk, @antigravity/security, @antigravity/utils

**Usage**:
```typescript
import { CoreResearch } from "@antigravity/skills/core-research";

const research = new CoreResearch();
await research.init();

const results = await research.searchBrave("viral video trends 2025");
const page = await research.fetchPage("https://example.com");
```
