"""Run the approved callback-only SSH tunnel and update its LOCAL test agent.

Requires local_voice_callback.py on loopback:8001. No account/admin routes are
tunneled. Free hosts can rotate: new sessions use the updated agent, but an
already-open conversation may need restarting. Ctrl+C closes this tunnel.
"""
import json
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone

import httpx

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.local' / 'provider-testing'


def main():
    STATE.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=15, trust_env=False) as client:
        if client.get('http://127.0.0.1:8001/health').json() != {'status': 'ok'}:
            raise SystemExit('Start the callback gateway on loopback:8001 first.')
    command = ['ssh', '-T', '-F', 'NUL', '-o', 'IdentityAgent=none',
        '-o', 'IdentitiesOnly=yes', '-o', 'IdentityFile=none', '-o', 'BatchMode=yes',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'UserKnownHostsFile=.local/provider-testing/tunnel-known-hosts',
        '-o', 'ServerAliveInterval=30', '-o', 'ExitOnForwardFailure=yes',
        '-R', '80:127.0.0.1:8001', 'nokey@localhost.run', '--', '--output', 'json']
    status = STATE / 'tunnel-status.json'
    origin = None
    # Do not relay the raw SSH output: it includes a QR code and connection IP.
    with (STATE / 'tunnel-ssh-error.log').open('a', encoding='utf-8') as error:
        process = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE,
            stderr=error, text=True, encoding='utf-8', errors='replace')
        try:
            for line in process.stdout:
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                if event.get('type') != 'v1.tcpip_forward.register.accepted':
                    continue
                match = re.search(r'https://[a-z0-9.-]+\.(?:lhr\.life|localhost\.run)\b', event.get('data', ''))
                if not match or match[0] == origin:
                    continue
                origin = match[0]
                record = {'origin': origin, 'pid': process.pid,
                    'updated_at': datetime.now(timezone.utc).isoformat(), 'agent_updated': False}
                status.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
                try:
                    with httpx.Client(timeout=20, trust_env=False, follow_redirects=False) as client:
                        health = client.get(origin + '/health')
                        health.raise_for_status()
                        if health.json() != {'status': 'ok'}:
                            raise ValueError('health')
                    result = subprocess.run([sys.executable, str(ROOT / 'scripts/provision-local-voice-agent.py'),
                        '--server-url', origin, '--apply'], cwd=ROOT,
                        capture_output=True, text=True, timeout=90)
                    if result.returncode:
                        print('Callback agent update failed. Run the provisioner to inspect its status.', flush=True)
                        continue
                    record['agent_updated'] = True
                    status.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
                    print('Callback tunnel ready; dedicated local test agent updated. Restart any previously open voice session.', flush=True)
                except (httpx.HTTPError, ValueError, subprocess.TimeoutExpired):
                    print('Callback address could not be verified/configured. Restart this helper before testing.', flush=True)
            raise SystemExit('The temporary tunnel closed. Restart this helper before using online conversation.')
        finally:
            process.terminate()
            process.wait(timeout=10)
            record = {'active': False, 'updated_at': datetime.now(timezone.utc).isoformat()}
            status.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
