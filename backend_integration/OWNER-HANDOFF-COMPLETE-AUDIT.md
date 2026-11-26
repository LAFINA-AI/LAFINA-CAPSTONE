# LAFINA Backend — Vercel & Neon Setup Steps

Hey! I'm pushing the backend stability & performance update to `LAFINA-backend` (`main`). Here are the quick steps needed on your end (Vercel + Neon):

---

## Step 1 — Check Vercel Env Vars BEFORE I Push

Go to **Vercel → LAFINA-backend → Settings → Environment Variables** (Production) and make sure these are set:

- **Required** (the backend now strictly checks these on boot):
  - `DATABASE_URL`
  - `DEEPSEEK_API_KEY` (real key, not placeholder)
  - `JWT_PRIVATE_KEY`
  - `JWT_PUBLIC_KEY`
- **Optional (recommended, 10 seconds):**
  - Add `ADMIN_SESSION_SECRET` — any random 64-char hex string. You can generate one with:
    ```bash
    python -c "import secrets; print(secrets.token_hex(32))"
    ```
  - *(If you skip this, it will still work using a fallback derived from `JWT_PRIVATE_KEY`.)*

Once those look good, message me **"good to push"** so I can push `main`.

---

## Step 2 — Run Neon Migration After Vercel Deploys

After I push `main` and **Vercel** shows the deployment as **Ready**, pull `main` and run migration `015_audit_hardening` using your **direct** (non-`-pooler`) Neon connection string:

```bash
git pull origin main
```

**PowerShell (Windows):**
```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@YOUR-NEON-DIRECT-HOST/neondb?sslmode=require"
alembic current
alembic upgrade head
alembic current
```

**Bash (macOS / Linux):**
```bash
export DATABASE_URL="postgresql://USER:PASSWORD@YOUR-NEON-DIRECT-HOST/neondb?sslmode=require"
alembic current
alembic upgrade head
alembic current
```

Confirm the last command prints:
```text
015_audit_hardening (head)
```

---

## Step 3 — Quick Check

Hit the health endpoint to verify it's live:
```bash
curl https://lafina-backend.vercel.app/healthz
```
Expected: `200 OK` with `{"status":"ok",...}`.

### Optional (only if we're demoing ElevenLabs live voice + Skills)
With `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` set locally:
```bash
python scripts/provision_voice_agent.py
```

---

## Emergency Rollback (Just in Case)
- **Vercel:** **Deployments** → `...` on the previous working deployment → **Promote to Production** (1-click rollback).
- **Neon (only if needed):**
  ```bash
  alembic downgrade 014_chat_history_sync
  ```
