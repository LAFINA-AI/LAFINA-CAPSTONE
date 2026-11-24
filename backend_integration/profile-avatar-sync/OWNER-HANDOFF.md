# Profile character avatar sync: backend handoff (2026-11-24)

**Status:**
- Mobile implementation and tests are complete in `LAFINA-CAPSTONE`.
- `LAFINA-backend` was **not** modified by this change (read-only boundary in `AGENTS.md`).
- **Safe to ship mobile first:** If the live backend has not deployed this patch yet, the mobile `syncWorker` detects a `profile` payload validation rejection for `avatar_seed`, strips `avatar_seed`, and retries cleanly with zero sync conflicts. Once this backend change is deployed, character avatars sync automatically across all signed-in devices.

## Product & Privacy Rule

- First-time users start with a **neutral default profile person silhouette** (`avatar_seed: null`).
- Only generated **character avatar seeds** (short opaque ASCII tokens like `char-m4k9p1-1-a8f3b2`) sync across devices via the existing `profile` sync entity.
- **Photos chosen from a student's phone stay on that phone only (`users.avatar_uri`).** They are never uploaded to or stored on `LAFINA-backend`. The backend validator below explicitly rejects file paths, URLs (`http://`, `https://`, `file://`, `content://`), and `data:` image payloads.
- **No database migration required:** `profiles_sync.payload` is already a JSON column.

## Scoped `LAFINA-backend` Change (`app/api/v1/sync.py`)

### 1. Allow optional, strictly validated `avatar_seed` on `ProfilePayload`

Add the constant and field + validator to `ProfilePayload` in `app/api/v1/sync.py`:

```python
import re

AVATAR_SEED_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
```

Inside `class ProfilePayload(BaseModel)`:

```python
    avatar_seed: str | None = Field(None, max_length=128)

    @field_validator("avatar_seed")
    @classmethod
    def validate_avatar_seed(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean = value.strip()
        if not clean:
            return None
        if ".." in clean or not AVATAR_SEED_RE.match(clean):
            raise ValueError(
                "avatar_seed must be an opaque character seed token (never a path, URL, or image data)"
            )
        return clean
```

### 2. Preserve existing `avatar_seed` when an older app build omits the field

In `sync_batch` (right after `validated_payload = validator(**mut.payload).model_dump()`):

```python
        if (
            mut.entityType == "profile"
            and "avatar_seed" not in mut.payload
            and existing_entity is not None
            and isinstance(existing_entity.payload, dict)
            and "avatar_seed" in existing_entity.payload
        ):
            validated_payload["avatar_seed"] = existing_entity.payload["avatar_seed"]
```

This guarantees:
- A newer client explicitly resetting back to the neutral person icon sends `"avatar_seed": null` -> clears `avatar_seed` to `null` across devices.
- An older client updating `dark_mode` or `username` omits `"avatar_seed"` -> preserves the account's saved character avatar instead of wiping it.

## Suggested Pytest Cases (`tests/test_profile_avatar_sync.py`)

```python
import pytest


@pytest.mark.asyncio
async def test_profile_sync_accepts_character_avatar_seed_and_null_reset(
    authed_client,
):
    base_profile = {
        "username": "Student",
        "wake_time": "07:00",
        "sleep_time": "23:00",
        "study_peak_hours": '["morning"]',
        "busiest_day": "Monday",
        "reminder_lead_minutes": 15,
        "snooze_tendency": "snooze_once",
        "weekly_class_count": "4-6",
        "longest_class_gap": "1 hour",
        "time_format_24h": False,
        "week_starts_monday": False,
        "dark_mode": False,
    }

    # 1. Set character avatar seed
    res1 = await authed_client.post(
        "/v1/sync/batch",
        json={
            "cursor": 0,
            "mutations": [
                {
                    "mutationId": "mut-avatar-1",
                    "entityType": "profile",
                    "entityId": "profile",
                    "operation": "create",
                    "baseVersion": 0,
                    "clientUpdatedAt": "2026-11-24T12:00:00Z",
                    "payload": {**base_profile, "avatar_seed": "char-demo-1-abc123"},
                }
            ],
        },
    )
    assert res1.status_code == 200
    body1 = res1.json()
    assert len(body1["accepted"]) == 1
    assert body1["changes"][-1]["payload"]["avatar_seed"] == "char-demo-1-abc123"

    # 2. Older client omitting avatar_seed preserves it
    res2 = await authed_client.post(
        "/v1/sync/batch",
        json={
            "cursor": body1["nextCursor"],
            "mutations": [
                {
                    "mutationId": "mut-avatar-2",
                    "entityType": "profile",
                    "entityId": "profile",
                    "operation": "update",
                    "baseVersion": 1,
                    "clientUpdatedAt": "2026-11-24T12:01:00Z",
                    "payload": {**base_profile, "dark_mode": True},
                }
            ],
        },
    )
    assert res2.status_code == 200
    body2 = res2.json()
    assert len(body2["accepted"]) == 1
    assert body2["changes"][-1]["payload"]["avatar_seed"] == "char-demo-1-abc123"

    # 3. Explicit null resets back to default neutral person
    res3 = await authed_client.post(
        "/v1/sync/batch",
        json={
            "cursor": body2["nextCursor"],
            "mutations": [
                {
                    "mutationId": "mut-avatar-3",
                    "entityType": "profile",
                    "entityId": "profile",
                    "operation": "update",
                    "baseVersion": 2,
                    "clientUpdatedAt": "2026-11-24T12:02:00Z",
                    "payload": {**base_profile, "dark_mode": True, "avatar_seed": None},
                }
            ],
        },
    )
    assert res3.status_code == 200
    body3 = res3.json()
    assert len(body3["accepted"]) == 1
    assert body3["changes"][-1]["payload"]["avatar_seed"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad_seed",
    [
        "file:///data/user/0/com.lafina.capstone/files/avatars/photo.jpg",
        "/documents/avatars/photo.jpg",
        "https://example.com/avatar.png",
        "data:image/png;base64,AAAA",
        "../secret",
        "a" * 129,
    ],
)
async def test_profile_sync_rejects_photo_paths_urls_and_data_uris(
    authed_client, bad_seed
):
    res = await authed_client.post(
        "/v1/sync/batch",
        json={
            "cursor": 0,
            "mutations": [
                {
                    "mutationId": f"mut-bad-{abs(hash(bad_seed))}",
                    "entityType": "profile",
                    "entityId": "profile",
                    "operation": "create",
                    "baseVersion": 0,
                    "clientUpdatedAt": "2026-11-24T12:00:00Z",
                    "payload": {
                        "username": "Student",
                        "wake_time": "07:00",
                        "sleep_time": "23:00",
                        "study_peak_hours": '["morning"]',
                        "busiest_day": "Monday",
                        "reminder_lead_minutes": 15,
                        "snooze_tendency": "snooze_once",
                        "weekly_class_count": "4-6",
                        "longest_class_gap": "1 hour",
                        "time_format_24h": False,
                        "week_starts_monday": False,
                        "dark_mode": False,
                        "avatar_seed": bad_seed,
                    },
                }
            ],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["accepted"]) == 0
    assert len(body["rejected"]) == 1
```

## Owner Rollout Checklist

1. Apply the `ProfilePayload` change and `sync_batch` preservation check in `LAFINA-backend/app/api/v1/sync.py`.
2. Add and run `pytest tests/test_profile_avatar_sync.py`.
3. Deploy `LAFINA-backend`.
4. Verify with two phones signed into the same student account:
   - First-time user starts with the neutral default person silhouette.
   - Picking a character avatar on Phone A syncs to Phone B on the next sync pass.
   - Resetting to default avatar on Phone A returns Phone B to the neutral silhouette.
   - Picking a phone photo on Phone A shows only on Phone A and never appears on Phone B.
