# Usage: powershell -NoProfile -File gradle-c.ps1 <absolute-log-path> <gradle args...>
# AGY-PORT 11: runs Gradle from the REAL checkout path (no subst alias) with Microsoft JDK 17.
# Used only for the JavaScript bundle task: Metro resolves node_modules through their real C: path,
# so bundling from the X: alias fails ("Failed to get the SHA-1", phase-11/gradle-assemble-dataqa-1.log).
# Native (CMake/ninja) work still runs through ../pre-advance-remediation/gradle-x.ps1 because of MAX_PATH.
param([Parameter(Mandatory = $true)][string]$Log, [Parameter(ValueFromRemainingArguments = $true)][string[]]$GradleArgs)
if (Test-Path $Log) { throw "Refusing to overwrite existing log: $Log" }
Set-Location 'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont\android'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$joined = $GradleArgs -join ' '
"$((Get-Date).ToUniversalTime().ToString('o')) cwd=C:\...\android (real checkout path) JDK17 cmd=.\gradlew.bat $joined" | Out-File -Encoding utf8 $Log
& cmd /c ".\gradlew.bat $joined >> `"$Log`" 2>&1"
$code = $LASTEXITCODE
"exit=$code" | Out-File -Append -Encoding utf8 $Log
exit $code
