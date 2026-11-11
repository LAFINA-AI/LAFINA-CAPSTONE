param(
    [ValidateSet('main', 'providers', 'both')][string]$Variant = 'both',
    [string]$JavaHome = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
)
# Offline assembly only. Installation is separate and never clears app data.
$ErrorActionPreference = 'Stop'
$checkout = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (!(Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))) {
    throw 'Supply -JavaHome pointing to an installed JDK 17.'
}
$env:JAVA_HOME = $JavaHome
$artifacts = Join-Path $checkout '.local/call-lafina-update'
New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
$variants = if ($Variant -eq 'both') { @('main', 'providers') } else { @($Variant) }
Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($item in $variants) {
    $properties = @('-p', (Join-Path $checkout 'android'), ':app:assembleDataQa',
        '-PreactNativeArchitectures=arm64-v8a', '-PlafinaDirectProviders=false', '--offline', '--no-daemon', '--console=plain', '--max-workers=2')
    if ($item -eq 'providers') {
        # Normal authenticated hosted backend; no direct keys and no localhost dependency.
        $properties += @('-PlafinaProviderTesting=true', '-PlafinaApiBaseUrl=https://lafina-backend.vercel.app')
    } else {
        $properties += @('-PlafinaProviderTesting=false', ':app:compileDebugKotlin', ':app:testDebugUnitTest')
    }
    $buildLog = Join-Path $artifacts "$item-build.log"
    $ErrorActionPreference = 'Continue'
    try {
        & (Join-Path $checkout 'android/gradlew.bat') @properties *> $buildLog
        $buildExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
    if ($buildExit -ne 0) { throw "Build failed: $buildLog" }
    $output = Join-Path $checkout 'android/app/build/outputs/apk/dataQa'
    $metadata = Get-Content -Raw -LiteralPath (Join-Path $output 'output-metadata.json') | ConvertFrom-Json
    $package = if ($item -eq 'main') { 'com.lafina.capstone' } else { 'com.lafina.capstone.providers' }
    if ($metadata.applicationId -ne $package) { throw 'APK package does not match the requested variant.' }
    $built = Join-Path $output 'app-arm64-v8a-dataQa.apk'
    $apk = Join-Path $artifacts "call-lafina-v2-$item-arm64.apk"
    Copy-Item -LiteralPath $built -Destination $apk
    $bundle = Join-Path $checkout 'android/app/build/generated/assets/react/dataQa/index.android.bundle'
    $bundleHash = (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant()
    $zip = [IO.Compression.ZipFile]::OpenRead($apk)
    try {
        $entry = $zip.GetEntry('assets/index.android.bundle')
        if ($null -eq $entry) { throw 'The APK has no offline JS bundle.' }
        $stream = $entry.Open()
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $packedHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose(); $stream.Dispose() }
    } finally { $zip.Dispose() }
    if ($packedHash -ne $bundleHash) { throw 'Packaged JavaScript does not match the built bundle.' }
    & python (Join-Path $PSScriptRoot 'audit-provider-test-apk.py') $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK credential audit failed.' }
    $receipt = @{
        package = $package; architecture = 'arm64-v8a'; apk = $apk
        apk_sha256 = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
        bundle_sha256 = $bundleHash; provider_keys_in_apk = $false
        backend = 'https://lafina-backend.vercel.app'; built_at_utc = [DateTime]::UtcNow.ToString('o')
    } | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $artifacts "$item-artifact.json"), $receipt, [Text.UTF8Encoding]::new($false))
    Write-Output "Verified $package APK: $apk"
}
