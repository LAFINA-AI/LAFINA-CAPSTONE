param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
# Reconstruct the frozen synthetic input; never replace its measurement metadata.
$phaseRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$phaseOutput=[IO.Path]::GetFullPath((Join-Path $phaseRoot $OutputDirectory))
$phaseAllowed=(Join-Path $phaseRoot '.local')+[IO.Path]::DirectorySeparatorChar
if(!$phaseOutput.StartsWith($phaseAllowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Use a new directory under .local for private generated audio.'}
if(Test-Path -LiteralPath $phaseOutput){throw 'Output directory exists. Preserve it and choose a new name.'}
$phaseExpectedPath=Join-Path $phaseRoot 'docs/benchmarks/phase-06-synthetic-audio.json'
$phaseExpected=Get-Content -Raw -LiteralPath $phaseExpectedPath|ConvertFrom-Json
$phaseText=Get-Content -Raw -LiteralPath (Join-Path $phaseRoot 'docs/benchmarks/phase-06-corpus.json')|ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$phaseSynth=[System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $phaseSynth.SelectVoice($phaseExpected.voice.name)
  $phaseFormat=[System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono)
  [IO.Directory]::CreateDirectory($phaseOutput)|Out-Null
  foreach($sample in $phaseText.samples){
    if($sample.id -notmatch '^[a-z]+$'){throw 'Unsafe corpus ID'}
    $phaseReference=$phaseExpected.samples|Where-Object{$_.id -eq $sample.id}|Select-Object -First 1
    if(!$phaseReference -or $phaseReference.reference -ne $sample.reference){throw 'Canonical corpus reference differs'}
    $phaseFile=Join-Path $phaseOutput ($sample.id+'.wav')
    $phaseSynth.SetOutputToWaveFile($phaseFile,$phaseFormat)
    $phaseSynth.Speak($sample.reference)
    $phaseSynth.SetOutputToNull()
    if((Get-Item -LiteralPath $phaseFile).Length -ne $phaseReference.bytes -or (Get-FileHash -Algorithm SHA256 -LiteralPath $phaseFile).Hash.ToLowerInvariant() -ne $phaseReference.sha256){throw 'This Windows voice produces different audio. Do not rewrite the frozen corpus; prepare a separately labelled reviewed cohort.'}
  }
  Copy-Item -LiteralPath $phaseExpectedPath -Destination (Join-Path $phaseOutput 'corpus-manifest.json')
  "Verified frozen six-clip corpus reconstructed at $phaseOutput; no microphone or cloud request."
} finally {$phaseSynth.Dispose()}
