# ADR-031: Background Call Feasibility, Platform Restrictions, and Multimodal Attachment Analysis

- **Status**: Approved / Documented Architectural Decision
- **Date**: 2026-11-10
- **Context**: Call Lafina 2.0 (Phase 13, Features F-054, F-055, F-056, F-057)
- **Deciders**: LAFINA-CAPSTONE Engineering Agent & Mobile Architecture

---

## 1. Context and Problem Statement

As part of Call Lafina 2.0 Phase 13, we evaluated two major proposed mobile capabilities:
1. **Background Voice Calls (F-055, P13-04..P13-06)**: Allowing a live voice conversation with Lafina to continue while the user navigates outside the LAFINA application or when the device screen locks.
2. **Multimodal Image/Photo Attachments (F-057, P13-07..P13-08)**: Allowing students to snap or attach photos during a live call to ask questions about lecture slides, textbooks, or campus notices.

Both capabilities carry significant privacy, battery, platform compliance, security, and backend feasibility implications for an Android-first academic secretary application.

---

## 2. Platform Research & Operating System Constraints (Android 14+)

### 2.1 Android Microphone Foreground Service Policy
Starting with **Android 14 (API level 34)**, Google introduced strict mandatory constraints on foreground services accessing device microphones:
- **Foreground Service Type**: Applications must declare `android:foregroundServiceType="microphone"` in the Android Manifest and hold the runtime permission `FOREGROUND_SERVICE_MICROPHONE`.
- **Foreground Start Requirement**: An app **cannot** initiate microphone capture from the background. The foreground service must be started while the app is in a visible, interactive foreground task state.
- **System Privacy Indicators**: Android displays an OS-level green privacy indicator in the status bar whenever any app accesses the microphone. Users can tap this indicator to identify the app and immediately revoke permission.
- **Notification Requirements**: A non-dismissible, persistent ongoing notification (`OngoingNotification`) must remain visible in the notification drawer with an explicit `Stop Call` action.

### 2.2 Google Play Developer Program Policy & User Privacy
Google Play Store policies strictly enforce the following:
- Apps may not record or stream microphone audio without clear, prominent disclosure and immediate user awareness.
- An academic assistant actively listening while running in the background during university lectures, library study sessions, or dormitory conversations poses severe privacy risks and potential violations of university academic honesty and wiretapping regulations.

### 2.3 Decision on Background Voice Calls (F-055)
- **Privacy-by-Default**: In accordance with `P13-05`, Call Lafina **defaults to stopping audio and disconnecting or pausing the live call immediately when the app enters the background or the screen locks**.
- **In-App Mini-Call Priority**: Instead of backgrounding the entire OS session, the primary student workflow is **In-App Multitasking (F-054)**: the student can minimize the full-screen call into a compact docked mini-bar (`MiniCallBar`) while navigating Calendar, Notes, or Chat *within* LAFINA without losing the call or duplicating audio connections.
- **Status for F-055**: Evaluated, documented, and marked `DEFERRED_APPROVAL` for OS-level backgrounding pending physical device validation and explicit owner authorization.

---

## 3. Multimodal Image Attachment Feasibility (F-057)

### 3.1 Backend LLM Architecture Review
A comprehensive inspection of `LAFINA-backend` and provider configurations reveals:
- The live voice conversation pipeline (`/v1/ai/voice/llm/chat/completions`) uses **DeepSeek Chat** (`deepseek-chat`).
- DeepSeek V3 / DeepSeek-R1 models deployed in `LAFINA-backend` are **pure text LLMs** without vision or image-tensor embedding capabilities.
- The ElevenAgents conversational WebSocket protocol exchanges PCM audio frames and client tool payloads; it does not support inline binary image transmission or image URL parsing for real-time turn generation.
- Providing a fake "camera attachment" button in the Call Lafina UI would violate the core architectural rule against optimistic, deceptive, or non-functional features.

### 3.2 Decision on Multimodal Attachments (F-057)
- In accordance with `P13-07` and `P13-08`, image attachment within the live voice call is classified as **`DEFERRED_BACKEND_UNSUPPORTED`**.
- Multimodal query support will be considered in future backend migrations when a vision-capable provider (e.g., Gemini 1.5 Flash/Pro with multimodal streaming) is deployed to `LAFINA-backend`.
- No deceptive, unbacked image upload button will be added to the live voice call interface.

---

## 4. In-App Mini-Call & Foreground Start Design (F-054, F-056)

### 4.1 In-App Mini Call Bar (F-054)
- **Component**: `src/ui/components/callLafina/MiniCallBar.tsx`.
- **Docking**: Docked cleanly above the navigation tab bar (`CustomTabBar`) during an active minimized call.
- **Controls**:
  - Identity ring and live elapsed duration timer (`testID="mini-call-timer"`).
  - Quick Mute/Unmute toggle button (`testID="mini-call-mute"`).
  - Quick End Call button (`testID="mini-call-end"`).
  - Tap-to-expand touch target (`testID="mini-call-bar"`) returning seamlessly to full-screen `CallLafinaScreen`.
- **Connection Preservation**: The underlying `VoiceConversationController` and WebSocket session remain mounted and active. No socket disconnect, no turn transcript reset, and no draft action card loss occurs during minimize or restore.

### 4.2 Start With Call Lafina Preference (F-056, P13-03)
- An opt-in preference `startWithCallLafina` stored in `callLafinaSettingsStore`.
- When enabled, opening Chat tab offers or launches Call Lafina directly, provided microphone permissions are granted.
- Respects microphone permission gates; never listens automatically without permission.

---

## 5. Summary Matrix

| Capability | Feature ID | Decision | Justification |
| :--- | :--- | :--- | :--- |
| **In-app Mini Call Bar** | `F-054` | **Implemented** | Seamless in-app navigation across Calendar, Notes, and Chat while call continues. |
| **Start with Voice in Chat** | `F-056` | **Implemented** | User-controlled opt-in preference for fast vocal secretary access. |
| **OS Background Live Call** | `F-055` | **Deferred / Privacy Gate** | Default stop-on-background enforced; OS foreground service deferred pending hardware phone testing. |
| **Multimodal Photo Attachments** | `F-057` | **Deferred / Backend Gate** | DeepSeek LLM route is text-only; no vision model currently deployed in backend. |
