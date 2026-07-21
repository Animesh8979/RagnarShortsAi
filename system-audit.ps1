# system-audit.ps1 — full hardware + current-state audit
# Run: powershell -ExecutionPolicy Bypass -File system-audit.ps1

$ErrorActionPreference = "SilentlyContinue"

Write-Output "===== MACHINE ====="
$cs = Get-CimInstance Win32_ComputerSystem
"Manufacturer   : $($cs.Manufacturer)"
"Model          : $($cs.Model)"
"DNSHostName    : $($cs.DNSHostName)"
"Total RAM (GB) : $([math]::Round($cs.TotalPhysicalMemory/1GB,2))"
"Domain         : $($cs.Domain)"

Write-Output ""
Write-Output "===== CPU ====="
$cpu = Get-CimInstance Win32_Processor
"Name              : $($cpu.Name)"
"Cores             : $($cpu.NumberOfCores)"
"LogicalProcessors : $($cpu.NumberOfLogicalProcessors)"
"MaxClock (MHz)    : $($cpu.MaxClockSpeed)"
"L2Cache (KB)      : $($cpu.L2CacheSize)"
"L3Cache (KB)      : $($cpu.L3CacheSize)"

Write-Output ""
Write-Output "===== GPU(s) ====="
Get-CimInstance Win32_VideoController | ForEach-Object {
  "Name            : $($_.Name)"
  "AdapterRAM (GB) : $([math]::Round($_.AdapterRAM/1GB,2))"
  "Driver          : $($_.DriverVersion)"
  "Resolution      : $($_.CurrentHorizontalResolution) x $($_.CurrentVerticalResolution) @ $($_.CurrentRefreshRate)Hz"
  "----"
}

Write-Output ""
Write-Output "===== OS ====="
$os = Get-CimInstance Win32_OperatingSystem
"Caption            : $($os.Caption)"
"Version            : $($os.Version) (Build $($os.BuildNumber))"
"FreePhysicalRAM(GB): $([math]::Round($os.FreePhysicalMemory/1024/1024,2))"
"TotalVisibleRAM(GB): $([math]::Round($os.TotalVisibleMemorySize/1024/1024,2))"
"FreeVirtual(GB)    : $([math]::Round($os.FreeVirtualMemory/1024/1024,2))"
"TotalVirtual(GB)   : $([math]::Round($os.TotalVirtualMemorySize/1024/1024,2))"
"LastBoot           : $((Get-Process -Id $PID).StartTime) (current shell) | OS LastBoot: $($os.LastBootUpTime)"
"Uptime (h)         : $([math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours,2))"

Write-Output ""
Write-Output "===== STORAGE (volumes) ====="
Get-Volume | Where-Object { $_.DriveLetter } | ForEach-Object {
  "{0}: {1}  SizeGB={2}  FreeGB={3}  FS={4}" -f $_.DriveLetter, $_.FileSystemLabel, [math]::Round($_.Size/1GB,1), [math]::Round($_.SizeRemaining/1GB,1), $_.FileSystem
}

Write-Output ""
Write-Output "===== PHYSICAL DISKS ====="
Get-PhysicalDisk | ForEach-Object {
  "{0}  type={1}  bus={2}  sizeGB={3}  health={4}  op={5}" -f $_.FriendlyName, $_.MediaType, $_.BusType, [math]::Round($_.Size/1GB,1), $_.HealthStatus, $_.OperationalStatus
}

Write-Output ""
Write-Output "===== TOP PROCESSES BY RAM (current state) ====="
Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 8 | ForEach-Object {
  "{0,-28} pid={1,-7} RAM(MB)={2}" -f $_.ProcessName, $_.Id, [math]::Round($_.WorkingSet/1MB,1)
}

Write-Output ""
Write-Output "===== NODE / NPM / FFMPEG / CHROME ====="
foreach ($tool in @("node","npm","npx","ffmpeg")) {
  try {
    $v = & $tool --version 2>$null
    "{0,-6} : {1}" -f $tool, ($v | Select-Object -First 1)
  } catch {
    "$tool : NOT FOUND"
  }
}

# Chrome / chrome-headless-shell location used by Remotion
$remChrome = "D:\anitgravity work\apps\studio\node_modules\.remotion\chrome-headless-shell"
if (Test-Path $remChrome) { "Remotion Chrome headless shell dir present." } else { "Remotion Chrome headless shell dir MISSING." }
