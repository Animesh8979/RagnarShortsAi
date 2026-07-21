Set-Location 'D:\anitgravity work\apps\studio'
$ErrorActionPreference = 'Continue'
"RENDER START $(Get-Date -Format 'o')"
$os = Get-CimInstance Win32_OperatingSystem
$freeGB = [math]::Round($os.FreePhysicalMemory/1024/1024, 2)
"FreePhysicalRAM_GB = $freeGB"
# HARD GATE: abort if RAM < 10 GB. The prior crash was NOT RAM (22 GB free)
# but this gate prevents the next class of crash before it starts.
if ($freeGB -lt 10) {
  "ABORT: Free RAM < 10 GB - render will OOM-kill chrome. Free memory first."
  exit 3
}
"Killing stale chrome / node / chromium / chrome-headless-shell ..."
Get-Process -Name chrome,node,chromium,chrome-headless-shell -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
New-Item -ItemType Directory -Path out -Force | Out-Null
$out = "out\explainer-video.mp4"
if (Test-Path $out) { "Removing stale $out"; Remove-Item $out -Force; }
# CRASH-PROOFING: --gl=angle forces the ANGLE software renderer instead of
# the NVIDIA Optimus dGPU. The host's GTX 1650 Mobile Optimus path is known
# flaky under sustained headless-chrome render load (the prior PC crash).
# --timeout=120000 kills any frame that hangs >2 min so one stuck frame
# cannot hang the whole render.
"Rendering ExplainerVideo (699 frames, 30fps, concurrency=2, angle, per-frame timeout 120s)..."
& cmd /c "npx remotion render ExplainerVideo out\explainer-video.mp4 --concurrency=2 --gl=angle --timeout=120000 --log=verbose > out\render.log 2>&1"
$exit = $LASTEXITCODE
"RENDER EXIT = $exit  ($(Get-Date -Format 'o'))"
# Always clean up chrome children this render spawned, even on success.
Get-Process -Name chrome,chrome-headless-shell -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
if (($exit -eq 0) -and (Test-Path $out)) {
  $f = Get-Item $out
  "RENDER_OK  size=$($f.Length)  modified=$($f.LastWriteTime)"
} else {
  "RENDER_FAILED  exit=$exit no MP4 produced (see render.log tail below)"
  Get-Content out\render.log -Tail 40
}
