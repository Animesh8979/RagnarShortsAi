Set-Location 'D:\anitgravity work\apps\studio'
"LOCAL MEMORY BEFORE:"
$os = Get-CimInstance Win32_OperatingSystem
"FreePhysicalRAM_GB = " + [math]::Round($os.FreePhysicalMemory/1024/1024, 2)
# Kill anything stale so chrome-headless-shell + node can start cleanly.
"Killing stale chrome / node / chromium processes if any ..."
Get-Process -Name chrome,node,chromium,chrome-headless-shell -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# A still-frame compose at a frame inside seg 3 (the printout) is the fastest real-world
# verification: it loads the module graph, runs every component, renders one PNG.
# Seg 3 (printout) starts at offset 12274 ms => frame = 12274/1000 * 30 ~= 368
# Pick frame 380 to be 12 frames into seg 3 -> the Printout animates well.
$frame = 380
$outpng = "out\smoke-seg3-frame$frame.png"

"Composing still-frame $frame -> $outpng ..."
# --log=verbose surfaces real errors; --frames picks one frame
& cmd /c "npx remotion still ExplainerVideo `"$outpng`" --frame=$frame --concurrency=2 --log=verbose 2>&1" | Out-String | Write-Output

if (Test-Path $outpng) {
  "STILL_FRAME_OK  size=" + (Get-Item $outpng).Length
} else {
  "STILL_FRAME_FAILED  no output file"
}
