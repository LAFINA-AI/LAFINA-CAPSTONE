"""AGY-PORT 09 mutation checks: each mutation must make a named test fail.
Every file is restored byte-identical (sha256 checked) after each run."""
import hashlib, subprocess, sys

ROOT = r'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont'
# Run 3 (run 2: M1 survived; test strengthened). Run 1 (mutation-checks.log) matched no tests: Jest reads a backslash
# test path as a regex. Tests are now selected by file basename.
OUT = ROOT + r'\docs\plans\agy-improvements\reports\evidence\agy-port-20261106\phase-09\mutation-checks-3.log'
STORE = 'agyPort09HealthPreferencesStats'
UI = 'agyPort09ProfileHealth'

MUTATIONS = [
    ('M1', r'src\storage\reminderHealthStore.ts',
     "AND e.generation = j.generation AND e.origin = 'native'", "AND e.origin = 'native'",
     'inexact receipt of an older generation still counted', STORE, 'counts a time change'),
    ('M2', r'src\storage\reminderHealthStore.ts',
     'return owner === null ? !strict : owner === userId;', 'return true;',
     'owner fence removed', STORE, 'refuses a read for an owner'),
    ('M3', r'src\scheduler\reminderHealth.ts',
     'if (!reminderHealthStore.isActive(userId, true)) {\n      return {ok: false, message: UNAVAILABLE};',
     'if (!reminderHealthStore.isActive(userId)) {\n      return {ok: false, message: UNAVAILABLE};',
     'recovery allowed without a signed-in session', STORE, 'runs the existing reconciler only'),
    ('M4', r'src\storage\personalMemoryStore.ts',
     'if (before.revision !== expected) {', 'if (false) {',
     'revision check removed', STORE, 'saves only after review'),
    ('M5', r'src\storage\personalMemoryStore.ts',
     "'INSERT OR IGNORE INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)'",
     "'INSERT OR REPLACE INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)'",
     'guest link overwrites the account defaults', STORE, 'guest link keeps'),
    ('M6', r'src\storage\profileStatisticsStore.ts',
     "WHEN status = 'acknowledged' AND snooze_count = 0 THEN 1", "WHEN status = 'acknowledged' THEN 1",
     'snoozed acknowledgements counted as on time', STORE, 'counts actual records'),
    ('M7', r'src\storage\profileStatisticsStore.ts',
     'return {...UNAVAILABLE_STATISTICS};',
     'return {...UNAVAILABLE_STATISTICS, available: true, completedTasksCount: 0, notesCount: 0};',
     'read failure shown as zero', STORE, 'reports a read failure'),
    ('M8', r'src\ui\screens\calendar\hooks\useScheduleItemModal.ts',
     "    if (type === 'event') {\n      try {\n        offer = personalMemoryStore.offer(userId);",
     "    if (type === 'event' || type === 'task') {\n      try {\n        offer = personalMemoryStore.offer(userId);",
     'defaults offered on task drafts', UI, 'offers saved defaults on a new event draft'),
    ('M9', r'src\ui\screens\calendar\hooks\useScheduleItemModal.ts',
     'const value = personalMemoryStore.apply(memoryOffer, userId);',
     'const value = memoryOffer.value;',
     'stale offer applied without revalidation', UI, 'refuses a stale offer'),
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
        ran = summary is not None and 'No tests found' not in out
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
