"""Fake-adb tests for scripts/emulator_qa.py: no emulator, device or APK install."""

import hashlib
import importlib.util
import json
import subprocess
import tempfile
import types
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('emulator_qa', Path(__file__).parents[1] / 'emulator_qa.py')
assert SPEC and SPEC.loader
QA = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(QA)


class FakeDevice:
    def __init__(self, qemu='1', avd='QA_AVD', abi='x86_64', installed=False, install='Success',
                 logs='', pid='4242', network_stays_on=False, hang=None):
        self.props = {'ro.kernel.qemu': qemu, 'ro.product.cpu.abi': abi}
        self.avd, self.installed, self.install = avd, installed, install
        self.logs, self.pid, self.network_stays_on, self.hang = logs, pid, network_stays_on, hang
        self.wifi = '1'
        self.commands = []

    def __call__(self, command, timeout):
        args = command[3:]
        self.commands.append(args)
        if self.hang and args[:len(self.hang)] == self.hang:
            raise subprocess.TimeoutExpired(command, timeout)
        out = ''
        if args[:2] == ['shell', 'getprop']:
            out = self.props.get(args[2], '')
        elif args[:3] == ['emu', 'avd', 'name']:
            out = f'{self.avd}\nOK'
        elif args[:3] == ['shell', 'pm', 'list']:
            out = f'package:{QA.PACKAGE}' if self.installed else ''
        elif args[:3] == ['shell', 'svc', 'wifi']:
            self.wifi = '1' if args[3] == 'enable' else '0'
        elif args[:2] == ['shell', 'dumpsys']:
            out = 'Active default network: 100' if self.network_stays_on else 'Active default network: none'
        elif args[:1] == ['install']:
            out = self.install
        elif args[:2] == ['shell', 'pidof']:
            out = self.pid
        elif args[:2] == ['logcat', '-d']:
            out = self.logs
        elif args[:3] == ['shell', 'settings', 'get']:
            out = self.wifi
        return types.SimpleNamespace(returncode=0, stdout=out)


class EmulatorQaTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        root = Path(self.dir.name)
        self.apk = root / 'app-x86_64-dataQa.apk'
        self.apk.write_bytes(b'synthetic apk')
        digest = hashlib.sha256(b'synthetic apk').hexdigest()
        self.receipt = root / 'receipt.json'
        self.receipt_data = {
            'artifactSha256': digest,
            'inventory': {'status': 'PASS', 'nativeAbis': ['x86_64']},
            'elf': {'status': 'PASS'},
            'zipAlignment': {'status': 'PASS'},
        }
        self.receipt.write_text(json.dumps(self.receipt_data))

    def tearDown(self):
        self.dir.cleanup()

    def args(self, **extra):
        values = {'designated_avd': 'QA_AVD', 'apk': str(self.apk), 'receipt': str(self.receipt), 'allow_update_existing': False}
        values.update(extra)
        return types.SimpleNamespace(**values)

    def execute(self, device, serial='emulator-5554', **extra):
        return QA.run(self.args(**extra), QA.Adb(serial, run=device), sleep=lambda _s: None)

    def test_physical_device_is_refused_before_any_command(self):
        device = FakeDevice()
        with self.assertRaises(QA.GateError):
            self.execute(device, serial='R58N12ABCDE')
        self.assertEqual(device.commands, [])

    def test_non_qemu_or_undesignated_avd_is_refused(self):
        for device in (FakeDevice(qemu='0'), FakeDevice(avd='Medium_Phone')):
            with self.assertRaises(QA.GateError):
                self.execute(device)
            self.assertFalse(any(cmd[:1] == ['install'] for cmd in device.commands))

    def test_receipt_mismatch_failed_check_or_wrong_abi_is_refused(self):
        for change in ({'artifactSha256': '0' * 64}, {'elf': {'status': 'FAIL'}}, {'inventory': {'status': 'PASS', 'nativeAbis': ['arm64-v8a']}}):
            self.receipt.write_text(json.dumps({**self.receipt_data, **change}))
            device = FakeDevice()
            with self.assertRaises(QA.GateError):
                self.execute(device)
            self.assertFalse(any(cmd[:1] == ['install'] for cmd in device.commands))

    def test_existing_install_needs_explicit_update_and_is_never_uninstalled(self):
        device = FakeDevice(installed=True)
        with self.assertRaises(QA.GateError):
            self.execute(device)
        report = self.execute(FakeDevice(installed=True), allow_update_existing=True)
        self.assertEqual(report['gates']['existingInstall'], 'UPDATE_IN_PLACE')
        everything = [' '.join(cmd) for cmd in device.commands]
        self.assertFalse(any('uninstall' in cmd or 'pm clear' in cmd for cmd in everything))

    def test_network_that_stays_on_fails_the_offline_gate_and_is_restored(self):
        device = FakeDevice(network_stays_on=True)
        original = QA.LAUNCH_WAIT_S
        QA.LAUNCH_WAIT_S = 0.01
        try:
            with self.assertRaises(QA.GateError):
                self.execute(device)
        finally:
            QA.LAUNCH_WAIT_S = original
        self.assertEqual(device.wifi, '1')
        self.assertFalse(any(cmd[:1] == ['install'] for cmd in device.commands))

    def test_passing_run_records_offline_launch_and_restores_network(self):
        device = FakeDevice()
        report = self.execute(device)
        self.assertEqual(report['result'], 'PASS')
        self.assertTrue(report['cleanup']['networkRestored'])
        self.assertFalse(report['cleanup']['dataCleared'])
        self.assertTrue(report['manual'])

    def test_crash_metro_dependency_or_dead_process_fail(self):
        for device in (FakeDevice(logs='FATAL EXCEPTION: main'), FakeDevice(logs='Could not connect to development server'), FakeDevice(pid='')):
            self.assertEqual(self.execute(device)['result'], 'FAIL')
            self.assertEqual(device.wifi, '1')

    def test_install_failure_and_hung_adb_are_bounded_failures(self):
        with self.assertRaises(QA.GateError):
            self.execute(FakeDevice(install='Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]'))
        with self.assertRaises(QA.GateError):
            self.execute(FakeDevice(hang=['shell', 'getprop', 'ro.kernel.qemu']))

    def test_reports_are_new_files_inside_evidence_only(self):
        root = Path(self.dir.name)
        evidence = root / 'docs' / 'plans' / 'agy-improvements' / 'reports' / 'evidence'
        evidence.mkdir(parents=True)
        QA.write_new({'result': 'NOT_RUN'}, evidence / 'qa.json', root)
        with self.assertRaises(FileExistsError):
            QA.write_new({}, evidence / 'qa.json', root)
        with self.assertRaises(QA.GateError):
            QA.write_new({}, root / 'outside.json', root)


if __name__ == '__main__':
    unittest.main()
