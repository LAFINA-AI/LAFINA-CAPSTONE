# PHASE 04 — Simulated Incoming Reminder Call UI & Call State Machine

> Read `AGENTS.md` first. Execute **only Phase 04** when approved.

## Objective

Migrate `LAFINA`'s simulated incoming reminder call experience (`IncomingCallScreen.tsx`, `src/ui/components/call/`, `src/scheduler/callStateMachine.ts`) with Answer, Snooze, Dismiss/Acknowledge, and voice/button response flows.

## Scope

1. **Incoming Call UI (`src/ui/screens/IncomingCallScreen.tsx`, `src/ui/components/call/`)**
   - Migrate `IncomingCallScreen.tsx` and call controls (`CallHeader`, `CallActions`, waveform/status indicators) matching `LAFINA`'s UI/UX.
2. **Call State Machine & Reminder Actions (`src/scheduler/`)**
   - Migrate `callStateMachine.ts` and wire incoming alarm triggers from `LafinaReminderModule` and `reminderPoller` to open `IncomingCallScreen`.
   - Support manual button actions (Answer, Snooze 5/10/15m, Acknowledge) even when TTS/STT are unavailable.
