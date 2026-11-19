"""Read-only: why recent Call LAFINA conversations ended, from ElevenLabs.

Prints one JSON line of metadata per conversation (end reason, duration, turn
counts). Never prints transcripts, URLs or keys.

    python -m backend_integration.call_history_check            # last 30
    python -m backend_integration.call_history_check --limit 40 --agent-id agent_...

Reads ELEVENLABS_API_KEY (and ELEVENLABS_AGENT_ID unless --agent-id is
given) from the private root `.env`. A healthy call ends as
`Client disconnected: 1000` (the student hung up); `custom_llm generation
failed` means the backend's answer was refused (see
docs/reports/call-connection-drops-20261119.md).
"""

import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.elevenlabs.io"


def _env(name: str) -> str | None:
    env = ROOT / ".env"
    if not env.exists():
        return None
    for line in env.read_text(encoding="utf8").splitlines():
        if line.strip().startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'") or None
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--agent-id", default=None)
    parser.add_argument("--limit", type=int, default=30)
    args = parser.parse_args()
    key = _env("ELEVENLABS_API_KEY")
    agent_id = args.agent_id or _env("ELEVENLABS_AGENT_ID")
    if not key or not agent_id:
        raise SystemExit("Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env (or --agent-id).")

    def get(path: str, **params):
        query = "?" + urllib.parse.urlencode(params) if params else ""
        request = urllib.request.Request(
            API + path + query, headers={"xi-api-key": key, "User-Agent": "lafina-diagnostics"}
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())

    items = get("/v1/convai/conversations", agent_id=agent_id, page_size=args.limit).get(
        "conversations", []
    )
    print("conversations:", len(items), flush=True)
    for item in items:
        detail = get(f"/v1/convai/conversations/{item['conversation_id']}")
        meta = detail.get("metadata", {}) or {}
        transcript = detail.get("transcript", []) or []
        roles = [turn.get("role") for turn in transcript]
        last = transcript[-1] if transcript else {}
        print(
            json.dumps(
                {
                    "id": item["conversation_id"][-6:],
                    "start": meta.get("start_time_unix_secs"),
                    "dur_s": meta.get("call_duration_secs"),
                    "status": detail.get("status"),
                    "termination_reason": meta.get("termination_reason"),
                    "error": meta.get("error"),
                    "user_turns": roles.count("user"),
                    "agent_turns": roles.count("agent"),
                    "tool_calls": sum(len(t.get("tool_calls") or []) for t in transcript),
                    "last_role": last.get("role"),
                    "last_at_s": last.get("time_in_call_secs"),
                    "last_agent_empty": last.get("role") == "agent"
                    and not (last.get("message") or "").strip(),
                },
                default=str,
            ),
            flush=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
