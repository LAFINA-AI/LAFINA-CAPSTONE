# Call Lafina 2.0 Task-Scoped Authorization Record

> Date: 2026-11-10T14:17:32+08:00
> Authorizing Agent Invocation: Call Lafina 2.0 Autonomous Frontend/Mobile Implementation
> Scope Target: `LAFINA-CAPSTONE` repository checkout (branch `feat/call-lafina-v2` based on `Lem-branch` commit `cae65fec4b0efc25dc343e3f30a4d216defa19aa`)

## Explicit Owner Authorization

The capstone owner explicitly authorized continuous, unattended implementation of all phases in this Call Lafina task pack (`CALL_LAFINA_AUTONOMOUS_TASK_PACK_V1`) inside the current `LAFINA-CAPSTONE` checkout. The agent is authorized to advance to the next mobile implementation phase after all machine-verifiable gates pass, without asking the owner to approve each mobile phase.

## Invariant Guardrails & Boundaries

1. **Local Repository Scope Only**:
   - Only `LAFINA-CAPSTONE` is writable.
   - `LAFINA-backend` and legacy `LAFINA` remain strictly read-only. No commits, pushes, migrations, or deployments shall be executed on them without separate explicit owner approval.
2. **Forbidden Functional Scope Preserved**:
   - All business dashboards, business roles (`manager`, `employee`, `business`), business tasks, and company chat remain forbidden.
   - All Gmail APIs, OAuth, and inbox screens remain forbidden.
   - All study tools (**Pomodoro**, **Flashcards**, **Study Notes**, and **Meetings** including meeting recording and document generation) remain forbidden.
   - Kokoro 82M ONNX model binaries and ONNX synthesis remain excluded.
   - Wake words, always-on microphones, and university portal integrations remain excluded.
3. **Security, Privacy & Hardware Truthfulness**:
   - Does not waive security/privacy rules, device validation, destructive-change prohibitions, release approvals, external account provisioning, or billing restrictions.
   - No paid APIs, passwords, or cloud credentials shall be fabricated.
   - Microphone capture is only active upon explicit student interaction in Online Mode and with OS permissions granted.
   - Android native audio, echo cancellation, hardware routing, and physical turn-taking must never be claimed verified solely from unit tests or mocks. All unperformed physical checks remain `NOT_RUN` or `AWAITING_DEVICE`.
   - A failed or unavailable check must remain `FAILED` or `NOT_RUN`.
