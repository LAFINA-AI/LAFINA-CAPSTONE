"""Attachment-cleanup remediation (audit C1): counts strings that exist only in this fix (absent from
src at 8823b11), ASCII or UTF-16LE (Hermes stores some strings as UTF-16), inside each packaged
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
    'attachment_cleanup',
    'listed and tries again',
    " not point to this app's attachment storage, so ",
    'The sign-in changed before every file was removed',
    'could not confirm that every chat attachment file was removed',
    'Unreadable attachment cleanup count.',
    'Owner-bound chat attachment cleanup obligations',
]
# Present before this fix (P1/P2, F1): must still be packaged.
CONTROL = ['Not Cleared', 'Clear All Data left planner records behind.', 'Starting Preview']


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
    lines = ['# fix-only strings (absent from src at 8823b11) and controls (present before), ASCII + UTF-16LE, per packaged bundle']
    missing = 0
    for abi, rel in APKS.items():
        with zipfile.ZipFile(os.path.join(ROOT, rel)) as apk:
            data = apk.read('assets/index.android.bundle')
        for text in FIX_ONLY:
            n = count(data, text)
            missing += n == 0
            lines.append(f'{abi} fix-only {text!r} {n}')
        for text in CONTROL:
            lines.append(f'{abi} control {text!r} {count(data, text)}')
    lines.append(f'# fix-only strings missing: {missing}')
    with open(out, 'x', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
