# AGY-PORT 06 — bounded planner reads and factual replies

Prerequisite: 04. Inventory: 10, 11. Protect PF04–PF07, PF10–PF12.

## Navigate

Target query_schedule/actionExecutor/orchestrator, Calendar hooks/layers/views, tasks/events/time_blocks, exports and manual editors. Donor plannerQueries/plannerConversation/CommandGuide/UndatedTasks and query/window tests. Do not import donor free-time, ML or semester features as part of this phase.

## Execute

1. Add typed bounded query services with injectable clock/executor. Scope every read/cursor to owner and requested date/filter; account for relevant recurring occurrences, unfinished backlog, completed and undated items. Avoid materializing all records to filter in JavaScript.
2. Adapt Calendar's visible day/week/month window and recurrence/backlog queries without changing layer/category/holiday/week-start/time-format behavior. Provide paged manual access to untimed tasks. Keep explicit full export/share workflows available in bounded batches.
3. Route supported factual questions to actual local records and bounded replies. No invented agenda rows; unavailable storage or unsupported questions get truthful feedback. Respect existing richer AGY intent routing; general online AI, Handbook RAG and document generation retain their correct paths.
4. Add a guide using examples tested against AGY's parser/review contract. Selecting an example populates a protected draft only. Preserve any existing starter prompts/online tool choices; do not narrow the UI to scheduling alone.
5. Use synthetic large collections to test SQL bounds, stable cursors, recurrence window edges, undated/completed/backlog filtering and no cross-owner reads. Test online/document/RAG routes and preserved Calendar interactions alongside the improved offline replies.

## Acceptance

Calendar display and supported planner replies no longer require full history reads. Pagination cannot drop or duplicate records at equal times or owner changes. Full owned export stays available. Guide examples never execute commands. Existing online functions and navigation remain intact.

Deliver `reports/phase-06-planner.md`, query/index notes and fresh synthetic measurements only if actually run. Report fixture query timing separately from phone UI/inference performance.
