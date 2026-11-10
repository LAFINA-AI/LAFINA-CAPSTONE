# QA Manual Test Guide: Phase 14 — Reliability, Security, Privacy & Performance Regression

> **Status:** `AWAITING_DEVICE` (Machine gates `AUTOMATED_PASS`, physical Android checks `DEVICE_NOT_RUN`).

This checklist outlines the manual tests to be performed on a physical Android handset with active audio hardware (speaker, wired headset, Bluetooth headset) and microphone.

---

## 1. Physical Hardware & Audio Routing (P14-08, F-072)

| Step | Action | Expected Result | Device Result |
| :--- | :----- | :-------------- | :------------ |
| **1.1** | Connect Bluetooth headset. Launch Call Lafina. Speak to assistant. | Voice input captured via Bluetooth mic; assistant audio outputs through Bluetooth earpiece. | `NOT_RUN` |
| **1.2** | Disconnect Bluetooth during an active call. | Audio seamlessly switches to device speakerphone without crash or audio hang. | `NOT_RUN` |
| **1.3** | Verify Android status bar microphone indicator (green privacy dot). | Green mic dot appears while call is active; disappears immediately upon tapping End Call or minimizing when background mic is not permitted. | `NOT_RUN` |
| **1.4** | Check acoustic echo cancellation (AEC) at maximum speaker volume. | Lafina's speech playing through phone speakers is not picked up as user speech; no acoustic feedback echo loop. | `NOT_RUN` |

---

## 2. Telephony & System Alarm Coexistence (P14-02, F-060)

| Step | Action | Expected Result | Device Result |
| :--- | :----- | :-------------- | :------------ |
| **2.1** | Start a live Call Lafina session. Trigger a scheduled high-priority Lafina reminder alarm. | Incoming reminder call UI (`IncomingCallScreen`) appears; Call Lafina yields audio focus and ends gracefully. | `NOT_RUN` |
| **2.2** | Receive an incoming cellular / SIM phone call during Call Lafina. | OS pauses Call Lafina; microphone is yielded to phone dialer; no audio collision. | `NOT_RUN` |

---

## 3. Negative Network & Provider Paths (P14-03, F-061)

| Step | Action | Expected Result | Device Result |
| :--- | :----- | :-------------- | :------------ |
| **3.1** | Toggle Airplane Mode while in an active call. | Call UI transitions to "Call Lafina unavailable" / connection error within 5 seconds; retry button allows clean reconnect. | `NOT_RUN` |
| **3.2** | Test with invalid or expired backend credentials. | UI prompts "Your sign-in has ended. Sign in again in Profile"; offline tools remain accessible. | `NOT_RUN` |

---

## 4. Privacy & Log Verification (P14-05, F-069)

| Step | Action | Expected Result | Device Result |
| :--- | :----- | :-------------- | :------------ |
| **4.1** | Run `adb logcat -s LafinaVoiceConversation` during a session. | Inspect log output: verify no auth bearer tokens, signed URLs with session secrets, or private note contents appear in logs. | `NOT_RUN` |
| **4.2** | Inspect app private storage directory (`/data/data/com.lafina.capstone/`). | Verify zero unencrypted WAV/PCM voice recordings are saved to persistent disk. | `NOT_RUN` |
