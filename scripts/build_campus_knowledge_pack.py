#!/usr/bin/env python3
"""
Build the offline USTP Cagayan de Oro knowledge pack from the LAFINA USTP CDO
Knowledge Pack (Markdown + metadata) into the same chunk format as the
USTP Student Handbook pack, so both are searched by one on-device FTS5 index.

Usage:
  python scripts/build_campus_knowledge_pack.py
  python scripts/build_campus_knowledge_pack.py --pack-dir knowledge/ustp-cdo/2026-11-24 --check

Contract (from the pack's AGENT_INTEGRATION.md):
- Only knowledge/*.md is indexed. metadata/*.json supplies provenance
  (sources, conflicts, manifest hashes); the reference PDF is never indexed.
- Every file must match the manifest SHA-256, so a hand-edited source is
  caught instead of silently shipped.
- Chunks follow H1/H2/H3 headings. A table row (a date and its event label)
  is never split, and undergraduate and graduate rows live in different
  documents, so they never share a chunk.
- Output is deterministic: the same input gives a byte-identical file
  (`generatedAt` is the pack's as-of date, ids are content hashes), so a
  re-import never duplicates chunks.

No third-party dependencies.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Iterable, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PACK_DIR = REPO_ROOT / "knowledge" / "ustp-cdo" / "2026-11-24"
DEFAULT_OUT = REPO_ROOT / "src" / "handbook" / "ustpCdoKnowledgePack.json"

COLLECTION = "ustp_cdo"
MAX_CHARS = 900

MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]

ISO_RANGE_RE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\s+to\s+(\d{4})-(\d{2})-(\d{2})\b")
ISO_DATE_RE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
MD_LINK_RE = re.compile(r"\[([^\]\n]+)\]\((https?://[^)\s]+)\)")
BARE_URL_RE = re.compile(r"https?://[^\s)\]>;,]+")
AY_RE = re.compile(r"\bAY\s*(20\d{2})\s*[-–]\s*(20\d{2})\b", re.IGNORECASE)
PDF_PAGES_RE = re.compile(
    r"\bPDF\s+(?:p\.|pp\.|page|pages)\s*(\d{1,2}(?:\s*(?:,|-|–|and)\s*\d{1,2})*)",
    re.IGNORECASE,
)
HEADING_RE = re.compile(r"^(#{1,3})\s+(.+?)\s*$")
VERIFY_RE = re.compile(r"\*{0,2}\[VERIFY\]\*{0,2}")

# Student-facing wording of the known source conflicts, grounded in
# knowledge/14_source_conflicts_and_refresh_rules.md and metadata/conflicts.json.
# Each rule names the documents (by file prefix) and the text it applies to.
# C8 (older AY 2025-2026 pages) is enforced by the search itself: calendar
# chunks carry their academic year and a question about another year is
# refused instead of answered with these dates.
CONFLICT_RULES: list[dict] = [
    {
        "id": "C1",
        "files": ("01_", "13_"),
        # "without midyear classes" (early enrollment) is not about the start.
        "pattern": re.compile(r"\bmidyear\b(?!\s+classes)", re.IGNORECASE),
        "text": (
            "The AY 2026-2027 calendar prints two different undergraduate midyear "
            "start dates: June 9, 2027 (term summary, PDF p. 2) and June 5, 2027 "
            "(detailed schedule, PDF p. 5). Confirm with the USTP CDO Registrar "
            "before planning around either date."
        ),
    },
    {
        "id": "C2",
        "files": ("03_",),
        "pattern": re.compile(r"transferee", re.IGNORECASE),
        "text": (
            "PDF p. 5 labels the May 10, 2027 transferee and second-courser "
            "application as \"1st Semester AY 2026-2027\", which does not match "
            "its 2027 placement. It is quoted as printed; check with the "
            "Admission and Scholarship Office."
        ),
    },
    {
        "id": "C3",
        "files": ("02_",),
        "pattern": re.compile(r"midyear", re.IGNORECASE),
        "text": (
            "The graduate midyear schedule (PDF p. 6) gives June 5, 2027 as both "
            "the start of classes and the first day of the June 5-11 enrollment "
            "period. Ask the Graduate School or Registrar about your program."
        ),
    },
    {
        "id": "C4",
        "files": ("02_",),
        "pattern": re.compile(r"term summary", re.IGNORECASE),
        "text": (
            "The term summary on PDF p. 2 is labelled undergraduate; the calendar "
            "does not give a separate graduate term summary."
        ),
    },
    {
        "id": "C5",
        "files": ("04_", "06_"),
        "pattern": re.compile(r"85[67]-1738"),
        "text": (
            "Official USTP pages show two main campus numbers, (088) 857-1738 and "
            "(088) 856-1738. Confirm with the switchboard when calling."
        ),
    },
    {
        "id": "C6",
        "files": ("06_", "12_"),
        "pattern": re.compile(r"extension", re.IGNORECASE),
        "text": (
            "Office extensions appear in short (for example 154) and long (for "
            "example 1154) forms on different official pages; confirm with the "
            "switchboard."
        ),
    },
    {
        "id": "C7",
        "files": ("10_",),
        "pattern": re.compile(r"organi[sz]ation|council|society|club|guild|publication", re.IGNORECASE),
        "text": (
            "This organization list comes from the 2021 Virtual Week of Welcome "
            "directory. It is historical and does not confirm current activity, "
            "membership or officers."
        ),
    },
    {
        "id": "C9",
        "files": ("01_",),
        "pattern": re.compile(r"Eid al-Fitr", re.IGNORECASE),
        "text": (
            "Eid al-Fitr is marked March 9, 2027 in the calendar; the actual "
            "holiday depends on the official proclamation."
        ),
    },
]

# Phrases that point at a registered source when a chunk has no explicit URL.
# A match only counts when the document itself lists that source.
SOURCE_ALIASES: dict[str, re.Pattern[str]] = {
    "CAL": re.compile(r"\bPDF\b|\bcalendar\b", re.IGNORECASE),
    "LIB": re.compile(r"library", re.IGNORECASE),
    "LIB_SVC": re.compile(r"library services|AVR|audio-visual|borrow|overdue|OPAC", re.IGNORECASE),
    "CONTACT": re.compile(r"contacts? page|main line|extension|local \d", re.IGNORECASE),
    "ENROLL": re.compile(r"enrol", re.IGNORECASE),
    "ADMISSIONS": re.compile(r"admission|RA 10931|tuition", re.IGNORECASE),
    "UG_PROG": re.compile(r"program list|undergraduate program", re.IGNORECASE),
    "GR_PROG": re.compile(r"graduate program", re.IGNORECASE),
    "ASO": re.compile(r"\bASO\b|Admission and Scholarship", re.IGNORECASE),
    "OFFICIALS": re.compile(r"officials directory|directory", re.IGNORECASE),
    "CAMPUS": re.compile(r"campus", re.IGNORECASE),
}

STOP_TERMS = {
    "the", "and", "for", "that", "with", "this", "from", "not", "are", "may",
    "ustp", "cdo", "official", "page", "pdf", "source", "sources", "listed",
    "list", "student", "students", "university", "calendar", "does", "into",
    "per", "all", "any", "its", "their", "which", "verify", "needs",
    "https", "http", "www", "edu",
}


def normalized_bytes(path: Path) -> bytes:
    """File bytes with CRLF folded to LF, so a Windows checkout hashes the same."""
    return path.read_bytes().replace(b"\r\n", b"\n")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def human_date(y: str, m: str, d: str) -> str:
    return f"{MONTHS[int(m) - 1]} {int(d)}, {int(y)}"


def human_range(y1: str, m1: str, d1: str, y2: str, m2: str, d2: str) -> str:
    if (y1, m1, d1) == (y2, m2, d2):
        return human_date(y1, m1, d1)
    if y1 == y2 and m1 == m2:
        return f"{MONTHS[int(m1) - 1]} {int(d1)}-{int(d2)}, {int(y1)}"
    if y1 == y2:
        return f"{MONTHS[int(m1) - 1]} {int(d1)} - {MONTHS[int(m2) - 1]} {int(d2)}, {int(y1)}"
    return f"{human_date(y1, m1, d1)} - {human_date(y2, m2, d2)}"


def humanize_dates(text: str) -> str:
    """ISO dates become 'March 15-20, 2027' so answers read naturally and
    month-name questions match. Validated so a malformed date fails loudly."""

    def check(y: str, m: str, d: str) -> None:
        date(int(y), int(m), int(d))

    def repl_range(match: re.Match[str]) -> str:
        y1, m1, d1, y2, m2, d2 = match.groups()
        check(y1, m1, d1)
        check(y2, m2, d2)
        return human_range(y1, m1, d1, y2, m2, d2)

    def repl_date(match: re.Match[str]) -> str:
        y, m, d = match.groups()
        check(y, m, d)
        return human_date(y, m, d)

    text = ISO_RANGE_RE.sub(repl_range, text)
    return ISO_DATE_RE.sub(repl_date, text)


def parse_frontmatter(text: str) -> tuple[dict, str]:
    text = text.replace("\r\n", "\n")
    if not text.startswith("---\n"):
        raise ValueError("missing YAML frontmatter")
    end = text.index("\n---\n", 4)
    meta: dict = {}
    for line in text[4:end].splitlines():
        if not line.strip():
            continue
        key, _, raw = line.partition(":")
        raw = raw.strip()
        if raw.startswith("["):
            meta[key.strip()] = json.loads(raw)
        elif raw.startswith('"') and raw.endswith('"'):
            meta[key.strip()] = json.loads(raw)
        else:
            meta[key.strip()] = raw
    return meta, text[end + 5 :]


def strip_inline_markup(text: str) -> str:
    text = VERIFY_RE.sub("(needs confirmation)", text)
    text = text.replace("**", "")
    return re.sub(r"\s+", " ", text).strip()


def replace_links(text: str, registry: dict) -> str:
    """[CAL](url) -> the source's registered title; other link labels keep
    their words. The URL itself is kept as chunk provenance, not as text."""

    def repl(match: re.Match[str]) -> str:
        label, _url = match.group(1), match.group(2)
        entry = registry.get(label.strip())
        return entry["title"] if entry else label

    return MD_LINK_RE.sub(repl, text)


def split_cells(row: str) -> list[str]:
    inner = row.strip()
    if inner.startswith("|"):
        inner = inner[1:]
    if inner.endswith("|"):
        inner = inner[:-1]
    return [cell.strip() for cell in inner.split("|")]


def table_to_lines(rows: list[str]) -> list[str]:
    header = [strip_inline_markup(c) for c in split_cells(rows[0])]
    body = rows[2:] if len(rows) > 1 and re.match(r"^\|?\s*:?-{2,}", rows[1]) else rows[1:]
    lines: list[str] = []
    is_event_table = bool(header) and header[0].lower().startswith("date") and len(header) >= 2
    for raw in body:
        cells = [strip_inline_markup(c) for c in split_cells(raw)]
        if not any(cells):
            continue
        if is_event_table:
            when, event = cells[0], cells[1]
            extra = [c for c in cells[2:] if c]
            suffix = f" ({', '.join(extra)})" if extra else ""
            lines.append(f"- {when}: {event}{suffix}")
        else:
            lead = cells[0]
            pairs = [
                f"{header[i]}: {cells[i]}"
                for i in range(1, min(len(header), len(cells)))
                if cells[i]
            ]
            lines.append(f"- {lead} - {'; '.join(pairs)}" if pairs else f"- {lead}")
    return lines


def parse_blocks(body: str) -> list[dict]:
    """Splits a Markdown body into sections of logical lines.

    Returns [{"headings": [h1, h2, h3], "blocks": [str, ...]}]. A block is one
    paragraph, one list item or one table row, so splitting a long section
    never cuts a date away from its event label.
    """
    sections: list[dict] = []
    headings: list[Optional[str]] = [None, None, None]
    current: dict = {"headings": list(headings), "blocks": []}
    paragraph: list[str] = []
    table: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            current["blocks"].append("\n".join(paragraph))
            paragraph = []

    def flush_table() -> None:
        nonlocal table
        if table:
            current["blocks"].extend(table_to_lines(table))
            table = []

    for raw in body.splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        heading = HEADING_RE.match(stripped)
        if heading:
            flush_paragraph()
            flush_table()
            if current["blocks"]:
                sections.append(current)
            level = len(heading.group(1))
            headings[level - 1] = strip_inline_markup(heading.group(2))
            for deeper in range(level, 3):
                headings[deeper] = None
            current = {"headings": list(headings), "blocks": []}
            continue
        if stripped.startswith("|"):
            flush_paragraph()
            table.append(stripped)
            continue
        flush_table()
        if not stripped:
            flush_paragraph()
            continue
        if stripped.startswith(">"):
            quote = stripped.lstrip(">").strip()
            if quote.startswith("**Source references:**"):
                continue
            verified = re.match(r"^\*\*Verified as of:\*\*\s*[\d-]+\s*\(Asia/Manila\)\.?\s*(.*)$", quote)
            if verified:
                rest = verified.group(1).strip()
                if rest:
                    paragraph.append(rest)
                    flush_paragraph()
                continue
            paragraph.append(quote)
            continue
        if re.match(r"^(?:[-*]|\d+\.)\s+", stripped):
            flush_paragraph()
            item = re.sub(r"^(?:[-*]|\d+\.)\s+", "", stripped)
            current["blocks"].append(f"- {item}")
            continue
        paragraph.append(stripped)

    flush_paragraph()
    flush_table()
    if current["blocks"]:
        sections.append(current)
    return sections


def detect_term(heading: Optional[str]) -> Optional[str]:
    if not heading:
        return None
    low = heading.lower()
    if re.search(r"\bfirst semester\b|\b1st sem", low):
        return "first"
    if re.search(r"\bsecond semester\b|\b2nd sem", low):
        return "second"
    if "midyear" in low or "mid-year" in low:
        return "midyear"
    return None


def detect_scope(title: str) -> Optional[str]:
    low = title.lower()
    if "undergraduate" in low:
        return "UG"
    if re.search(r"\bgraduate\b", low):
        return "GR"
    return None


def academic_years(*texts: str) -> list[str]:
    years: list[str] = []
    for text in texts:
        for start, end in AY_RE.findall(text or ""):
            label = f"{start}-{end}"
            if label not in years:
                years.append(label)
    return years


def pdf_pages(text: str) -> list[int]:
    pages: set[int] = set()
    for match in PDF_PAGES_RE.finditer(text):
        spec = match.group(1)
        for part in re.split(r"\s*(?:,|and)\s*", spec):
            bounds = re.split(r"\s*[-–]\s*", part)
            nums = [int(b) for b in bounds if b.isdigit()]
            if len(nums) == 2 and nums[0] <= nums[1] <= nums[0] + 6:
                pages.update(range(nums[0], nums[1] + 1))
            else:
                pages.update(nums)
    return sorted(p for p in pages if 1 <= p <= 6)


def page_label(pages: list[int]) -> Optional[str]:
    if not pages:
        return None
    if len(pages) == 1:
        return f"PDF p. {pages[0]}"
    return f"PDF pp. {', '.join(str(p) for p in pages)}"


def normalize_url(url: str) -> str:
    return url.rstrip("/.").lower()


def explicit_source_ids(raw_text: str, registry: dict) -> list[str]:
    """Registered sources a text names by URL or by an [ID](url) link."""
    by_url = {normalize_url(v["url"]): k for k, v in registry.items()}
    found: list[str] = []
    for url in BARE_URL_RE.findall(raw_text):
        source_id = by_url.get(normalize_url(url))
        if source_id and source_id not in found:
            found.append(source_id)
    for label, _url in MD_LINK_RE.findall(raw_text):
        if label in registry and label not in found:
            found.append(label)
    return found


def chunk_source_ids(
    chunk_raw: str,
    section_raw: str,
    group_raw: str,
    doc_ids: list[str],
    registry: dict,
) -> list[str]:
    """The sources a chunk cites, narrowest evidence first: the links in its
    section (a long section is split, and its "Source:" line lands in one
    part only), then its top-level heading group's, then source phrases it
    uses ("PDF p. 3", "library"), and only then the whole document's list.
    Document order is kept so the primary source leads."""
    found: list[str] = []
    for scope in (f"{chunk_raw}\n{section_raw}", group_raw):
        found = explicit_source_ids(scope, registry)
        if found:
            break
    if not found:
        found = [
            s
            for s in doc_ids
            if SOURCE_ALIASES.get(s) is not None and SOURCE_ALIASES[s].search(chunk_raw)
        ]
    if not found:
        found = list(doc_ids)
    if "CAL" in doc_ids and "CAL" not in found and PDF_PAGES_RE.search(chunk_raw):
        found.insert(0, "CAL")
    ordered = [s for s in doc_ids if s in found] + [s for s in found if s not in doc_ids]
    return ordered


def keywords_for(chapter: str, section: str, content: str, extra: list[str]) -> str:
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9]{2,}", f"{chapter} {section} {content}")
    freq: Counter[str] = Counter()
    acronyms: list[str] = []
    for tok in tokens:
        if tok.isupper() and 2 <= len(tok) <= 8 and tok not in acronyms and tok.lower() not in STOP_TERMS:
            acronyms.append(tok)
        low = tok.lower()
        if low in STOP_TERMS or len(low) < 3:
            continue
        freq[low] += 1
    terms = [t for t, _ in freq.most_common(10)]
    merged: list[str] = []
    for word in extra + acronyms[:6] + terms:
        if word and word not in merged:
            merged.append(word)
    return " ".join(merged[:18])


def group_blocks(blocks: list[str], max_chars: int) -> list[list[str]]:
    groups: list[list[str]] = []
    current: list[str] = []
    size = 0
    for block in blocks:
        if current and size + len(block) + 1 > max_chars:
            groups.append(current)
            current, size = [], 0
        current.append(block)
        size += len(block) + 1
    if current:
        groups.append(current)
    return groups


def faq_sections(sections: list[dict]) -> list[dict]:
    """One chunk per question in FAQ documents ('**Q: ...**  A: ...')."""
    out: list[dict] = []
    for section in sections:
        intro: list[str] = []
        for block in section["blocks"]:
            text = block.strip()
            if text.startswith("**Q:"):
                first, _, rest = text.partition("\n")
                question = strip_inline_markup(first).removeprefix("Q:").strip()
                answer = rest.strip()
                out.append(
                    {
                        "headings": [section["headings"][0], question, None],
                        "blocks": [f"Q: {question}", answer],
                    }
                )
            elif text.startswith("Citations:"):
                continue
            else:
                intro.append(block)
        if intro:
            out.insert(0, {"headings": section["headings"], "blocks": intro})
    return out


def build_document_chunks(
    rel_path: str,
    meta: dict,
    body: str,
    registry: dict,
    conflicts_by_id: dict,
) -> list[dict]:
    title = meta["title"]
    doc_ids: list[str] = [s for s in meta.get("source_ids", []) if s in registry]
    missing = [s for s in meta.get("source_ids", []) if s not in registry]
    if missing:
        raise ValueError(f"{rel_path}: unknown source ids {missing}")
    sections = parse_blocks(body)
    is_faq = meta.get("category") == "faq"
    if is_faq:
        sections = faq_sections(sections)
    scope = detect_scope(title)
    file_name = Path(rel_path).name
    chunks: list[dict] = []

    group_raw: dict[Optional[str], str] = {}
    for section in sections:
        key = section["headings"][0]
        group_raw[key] = group_raw.get(key, "") + "\n" + "\n".join(section["blocks"])

    for section in sections:
        heads = [h for h in section["headings"] if h]
        deepest = heads[-1] if heads else title
        term = detect_term(deepest)
        section_raw = "\n".join(section["blocks"])
        for part_idx, group in enumerate(group_blocks(section["blocks"], MAX_CHARS)):
            raw = "\n".join(group)
            source_ids = chunk_source_ids(
                raw,
                section_raw,
                # An FAQ answer cites only what it says itself, never the
                # links of the other questions under the same heading.
                "" if is_faq else group_raw[section["headings"][0]],
                doc_ids,
                registry,
            )
            content = "\n".join(
                strip_inline_markup(replace_links(line, registry)) if not line.startswith("- ")
                else "- " + strip_inline_markup(replace_links(line[2:], registry))
                for line in group
            )
            content = humanize_dates(content)
            # The document's and heading's academic year, never a year a row
            # merely mentions ("start of classes for AY 2027-2028"). A chunk
            # drawn from the calendar also belongs to the calendar's year.
            years = academic_years(title, deepest)
            if "CAL" in source_ids:
                for label in academic_years(registry["CAL"]["title"]):
                    if label not in years:
                        years.append(label)
            pages = pdf_pages(raw) if "CAL" in source_ids else []
            caveats = [
                {"id": rule["id"], "text": rule["text"]}
                for rule in CONFLICT_RULES
                if file_name.startswith(rule["files"])
                and rule["pattern"].search(f"{deepest}\n{raw}")
                and rule["id"] in conflicts_by_id
            ]
            extra_keywords: list[str] = []
            if scope == "UG":
                extra_keywords += ["undergraduate", "UG"]
            elif scope == "GR":
                extra_keywords += ["graduate", "GR", "masters", "doctoral"]
            if term:
                extra_keywords += [term, "semester" if term != "midyear" else "midyear"]
            extra_keywords += [str(meta.get("category", "")).replace("_", " ")]
            extra_keywords += [
                word
                for pattern, word in KEYWORD_SYNONYMS
                if pattern.search(f"{deepest}\n{content}")
            ]
            section_label = deepest if deepest != title else (heads[0] if heads else title)
            raw_id = f"{rel_path}|{'/'.join(heads)}|{part_idx}|{sha256_hex(content.encode('utf-8'))}"
            chunks.append(
                {
                    "id": "cdo-" + hashlib.sha1(raw_id.encode("utf-8")).hexdigest()[:12],
                    "chapter": title,
                    "section": section_label,
                    "pageLabel": page_label(pages),
                    "sourceLabel": title,
                    "keywords": keywords_for(title, section_label, content, extra_keywords),
                    "content": content,
                    "collection": COLLECTION,
                    "meta": {
                        "doc": rel_path,
                        "category": meta.get("category"),
                        "audience": meta.get("audience"),
                        "campus": meta.get("campus"),
                        "volatility": meta.get("volatility"),
                        "status": meta.get("status"),
                        "asOf": meta.get("as_of"),
                        "academicYears": years,
                        "term": term,
                        "scope": scope,
                        "pdfPages": pages,
                        "sources": [
                            {
                                "id": s,
                                "title": registry[s]["title"],
                                "url": registry[s]["url"],
                                # PDF page numbers belong to the calendar PDF.
                                **({"pages": pages} if s == "CAL" and pages else {}),
                            }
                            for s in source_ids
                        ],
                        "caveats": caveats,
                    },
                }
            )
    return chunks


ACRONYM_DEF_RE = re.compile(r"([A-Z][A-Za-z'’\-]*(?:\s+[A-Za-z'’\-]+){1,9})\s+\(([A-Z]{2,6})\)")
NAME_JOINERS = {"of", "and", "the", "for", "in", "de"}


def acronym_definitions(chunks: list[dict]) -> dict[str, str]:
    """'College of Information Technology and Computing (CITC)' -> CITC.

    Only definitions the pack itself writes, and only when the capitalised
    words' initials spell the acronym, so nothing is guessed."""
    found: dict[str, str] = {}
    for chunk in chunks:
        for words_text, acronym in ACRONYM_DEF_RE.findall(chunk["content"]):
            words = words_text.split()
            for start in range(len(words) - 1, -1, -1):
                name_words = words[start:]
                if name_words[0].lower() in NAME_JOINERS or not name_words[0][0].isupper():
                    continue
                initials = "".join(
                    w[0] for w in name_words if w.lower() not in NAME_JOINERS
                ).upper()
                if initials == acronym:
                    found.setdefault(acronym, " ".join(name_words))
                    break
    return found


def add_acronym_keywords(chunks: list[dict]) -> None:
    """A passage that writes a full name ("Dean, College of Information
    Technology and Computing") also answers a question that uses its
    acronym ("dean of CITC"), so the acronym joins its keywords."""
    definitions = acronym_definitions(chunks)
    for chunk in chunks:
        text = chunk["content"]
        extra = [
            acronym
            for acronym, name in sorted(definitions.items())
            if re.search(re.escape(name), text, re.IGNORECASE)
            and not re.search(rf"\b{acronym}\b", text)
            and acronym not in chunk["keywords"].split()
        ]
        if extra:
            chunk["keywords"] = " ".join(chunk["keywords"].split() + extra)
            # The app uses this to pick the row that names the full title.
            chunk["meta"]["aliases"] = {a: definitions[a] for a in extra}


# One-word forms questions use for phrases the documents spell out; they
# mirror QUERY_SYNONYMS in src/handbook/handbookSearch.ts so FTS5 finds them.
KEYWORD_SYNONYMS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\be-Library\b", re.IGNORECASE), "elibrary"),
    (re.compile(r"\bWeek of Welcome\b", re.IGNORECASE), "wow"),
    (re.compile(r"\bpre-?enrollment\b", re.IGNORECASE), "preenrollment"),
]


def build_pack(pack_dir: Path) -> dict:
    manifest = json.loads((pack_dir / "metadata" / "manifest.json").read_text(encoding="utf-8"))
    registry = json.loads((pack_dir / "metadata" / "sources.json").read_text(encoding="utf-8"))[
        "source_registry"
    ]
    conflicts = json.loads((pack_dir / "metadata" / "conflicts.json").read_text(encoding="utf-8"))[
        "conflicts"
    ]
    conflicts_by_id = {c["id"]: c for c in conflicts}
    for rule in CONFLICT_RULES:
        if rule["id"] not in conflicts_by_id:
            raise ValueError(f"caveat {rule['id']} is not in metadata/conflicts.json")

    rag_files = [f for f in manifest["files"] if f.get("include_in_rag")]
    if len(rag_files) != manifest["rag_document_count"]:
        raise ValueError("manifest rag_document_count does not match its file list")

    documents: list[dict] = []
    chunks: list[dict] = []
    for entry in rag_files:
        rel = entry["path"]
        if not re.match(r"^knowledge/[^/]+\.md$", rel):
            raise ValueError(f"refusing to index non-knowledge file {rel}")
        path = pack_dir / rel
        data = normalized_bytes(path)
        digest = sha256_hex(data)
        if digest != entry["sha256"]:
            raise ValueError(f"{rel}: SHA-256 {digest} does not match the manifest {entry['sha256']}")
        meta, body = parse_frontmatter(data.decode("utf-8"))
        documents.append(
            {
                "path": rel,
                "title": meta["title"],
                "sha256": digest,
                "category": meta.get("category"),
                "volatility": meta.get("volatility"),
                "asOf": meta.get("as_of"),
                "sourceIds": meta.get("source_ids", []),
            }
        )
        chunks.extend(build_document_chunks(rel, meta, body, registry, conflicts_by_id))

    add_acronym_keywords(chunks)
    for seq, chunk in enumerate(chunks, start=1):
        chunk["seq"] = seq
    ids = [c["id"] for c in chunks]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate chunk ids")

    ordered = [
        {
            "id": c["id"],
            "seq": c["seq"],
            "chapter": c["chapter"],
            "section": c["section"],
            "pageLabel": c["pageLabel"],
            "sourceLabel": c["sourceLabel"],
            "keywords": c["keywords"],
            "content": c["content"],
            "collection": c["collection"],
            "meta": c["meta"],
        }
        for c in chunks
    ]
    canonical = json.dumps(ordered, ensure_ascii=False, sort_keys=True)
    digest = sha256_hex(f"{manifest['package']}|{manifest['version']}|{canonical}".encode("utf-8"))
    return {
        "version": 1,
        "collection": COLLECTION,
        "title": "USTP Cagayan de Oro knowledge",
        "edition": f"Research snapshot {manifest['as_of']} ({manifest['package']} {manifest['version']})",
        "sourceLabel": "USTP CDO official sources",
        "asOf": manifest["as_of"],
        "timezone": manifest.get("timezone", "Asia/Manila"),
        "campus": manifest.get("campus"),
        "sha256": digest,
        "chunkCount": len(ordered),
        "generatedAt": f"{manifest['as_of']}T00:00:00Z",
        "documents": documents,
        "chunks": ordered,
    }


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--pack-dir", type=Path, default=DEFAULT_PACK_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit 1 when the committed output differs from a fresh build",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def render(pack: dict) -> str:
    return json.dumps(pack, ensure_ascii=False, indent=2) + "\n"


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    try:
        pack = build_pack(args.pack_dir.resolve())
    except (OSError, ValueError, KeyError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    text = render(pack)
    out: Path = args.out.resolve()
    if args.check:
        current = out.read_text(encoding="utf-8").replace("\r\n", "\n") if out.exists() else ""
        if current != text:
            print(f"OUT OF DATE: {out} differs from a fresh build", file=sys.stderr)
            return 1
        print(f"Up to date: {out} ({pack['chunkCount']} chunks, sha256 {pack['sha256'][:12]})")
        return 0
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8", newline="\n")
    print(
        f"Wrote {out}: {len(pack['documents'])} documents -> {pack['chunkCount']} chunks "
        f"(sha256 {pack['sha256'][:12]})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
