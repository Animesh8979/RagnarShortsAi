---
name: daily-batch
description: Fire the daily Shorts batch — render organic + clip lanes and auto-upload to all 4 channels with parallel lanes. Use when the user says "fire the batch", "start today's upload", "run the daily batch", or similar.
allowed-tools:
  - Bash
  - Read
---

Fire the autonomous daily batch. Default: 2 organic + 2 clip + 1 community, parallel-lane auto-upload, 3h intra-lane gap.

## Pre-flight (always run first)
1. `node tools/l109-preupload-check.js` if it exists, else verify 4-lane auth:
   - YT organic → yt-credentials.json → RagnarShortsUltimate
   - YT clip → yt-credentials-2.json → RagnarShortsAI
   - IG organic → INSTAGRAM_USER_ID_ORGANIC (@ragnar_ultimate007)
   - IG clip → INSTAGRAM_USER_ID_CLIPS (@ragnarautomated)
2. Confirm no node upload-chain already running (`Get-CimInstance Win32_Process -Filter "Name='node.exe'"`).

## Render (foreground or background)
```
node lib/daily-fresh-batch.js --organic 2 --clips 2 --community 1
```
Active feature flags (all on): L108_DATAMOSH=1, L109_CUT_ON_PEAK=1, L109_SFX_LAYER=1.
Clip lane uses cut-on-peak multi-cut (8-14 cuts + SFX) with coherence gate
auto-fallback to single-shot. Organic uses humanized scripts + Whisper
captions + portraits + brain-rot grade + LUFS -14 + pinned-comment bait.

## Upload (parallel lanes, 3h gap) — launch via PowerShell Start-Process for Windows detachment
```
node lib/auto-upload-fresh.js --date <today> --gap-min 180
```
Organic + clip lanes fire SIDE BY SIDE (independent 3h timers), NOT serialized.

## After firing
- Write pid to renders/.upload-chain.pid (auto-handled by auto-upload-fresh).
- Monitor renders/logs/upload-<date>.log for Phase B blocks; auto-retry via
  tools/retry-<date>-clips-yt.js --clip B<N> (the L108 hook does this if active).
- Report every live URL as it lands.

## Constraints
- $0, D:\ only. Never unlist/delete prior live uploads (user policy).
- 3h gap is the default the user wants; do not serialize lanes.
