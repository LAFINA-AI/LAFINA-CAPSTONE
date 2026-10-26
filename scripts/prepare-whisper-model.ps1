param(
  [Parameter(Mandatory=$true)][string]$ModelPath,
  [string]$Destination = (Join-Path $PSScriptRoot '../.local/phase06-whisper-assets')
)
$ErrorActionPreference = 'Stop'
# Deliberate build-time staging only. The app never downloads a voice/model.
$modelInfo = Get-Item -LiteralPath $ModelPath
$expectedHash = '818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7'
if ($modelInfo.Length -ne 32152673 -or
    (Get-FileHash -LiteralPath $modelInfo.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
  throw 'Model bytes do not match the reviewed pinned Tiny Q5_1 artifact.'
}
$assetDirectory = Join-Path $Destination 'stt'
New-Item -ItemType Directory -Path $assetDirectory -Force | Out-Null
$assetPath = Join-Path $assetDirectory 'ggml-tiny-q5_1.bin'
if (Test-Path -LiteralPath $assetPath) {
  if ((Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
    throw 'Existing staged model differs; inspect it before replacing.'
  }
} else {
  Copy-Item -LiteralPath $modelInfo.FullName -Destination $assetPath
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../docs/third-party/licenses/whisper-model-MIT.txt') -Destination (Join-Path $assetDirectory 'WHISPER-MODEL-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../docs/third-party/phase-06-model.json') -Destination (Join-Path $assetDirectory 'model-manifest.json')
Write-Output ('Verified optional model assets: ' + (Get-Item -LiteralPath $Destination).FullName)
Write-Output ('SHA256: ' + $expectedHash + '; bytes:32152673')
