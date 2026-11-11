# Call Lafina 2.0 Blockers Ledger

This document tracks all external, device, or environment dependencies that cannot be closed solely by automated local mobile code changes.

## Current Blockers

### BLK-001: Physical Android Device Audio & Turn-Taking Verification
- **Discovered Date**: 2026-11-10
- **Category**: `DEVICE`
- **Affected F-IDs**: F-006, F-007, F-010, F-012, F-013, F-060, F-064, F-072
- **Observed Evidence**: Host Jest environment and local JVM tests use synthetic mocks (`node:sqlite`, mock AudioTrack/AudioRecord). Physical acoustics, microphone hardware release, OS indicator clearing, and Acoustic Echo Cancellation (AEC) cannot be certified without a physical Android test device.
- **Why it cannot be solved locally**: Acoustic echo cancellation and OS microphone indicator behavior depend on Android hardware HAL and physical speaker/mic coupling.
- **What owner must do**: Follow `qa/MANUAL_PHONE_CHECKLIST.md` with an installed `dataQa` APK on physical ARM64 test phone.
- **Validation Command / Test**: Interactive conversation test with speaker and headset; verify mute indicator shuts off and interruption halts speaker playback without acoustic feedback loop.
- **Status**: `DEVICE_NOT_RUN`
- **Attempts**: 0

### BLK-002: Live ElevenAgents Provisioning & DeepSeek Balance in Production
- **Discovered Date**: 2026-11-10
- **Category**: `EXTERNAL`
- **Affected F-IDs**: F-014, F-046, F-061, F-071, F-078
- **Observed Evidence**: Production server `https://lafina-backend.vercel.app` has routes `/v1/ai/voice/*` deployed and enforces auth (HTTP 401). Full live conversation session initialization requires valid server-side `ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_LLM_SECRET`, active ElevenLabs subscription permissions, and non-empty DeepSeek balance.
- **Why it cannot be solved locally**: Mobile repository does not hold ElevenLabs management API keys or Vercel server environment variables.
- **What owner must do**: Verify backend server configuration per `backend_integration/README.md` and test with an active student account in Online Mode.
- **Validation Command / Test**: `GET /v1/ai/voice/capabilities` with student token returns `{"enabled": true}`.
- **Status**: `EXTERNAL_BLOCKED`
- **Attempts**: Probed openapi.json (200) and unauthenticated voice capabilities (401).
