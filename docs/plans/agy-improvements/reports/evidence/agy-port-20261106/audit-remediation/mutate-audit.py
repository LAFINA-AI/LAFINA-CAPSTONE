"""Codex audit A1-A4 mutation checks: each mutation must make a named test fail.

Usage: python mutate-audit.py <fresh log name>   (refuses to overwrite an existing log)
Every file is restored byte-identical (sha256 checked) after each run. A run
whose Jest summary is missing, says "No tests found" or ends in " 0 total" is a
HARNESS_ERROR, never a kill. Tests are selected by file basename and -t name.
"""
import hashlib
import os
import subprocess
import sys

ROOT = r'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont'
HERE = os.path.dirname(os.path.abspath(__file__))
A1 = 'auditA1OfflineEligibility'
A2 = 'auditA2CalendarReadErrors'
A3 = 'auditA3ClearAllData'
A4 = 'auditA4InterruptedReconcile'

MUTATIONS = [
    ('M1', r'src\ai\tts\ttsService.ts',
     '  voice.notInstalled === false &&\n', '  voice.notInstalled !== true &&\n',
     'automatic voice accepts missing install metadata', A1, 'only unknown or network voices'),
    ('M2', r'src\ai\tts\ttsService.ts',
     '  return offlineVoiceId !== null;\n};', '  return true;\n};',
     'initTts reports ready without a confirmed offline voice', A1, 'a failed voice list'),
    ('M3', r'src\ai\tts\ttsService.ts',
     '    return true;\n  }\n  offlineVoiceId = null;\n  return false;',
     '    return true;\n  }\n  offlineVoiceId = id;\n  return false;',
     'a failed voice selection is still trusted', A1, 'a failed voice selection'),
    ('M4', r'src\ai\tts\ttsService.ts',
     '    if (offlineVoiceId && !isListedOffline(voices, offlineVoiceId)) offlineVoiceId = null;\n', '',
     'a removed voice keeps being used', A1, 'with no explicit choice, a removed automatic voice'),
    ('M5', r'src\ai\tts\ttsService.ts',
     '      appliedCustom = false;\n      if (offlineVoiceId !== automaticVoiceId) offlineVoiceId = null;\n',
     '      appliedCustom = false;\n',
     'reset keeps the explicit voice instead of the automatic one', A1, 'reset returns to the automatic'),
    ('M6', r'src\ui\screens\calendar\hooks\useCalendarData.ts',
     "      markRead('schedule', { showingPrevious: own });\n", '',
     'a failed schedule read looks like an empty calendar', A2, 'a tasks-and-events-only failure'),
    ('M7', r'src\ui\screens\calendar\hooks\useCalendarData.ts',
     '      const own = previous?.ownerId === userId;\n      markRead(\'schedule\'',
     '      const own = previous !== null;\n      markRead(\'schedule\'',
     'a failed read after an account switch shows the previous account', A2, 'after an account switch'),
    ('M8', r'src\ui\screens\calendar\hooks\useCalendarData.ts',
     "      markRead('overdue', { showingPrevious: own });\n", '',
     'an overdue read failure is hidden', A2, 'an overdue-only failure'),
    ('M9', r'src\ui\screens\ProfileScreen.tsx',
     '              personalMemoryStore.clearForDataReset(userId);\n', '',
     'Clear All Data keeps saved event defaults', A3, 'the Profile action forgets'),
    ('M10', r'src\storage\personalMemoryStore.ts',
     '        revision: Math.max(revision, 0) + 1,', '        revision: Math.max(revision, 0),',
     'no revision fence: an earlier review can still save', A3, 'a review or offer issued before'),
    ('M11', r'src\storage\personalMemoryStore.ts',
     "    db.transactionSync(tx => {\n      assertActive(userId, tx);\n      const raw = tx.executeSync('SELECT value FROM local_settings WHERE user_id = ? AND key = ?', [\n        userId,",
     "    db.transactionSync(tx => {\n      const raw = tx.executeSync('SELECT value FROM local_settings WHERE user_id = ? AND key = ?', [\n        userId,",
     'a retained screen clears another session', A3, 'only the signed-in owner'),
    ('M12', r'src\scheduler\deliveryReconciler.ts',
     "      registrations = await boundedNative(\n        Promise.resolve(module.listDeliveryRegistrations()),\n        'Registration listing',\n      );",
     '      registrations = await module.listDeliveryRegistrations();',
     'a hung native listing blocks every later pass', A4, 'never answers'),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    if len(sys.argv) != 2:
        print('usage: mutate-audit.py <fresh log name>')
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
                f'npx jest "{test}" -t "{name}"', cwd=ROOT, shell=True,
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
