# 15 — Toolchain and Dependency Policy

## Do not lock unsupported versions in advance

At Phase 00 inventory the old project and current compatibility, then pin exact tested Node/npm, React Native, React/TS, Java, Gradle, Android SDK/NDK, Kotlin, CMake and native modules. Don't automatically upgrade to newest versions in the middle of porting unless required for platform support and approved. Record toolchain reproducibility in README.

## Prefer

- React Native/TypeScript strict; Kotlin bridge to AlarmManager/TextToSpeech/SpeechRecognizer, and existing Whisper C++ bridge only where justified.
- SQLite driver already known in old repo (`@op-engineering/op-sqlite` as a candidate) **after native build testing**, rather than unverified SQLite replacement.
- `@react-native-community/datetimepicker` or current tested equivalent for local dates.
- Jest, React Native Testing Library, ESLint, Prettier; Gradle Android test support.
- Graphify command only if confirmed compatible and helpful; include `.graphifyignore` to exclude third-party native source trees and generated files.
- Backend FastAPI/Pydantic/Pytest/Ruff only Phase 09+; Pinecone retrieval client only Phase 10+.

## Reject unless an ADR approved

User auth SDKs; Firebase/Auth0; business CRM/group packages; unneeded charting/animation dependencies; cloud model SDK included in mobile bundle; heavy speech models downloaded from unverified mirrors; background polling libraries that violate Android constraints; unrelated app skills/third-party account connectors.

## License verification

Track each third-party dependency, model and asset with original repository, version/revision, license, link, checksum where possible, size, reason, redistributability and replacement options. Do not ship third-party model files before documenting their terms.
