"""Clear-data audit C1 mutation check: applies one mutation at a time to the cleanup
implementation, runs the new suites plus the unchanged independent retry test, then
restores the file and verifies its sha256. Usage: python mutate-cleanup.py <fresh log name>
(refuses to overwrite). Exit 0 only if every mutation is killed and every file restored."""
import hashlib
import os
import subprocess
import sys

ROOT = r'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont'
HERE = os.path.dirname(os.path.abspath(__file__))
AUDIT = 'docs/plans/agy-improvements/reports/evidence/codex-clear-data-audit-8823b11-20261107'
CLEANUP = r'src\storage\attachmentCleanup.ts'
RESET = r'src\storage\accountDataReset.ts'
PROFILE = r'src\ui\screens\ProfileScreen.tsx'
GUEST = r'src\storage\guestMigration.ts'

MUTATIONS = [
    ('no-record', RESET, "        recordAttachmentCleanup(tx, userId, targets);\n", "        void recordAttachmentCleanup;\n"),
    ('retire-on-failure', CLEANUP, "    let gone = false;\n", "    let gone = true;\n"),
    ('no-directory-guard', CLEANUP, "  if (!info.isFile()) return false;\n", "  void info;\n"),
    ('no-path-validation', CLEANUP, "  if (!root.startsWith('/') || !path.startsWith(`${root}/`)) return null;\n", "  if (path.length > 0) return path;\n"),
    ('no-revalidation', CLEANUP, "    if (attachmentCleanupTarget(path) !== path) continue; // refused: kept, never touched\n", "\n"),
    ('ignore-session', CLEANUP, "    if (!stillCurrent()) {\n", "    if (!stillCurrent && false) {\n"),
    ('unbounded', CLEANUP, "    paths = pendingAttachmentCleanup(userId).slice(0, Math.max(0, limit));\n", "    paths = pendingAttachmentCleanup(userId);\n"),
    ('success-ignores-pending', PROFILE, "    const filesConfirmed = filesPending === 0 && refused === 0;\n", "    const filesConfirmed = refused === 0;\n"),
    ('success-ignores-refused', PROFILE, "    const filesConfirmed = filesPending === 0 && refused === 0;\n", "    const filesConfirmed = filesPending === 0;\n"),
    ('guest-not-moved', GUEST, "        [cloudUserId, GUEST_USER_ID],\n      );\n      tx.executeSync(`DELETE FROM ${ATTACHMENT_CLEANUP_TABLE} WHERE user_id = ?`, [GUEST_USER_ID]);\n",
     "        ['nobody', 'nobody'],\n      );\n"),
]

TESTS = ['__tests__/storage/attachmentCleanup.test.ts', '__tests__/ui/clearDataAttachmentCleanup.test.tsx']


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def jest(args):
    cmd = ['node', '--max-old-space-size=512', 'node_modules/jest/bin/jest.js', '--runInBand'] + args
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
            killed_all = False
            continue
        mutated = normalized.replace(old, new)
        try:
            open(path, 'wb').write((mutated.replace('\n', '\r\n') if crlf else mutated).encode('utf-8'))
            own = jest(TESTS)
            independent = jest(['--config', f'{AUDIT}/jest-audit.config.cjs', '--runTestsByPath', f'{AUDIT}/independentAttachmentRetry.test.tsx'])
        finally:
            open(path, 'wb').write(original)
        restored = sha(path) == before
        summary = [l for l in own.stderr.splitlines() if l.startswith('Tests:')]
        verdict = 'KILLED' if own.returncode != 0 else 'SURVIVED'
        killed_all = killed_all and own.returncode != 0 and restored
        lines.append(
            f'{name}: {verdict} new-suites exit={own.returncode} {summary[-1] if summary else ""}; '
            f'independent exit={independent.returncode}; restored={restored} sha256={before}'
        )
        print(lines[-1], flush=True)
    lines.append('ALL_KILLED_AND_RESTORED' if killed_all else 'CHECK FAILED')
    with open(out, 'x', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(lines) + '\n')
    print(lines[-1])
    return 0 if killed_all else 1


if __name__ == '__main__':
    sys.exit(main())
