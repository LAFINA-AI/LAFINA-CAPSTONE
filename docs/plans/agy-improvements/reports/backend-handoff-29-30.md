# Backend handoff: inventory #29 and #30 (DEFERRED_EXTERNAL)

The backend is outside the writable project. Nothing here was deployed, probed live, or edited in `LAFINA-backend`, and there is no local checkout of it on this machine. Every existing online feature stays enabled: accounts, sync, Chat/RAG, documents, meetings and entitled cloud speech.

## #29 Event-time sync compatibility

### What landed in the client (AGY-PORT 08, `7dd3454`)

| Item | Exact behavior | Tests |
|---|---|---|
| Overnight events | Use the convention AGY devices already read: an end before the start ends the next day. Nothing new is sent | `__tests__/storage/agyPort08EventTime.test.ts`, `__tests__/ui/agyPort08EventForm.test.tsx` |
| Seven-type wire frozen | The event payload keeps exactly its seven keys for create, update, guest re-create and reviewed move. `syncWorker.ts` and the payload builders are unchanged | `agyPort08EventTime`; `agyPreservedContracts` PF04 |
| Old-server round trip | A fake server that **rejects any unknown event field** accepts every push from the real `runSyncPass`, and nothing is left pending | `agyPort08EventTime` |
| Local-only metadata | `time_zone`, `start_at`, `end_at`, `start_fold` and `end_fold` in the device-local table `event_time_local`. These are never synced | same; [ADR-021](../../../decisions/ADR-021-event-time-local-metadata.md) |

### Limitations that remain until the backend changes

- **No cross-device timezone retention.** Other devices, and this device after a reinstall and sync, see the event as floating wall time. When another device changes the time, the event becomes floating here too.
- **No events longer than 24 hours.** The frozen wire cannot express them: the form refuses them, and imports skip them with a count.
- **Floating recurring and `RECURRENCE-ID` imports.** They keep the legacy floating expansion.

### External backend work still required

These must be done by someone with backend access, in this order:

1. **An omission-aware event contract.**
   - The server stores optional `time_zone` and instant/fold fields.
   - It **keeps** them when an old client sends an update that omits them, and clears them only on an explicit null.
   - Contract reference (read-only, not copied): donor backend `event_payload.py` at `4b6206b9` and `test_event_time_contract_isolated.py` at `0f8d7595`.
2. **A capability signal**, for example `event_time_contract_version: 1` in the public health response (see #30). The client must not send the new fields until the server it talks to advertises this version.
3. **After 1 and 2 are deployed and verified:**
   - a client change that sends the local-only fields behind that capability;
   - a test against the old-server fake (still no new fields);
   - a test against a new-server fake (fields round-trip, and omission keeps them).

   This is a later client phase. It is not started here.

## #30 Backend identity and integration

### Preserved (verified on 2026-11-06)

- `src/cloud/cloudClient.ts` keeps `CLOUD_API_BASE_URL = https://lafina-backend.vercel.app` with the `http://127.0.0.1:8000` development fallback. `git diff b9433dc..HEAD` shows no change to either host.
- No backend source, deployment, host replacement, credential or environment file was touched or read.

### Proposed identity and probe (not implemented in this client repo)

1. **Public deployment identity on the existing health route** (backend change).
   - Contract reference: donor `backend/app/services/deployment_health.py`, read-only.
   - The response adds `event_time_contract_version`, a `build_revision` that is only a full 40-hex Git SHA from the host's automatic Git metadata (anything else becomes `null`), and a `deployment_provider`.
   - It must expose no arbitrary environment text.
2. **An owner-run, read-only probe** (reference: donor `scripts/check_backend_health.py`). Its rules:
   - HTTPS only, on a confirmed public host;
   - no credentials, query strings or admin paths;
   - no redirects followed, and public addresses only;
   - bounded timeouts;
   - the expected full revision is compared exactly;
   - the result is a fresh evidence JSON whose state is `UNAVAILABLE` unless the identity matches.

   It is deliberately **not** ported into this app repo, because AGY must not ship or run live probes. It belongs next to the backend or in an owner tooling folder.
3. **Access handoff.**
   - The donor's record (`docs/backend-deployment-verification.md` at `0d4bbe39`, dated 2026-11-05) shows the earlier attempt could not verify any deployment: the URL it tried returned 401, and the connected account had no project access.
   - **Required owner input:** the backend project's dashboard access, or the confirmed public production API URL, plus an authorized synthetic test-account flow.
   - Change the mobile host only after the replacement API has been positively identified and tested.

### Status

| Check | Status |
|---|---|
| Live health/identity probe | NOT_RUN (no access; no probe is required for this handoff) |
| Backend contract tests | NOT_RUN in this repo (backend not writable or present) |
| Client compatibility tests | PASS (see #29 above; fresh in `phase-13/preflight-1.log`) |
