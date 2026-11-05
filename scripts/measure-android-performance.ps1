param(
  [Parameter(Mandatory=$true)][ValidateSet('baseline','optimized')][string]$Label,
  [string]$Serial,
  [int]$Samples = 12,
  [int]$IntervalSeconds = 5,
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '../release-artifacts/performance')
)
$ErrorActionPreference = 'Stop'
if ($Samples -lt 1 -or $Samples -gt 120 -or $IntervalSeconds -lt 1 -or $IntervalSeconds -gt 30) { throw 'Choose 1–120 samples and 1–30 seconds between samples.' }
$adbArgs = @()
if ($Serial) { $adbArgs = @('-s', $Serial) }
$deviceState = & adb @adbArgs get-state 2>$null
if ($LASTEXITCODE -ne 0 -or $deviceState -ne 'device') { throw 'Connect an authorised Android device or emulator first; use -Serial if more than one is connected.' }
$package = 'info.siza.communityevents.app'
$appProcess = & adb @adbArgs shell pidof $package
if (!$appProcess) { throw 'Open Community Connect on the test device before sampling.' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$prefix = Join-Path $OutputDirectory "$Label-$stamp"
$rows = @()
for ($i = 0; $i -lt $Samples; $i++) {
  $memory = (& adb @adbArgs shell dumpsys meminfo $package) -join "`n"
  if ($LASTEXITCODE -ne 0 -or $memory -match 'No process found') { throw 'The app exited or memory sampling failed.' }
  $match = [regex]::Match($memory, 'TOTAL PSS:\s*(\d+)')
  if (!$match.Success) { $match = [regex]::Match($memory, '(?m)^\s*TOTAL\s+(\d+)') }
  if (!$match.Success) { throw 'Unrecognised meminfo output; no measurement reported.' }
  Add-Content -LiteralPath "$prefix-meminfo.txt" -Value $memory -Encoding utf8
  $rows += [pscustomobject]@{ Sample=$i+1; Time=(Get-Date).ToString('o'); PssKiB=[long]$match.Groups[1].Value }
  if ($i -lt $Samples - 1) { Start-Sleep -Seconds $IntervalSeconds }
}
$rows | Export-Csv -LiteralPath "$prefix-memory.csv" -NoTypeInformation -Encoding utf8
& adb @adbArgs shell dumpsys gfxinfo $package framestats | Set-Content -LiteralPath "$prefix-framestats.txt" -Encoding utf8
$summary = [pscustomobject]@{ Label=$Label; Samples=$rows.Count; MeanPssMiB=[math]::Round(($rows.PssKiB | Measure-Object -Average).Average/1024,2); PeakPssMiB=[math]::Round(($rows.PssKiB | Measure-Object -Maximum).Maximum/1024,2) }
$summary | ConvertTo-Json | Set-Content -LiteralPath "$prefix-summary.json" -Encoding utf8
$summary
# Run baseline/optimized with the same account, city, data, device and actions.
# Repeat cold/warm list scroll, one full poster, business details and navigation.
# This script reads metrics only; it does not clear data, log out or send messages.
