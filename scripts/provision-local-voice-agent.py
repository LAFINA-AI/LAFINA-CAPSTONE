"""Configure the private LOCAL testing agent, without changing the memory repo.

Default is a redacted dry run. --apply creates/updates only the recorded local
test agent, then stores its ID privately and prints a configuration check.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import runpy
from types import SimpleNamespace

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server-url', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'https://[A-Za-z0-9.-]+', args.server_url):
        raise SystemExit('Use the public HTTPS gateway origin, with no path or credentials.')
    runner = runpy.run_path(str(Path(__file__).with_name('run-provider-test-server.py')))
    backend = runner['configure_environment']()
    spec = importlib.util.spec_from_file_location('local_agent_provisioner', backend / 'scripts' / 'provision_voice_agent.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    state_path = runner['STATE'] / 'voice-agent.json'
    state = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() else {}
    settings = module.Settings()
    config_args = SimpleNamespace(name='LAFINA local phone testing', language='en',
        first_message="Hi, I'm listening. What's on your mind?", tts_model='eleven_v4_turbo',
        turn_eagerness='patient', turn_timeout=15.0)
    if not args.apply:
        print(json.dumps(module.agent_config(settings, args.server_url, '<secret_id>', config_args), indent=2))
        print('Dry run only; nothing was created or updated.')
        return 0

    def persist():
        state_path.write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8')

    def checked(response, action):
        if response.status_code != 200:
            # Never echo provider request/configuration payloads containing secrets.
            raise SystemExit(f'{action} failed: HTTP {response.status_code}. No credentials were printed.')
        return response.json()

    with httpx.Client(headers={'xi-api-key': module._key(settings)}, timeout=30,
                      follow_redirects=False, trust_env=False) as client:
        secret_id = state.get('elevenlabs_secret_id')
        if not secret_id:
            data = checked(client.post(module.API + '/v1/convai/secrets', json={
                'type': 'new', 'name': 'lafina_local_phone_test_llm_secret',
                'value': settings.ELEVENLABS_AGENT_LLM_SECRET.get_secret_value(),
            }), 'Creating the local test secret')
            secret_id = data.get('secret_id')
            if not secret_id:
                raise SystemExit('The provider returned no secret ID.')
            state['elevenlabs_secret_id'] = secret_id
            persist()
        config = module.agent_config(settings, args.server_url, secret_id, config_args)
        agent_id = state.get('ELEVENLABS_AGENT_ID')
        if agent_id:
            checked(client.patch(module.API + '/v1/convai/agents/' + agent_id, json=config), 'Updating the local test agent')
        else:
            data = checked(client.post(module.API + '/v1/convai/agents/create', json=config), 'Creating the local test agent')
            agent_id = data.get('agent_id')
            if not agent_id:
                raise SystemExit('The provider returned no agent ID.')
            state['ELEVENLABS_AGENT_ID'] = agent_id
        state['callback_origin'] = args.server_url
        state['configuration_check_passed'] = False
        persist()  # Keep the ID even if the subsequent check fails; retry updates it.
        result = module.check(settings, agent_id, client)
        state['configuration_check_passed'] = result == 0
        persist()
        print('Local test agent configured. Restart the local provider server to load its ID.')
        return result


if __name__ == '__main__':
    raise SystemExit(main())
