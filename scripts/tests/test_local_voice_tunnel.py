"""Check callback URL rotation without opening a tunnel or editing an agent."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

SPEC = importlib.util.spec_from_file_location(
    'local_voice_tunnel', Path(__file__).resolve().parents[1] / 'run-local-voice-tunnel.py')
tunnel = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tunnel)


class TunnelTests(unittest.TestCase):
    def test_host_rotation_updates_only_test_agent_and_does_not_print_banner(self):
        events = [
            {'type':'v1.tcpip_forward.register.accepted', 'data':'https://first.lhr.life secret-banner-QR'},
            {'type':'v1.tcpip_forward.register.accepted', 'data':'https://first.lhr.life duplicate'},
            {'type':'v1.tcpip_forward.register.accepted', 'data':'https://second.lhr.life rotated'},
            {'type':'v1.tcpip_forward.register.accepted', 'data':'https://untrusted.example.invalid'},
        ]
        process = MagicMock(pid=123)
        process.stdout = io.StringIO('\n'.join(json.dumps(e) for e in events))
        client = MagicMock()
        client.__enter__.return_value = client
        client.get.return_value.json.return_value = {'status':'ok'}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = io.StringIO()
            with patch.object(tunnel,'ROOT',root), patch.object(tunnel,'STATE',root/'state'), \
                 patch.object(tunnel.httpx,'Client',return_value=client), \
                 patch.object(tunnel.subprocess,'Popen',return_value=process) as start, \
                 patch.object(tunnel.subprocess,'run',return_value=SimpleNamespace(returncode=0)) as provision, \
                 contextlib.redirect_stdout(output):
                with self.assertRaises(SystemExit):
                    tunnel.main()
            self.assertEqual(provision.call_count,2)
            for call, origin in zip(provision.call_args_list,['https://first.lhr.life','https://second.lhr.life']):
                self.assertEqual(call.args[0][-3:], ['--server-url',origin,'--apply'])
                self.assertEqual(Path(call.args[0][1]).name,'provision-local-voice-agent.py')
            self.assertIn('80:127.0.0.1:8001',start.call_args.args[0])
            self.assertNotIn('80:127.0.0.1:8000',start.call_args.args[0])
            self.assertNotIn('secret-banner-QR',output.getvalue())
            self.assertEqual(json.loads((root/'state/tunnel-status.json').read_text())['active'],False)
            process.terminate.assert_called_once()

    def test_failed_public_health_does_not_update_agent(self):
        process = MagicMock(pid=123)
        process.stdout = io.StringIO(json.dumps({'type':'v1.tcpip_forward.register.accepted',
                                                'data':'https://first.lhr.life'}))
        client = MagicMock()
        client.__enter__.return_value = client
        client.get.return_value.json.side_effect = [{'status':'ok'}, {'status':'wrong'}]
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            with patch.object(tunnel,'ROOT',root), patch.object(tunnel,'STATE',root/'state'), \
                 patch.object(tunnel.httpx,'Client',return_value=client), \
                 patch.object(tunnel.subprocess,'Popen',return_value=process), \
                 patch.object(tunnel.subprocess,'run') as provision, contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit): tunnel.main()
            provision.assert_not_called()


if __name__ == '__main__':
    unittest.main()
