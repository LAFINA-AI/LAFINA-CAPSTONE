param(
    [ValidateSet('arm64-v8a', 'x86_64')][string]$Architecture = 'arm64-v8a',
    [switch]$Install
)
$ErrorActionPreference = 'Stop'
$checkout = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$state = Join-Path $checkout '.local/provider-testing'
New-Item -ItemType Directory -Force -Path $state | Out-Null
$java17 = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
if (Test-Path -LiteralPath $java17) { $env:JAVA_HOME = $java17 }
$properties = @('--offline', '--no-daemon', '--max-workers=2', '--console=plain', "-PreactNativeArchitectures=$Architecture", '-PlafinaProviderTesting=true')
$buildExit = 1

# Metro resolves physical Windows paths; generate the real app bundle there.
Push-Location (Join-Path $checkout 'android')
try {
    $ErrorActionPreference = 'Continue'
    & .\gradlew.bat :app:createBundleDataQaJsAndAssets @properties *> (Join-Path $state "bundle-$Architecture.log")
    $bundleExit = $LASTEXITCODE
} finally { Pop-Location; $ErrorActionPreference = 'Stop' }
if ($bundleExit -ne 0) { throw "JS bundle failed. Read .local/provider-testing/bundle-$Architecture.log" }

$bundlePath = Join-Path $checkout 'android/app/build/generated/assets/react/dataQa/index.android.bundle'
$bundleHash = (Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ((Test-Path -LiteralPath 'L:\') -or (Get-PSDrive -Name L -ErrorAction SilentlyContinue)) {
    throw 'L: is already in use; no mapping was changed.'
}
$init = Join-Path $state 'reuse-app-bundle.init.gradle'
$initSource = @'
gradle.projectsEvaluated {
    def app = rootProject.findProject(':app')
    if (app != null) {
        app.tasks.named('createBundleDataQaJsAndAssets').configure { onlyIf { false } }
    }
}
'@
[IO.File]::WriteAllText($init, $initSource, [Text.UTF8Encoding]::new($false))
& subst.exe L: $checkout
if ($LASTEXITCODE -ne 0) { throw 'Could not create the temporary build mapping.' }
try {
    Push-Location 'L:\android'
    try {
        $ErrorActionPreference = 'Continue'
        & .\gradlew.bat :app:assembleDataQa @properties --init-script 'L:/.local/provider-testing/reuse-app-bundle.init.gradle' *> (Join-Path $state "assemble-$Architecture.log")
        $buildExit = $LASTEXITCODE
    } finally { Pop-Location; $ErrorActionPreference = 'Stop' }
} finally { & subst.exe L: /d }
if ($buildExit -ne 0) { throw "APK assembly failed. Read .local/provider-testing/assemble-$Architecture.log" }

$builtApk = Join-Path $checkout "android/app/build/outputs/apk/dataQa/app-$Architecture-dataQa.apk"
$apk = Join-Path $state "LAFINA-providers-$Architecture.apk"
Copy-Item -LiteralPath $builtApk -Destination $apk
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($apk)
try {
    $entry = $archive.GetEntry('assets/index.android.bundle')
    if ($null -eq $entry) { throw 'The APK has no JS bundle.' }
    $stream = $entry.Open()
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $packedHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose() }
    } finally { $stream.Dispose() }
} finally { $archive.Dispose() }
if ($packedHash -ne $bundleHash) { throw 'Packaged bundle differs from the freshly generated app bundle.' }
& python (Join-Path $PSScriptRoot 'audit-provider-test-apk.py') $apk
if ($LASTEXITCODE -ne 0) { throw 'APK provider-key audit failed.' }
$receipt = @{
    package = 'com.lafina.capstone.providers'; architecture = $Architecture
    apk = $apk; apk_sha256 = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    bundle_sha256 = $bundleHash; server = 'http://127.0.0.1:8000'
    fast_tts_default = $true; provider_keys_in_apk = $false
} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $state "artifact-$Architecture.json"), $receipt, [Text.UTF8Encoding]::new($false))
if ($Install) {
    $adb = Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
    & $adb reverse tcp:8000 tcp:8000
    if ($LASTEXITCODE -ne 0) { throw 'Connect one Android device by USB, or run one emulator.' }
    & $adb install -r $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK installation failed.' }
}
Write-Output "Built $apk"
