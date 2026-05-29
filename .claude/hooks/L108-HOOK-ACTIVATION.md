# L108 Hook Activation — manual one-step

The L108 Phase 7 hooks are written but NOT auto-registered (classifier-policy:
self-modification of `.claude/settings.json` requires explicit user approval
because PostToolUse hooks fire on every tool use).

To activate the L108 amplifier layer:

## 1. Open `.claude/settings.json` and merge these blocks

### Into `hooks.SessionStart[0].hooks` (append):
```json
{
  "type": "command",
  "command": "node .claude/hooks/l108-pipeline-supervisor.js",
  "timeout": 15
}
```

### As a new entry in `hooks.PostToolUse` (append to the array):
```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "node .claude/hooks/l108-phaseb-autoretry.js",
      "timeout": 10
    }
  ]
}
```

## 2. Verify with a session restart

```cmd
:: Force-kill the chain
taskkill /F /IM node.exe

:: Restart Claude Code; SessionStart hook should respawn the chain
:: Check the supervisor log:
type "D:\anitgravity work\renders\logs\.supervisor.log"
```

You should see `chain pid=X DEAD — respawning for date=2026-05-29 gap=180`
then `respawned as pid=Y` within 15 seconds of session start.

## 3. Phase B auto-retry test

When the upload chain logs a Phase B block on a clip (e.g. B5), the
PostToolUse hook reads the Bash stdout, finds `metadata_too_similar.*(B5)`,
and spawns `node tools/retry-2026-MM-DD-clips-yt.js --clip B5` async. The
spawned retry log lands in `renders/logs/autoretry-B5-{ts}.log`.

The lock file at `renders/logs/.phaseb-autoretry.lock` prevents re-firing
the same clip more than once per 5 minutes.

## What's in this hook directory

- `gsd-*.js` — existing GSD workflow hooks (do not edit)
- `l108-pipeline-supervisor.js` — SessionStart: respawn upload chain if dead
- `l108-phaseb-autoretry.js` — PostToolUse(Bash): auto-fire clip YT retry on Phase B detection

## Constraints

- All hooks read/write under `D:\anitgravity work\renders\logs\` only (no C:\)
- All hooks complete in <10s (Claude Code timeout policy)
- Hooks log to `renders/logs/.{hook-name}.log` for forensics
