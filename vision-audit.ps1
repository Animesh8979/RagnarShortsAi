# NVIDIA NIM vision audit — send extracted frames to meta/llama-3.2-90b-vision-instruct.
# KEY1 is read from D:\ai-router\.env. Each frame is base64-encoded and POSTed
# to the chat-completions endpoint with a strict rubric prompt.
$ErrorActionPreference = 'Stop'

# --- Resolve KEY1 from the router .env (never hardcode) ---
$envFile = 'D:\ai-router\.env'
if (-not (Test-Path $envFile)) { "ERR: $envFile not found"; exit 1 }
$envText = Get-Content $envFile -Raw
$keyMatch = [regex]::Match($envText, 'KEY1\s*=\s*([^\r\n]+)')
if (-not $keyMatch.Success) { "ERR: KEY1 not found in $envFile"; exit 1 }
$key1 = $keyMatch.Groups[1].Value.Trim().Trim('"').Trim("'")
if ($key1 -notlike 'nvapi-*') { "WARN: KEY1 does not look like an nvapi- token" }

$endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions'
$model = 'meta/llama-3.2-90b-vision-instruct'

# --- Which frame to audit; default to all 6 via frames dir ---
$framesDir = 'D:\anitgravity work\apps\studio\out\frames'
$single = $args[0]  # optional: a specific frame file
if ($single -and (Test-Path $single)) {
  $frames = @($single)
} else {
  $frames = Get-ChildItem $framesDir -Filter '*.png' | Sort-Object Name
}
if (-not $frames -or $frames.Count -eq 0) { "ERR no frames in $framesDir"; exit 1 }

# Rubric: the user's quality gate is "best professional work", not "toddler level".
# We want concrete flaws per axis and an overall verdict per frame, then a global aggregate.
$rubric = @"
You are a senior creative director reviewing a vertical (9:16) short-form video frame for a YouTube Shorts / Instagram Reels explainer titled "This Signal Has NEVER Been Explained" (the Wow! signal). Be brutally honest - the bar is professional broadcast quality, not amateur.

Audit these axes specifically and report a flaw if present, else say OK:
1. CHARACTER: Does the on-screen character look like a real, articulated, professional animated human (not a flat stick icon)? If flat / featureless / amateur, say so.
2. TEXT LEGIBILITY: Is any headline / caption / word-card legible against its background? Any mid-word breaks, missing spaces, or wrap artifacts? Quote the exact text you see.
3. COMPOSITION: Is the frame balanced? Anything cropped at edges, anything floating in dead space? Is there a clear visual hierarchy?
4. COLOR / MOOD: Is the palette cohesive or jarring? Any saturated clash that an art director would flag?
5. VISUAL SUPPORT: Is the central subject (an archival SVG visualization - printout / telescope / starfield / etc.) clearly the focal point? Is it crisp, framed, and serving the segment's beat?
6. ARTIFACTS: Any rendering glitches, broken SVG, overlapping elements, misspelled words, illegible markers?

Output STRICT JSON (no markdown fence):
{
  "verdict": "PRO" | "AMATEUR",
  "axes": { "character": "<OK or flaw>", "text": "<OK or flaw + quoted text>", "composition": "<OK or flaw>", "color": "<OK or flaw>", "visual_support": "<OK or flaw>", "artifacts": "<OK or flaw>" },
  "worst_issue": "<one-sentence biggest problem on this frame>",
  "fix_suggestion": "<one-sentence concrete fix>"
}
"@

# Save raw audit JSON for the iteration loop + report. Declared here so the
# incremental persist inside the loop can write before the loop completes.
$out = 'D:\anitgravity work\VISION-AUDIT-RESULTS.json'

$results = @()
$frameIdx = 0
foreach ($f in $frames) {
  $frameIdx++
  "[$frameIdx/$($frames.Count)] Auditing $($f.Name) ($($f.Length) bytes) ..."
  $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
  $b64 = [Convert]::ToBase64String($bytes)
  $dataUri = "data:image/png;base64,$b64"

  $body = @{
    model = $model
    messages = @(
      @{ role = 'user'; content = @(
        @{ type = 'text'; text = $rubric },
        @{ type = 'image_url'; image_url = @{ url = $dataUri } }
      )}
    )
    max_tokens = 700
    temperature = 0.2
  } | ConvertTo-Json -Depth 10 -Compress

  $headers = @{
    'Authorization' = "Bearer $key1"
    'Accept' = 'application/json'
    'Content-Type' = 'application/json'
  }

  # PER-FRAME RETRY: the prior crash happened mid-audit. A single NIM
  # network failure should NOT poison the whole 6-frame loop. Retry up to
  # 2 times with a 5s backoff, and ALWAYS persist what we have so a crash
  # mid-loop still leaves the prior frames' verdicts on disk.
  $attempt = 0
  $maxAttempts = 3
  $content = $null
  while ($attempt -lt $maxAttempts -and -not $content) {
    $attempt++
    try {
      $resp = Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -Body $body -TimeoutSec 60 -ContentType 'application/json'
      $content = $resp.choices[0].message.content
      "--- $($f.Name) (attempt $attempt) ---"
      $content
      ""
    } catch {
      "ERR on $($f.Name) attempt $attempt`: $($_.Exception.Message)"
      if ($attempt -lt $maxAttempts) { Start-Sleep -Seconds 5 }
    }
  }
  if (-not $content) { $content = "ERROR: all $maxAttempts attempts failed" }
  $results += [PSCustomObject]@{ frame = $f.Name; verdict_raw = $content }
  # INCREMENTAL PERSIST: write after each frame so a crash never loses work.
  $results | ConvertTo-Json -Depth 5 | Set-Content -Path $out -Encoding UTF8
}

# Final persist is redundant with the incremental writes but guarantees the
# final frame is captured in the canonical encoding.
$results | ConvertTo-Json -Depth 5 | Set-Content -Path $out -Encoding UTF8
"AUDIT_DONE  $($results.Count) frames  -> $out"
