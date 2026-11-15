#!/usr/bin/env python3
"""
Build the offline USTP Student Handbook SQLite-ready JSON pack from a verified PDF.

Usage examples:
  python scripts/build_handbook_pack.py --pdf path/to/ustp-handbook.pdf
  python scripts/build_handbook_pack.py --pdf path/to/ustp-handbook.pdf --sqlite-out .local/handbook.db
  python scripts/build_handbook_pack.py --url https://example.edu/ustp-handbook.pdf --dry-run

The output is written to src/handbook/ustpHandbookPack.json by default and indexed
into on-device SQLite FTS5 by LocalHandbookService.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO_ROOT / "src" / "handbook" / "ustpHandbookPack.json"

CHAPTER_RE = re.compile(
    r"^(?:CHAPTER|PART|RULE|TITLE)\s+(?:[IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE)\b(?:[:.\-\s]+.*)?$",
    re.IGNORECASE,
)
SECTION_RE = re.compile(
    r"^(?:Section|Sec\.?|Article|Art\.?)\s*\d+(?:\.\d+)*\b.*$|^APPENDIX\s+(?:[IVXLCDM]+|\d+)\b.*$|^\d+(?:\.\d+){1,3}\s+[A-Z].*$",
    re.IGNORECASE,
)
EDITION_FOOTER_RE = re.compile(
    r"^.*\bStudent Handbook(?:\s+\d{4}\s+Edition)?\s+([ivxlcdm]+|\d{1,4})\s*$",
    re.IGNORECASE,
)
PRINTED_PAGE_RE = re.compile(
    r"^(?:page\s+)?(\d{1,4})(?:\s+of\s+\d{1,4})?$|^[-–—]\s*(\d{1,4})\s*[-–—]$",
    re.IGNORECASE,
)
TOC_LEADER_RE = re.compile(r"\.{4,}\s*(?:[ivxlcdm]+|\d{1,4})?\s*$", re.IGNORECASE)

STOP_TERMS = {
    "the",
    "and",
    "for",
    "that",
    "with",
    "this",
    "from",
    "shall",
    "must",
    "student",
    "students",
    "university",
    "ustp",
    "section",
    "article",
    "chapter",
    "policy",
    "which",
    "their",
    "under",
    "within",
    "into",
    "upon",
    "may",
    "are",
    "not",
}


def load_pdfplumber():
    try:
        import pdfplumber  # type: ignore

        return pdfplumber
    except ImportError as exc:
        raise RuntimeError(
            "pdfplumber is required. Run this script with a Python environment "
            "containing pdfplumber (for example `.local/elevenlabs-backend-work/.venv/Scripts/python.exe`)."
        ) from exc


def normalize_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def looks_like_heading(line: str) -> bool:
    if len(line) < 4 or len(line) > 100 or line.endswith("."):
        return False
    if CHAPTER_RE.match(line):
        return True
    if re.match(r"^[A-Z0-9][A-Z0-9\s,&:/()'-]{4,}$", line):
        letters = sum(1 for ch in line if ch.isalpha())
        return letters >= 4
    return False


def detect_printed_page(lines: list[str], fallback_page: int) -> tuple[str, bool]:
    """Returns (page_label, is_front_matter_roman)."""
    candidates = lines[-2:] + lines[:2]
    for raw in reversed(candidates):
        cleaned = normalize_line(raw)
        ed_match = EDITION_FOOTER_RE.match(cleaned)
        if ed_match:
            token = ed_match.group(1)
            if token.isdigit():
                return f"p. {token}", False
            return f"p. {token.lower()}", True
        match = PRINTED_PAGE_RE.match(cleaned)
        if match:
            num = match.group(1) or match.group(2)
            if num:
                return f"p. {num}", False
    return f"p. {fallback_page}", False


def extract_pages_from_pdf(pdf_path: Path) -> list[tuple[int, str]]:
    pdfplumber = load_pdfplumber()
    pages: list[tuple[int, str]] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
            pages.append((index, text))
    return pages


def clean_page_lines(
    raw_pages: list[tuple[int, str]],
    footer_patterns: list[re.Pattern[str]],
    strip_generic_page_numbers: bool,
) -> list[tuple[int, str, list[str]]]:
    edge_counter: Counter[str] = Counter()
    split_pages: list[tuple[int, list[str]]] = []

    for page_no, raw_text in raw_pages:
        lines = [normalize_line(ln) for ln in raw_text.splitlines()]
        lines = [ln for ln in lines if ln]
        split_pages.append((page_no, lines))
        if lines:
            for edge in set(lines[:2] + lines[-2:]):
                edge_counter[edge.lower()] += 1

    repeat_threshold = max(3, int(len(raw_pages) * 0.25)) if len(raw_pages) >= 4 else 9999
    repeated_edges = {
        txt
        for txt, count in edge_counter.items()
        if count >= repeat_threshold and not CHAPTER_RE.match(txt) and not SECTION_RE.match(txt)
    }

    cleaned_pages: list[tuple[int, str, list[str]]] = []
    for page_no, lines in split_pages:
        page_label, is_roman_front_matter = detect_printed_page(lines, page_no)
        # Skip Table of Contents / Roman-numeral front-matter pages with dot leaders
        if is_roman_front_matter or any("TABLE OF CONTENTS" in ln.upper() for ln in lines[:3]):
            continue
        toc_lines = sum(1 for ln in lines if TOC_LEADER_RE.search(ln))
        if lines and toc_lines >= max(3, int(len(lines) * 0.35)):
            continue

        kept: list[str] = []
        total_lines = len(lines)
        for idx, line in enumerate(lines):
            low = line.lower()
            is_edge = idx < 2 or idx >= total_lines - 2
            if is_edge and EDITION_FOOTER_RE.match(line):
                continue
            if is_edge and low in repeated_edges:
                continue
            if any(pat.search(line) for pat in footer_patterns):
                continue
            if strip_generic_page_numbers and is_edge and PRINTED_PAGE_RE.match(line):
                continue
            if TOC_LEADER_RE.search(line):
                continue
            kept.append(line)
        if kept:
            cleaned_pages.append((page_no, page_label, kept))
    return cleaned_pages


def split_paragraphs_with_overlap(text: str, max_chars: int, overlap_chars: int) -> list[str]:
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    sentences = re.split(r"(?<=[.!?;:])\s+(?=[A-Z0-9(\[])", text)
    if len(sentences) <= 1:
        # Word-level hard wrap fallback
        words = text.split()
        parts: list[str] = []
        cur: list[str] = []
        cur_len = 0
        for w in words:
            if cur and cur_len + len(w) + 1 > max_chars:
                parts.append(" ".join(cur))
                keep = []
                keep_len = 0
                for prev_w in reversed(cur):
                    if keep_len + len(prev_w) + 1 > overlap_chars:
                        break
                    keep.insert(0, prev_w)
                    keep_len += len(prev_w) + 1
                cur = keep + [w]
                cur_len = sum(len(x) for x in cur) + max(0, len(cur) - 1)
            else:
                cur.append(w)
                cur_len += len(w) + (1 if cur_len else 0)
        if cur:
            parts.append(" ".join(cur))
        return parts

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) > max_chars:
            if current:
                chunks.append(" ".join(current))
                current = []
                current_len = 0
            chunks.extend(split_paragraphs_with_overlap(sentence, max_chars, overlap_chars))
            continue

        if current and current_len + len(sentence) + 1 > max_chars:
            chunks.append(" ".join(current))
            overlap: list[str] = []
            overlap_len = 0
            for prev in reversed(current):
                if overlap_len + len(prev) + 1 > overlap_chars:
                    break
                overlap.insert(0, prev)
                overlap_len += len(prev) + 1
            current = overlap + [sentence]
            current_len = sum(len(s) for s in current) + max(0, len(current) - 1)
        else:
            current.append(sentence)
            current_len += len(sentence) + (1 if current_len else 0)

    if current:
        chunks.append(" ".join(current))
    return chunks


def extract_keywords(chapter: str, section: str, content: str) -> str:
    combined = f"{chapter} {section} {content}"
    tokens = re.findall(r"[A-Za-z0-9]{2,}", combined)
    freq: Counter[str] = Counter()
    acronyms: list[str] = []
    seen_acronyms: set[str] = set()

    for tok in tokens:
        if tok.isupper() and 2 <= len(tok) <= 6 and tok not in {"AND", "THE", "FOR", "NOT"} and tok not in seen_acronyms:
            seen_acronyms.add(tok)
            acronyms.append(tok)
        low = tok.lower()
        if len(low) < 3 or low in STOP_TERMS or low.isdigit():
            continue
        freq[low] += 1

    top_terms = [term for term, _ in freq.most_common(12)]
    merged = acronyms[:6] + [t for t in top_terms if t.upper() not in seen_acronyms]
    return " ".join(merged[:14])


def build_chunks_from_pages(
    pages: list[tuple[int, str, list[str]]],
    source_label: str,
    max_chars: int,
    overlap_chars: int,
) -> list[dict]:
    sections: list[dict] = []
    current_chapter = "General Provisions"
    current_section = "Overview"
    current_page = pages[0][1] if pages else "p. 1"
    buffer: list[str] = []

    def flush_buffer() -> None:
        nonlocal buffer
        body = " ".join(buffer).strip()
        body = re.sub(r"\s+", " ", body)
        if len(body) >= 24:
            sections.append(
                {
                    "chapter": current_chapter,
                    "section": current_section,
                    "pageLabel": current_page,
                    "sourceLabel": source_label,
                    "body": body,
                }
            )
        buffer = []

    for _page_no, page_label, lines in pages:
        for line in lines:
            if CHAPTER_RE.match(line):
                flush_buffer()
                current_chapter = line[:140]
                current_section = line[:140]
                current_page = page_label
                continue
            if SECTION_RE.match(line):
                flush_buffer()
                current_section = line[:140]
                current_page = page_label
                continue
            if looks_like_heading(line):
                flush_buffer()
                words = line.split()
                if (
                    len(words) >= 2
                    and len(words) <= 6
                    and len(line) >= 12
                    and line.isupper()
                ):
                    current_chapter = line[:140]
                current_section = line[:140]
                current_page = page_label
                continue

            if not buffer:
                current_page = page_label
            buffer.append(line)

    flush_buffer()

    packed: list[dict] = []
    seq = 1
    for sec in sections:
        parts = split_paragraphs_with_overlap(sec["body"], max_chars, overlap_chars)
        for part_idx, text in enumerate(parts):
            raw_id = f"{sec['chapter']}|{sec['section']}|{sec['pageLabel']}|{part_idx}|{seq}"
            chunk_id = "ustp-" + hashlib.sha1(raw_id.encode("utf-8")).hexdigest()[:12]
            packed.append(
                {
                    "id": chunk_id,
                    "seq": seq,
                    "chapter": sec["chapter"],
                    "section": sec["section"],
                    "pageLabel": sec["pageLabel"],
                    "sourceLabel": sec["sourceLabel"],
                    "keywords": extract_keywords(sec["chapter"], sec["section"], text),
                    "content": text,
                }
            )
            seq += 1
    return packed


def build_pack_payload(
    chunks: list[dict],
    title: str,
    edition: str,
    source_label: str,
) -> dict:
    canonical = json.dumps(chunks, ensure_ascii=False, sort_keys=True)
    digest = hashlib.sha256(f"{title}|{edition}|{canonical}".encode("utf-8")).hexdigest()
    return {
        "version": 1,
        "title": title,
        "edition": edition,
        "sourceLabel": source_label,
        "sha256": digest,
        "chunkCount": len(chunks),
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "chunks": chunks,
    }


def write_sqlite_preview(db_path: Path, pack: dict) -> None:
    if db_path.exists():
        db_path.unlink()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS handbook_meta (
              id TEXT PRIMARY KEY NOT NULL CHECK (id = 'active'),
              title TEXT NOT NULL,
              edition TEXT NOT NULL,
              source_label TEXT NOT NULL,
              sha256 TEXT NOT NULL,
              chunk_count INTEGER NOT NULL DEFAULT 0,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS handbook_chunks (
              id TEXT PRIMARY KEY NOT NULL,
              seq INTEGER NOT NULL,
              chapter TEXT NOT NULL,
              section TEXT NOT NULL,
              page_label TEXT,
              source_label TEXT NOT NULL,
              keywords TEXT NOT NULL DEFAULT '',
              content TEXT NOT NULL,
              content_chars INTEGER NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS handbook_chunks_fts USING fts5(
              chapter,
              section,
              keywords,
              content,
              content='handbook_chunks',
              content_rowid='rowid',
              tokenize='porter unicode61 remove_diacritics 2'
            );
            CREATE TRIGGER IF NOT EXISTS trg_handbook_chunks_ai
            AFTER INSERT ON handbook_chunks BEGIN
              INSERT INTO handbook_chunks_fts(rowid, chapter, section, keywords, content)
              VALUES (new.rowid, new.chapter, new.section, new.keywords, new.content);
            END;
            """
        )
        conn.executemany(
            """
            INSERT INTO handbook_chunks (
              id, seq, chapter, section, page_label, source_label, keywords, content, content_chars
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    c["id"],
                    c["seq"],
                    c["chapter"],
                    c["section"],
                    c.get("pageLabel"),
                    c["sourceLabel"],
                    c.get("keywords", ""),
                    c["content"],
                    len(c["content"]),
                )
                for c in pack["chunks"]
            ],
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO handbook_meta (
              id, title, edition, source_label, sha256, chunk_count, updated_at
            ) VALUES ('active', ?, ?, ?, ?, ?, ?)
            """,
            (
                pack["title"],
                pack["edition"],
                pack["sourceLabel"],
                pack["sha256"],
                pack["chunkCount"],
                pack["generatedAt"],
            ),
        )
        conn.execute("INSERT INTO handbook_chunks_fts(handbook_chunks_fts) VALUES('optimize')")
        conn.commit()
    finally:
        conn.close()


def download_pdf(url: str) -> Path:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "LAFINA-Handbook-PackBuilder/1.0"},
    )
    tmp = tempfile.NamedTemporaryFile(prefix="ustp-handbook-", suffix=".pdf", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()
    with urllib.request.urlopen(req, timeout=60) as resp:
        tmp_path.write_bytes(resp.read())
    return tmp_path


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build offline USTP Student Handbook SQLite FTS5 JSON pack from a PDF."
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--pdf", type=Path, help="Path to local USTP Student Handbook PDF")
    source.add_argument("--url", type=str, help="HTTP/HTTPS URL to download PDF from")
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"Output JSON pack path (default: {DEFAULT_OUT})",
    )
    parser.add_argument(
        "--sqlite-out",
        type=Path,
        default=None,
        help="Optional SQLite DB file to verify FTS5 build on",
    )
    parser.add_argument("--title", default="USTP Student Handbook")
    parser.add_argument("--edition", default="Official USTP Student Handbook")
    parser.add_argument("--source-label", default="USTP Student Handbook")
    parser.add_argument(
        "--footer-regex",
        action="append",
        default=[],
        help="Regex of footer/header lines to strip (can be repeated)",
    )
    parser.add_argument(
        "--generic-page-numbers",
        action="store_true",
        help="Strip standalone edge lines matching page numbers",
    )
    parser.add_argument("--max-chars", type=int, default=1200)
    parser.add_argument("--overlap-chars", type=int, default=180)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args(list(argv) if argv is not None else None)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    temp_pdf: Optional[Path] = None
    try:
        if args.pdf is not None:
            pdf_path = args.pdf.resolve()
            if not pdf_path.is_file():
                print(f"ERROR: PDF file not found: {pdf_path}", file=sys.stderr)
                return 2
        else:
            print(f"Downloading PDF from {args.url} ...")
            temp_pdf = download_pdf(args.url)
            pdf_path = temp_pdf

        footer_patterns = [re.compile(pat, re.IGNORECASE) for pat in args.footer_regex]
        raw_pages = extract_pages_from_pdf(pdf_path)
        cleaned_pages = clean_page_lines(
            raw_pages,
            footer_patterns=footer_patterns,
            strip_generic_page_numbers=args.generic_page_numbers,
        )
        chunks = build_chunks_from_pages(
            cleaned_pages,
            source_label=args.source_label,
            max_chars=max(300, min(1600, args.max_chars)),
            overlap_chars=max(0, min(400, args.overlap_chars)),
        )
        pack = build_pack_payload(
            chunks,
            title=args.title,
            edition=args.edition,
            source_label=args.source_label,
        )

        print(
            f"Extracted {len(raw_pages)} pages -> {pack['chunkCount']} chunks "
            f"(sha256: {pack['sha256'][:12]}...)"
        )
        if pack["chunkCount"] == 0:
            print(
                "WARNING: 0 text chunks extracted. If the PDF is scanned images, run OCR first.",
                file=sys.stderr,
            )

        if args.dry_run:
            for sample in pack["chunks"][:3]:
                print(
                    f"  [{sample['seq']}] {sample['chapter']} / {sample['section']} "
                    f"({sample['pageLabel']}): {sample['content'][:110]}..."
                )
            return 0

        out_path: Path = args.out.resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote handbook pack: {out_path} ({os.path.getsize(out_path)} bytes)")

        if args.sqlite_out is not None:
            sqlite_out = args.sqlite_out.resolve()
            write_sqlite_preview(sqlite_out, pack)
            print(f"Verified FTS5 SQLite database: {sqlite_out}")

        return 0
    finally:
        if temp_pdf is not None and temp_pdf.exists():
            temp_pdf.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
