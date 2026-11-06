# Usage: powershell -NoProfile -File gradle-x.ps1 <absolute-log-path> <gradle args...>
# Runs Gradle from the X: alias of the SAME checkout (SDK ninja 1.10.2 hits MAX_PATH from the long
# checkout path) with Microsoft JDK 17 (Android Studio JBR 25 breaks AGP prefab through a stderr warning).
param([Parameter(Mandatory = $true)][string]$Log, [Parameter(ValueFromRemainingArguments = $true)][string[]]$GradleArgs)
if (-not (Test-Path 'X:\package.json')) { & subst X: 'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont' }
Set-Location 'X:\android'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$joined = $GradleArgs -join ' '
"$((Get-Date).ToUniversalTime().ToString('o')) cwd=X:\android (subst alias of the checkout) JDK17 cmd=.\gradlew.bat $joined" | Out-File -Encoding utf8 $Log
& cmd /c ".\gradlew.bat $joined >> `"$Log`" 2>&1"
$code = $LASTEXITCODE
"exit=$code" | Out-File -Append -Encoding utf8 $Log
exit $code
