# Real providers on this PC and in the test APK

This temporary profile uses real DeepSeek streaming and ElevenLabs fast TTS through a server on this PC. It is a normal LAFINA app build, with package **`com.lafina.capstone.providers`**, separate from other installed apps. Internet is still needed for the providers. Local routing removes the hosted-server hop; it cannot guarantee instant responses.

The owner requested these testing defaults:

- Local server: `http://127.0.0.1:8000`, reached over USB with ADB reverse.
- A signed-in account starts in Online Mode if it has no saved mode preference. An explicit Offline choice stays off; guests remain offline.
- Speech defaults to `latency: low`, using `eleven_v4_turbo` on the local server. DeepSeek uses `deepseek-flash` and streams replies.
- The saved online voice is retained; the server default is Camille.
- Microphone capture still requires Answer, push-to-talk or Start. Starting the app does not start recording.

Provider keys remain in this checkout's private `.env` and are read by the PC server. The APK contains no provider keys. The build script audits the configured keys against every APK entry before reporting success.

## Run the local server

This workspace already has the reference backend checkout and Python dependencies at `.local/elevenlabs-backend-work/.venv`. The runner exports the reviewed conversation commit `a3d1671ff6ac6d4c3df1cf7e36a7ec795e7233f8` with read-only `git archive` into `.local/voice-conversation-backend/a3d1671`. It verifies file hashes on later starts. It does not check out, edit or run the memory branch. The memory checkout stays on `codex/chat-memory` at `45f65a7`.

The server uses a separate SQLite database and persistent local signing keys under ignored `.local/provider-testing/`; it does not use the production database, seed production accounts or deploy anything. Existing local phone sign-ins survive a server restart.

For this isolated QA server only, the daily voice-session allowance is 12 instead of the production default of 6, so earlier diagnostic sessions do not prevent phone testing. Session duration and turn limits remain in force. The production server's quotas are unchanged.

The pinned voice snapshot predates chat memory. The local runner adds a temporary, request-isolated adapter that supplies the phone's saved memories to DeepSeek for both regular and streamed chat. Memories stay on the phone and are sent only with requests that include them; the adapter does not store them. It does not expose the memory extraction endpoint or alter/deploy the memory branch. The narrow study-time preference is saved locally by the app. Live voice calls receive the current reminder as context; they do not currently receive the phone's saved chat memories.

From the capstone root:

```powershell
npm run providers:server
```

Leave the process running while testing. Stop with Ctrl+C when run in a terminal. The server binds to loopback only. `.env` must contain the existing `DEEPSEEK_API_KEY` and `ELEVENLABS_API_KEY`; never put them in source files or the APK. Other `.env` settings and production database/signing credentials are not loaded by this runner. Handbook RAG is not configured by this minimal provider runner.

## Build and install

For a physical ARM64 Android phone:

```powershell
npm run providers:apk -- -Architecture arm64-v8a -Install
```

For the x86_64 emulator:

```powershell
npm run providers:apk -- -Architecture x86_64 -Install
```

Have one device/emulator connected for `-Install`. If several are connected, omit that switch and target the intended serial explicitly:

```powershell
adb -s DEVICE_SERIAL reverse tcp:8000 tcp:8000
adb -s DEVICE_SERIAL install -r .local/provider-testing/LAFINA-providers-arm64-v8a.apk
```

APKs, hash receipts and build logs are under `.local/provider-testing/`. Installation uses `-r`; do not uninstall or clear app data. The provider APK has its own package and cannot overwrite the existing app's account/data.

The build uses `-PlafinaProviderTesting=true` on `dataQa`. It generates the normal app bundle from the physical checkout path, assembles using a temporary unused `L:` alias, verifies that the packaged bundle matches, and removes the alias. No synthetic conversation fixture is included.

## First run and manual checks

1. Connect the phone by USB, enable USB debugging, start the PC server and apply ADB reverse. Open **LAFINA** from the provider test APK.
   In Profile → Developer → Server, verify **Local**. A previously saved **Vercel** selection overrides the build's local default; switching servers signs out the previous server session and preserves planner data. Use a local test account after switching.
2. Register a synthetic account on this local server, or sign in with an existing local test account. Production credentials/accounts are separate. Expect Chat to show Online by default on a new signed-in account.
3. Ask a short academic question. Expect a streamed DeepSeek answer. Open Profile → Online Voice → Preview; expect a real ElevenLabs completion result and audible selected-voice playback.
4. Open push-to-talk or type a command in the voice sheet. Expect fast-model online speech when available, and an explained native-voice fallback if it fails. Planner changes still need Confirm.
5. Turn Offline Mode on, close/reopen the app, and confirm it stays offline. Manual text and planner UI should remain usable when the PC server is unavailable.
6. Test a reminder with Answer, Snooze and Acknowledge. Acknowledging must not complete the linked task. Check microphone release after End/backgrounding.

Physical-phone audibility, echo, routing, locked/background alarms and reboot recovery require device validation. An emulator or a mocked test cannot certify them.

## Pause-aware live conversation

The local server now includes `/v1/ai/voice/capabilities`, session management and the streamed custom-LLM callback. These routes were absent from the previously selected memory snapshot, causing **Not Found**. Missing agent configuration now gives a setup explanation; it does not mean a live conversation is ready.

In **ElevenLabs → Developers → API Keys**, enable **ElevenAgents / Conversational AI: Read + Write**, **Text to Speech**, and **Voices: Read** for the PC's private key. The owner saved these permissions on 2026-11-09; live agents/secrets reads now return HTTP 200. No further key-permission change is currently indicated. Keys stay on this PC.

ElevenLabs needs a public HTTPS URL to call the local DeepSeek backend. USB reverse only connects the phone to the PC; ElevenLabs cannot reach that address. Expose **only port 8001**, the callback-only gateway, through an approved temporary HTTPS tunnel. Never tunnel the full backend on port 8000. The gateway checks the shared secret; the backend then checks a short-lived per-session grant. Account/admin/chat routes and API docs are unavailable on the gateway. HTTPS termination at a tunnel provider means that provider carries the callback requests; use synthetic testing content.

Start the gateway in a separate terminal:

```powershell
& ./.local/elevenlabs-backend-work/.venv/Scripts/python.exe scripts/local_voice_callback.py
```

After approving the tunnel, run its managed helper in another terminal:

```powershell
& ./.local/elevenlabs-backend-work/.venv/Scripts/python.exe scripts/run-local-voice-tunnel.py
```

This uses Windows SSH, offers no personal SSH key, pins the accepted host key in the private test directory, and tunnels only the gateway. It verifies each new HTTPS host and provisions/updates the dedicated test agent. It suppresses raw tunnel banners, QR codes and connection IPs. Current non-secret status is in `.local/provider-testing/tunnel-status.json`.

The free service was observed changing its host during this test, while the SSH process remained running. The helper updates the agent when that happens. **Restart a conversation opened before the host changed**: ElevenLabs can retain the previous callback URL for that conversation. This is a temporary test tunnel with a speed limit and no uptime guarantee. A stable HTTPS tunnel/domain is needed for uninterrupted longer testing. The helper reports failures; do not test until it prints `Callback tunnel ready`.

For a different approved stable HTTPS tunnel, use its origin to dry-run, then provision manually:

```powershell
& ./.local/elevenlabs-backend-work/.venv/Scripts/python.exe scripts/provision-local-voice-agent.py --server-url https://YOUR-TEMPORARY-HOST
& ./.local/elevenlabs-backend-work/.venv/Scripts/python.exe scripts/provision-local-voice-agent.py --server-url https://YOUR-TEMPORARY-HOST --apply
```

`--apply` creates the **LAFINA local phone testing** agent and a separate local-test callback secret in ElevenLabs. It records their IDs privately, so later calls update that agent and reuse its secret. It never selects an agent from the root `.env`. Local settings are stored in `.local/provider-testing/voice-agent.json`; do not paste that file into chat or commit it. Restart `npm run providers:server` after provisioning to load the ID.

The agent uses DeepSeek through the custom-LLM callback, Camille, PCM 16 kHz in/out, **patient** turn-taking, a 15-second turn timeout, signed-URL authentication, and a five-minute session limit. Live agent configuration, a real custom-LLM SSE reply and generated ElevenLabs audio were verified on 2026-11-09. The Infinix connected, transcribed a short greeting and received a reply. A configured patient detector is not proof that natural pauses work well on the phone; human audibility/pause checks remain required.

Check **Voice conversation (Online) → Start** on the installed provider app. Speak a short academic question, pause mid-sentence, then finish it. Expect LAFINA to wait and answer once. Interrupt a spoken reply; expect playback to stop and listening to resume. End and background the app; expect microphone capture to stop. Actual audibility, echo, pause timing and interruption behavior remain human/device checks. See [the full manual checks](../qa/PHASE-09-VOICE-CONVERSATION-MANUAL.md).

For a simulated reminder call in Online Mode, tap **Answer**. The first time, review the disclosure and choose **Continue online** to allow the reminder and conversation to be sent for processing; choosing offline voice keeps the existing offline call path. LAFINA announces the reminder, starts online conversation, and sends that reminder as context. End, Acknowledge and Snooze remain available; direct spoken acknowledgments and snooze requests use the same reminder actions. If online startup or the connection fails while the app is active, the call falls back to offline voice when possible. Leaving the screen stops conversation capture and keeps manual controls available.

Known device follow-up: **typed turns while muted did not reliably produce an assistant reply** during this run. The keyboard/input clipping was fixed and installed, but that does not certify the muted typed-response flow. Spoken recognition/reply and clear playback were observed and human-confirmed. See [the local conversation report](reports/phase-09-local-conversation-backend-report-20261109.md).

Stop the SSH tunnel and gateway with Ctrl+C after testing. Stopping the tunnel removes cloud access to the PC callback; ordinary USB chat/TTS can continue with the backend on port 8000. Do not choose Cloudflare Quick Tunnels for this custom-LLM flow: they do not support SSE.

Provider references: [ElevenLabs custom LLM](https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm), [agent authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication), [localhost.run](https://localhost.run/docs), [no-key SSH](https://localhost.run/docs/faq), [Cloudflare SSE limitation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Revert the testing defaults

Build normally without `-PlafinaProviderTesting=true`, or use the existing normal APK. The flag defaults to false; release builds never enable it. No source rollback is required. The test package can stay installed separately, and its explicit Offline choice is respected. Stop the local server and remove its ADB reverse mapping when finished:

```powershell
adb -s DEVICE_SERIAL reverse --remove tcp:8000
```
