# health-check.ps1 - PC health snapshot to prevent repeat crashes.
# Run AFTER a crash to verify RAM/disk/procs before resuming render work.
# Usage: powershell -ExecutionPolicy Bypass -File "D:\anitgravity work\health-check.ps1"

$ErrorActionPreference = "SilentlyContinue"

Write-Host "=== PROC SNAPSHOT (top RAM) ==="
Get-Process chrome,node,powershell -ErrorAction SilentlyContinue |
  Sort-Object WorkingSet64 -Descending |
  Select-Object -First 12 Name, Id,
    @{ N = "RAM_MB";  E = { [math]::Round($_.WorkingSet64 / 1MB, 0) } },
    @{ N = "CPU_s";   E = { [math]::Round($_.CPU, 1) } } |
  Format-Table -AutoSize

Write-Host "=== MEMORY ==="
$os = Get-CimInstance Win32_OperatingSystem
$freeGB  = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$usedPct = [math]::Round((($totalGB - $freeGB) / $totalGB) * 100, 1)
Write-Host ("Free RAM  = {0} GB" -f $freeGB)
Write-Host ("Total RAM = {0} GB" -f $totalGB)
Write-Host ("Used pct  = {0}%"   -f $usedPct)
if ($freeGB -lt 6)  { Write-Host "WARN: Free RAM < 6 GB - render unsafe" -ForegroundColor Red }
elseif ($freeGB -lt 12) { Write-Host "WARN: Free RAM < 12 GB - render risky" -ForegroundColor Yellow }
else { Write-Host "OK: Free RAM >= 12 GB - render safe" -ForegroundColor Green }

Write-Host "=== DISK ==="
Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='D:'" |
  Select-Object @{ N = "D_free_GB";  E = { [math]::Round($_.FreeSpace / 1GB, 1) } },
                @{ N = "D_total_GB"; E = { [math]::Round($_.Size / 1GB, 1) } } |
  Format-Table -AutoSize
Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" |
  Select-Object @{ N = "C_free_GB";  E = { [math]::Round($_.FreeSpace / 1GB, 1) } } |
  Format-Table -AutoSize

Write-Host "=== STALE CHROME/NODE COUNT ==="
$chrome = (Get-Process chrome -ErrorAction SilentlyContinue | Measure-Object).Count
$node   = (Get-Process node -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "chrome=$chrome  node=$node"
if ($chrome -gt 4) { Write-Host "WARN: >4 chrome procs - kill before render" -ForegroundColor Yellow }
