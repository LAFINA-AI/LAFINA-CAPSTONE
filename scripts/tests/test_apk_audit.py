"""Synthetic ELF/ZIP tests for scripts/apk_audit.py: no SDK, app data or native execution.

Adapted from LAFINA scripts/tests/test_apk_alignment.py (4b8c1813), plus
inventory, ZIP alignment, oversized and no-overwrite cases for AGY.
"""

import importlib.util
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('apk_audit', Path(__file__).parents[1] / 'apk_audit.py')
assert SPEC and SPEC.loader
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


def elf(bits: int = 64, order: str = '<', alignment: int = 16384,
        machine: int = 183, offset: int = 0, address: int = 0) -> bytes:
    """One small ELF with one PT_LOAD segment."""
    ident = b'\x7fELF' + bytes([2 if bits == 64 else 1, 1 if order == '<' else 2, 1]) + bytes(9)
    wide = bits == 64
    header_size, entry_size = (64, 56) if wide else (52, 32)
    header = struct.pack(order + ('HHIQQQIHHHHHH' if wide else 'HHIIIIIHHHHHH'),
                         3, machine, 1, 0, header_size, 0, 0, header_size, entry_size, 1, 0, 0, 0)
    values = (1, 5, offset, address, 0, 128, 256, alignment) if wide else (
        1, offset, address, 0, 128, 256, 5, alignment)
    segment = struct.pack(order + ('IIQQQQQQ' if wide else 'IIIIIIII'), *values)
    return (ident + header + segment).ljust(256, b'\0')


def write_apk(path: Path, entries: dict[str, bytes], stored_so: bool = False, pad: int = 0) -> None:
    """Write a synthetic APK; `pad` shifts stored data off alignment."""
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        if pad:
            archive.writestr(zipfile.ZipInfo('a' * pad), b'')
        for name, data in entries.items():
            info = zipfile.ZipInfo(name)
            info.compress_type = zipfile.ZIP_STORED if (stored_so and name.endswith('.so')) else zipfile.ZIP_DEFLATED
            archive.writestr(info, data)


GOOD = {
    'assets/index.android.bundle': b'bundle',
    'assets/models/ggml-base.en-q5_1.bin': b'whisper',
    'assets/models/silero_vad.onnx': b'vad',
    'lib/arm64-v8a/libgood.so': elf(),
}


class ElfTest(unittest.TestCase):
    def test_all_encodings(self) -> None:
        for bits in (32, 64):
            for order in ('<', '>'):
                self.assertEqual(AUDIT.inspect_elf(elf(bits, order))['status'], 'PASS')

    def test_four_kib_is_failure(self) -> None:
        result = AUDIT.inspect_elf(elf(alignment=4096))
        self.assertEqual(result['status'], 'FAIL')

    def test_malformed_and_truncated(self) -> None:
        for data in (b'', b'not ELF', elf()[:40], elf()[:80]):
            with self.assertRaises(ValueError):
                AUDIT.inspect_elf(data)
        for offset, value in ((4, 3), (5, 0), (6, 2)):
            data = bytearray(elf()); data[offset] = value
            with self.assertRaises(ValueError):
                AUDIT.inspect_elf(bytes(data))
        for data in (elf(alignment=24576), elf(address=4096)):
            with self.assertRaises(ValueError):
                AUDIT.inspect_elf(data)

    def test_header_and_segment_bounds(self) -> None:
        for offset, fmt, value in ((54, 'H', 1), (56, 'H', 65535), (32, 'Q', 4096),
                                   (64 + 32, 'Q', 257), (64 + 40, 'Q', 64)):
            data = bytearray(elf()); struct.pack_into('<' + fmt, data, offset, value)
            with self.assertRaises(ValueError):
                AUDIT.inspect_elf(bytes(data))

    def test_no_load_segment_is_not_success(self) -> None:
        data = bytearray(elf()); struct.pack_into('<I', data, 64, 0)
        with self.assertRaises(ValueError):
            AUDIT.inspect_elf(bytes(data))


class ApkTest(unittest.TestCase):
    def run_audit(self, entries: dict[str, bytes], **kwargs: object) -> dict[str, object]:
        with tempfile.TemporaryDirectory() as directory:
            apk = Path(directory) / 'synthetic.apk'
            write_apk(apk, entries, **kwargs)  # type: ignore[arg-type]
            return AUDIT.audit_apk(apk)

    def test_good_inventory(self) -> None:
        report = self.run_audit(GOOD)
        self.assertEqual(report['inventory']['status'], 'PASS')
        self.assertEqual(report['elf']['status'], 'PASS')
        self.assertEqual(len(report['inventory']['models']), 2)

    def test_kokoro_missing_model_missing_bundle_and_two_abis_fail(self) -> None:
        cases = [
            {**GOOD, 'assets/models/kokoro-v0_19.onnx': b'x'},
            {k: v for k, v in GOOD.items() if k != 'assets/models/silero_vad.onnx'},
            {k: v for k, v in GOOD.items() if k != 'assets/index.android.bundle'},
            {**GOOD, 'lib/x86_64/libgood.so': elf(machine=62)},
        ]
        for entries in cases:
            self.assertEqual(self.run_audit(entries)['inventory']['status'], 'FAIL')

    def test_every_library_reported_and_mismatch_is_error(self) -> None:
        report = self.run_audit({**GOOD,
                                 'lib/arm64-v8a/libold.so': elf(alignment=4096),
                                 'lib/arm64-v8a/libwrong.so': elf(machine=62),
                                 'lib/arm64-v8a/libbroken.so': b'bad'})
        self.assertEqual(report['elf']['status'], 'FAIL')
        self.assertEqual(sorted(row['status'] for row in report['elf']['libraries']),
                         ['ERROR', 'ERROR', 'FAIL', 'PASS'])

    def test_zip_alignment_independent_check(self) -> None:
        aligned = self.run_audit(GOOD)
        self.assertEqual(aligned['zipAlignment']['status'], 'PASS')
        self.assertEqual(aligned['zipAlignment']['storedEntries'], 0)
        stored = self.run_audit(GOOD, stored_so=True, pad=7)
        self.assertEqual(stored['zipAlignment']['status'], 'FAIL')
        required = {row['path']: row['required'] for row in stored['zipAlignment']['failures']}
        self.assertEqual(required['lib/arm64-v8a/libgood.so'], 16384)
        # The stored, empty pad entry is held to the 4-byte rule, not the page rule.
        self.assertEqual(required.get('a' * 7, 4), 4)

    def test_ambiguous_entries_fail_closed(self) -> None:
        for names in ([], ['lib/unknown/a.so']):
            with self.assertRaises(ValueError):
                self.run_audit({name: elf() for name in names})
        with tempfile.TemporaryDirectory() as directory:
            apk = Path(directory) / 'dup.apk'
            with zipfile.ZipFile(apk, 'w') as archive:
                archive.writestr('lib/arm64-v8a/a.so', elf())
                archive.writestr('lib/arm64-v8a/a.so', elf())
            with self.assertRaises(ValueError):
                AUDIT.audit_apk(apk)

    def test_oversized_library_is_error_without_reading_it(self) -> None:
        original = AUDIT.MAX_LIBRARY
        AUDIT.MAX_LIBRARY = 100
        try:
            report = self.run_audit(GOOD)
        finally:
            AUDIT.MAX_LIBRARY = original
        self.assertEqual(report['elf']['libraries'][0]['status'], 'ERROR')

    def test_not_an_apk_or_not_a_zip(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                AUDIT.audit_apk(Path(directory) / 'x.zip')
            bad = Path(directory) / 'bad.apk'
            bad.write_bytes(b'PK\x03\x04truncated')
            with self.assertRaises(zipfile.BadZipFile):
                AUDIT.audit_apk(bad)


class ReceiptTest(unittest.TestCase):
    def test_new_file_inside_evidence_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            evidence = root / 'docs' / 'plans' / 'agy-improvements' / 'reports' / 'evidence'
            evidence.mkdir(parents=True)
            output = evidence / 'new.json'
            AUDIT.write_report({'status': 'PASS'}, output, root)
            with self.assertRaises(FileExistsError):
                AUDIT.write_report({}, output, root)
            for path in (root / 'outside.json', evidence / '..' / 'outside.json', evidence / 'x.txt'):
                with self.assertRaises(ValueError):
                    AUDIT.write_report({}, path, root)


if __name__ == '__main__':
    unittest.main()
