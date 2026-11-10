"""Validate this instruction pack before extraction/start, or structure after a run.

Uses only Python's standard library. Reads pack documents, never app data or secrets.
The manifest describes the delivered pack, so result files legitimately change later.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--structure-only", action="store_true", help="Skip delivered-file hashes after execution"
    )
    args = parser.parse_args()
    pack_root = Path(__file__).resolve().parents[4]
    plan = pack_root / "docs/plans/agy-improvements"
    errors: list[str] = []
    manifest_path = pack_root / "AGY-IMPROVEMENTS-MANIFEST.json"
    if not manifest_path.is_file():
        print(f"FAIL: missing {manifest_path.name}")
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = manifest["files"]
    seen: set[str] = set()
    for item in entries:
        name = item["path"]
        relative = PurePosixPath(name)
        if relative.is_absolute() or ".." in relative.parts or "\\" in name or ":" in name:
            errors.append(f"Unsafe manifest path: {name}")
            continue
        if name in seen:
            errors.append(f"Duplicate manifest path: {name}")
        seen.add(name)
        file = pack_root / name
        if not file.is_file():
            errors.append(f"Missing file: {name}")
        elif not args.structure_only:
            data = file.read_bytes()
            if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
                errors.append(f"Delivered content changed: {name}")

    specs = sorted((plan / "phases").glob("*.md"))
    expected = [f"{i:02d}" for i in range(14)]
    if [file.name[:2] for file in specs] != expected:
        errors.append("Expected exactly AGY-PORT phases 00 through 13")
    state = json.loads((plan / "reports/RUN-STATE.json").read_text(encoding="utf-8"))
    if state["model_requested"] != "claude-opus-5-5":
        errors.append("Requested model must be Claude Opus 5.5")
    if [phase["id"] for phase in state["phases"]] != [f"AGY-PORT-{i:02d}" for i in range(14)]:
        errors.append("State must cover every phase once, in order")
    index = {phase["id"]: i for i, phase in enumerate(state["phases"])}
    for phase in state["phases"]:
        if not (plan / phase["spec"]).is_file():
            errors.append(f"Missing phase specification: {phase['spec']}")
        for dependency in phase["depends_on"]:
            if dependency not in index or index[dependency] >= index[phase["id"]]:
                errors.append(f"Invalid prerequisite: {phase['id']} -> {dependency}")
    areas = re.findall(r"^\| (\d+) \|", (plan / "context/PORT-MATRIX.md").read_text(encoding="utf-8"), re.M)
    if areas != [str(i) for i in range(1, 31)]:
        errors.append("Port matrix must cover improvement areas 1–30 exactly once")
    contracts = (plan / "context/PRESERVATION-CONTRACT.md").read_text(encoding="utf-8")
    for i in range(1, 14):
        if not re.search(rf"^\| PF{i:02d} \|", contracts, re.M):
            errors.append(f"Missing protected contract PF{i:02d}")

    for file in (pack_root / name for name in sorted(seen) if name.endswith(".md")):
        if not file.is_file():
            continue
        text = file.read_text(encoding="utf-8-sig")
        for target in re.findall(r"\]\(([^)]+)\)", text):
            if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
                continue
            local = target.split("#", 1)[0]
            if local and not (file.parent / local).exists():
                errors.append(f"Broken local link in {file.relative_to(pack_root)}: {target}")

    if errors:
        print("FAIL\n" + "\n".join(f"- {error}" for error in errors))
        return 1
    print(f"PASS: {len(entries)} manifest files; 14 phases; 30 areas; 13 protected contracts; local links valid")
    print("This validates the instruction package, not application implementation or device acceptance.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
