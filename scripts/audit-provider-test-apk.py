"""Confirm the two configured provider secrets do not occur in a test APK."""
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
keys = []
for line in (root / '.env').read_text(encoding='utf-8').splitlines():
    if '=' not in line or line.lstrip().startswith('#'):
        continue
    name, value = line.split('=', 1)
    if name.strip() in {'ELEVENLABS_API_KEY', 'DEEPSEEK_API_KEY'}:
        value = value.strip().strip('\"\'')
        if len(value) >= 12:
            keys.append(value.encode())
if len(keys) != 2:
    raise SystemExit('Cannot audit: both private provider keys must be configured.')
tail_size = max(map(len, keys)) - 1
with zipfile.ZipFile(sys.argv[1]) as archive:
    for entry in archive.infolist():
        with archive.open(entry) as stream:
            tail = b''
            while block := stream.read(1024 * 1024):
                data = tail + block
                if any(key in data for key in keys):
                    raise SystemExit('FAIL: a provider key was found in the APK; do not share it.')
                tail = data[-tail_size:]
print('PASS: configured provider keys are absent from all APK entries.')
