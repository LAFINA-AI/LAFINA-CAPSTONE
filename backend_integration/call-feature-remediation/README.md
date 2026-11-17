# Call feature backend remediation — deployed

The call prompt, planner contract and latency fixes are published to existing **LAFINA-AI/LAFINA-backend** main. Its Git-connected Vercel deployments completed successfully. Production remains **https://lafina-backend.vercel.app**.

Implementation: `6057d2bd7a69f13f417ff8448de31adca3026d44`; provider-schema follow-up: `dfbeecb9a9e9366a6cc41d7fb73635e1d1895c2e`. Patch base: `417f242191453a14fdf1b9fb49b80fadac5b1e4d`.

The [patch](call-feature-remediation.patch) and [SHA-256 manifest](manifest.json) represent the final seven files: the original five implementation/config files and two regression-test files. The extra test updates the existing mobile-contract assertion and adds no unrelated feature.

## Behavior

- Dedicated voice instructions replace the shared chat instruction that incorrectly denied planner changes. General chat persona stays unchanged.
- Online tools supply concise structured titles, dates/times, location and category; multiple items use the batch tool. Student confirmation stays on the phone. Model confirmation tools report receipts rather than authorizing saves.
- Ordinary conversation/scheduling skip handbook retrieval. Relevant policy questions retain retrieval with a two-second ceiling and citation requirements.
- The first tool-stream fragment starts the response stream promptly; complete arguments are validated before execution. Provider waits are bounded and transient failures receive a short truthful retry response.
- Server schemas retain `additionalProperties=false`, preserving shared chat validation. The provisioning adapter converts only the ElevenLabs schema subset and adds required nested descriptions without mutating server schemas.

## Existing agent update

The existing production agent was updated in place: **14 client tools**, the `client_tool_call` event and **normal** turn eagerness. Readback verified fields and constraints. All unrelated settings, including auth, voice, model, custom LLM endpoint, grant/secret references, privacy and workflow were preserved. No new agent or secret was created.

The minimal PATCH changed only `conversation_config.agent.prompt.tools`, `conversation_config.turn.turn_eagerness` and the added callback event in `conversation_config.conversation.client_events`. Do not run a full provisioning apply blindly against the live agent: it also sets other configuration and can create a secret.

## Verification and limitations

**288 backend tests passed in a fresh checkout**, critical Python lint passed, and the patch passed `git apply --check` against the pinned source. Full Ruff is not claimed. Vercel Git status reports successful deployments; public production health/OpenAPI respond 200 and missing-auth voice requests respond 401. No signed-in session, billable provider turn or physical-phone call was performed.

See the [deployment follow-up](../../docs/reports/call-feature-remediation/backend-deployment-follow-up.md), [deployment evidence](../../docs/reports/call-feature-remediation/deployment-status.json), [agent receipt](../../docs/reports/call-feature-remediation/live-agent-update.json) and [full tests](../../docs/reports/call-feature-remediation/backend-fresh-full-tests-final.log).

The owner approved the scoped exception after automatic review initially rejected publication under AGENTS.md. Connector GitHub writes returned 403, so publication used the configured native Git credential helper and normal fast-forward pushes. No PR was created. Direct Vercel project/log access remains unavailable; no private runtime error scan or monitoring inventory is claimed. No replacement project or environment change occurred.

## Manual validation and rollback

Start a **new call** in the QA app to load updated agent settings, then follow [MANUAL-CHECKS.md](../../docs/reports/call-feature-remediation/MANUAL-CHECKS.md). Naturalness and first-audio/card/interruption latency remain unmeasured; percentiles are targets only.

Rollback: revert only these two backend commits through the existing Git workflow and restore previous existing-agent tool/event/eagerness configuration from the ignored local pre-update snapshot. No migration or key rotation is involved.
