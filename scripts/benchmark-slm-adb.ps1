param(
  [string]$Serial = "",
  [string]$EmulatorAvd = "",
  [string]$OutDir = "",
  [int]$UtteranceCount = 20,
  [double]$LSttMeanMs = -1,
  [double]$LSttSdMs = -1,
  [double]$LTtsMeanMs = -1,
  [double]$LTtsSdMs = -1,
  [switch]$SkipBuild,
  [switch]$KeepEmulatorRunning,
  [string[]]$OnlySlugs = @()
)

$ErrorActionPreference = "Stop"
if ($OnlySlugs.Count -gt 0) {
  $OnlySlugs = @($OnlySlugs | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Pkg = "com.lafina.capstone"
$CacheDir = Join-Path $RepoRoot ".local\slm-models"
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

$Models = @(
  @{
    slug = "smollm2-135m"
    name = "SmolLM2-135M-Instruct"
    filename = "SmolLM2-135M-Instruct-Q4_K_M.gguf"
    url = "https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf"
    minBytes = 40000000
    promptFormat = "chatml"
  },
  @{
    slug = "gemma-3-270m"
    name = "Gemma-3-270M-Instruct"
    filename = "gemma-3-270m-it-Q4_K_M.gguf"
    url = "https://huggingface.co/unsloth/gemma-3-270m-it-GGUF/resolve/main/gemma-3-270m-it-Q4_K_M.gguf"
    minBytes = 80000000
    promptFormat = "gemma"
  },
  @{
    slug = "qwen2.5-0.5b"
    name = "Qwen2.5-0.5B-Instruct"
    filename = "qwen2.5-0.5b-instruct-q4_k_m.gguf"
    url = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"
    minBytes = 100000000
    promptFormat = "chatml"
  },
  @{
    slug = "gemma-3-1b"
    name = "Gemma-3-1B-Instruct"
    filename = "gemma-3-1b-it-Q4_K_M.gguf"
    url = "https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf"
    minBytes = 300000000
    promptFormat = "gemma"
  }
)

function Get-ConnectedDevices {
  $lines = adb devices | Select-String "\tdevice$"
  $lines | ForEach-Object { ($_.Line -split "\s+")[0] }
}

$StartedEmulatorProc = $null
if ($EmulatorAvd) {
  $emuExe = Join-Path $env:LOCALAPPDATA "Android\Sdk\emulator\emulator.exe"
  if (-not (Test-Path $emuExe)) { throw "Android emulator not found at $emuExe" }
  $existingEmus = Get-ConnectedDevices | Where-Object { $_ -like "emulator-*" }
  if (-not $existingEmus) {
    Write-Host "Booting emulator AVD '$EmulatorAvd'..."
    $StartedEmulatorProc = Start-Process -FilePath $emuExe -ArgumentList "-avd $EmulatorAvd -no-audio -no-boot-anim -no-snapshot-load" -PassThru -WindowStyle Hidden
    adb -e wait-for-device | Out-Null
    $booted = $false
    for ($i = 0; $i -lt 90; $i++) {
      $b = (adb -e shell getprop sys.boot_completed 2>$null | Out-String).Trim()
      if ($b -eq "1") { $booted = $true; break }
      Start-Sleep -Seconds 2
    }
    if (-not $booted) { throw "Emulator '$EmulatorAvd' did not complete boot in time." }
  }
  $Serial = (Get-ConnectedDevices | Where-Object { $_ -like "emulator-*" } | Select-Object -First 1)
}

if (-not $Serial) {
  $physical = Get-ConnectedDevices | Where-Object { $_ -notlike "emulator-*" }
  if ($physical.Count -eq 1) {
    $Serial = $physical[0]
  } elseif ($physical.Count -gt 1) {
    throw "Multiple physical ADB devices attached ($($physical -join ', ')). Pass -Serial."
  } else {
    $anyDev = Get-ConnectedDevices
    if ($anyDev.Count -eq 1) { $Serial = $anyDev[0] }
    else { throw "No single ADB device found. Connect a device or pass -Serial / -EmulatorAvd." }
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
  $OutDir = Join-Path $RepoRoot "docs\reports\evidence\slm-benchmark-20261122\$SafeLabel"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Baseline L_stt and L_tts from prior conversation measurements for each device class
if ($LSttMeanMs -lt 0) {
  if ($IsEmulator) {
    $LSttMeanMs = 7982.6387; $LSttSdMs = 546.2628; $LTtsMeanMs = 326.7628; $LTtsSdMs = 48.2617
  } else {
    $LSttMeanMs = 3838.7067; $LSttSdMs = 211.7661; $LTtsMeanMs = 211.1306; $LTtsSdMs = 40.9389
  }
}

Write-Host "=== Target Device ==="
Write-Host "Serial: $Serial | Model: $DeviceModel | ABI: $DeviceAbi | Android: $AndroidRel | Emulator: $IsEmulator"
Write-Host "Evidence Dir: $OutDir"
Write-Host "Baseline L_stt=${LSttMeanMs}ms (sd=${LSttSdMs}ms), L_tts=${LTtsMeanMs}ms (sd=${LTtsSdMs}ms), n=$UtteranceCount"

# Build / install test APK (and dataQa app APK if missing on target)
$PrimaryAbi = ($DeviceAbi -split ",")[0].Trim()
$TestApk = Join-Path $RepoRoot "android\app\build\outputs\apk\androidTest\dataQa\app-dataQa-androidTest.apk"
if (-not $SkipBuild) {
  $jdk17 = "C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
  if (Test-Path $jdk17) { $env:JAVA_HOME = $jdk17 }
  Write-Host "Building :app:assembleDataQaAndroidTest..."
  Push-Location (Join-Path $RepoRoot "android")
  cmd.exe /c "gradlew.bat :app:assembleDataQaAndroidTest -PreactNativeArchitectures=$PrimaryAbi --no-daemon --console=plain" | Tee-Object -FilePath (Join-Path $OutDir "gradle_androidTest.log")
  $rc = $LASTEXITCODE
  Pop-Location
  if ($rc -ne 0) { throw "Gradle androidTest build failed with exit code $rc" }
}

$InstalledPkg = (adb -s $Serial shell pm list packages $Pkg | Out-String).Trim()
if ($InstalledPkg -notmatch "package:$Pkg(\r|\n|$)") {
  $AppApk = Join-Path $RepoRoot "android\app\build\outputs\apk\dataQa\app-$PrimaryAbi-dataQa.apk"
  if (-not (Test-Path $AppApk)) {
    $jdk17 = "C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
    if (Test-Path $jdk17) { $env:JAVA_HOME = $jdk17 }
    Push-Location (Join-Path $RepoRoot "android")
    cmd.exe /c "gradlew.bat :app:assembleDataQa -PreactNativeArchitectures=$PrimaryAbi --no-daemon --console=plain" | Tee-Object -FilePath (Join-Path $OutDir "gradle_app.log")
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Gradle app build failed" }
    Pop-Location
  }
  Write-Host "Installing $AppApk..."
  adb -s $Serial install -r $AppApk | Out-Null
}

Write-Host "Installing $TestApk..."
adb -s $Serial install -r $TestApk | Out-Null
Start-Sleep -Seconds 5

# Ensure app files/models directory exists
adb -s $Serial shell "run-as $Pkg mkdir -p files/models" | Out-Null

# Reuse prior cached GGUFs if available so we avoid re-downloading
$PriorCacheDir = "C:\Users\bnoel\.gemini\antigravity\brain\ac22f9a9-2f61-4113-aed2-f9cbf0291f41\scratch\iso25010-logs"
foreach ($cachedName in @("SmolLM2-135M-Instruct-Q4_K_M.gguf", "gemma-3-1b-it-Q4_K_M.gguf")) {
  $priorFile = Join-Path $PriorCacheDir $cachedName
  $localFile = Join-Path $CacheDir $cachedName
  if ((-not (Test-Path $localFile)) -and (Test-Path $priorFile)) {
    Write-Host "Reusing cached $cachedName..."
    Copy-Item $priorFile $localFile -Force
  }
}

$Results = @()
$ErrorActionPreference = "Continue"

foreach ($m in $Models) {
  $slug = $m.slug
  $devOutJson = "${slug}_tft.json"
  $hostJsonPath = Join-Path $OutDir "${slug}_tft.json"
  $memFile = Join-Path $OutDir "${slug}_meminfo.txt"
  $instrLog = Join-Path $OutDir "${slug}_instr.log"
  $logcatPath = Join-Path $OutDir "${slug}_logcat.txt"

  $runThisModel = ($OnlySlugs.Count -eq 0) -or ($OnlySlugs -contains $slug)
  if ($runThisModel) {
    $filename = $m.filename
    $deviceRelPath = "models/$filename"
    $localPath = Join-Path $CacheDir $filename

    # Check if device already has valid file in files/models/
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $devSizeStr = (adb -s $Serial shell "run-as $Pkg stat -c %s files/$deviceRelPath 2>/dev/null" | Out-String).Trim()
    $ErrorActionPreference = $prevEap
    $devSize = 0L
    [void][long]::TryParse($devSizeStr, [ref]$devSize)

    if ($devSize -lt $m.minBytes) {
      if (-not (Test-Path $localPath) -or ((Get-Item $localPath).Length -lt $m.minBytes)) {
        Write-Host "Downloading $($m.name) from $($m.url)..."
        curl.exe -L --fail --retry 3 --progress-bar -o $localPath $m.url
        if ($LASTEXITCODE -ne 0) { throw "Failed to download $($m.name)" }
      }
      $localSize = (Get-Item $localPath).Length
      if ($devSize -ne $localSize) {
        Write-Host "Pushing $filename ($([math]::Round($localSize/1MB,1)) MB) to $Serial..."
        adb -s $Serial push $localPath "/data/local/tmp/$filename" | Out-Null
        adb -s $Serial shell "run-as $Pkg cp /data/local/tmp/$filename files/$deviceRelPath && rm -f /data/local/tmp/$filename"
        if ($LASTEXITCODE -ne 0) { throw "Failed staging $filename into app files" }
      }
    } else {
      Write-Host "$($m.name) already staged on $Serial ($([math]::Round($devSize/1MB,1)) MB)."
    }

    # Reset app process and logcat so R_peak and logs are isolated per model
    adb -s $Serial shell am force-stop $Pkg | Out-Null
    Start-Sleep -Seconds 2
    adb -s $Serial logcat -c

    if (Test-Path $memFile) { Remove-Item $memFile -Force }

    $poller = Start-Job -ScriptBlock {
      param($ser, $pkg, $outFile)
      while ($true) {
        $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $mLine = adb -s $ser shell dumpsys meminfo $pkg 2>$null | Select-String "TOTAL PSS:" | Select-Object -First 1
        if ($mLine) {
          Add-Content -Path $outFile -Value "$ts | $($mLine.Line.Trim())"
        }
        Start-Sleep -Milliseconds 1000
      }
    } -ArgumentList $Serial, $Pkg, $memFile

    Write-Host "=== Running $($m.name) ($UtteranceCount utterances) on $Serial ==="
    adb -s $Serial shell am instrument -w `
      -e class "$Pkg.SlmTftBenchmarkTest#benchmarkSlmTft" `
      -e modelFile $deviceRelPath `
      -e modelName $m.name `
      -e promptFormat $m.promptFormat `
      -e utteranceCount "$UtteranceCount" `
      -e outFile $devOutJson `
      "$Pkg.test/androidx.test.runner.AndroidJUnitRunner" | Tee-Object -FilePath $instrLog

    Stop-Job $poller -ErrorAction SilentlyContinue
    Remove-Job $poller -ErrorAction SilentlyContinue

    cmd.exe /c "adb -s $Serial logcat -d -s SlmTftBenchmark LafinaLlama AndroidRuntime libc DEBUG > `"$logcatPath`""

    $instrRaw = if (Test-Path $instrLog) { Get-Content $instrLog -Raw } else { "" }
    $hasFile = (adb -s $Serial shell "run-as $Pkg test -f files/$devOutJson && echo OK" | Out-String).Trim()
    if ($instrRaw -match "OK \(1 test\)" -and $hasFile -eq "OK") {
      cmd.exe /c "adb -s $Serial exec-out run-as $Pkg cat files/$devOutJson > `"$hostJsonPath`""
    } elseif (Test-Path $hostJsonPath) {
      Remove-Item $hostJsonPath -Force
    }
  }

  $peakPssKb = 0
  $memSamples = 0
  if (Test-Path $memFile) {
    foreach ($line in Get-Content $memFile) {
      if ($line -match "TOTAL PSS:\s+(\d+)") {
        $memSamples++
        $kb = [int]$Matches[1]
        if ($kb -gt $peakPssKb) { $peakPssKb = $kb }
      }
    }
  }
  $peakMb = if ($memSamples -gt 0) { [math]::Round($peakPssKb / 1024.0, 1) } else { $null }

  $tftData = $null
  if ((Test-Path $hostJsonPath) -and ((Get-Item $hostJsonPath).Length -gt 10)) {
    try { $tftData = Get-Content $hostJsonPath -Raw | ConvertFrom-Json } catch { $tftData = $null }
  }
  if ($tftData -and ($null -ne $tftData.l_tft_mean_ms) -and ($tftData.utterances -ge 1)) {
    $tftMean = [double]$tftData.l_tft_mean_ms
    $tftSd = [double]$tftData.l_tft_sd_ms
    $e2eMean = $LSttMeanMs + $tftMean + $LTtsMeanMs
    $e2eSd = [math]::Sqrt(($LSttSdMs * $LSttSdMs) + ($tftSd * $tftSd) + ($LTtsSdMs * $LTtsSdMs))
    $Results += [PSCustomObject]@{
      model = $m.name
      status = "ok"
      loadMs = [math]::Round([double]$tftData.loadMs, 1)
      nThreads = $tftData.nThreads
      utterances = $tftData.utterances
      L_tft = [PSCustomObject]@{ mean = [math]::Round($tftMean, 1); std = [math]::Round($tftSd, 1); unit = "ms"; met = ($tftMean -le 700.0) }
      L_e2e = [PSCustomObject]@{ mean = [math]::Round($e2eMean, 1); std = [math]::Round($e2eSd, 1); unit = "ms"; met = ($e2eMean -le 2000.0) }
      R_peak = [PSCustomObject]@{ value = $peakMb; peakKb = $peakPssKb; samples = $memSamples; unit = "MB"; met = ($peakMb -le 3400.0) }
    }
  } else {
    Write-Warning "$($m.name) failed on $Serial. Check $instrLog and $logcatPath"
    $Results += [PSCustomObject]@{
      model = $m.name
      status = "failed"
      instrLog = $instrLog
      logcat = $logcatPath
      L_tft = $null
      L_e2e = $null
      R_peak = if ($peakMb -ne $null) { [PSCustomObject]@{ value = $peakMb; peakKb = $peakPssKb; samples = $memSamples; unit = "MB"; met = ($peakMb -le 3400.0) } } else { $null }
    }
  }
}

$DeepSeekNote = [PSCustomObject]@{
  model = "Deepseek-V4"
  status = "cloud_only_not_offline_slm"
  note = "DeepSeek (deepseek-flash / deepseek-chat) runs via LAFINA-backend cloud API, not offline via llama.cpp; no offline GGUF exists in src/ai/nlu/modelManager.ts."
  L_tft = $null
  L_e2e = $null
  R_peak = $null
}

$Summary = [PSCustomObject]@{
  timestamp = (Get-Date).ToUniversalTime().ToString("o")
  device = [PSCustomObject]@{
    serial = $Serial
    model = $DeviceModel
    abi = $DeviceAbi
    android = $AndroidRel
    isEmulator = $IsEmulator
    avd = if ($EmulatorAvd) { $EmulatorAvd } else { $null }
  }
  baseline = [PSCustomObject]@{
    L_stt_mean_ms = $LSttMeanMs
    L_stt_sd_ms = $LSttSdMs
    L_tts_mean_ms = $LTtsMeanMs
    L_tts_sd_ms = $LTtsSdMs
  }
  offlineModels = $Results
  cloudOnlyModels = @($DeepSeekNote)
}

$SummaryPath = Join-Path $OutDir "device_summary.json"
$SummaryJson = $Summary | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($SummaryPath, $SummaryJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "`n=== Summary written to $SummaryPath ==="
Get-Content $SummaryPath

if ($StartedEmulatorProc -and (-not $KeepEmulatorRunning)) {
  Write-Host "Shutting down emulator $Serial..."
  adb -s $Serial emu kill | Out-Null
}
