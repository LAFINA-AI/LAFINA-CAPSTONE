param(
  [ValidateRange(1, 100)][int]$Rounds = 30,
  [string]$OutputDirectory = 'docs/reports/evidence/performance-20261117/device'
)
$ErrorActionPreference = 'Stop'
$testPackage = 'com.lafina.capstone.performance'
$adbExe = (Get-Command adb -ErrorAction Stop).Source
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
& $adbExe shell uiautomator dump /sdcard/lafina-perf-ui.xml | Out-Null
& $adbExe pull /sdcard/lafina-perf-ui.xml "$OutputDirectory/navigation.xml" | Out-Null
[xml]$tree = Get-Content "$OutputDirectory/navigation.xml" -Raw
$targets = @{}
foreach ($label in @('Home', 'Schedule', 'AI', 'Skills', 'Profile')) {
  $node = $tree.SelectSingleNode("//node[@content-desc='$label tab']")
  if (!$node -or $node.bounds -notmatch '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$') {
    throw "Open the synthetic performance app's main tabs and dismiss any permission guidance. Missing: $label tab."
  }
  $pointX = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
  $pointY = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
  $targets[$label] = @($pointX, $pointY)
}
$appPid = (& $adbExe shell pidof $testPackage).Trim()
if (!$appPid) {throw 'The performance app is not running.'}
$measurementStart = [double]((& $adbExe shell date '+%s').Trim())
& $adbExe shell dumpsys meminfo $testPackage | Out-File "$OutputDirectory/memory-before.txt"
& $adbExe shell dumpsys gfxinfo $testPackage reset | Out-File "$OutputDirectory/frames-reset.txt"
$logcatPath = Join-Path $OutputDirectory 'tab-logcat.txt'
# Stream during the run: reading only at the end loses early samples when the
# phone's small shared log buffer rolls over during longer measurements.
$logcatProcess = Start-Process -FilePath $adbExe -ArgumentList @('logcat', "--pid=$appPid", '-v', 'epoch', 'ReactNativeJS:I', '*:S') -RedirectStandardOutput $logcatPath -RedirectStandardError (Join-Path $OutputDirectory 'logcat-errors.txt') -WindowStyle Hidden -PassThru
try {
  for ($round = 0; $round -lt $Rounds; $round++) {
    foreach ($label in @('Schedule', 'AI', 'Skills', 'Profile', 'Home')) {
      $point = $targets[$label]
      & $adbExe shell input tap ([int]$point[0]) ([int]$point[1]) | Out-Null
      Start-Sleep -Milliseconds 700
    }
    if (($round + 1) % 10 -eq 0) {
      & $adbExe shell dumpsys meminfo $testPackage | Out-File "$OutputDirectory/memory-round-$($round + 1).txt"
    }
  }
  & $adbExe shell dumpsys gfxinfo $testPackage framestats | Out-File "$OutputDirectory/frames-after.txt"
  & $adbExe shell dumpsys meminfo $testPackage | Out-File "$OutputDirectory/memory-after.txt"
  if ($logcatProcess.HasExited) {throw 'The live log capture ended before measurement completed.'}
} finally {
  if (!$logcatProcess.HasExited) {Stop-Process -Id $logcatProcess.Id}
}
$samples = @(Get-Content -LiteralPath $logcatPath |
  ForEach-Object {
    if ($_ -match '^\s*(\d+\.\d+).*\[TabPerformance\].*?(\{.*\})' -and [double]$Matches[1] -ge $measurementStart) {
      $Matches[2] | ConvertFrom-Json
    }
  })
$summary = foreach ($tab in @('dashboard', 'calendar', 'chat', 'notes', 'profile')) {
  $warm = @($samples | Where-Object {$_.tab -eq $tab -and $_.warm})
  $commits = @($warm.jsCommitMs | Sort-Object)
  $frames = @($warm.nextAnimationFrameMs | Sort-Object)
  if ($commits.Count) {
    [pscustomobject]@{tab = $tab; n = $commits.Count;
      jsCommitP50Ms = $commits[[Math]::Ceiling($commits.Count * 0.5) - 1];
      jsCommitP95Ms = $commits[[Math]::Ceiling($commits.Count * 0.95) - 1];
      nextAnimationFrameP95Ms = $frames[[Math]::Ceiling($frames.Count * 0.95) - 1]}
  }
}
[pscustomobject]@{package = $testPackage; rounds = $Rounds; capturedUtc = (Get-Date).ToUniversalTime().ToString('o');
  device = (& $adbExe shell getprop ro.product.model).Trim();
  api = (& $adbExe shell getprop ro.build.version.sdk).Trim();
  limitation = 'JS handler-to-layout-commit and next JS animation callback only; excludes native input delay and does not establish first-presented pixels or tap-to-usable latency.';
  expectedSamples = $Rounds * 5; receivedSamples = $samples.Count; samples = $samples; warmSummary = @($summary)} | ConvertTo-Json -Depth 7 | Out-File "$OutputDirectory/tab-timings.json"
$summary | Format-Table -AutoSize

if ($samples.Count -ne $Rounds * 5) {throw "Incomplete navigation trace: $($samples.Count) samples, expected $($Rounds * 5). Inspect the app and logs before interpreting timings."}
