# LAFINA | USTP Cagayan de Oro Knowledge Extension

**Research snapshot:** 2026-11-24 (Asia/Manila)  
**Target:** USTP Cagayan de Oro students and prospective students  
**Source policy:** public official USTP webpages + user-provided CHED-noted AY 2026-2027 academic calendar PDF  
**Format:** standalone Markdown documents with YAML frontmatter, provenance, a JSON manifest and optional structured events.  
**Important:** This is a **research snapshot**, not a live feed or an official USTP service.

## Quick start (no changes to existing handbook)

1. Extract the ZIP into your repository, for example: `knowledge/ustp-cdo/2026-11-24/`.
2. Read **`AGENT_INTEGRATION.md`** before writing ingestion code.
3. Ingest **only `knowledge/*.md`** into LAFINA's existing RAG/document indexing pipeline. Keep each filename and its YAML metadata.
4. Do **not** ingest `reference/`, the root README, and JSON files as ordinary passage text. They are supporting metadata/evidence.
5. Keep the existing **USTP Student Handbook 2023** in the existing collection. These new files cover calendar, programs, offices, student services and navigation; they **do not replace** handbook policies.
6. If the app supports calendar or reminder cards, use **`metadata/events.json`** as published institutional-event suggestions only. Require user confirmation before creating a personal reminder.
7. Before going live, run the QA checks in `AGENT_INTEGRATION.md` and verify the issue flags in `knowledge/14_source_conflicts_and_refresh_rules.md`.

## File map

| Path | Topic | Notes |
|---|---|---|
| `knowledge/01_academic_calendar_undergraduate_2026_2027.md` | UG semester dates, exam windows, campus dates | Authoritative PDF, important conflicting midyear start |
| `knowledge/02_graduate_calendar_2026_2027.md` | Graduate enrollment, exams, midyear | Keep undergraduate and graduate separate |
| `knowledge/03_admissions_2027_2028_windows.md` | Future applications shown in academic calendar | Year-label discrepancy flagged |
| `knowledge/04_admissions_enrollment_and_ustat.md` | Admissions, USTAT, PRISMS enrollment steps | No made-up cutoff/slots |
| `knowledge/05_programs_cdo_ug_graduate.md` | Colleges, UG and graduate program lists | Not verified currently accepting enrollment |
| `knowledge/06_offices_directory_and_support.md` | Office routing and contact numbers | Phone inconsistencies noted |
| `knowledge/07_library_buildings_services.md` | Library locations and services, AVR | Live availability unknown |
| `knowledge/08_scholarships_grants_financial_aid.md` | Scholarship categories | Does not imply live open applications |
| `knowledge/09_portals_and_digital_tools.md` | USTeP, PRISMS, admissions, eClearance | Public links, no authorized private access |
| `knowledge/10_student_life_organizations.md` | Publicly listed student orgs | 2021 directory is explicitly legacy |
| `knowledge/11_campus_overview_and_locations.md` | Address, identity, campus distinctions | No room-level invented map |
| `knowledge/12_current_officials_snapshot.md` | Staff directory | Names are volatile |
| `knowledge/13_fast_answers_faq.md` | Ready-made question-answer examples | Short retrieval-friendly answers |
| `knowledge/14_source_conflicts_and_refresh_rules.md` | Known contradictions, decision policy | **Must not ignore** |
| `metadata/events.json` | Structured calendar | Not a student schedule, no exact times |
| `metadata/manifest.json` | File list, hashes, suggested priority | Programmatic validation |
| `metadata/sources.json` | All source URLs, descriptions and access date | Provenance |
| `metadata/conflicts.json` | Machine-readable known issues | Safety/QA |
| `reference/official_academic_calendar_ay2026_2027.pdf` | Original PDF supplied by user | **Reference only, do NOT re-ingest** |
| `AGENT_INTEGRATION.md` | Exact indexing contract and copy-paste agent prompt | Integrate with existing architecture |

## Key calendar result

| Undergraduate term | Start | End |
|---|---|---|
| First semester | 2026-08-10 | 2026-12-19 |
| Second semester | 2027-01-05 | 2027-05-20 |
| Midyear summary | 2027-06-09 | 2027-07-22 |

**Caution:** The same PDF also prints **June 5, 2027** as midyear start of classes; LAFINA must disclose the discrepancy and refer to Registrar for confirmation.

## Official primary calendar source

- University calendar index: https://www.ustp.edu.ph/university-calendars/
- Source PDF: https://drive.google.com/file/d/1ijghm2zH9S203nn58Qxe8Ln8wchVWw3h/view?usp=sharing
- The PDF was provided by the user and is reproduced under `reference/` for traceability only.

## Content boundaries

This package has **no** private student profile, course roster, grades, live class suspension notices, signed-in account data, campus building GPS coordinates, class times, or university account credentials. It must not be advertised as live university data. Source descriptions and additional URLs are in `metadata/sources.json`.
