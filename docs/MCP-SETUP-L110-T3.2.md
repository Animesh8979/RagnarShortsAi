# L110 T3.2 — Publish + Trend MCP setup (do this when you want them live)

These are **optional** add-ons. The pipeline already publishes to all 4 channels via the
existing Node uploaders (`yt-uploader.js`, `ig-uploader.js`) — these MCPs are a *convenience/observability*
layer, not a dependency. All are $0/free-tier and use **your own** OAuth/API creds (no card).

I did **not** auto-register these in `.claude/mcp.json` because registering external MCP
packages is startup-config self-modification — that's your call to make, not a research
subagent's. When you want one live, paste its block into `.claude/mcp.json` and restart Claude Code.

## 1. youtube-analytics (enable FIRST — easiest, API-key only)
`wynandw87/claude-code-youtube-mcp` — trending, transcripts, **most-replayed heatmaps**, engagement.
Feeds the heatmap-targeting idea in `lib/velocity-watch.js` (T3.3). Free quota, no OAuth, no card.

```jsonc
// .claude/mcp.json -> mcpServers
"youtube-analytics": {
  "command": "npx",
  "args": ["-y", "@wynandw87/claude-code-youtube-mcp"],
  "env": { "YOUTUBE_API_KEY": "<your YOUTUBE_API_KEY from .env>" }
}
```
Setup: Google Cloud project → enable **YouTube Data API v3** → create an API key. ~2 min.

## 2. youtube-uploader (resumable upload — OAuth)
`adamanz/youtube-mcp-server`. OAuth2, **no billing card** (Data API v3 free quota).
⚠️ Default quota ≈ **6 uploads/day** (upload costs ~1,600 of 10,000 units) — request a quota
increase or you'll cap. Needs Google Cloud project + OAuth consent screen.

```jsonc
"youtube-uploader": {
  "command": "python",
  "args": ["D:\\tools\\youtube-mcp-server\\youtube_uploader.py"],
  "env": { "YOUTUBE_CLIENT_SECRETS": "<path to client_secrets.json>" }
}
```

## 3. instagram-reels (publish + insights — Meta review)
`mcpware/instagram-mcp`. Free IG Graph API, **but** requires a Meta Business/Creator account +
**App Review for `instagram_content_publish`** (approval friction, no card). Budget a few days for review.

```jsonc
"instagram-reels": {
  "command": "npx",
  "args": ["-y", "@mcpware/instagram-mcp"],
  "env": {
    "INSTAGRAM_ACCESS_TOKEN": "<from .env>",
    "INSTAGRAM_BUSINESS_ACCOUNT_ID": "<from .env>"
  }
}
```

## Verdict / priority
- **#1 is worth it now** — most-replayed heatmaps directly improve clip-window selection (T3.3) and trend mining, with a 2-minute API-key setup and zero risk.
- **#2 / #3** only if you want to move publishing into MCPs — the existing Node uploaders already do this job, so these are lateral, not upward. Skip unless the convenience matters to you.

_Source: L110 research agent sweep (verified live 2026-05-30)._
