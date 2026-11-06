"""Bounded, read-only audit of a built LAFINA-CAPSTONE APK (AGY-PORT 11).

Checks, each reported separately:

* inventory: one native ABI, bundled JavaScript, required offline models
  present, forbidden Kokoro assets absent, SHA-256 of every model asset;
* ELF: every lib/<abi>/*.so has a valid ELF32/64 header for its ABI, and
  every PT_LOAD segment is 16 KiB aligned and page-congruent;
* ZIP: independent of the SDK, every stored (uncompressed) .so starts on a
  16 KiB boundary and every other stored entry on a 4-byte boundary.

Nothing is extracted, executed or installed. Signing keys are never read;
certificate facts come from the SDK `apksigner` separately. Adapted from
LAFINA scripts/audit_apk_alignment.py (11698190) and inspect-apk.py
(95e4408a): Kokoro/SmolLM2 requirements removed, ZIP alignment added.
"""

import argparse
import hashlib
import json
import re
import struct
import zipfile
from datetime import datetime, timezone
from pathlib import Path

PAGE_SIZE = 16384
STORED_ALIGNMENT = 4
MAX_PREFIX = 1024 * 1024
MAX_LIBRARY = 512 * 1024 * 1024
MAX_ENTRIES = 20000
MAX_NATIVE = 512
MACHINES = {'arm64-v8a': (64, 183), 'x86_64': (64, 62), 'x86': (32, 3), 'armeabi-v7a': (32, 40)}
REQUIRED_MODELS = ('assets/models/ggml-base.en-q5_1.bin', 'assets/models/silero_vad.onnx')
FORBIDDEN = re.compile(r'(kokoro|af_bella|cmudict)', re.IGNORECASE)
LOCAL_HEADER = struct.Struct('<IHHHHHIIIHH')
LOCAL_SIGNATURE = 0x04034B50


def inspect_elf(data: bytes, file_size: int | None = None) -> dict[str, object]:
    """Validate ELF32/64 program headers and score 16 KiB load alignment."""
    length = len(data) if file_size is None else file_size
    if len(data) < 16 or data[:4] != b'\x7fELF':
        raise ValueError('Invalid ELF identification.')
    elf_class, encoding, version = data[4:7]
    if elf_class not in (1, 2) or encoding not in (1, 2) or version != 1:
        raise ValueError('Unsupported ELF class, byte order or version.')
    wide = elf_class == 2
    order = '<' if encoding == 1 else '>'
    header_size, entry_size = (64, 56) if wide else (52, 32)
    if len(data) < header_size or length < len(data):
        raise ValueError('Truncated ELF header or invalid declared size.')
    fields = struct.unpack_from(order + ('HHIQQQIHHHHHH' if wide else 'HHIIIIIHHHHHH'), data, 16)
    kind, machine, elf_version = fields[:3]
    program_offset, declared_header, declared_entry, count = fields[4], fields[7], fields[8], fields[9]
    if kind != 3 or elf_version != 1 or declared_header != header_size:
        raise ValueError('Expected a version-one shared-library ELF header.')
    table_end = program_offset + count * declared_entry
    if (declared_entry != entry_size or not 1 <= count <= 4096
            or program_offset < header_size or table_end > min(len(data), length, MAX_PREFIX)):
        raise ValueError('Invalid, extended or out-of-bounds program-header table.')
    loads: list[dict[str, object]] = []
    relro: list[int] = []
    for index in range(count):
        values = struct.unpack_from(order + ('IIQQQQQQ' if wide else 'IIIIIIII'),
                                    data, program_offset + index * entry_size)
        segment_type = values[0]
        offset, address, size, memory, alignment = (
            (values[2], values[3], values[5], values[6], values[7]) if wide else
            (values[1], values[2], values[4], values[5], values[7]))
        if offset > length or offset + size > length or (segment_type == 1 and size > memory):
            raise ValueError('Segment lies outside the library or exceeds memory size.')
        if segment_type == 0x6474E552:
            relro.append((address + memory) % PAGE_SIZE)
        if segment_type != 1:
            continue
        if alignment > 1 and (alignment & (alignment - 1) or address % alignment != offset % alignment):
            raise ValueError('Invalid PT_LOAD alignment or incongruent mapping.')
        loads.append({'offset': offset, 'virtualAddress': address, 'fileSize': size,
                      'memorySize': memory, 'alignment': alignment,
                      'pageCongruent': address % PAGE_SIZE == offset % PAGE_SIZE})
    if not loads:
        raise ValueError('No loadable segments were found.')
    accepted = all(row['alignment'] >= PAGE_SIZE and row['pageCongruent'] for row in loads)
    return {'status': 'PASS' if accepted else 'FAIL', 'elfClass': 64 if wide else 32,
            'machine': machine, 'byteOrder': 'little' if encoding == 1 else 'big',
            'loadSegments': loads, 'relroEndRemainders': relro}


def data_offset(stream, entry: zipfile.ZipInfo) -> int:
    """Absolute offset of an entry's data, read from its local file header."""
    stream.seek(entry.header_offset)
    header = stream.read(LOCAL_HEADER.size)
    if len(header) != LOCAL_HEADER.size:
        raise ValueError('Truncated local file header.')
    fields = LOCAL_HEADER.unpack(header)
    if fields[0] != LOCAL_SIGNATURE:
        raise ValueError('Bad local file header signature.')
    return entry.header_offset + LOCAL_HEADER.size + fields[9] + fields[10]


def zip_alignment(path: Path, entries: list[zipfile.ZipInfo]) -> dict[str, object]:
    """Stored .so at 16 KiB, other stored entries at 4 bytes; compressed entries need none."""
    failures: list[dict[str, object]] = []
    stored = 0
    with path.open('rb') as stream:
        for entry in entries:
            if entry.compress_type != zipfile.ZIP_STORED or entry.is_dir():
                continue
            stored += 1
            need = PAGE_SIZE if entry.filename.endswith('.so') else STORED_ALIGNMENT
            offset = data_offset(stream, entry)
            if offset % need:
                failures.append({'path': entry.filename, 'offset': offset, 'required': need})
    return {'status': 'PASS' if not failures else 'FAIL', 'storedEntries': stored,
            'failures': failures[:50], 'failureCount': len(failures)}


def sha256_entry(archive: zipfile.ZipFile, entry: zipfile.ZipInfo) -> str:
    digest = hashlib.sha256()
    with archive.open(entry) as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def audit_apk(path: Path) -> dict[str, object]:
    """Inspect one APK; every library and check keeps its own result."""
    if path.suffix.lower() != '.apk':
        raise ValueError('Choose an APK artifact.')
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if not entries or len(entries) > MAX_ENTRIES:
            raise ValueError('Missing or excessive ZIP entries.')
        names = [row.filename for row in entries]
        if len(names) != len(set(names)):
            raise ValueError('Duplicate ZIP entries.')
        native = [row for row in entries if row.filename.startswith('lib/') and row.filename.endswith('.so')]
        if not native or len(native) > MAX_NATIVE:
            raise ValueError('Missing or excessive native libraries.')
        libraries: list[dict[str, object]] = []
        for entry in sorted(native, key=lambda row: row.filename):
            match = re.fullmatch(r'lib/(arm64-v8a|x86_64|x86|armeabi-v7a)/[A-Za-z0-9_.+-]+\.so', entry.filename)
            if not match:
                raise ValueError('Unknown ABI or malformed native ZIP path.')
            abi = match.group(1)
            row: dict[str, object] = {'path': entry.filename, 'abi': abi, 'bytes': entry.file_size,
                                      'stored': entry.compress_type == zipfile.ZIP_STORED}
            try:
                if entry.file_size > MAX_LIBRARY or entry.flag_bits & 1:
                    raise ValueError('Oversized or encrypted native entry.')
                with archive.open(entry) as stream:
                    evidence = inspect_elf(stream.read(MAX_PREFIX), entry.file_size)
                if (evidence['elfClass'], evidence['machine']) != MACHINES[abi]:
                    raise ValueError('ELF architecture does not match its ABI directory.')
                row.update(evidence)
            except (ValueError, OSError, RuntimeError, zipfile.BadZipFile, struct.error):
                row.update({'status': 'ERROR', 'error': 'Invalid or unreadable native library.'})
            libraries.append(row)
        abis = sorted({row['abi'] for row in libraries})
        models = {row.filename: {'bytes': row.file_size, 'sha256': sha256_entry(archive, row)}
                  for row in entries if row.filename.startswith('assets/models/') and not row.is_dir()}
        forbidden = sorted(name for name in names if FORBIDDEN.search(name))
        missing = [name for name in REQUIRED_MODELS if name not in models]
        bundled = 'assets/index.android.bundle' in names
        inventory_ok = len(abis) == 1 and bundled and not missing and not forbidden
        zip_report = zip_alignment(path, entries)
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    elf_ok = all(row['status'] == 'PASS' for row in libraries)
    return {
        'version': 1,
        'recordedAtUtc': datetime.now(timezone.utc).isoformat(),
        'artifact': path.name,
        'artifactSha256': digest,
        'artifactBytes': path.stat().st_size,
        'inventory': {
            'status': 'PASS' if inventory_ok else 'FAIL',
            'nativeAbis': abis,
            'bundledJavaScript': bundled,
            'models': models,
            'missingRequiredModels': missing,
            'forbiddenKokoroEntries': forbidden,
            'nativeLibraryNames': sorted({str(row['path']).split('/')[-1] for row in libraries}),
        },
        'elf': {'status': 'PASS' if elf_ok else 'FAIL', 'pageSizeBytes': PAGE_SIZE,
                'passCount': sum(1 for row in libraries if row['status'] == 'PASS'),
                'libraryCount': len(libraries), 'libraries': libraries},
        'zipAlignment': zip_report,
        'limits': [
            'PT_LOAD and ZIP offsets only; not runtime, RELRO or physical-device certification.',
            'RELRO end remainders are observations for separate review, not a loader verdict.',
            'Signing certificate facts are recorded separately with SDK apksigner; keys are never read.',
        ],
    }


def write_report(report: dict[str, object], destination: Path, root: Path) -> None:
    """Write new evidence only inside the AGY-PORT evidence tree; never overwrite."""
    allowed = (root / 'docs' / 'plans' / 'agy-improvements' / 'reports' / 'evidence').resolve()
    resolved = destination.resolve()
    if resolved.suffix != '.json' or not resolved.is_relative_to(allowed):
        raise ValueError('Choose a fresh JSON path inside the AGY-PORT evidence folder.')
    with resolved.open('x', encoding='utf-8', newline='\n') as output:
        json.dump(report, output, indent=2)
        output.write('\n')


def main() -> int:
    """Exit 0: all checks pass; 1: completed with a failure (report kept); 2: no report."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('apk', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        report = audit_apk(args.apk)
        write_report(report, args.output, Path(__file__).resolve().parents[1])
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        parser.exit(2, f'Audit unavailable: {error}\n')
    summary = {key: report[key]['status'] for key in ('inventory', 'elf', 'zipAlignment')}  # type: ignore[index]
    print(json.dumps({'artifact': report['artifact'], **summary, 'report': str(args.output)}))
    return 0 if all(value == 'PASS' for value in summary.values()) else 1


if __name__ == '__main__':
    raise SystemExit(main())
