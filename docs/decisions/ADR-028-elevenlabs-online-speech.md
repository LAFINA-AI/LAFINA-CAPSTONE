# ADR-028 — ElevenLabs for explicit online speech

Date: 2026-11-07. Status: accepted for implementation by the owner; production contract verified on 2026-11-07; signed-in device validation pending.

The owner approved Phase 09 with DeepSeek responses and ElevenLabs TTS only in online mode, then confirmed the current writable project is `LAFINA-CAPSTONE-agy-development-cont` on `Lem-branch`. The owner separately authorized the scoped `LAFINA-backend` migration and deployment, overriding the checkout's usual backend-write prohibition for this change only.

Preserve the existing DeepSeek chat, accounts, entitlement, sync and other online endpoints. Replace the active Gemini TTS client/lifecycle and response metadata in the backend. Use server-held ElevenLabs keys, a 512-character speech limit, MP3 output, deadlines, bounded audio, sanitized failures, existing durable account quotas and an additional per-process character ceiling. Do not add cloud STT or upload microphone recordings.

Add an authenticated provider capability route before mobile synthesis so an unmigrated server cannot invoke Gemini on behalf of the new client. Validate provider and MIME markers before writing temporary MP3 files. Reuse the current native audio player and local `react-native-tts`; no new mobile/native dependency, database migration, model or permission is added. Explicit saved Online Mode is required even if network access and entitlement are present.

Reuse Chat's existing read-aloud button with owned cancellation; keep written responses visible before audio and support Stop, switch-off, account change and background cleanup. Cancellation must not trigger fallback playback. Preserve the existing local voice selection and planner command confirmation flow.

This changes the online provider, not offline scheduling architecture. No latency improvement or device-audio claim is made without measurements. The current checkout has no Graphify graph; its existing AST import/network-boundary checker is the reproducible substitute (226 modules, 75 offline leaves).

Production activation requires the Vercel project owner: the connected account cannot find the existing project. Keep its URL and separate repository rather than creating a new host or copying its credentials into the mobile app.

Production follow-up: owner merged `f0fae4d`; Vercel deployment succeeded, and public contract plus missing-auth rejection checks passed. Source tree matches tested backend commit `34f9fba`. No claim of successful signed-in phone playback is implied.
