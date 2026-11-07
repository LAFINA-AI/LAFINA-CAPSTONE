"""Final-audit remediation (F1-F3) mutation checks: each mutation must make a named test fail.

Usage: python mutate-final-audit.py <fresh log name>   (refuses to overwrite an existing log)
Every file is restored byte-identical (sha256 checked) after each run. A run
whose Jest summary is missing, says "No tests found" or ends in " 0 total" is a
HARNESS_ERROR, never a kill. Tests are selected by file basename and -t name.
Same rules as phase-12/mutate-phase12.py.
"""
import hashlib
import os
import subprocess
import sys

ROOT = r'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont'
HERE = os.path.dirname(os.path.abspath(__file__))
F1 = 'finalAuditF1PreviewAdmission'
F1UI = 'finalAuditF1OfflineVoicePending'
F2 = 'finalAuditF2Ducking'
F3 = 'finalAuditF3ClearAllDataFailure'
SP = r'src\ai\tts\speechPreferences.ts'

MUTATIONS = [
    ('Q1', r'src\ai\tts\ttsService.ts',
     '    if (admit && !admit()) {\n', '    if (false) {\n',
     'no admission check immediately before Tts.speak', F1, 'the last recording check'),
    ('Q2', SP,
     "  await applySpeechPreferences(userId);\n  refusal = admissionRefusal(ticket, true);\n  if (refusal) return refusal;\n",
     '  await applySpeechPreferences(userId);\n',
     'no revalidation after applying the voice choice', F1, 'configuration held pending'),
    ('Q3', SP,
     "  if (!speechSettingsStore.isActive(ticket.userId)) return 'owner_changed';\n  if (applied",
     '  if (applied',
     'admission ignores the active account', F1, 'account change'),
    ('Q4', SP,
     "  if (getActiveOfflineCaptureId() !== null) return 'microphone_busy';\n  if (meetingRecorder",
     '  if (meetingRecorder',
     'admission ignores dictation holding the microphone', F1, 'dictation taking the microphone'),
    ('Q5', r'src\ai\native\meetingRecorder.ts',
     '    recordingClaimed = true;\n', '',
     "the app's own recording start is not visible synchronously", F1, 'started from the app'),
    ('Q6', SP,
     "  if (ticket.cancelled) return 'cancelled';\n", '',
     'a cancelled ticket can still start', F1, 'Stop before any playback token'),
    ('Q7', r'src\ui\components\profile\OfflineVoice.tsx',
     '    if (pending) await pending.cancel();\n', '',
     'the sheet does not cancel a pending Preview on Stop/close/background/unmount', F1UI, 'pending, then'),
    ('Q8', r'src\ai\tts\ttsService.ts',
     "    await bounded(Tts.setDucking(true) as Promise<unknown>, TTS_SETTING_TIMEOUT_MS, 'Ducking');",
     '    await (Tts.setDucking(true) as Promise<unknown>);',
     'ducking is awaited without a bound', F2, 'never answers'),
    ('Q9', r'src\ui\screens\ProfileScreen.tsx',
     '            if (plannerCleared && chatCleared && defaultsCleared) {',
     '            if (plannerCleared && chatCleared) {',
     'a failed defaults reset is reported as a full deletion', F3, 'defaults kept'),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    if len(sys.argv) != 2:
        print('usage: mutate-final-audit.py <fresh log name>')
        return 2
    out = os.path.join(HERE, sys.argv[1])
    if os.path.exists(out):
        print(f'refusing to overwrite {out}')
        return 2
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
                f'npx jest --runInBand "{test}" -t "{name}"', cwd=ROOT, shell=True,
                capture_output=True, text=True, encoding='utf-8', errors='replace')
            output = proc.stdout + proc.stderr
            summary = next((l.strip() for l in output.splitlines() if l.strip().startswith('Tests:')), None)
            ran = summary is not None and 'No tests found' not in output and not summary.endswith(' 0 total')
            failed = ran and proc.returncode != 0 and ' failed' in summary
        finally:
            open(path, 'wb').write(original)
        restored = sha(open(path, 'rb').read()) == sha(original)
        verdict = 'KILLED' if failed else ('SURVIVED' if ran else 'HARNESS_ERROR')
        all_ok = all_ok and failed and restored
        lines.append(f'{mid} {verdict} | {rel} | {what} | test "{name}" | {summary} | restored={restored}')
    lines.append('RESULT ' + ('ALL KILLED, ALL RESTORED' if all_ok else 'CHECK FAILED'))
    with open(out, 'x', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    return 0 if all_ok else 1


if __name__ == '__main__':
    sys.exit(main())
