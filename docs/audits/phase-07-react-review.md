# Phase07 React and command-boundary review

Date:2026-10-26, Asia/Manila. Scope: approved Phase07 only. This is a source
review, not a physical-device acceptance or performance measurement.

Reviewed `src/features/chat/ChatScreen.tsx`, `SpeechInputPanel.tsx`,
`useSpeechInputSession.ts`, their integration in `src/app/App.tsx`, and
`src/core/voice/ReplyMessage.tsx`. Independently checked
`src/core/ai/commandSession.ts`, `intents.ts`, `parseIntent.ts`,
`src/core/storage/commandQueries.ts`, `plannerRepository.ts` and
`reminderOperations.ts` for the write fences described below. No frozen
held-out cases or labels were read or changed for this review.

The installed **vercel:react-best-practices** skill was applied selectively:
effect/listener cleanup, dependency and event ownership, bounded rendering,
functional state updates, accessible controls and component boundaries.
Next.js, DOM, server authentication, network-fetch and Tailwind guidance does
not apply to this React Native, offline application. No web-specific refactor
or new dependency was introduced.

## Findings

**No actionable blocking defect was identified in the reviewed paths.**

| Concern | Observed source behavior |
|---|---|
| Review ownership | `ChatScreen` sends a string to the command session. Only a separate **Confirm change** action submits its private review ID; rendering messages and copying a speech draft perform no repository mutation. |
| Stale React frames | Editing the composer, backgrounding, discarding or clearing synchronously cancels the private pending review before the corresponding UI state update. A stale visible button cannot restore the cancelled proposal. New submissions invalidate older reviews. |
| Effects and cleanup | The Chat effect owns and removes its AppState listener and disposes the command session on cleanup. Retry/clear creates a fresh session. Current clock/preferences are read through a ref; a stable repository factory avoids reopening the session on ordinary reply or theme renders. |
| Speech ownership | Only an explicit hold enters the existing speech session. Before capture, optional reply playback is stopped/disposed. Copying reviewed words fills the composer; **Send message** and **Confirm change** remain separate. Closing the speech panel, sending, clearing or leaving Chat unmounts it and invokes existing cancellation/disposal guards against late callbacks. |
| Optional replies | Written results are rendered independently of optional system TTS. Only the latest assistant message owns `ReplyMessage`; Stop, replacement, background and unmount retain text while releasing speech ownership. No cloud or model operation blocks a scheduling result. |
| Bounded transient state | The composer is capped at2,000 characters, the conversation at40 rows, query results at finite pages, and returned text at a bounded length. No persistent chat-history or transcript write is added. These limits are not proof of acceptable low-RAM device performance. |
| Accessibility and themes | Message/draft editors have labels; actionable controls use the shared button implementation and semantic light/dark tokens. The review has a heading, exact summary and separate Confirm/Discard controls. Styles remain static except semantic colors. TalkBack, large-font layout, gesture usability and contrast on target hardware still require human review. |
| Recoverable failures | Planner-open failure offers Retry without resetting saved data. Parser, confirmation and speech errors retain typed/manual alternatives. Unsupported language or grammar is not presented as a successful action. |

## Independent service and storage fence check

- The parser produces typed data. The service revalidates that data and creates
  an expiring private proposal; neither raw JSON nor a message can select SQL,
  arbitrary tools or a caller-supplied saved ID.
- Exact-title lookup uses a fixed task/event table choice and a parameterized
  equality query, returning at most21 small identity rows. Duplicate titles are
  refused rather than choosing the first substring. SQLite's ASCII-only NOCASE
  behavior is documented; non-ASCII spelling is not silently case-folded.
- Confirmation rechecks the private review ID, five-minute age, non-reversing
  clock, timezone/default lead, current future alert time and saved target
  identity/version. A newly ambiguous title or changed/deleted item cannot pass
  the old review. A recurring-series move/delete is refused for manual review.
- ACK/SNOOZE requires one named, currently ringing reminder in the bounded
  view. The reminder ID/version, occurrence and job generation are compared
  again before use. The repository transaction independently enforces the
  current legal state, generation, occurrence and persisted response deadline.
  Expiry can become MISSED; it is not reported as an applied ACK or snooze.
  ACK does not perform task completion. A bare “okay” or targetless ACK does
  not select an alert automatically.
- Existing `BEGIN IMMEDIATE` mutation transactions preserve paired source,
  reminder/job writes and operation receipts. The same private token is kept
  for retry after a failed transaction; completed replies are cached in a
  bounded session map. Task/event edits also use repository version checks.
  Native reconciliation remains outside those SQL transactions and does not
  determine whether the durable text confirmation can render.

## Verification boundary

This audit changed only this Markdown file. It did not run a UI, JVM, native
build, emulator or physical-phone test and did not measure a speedup or memory
benefit. Earlier focused parser tests belong to the implementation work, not
native proof from this source review. The root phase report records actual
full-gate, APK, emulator, benchmark and cleanup outcomes separately.

Successful real microphone-to-command use, system voice audibility, OEM audio
interruptions, secure lock, TalkBack, low-RAM behavior and battery use remain
human/device checks. No source-review finding closes those gates or authorizes
Phase08.
