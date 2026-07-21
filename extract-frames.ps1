# Extract 6 evenly-spaced still-frames from the latest explainer-video.mp4.
# Output directory is created fresh each run so stale seg-frame* files do not pollute the audit.
$ErrorActionPreference = 'Continue'

$mp4    = 'D:\anitgravity work\apps\studio\out\explainer-video.mp4'
$ffmpeg = 'D:\anitgravity work\node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe'
$outDir = 'D:\anitgravity work\apps\studio\out\frames'

if (-not (Test-Path $mp4))    { "ERR no mp4 at $mp4"; exit 1 }
if (-not (Test-Path $ffmpeg)) { "ERR no ffmpeg at $ffmpeg"; exit 1 }

# Wipe any stale frames to keep audit clean.
if (Test-Path $outDir) {
  Get-ChildItem $outDir -Filter '*.png' -ErrorAction SilentlyContinue | Remove-Item -Force
} else {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

# Get duration in seconds via stderr parse (Select-Object is needed because
# ffmpeg writes its banner info to stderr, not stdout).
$probe = & $ffmpeg -hide_banner -i $mp4 2>&1 | Out-String
$durLine = $probe -split "`n" | Where-Object { $_ -match 'Duration:' } | Select-Object -First 1
"Duration line: $durLine"
if (-not $durLine) { "ERR could not parse duration"; exit 1 }
$match = [regex]::Match($durLine, 'Duration:\s*(\d+):(\d+):(\d+\.\d+)')
if (-not $match.Success) { "ERR duration regex failed"; exit 1 }
$h = [int]$match.Groups[1].Value
$m = [int]$match.Groups[2].Value
$s = [double]$match.Groups[3].Value
$durSec = ($h * 3600) + ($m * 60) + $s
"Duration: {0:F2} s" -f $durSec

# Six evenly-spaced sample points (avoid the first and last 0.2s).
$points = @(0.5, 5.0, 10.0, 15.0, 20.0, 22.8)
$i = 0
foreach ($t in $points) {
  $i++
  $name = "frame_{0:D4}.png" -f $i
  $out  = Join-Path $outDir $name
  "  [$i/$($points.Count)] t=$t s -> $name"
  & $ffmpeg -y -ss $t -i $mp4 -frames:v 1 -q:v 2 $out 2>&1 | Out-Null
  if (-not (Test-Path $out)) { "WARN missing $out"; continue }
  "    -> $((Get-Item $out).Length) bytes"
}
"EXTRACT_DONE  $outDir"
