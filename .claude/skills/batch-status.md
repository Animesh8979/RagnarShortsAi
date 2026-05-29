---
name: batch-status
description: Check the live upload-chain status + today's batch progress. Use when the user asks "update me on the batch", "what's live", "check batch status", "is the chain alive".
allowed-tools:
  - Bash
  - Read
---

Report the current state of today's batch in one screen.

## Steps
1. Chain alive? `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` (PowerShell) — look for auto-upload-fresh.js. Cross-check renders/.upload-chain.pid.
2. Read renders/fresh-batch-<today>.json → what rendered (organic + clips, ok/fail).
3. Read renders/fresh-batch-upload-<today>.json → what uploaded so far (YT + IG URLs per item).
4. Tail renders/logs/upload-<today>*.log for the last events + any "Waiting Nm" sleep + any "metadata_too_similar" Phase B blocks.

## Output (one table)
```
=== BATCH <date> — chain <ALIVE pid=X | DEAD> ===
| Slot | Lane | YT | IG | next |
{one row per slot, live URLs or queued + ETA}
```
Then 1-3 action lines: any Phase B blocks needing retry, any failures, ETA to full completion.

## If chain is DEAD mid-batch
Respawn via PowerShell Start-Process:
`node lib/auto-upload-fresh.js --date <today> --gap-min 180 --start-at <resume-index>`
Compute start-at from how many items per lane already succeeded in the upload manifest.

## Constraints
- Read-only report unless explicitly asked to respawn/retry.
- Never unlist/delete prior live uploads.
