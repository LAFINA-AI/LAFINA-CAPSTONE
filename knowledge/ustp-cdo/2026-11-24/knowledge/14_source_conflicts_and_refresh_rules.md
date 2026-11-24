---
title: "Conflicts, Caveats and Refresh Rules"
knowledge_base: "LAFINA USTP Cagayan de Oro"
campus: "USTP Cagayan de Oro"
as_of: "2026-11-24"
category: "qa"
audience: "student"
volatility: "high"
source_ids: ["CAL", "CONTACT", "OFFICIALS", "ORG_CUR", "ORG_NON", "UG_PROG"]
status: "verified_with_caveats"
---

> **Source references:** CAL: https://drive.google.com/file/d/1ijghm2zH9S203nn58Qxe8Ln8wchVWw3h/view?usp=sharing; CONTACT: https://www.ustp.edu.ph/contact-us/; OFFICIALS: https://www.ustp.edu.ph/administration-directory/ustp-officials/; ORG_CUR: https://www.ustp.edu.ph/week-of-welcome/organizations/cagayan-de-oro/cdo-curricular/; ORG_NON: https://www.ustp.edu.ph/week-of-welcome/organizations/cagayan-de-oro/cdo-non-curricular/; UG_PROG: https://www.ustp.edu.ph/academics/undergraduate-programs/
> **Verified as of:** 2026-11-24 (Asia/Manila). 

# Known source inconsistencies. Preserve them.

| ID | Issue | Severity | Correct agent handling |
|---|---|---|---|
| C1 | UG midyear 2027 term summary says **June 9** start on PDF p. 2; detail says **June 5** start on p. 5 | **HIGH** | Give both with source/page; ask for confirmation; no auto-reminder |
| C2 | 2027 **May 10** transferee/second-course row still names **AY 2026-2027** on PDF p. 5 | **HIGH** | Quote year exactly and flag mismatch, do not silently "fix" |
| C3 | Graduate midyear detailed row says start of classes **June 5**, but enrollment **June 5-11** on p. 6 | MEDIUM | Report overlap; do not assume a specific student's start/late enrollment policy |
| C4 | PDF page 2 repeats **UNDERGRADUATE (UG)** term summary heading twice beside UG/GR calendars | MEDIUM | Don't invent unambiguously named GR term dates from duplicate heading |
| C5 | CDO official main number shown as both **856-1738** and **857-1738** on official pages | MEDIUM | Cite both numbers and verify switchboard |
| C6 | Official contact page gives some three-digit locals; officials directory has some four-digit locals | MEDIUM | Do not generate four-digit extension mechanically |
| C7 | Legacy CDO student organization directory appears under **2021 Virtual Week of Welcome** | MEDIUM | Treat listed organizations as historical; don't promise 2026 activity |
| C8 | Other USTP pages still embed AY **2025-2026** calendar content | HIGH | Prefer uploaded 2026-2027 CHED-noted PDF for AY 2026-27 questions |
| C9 | 2027 Eid al-Fitr is calendar-marked **March 9**; lunar/proclamation holiday may change | MEDIUM | Cite as listed, verify current proclamation before advising no classes |
| C10 | Detailed undergraduate and graduate course offerings vary across webpages and over time | MEDIUM | A listing is not evidence of an open slot or current approved curriculum |
| C11 | May 2027 deadlines/celebrations have no time-of-day or college-level specific location | LOW | Never invent venue/time; refer to official campus announcement |

## Priority / conflict hierarchy

1. **Authenticated live university announcement / new official calendar revision** relevant to campus + academic year and date.
2. **CHED-noted University Academic Calendar AY 2026-2027** (this package, PDF source reference).
3. **Current official USTP campus/university website**, when it gives the same AY and scope.
4. **Older USTP public pages** clearly dated, labeled historical.
5. **2023 student handbook** for *policy* questions, but **not** as source for AY 2026-27 event dates.
6. Never use student gossip, unofficial third-party posts or unspecified search snippets as institutional directives.

If a new announcement conflicts with the PDF but you cannot verify scope/revision, explain both and ask the student to check Registrar/ASO.

## Refresh cadences and TTLs

- Active admissions, exam changes, scholarships and suspensions: **before every time-sensitive answer**; old snapshot alone is insufficient.
- Official roles, local extensions, current organizations: **monthly** while active, or before a direct referral.
- Undergraduate/graduate program lists and library policies: **every semester**.
- Published academic calendar: **at minimum at the start of a term** and when the university posts amended dates.
- Campus address and institutional history: **annually**.

## Negative knowledge (not obtained in public research)

This research does **not** verify: actual class/section timetables, course syllabus PDFs, real-time facilities/rooms, campus-wide indoor GPS map, student portal API, student personal grades, class cancellations, current Wi-Fi details or credentials, library live opening hours, individual scholarship eligibility, university-shuttle times, individualized fees, or current graduate admission deadlines beyond the dates in the calendar.

A useful LAFINA response for missing data: **"I couldn't verify that from official USTP CDO information. Please check [named official office/portal]."**
