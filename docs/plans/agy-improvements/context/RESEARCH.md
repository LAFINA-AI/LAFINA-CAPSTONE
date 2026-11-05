# Research notes and primary sources

Checked 2026-11-06 (Asia/Manila). Distinguish observed repository facts in BASELINE.md from platform documentation and design choices. Refresh version-specific details if implementation starts later. No cloud/backend/phone was tested during preparation.

## Claude Code execution

- [Model configuration](https://code.claude.com/docs/en/model-config): pin the full `claude-opus-5-5` model ID rather than a moving family alias; documentation lists minimum Claude Code 2.1.280. Locally observed CLI 2.1.318. This does not verify account/provider access. The launcher must not silently substitute another model.
- [Permissions](https://code.claude.com/docs/en/permissions): Auto mode reviews actions without routine manual prompts. Prompt instructions do not change enforced permissions. Initial trust/login and managed policies can still block a run. This pack does not generate settings that bypass denials. Configure permitted tooling before leaving; denied tasks get recorded and independent work continues.
- [Subagents](https://code.claude.com/docs/en/sub-agents): isolated contexts help with focused implementation/review. Use explicit phase scope, exact-model inheritance and one writer; parent inspects actual diffs/checks. No automatic worktree-isolation default is assumed to start from the intended branch.
- [CLI reference](https://code.claude.com/docs/en/cli-reference): use explicit launch flags and documented resume workflow. The durable project reports are the recovery source even if a session transcript is unavailable. No automatically executed launcher is included.

## Android delivery and speech

- [Alarm scheduling](https://developer.android.com/develop/background-work/services/alarms): platform alarms operate beyond app-process lifetime but exact/inexact behavior and permission gates differ. Preserve native scheduling and record delivery constraints. A scheduling return value is not proof of notification/audio reception.
- [PendingIntent](https://developer.android.com/reference/android/app/PendingIntent): identity uses the underlying Intent matching properties; extras alone do not distinguish operation identities. Use explicit owner/occurrence/generation/action URI identities plus guards and test collisions/stale actions. The exact URI schema remains an application design choice.
- [SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer): use supported on-device APIs only after version/capability checks. Keep Whisper available on Android 11 and unsupported devices; do not assume requesting offline recognition installs a language pack or allows general network recognition.
- [react-native-tts upstream](https://github.com/ak1394/react-native-tts): voice entries expose network/installation metadata, initialization and owned lifecycle need checking, and the wrapper rate uses a normalized scale with optional transform bypass. The donor's speed-factor settings need an adapter. Verify exact pinned 4.1.1 source before implementation. Existing cloud speech remains separate and entitled; missing eligible local voices lead to text/recovery, not a network voice.

## SQLite

- [Transactions](https://www.sqlite.org/lang_transaction.html): only one concurrent writer; BEGIN transactions do not nest; lock contention needs deliberate handling. Native and OP-SQLite protocol changes need real synthetic database/instrumentation checks, not only mocked SQL calls.
- [PRAGMA reference](https://www.sqlite.org/pragma.html): `user_version` is application-managed, and journaling/integrity pragmas have operation/connection constraints. Inspect actual driver/native settings, use safe migration transactions, and avoid treating a copied version number as schema compatibility.

## Repository-derived conclusions

Read-only code inspection found valid online document/meeting/RAG orchestration in AGY even though older instruction text prohibited some of it. The owner's newer preservation request resolves that scope conflict. Therefore the stronger offline scanner must target real offline leaves while recognizing narrow online composition boundaries; deleting or permanently disabling those functions would violate the assignment.

Both mobile projects share major stack versions, but intent schemas, SQLite schema versions, package IDs, speech engines and test coverage differ. Preserve AGY's contracts and use selective adapters. Backend metadata/identity improvements 29–30 cannot be delivered by copying donor backend code into an unrelated mobile tree; preserve mobile compatibility and document external work instead.

These design conclusions are recommendations supported by the inspected code and documented platform constraints. They are not vendor guarantees, new test results, licensing opinions or performance claims.
