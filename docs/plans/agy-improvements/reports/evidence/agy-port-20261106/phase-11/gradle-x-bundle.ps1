# Usage: powershell -NoProfile -File gradle-x-bundle.ps1 <absolute-log-path> <gradle args...>
# AGY-PORT 11: same as ../pre-advance-remediation/gradle-x.ps1 (X: subst alias for ninja MAX_PATH, JDK 17)
# plus NODE_OPTIONS=--preserve-symlinks for the build process only. Without it Node's require.resolve
# returns the real C: path of node_modules files, which Metro's X: file map does not contain
# ("Failed to get the SHA-1", gradle-assemble-dataqa-1.log). No project file is changed.
param([Parameter(Mandatory = $true)][string]$Log, [Parameter(ValueFromRemainingArguments = $true)][string[]]$GradleArgs)
if (Test-Path $Log) { throw "Refusing to overwrite existing log: $Log" }
if (-not (Test-Path 'X:\package.json')) { & subst X: 'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont' }
Set-Location 'X:\android'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:NODE_OPTIONS = '--preserve-symlinks'
$joined = $GradleArgs -join ' '
"$((Get-Date).ToUniversalTime().ToString('o')) cwd=X:\android (subst alias of the checkout) JDK17 NODE_OPTIONS=--preserve-symlinks cmd=.\gradlew.bat $joined" | Out-File -Encoding utf8 $Log
& cmd /c ".\gradlew.bat $joined >> `"$Log`" 2>&1"
$code = $LASTEXITCODE
"exit=$code" | Out-File -Append -Encoding utf8 $Log
exit $code
