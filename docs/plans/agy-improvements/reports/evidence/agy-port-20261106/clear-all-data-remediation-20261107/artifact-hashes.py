"""Clear All Data remediation (P1/P2): sha256 + size of each APK and the prebuilt dataQa bundle, plus the
sha256 of assets/index.android.bundle read from inside each dataQa APK (zipfile, read-only).

Usage: python artifact-hashes.py <fresh output name> <header line>   (refuses to overwrite)
"""
import hashlib
import os
import sys
import zipfile

ROOT = r'C:\L3mxr\Github Repositories\LAFINA-CAPSTONE-agy-development-cont'
HERE = os.path.dirname(os.path.abspath(__file__))
FILES = [
    'android/app/build/outputs/apk/dataQa/app-arm64-v8a-dataQa.apk',
    'android/app/build/outputs/apk/dataQa/app-x86_64-dataQa.apk',
    'android/app/build/outputs/apk/debug/app-arm64-v8a-debug.apk',
    'android/app/build/outputs/apk/debug/app-x86_64-debug.apk',
    'android/app/build/generated/assets/react/dataQa/index.android.bundle',
]


def sha_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def main():
    if len(sys.argv) != 3:
        print('usage: artifact-hashes.py <fresh output name> <header line>')
        return 2
    out = os.path.join(HERE, sys.argv[1])
    if os.path.exists(out):
        print(f'refusing to overwrite {out}')
        return 2
    lines = [f'# {sys.argv[2]}', '# sha256  bytes  mtime(UTC)  path   (build outputs; not committed)']
    import datetime
    for rel in FILES:
        path = os.path.join(ROOT, rel)
        stamp = datetime.datetime.fromtimestamp(os.path.getmtime(path), datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        lines.append(f'{sha_file(path)}  {os.path.getsize(path)}  {stamp}  {rel}')
    lines.append('# packaged assets/index.android.bundle in each dataQa APK:')
    for rel in FILES[:2]:
        with zipfile.ZipFile(os.path.join(ROOT, rel)) as apk:
            data = apk.read('assets/index.android.bundle')
        lines.append(f'{hashlib.sha256(data).hexdigest()} {rel}')
    with open(out, 'x', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    return 0


if __name__ == '__main__':
    sys.exit(main())
