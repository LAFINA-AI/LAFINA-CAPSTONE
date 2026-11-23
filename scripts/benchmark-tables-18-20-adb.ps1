param(
  [string]$Serial = "",
  [string]$OutDir = "",
  [string]$EndpointUrl = "https://api.deepseek.com/chat/completions",
  [string]$ApiModel = "deepseek-chat",
  [string]$AuthToken = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Pkg = "com.lafina.capstone"

if (-not $AuthToken) { $AuthToken = $env:DEEPSEEK_API_KEY }
if (-not $AuthToken) {
  foreach ($envPath in @(
    (Join-Path $RepoRoot ".env"),
    (Join-Path (Split-Path $RepoRoot -Parent) "LAFINA-backend\.env")
  )) {
    if (Test-Path $envPath) {
      foreach ($line in Get-Content $envPath) {
        if ($line -match "^\s*DEEPSEEK_API_KEY\s*=\s*(.+?)\s*$") {
          $AuthToken = $Matches[1].Trim('"').Trim("'")
          break
        }
      }
      if ($AuthToken) { break }
    }
  }
}
if (-not $AuthToken) {
  throw "Missing DEEPSEEK_API_KEY. Pass -AuthToken or ensure .env contains DEEPSEEK_API_KEY."
}

$physical = @(adb devices | Select-String "\tdevice$" | ForEach-Object { ($_.Line -split "\s+")[0] } | Where-Object { $_ -notlike "emulator-*" })
if (-not $Serial) {
  if ($physical.Count -eq 1) { $Serial = $physical[0] }
  elseif ($physical.Count -gt 1) { throw "Multiple physical devices connected. Pass -Serial." }
  else { throw "No physical ADB device connected (emulator excluded by request)." }
}
if ($Serial -like "emulator-*") {
  throw "Emulator execution is disallowed for this script; attach a physical device."
}

$DeviceModel = (adb -s $Serial shell getprop ro.product.model | Out-String).Trim()
$DeviceAbi = (adb -s $Serial shell getprop ro.product.cpu.abilist | Out-String).Trim()
$AndroidRel = (adb -s $Serial shell getprop ro.build.version.release | Out-String).Trim()
$PrimaryAbi = ($DeviceAbi -split ",")[0].Trim()
$SafeLabel = "physical-" + ($DeviceModel -replace "[^a-zA-Z0-9_-]", "-")

if (-not $OutDir) {
  $OutDir = Join-Path $RepoRoot "docs\reports\evidence\tables-18-20-20261124\$SafeLabel"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "=== Table 18-20 Physical Device Evaluation ==="
Write-Host "Serial: $Serial | Model: $DeviceModel | ABI: $PrimaryAbi | Android: $AndroidRel"

$BuildType = "dataQa"
$CapInfo = (adb -s $Serial shell dumpsys package $Pkg 2>$null | Out-String)
if ($CapInfo -match "Package \[$Pkg\]" -and $CapInfo -notmatch "DEBUGGABLE") {
  Write-Host "Detected non-debuggable release $Pkg; using $Pkg.debug alongside it."
  $Pkg = "com.lafina.capstone.debug"
  $BuildType = "debug"
}

$TestApk = Join-Path $RepoRoot "android\app\build\outputs\apk\androidTest\$BuildType\app-$BuildType-androidTest.apk"
if (-not $SkipBuild) {
  $jdk17 = "C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
  if (Test-Path $jdk17) { $env:JAVA_HOME = $jdk17 }
  Push-Location (Join-Path $RepoRoot "android")
  $gradleTasks = if ($BuildType -eq "debug") { ":app:assembleDebug :app:assembleDebugAndroidTest -PlafinaTestBuildType=debug" } else { ":app:assembleDataQaAndroidTest" }
  cmd.exe /c "gradlew.bat $gradleTasks -PreactNativeArchitectures=$PrimaryAbi --no-daemon --console=plain" | Tee-Object -FilePath (Join-Path $OutDir "gradle_androidTest.log")
  $rc = $LASTEXITCODE
  Pop-Location
  if ($rc -ne 0) { throw "Gradle build failed ($rc)" }
}

$InstalledPkg = (adb -s $Serial shell pm list packages $Pkg | Out-String).Trim()
if ($InstalledPkg -notmatch "package:$Pkg(\r|\n|$)") {
  $AppApk = Join-Path $RepoRoot "android\app\build\outputs\apk\$BuildType\app-$PrimaryAbi-$BuildType.apk"
  if (-not (Test-Path $AppApk)) { throw "Missing $AppApk" }
  adb -s $Serial install -r $AppApk | Out-Null
}
adb -s $Serial install -r $TestApk | Out-Null
adb -s $Serial shell appops set $Pkg SCHEDULE_EXACT_ALARM allow 2>$null | Out-Null
Start-Sleep -Seconds 2

function Invoke-EvalMethod {
  param(
    [string]$Method,
    [string]$OutFile,
    [string]$Prefix,
    [hashtable]$ExtraArgs = @{}
  )
  adb -s $Serial shell am force-stop $Pkg | Out-Null
  Start-Sleep -Seconds 1
  adb -s $Serial logcat -c

  $argList = @(
    "-s", $Serial, "shell", "am", "instrument", "-w",
    "-e", "class", "com.lafina.capstone.SkillsEvaluationBenchmarkTest#$Method",
    "-e", "outFile", $OutFile
  )
  foreach ($k in $ExtraArgs.Keys) {
    $argList += @("-e", $k, $ExtraArgs[$k])
  }
  $argList += "$Pkg.test/androidx.test.runner.AndroidJUnitRunner"

  $instrLog = Join-Path $OutDir "${Prefix}_instr.log"
  $ErrorActionPreference = "Continue"
  & adb @argList | Tee-Object -FilePath $instrLog
  $ErrorActionPreference = "Stop"

  $logcatPath = Join-Path $OutDir "${Prefix}_logcat.txt"
  cmd.exe /c "adb -s $Serial logcat -d -s SkillsEvalBenchmark AndroidRuntime > `"$logcatPath`""

  $instrRaw = if (Test-Path $instrLog) { Get-Content $instrLog -Raw } else { "" }
  $hasFile = (adb -s $Serial shell "run-as $Pkg test -f files/$OutFile && echo OK" | Out-String).Trim()
  if (-not ($instrRaw -match "OK \(1 test\)" -and $hasFile -eq "OK")) {
    throw "Instrumentation $Method failed. See $instrLog and $logcatPath"
  }
  $hostJson = Join-Path $OutDir $OutFile
  cmd.exe /c "adb -s $Serial exec-out run-as $Pkg cat files/$OutFile > `"$hostJson`""
  return ((Get-Content $hostJson -Raw) -replace "^\uFEFF", "" | ConvertFrom-Json)
}

Write-Host "`n--- Running Table 19 & Table 20 Local Evaluations ---"
$t19_20 = Invoke-EvalMethod -Method "evaluateTable19and20Local" -OutFile "table19_20_local.json" -Prefix "table19_20"

Write-Host "`n--- Running Table 18 Meetings WER (On-Device Whisper) ---"
$t18_wer = Invoke-EvalMethod -Method "evaluateTable18MeetingsWer" -OutFile "table18_meetings_wer.json" -Prefix "table18_wer"

Write-Host "`n--- Running Table 18 Online AI Skills (Lesson Q&A, Quiz, Summarizer, KPAR, DocGen) ---"
$t18_online = Invoke-EvalMethod -Method "evaluateTable18OnlineSkills" -OutFile "table18_online_skills.json" -Prefix "table18_online" -ExtraArgs @{
  endpointUrl = $EndpointUrl
  apiModel = $ApiModel
  authToken = $AuthToken
}

$Summary = [PSCustomObject]@{
  timestamp = (Get-Date).ToUniversalTime().ToString("o")
  device = [PSCustomObject]@{ serial = $Serial; model = $DeviceModel; abi = $DeviceAbi; android = $AndroidRel; isEmulator = $false }
  table18 = [PSCustomObject]@{
    lessonQa = [PSCustomObject]@{
      sgrPct = [math]::Round([double]$t18_online.lessonQa.sgrPct, 1)
      groundedPass = $t18_online.lessonQa.groundedPass
      queriesTotal = $t18_online.lessonQa.queriesTotal
      metSgr = $t18_online.lessonQa.metSgr
      lQaMeanMs = [math]::Round([double]$t18_online.lessonQa.lQaMeanMs, 1)
      lQaSdMs = [math]::Round([double]$t18_online.lessonQa.lQaSdMs, 1)
      metLQa = $t18_online.lessonQa.metLQa
    }
    quizMaker = [PSCustomObject]@{
      qvrPct = [math]::Round([double]$t18_online.quizMaker.qvrPct, 1)
      validItems = $t18_online.quizMaker.validItems
      totalItems = $t18_online.quizMaker.totalItems
      metQvr = $t18_online.quizMaker.metQvr
      lQuizMeanMs = [math]::Round([double]$t18_online.quizMaker.lQuizMeanMs, 1)
      lQuizSdMs = [math]::Round([double]$t18_online.quizMaker.lQuizSdMs, 1)
      metLQuiz = $t18_online.quizMaker.metLQuiz
    }
    summarizer = [PSCustomObject]@{
      kprPct = [math]::Round([double]$t18_online.summarizer.kprPct, 1)
      retainedCorePoints = $t18_online.summarizer.retainedCorePoints
      totalCorePoints = $t18_online.summarizer.totalCorePoints
      metKpr = $t18_online.summarizer.metKpr
      lSumMeanMs = [math]::Round([double]$t18_online.summarizer.lSumMeanMs, 1)
      lSumSdMs = [math]::Round([double]$t18_online.summarizer.lSumSdMs, 1)
      metLSum = $t18_online.summarizer.metLSum
    }
    meetings = [PSCustomObject]@{
      quietWerPct = [math]::Round([double]$t18_wer.quietWerMeanPct, 1)
      noisyWerPct = [math]::Round([double]$t18_wer.noisyWerMeanPct, 1)
      metWer = ($t18_wer.metQuiet -and $t18_wer.metNoisy)
      kparPct = [math]::Round([double]$t18_online.meetingsKpar.kparPct, 1)
      recalledItems = $t18_online.meetingsKpar.recalledItems
      totalItems = $t18_online.meetingsKpar.totalItems
      metKpar = $t18_online.meetingsKpar.metKpar
    }
    documentGeneration = [PSCustomObject]@{
      fgirPct = [math]::Round([double]$t18_online.documentGeneration.fgirPct, 1)
      integrityPass = $t18_online.documentGeneration.integrityPass
      promptsCount = $t18_online.documentGeneration.promptsCount
      metFgir = $t18_online.documentGeneration.metFgir
      csarPct = [math]::Round([double]$t18_online.documentGeneration.csarPct, 1)
      contentPass = $t18_online.documentGeneration.contentPass
      metCsar = $t18_online.documentGeneration.metCsar
      lDocMeanMs = [math]::Round([double]$t18_online.documentGeneration.lDocMeanMs, 1)
      lDocSdMs = [math]::Round([double]$t18_online.documentGeneration.lDocSdMs, 1)
      metLDoc = $t18_online.documentGeneration.metLDoc
    }
  }
  table19 = $t19_20.table19
  table20 = $t19_20.table20
}

$SummaryPath = Join-Path $OutDir "tables_18_20_summary.json"
[System.IO.File]::WriteAllText($SummaryPath, ($Summary | ConvertTo-Json -Depth 7), [System.Text.UTF8Encoding]::new($false))
Get-Content $SummaryPath
