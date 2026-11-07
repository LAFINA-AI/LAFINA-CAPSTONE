"""Attachment-queue fairness remediation (audit C2): counts strings that exist only in this fix (absent from
src at 69aafcd), ASCII or UTF-16LE (Hermes stores some strings as UTF-16), inside each packaged
dataQa assets/index.android.bundle (zipfile, read-only), plus control strings that existed before.

Usage: python bundle-markers.py <fresh output name>   (refuses to overwrite)
"""
import os
import sys
import zipfile

ROOT = r'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont'
HERE = os.path.dirname(os.path.abspath(__file__))
APKS = {
    'arm64-v8a': 'android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk',
    'x86_64': 'android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk',
}
FIX_ONLY = [
    'queue_order',
    'Fair, durable turn order for attachment cleanup obligations',
    'This phone could not save its cleanup progress for ',
    'listed for the next Clear All Data.',
    '[AttachmentCleanup] A cleanup attempt could not be saved:',
    '[AttachmentCleanup] A finished cleanup could not be retired:',
    ' ASC, recorded_at ASC, path ASC',
    'SET attempts = attempts + 1, last_attempt_at = ?, ',
]
# The C2 defect's selection order (present in src at 69aafcd only): must NOT be packaged.
REMOVED = ['ORDER BY recorded_at ASC, path ASC']
# Present before this fix (C1, P1/P2, F1): must still be packaged.
CONTROL = ['listed and tries again', 'Unreadable attachment cleanup count.', 'Not Cleared', 'Starting Preview']


def count(data, text):
    return data.count(text.encode('ascii')) + data.count(text.encode('utf-16-le'))


def main():
    if len(sys.argv) != 2:
        print('usage: bundle-markers.py <fresh output name>')
        return 2
    out = os.path.join(HERE, sys.argv[1])
    if os.path.exists(out):
        print(f'refusing to overwrite {out}')
        return 2
    lines = ['# fix-only strings (absent from src at 69aafcd), removed strings (must be absent) and controls (present before), ASCII + UTF-16LE, per packaged bundle']
    missing = 0
    for abi, rel in APKS.items():
        with zipfile.ZipFile(os.path.join(ROOT, rel)) as apk:
            data = apk.read('assets/index.android.bundle')
        for text in FIX_ONLY:
            n = count(data, text)
            missing += n == 0
            lines.append(f'{abi} fix-only {text!r} {n}')
        for text in REMOVED:
            n = count(data, text)
            missing += n != 0
            lines.append(f'{abi} removed {text!r} {n}')
        for text in CONTROL:
            n = count(data, text)
            missing += n == 0
            lines.append(f'{abi} control {text!r} {n}')
    lines.append(f'# failed marker checks (fix-only missing, removed present, control missing): {missing}')
    with open(out, 'x', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
