$ErrorActionPreference = 'Stop'
$checkout = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $checkout '.local/elevenlabs-backend-work/.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Backend Python venv missing. See docs/qa-provider-testing.md.' }
& $python (Join-Path $PSScriptRoot 'run-provider-test-server.py')
exit $LASTEXITCODE
