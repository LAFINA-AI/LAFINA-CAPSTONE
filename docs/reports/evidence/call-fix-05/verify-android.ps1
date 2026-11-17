$ErrorActionPreference = 'Stop'
$checkout = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../..')).Path
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
if (!(Test-Path -LiteralPath $env:JAVA_HOME)) { throw 'Java 17 is unavailable' }
if (Test-Path -LiteralPath 'L:\') { throw 'L: is in use; no mapping was changed' }
& subst.exe L: $checkout
if ($LASTEXITCODE -ne 0) { throw 'Could not create short build path' }
try {
  Push-Location 'L:\android'
  try {
    & .\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDataQaAndroidTest :app:connectedDataQaAndroidTest --no-daemon --max-workers=2 --console=plain -PreactNativeArchitectures=x86_64 -PlafinaProviderTesting=true -PlafinaApiBaseUrl=https://lafina-backend.vercel.app --init-script 'L:/.local/provider-testing/reuse-app-bundle.init.gradle' *> (Join-Path $PSScriptRoot 'android-device-verification-online.log')
    $verificationExit = $LASTEXITCODE
  } finally { Pop-Location }
} finally { & subst.exe L: /d }
exit $verificationExit
