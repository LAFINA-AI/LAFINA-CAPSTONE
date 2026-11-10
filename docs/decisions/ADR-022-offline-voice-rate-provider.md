# ADR-022: Offline voice choice, speed/pitch mapping and provider scope for react-native-tts

**Status:** accepted (owner pre-authorized AGY-PORT 00–13 in `docs/plans/agy-improvements/OWNER-AUTHORIZATION.md`)
**Date:** 2026-11-06
**Phase:** AGY-PORT 10 (inventory 17, 18, 19)
**Review owner:** human developer

## Context

AGY's local speech is `react-native-tts` 4.1.1 (`src/ai/tts/ttsService.ts`). It:

- picks an installed English voice automatically, preferring en-US;
- never sets speed or pitch;
- waits on `getInitStatus` with no bound.

**Cloud speech.** Gemini audio via `/v1/ai/tts` is used only for `student_pro`, online, with a token for the signed-in account. It falls back to local speech (`src/cloud/speechService.ts`).

**Speech-to-text.** Whisper + VAD through `LafinaSpeechToTextModule`, behind the AGY-PORT 05 microphone lease.

**The donor (LAFINA `speechEngineStore` `8febdf38`, `SpeechEngines.tsx` `4fa02428`):**

- It stores a 0.5–2.0 rate and pitch, an optional engine package and Whisper/Android recognition.
- It plays and probes through a Kotlin bridge (`LafinaAndroidSpeech`) that AGY does not have.
- Its default is Kokoro, which AGY forbids.

**What the pinned wrapper does (read from `node_modules/react-native-tts`, Android `TextToSpeechModule.java`):**

- `setDefaultRate(rate, skipTransform)`:
  - **Without `skipTransform`,** the wrapper's 0..1 scale is mapped piecewise to Android: `r < 0.5 → 2r`, else `4r − 1`. So 0.5 is normal and 1.0 is three times faster.
  - **With `skipTransform = true`,** the value goes to `TextToSpeech.setSpeechRate` unchanged, where 1.0 is normal.
- `setDefaultPitch(p)` → `TextToSpeech.setPitch(p)`, where 1.0 is normal.
- `voices()` reports each voice's `networkConnectionRequired` and `notInstalled` (`KEY_FEATURE_NOT_INSTALLED`) as booleans. Some engines throw while listing, and the wrapper then returns an empty list.
- `speak` returns `utterance.hashCode()` as the utterance id. Events carry `{utteranceId}`. Two identical texts therefore share an id.
- `setDefaultEngine` shuts down the one shared `TextToSpeech` instance and creates a new one.

## Decision

1. **No choice means AGY's behavior, unchanged.** With no saved choice, or after Reset, the app:
   - picks the voice automatically, exactly as before;
   - never calls `setDefaultRate` or `setDefaultPitch`, so the engine's own speed and pitch apply.

   Cloud speech selection, timeouts, cancellation and audio-file cleanup are unchanged.
2. **Explicit choice, per account, on this device.** It is stored in `local_settings` key `speech_tts_v1` as `{version:1, revision, explicit, voiceId, rate, pitch, updatedAt}`:
   - Writes are revision- and owner-checked (the AGY-PORT 07 rule).
   - It is never synced.
   - Guest link keeps the account's own choice (see `speechSettingsStore.transferFromGuest`).
   - App applies the signed-in account's choice on every owner change and returns to the default on sign-out.
3. **Speed and pitch.**
   - Both are factors from 0.5 to 2.0 in steps of 0.25, rounded to two decimals; 1.0 is normal.
   - Speed is sent as `setDefaultRate(factor, true)`, which bypasses the wrapper's nonlinear transform. The donor's factor is therefore not fed into the wrapper's 0..1 scale.
   - Pitch is sent as `setDefaultPitch(factor)`.
   - Out-of-range or non-finite values are refused on save, and a corrupt stored value counts as unavailable.
   - Once a choice exists, speed and pitch are explicit (1.00× is normal speed, not the system's own speed setting). Reset sends 1.0 and 1.0 once, then stops sending them.
4. **Which voices may be chosen.**
   - Only English voices whose metadata says, as booleans, `notInstalled === false` and `networkConnectionRequired === false`. Missing metadata is unknown and is not listed.
   - A saved voice that is no longer eligible is not applied. The automatic voice speaks, and the sheet says so.
   - Nothing is downloaded and no install screen is opened.
5. **Readiness.**
   - **Engine start** is bounded (`TTS_INIT_TIMEOUT_MS` 5 s). The voice list and each setting are bounded at 3 s.
   - **A late engine answer** cannot mark a timed-out attempt ready; a later call tries again.
   - **Two separate states:** the service is ready / unavailable / did not respond, and English is ready / missing / unknown.
   - **Failure is shown in the sheet,** together with the note that text and typing still work.
6. **Owned playback.**
   - Each utterance has a token, and engine events are matched to its utterance id. This includes an event that arrives before the id is known.
   - A Preview's Stop stops only that Preview. The existing app-wide stop (calls, voice sheet, chat) keeps its meaning and also ends a Preview.
   - Preview is refused:
     - while anything else speaks;
     - while the microphone capture slot is held;
     - while a meeting records. A recording check that does not answer within 1.5 s counts as recording.
   - Leaving the app, closing the sheet or an owner change stops the sheet's own Preview only.
   - A rejected `speak` request now fails instead of waiting for the safety timeout.

## Provider and engine scope

- **TTS engine (provider package) choice: deferred.** `setDefaultEngine` replaces the shared engine instance, which would cut off an active reminder call's speech. Doing it safely needs either the donor's native bridge or a coordinated lifecycle. The system default engine stays in use.
- **Android on-device speech recognition: deferred.** AGY has no native `SpeechRecognizer` bridge. Adding one is new Kotlin under the microphone lease and needs device validation. Whisper stays the only recognizer, on all Android versions. This matches spec item 5's allowance to defer that engine alone.
- **Cloud voice parameters:** unchanged. Gemini audio ignores the local speed, pitch and voice. Its local fallback uses them.

## Consequences

- Students without a choice hear exactly what they heard before.
- A chosen voice that Android later removes falls back to the automatic voice, with a notice.
- Identical queued texts share an Android utterance id (a wrapper limitation). The first one's finish can end the wait for the second. The text is the same, and the existing safety timeout still bounds it.
