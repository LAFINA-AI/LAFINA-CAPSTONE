# PHASE 09 — Online Mode, Cloud AI Integration, Document Generation & Meeting Transcription
> Read `AGENTS.md` first. Execute **only Phase 09** when approved.

## Objective
Integrate `LAFINA`'s opt-in Online Mode in `ChatScreen` and `src/ai/chatOrchestrator.ts` against `LAFINA-backend` (`/v1/ai/chat`, `/v1/ai/tts`, `/v1/sync/batch`), bring back online PDF/Excel/Docx file generation via `/v1/ai/documents`, and implement offline/online Meeting & Lecture Transcription with AI summarization, with seamless fallback to offline scheduling and `react-native-tts` when offline or unentitled.

## Scope
1. **Online AI Chat Client (`src/cloud/`, `src/ai/`)**
   - Connect `ChatScreen`'s Online Mode toggle and `authorizeOnlineMode` to `LAFINA-backend` (`https://lafina-backend.vercel.app` / `http://127.0.0.1:8000`).
   - Support cloud-assisted scheduling and conversational responses with strict offline fallback to deterministic fast-path / on-device SLM NLU and `react-native-tts`.
   - Ensure student privacy: only explicit user queries are sent over the wire when Online Mode is actively toggled ON.
2. **Online Document Generation (PDF, Excel, Docx) (`src/skills/`, `src/ai/`)**
   - Port and adapt document intent detection (`detectDocumentRequest` from legacy `src/ai/documentIntent.ts`) to detect natural language requests for files in chat (e.g., *"Generate a PDF of my study schedule"*, *"Export my assignments to Excel"*, *"Draft a Word document outline"*).
   - Implement client skill (`requestDocument` adapted from legacy `src/skills/documentSkill.ts`) targeting `LAFINA-backend`'s `POST /v1/ai/documents` endpoint (`format`: `pdf` | `docx` | `xlsx` | `pptx`).
   - Decode base64 document responses, save to app cache/documents directory using `react-native-fs`, and provide on-screen attachment cards with open/share sheet capabilities via `react-native-share`.
   - Handle server rate limits (`MAX_DOCUMENT_REQUESTS_PER_MIN`, `MAX_DOCUMENT_REQUESTS_PER_DAY`) and render actionable user error feedback.
3. **Meeting & Lecture Transcription (`src/ai/meeting/`, `src/cloud/`, `android/`)**
   - Port native Android background audio recording service and JNI/module bindings (`LafinaMeetingRecorderModule.kt` / `LafinaMeetingService.kt`) with explicit microphone permissions, notification bar indicator, and chunked storage.
   - Implement offline chunk transcription (`transcribeMeetingChunks` from legacy `src/ai/meeting/meetingTranscriber.ts`) utilizing the existing bundled `whisper.cpp` engine to produce timestamp-aligned text segments without consuming cellular data.
   - Automatically delete intermediate raw audio chunks post-transcription unless explicitly opted into saving.
   - Implement cloud summarization client (`requestMeetingSummary` targeting `POST /v1/meetings/summary` or `/v1/meeting-notes/summary`) with explicit user consent to extract key lecture points, study decisions, and action items directly into local student tasks and notes.
   - Provide student meeting/lecture UI for recording, elapsed duration display, pause/resume/stop, transcript review, and one-tap export to notes.
4. **Reliability & Verification Gates**
   - Full preflight verification: TypeScript strict (`npm run typecheck`), ESLint (`npm run lint`), architecture boundary checks (`npm run check:architecture`), Jest unit tests (`npm test`), and Android Gradle compilation (`gradlew :app:testDebugUnitTest`).
   - Full offline resilience: when offline, file generation and cloud meeting summarization display informative offline notices, while local audio recording and offline whisper transcription remain 100% operational.