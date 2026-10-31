#!/usr/bin/env python3
"""Inspect existing Phase 08 APKs without building, installing, networking or changing them.

The previous evidence manifest supplies the seven exact APK paths and expected package
identities. A new evidence file is created exclusively: historical evidence is never replaced.
Only Python's standard library and a local Android SDK aapt2 executable are used.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import zipfile


ALIGNMENT = 16_384
MODEL = "assets/stt/ggml-tiny-q5_1.bin"
MODEL_BYTES = 32_152_673
MODEL_SHA256 = "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7"
MODEL_LICENSE = "assets/stt/WHISPER-MODEL-LICENSE.txt"
MODEL_LICENSE_SHA256 = "b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d"
MODEL_MANIFEST = "assets/stt/model-manifest.json"
MODEL_MANIFEST_SHA256 = "687d956a58189eb341f896782943a455428cbd7f68bbba1f440cf508be161edc"
REVIEWED_NOTICES = (
    "assets/licenses/WHISPER-CPP-MIT.txt",
    "assets/licenses/REACT-NATIVE-SVG-NOTICES.txt",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def find_aapt2(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit).resolve()
        require(path.is_file(), "Explicit aapt2 executable does not exist")
        return path
    on_path = shutil.which("aapt2")
    if on_path:
        return Path(on_path).resolve()
    roots = [os.environ.get("ANDROID_SDK_ROOT"), os.environ.get("ANDROID_HOME")]
    if os.environ.get("LOCALAPPDATA"):
        roots.append(str(Path(os.environ["LOCALAPPDATA"]) / "Android" / "Sdk"))
    for root in filter(None, roots):
        tools = Path(root) / "build-tools"
        if tools.is_dir():
            for version in sorted(tools.iterdir(), reverse=True):
                candidate = version / ("aapt2.exe" if os.name == "nt" else "aapt2")
                if candidate.is_file():
                    return candidate.resolve()
    raise ValueError("Provide --aapt2 pointing to an existing local SDK executable")


def aapt_dump(aapt2: Path, kind: str, apk: Path) -> list[str]:
    result = subprocess.run(
        [str(aapt2), "dump", kind, str(apk)], check=True, capture_output=True,
        text=True, encoding="utf-8", timeout=30,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def identity_fields(line: str) -> dict[str, str]:
    return dict(re.findall(r"(name|versionCode|versionName)='([^']*)'", line))


def native_library(data: bytes, info: zipfile.ZipInfo, apk_stream) -> dict:
    require(data[:4] == b"\x7fELF", f"Not an ELF library: {info.filename}")
    require(len(data) >= 64 and data[4] == 2, f"Not ELF64: {info.filename}")
    require(data[5] in (1, 2), f"Unknown ELF byte order: {info.filename}")
    order = "<" if data[5] == 1 else ">"
    machine = struct.unpack_from(order + "H", data, 18)[0]
    expected_machine = {"arm64-v8a": 183, "x86_64": 62}.get(info.filename.split("/")[1])
    require(machine == expected_machine, f"ELF machine/ABI mismatch: {info.filename}")
    phoff = struct.unpack_from(order + "Q", data, 32)[0]
    phentsize, phnum = struct.unpack_from(order + "HH", data, 54)
    require(phentsize >= 56 and phnum > 0, f"Invalid ELF program headers: {info.filename}")
    require(phoff + phentsize * phnum <= len(data), f"Truncated ELF program headers: {info.filename}")
    alignments = []
    for index in range(phnum):
        offset = phoff + index * phentsize
        if struct.unpack_from(order + "I", data, offset)[0] == 1:  # PT_LOAD
            file_offset, virtual_address = struct.unpack_from(order + "QQ", data, offset + 8)
            alignment = struct.unpack_from(order + "Q", data, offset + 48)[0]
            require(alignment >= ALIGNMENT and alignment & (alignment - 1) == 0,
                    f"PT_LOAD alignment below 16 KiB or invalid: {info.filename}")
            require((file_offset - virtual_address) % alignment == 0,
                    f"PT_LOAD file/virtual addresses are incongruent: {info.filename}")
            alignments.append(alignment)
    require(bool(alignments), f"No PT_LOAD segments: {info.filename}")
    apk_stream.seek(info.header_offset)
    header = apk_stream.read(30)
    require(len(header) == 30 and header[:4] == b"PK\x03\x04", f"Invalid ZIP local header: {info.filename}")
    name_bytes, extra_bytes = struct.unpack_from("<HH", header, 26)
    payload_offset = info.header_offset + 30 + name_bytes + extra_bytes
    require(info.compress_type == zipfile.ZIP_STORED, f"Native library is compressed: {info.filename}")
    require(payload_offset % ALIGNMENT == 0, f"Native ZIP payload is not 16 KiB aligned: {info.filename}")
    return {
        "name": info.filename, "elfClass": 64, "elfMachine": machine,
        "loadAlignments": alignments, "minLoadAlignment": min(alignments),
        "loadAddressOffsetCongruent": True, "zipCompression": info.compress_type,
        "zipStored": True, "zipDataOffset": payload_offset, "zipAlignment16KiB": True,
    }


def inspect_apk(root: Path, prior: dict, aapt2: Path) -> dict:
    relative = Path(prior["path"])
    path = (root / relative).resolve()
    require(path.is_relative_to(root), "APK path must remain inside the checkout")
    before = path.stat()
    identity = next(line for line in aapt_dump(aapt2, "badging", path) if line.startswith("package:"))
    require(identity_fields(identity) == identity_fields(prior["identity"]), f"Package identity changed: {relative}")
    permissions = aapt_dump(aapt2, "permissions", path)
    internet = any("uses-permission:" in line and "name='android.permission.INTERNET'" in line
                   for line in permissions)
    test_apk = "androidTest" in relative.parts
    if "dataQa" in relative.parts or "release" in relative.parts:
        require(not internet, f"QA/release APK has INTERNET permission: {relative}")
    result = {
        "path": relative.as_posix(), "bytes": before.st_size, "sha256": sha256_file(path),
        "modifiedUtc": utc(before.st_mtime), "identity": identity, "permissions": permissions,
        "identityMatchesPrevious": True, "internetPermissionPresent": internet,
        "nativeLibraries": [], "modelSha256": None,
    }
    with zipfile.ZipFile(path) as archive, path.open("rb") as stream:
        names = archive.namelist()
        require(len(names) == len(set(names)), f"Duplicate ZIP member names: {relative}")
        libraries = [info for info in archive.infolist() if info.filename.endswith(".so")]
        for info in libraries:
            require(info.filename.startswith("lib/"), f"Unexpected native library location: {info.filename}")
            result["nativeLibraries"].append(native_library(archive.read(info), info, stream))
        model_names = [name for name in names if name.startswith("assets/stt/") and name.endswith(".bin")]
        if test_apk:
            require(not model_names and not libraries, "Test APK unexpectedly bundles a model/native library")
            result["modelAssetsAbsent"] = True
        else:
            require(bool(libraries), f"Application APK has no native libraries: {relative}")
            abi = "arm64-v8a" if "arm64-v8a" in relative.name else "x86_64"
            require(all(item.filename.startswith(f"lib/{abi}/") for item in libraries),
                    f"Application APK contains an unexpected ABI: {relative}")
            require(model_names == [MODEL], f"Unexpected or missing model assets: {relative}")
            model_info = archive.getinfo(MODEL)
            model_digest = hashlib.sha256(archive.read(MODEL)).hexdigest()
            require(model_info.file_size == MODEL_BYTES and model_digest == MODEL_SHA256,
                    f"Pinned model size/hash mismatch: {relative}")
            license_data = archive.read(MODEL_LICENSE)
            license_digest = hashlib.sha256(license_data).hexdigest()
            require(license_digest == MODEL_LICENSE_SHA256, f"Reviewed model license hash mismatch: {relative}")
            manifest_data = archive.read(MODEL_MANIFEST)
            manifest_digest = hashlib.sha256(manifest_data).hexdigest()
            require(manifest_digest == MODEL_MANIFEST_SHA256, f"Reviewed model manifest hash mismatch: {relative}")
            manifest = json.loads(manifest_data)
            require(manifest["bytes"] == MODEL_BYTES and manifest["sha256"] == MODEL_SHA256 and
                    "assets/" + manifest["asset"] == MODEL, f"Model manifest does not match payload: {relative}")
            notices = []
            for name in REVIEWED_NOTICES:
                notice = archive.read(name)
                require(bool(notice.strip()), f"Reviewed license/notice is empty: {name}")
                notices.append({"name": name, "bytes": len(notice), "sha256": hashlib.sha256(notice).hexdigest()})
            result.update({
                "modelAsset": MODEL, "modelBytes": model_info.file_size, "modelSha256": model_digest,
                "modelLicenseSha256": license_digest, "modelManifestSha256": manifest_digest,
                "reviewedLicenseNotices": notices,
            })
    after = path.stat()
    require((before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns),
            f"APK changed during inspection: {relative}")
    result["unchangedDuringInspection"] = True
    result["changedFromPreviousCohort"] = result["sha256"] != prior["sha256"]
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--previous", default="docs/reports/evidence/phase-08-artifacts-final.json")
    parser.add_argument("--output", default="docs/reports/evidence/phase-08-expansion-artifacts.json")
    parser.add_argument("--aapt2")
    args = parser.parse_args()
    root = args.root.resolve()
    previous = (root / args.previous).resolve()
    output = (root / args.output).resolve()
    require(previous.is_relative_to(root) and output.is_relative_to(root), "Evidence paths must stay inside the checkout")
    require(not output.exists() and output != previous, "Choose a new evidence path; existing evidence is never replaced")
    prior = json.loads(previous.read_text(encoding="utf-8"))
    require(len(prior["apks"]) == 7 and len({item["path"] for item in prior["apks"]}) == 7,
            "Previous cohort must contain exactly seven distinct APK paths")
    cohort_snapshot = {}
    for item in prior["apks"]:
        path = (root / item["path"]).resolve()
        require(path.is_relative_to(root), "APK path must remain inside the checkout")
        stat = path.stat()
        cohort_snapshot[item["path"]] = (stat.st_size, stat.st_mtime_ns)
    aapt2 = find_aapt2(args.aapt2)
    version = subprocess.run([str(aapt2), "version"], check=True, capture_output=True,
                             text=True, encoding="utf-8", timeout=10).stdout.strip()
    entries, errors = [], []
    for item in prior["apks"]:
        try:
            entries.append(inspect_apk(root, item, aapt2))
        except (OSError, ValueError, KeyError, StopIteration, subprocess.SubprocessError,
                zipfile.BadZipFile, struct.error) as failure:
            errors.append({"path": item["path"], "error": str(failure)})
    # Detect a rebuild of any earlier member while another APK was being inspected.
    for name, before in cohort_snapshot.items():
        try:
            after = (root / name).stat()
            require(before == (after.st_size, after.st_mtime_ns), "APK cohort changed during inspection")
        except (OSError, ValueError) as failure:
            errors.append({"path": name, "error": str(failure)})
    production = [item for item in entries if "androidTest" not in Path(item["path"]).parts]
    outcome = "PASS" if not errors and len(entries) == 7 and len(production) == 6 else "FAIL"
    report = {
        "createdUtc": datetime.now(timezone.utc).isoformat(), "outcome": outcome,
        "previousCohort": previous.relative_to(root).as_posix(),
        "verifier": "scripts/verify-phase08-apks.py", "aapt2Version": version,
        "apks": entries, "apkCount": len(entries), "productionApkCount": len(production),
        "nativeLibraryCount": sum(len(item["nativeLibraries"]) for item in entries),
        "verifiedModelSha256": MODEL_SHA256, "verifiedModelBytes": MODEL_BYTES,
        "allNativeLibrariesElf64And16KiBAligned": outcome == "PASS",
        "allSixApplicationApksHavePinnedModelAndReviewedNotices": outcome == "PASS",
        "qaAndReleaseHaveNoInternetPermission": outcome == "PASS",
        "changedFromPreviousCohort": [item["path"] for item in entries if item["changedFromPreviousCohort"]],
        "errors": errors,
        "commands": ["aapt2 dump badging <apk>", "aapt2 dump permissions <apk>"],
        "nativeInspection": "ELF64 PT_LOAD p_align and address/offset congruence parsed with struct; stored ZIP local-header payload offsets checked modulo 16384.",
        "scope": "Fresh read-only static inspection of seven current post-expansion APKs. Does not prove device delivery, microphone audibility, performance, release signing or upgrade compatibility. Historical evidence was not overwritten.",
    }
    with output.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")
    print(json.dumps({"outcome": outcome, "evidence": output.relative_to(root).as_posix(),
                      "apkCount": len(entries), "nativeLibraryCount": report["nativeLibraryCount"],
                      "productionModelCount": len(production), "errorCount": len(errors)}))
    return 0 if outcome == "PASS" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError) as failure:
        print(f"APK verification failed: {failure}", file=sys.stderr)
        sys.exit(2)
