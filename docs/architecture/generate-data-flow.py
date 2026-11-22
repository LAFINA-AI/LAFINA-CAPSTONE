"""Generate the README's logical DFD. Run with Python 3; no extra packages."""

from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 2000, 3570
PX, PW, SX, SW = 760, 350, 1540, 410
parts = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title description">
<title id="title">LAFINA Level 1 Data Flow Diagram</title>
<desc id="description">Eight logical processes decompose LAFINA Process 0: accounts and preferences; personal planning; COR and calendar imports and exports; assistant and handbook answers; alarms and reminder calls; personal synchronization; speech and live voice; documents and recordings. Yellow external entities are the Student, DeepSeek, Pinecone and ElevenLabs. Open-ended D1 to D7 symbols are logical data stores. Repeated symbols are aliases, not separate users, services or databases. The system covers the Android and owner-confirmed Electron clients and shared backend; platform-specific labels describe the inspected Android implementation.</desc>
<defs>
 <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="#525b66" stroke-width="1.4"/></marker>
 <style>
  text {{ font-family: Arial, Helvetica, sans-serif; fill: #25303c; }}
  .heading {{ font-size: 34px; font-weight: 700; }}
  .sub {{ font-size: 20px; fill: #5c6773; }}
  .column {{ font-size: 17px; font-weight: 700; letter-spacing: 1px; fill: #69727d; }}
  .flow {{ fill: none; stroke: #525b66; stroke-width: 1.5; marker-end: url(#arrow); }}
  .label {{ font-size: 17px; paint-order: stroke; stroke: white; stroke-width: 5px; stroke-linejoin: round; }}
  .process {{ fill: white; stroke: #66717e; stroke-width: 1.6; }}
  .entity {{ fill: #fff3cf; stroke: #d3b35f; stroke-width: 1.5; }}
  .entity-text {{ font-size: 22px; font-weight: 700; }}
  .name {{ font-size: 22px; font-weight: 700; }}
  .detail {{ font-size: 18px; fill: #596574; }}
  .store {{ fill: none; stroke: #66717e; stroke-width: 1.5; }}
  .store-name {{ font-size: 20px; font-weight: 700; }}
 </style>
</defs>
<rect width="2000" height="3570" fill="white"/>
''']


def text(x, y, lines, cls="detail", anchor="middle", step=25):
    if isinstance(lines, str):
        lines = [lines]
    parts.append(f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}">')
    for i, line in enumerate(lines):
        parts.append(f'<tspan x="{x}" dy="{0 if i == 0 else step}">{escape(line)}</tspan>')
    parts.append('</text>')


def line(x1, y1, x2, y2, label, below=False):
    parts.append(f'<path d="M{x1} {y1}H{x2}" class="flow"/>')
    lines = label if isinstance(label, list) else [label]
    label_y = y1 + 26 if below else y1 - 10 - 20 * (len(lines) - 1)
    text((x1 + x2) / 2, label_y, lines, "label", step=20)


def entity(y, name="Student", ident="E1", alias=False):
    cls = "process" if alias else "entity"
    parts.append(f'<rect x="40" y="{y}" width="190" height="90" class="{cls}"/>')
    text(135, y + 25, ident, "detail")
    text(135, y + 55, name, "entity-text")


def left_pair(y, name, ident, incoming, outgoing, alias=False):
    entity(y, name, ident, alias)
    line(230, y + 30, PX, y + 30, incoming)
    line(PX, y + 70, 230, y + 70, outgoing, below=True)


def store(y, ident, name, details, write, read):
    parts.append(f'<path d="M{SX + SW} {y}H{SX}V{y + 100}H{SX + SW}M{SX + 55} {y}V{y + 100}" class="store"/>')
    text(SX + 28, y + 55, ident, "detail")
    text(SX + 75, y + 29, name, "store-name", "start")
    text(SX + 75, y + 56, details, "detail", "start", step=22)
    if write:
        line(PX + PW, y + 28, SX, y + 28, write)
    if read:
        line(SX, y + 76, PX + PW, y + 76, read)


def process(y, height, ident, name, details):
    parts.append(f'<rect x="{PX}" y="{y}" width="{PW}" height="{height}" class="process"/>')
    parts.append(f'<path d="M{PX} {y + 35}H{PX + PW}" class="store"/>')
    text(PX + PW / 2, y + 25, ident, "detail")
    text(PX + PW / 2, y + 77, name, "name", step=28)
    text(PX + PW / 2, y + height / 2 + 24, details, "detail", step=25)


def separator(y):
    parts.append(f'<path d="M40 {y}H1950" stroke="#e5e8eb" stroke-width="1"/>')


text(40, 62, "LAFINA Data Flow Diagram", "heading", "start")
text(40, 99, "Level 1 · Decomposition of Process 0 · Android / Electron clients + shared backend", "sub", "start")
text(40, 131, "Logical flows verified against this checkout; desktop adapters are owner-confirmed, not inspected here.", "sub", "start")
text(135, 185, "EXTERNAL ENTITY", "column")
text(PX + PW / 2, 185, "LAFINA PROCESSES", "column")
text(SX + SW / 2, 185, "LOGICAL DATA STORES", "column")

# Each row uses repeated aliases to avoid long crossing lines.
y = 220
process(y, 375, "1.0", ["Manage accounts", "and preferences"], ["Local guest or cloud account", "Backend authentication", "Profile / mode / voice settings"])
left_pair(y + 40, "Student", "E1", ["Guest choice; account credentials;", "profile and preference changes"], ["Account / access status;", "saved profile and preferences"])
store(y, "D1", "Local identity / settings", ["Users, session references,", "preferences and local settings"], "Local session / preference updates", "Current identity / saved settings")
store(y + 130, "D2", "Personal records + sync", ["Syncable profile payload and", "queued profile mutations"], "Profile changes + queued mutations", "Syncable profile fields")
store(y + 260, "D7", "Cloud database", ["Accounts, access / subscription", "and authentication records"], "Validated account / session changes", "Account / session / access records")
separator(615)

y = 640
process(y, 245, "2.0", ["Manage personal", "plans and notes"], ["Validate and persist changes", "Core records + queued mutation", "share a SQLite transaction"])
left_pair(y + 40, "Student", "E1", ["Planner / note / alarm edits;", "save and completion choices"], ["Saved plans / notes / alarms;", "validation and operation results"])
store(y, "D2", "Personal records + sync", ["7 core entity types; outbox,", "metadata, state and conflicts"], "Record mutations + queued sync changes", "Planner / note records")
store(y + 135, "D5", "Local alarms / delivery", ["Device alarm clocks; alert jobs,", "events and response history"], "Device-local alarm changes", "Alarm clock records")
separator(905)

y = 930
process(y, 245, "3.0", ["Import / export", "academic schedules"], ["On-device COR text / OCR", "Calendar (.ics) parsing", "Review before import writes"])
left_pair(y + 40, "Student", "E1", ["COR PDF / image; calendar file;", "reviewed import / export choices"], ["Extraction checks and import preview;", "saved schedule / exported .ics"])
store(y, "D2", "Personal records + sync", ["Imported schedule entries and", "queued core-entity mutations"], "Confirmed classes / calendar records", "Existing schedule / export records")
store(y + 135, "D6", "Local files / metadata", ["Import batches, COR metadata;", "device files and attachments"], "Import batch / academic setup metadata", "Imported batch / source metadata")
separator(1195)

y = 1220
process(y, 595, "4.0", ["Answer questions", "and review actions"], ["Rules / SmolLM2 for local intents", "Local planner and handbook reads", "Backend DeepSeek / handbook RAG", "Student confirmation before writes", "Chat + optional personal memory", "Temporary Chat skips history"])
left_pair(y + 5, "Student", "E1", ["Questions / commands;", "review edits, confirmation or cancel"], ["Replies / sources; proposed changes;", "confirmed-operation receipts"])
left_pair(y + 145, "DeepSeek", "E2", ["Assistant replies / action proposals", "and optional memory extraction"], ["Backend prompts, relevant context", "and applicable handbook evidence"])
left_pair(y + 285, "Pinecone", "E3", "Handbook passages / source metadata", "Backend handbook retrieval queries")
left_pair(y + 445, "Speech", "7.0 · process alias", ["Recognized text / live-agent turns;", "voice action requests"], ["Reply text / voice-bridge responses;", "reviewed-action results"], alias=True)
store(y, "D2", "Personal records + sync", ["Student plans, reminders,", "notes and profile context"], None, "Personal planner context / lookup results")
store(y + 120, "D3", "Chat / personal memory", ["Chat sessions, messages,", "chat memories / preferences"], "Non-temporary chat; enabled memory edits", "Conversation history / relevant memories")
store(y + 240, "D4", "Local handbook", ["Handbook pack, chunks,", "source metadata and FTS5 index"], None, "Local excerpts / citations / search results")
store(y + 360, "D7", "Cloud database", ["Account access, service settings,", "AI usage / quota records"], "AI usage / request bookkeeping", "Account access / quota / service settings")
# This is a repeated process, not a data store: proposals never write D2 directly.
parts.append(f'<rect x="{SX}" y="{y + 490}" width="{SW}" height="90" class="process"/>')
text(SX + SW / 2, y + 516, "2.0 · repeated process", "detail")
text(SX + SW / 2, y + 548, "Manage personal plans and notes", "store-name")
line(PX + PW, y + 516, SX, y + 516, "Confirmed, validated planner mutations")
line(SX, y + 560, PX + PW, y + 560, "Saved-operation result / receipt")
separator(1835)

y = 1860
process(y, 340, "5.0", ["Deliver alarms", "and reminder calls"], ["Android AlarmManager / recovery", "Simulated incoming call UI", "Acknowledge is not task complete", "Speech through process 7.0"])
left_pair(y + 35, "Student", "E1", ["Answer / dismiss / snooze;", "explicit follow-up choices"], ["Alarm / reminder alerts;", "simulated call and action results"])
left_pair(y + 220, "Speech", "7.0 · process alias", "Speech / playback result", "Reminder / briefing text to speak", alias=True)
store(y, "D2", "Personal records + sync", ["Reminders and their linked", "tasks / events / time blocks"], "Reminder acknowledgement / snooze + queue", "Pending reminders / linked plan details")
store(y + 150, "D5", "Local alarms / delivery", ["Device alarms; delivery jobs,", "events and response history"], "Delivery outcomes / alarm state / history", "Alarm times / recovery / delivery state")
separator(2220)

y = 2245
process(y, 245, "6.0", ["Synchronize personal", "account records"], ["Authenticated /v1/sync/batch", "Send queue; apply remote changes", "Track conflicts and sync cursors"])
left_pair(y + 40, "Student", "E1", "Sync / account and conflict choices", "Sync state / pending conflicts")
store(y, "D2", "Personal records + sync", ["7 core entity types; outbox,", "metadata, state and conflicts"], "Applied remote changes / acks / conflicts", "Queued mutations / cursor / local versions")
store(y + 135, "D7", "Cloud database", ["Account-scoped personal records", "and synchronization versions"], "Authorized personal mutations / versions", "Remote records / versions / conflict data")
separator(2510)

y = 2535
process(y, 350, "7.0", ["Recognize speech", "and provide voice"], ["Local Whisper + Silero VAD", "Local react-native-tts", "Backend TTS / live-session grant", "Signed live WebSocket to ElevenLabs", "Live LLM bridge uses process 4.0", "Speech requests from 4.0 / 5.0"])
left_pair(y + 20, "Student", "E1", ["Authorized microphone audio;", "speech / live-session controls"], ["Transcripts, spoken replies", "and session / fallback status"])
left_pair(y + 200, "ElevenLabs", "E4", ["Speech audio; live transcripts", "and conversation events"], ["Backend speech / session requests;", "authorized live audio / context"])
store(y + 15, "D1", "Local identity / settings", ["Speech mode, selected voice,", "preferences and account session"], None, "Mode / voice / session settings")
store(y + 190, "D7", "Cloud database", ["Voice session / account access", "and usage / quota records"], "Authorized voice-session / usage records", "Session state / account access / quota")
separator(2905)

y = 2930
process(y, 350, "8.0", ["Create documents", "and process recordings"], ["User-started audio recording", "Current UI uses local Whisper STT", "Backend document / notes requests", "Audio stays local in this UI path", "Generated files saved on device"])
left_pair(y + 20, "Student", "E1", ["Document prompts / selected context;", "recording audio and notes requests"], ["PDF / DOCX / XLSX / PPTX files;", "recording transcript / organized notes"])
left_pair(y + 200, "DeepSeek", "E2", "Document content / structured notes", "Backend document / transcript prompts")
store(y + 15, "D6", "Local files / metadata", ["Recorded-meeting rows, audio", "chunks, attachments / output files"], "Recording metadata / transcripts / files", "Recorded audio / saved transcript / files")
store(y + 190, "D7", "Cloud database", ["Account access / service settings", "and online AI usage records"], "Document / notes usage bookkeeping", "Account access / quota / service settings")

separator(3305)
text(40, 3345, "Notation and boundaries", "name", "start")
text(40, 3380, [
    "Yellow rectangles = external entities. Numbered white boxes = processes. Open-ended D boxes = logical stores.",
    "Arrows name data and show its direction. Repeated E / D / process IDs refer to the same entity, store or process.",
    "D1–D5 and SQLite metadata in D6 share lafina.db on Android; D6 also includes device files. D7 is cloud PostgreSQL (Neon).",
    "D2 sync scope: profile, task, event, time_block, reminder, note, custom_category. Device alarm clocks / files are outside that scope.",
    "Online AI / voice require the applicable mode choice, connectivity and backend access. Local resources are needed for offline voice / search.",
    "This is a logical feature DFD, not a call sequence or exhaustive table list. See lafina-data-flow.md for source evidence and limitations."
], "detail", "start", step=28)
parts.append('</svg>')
ROOT.joinpath('lafina-data-flow-diagram.svg').write_text('\n'.join(parts) + '\n', encoding='utf-8')
print('Generated docs/architecture/lafina-data-flow-diagram.svg')
