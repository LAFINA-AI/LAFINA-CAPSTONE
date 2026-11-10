# Call Lafina 2.0 — Physical Device Testing Matrix

> **Status:** `AWAITING_DEVICE` (100% of machine automated tests passed across all 15 suites; physical hardware device execution marked `DEVICE_NOT_RUN`).

This document provides the exhaustive manual test matrix for physical Android verification of Call Lafina 2.0. In accordance with the Capstone rules, no physical device capability is claimed without real hardware execution.

---

## Device & Environment Information

| Field | Value / Instruction |
| :---- | :------------------ |
| **Target Architecture** | Android 13+ (API 33 / 34 / 35), ARM64 |
| **Recommended Test Devices** | Google Pixel 7/8/9, Samsung Galaxy S22/S23/S24 |
| **Audio Peripherals** | Device Speaker, Wired USB-C/3.5mm Headset, Bluetooth LE Headset |
| **Network Conditions** | Wi-Fi (High speed), LTE/5G Mobile Data, Airplane Mode (Offline) |
| **Backend Endpoint** | `https://lafina-backend.vercel.app` (Dev fallback: `http://10.0.2.2:8000` / `http://127.0.0.1:8000`) |

---

## 1. Visual Presentation & Insets (Phases 01, 02)

| Test ID | Procedure | Expected Outcome | Result |
| :------ | :-------- | :--------------- | :----- |
| **DEV-01** | Open Call Lafina on short device / landscape mode. | Screen adapts cleanly; central avatar and waveforms remain visible; action card buttons stay above navigation bar. | `NOT_RUN` |
| **DEV-02** | Toggle device Dark/Light system theme while call is active. | Dynamic theme switches immediately using Semantic colors (`Colors.dark` / `Colors.light`) without flicker or audio reset. | `NOT_RUN` |
| **DEV-03** | Verify dual waveforms during assistant and student speech. | Assistant central waveform animates dynamically on output audio; secondary micro-waveform reacts to user mic level. | `NOT_RUN` |
| **DEV-04** | Enable OS "Reduce Motion" in Android Accessibility settings. | Waveform bar animations cease; static subtle pill indicates active speaking/listening state. | `NOT_RUN` |

---

## 2. Audio Routing, Echo Cancellation & Barge-In (Phases 03, 04, 14)

| Test ID | Procedure | Expected Outcome | Result |
| :------ | :-------- | :--------------- | :----- |
| **DEV-05** | Speak over Lafina while she is speaking through loud speakerphone. | Native AEC prevents echo; speech is recognized as user turn; Lafina immediately stops speaking (barge-in). | `NOT_RUN` |
| **DEV-06** | Connect and disconnect Bluetooth headset during active call. | Audio seamlessly switches between Bluetooth SCO/A2DP and internal speaker/mic without call crash. | `NOT_RUN` |
| **DEV-07** | Tap Mute button. Speak into phone mic. | Microphone is muted; waveform shows red muted indicator; no audio is sent to server. | `NOT_RUN` |
| **DEV-08** | Verify Android OS microphone indicator (green privacy dot in status bar). | Green mic dot appears only while call is active; disappears immediately when call ends. | `NOT_RUN` |

---

## 3. Multitasking, In-App Mini-Call & LifeCycle (Phase 13)

| Test ID | Procedure | Expected Outcome | Result |
| :------ | :-------- | :--------------- | :----- |
| **DEV-09** | Tap Minimize button during active conversation. | Full-screen modal dismisses; compact `MiniCallBar` docks above tab bar showing live duration timer. | `NOT_RUN` |
| **DEV-10** | Navigate between Calendar, Notes, and Chat tabs with mini bar docked. | Call audio and WebSocket connection continue uninterrupted; student can review notes while talking. | `NOT_RUN` |
| **DEV-11** | Tap Expand on MiniCallBar. | Full-screen call surface restores with all turns, transcript, and active cards preserved. | `NOT_RUN` |
| **DEV-12** | Tap End Call directly on MiniCallBar. | Call ends cleanly; mini bar dismisses; audio session releases. | `NOT_RUN` |
| **DEV-13** | Receive incoming scheduled Lafina reminder alarm call during Call Lafina. | Call Lafina yields audio focus cleanly; `IncomingCallScreen` takes priority without audio collision. | `NOT_RUN` |

---

## 4. Agentic Cards & Authoritative Confirmation (Phases 06–11, 15)

| Test ID | Procedure | Expected Outcome | Result |
| :------ | :-------- | :--------------- | :----- |
| **DEV-14** | Say: *"Remind me to study Operating Systems tomorrow at 3pm."* | Lafina prepares task draft card; states *"A review card is shown... Nothing has been saved."* Card displays with Confirm/Cancel. | `NOT_RUN` |
| **DEV-15** | Say: *"Change the time to 4pm instead."* | Draft card updates in-place to 4:00 PM; revision counter increments; nothing saved to SQLite yet. | `NOT_RUN` |
| **DEV-16** | Tap Confirm button on the review card. | Card transitions to confirmed state; task is written transactionally to SQLite; Lafina confirms: *"Task confirmed and saved."* | `NOT_RUN` |
| **DEV-17** | Say: *"I need to read Chapter 5 and do Exercise 2."* | MultiActionCard displays with 2 items; user can uncheck or edit individual items before confirming. | `NOT_RUN` |

---

## 5. Voice & Language Settings (Phase 12)

| Test ID | Procedure | Expected Outcome | Result |
| :------ | :-------- | :--------------- | :----- |
| **DEV-18** | Open Call Lafina Settings modal from header gear icon. | Select different voice (e.g. Rachel, Drew, Clyde). Tap Preview. Exclusive voice sample plays. | `NOT_RUN` |
| **DEV-19** | Switch language to Taglish or Cebuano. | Subsequent assistant responses adopt natural collegiate phrasing in chosen language. | `NOT_RUN` |
| **DEV-20** | Change caption size to Large or Extra Large. | Live transcript typography increases dynamically without text truncation or layout overflow. | `NOT_RUN` |
