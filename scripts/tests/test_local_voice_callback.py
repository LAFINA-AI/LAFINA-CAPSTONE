"""Verify the only internet-facing surface of the local voice test setup."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

import httpx

SPEC = importlib.util.spec_from_file_location(
    'local_voice_callback', Path(__file__).resolve().parents[1] / 'local_voice_callback.py'
)
gateway = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gateway)
AsyncClient = httpx.AsyncClient


class CallbackTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        gateway.shared_secret = 'synthetic-test-secret'
        self.client = AsyncClient(transport=httpx.ASGITransport(app=gateway.app), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()
        gateway.shared_secret = ''

    async def test_account_admin_and_docs_are_not_exposed(self):
        for path in ['/v1/auth/login', '/v1/ai/chat', '/admin', '/docs', '/openapi.json']:
            self.assertEqual((await self.client.get(path)).status_code, 404)
            self.assertEqual((await self.client.post(path)).status_code, 404)
        self.assertEqual((await self.client.get('/health')).json(), {'status': 'ok'})
        self.assertEqual((await self.client.get(gateway.CALLBACK_PATH)).status_code, 405)

    async def test_unauthorized_never_opens_upstream(self):
        with patch.object(gateway.httpx, 'AsyncClient') as upstream:
            for header in ['', 'Bearer incorrect']:
                response = await self.client.post(gateway.CALLBACK_PATH, headers={'Authorization': header})
                self.assertEqual(response.status_code, 401)
            upstream.assert_not_called()

    async def test_empty_configuration_denies_all(self):
        gateway.shared_secret = ''
        response = await self.client.post(gateway.CALLBACK_PATH, headers={'Authorization': 'Bearer '})
        self.assertEqual(response.status_code, 401)

    async def test_large_authenticated_body_is_not_forwarded(self):
        with patch.object(gateway.httpx, 'AsyncClient') as upstream:
            response = await self.client.post(gateway.CALLBACK_PATH,
                headers={'Authorization': 'Bearer synthetic-test-secret'}, content=b'a' * (1024 * 1024 + 1))
            self.assertEqual(response.status_code, 413)
            upstream.assert_not_called()

    async def test_forwards_grant_and_sse_without_cookies_or_other_headers(self):
        async def handler(request):
            self.assertEqual(str(request.url), 'http://127.0.0.1:8000' + gateway.CALLBACK_PATH)
            self.assertEqual(request.headers['x-lafina-voice-grant'], 'synthetic-grant')
            self.assertEqual(request.headers['x-lafina-conversation-id'], 'synthetic-conversation')
            self.assertNotIn('cookie', request.headers)
            self.assertNotIn('x-forwarded-for', request.headers)
            self.assertEqual(await request.aread(), b'{"stream":true}')
            class Events(httpx.AsyncByteStream):
                async def __aiter__(self):
                    yield b'data: {"choices":[]}\n\n'
                    yield b'data: [DONE]\n\n'
            return httpx.Response(200, stream=Events(), headers={'Content-Type': 'text/event-stream'})
        upstream = AsyncClient(transport=httpx.MockTransport(handler))
        with patch.object(gateway.httpx, 'AsyncClient', return_value=upstream):
            response = await self.client.post(gateway.CALLBACK_PATH,
                headers={'Authorization': 'Bearer synthetic-test-secret',
                         'X-Lafina-Voice-Grant': 'synthetic-grant',
                         'X-Lafina-Conversation-Id': 'synthetic-conversation',
                         'Cookie': 'private=ignore', 'X-Forwarded-For': 'ignore'}, content=b'{"stream":true}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, 'data: {"choices":[]}\n\ndata: [DONE]\n\n')
        self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertTrue(upstream.is_closed)

    async def test_backend_denial_is_preserved(self):
        class Denial(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b'{"error":"grant_required"}'
        upstream = AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(
            401, stream=Denial(), headers={'Content-Type': 'application/json'})))
        with patch.object(gateway.httpx, 'AsyncClient', return_value=upstream):
            response = await self.client.post(gateway.CALLBACK_PATH, headers={'Authorization': 'Bearer synthetic-test-secret'})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {'error': 'grant_required'})

    async def test_unavailable_backend_is_generic_and_closed(self):
        def unavailable(request):
            raise httpx.ConnectError('private transport detail')
        upstream = AsyncClient(transport=httpx.MockTransport(unavailable))
        with patch.object(gateway.httpx, 'AsyncClient', return_value=upstream):
            response = await self.client.post(gateway.CALLBACK_PATH, headers={'Authorization': 'Bearer synthetic-test-secret'})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private transport detail', response.text)
        self.assertTrue(upstream.is_closed)


if __name__ == '__main__':
    unittest.main()
