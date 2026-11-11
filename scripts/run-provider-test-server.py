"""Local real-provider server. Run with the backend checkout's Python venv.

Reads provider keys from the private capstone .env, never from the APK.
Uses an isolated SQLite database and persistent LOCAL signing keys. No source
or configuration in the backend checkout is changed.
"""
import os
import json
import secrets
from pathlib import Path
import sys
from provider_test_backend import prepare_voice_backend

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.local' / 'provider-testing'


def configure_environment() -> Path:
    backend = prepare_voice_backend(ROOT)
    if not (ROOT / '.env').is_file():
        raise SystemExit('Private provider configuration missing: capstone .env')
    values = {}
    for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            name, value = line.split('=', 1)
            if name.strip() in {'ELEVENLABS_API_KEY', 'DEEPSEEK_API_KEY'}:
                values[name.strip()] = value.strip().strip('\"\'')
    if not all(values.get(name) for name in ['ELEVENLABS_API_KEY', 'DEEPSEEK_API_KEY']):
        raise SystemExit('Both provider keys must be configured in the private .env.')

    STATE.mkdir(parents=True, exist_ok=True)
    # Local-only configuration can be generated without editing/copying .env.
    agent_path = STATE / 'voice-agent.json'
    agent = {}
    if agent_path.is_file():
        agent = json.loads(agent_path.read_text(encoding='utf-8'))
        for name in ['ELEVENLABS_AGENT_ID', 'ELEVENLABS_AGENT_LLM_SECRET']:
            if not values.get(name) and agent.get(name):
                values[name] = agent[name]
    if not values.get('ELEVENLABS_AGENT_LLM_SECRET'):
        agent['ELEVENLABS_AGENT_LLM_SECRET'] = secrets.token_hex(32)
        agent_path.write_text(json.dumps(agent, indent=2) + '\n', encoding='utf-8')
        values['ELEVENLABS_AGENT_LLM_SECRET'] = agent['ELEVENLABS_AGENT_LLM_SECRET']
    # Retain local sign-ins across restarts without using production signing keys.
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    private_path, public_path = STATE / 'jwt-private.pem', STATE / 'jwt-public.pem'
    if not private_path.exists() and not public_path.exists():
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_path.write_bytes(key.private_bytes(serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        public_path.write_bytes(key.public_key().public_bytes(serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo))
    if not private_path.exists() or not public_path.exists():
        raise SystemExit('Local signing-key pair is incomplete; no keys were overwritten.')

    for name in list(os.environ):
        if name.startswith(('ELEVENLABS_', 'DEEPSEEK_', 'PINECONE_', 'HANDBOOK_')):
            os.environ.pop(name)
    os.environ.update(values)
    os.environ.update({
        'ENVIRONMENT': 'development',
        'DATABASE_URL': 'sqlite+aiosqlite:///' + (STATE / 'lafina.db').as_posix(),
        'DATABASE_URL_UNPOOLED': '', 'POSTGRES_URL': '', 'POSTGRES_URL_NON_POOLING': '',
        'ADMIN_EMAIL': '', 'ADMIN_PASSWORD': '', 'VERCEL': '', 'VERCEL_URL': '',
        'JWT_PRIVATE_KEY': private_path.read_text(), 'JWT_PUBLIC_KEY': public_path.read_text(),
        'JWT_ISSUER': 'lafina-local-provider-test', 'JWT_AUDIENCE': 'lafina-app',
        'DEEPSEEK_MODEL': 'deepseek-flash',
        # Isolated local QA account: allow repeat phone tests after earlier runs.
        # The production backend and its quotas are not changed.
        'VOICE_CONVERSATION_SESSIONS_PER_DAY': '0',
        'VOICE_CONVERSATION_TURNS_PER_DAY': '0',
        'ELEVENLABS_MODEL_ID': 'eleven_v4_turbo',
        'ELEVENLABS_FAST_MODEL_ID': 'eleven_v4_turbo',
        'ELEVENLABS_VOICE_ID': 'BtcCEANLn920ZIoN9grW',
    })
    # Work outside the backend directory so its .env cannot change the test setup.
    os.chdir(STATE)
    sys.path.insert(0, str(backend))
    return backend


def main():
    configure_environment()
    import uvicorn
    from app.main import app
    from app.api.v1 import ai
    from local_chat_memory_adapter import install_local_memory_adapter
    install_local_memory_adapter(app, ai)
    print('Local provider test listening on port 8000. On the phone use this computer’s Wi-Fi IPv4 address.', flush=True)
    print('Conversation routes loaded from isolated codex/voice-conversation snapshot.', flush=True)
    print('Local accounts/database only. Provider keys remain on this computer.', flush=True)
    uvicorn.run(app, host=os.environ.get('LAFINA_LOCAL_HOST', '0.0.0.0'), port=8000, log_level='warning', access_log=False)


if __name__ == '__main__':
    main()
