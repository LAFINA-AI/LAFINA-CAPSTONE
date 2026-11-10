"""One explicitly invoked synthetic paid TTS check, without logging keys or audio data."""

import asyncio
import base64
import json
from pathlib import Path
from types import SimpleNamespace

from dotenv import dotenv_values
from pydantic import SecretStr

from backend_integration.elevenlabs_client import (
    ElevenLabsTtsClient,
    ElevenLabsTtsError,
)


async def main():
    values = dotenv_values(".env")
    settings = SimpleNamespace(
        ELEVENLABS_API_KEY=SecretStr(values.get("ELEVENLABS_API_KEY") or ""),
        ELEVENLABS_VOICE_ID=values.get("ELEVENLABS_VOICE_ID") or "BtcCEANLn920ZIoN9grW",
        ELEVENLABS_MODEL_ID=values.get("ELEVENLABS_MODEL_ID") or "eleven_v4",
        ELEVENLABS_MAX_CHARACTERS_PER_PROCESS=20000,
    )
    client = ElevenLabsTtsClient(settings)
    result = {"provider": "elevenlabs", "device": "NONE", "androidPlayback": "NOT RUN"}
    try:
        audio, _ = await client.synthesize_speech(
            "Hello. This is lafina's online voice.", "synthetic-smoke-20261107"
        )
        data = base64.b64decode(audio)
        Path(".local/elevenlabs-latest-smoke.mp3").write_bytes(data)
        result.update({"status": "PASS", "audioBytes": len(data)})
    except ElevenLabsTtsError as error:
        result.update(
            {"status": "FAIL", "httpStatus": error.status_code, "error": error.message}
        )
    finally:
        await client.close()
    target = Path(
        "docs/reports/evidence/phase-09-elevenlabs-20261107/live-provider.json"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))
    if result["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
