# Call Lafina 2.0 — Backend & ElevenAgents Tool Contract Proposal (Phase 06, P06-08)

> **REPOSITORY SAFETY NOTICE**: This file stages the proposed tool contract and ElevenLabs agent tool declarations strictly inside `LAFINA-CAPSTONE`. In compliance with `AGENTS.md` and phase rules, **no writes, commits, or deployments have been made to `LAFINA-backend`**. Backend verification status remains `EXTERNAL_BLOCKED`.

---

## 1. Overview & Architecture

Call Lafina 2.0 connects via a signed WebSocket to ElevenLabs ElevenAgents (`https://api.elevenlabs.io/v1/convai/conversation`).
ElevenLabs handles STT, turns, voice output, and barge-in, while delegating LLM completion and tool calling to the custom LLM route on `LAFINA-backend` (DeepSeek).

When the LLM decides to read or prepare student data, it emits a tool call. Because personal SQLite data and planner actions reside strictly on the student's mobile device, the server relays this to the mobile app as a `client_tool_call` event over the live WebSocket.

---

## 2. Declared Client Tools (OpenAI-Compatible Function Format)

The following tool declarations should be added to the ElevenLabs Agent configuration (under **Client Tools**):

### A. `read_lafina_data`
```json
{
  "name": "read_lafina_data",
  "description": "Reads the student's schedule/calendar, saved notes, or explicit memories from local device storage.",
  "parameters": {
    "type": "object",
    "properties": {
      "kind": {
        "type": "string",
        "enum": ["calendar", "notes", "memory"],
        "description": "The category of personal data to read."
      },
      "query": {
        "type": "string",
        "description": "Optional search term, date (YYYY-MM-DD, today, tomorrow), or subject title."
      }
    },
    "required": ["kind"]
  }
}
```

### B. `prepare_lafina_action`
```json
{
  "name": "prepare_lafina_action",
  "description": "Prepares a task, calendar event, time block, or reminder review card for student confirmation. Crucial: Nothing is saved until confirmed by the student.",
  "parameters": {
    "type": "object",
    "properties": {
      "request": {
        "type": "string",
        "description": "Natural language description of the item to create, schedule, or modify."
      }
    },
    "required": ["request"]
  }
}
```

### C. `save_lafina_memory`
```json
{
  "name": "save_lafina_memory",
  "description": "Proposes saving an explicit student fact, study habit, or preference. Presented clearly on a review card; nothing is saved without confirmation.",
  "parameters": {
    "type": "object",
    "properties": {
      "request": {
        "type": "string",
        "description": "The exact fact or preference the student explicitly asked to remember."
      }
    },
    "required": ["request"]
  }
}
```

---

## 3. WebSocket Event Flow

### 1. Inbound Event from ElevenLabs WebSocket to Mobile Client:
```json
{
  "type": "client_tool_call",
  "client_tool_call": {
    "tool_name": "prepare_lafina_action",
    "tool_call_id": "call_abc123",
    "parameters": {
      "request": "Submit capstone report on Friday at 5pm"
    }
  }
}
```

### 2. Client Action & Lifecycle:
- Mobile client sets phase to `tool_working` and shows truthful progress phrase (e.g. "Preparing task...").
- Mobile client validates parameters, owner identity, and session token.
- Mobile client builds in-memory proposal (`CommandProposal`) and presents review card.
- Crucial: **No database or reminder write is executed yet.**

### 3. Outbound Tool Result from Mobile Client to ElevenLabs WebSocket:
```json
{
  "type": "client_tool_result",
  "tool_call_id": "call_abc123",
  "result": "A review card has been presented to the student: Create task 'Submit capstone report' due Friday at 5:00 PM. Nothing is saved yet. The student must tap Confirm on the card to save it.",
  "is_error": false
}
```

---

## 4. Verification & Owner Handoff Instructions

When deploying this agent definition in the ElevenLabs Console:
1. Open the Call Lafina agent settings in ElevenLabs.
2. Add the three client tools (`read_lafina_data`, `prepare_lafina_action`, `save_lafina_memory`) with the schemas above.
3. Test using a signed-in student account in the app.
4. Verify that when asking "What is on my schedule tomorrow?", `read_lafina_data` is invoked and local items are read without throwing.

