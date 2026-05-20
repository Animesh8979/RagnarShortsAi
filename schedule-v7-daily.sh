#!/bin/bash
# schedule-v7-daily.sh — Fire-and-forget daily batch schedule
#
# Runs as detached processes so they survive session end.
#   T+0:   already uploaded (A1)
#   T+1h:  A2 organic → RagnarShortsAi + IG
#   T+2h:  B1 clip → RagnarShortsUltimate + IG
#   T+3h:  B2 clip → RagnarShortsUltimate + IG

cd "/d/anitgravity work" || exit 1
mkdir -p logs

# A2 at T+1h (3600s)
( sleep 3600 && node upload-v7-organic.js A2 > logs/A2-v7-upload-2026-05-21.log 2>&1 ) &
PID_A2=$!
disown 2>/dev/null

# B1 at T+2h (7200s)
( sleep 7200 && node upload-clip-single.js B1 > logs/B1-v7-upload-2026-05-21.log 2>&1 ) &
PID_B1=$!
disown 2>/dev/null

# B2 at T+3h (10800s)
( sleep 10800 && node upload-clip-single.js B2 > logs/B2-v7-upload-2026-05-21.log 2>&1 ) &
PID_B2=$!
disown 2>/dev/null

NOW=$(date "+%Y-%m-%d %H:%M:%S")
T1=$(date -d "+1 hour" "+%H:%M" 2>/dev/null || echo "T+1h")
T2=$(date -d "+2 hours" "+%H:%M" 2>/dev/null || echo "T+2h")
T3=$(date -d "+3 hours" "+%H:%M" 2>/dev/null || echo "T+3h")

cat <<EOF
=== V7 daily batch scheduler armed at $NOW ===
  A1 already LIVE
  A2 fires at ~$T1  (PID $PID_A2 → logs/A2-v7-upload-2026-05-21.log)
  B1 fires at ~$T2  (PID $PID_B1 → logs/B1-v7-upload-2026-05-21.log)
  B2 fires at ~$T3  (PID $PID_B2 → logs/B2-v7-upload-2026-05-21.log)
EOF
