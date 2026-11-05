# Phase 09 Execution Checklist — Online Mode, Cloud AI Integration, Document Generation & Meeting Transcription

Approval: Human user wrote `APPROVE PHASE 09` (2026-11-05).

Branch: `agy-development-cont` (strict requirement: never touch `main`). Only `LAFINA-CAPSTONE` modified; legacy repos `LAFINA` and `LAFINA-backend` remain 100% read-only.

- [x] Read `AGENTS.md`, `phases/PHASE-09.md`, report template, and legacy online chat, document generation, and meeting transcription modules in `LAFINA`.
- [x] Verified zero business dashboards, zero Gmail APIs/OAuth, zero Pomodoro/Flashcards/Study Notes.
- [x] Verified zero Kokoro 82M ONNX model binaries and zero ONNX runtime TTS synthesis.
- [x] Verified offline TTS engine uses `react-native-tts` (`src/ai/tts/ttsService.ts`).
- [x] Implemented Online AI Chat Client & USTP Handbook RAG (`src/skills/onlineChatSkill.ts`, `src/ai/chatOrchestrator.ts`, `src/ui/screens/ChatScreen.tsx`):
  - Connected `onlineChatSkill.reply` (`POST /v1/ai/chat`) and `onlineChatSkill.fetchHandbookStatus` (`GET /v1/ai/handbook/status`) via `cloudClient.request` and `accountLinkService.authorizeOnlineMode`.
  - Integrated Online Mode toggle and USTP Student Handbook status pill in `ChatScreen`.
  - Supported `handbookSourceLabel` citation badges in `ChatMessageItem.tsx`.
  - Enforced seamless offline fallback to local deterministic/SLM NLU and `react-native-tts` when offline or unentitled.
- [x] Implemented Online Document Generation (`src/ai/documentIntent.ts`, `src/skills/documentSkill.ts`, `src/ui/components/chat/chatFiles.ts`):
  - Ported and adapted `detectDocumentRequest` for PDF, Word (`docx`), Excel (`xlsx`), and PowerPoint (`pptx`) requests in chat.
  - Implemented `documentSkill.generate` targeting `POST /v1/ai/documents` with rate-limit handling (`MAX_DOCUMENT_REQUESTS_PER_MIN`, `MAX_DOCUMENT_REQUESTS_PER_DAY`), base64 validation, and offline/entitlement feedback.
  - Implemented `saveGeneratedFile` (`react-native-fs`) and `shareAttachment` (`react-native-share`) in `chatFiles.ts`.
  - Added file attachment cards in `ChatMessageItem.tsx` and format picker (`ToolSheet`) in `ChatInput.tsx` and `ChatScreen.tsx`.
- [x] Implemented Native Android & Offline/Online Meeting & Lecture Transcription (`android/`, `src/ai/native/meetingRecorder.ts`, `src/ai/meeting/`, `src/cloud/meetingService.ts`, `src/skills/meetingNotesSkill.ts`, `src/meetings/`, `src/storage/recordedMeetingStore.ts`, `src/ui/screens/meetings/`):
  - Ported `LafinaMicrophoneLease.kt`, `LafinaMeetingService.kt`, and `LafinaMeetingRecorderModule.kt` into `com.lafina.capstone`, registered `LafinaMeetingRecorderModule` in `CapstoneBuildPackage.kt`, and added `<service android:name=".LafinaMeetingService" ... android:foregroundServiceType="microphone" />` to `AndroidManifest.xml`.
  - Integrated `LafinaMicrophoneLease` into `LafinaSpeechToTextModule.kt` to prevent simultaneous mic contention between push-to-talk STT and lecture recording.
  - Implemented `transcribeMeetingChunks` (`src/ai/meeting/meetingTranscriber.ts`) using bundled `whisper.cpp` (`LafinaWhisperBridge.transcribeWithTimestamps`) with automatic post-transcription raw audio chunk deletion unless `keepAudio: true` is passed.
  - Implemented `requestMeetingSummary` (`src/cloud/meetingService.ts` -> `POST /v1/meetings/summary`) with explicit user consent (`consentedToCloudSummary`) and `meetingNotesSkill` (`POST /v1/ai/meeting-notes/section` & `POST /v1/ai/meeting-notes/generate`) with local offline fallback (`notesPipeline.ts`).
  - Added `recorded_meetings` SQLite table in `src/storage/dbInit.ts` and CRUD store in `src/storage/recordedMeetingStore.ts`.
  - Migrated student lecture/meeting recorder UI (`MeetingsScreen`, `MeetingDetail`, `RecorderCard`, `ProcessingCard`, `NotesView`, `TranscriptList`, `PrivacyNotice`, `MeetingsProvider`) and wired access from `ChatScreen` and `NotesScreen`.
- [x] Created comprehensive unit and integration test suite:
  - `__tests__/ai/phase09OnlineDocsAndMeetings.test.tsx` (18 unit and integration tests covering document intent detection, online document generation, online chat + USTP Handbook RAG + offline fallback, offline chunk transcription with raw audio cleanup, explicit consent for cloud meeting summarization, `recordedMeetingStore` SQLite persistence, and `ChatScreen` Online Mode + Lecture Recorder modal).
- [x] Verified automated gates:
  - `npm run typecheck`: PASS (0 errors).
  - `npm run lint`: PASS (0 errors, 0 warnings).
  - `npm run check:architecture`: PASS (179 modules checked, 0 cycles, 0 forbidden dependencies).
  - `npm test`: PASS (14 suites, 147 tests passed).
  - `.\android\gradlew.bat :app:testDebugUnitTest -p android --console=plain`: PASS (`BUILD SUCCESSFUL in 1m 6s`).
- [x] Authored Phase 09 completion report (`docs/reports/phase-09-report.md`).
- [x] Await human device validation and explicit approval before starting Phase 10.

**HUMAN REQUIRED / NOT RUN:** Physical Android device testing of live Online Mode cloud chat/RAG, opening generated PDF/Docx/Excel files via Android share sheet, and background foreground-service lecture recording + on-device Whisper chunk transcription on a physical handset. The phase is **READY FOR REVIEW** / **AWAITING DEVICE VALIDATION**.
