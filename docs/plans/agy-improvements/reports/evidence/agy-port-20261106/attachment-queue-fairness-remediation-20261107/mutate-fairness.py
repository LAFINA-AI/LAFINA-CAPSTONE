"""Attachment-cleanup audit C2 mutation check: applies one mutation at a time to the
fair-queue implementation, runs the cleanup suites plus the unchanged independent
queue-progress test, then restores the file and verifies its sha256.
Usage: python mutate-fairness.py <fresh log name> (refuses to overwrite).
Exit 0 only if every mutation is killed by the normal suites and every file restored."""
import hashlib
import os
import subprocess
import sys

ROOT = r'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont'
HERE = os.path.dirname(os.path.abspath(__file__))
AUDIT = 'docs/plans/agy-improvements/reports/evidence/codex-attachment-cleanup-audit-69aafcd-20261107'
CLEANUP = r'src\storage\attachmentCleanup.ts'
SCHEMA = r'src\storage\attachmentCleanupSchema.ts'
PROFILE = r'src\ui\screens\ProfileScreen.tsx'

MUTATIONS = [
    # The C2 defect itself: selection by the immutable recording order.
    ('immutable-order', CLEANUP,
     "const IN_TURN = `ORDER BY ${QUEUE} ASC, recorded_at ASC, path ASC`;\n",
     "const IN_TURN = `ORDER BY recorded_at ASC, path ASC`;\n"),
    # An attempt is counted but does not move the obligation back.
    ('attempt-keeps-place', CLEANUP,
     "SET attempts = attempts + 1, last_attempt_at = ?, ${QUEUE} = ${NEXT_TURN} WHERE",
     "SET attempts = attempts + 1, last_attempt_at = ?, ${QUEUE} = ${QUEUE} + 0 * length(?) WHERE"),
    # New obligations jump the queue instead of joining the back.
    ('new-at-front', CLEANUP,
     "(user_id, path, recorded_at, ${QUEUE}) VALUES (?, ?, ?, ${NEXT_TURN})",
     "(user_id, path, recorded_at, ${QUEUE}) VALUES (?, ?, ?, 0 * length(?))"),
    # Turn numbering shared across owners.
    ('owner-blind-turns', CLEANUP,
     "FROM ${ATTACHMENT_CLEANUP_TABLE} WHERE user_id = ?)`;\n",
     "FROM ${ATTACHMENT_CLEANUP_TABLE} WHERE ? IS NOT NULL)`;\n"),
    # Refused saved paths skip their bookkeeping (the C2 refused-row case).
    ('refused-not-scheduled', CLEANUP,
     "    let claimed = false;\n    try {\n      claimed = claimTurn(userId, path);\n",
     "    let claimed = false;\n    if (attachmentCleanupTarget(path) !== path) continue;\n    try {\n      claimed = claimTurn(userId, path);\n"),
    # Bookkeeping failure hidden.
    ('claim-failure-unreported', CLEANUP,
     "      unsaved += 1;\n      continue; // not attempted: no file work whose outcome could not be recorded\n",
     "      continue; // not attempted: no file work whose outcome could not be recorded\n"),
    # File work done although its attempt could not be saved.
    ('claim-failure-proceeds', CLEANUP,
     "      continue; // not attempted: no file work whose outcome could not be recorded\n",
     "      claimed = true;\n"),
    ('retire-failure-unreported', CLEANUP,
     "      console.warn('[AttachmentCleanup] A finished cleanup could not be retired:', error);\n      unsaved += 1;\n",
     "      console.warn('[AttachmentCleanup] A finished cleanup could not be retired:', error);\n"),
    # Ownership re-check of the claim dropped.
    ('claim-unchecked', CLEANUP, ").rowsAffected ?? 0) === 1;\n", ").rowsAffected ?? 0) >= 0;\n"),
    ('retire-uncounted-check', CLEANUP,
     "      if ((retired.rowsAffected ?? 0) > 0) removed += 1;\n", "      removed += 1;\n"),
    ('unbounded', CLEANUP, "${IN_TURN} LIMIT ?`,\n", "${IN_TURN} LIMIT -1 + 0 * ?`,\n"),
    ('overlapping-passes', CLEANUP,
     "  const previous = passInProgress.get(userId);\n",
     "  const previous: Promise<unknown> | undefined = undefined;\n"),
    ('no-backfill', SCHEMA,
     "  tx.executeSync(`UPDATE ${ATTACHMENT_CLEANUP_TABLE} SET ${ATTACHMENT_CLEANUP_QUEUE_COLUMN} = attempts`);\n", "\n"),
    ('unsaved-not-said', PROFILE, "        unsaved > 0\n          ? `This phone", "        unsaved < 0\n          ? `This phone"),
    ('ignore-session', CLEANUP, "    if (!stillCurrent()) {\n", "    if (!stillCurrent && false) {\n"),
]

TESTS = [
    '__tests__/storage/attachmentCleanupFairness.test.ts',
    '__tests__/storage/attachmentCleanup.test.ts',
    '__tests__/ui/clearDataAttachmentCleanup.test.tsx',
]


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def jest(args):
    cmd = ['node', '--max-old-space-size=768', 'node_modules/jest/bin/jest.js', '--runInBand'] + args
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    out = os.path.join(HERE, sys.argv[1])
    if os.path.exists(out):
        print(f'refusing to overwrite {out}')
        return 2
    lines = []
    killed_all = True
    for name, rel, old, new in MUTATIONS:
        path = os.path.join(ROOT, rel)
        original = open(path, 'rb').read()
        before = sha(path)
        text = original.decode('utf-8')
        crlf = '\r\n' in text
        normalized = text.replace('\r\n', '\n')
        if normalized.count(old) != 1:
            lines.append(f'{name}: NOT_APPLIED (anchor count {normalized.count(old)})')
            print(lines[-1], flush=True)
            killed_all = False
            continue
        mutated = normalized.replace(old, new)
        try:
            open(path, 'wb').write((mutated.replace('\n', '\r\n') if crlf else mutated).encode('utf-8'))
            own = jest(TESTS)
            independent = jest(['--config', f'{AUDIT}/jest-independent.config.cjs', '--runTestsByPath',
                                f'{AUDIT}/independentCleanupFairness.test.ts'])
        finally:
            open(path, 'wb').write(original)
        restored = sha(path) == before
        summary = [l for l in own.stderr.splitlines() if l.startswith('Tests:')]
        verdict = 'KILLED' if own.returncode != 0 else 'SURVIVED'
        killed_all = killed_all and own.returncode != 0 and restored
        lines.append(
            f'{name}: {verdict} suites exit={own.returncode} {summary[-1] if summary else ""}; '
            f'independent-fairness exit={independent.returncode}; restored={restored} sha256={before}'
        )
        print(lines[-1], flush=True)
    lines.append('ALL_KILLED_AND_RESTORED' if killed_all else 'CHECK FAILED')
    with open(out, 'x', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(lines) + '\n')
    print(lines[-1])
    return 0 if killed_all else 1


if __name__ == '__main__':
    sys.exit(main())
