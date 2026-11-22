# Backend handoff: skill tools for Call LAFINA (ADR-041)

No `LAFINA-backend` checkout exists on this machine, so this is a handoff, not a `git apply` patch. Nothing was pushed or deployed.

## What changed in this repo

- `src/ai/voiceActions/actionRegistry.ts` adds two client tools:
  - `open_lafina_skill(skill, action?, breakKind?, count?, topic?, material?)` opens one study skill. The app ends the call and opens it, and only when the student's own words asked; otherwise the app shows a button.
  - `read_skill_status(topic)`: Pomodoro time left, flashcards due, GWA, or the last quiz score. Read only.
- `backend_integration/call_lafina_v2/tool-contract.json` was regenerated with `node backend_integration/call_lafina_v2/generate-contract.cjs`; `--check` passes. It now lists 16 tools.
- `backend_integration/system_prompt_voice.txt` and the in-app `LAFINA_VOICE_SYSTEM_PROMPT` gained one rule: "When the student asks to use a study skill … call open_lafina_skill; the app ends the call and opens it, so say only the line its result gives you. You never make flashcards, quizzes or documents on the call yourself …"

## Owner steps (backend)

1. In `LAFINA-backend`, add the two entries from `tool-contract.json` → `elevenlabsClientTools` to the agent's client tools. This is the list `scripts/provision_voice_agent.py` provisions.
2. Add the prompt rule above to the backend's voice system prompt.
3. Re-provision the ElevenLabs agent and redeploy.
4. Optional: add the two `deepseekTools` entries to the `/v1/ai/chat/agent` allowlist. The app's Chat already answers skill requests on the device, so this is not required.

## Until then

Online calls already hand off: the device reads the student's words ("start a pomodoro") and tells the agent, through a contextual update, which one line to say. The tools add the model's own path, for example a phrasing the device does not recognize, which then becomes a button.
