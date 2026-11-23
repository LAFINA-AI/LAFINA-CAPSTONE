param(
  [string]$Serial = "",
  [string]$EmulatorAvd = "",
  [string]$OutDir = "",
  [ValidateSet("deepseek", "elevenlabs-stt")][string]$Target = "deepseek",
  [ValidateSet("direct", "backend")][string]$Mode = "direct",
  [string]$EndpointUrl = "",
  [string]$ApiModel = "deepseek-chat",
  [string]$SttModelId = "scribe_v1",
  [string]$AuthToken = "",
  [int]$UtteranceCount = 20,
  [switch]$SkipBuild,
  [switch]$KeepEmulatorRunning
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Pkg = "com.lafina.capstone"

if (-not $EndpointUrl) {
  if ($Target -eq "elevenlabs-stt") {
    $EndpointUrl = "https://api.elevenlabs.io/v1/speech-to-text"
  } else {
    $EndpointUrl = if ($Mode -eq "backend") { "https://lafina-backend.vercel.app/v1/ai/chat/stream" } else { "https://api.deepseek.com/chat/completions" }
  }
}

# Resolve auth token from parameter, env var, or read-only .env lookup without printing/logging it
if (-not $AuthToken) {
  if ($Target -eq "elevenlabs-stt") {
    $AuthToken = $env:ELEVENLABS_API_KEY
  } else {
    $AuthToken = if ($Mode -eq "backend") { $env:LAFINA_AUTH_TOKEN } else { $env:DEEPSEEK_API_KEY }
  }
}
if (-not $AuthToken) {
  $keyName = if ($Target -eq "elevenlabs-stt") { "ELEVENLABS_API_KEY" } elseif ($Mode -eq "backend") { "LAFINA_AUTH_TOKEN" } else { "DEEPSEEK_API_KEY" }
  $envCandidates = @(
    (Join-Path $RepoRoot ".env"),
    (Join-Path (Split-Path $RepoRoot -Parent) "LAFINA-backend\.env")
  )
  foreach ($envPath in $envCandidates) {
    if (Test-Path $envPath) {
      foreach ($line in Get-Content $envPath) {
        if ($line -match "^\s*$keyName\s*=\s*(.+?)\s*$") {
          $AuthToken = $Matches[1].Trim('"').Trim("'")
          break
        }
      }
      if ($AuthToken) { break }
    }
  }
}
if (-not $AuthToken) {
  $expectedKey = if ($Target -eq "elevenlabs-stt") { "ELEVENLABS_API_KEY" } elseif ($Mode -eq "backend") { "LAFINA_AUTH_TOKEN" } else { "DEEPSEEK_API_KEY" }
  throw "Missing auth token. Pass -AuthToken or set $expectedKey."
}

function Get-ConnectedDevices {
  adb devices | Select-String "\tdevice$" | ForEach-Object { ($_.Line -split "\s+")[0] }
}

$StartedEmulatorProc = $null
if ($EmulatorAvd) {
  $emuExe = Join-Path $env:LOCALAPPDATA "Android\Sdk\emulator\emulator.exe"
  if (-not (Test-Path $emuExe)) { throw "Android emulator not found at $emuExe" }
  if (-not (Get-ConnectedDevices | Where-Object { $_ -like "emulator-*" })) {
    Write-Host "Booting emulator AVD '$EmulatorAvd'..."
    $StartedEmulatorProc = Start-Process -FilePath $emuExe -ArgumentList "-avd $EmulatorAvd -no-audio -no-boot-anim -no-snapshot-load" -PassThru -WindowStyle Hidden
    adb -e wait-for-device | Out-Null
    $booted = $false
    for ($i = 0; $i -lt 90; $i++) {
      if (((adb -e shell getprop sys.boot_completed 2>$null) | Out-String).Trim() -eq "1") { $booted = $true; break }
      Start-Sleep -Seconds 2
    }
    if (-not $booted) { throw "Emulator '$EmulatorAvd' did not boot in time." }
  }
  $Serial = (Get-ConnectedDevices | Where-Object { $_ -like "emulator-*" } | Select-Object -First 1)
}

if (-not $Serial) {
  $physical = @(Get-ConnectedDevices | Where-Object { $_ -notlike "emulator-*" })
  if ($physical.Count -eq 1) { $Serial = $physical[0] }
  elseif ($physical.Count -gt 1) { throw "Multiple physical devices connected. Pass -Serial." }
  else {
    $anyDev = @(Get-ConnectedDevices)
    if ($anyDev.Count -eq 1) { $Serial = $anyDev[0] } else { throw "No ADB device attached." }
  }
}

$DeviceModel = (adb -s $Serial shell getprop ro.product.model | Out-String).Trim()
$DeviceAbi = (adb -s $Serial shell getprop ro.product.cpu.abilist | Out-String).Trim()
$AndroidRel = (adb -s $Serial shell getprop ro.build.version.release | Out-String).Trim()
$IsEmulator = $Serial -like "emulator-*"
$SafeLabel = if ($IsEmulator) {
  "emulator-" + (($EmulatorAvd, $DeviceModel | Where-Object { $_ } | Select-Object -First 1) -replace "[^a-zA-Z0-9_-]", "-")
} else {
  "physical-" + ($DeviceModel -replace "[^a-zA-Z0-9_-]", "-")
}

if (-not $OutDir) {
  $OutDir = Join-Path $RepoRoot "docs\reports\evidence\deepseek-benchmark-20261123\$SafeLabel"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Reuse existing L_stt and L_tts baselines from slm-benchmark-20261122 to avoid redundant runs
$ExistingBase = Join-Path $RepoRoot "docs\reports\evidence\slm-benchmark-20261122"
$LSttMeanMs = if ($IsEmulator) { 7982.6387 } else { 4044.8 }
$LSttSdMs = if ($IsEmulator) { 546.2628 } else { 298.6 }
$LTtsMeanMs = if ($IsEmulator) { 326.7628 } else { 211.1306 }
$LTtsSdMs = if ($IsEmulator) { 48.2617 } else { 40.9389 }
$BaselineSource = "defaults"

$PhysSttPath = Join-Path $ExistingBase "physical-23106RN0DA\stt_summary.json"
$PhysSumPath = Join-Path $ExistingBase "physical-23106RN0DA\device_summary.json"
$EmuSumPath = Join-Path $ExistingBase "emulator-Lafina\device_summary.json"
if (-not $IsEmulator -and (Test-Path $PhysSttPath) -and (Test-Path $PhysSumPath)) {
  $sttObj = (Get-Content $PhysSttPath -Raw) -replace "^\uFEFF", "" | ConvertFrom-Json
  $sumObj = (Get-Content $PhysSumPath -Raw) -replace "^\uFEFF", "" | ConvertFrom-Json
  $LSttMeanMs = [double]$sttObj.L_stt.mean
  $LSttSdMs = [double]$sttObj.L_stt.std
  $LTtsMeanMs = [double]$sumObj.baseline.L_tts_mean_ms
  $LTtsSdMs = [double]$sumObj.baseline.L_tts_sd_ms
  $BaselineSource = "reused physical-23106RN0DA stt_summary.json + device_summary.json"
} elseif ($IsEmulator -and (Test-Path $EmuSumPath)) {
  $sumObj = (Get-Content $EmuSumPath -Raw) -replace "^\uFEFF", "" | ConvertFrom-Json
  $LSttMeanMs = [double]$sumObj.baseline.L_stt_mean_ms
  $LSttSdMs = [double]$sumObj.baseline.L_stt_sd_ms
  $LTtsMeanMs = [double]$sumObj.baseline.L_tts_mean_ms
  $LTtsSdMs = [double]$sumObj.baseline.L_tts_sd_ms
  $BaselineSource = "reused emulator-Lafina device_summary.json"
}

Write-Host "=== DeepSeek Online Benchmark ($Mode) ==="
Write-Host "Serial: $Serial | Model: $DeviceModel | ABI: $DeviceAbi | Android: $AndroidRel | Emulator: $IsEmulator"
Write-Host "Reused Baseline ($BaselineSource): L_stt=${LSttMeanMs}ms (sd=${LSttSdMs}ms), L_tts=${LTtsMeanMs}ms (sd=${LTtsSdMs}ms)"

# Use com.lafina.capstone.debug if com.lafina.capstone is installed as a non-debuggable release build
$BuildType = "dataQa"
$CapInfo = (adb -s $Serial shell dumpsys package $Pkg 2>$null | Out-String)
if ($CapInfo -match "Package \[$Pkg\]" -and $CapInfo -notmatch "DEBUGGABLE") {
  Write-Host "Detected release (non-debuggable) $Pkg on $Serial; using com.lafina.capstone.debug alongside it."
  $Pkg = "com.lafina.capstone.debug"
  $BuildType = "debug"
}

$PrimaryAbi = ($DeviceAbi -split ",")[0].Trim()
$TestApk = Join-Path $RepoRoot "android\app\build\outputs\apk\androidTest\$BuildType\app-$BuildType-androidTest.apk"
if (-not $SkipBuild) {
  $jdk17 = "C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
  if (Test-Path $jdk17) { $env:JAVA_HOME = $jdk17 }
  Push-Location (Join-Path $RepoRoot "android")
  $gradleTasks = if ($BuildType -eq "debug") { ":app:assembleDebug :app:assembleDebugAndroidTest -PlafinaTestBuildType=debug" } else { ":app:assembleDataQaAndroidTest" }
  cmd.exe /c "gradlew.bat $gradleTasks -PreactNativeArchitectures=$PrimaryAbi --no-daemon --console=plain" | Tee-Object -FilePath (Join-Path $OutDir "gradle_androidTest.log")
  $rc = $LASTEXITCODE
  Pop-Location
  if ($rc -ne 0) { throw "Gradle androidTest build failed ($rc)" }
}

$InstalledPkg = (adb -s $Serial shell pm list packages $Pkg | Out-String).Trim()
if ($InstalledPkg -notmatch "package:$Pkg(\r|\n|$)") {
  $AppApk = Join-Path $RepoRoot "android\app\build\outputs\apk\$BuildType\app-$PrimaryAbi-$BuildType.apk"
  if (-not (Test-Path $AppApk)) { throw "Missing $AppApk; build :app:assemble$BuildType first." }
  adb -s $Serial install -r $AppApk | Out-Null
}
adb -s $Serial install -r $TestApk | Out-Null
Start-Sleep -Seconds 3

adb -s $Serial shell am force-stop $Pkg | Out-Null
Start-Sleep -Seconds 2
adb -s $Serial logcat -c

$prefix = if ($Target -eq "elevenlabs-stt") { "elevenlabs" } else { "deepseek" }
$deviceOutFile = if ($Target -eq "elevenlabs-stt") { "elevenlabs_stt.json" } else { "deepseek_tft.json" }
$memFile = Join-Path $OutDir "${prefix}_meminfo.txt"
if (Test-Path $memFile) { Remove-Item $memFile -Force }
$poller = Start-Job -ScriptBlock {
  param($ser, $pkg, $outFile)
  while ($true) {
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $mLine = adb -s $ser shell dumpsys meminfo $pkg 2>$null | Select-String "TOTAL PSS:" | Select-Object -First 1
    if ($mLine) { Add-Content -Path $outFile -Value "$ts | $($mLine.Line.Trim())" }
    Start-Sleep -Milliseconds 1000
  }
} -ArgumentList $Serial, $Pkg, $memFile

$instrLog = Join-Path $OutDir "${prefix}_instr.log"
$ErrorActionPreference = "Continue"
if ($Target -eq "elevenlabs-stt") {
  adb -s $Serial shell am instrument -w `
    -e class "com.lafina.capstone.SlmTftBenchmarkTest#benchmarkElevenlabsSttOnline" `
    -e endpointUrl $EndpointUrl `
    -e modelId $SttModelId `
    -e authToken $AuthToken `
    -e utteranceCount "$UtteranceCount" `
    -e outFile $deviceOutFile `
    "$Pkg.test/androidx.test.runner.AndroidJUnitRunner" | Tee-Object -FilePath $instrLog
} else {
  adb -s $Serial shell am instrument -w `
    -e class "com.lafina.capstone.SlmTftBenchmarkTest#benchmarkDeepseekOnline" `
    -e endpointUrl $EndpointUrl `
    -e mode $Mode `
    -e modelName "Deepseek-V4" `
    -e apiModel $ApiModel `
    -e authToken $AuthToken `
    -e utteranceCount "$UtteranceCount" `
    -e outFile $deviceOutFile `
    "$Pkg.test/androidx.test.runner.AndroidJUnitRunner" | Tee-Object -FilePath $instrLog
}

Stop-Job $poller -ErrorAction SilentlyContinue
Remove-Job $poller -ErrorAction SilentlyContinue

$logcatPath = Join-Path $OutDir "${prefix}_logcat.txt"
cmd.exe /c "adb -s $Serial logcat -d -s SlmTftBenchmark AndroidRuntime > `"$logcatPath`""

$hostJsonPath = Join-Path $OutDir $deviceOutFile
$instrRaw = if (Test-Path $instrLog) { Get-Content $instrLog -Raw } else { "" }
$hasFile = (adb -s $Serial shell "run-as $Pkg test -f files/$deviceOutFile && echo OK" | Out-String).Trim()
if (-not ($instrRaw -match "OK \(1 test\)" -and $hasFile -eq "OK")) {
  throw "$Target online instrumentation failed. See $instrLog and $logcatPath"
}
cmd.exe /c "adb -s $Serial exec-out run-as $Pkg cat files/$deviceOutFile > `"$hostJsonPath`""

$peakPssKb = 0; $memSamples = 0
if (Test-Path $memFile) {
  foreach ($line in Get-Content $memFile) {
    if ($line -match "TOTAL PSS:\s+(\d+)") { $memSamples++; if ([int]$Matches[1] -gt $peakPssKb) { $peakPssKb = [int]$Matches[1] } }
  }
}
$peakMb = [math]::Round($peakPssKb / 1024.0, 1)

$SummaryPath = Join-Path $OutDir "device_summary.json"
if ($Target -eq "elevenlabs-stt") {
  $elData = Get-Content $hostJsonPath -Raw | ConvertFrom-Json
  $elMean = [double]$elData.l_stt_mean_ms
  $elSd = [double]$elData.l_stt_sd_ms
  $existingSummary = if (Test-Path $SummaryPath) { (Get-Content $SummaryPath -Raw) -replace "^\uFEFF", "" | ConvertFrom-Json } else { $null }
  $dsPath = Join-Path $OutDir "deepseek_tft.json"
  $dsData = if (Test-Path $dsPath) { Get-Content $dsPath -Raw | ConvertFrom-Json } else { $null }

  $elEntry = [PSCustomObject]@{
    provider = $elData.provider
    endpointHost = $elData.endpointHost
    modelId = $elData.modelId
    utterances = $elData.utterances
    realWavClips = $elData.realWavClips
    transcriptsNonEmpty = $elData.transcriptsNonEmpty
    L_stt = [PSCustomObject]@{ mean = [math]::Round($elMean, 1); std = [math]::Round($elSd, 1); unit = "ms" }
    R_peak = [PSCustomObject]@{ value = $peakMb; peakKb = $peakPssKb; samples = $memSamples; unit = "MB" }
  }

  $onlineModels = if ($existingSummary -and $existingSummary.onlineModels) { @($existingSummary.onlineModels) } else { @() }
  if ($dsData -and $onlineModels.Count -gt 0) {
    $tftMean = [double]$dsData.l_tft_mean_ms
    $tftSd = [double]$dsData.l_tft_sd_ms
    $e2eOnlineMean = $elMean + $tftMean + $LTtsMeanMs
    $e2eOnlineSd = [math]::Sqrt(($elSd * $elSd) + ($tftSd * $tftSd) + ($LTtsSdMs * $LTtsSdMs))
    $onlineModels[0].L_e2e = [PSCustomObject]@{ mean = [math]::Round($e2eOnlineMean, 1); std = [math]::Round($e2eOnlineSd, 1); unit = "ms"; met = ($e2eOnlineMean -le 4000.0) }
  }

  $Summary = [PSCustomObject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    device = [PSCustomObject]@{ serial = $Serial; model = $DeviceModel; abi = $DeviceAbi; android = $AndroidRel; isEmulator = $IsEmulator; avd = if ($EmulatorAvd) { $EmulatorAvd } else { $null } }
    baseline = [PSCustomObject]@{ source = $BaselineSource; L_stt_offline_mean_ms = $LSttMeanMs; L_stt_offline_sd_ms = $LSttSdMs; L_tts_mean_ms = $LTtsMeanMs; L_tts_sd_ms = $LTtsSdMs }
    onlineStt = $elEntry
    onlineModels = $onlineModels
  }
} else {
  $tftData = Get-Content $hostJsonPath -Raw | ConvertFrom-Json
  $tftMean = [double]$tftData.l_tft_mean_ms
  $tftSd = [double]$tftData.l_tft_sd_ms
  $e2eMean = $LSttMeanMs + $tftMean + $LTtsMeanMs
  $e2eSd = [math]::Sqrt(($LSttSdMs * $LSttSdMs) + ($tftSd * $tftSd) + ($LTtsSdMs * $LTtsSdMs))

  $Summary = [PSCustomObject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    device = [PSCustomObject]@{ serial = $Serial; model = $DeviceModel; abi = $DeviceAbi; android = $AndroidRel; isEmulator = $IsEmulator; avd = if ($EmulatorAvd) { $EmulatorAvd } else { $null } }
    baseline = [PSCustomObject]@{ source = $BaselineSource; L_stt_mean_ms = $LSttMeanMs; L_stt_sd_ms = $LSttSdMs; L_tts_mean_ms = $LTtsMeanMs; L_tts_sd_ms = $LTtsSdMs }
    onlineModels = @(
      [PSCustomObject]@{
        model = $tftData.modelName
        mode = $tftData.mode
        endpointHost = $tftData.endpointHost
        apiModel = $tftData.apiModel
        status = "ok"
        utterances = $tftData.utterances
        L_tft = [PSCustomObject]@{ mean = [math]::Round($tftMean, 1); std = [math]::Round($tftSd, 1); unit = "ms"; met = ($tftMean -le 450.0) }
        L_full = [PSCustomObject]@{ mean = [math]::Round([double]$tftData.l_full_mean_ms, 1); std = [math]::Round([double]$tftData.l_full_sd_ms, 1); unit = "ms" }
        L_e2e = [PSCustomObject]@{ mean = [math]::Round($e2eMean, 1); std = [math]::Round($e2eSd, 1); unit = "ms"; met = ($e2eMean -le 10000.0) }
        R_peak = [PSCustomObject]@{ value = $peakMb; peakKb = $peakPssKb; samples = $memSamples; unit = "MB"; met = ($peakMb -le 512.0) }
      }
    )
  }
}

[System.IO.File]::WriteAllText($SummaryPath, ($Summary | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
Get-Content $SummaryPath

if ($StartedEmulatorProc -and (-not $KeepEmulatorRunning)) {
  adb -s $Serial emu kill | Out-Null
}
