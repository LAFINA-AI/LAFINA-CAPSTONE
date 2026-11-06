"""AGY-PORT 10 mutation checks: each mutation must make a named test fail.
Every file is restored byte-identical (sha256 checked) after each run."""
import hashlib, subprocess, sys

ROOT = r'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont'
# Phase 10 run 2. Run 1 (mutation-checks-1.log): M1 survived (no test voice was
# offline without an install flag; added), M11 left an orphan `else` so its
# suite ran 0 tests (now neutralized in place; a 0-test run is a harness error).
OUT = ROOT + r'\docs\plans\agy-improvements\reports\evidence\agy-port-20261106\phase-10\mutation-checks-2.log'
STORE = 'agyPort10Speech'
UI = 'agyPort10OfflineVoice'

MUTATIONS = [
    ('M1', r'src\ai\tts\ttsService.ts',
     '        voice.notInstalled === false &&\n', '        voice.notInstalled !== true &&\n',
     'voice with unknown install metadata treated as installed', STORE, 'lists only voices'),
    ('M2', r'src\ai\tts\ttsService.ts',
     '  if (!desired) {\n    if (!appliedCustom) {', '  if (!desired) {\n    if (false) {',
     'default install receives neutral rate/pitch calls', STORE, 'keeps AGY'),
    ('M3', r'src\ai\tts\ttsService.ts',
     'Tts.setDefaultRate(desired.rate, true)', 'Tts.setDefaultRate(desired.rate)',
     'rate sent through the wrapper 0..1 transform', STORE, 'applies an explicit choice'),
    ('M4', r'src\ai\tts\ttsService.ts',
     "await bounded(Tts.getInitStatus(), TTS_INIT_TIMEOUT_MS, 'Speech engine start');",
     'await Tts.getInitStatus();',
     'engine start unbounded', STORE, 'bounds a hung engine start'),
    ('M5', r'src\ai\tts\ttsService.ts',
     '      if (id !== null && ownId !== null && id !== ownId) return;\n', '',
     'late event of another utterance ends this one', STORE, 'a late event for another utterance'),
    ('M6', r'src\ai\tts\ttsService.ts',
     'if (!activeSpeech || activeSpeech.token !== token) return false;',
     'if (!activeSpeech) return false;',
     'Preview Stop stops another session', STORE, 'Stop with a Preview token'),
    ('M7', r'src\ai\tts\speechPreferences.ts',
     "  if (getActiveOfflineCaptureId() !== null) return 'microphone_busy';\n", '',
     'Preview allowed while the microphone is held', STORE, 'refuses while speech'),
    ('M8', r'src\ai\tts\speechPreferences.ts',
     'setTimeout(() => resolve(true), MEETING_CHECK_TIMEOUT_MS)',
     'setTimeout(() => resolve(false), MEETING_CHECK_TIMEOUT_MS)',
     'hung recording check treated as not recording', STORE, 'refuses while speech'),
    ('M9', r'src\storage\speechSettingsStore.ts',
     "'INSERT OR IGNORE INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)'",
     "'INSERT OR REPLACE INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)'",
     'guest link overwrites the account choice', STORE, 'guest link keeps'),
    ('M10', r'src\storage\speechSettingsStore.ts',
     '!validVoice(choice.voiceId) || !validFactor(choice.rate) ||',
     '!validVoice(choice.voiceId) ||',
     'out-of-range speed saved', STORE, 'defaults to no explicit choice'),
    ('M11', r'src\ui\components\profile\OfflineVoice.tsx',
     "if (state !== 'active') void stopPreview();", "if (state !== 'active') void 0;",
     'Preview keeps playing after leaving the app', UI, 'stops only its own Preview'),
]

def sha(data):
    return hashlib.sha256(data).hexdigest()

lines = []
all_ok = True
for mid, rel, old, new, what, test, name in MUTATIONS:
    path = ROOT + '\\' + rel
    original = open(path, 'rb').read()
    text = original.decode('utf-8')
    crlf = '\r\n' in text
    norm = text.replace('\r\n', '\n')
    if norm.count(old) != 1:
        lines.append(f'{mid} SETUP_ERROR: pattern not found once in {rel}')
        all_ok = False
        continue
    mutated = norm.replace(old, new)
    if crlf:
        mutated = mutated.replace('\n', '\r\n')
    try:
        open(path, 'wb').write(mutated.encode('utf-8'))
        proc = subprocess.run(
            f'npx jest "{test}" -t "{name}"', cwd=ROOT, shell=True,
            capture_output=True, text=True, encoding='utf-8', errors='replace')
        out = proc.stdout + proc.stderr
        summary = next((l.strip() for l in out.splitlines() if l.strip().startswith('Tests:')), None)
        ran = summary is not None and 'No tests found' not in out and not summary.endswith(' 0 total')
        failed = ran and proc.returncode != 0 and ' failed' in summary
    finally:
        open(path, 'wb').write(original)
    restored = sha(open(path, 'rb').read()) == sha(original)
    verdict = 'KILLED' if failed else ('SURVIVED' if ran else 'HARNESS_ERROR')
    all_ok = all_ok and failed and restored
    lines.append(f'{mid} {verdict} | {rel} | {what} | test "{name}" | {summary} | restored={restored}')

lines.append('RESULT ' + ('ALL KILLED, ALL RESTORED' if all_ok else 'CHECK FAILED'))
open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
sys.exit(0 if all_ok else 1)
