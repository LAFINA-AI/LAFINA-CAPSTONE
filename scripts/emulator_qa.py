"""Gated emulator smoke run for a standalone LAFINA-CAPSTONE QA APK (AGY-PORT 12).

Adapted in spirit from LAFINA scripts/emulator_qa.py (donor 0d4bbe39): donor
package IDs, Kokoro checks and data seeding are not used. Every gate must pass
before anything is installed:

* the serial is an emulator (emulator-NNNN, ro.kernel.qemu=1) whose AVD name
  equals --designated-avd (the owner designates it; physical devices refused);
* the APK hash equals an apk_audit.py receipt whose checks all PASS and whose
  single ABI matches the emulator;
* the package (com.lafina.capstone) is not already installed, unless
  --allow-update-existing is given for an in-place update test (the existing
  data is then kept; nothing is uninstalled or cleared, ever);
* network is switched off and confirmed off before launch (standalone, offline).

Automated checks are deliberately small: launch without Metro, the process
stays alive, no fatal exception, no "development server" error. Planner review
(Cancel/Confirm/untimed/delete), Chat pagination, Notes and the online,
document and meeting screens are listed as MANUAL steps in the report.
Cleanup restores network state and verifies it; uncertainty is a failure.
Every wait is bounded. Reports are new files only.
"""

import argparse
import hashlib
import json
import re
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

PACKAGE = 'com.lafina.capstone'
ACTIVITY = f'{PACKAGE}/.MainActivity'
COMMAND_TIMEOUT_S = 30
INSTALL_TIMEOUT_S = 240
LAUNCH_WAIT_S = 20
MANUAL_STEPS = [
    'Planner review: create from Chat, then Cancel; create again and Confirm; untimed item; delete with review',
    'Chat history: scroll to load older pages; no duplicate or missing messages',
    'Notes: create, edit, search, delete; revision conflict message on a stale edit',
    'Reminder call: schedule 2 minutes ahead, lock the screen, answer, snooze, acknowledge',
    'Online screens still reachable (sign-in, Student Pro gate, document and meeting screens) with network back on',
]


class GateError(Exception):
    """A precondition failed; nothing was installed."""


@dataclass
class Adb:
    serial: str
    adb: str = 'adb'
    run: object = None
    log: list = field(default_factory=list)

    def __post_init__(self):
        if self.run is None:
            self.run = lambda args, timeout: subprocess.run(
                args, capture_output=True, text=True, timeout=timeout, check=False)

    def __call__(self, *args, timeout=COMMAND_TIMEOUT_S):
        command = [self.adb, '-s', self.serial, *args]
        try:
            result = self.run(command, timeout)
        except subprocess.TimeoutExpired:
            self.log.append({'command': ' '.join(args[:3]), 'status': 'timeout'})
            raise GateError(f'adb {" ".join(args[:2])} did not answer within {timeout} s')
        self.log.append({'command': ' '.join(args[:3]), 'status': result.returncode})
        return result.returncode, (result.stdout or '').strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def check_emulator(adb: Adb, designated: str) -> str:
    if not re.fullmatch(r'emulator-\d{4,5}', adb.serial):
        raise GateError('Only an emulator serial (emulator-NNNN) is accepted; physical devices are refused.')
    _, qemu = adb('shell', 'getprop', 'ro.kernel.qemu')
    if qemu != '1':
        raise GateError('The target does not report ro.kernel.qemu=1; refusing.')
    _, name = adb('emu', 'avd', 'name')
    avd = name.splitlines()[0].strip() if name else ''
    if not designated or avd != designated:
        raise GateError('The emulator is not the designated AVD; refusing.')
    _, abi = adb('shell', 'getprop', 'ro.product.cpu.abi')
    return abi


def check_artifact(apk: Path, receipt_path: Path, device_abi: str) -> dict:
    receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
    actual = sha256_file(apk)
    if receipt.get('artifactSha256') != actual:
        raise GateError('APK hash does not match its audit receipt.')
    for check in ('inventory', 'elf', 'zipAlignment'):
        if receipt.get(check, {}).get('status') != 'PASS':
            raise GateError(f'Audit receipt {check} is not PASS.')
    abis = receipt['inventory'].get('nativeAbis', [])
    if abis != [device_abi]:
        raise GateError('APK ABI does not match the emulator ABI.')
    return {'apkSha256': actual, 'abi': device_abi}


def is_installed(adb: Adb) -> bool:
    _, out = adb('shell', 'pm', 'list', 'packages', PACKAGE)
    return f'package:{PACKAGE}' in out.splitlines()


def set_network(adb: Adb, enabled: bool) -> None:
    state = 'enable' if enabled else 'disable'
    adb('shell', 'svc', 'wifi', state)
    adb('shell', 'svc', 'data', state)


def network_off(adb: Adb, wait_s: float, sleep=time.sleep) -> bool:
    deadline = time.monotonic() + wait_s
    while time.monotonic() < deadline:
        _, out = adb('shell', 'dumpsys', 'connectivity')
        if not re.search(r'Active default network: \d+', out):
            return True
        sleep(1)
    return False


def run(args, adb: Adb, sleep=time.sleep) -> dict:
    report = {'version': 1, 'package': PACKAGE, 'gates': {}, 'automated': {}, 'manual': MANUAL_STEPS, 'cleanup': {}}
    abi = check_emulator(adb, args.designated_avd)
    report['gates']['emulator'] = 'PASS'
    report['gates']['artifact'] = check_artifact(Path(args.apk), Path(args.receipt), abi)
    existing = is_installed(adb)
    if existing and not args.allow_update_existing:
        raise GateError(f'{PACKAGE} is already installed; pass --allow-update-existing for an in-place update test.')
    report['gates']['existingInstall'] = 'UPDATE_IN_PLACE' if existing else 'NONE'
    set_network(adb, False)
    try:
        if not network_off(adb, LAUNCH_WAIT_S, sleep):
            raise GateError('Network did not turn off; standalone/offline gate not met.')
        report['gates']['offline'] = 'PASS'
        code, out = adb('install', '-r', args.apk, timeout=INSTALL_TIMEOUT_S)
        if code != 0 or 'Success' not in out:
            raise GateError('Install failed (an in-place update with another signature is refused by Android).')
        adb('logcat', '-c')
        adb('shell', 'am', 'start', '-W', '-n', ACTIVITY)
        sleep(LAUNCH_WAIT_S)
        _, pid = adb('shell', 'pidof', PACKAGE)
        _, logs = adb('logcat', '-d', '-t', '2000')
        report['automated'] = {
            'processAlive': bool(pid.strip()),
            'fatalException': 'FATAL EXCEPTION' in logs,
            'metroRequired': bool(re.search(r'development server|Unable to load script', logs)),
        }
    finally:
        set_network(adb, True)
        _, out = adb('shell', 'settings', 'get', 'global', 'wifi_on')
        report['cleanup'] = {'networkRestored': out.strip() == '1', 'packageLeftInstalled': True, 'dataCleared': False}
    ok = report['automated'].get('processAlive') and not report['automated'].get('fatalException') and not report['automated'].get('metroRequired')
    report['result'] = 'PASS' if ok and report['cleanup']['networkRestored'] else 'FAIL'
    return report


def write_new(report: dict, output: Path, root: Path) -> None:
    allowed = (root / 'docs' / 'plans' / 'agy-improvements' / 'reports' / 'evidence').resolve()
    resolved = output.resolve()
    if resolved.suffix != '.json' or not resolved.is_relative_to(allowed):
        raise GateError('Choose a fresh JSON path inside the AGY-PORT evidence folder.')
    with resolved.open('x', encoding='utf-8', newline='\n') as handle:
        json.dump(report, handle, indent=2)
        handle.write('\n')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--serial', required=True)
    parser.add_argument('--designated-avd', required=True)
    parser.add_argument('--apk', required=True)
    parser.add_argument('--receipt', required=True)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--adb', default='adb')
    parser.add_argument('--allow-update-existing', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.output.exists():
        parser.exit(2, 'Report exists; choose a new name.\n')
    adb = Adb(args.serial, args.adb)
    try:
        report = run(args, adb)
    except GateError as error:
        report = {'version': 1, 'result': 'NOT_RUN', 'reason': str(error), 'commands': adb.log}
    write_new(report, args.output, root)
    print(json.dumps({'result': report['result'], 'report': str(args.output)}))
    return 0 if report['result'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
