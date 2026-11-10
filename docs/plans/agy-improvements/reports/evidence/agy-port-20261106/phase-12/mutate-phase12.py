"""AGY-PORT 12 mutation checks: each mutation must make a named test fail.

Usage: python mutate-phase12.py <fresh log name>   (refuses to overwrite an existing log)
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
EC = 'evaluationContracts'
SN = 'offlineNetworkSentinel'
QA = 'qaSqlChecks.test'

MUTATIONS = [
    ('P1', r'src\ai\nlu\intentRoutes.ts',
     '    spec.immediateInRingingCall &&\n', '',
     'every intent becomes immediate during a ringing call', EC, 'ring-reschedule'),
    ('P2', r'src\ai\nlu\intentRoutes.ts',
     "  query_schedule: {kind: 'read_only',", "  query_schedule: {kind: 'conversation',",
     'schedule questions stop routing to the read-only planner', EC, 'query-00'),
    ('P3', r'src\ai\tts\ttsService.ts',
     '  voice.networkConnectionRequired === false &&\n', '',
     'a network-only voice counts as offline', EC, 'network-required'),
    ('P4', r'src\storage\notesQueryStore.ts',
     r'text.replace(/[\\%_]/g,', r'text.replace(/[\\%]/g,',
     'an underscore in a search acts as a LIKE wildcard', EC, 'escapeLike'),
    ('P5', r'__tests__\evaluation\support\evaluationEvidence.ts',
     '  if (normalizedSha256(bytes) !== entry.sha256) {', '  if (false) {',
     'an edited frozen fixture is accepted', EC, 'an edited fixture'),
    ('P6', r'__tests__\evaluation\support\evaluationEvidence.ts',
     '  if (existsSync(destination)) {', '  if (false) {',
     'an existing evidence file may be overwritten', EC, 'an existing result'),
    ('P7', r'__tests__\preservation\agyPreservedContracts.test.ts',
     "  describe('PF11 acknowledgement semantics',", "  describe('PF11 ack semantics',",
     'a protected-contract test is renamed away', EC, 'PF11'),
    ('P8', r'src\ai\nlu\commandReview.ts',
     '  options: PrepareOptions = {},\n): PrepareResult => {\n',
     "  options: PrepareOptions = {},\n): PrepareResult => {\n  void globalThis.fetch?.('https://example.invalid/m');\n",
     'a local review path calls the network', SN, 'parse, review and confirm'),
    ('P9', r'src\storage\plannerQueries.ts',
     '    window(owner: string, start: string, end: string): PlannerWindow {\n',
     '    window(owner: string, start: string, end: string): PlannerWindow {\n      try { new (globalThis as any).XMLHttpRequest(); } catch {}\n',
     'a planner read opens a swallowed XHR', SN, 'planner window'),
    ('P10', r'__tests__\evaluation\support\qaSqlChecks.ts',
     "        report.cleanup = existsSync(directory) ? 'failed' : 'removed';",
     "        report.cleanup = 'removed';",
     'cleanup is claimed without checking', QA, 'unconfirmed cleanup'),
    ('P11', r'__tests__\evaluation\support\qaSqlChecks.ts',
     '    for (const connection of opened) {', '    for (const connection of [] as SqliteTestConnection[]) {',
     'a failed run leaves its handle open (Windows cannot remove the file)', QA, 'a failed statement'),
    ('P12', r'src\storage\notesQueryStore.ts',
     "    let where = 'n.user_id = ? AND n.deleted_at IS NULL';",
     "    let where = '(n.user_id = ? OR 1) AND n.deleted_at IS NULL';",
     'Notes pages include another account', QA, 'all checks pass'),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    if len(sys.argv) != 2:
        print('usage: mutate-phase12.py <fresh log name>')
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
