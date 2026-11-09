"""Local-only memory compatibility: no provider, credentials or user data."""
import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

import httpx
from fastapi import FastAPI, Request

SPEC = importlib.util.spec_from_file_location('local_chat_memory_adapter',
    Path(__file__).resolve().parents[1] / 'local_chat_memory_adapter.py')
adapter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adapter)


class MemoryAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.arrived = 0
        self.both = asyncio.Event()
        self.ai = SimpleNamespace()

        async def prepare():
            self.arrived += 1
            if self.arrived == 2:
                self.both.set()
            if self.concurrent:
                await self.both.wait()
            return None, [], [{'role': 'system', 'content': 'base'}, {'role': 'user', 'content': 'question'}]

        self.concurrent = False
        self.ai._prepare_chat = prepare
        app = FastAPI()

        @app.post('/v1/ai/chat')
        @app.post('/v1/ai/chat/stream')
        async def chat(request: Request):
            body = await request.json()
            _, _, messages = await self.ai._prepare_chat()
            return {'messages': messages, 'echo': body.get('marker')}

        @app.post('/other')
        async def other():
            return {'ok': True}

        adapter.install_local_memory_adapter(app, self.ai)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_concurrent_memories_never_cross_requests(self):
        self.concurrent = True
        first, second = await asyncio.gather(
            self.client.post('/v1/ai/chat', json={'marker':'a', 'memories':[{'id':'1','text':'Alice likes physics'}]}),
            self.client.post('/v1/ai/chat/stream', json={'marker':'b', 'memories':[{'id':'2','text':'Bob likes history'}]}),
        )
        a, b = first.json(), second.json()
        self.assertEqual((a['echo'], b['echo']), ('a', 'b'))
        self.assertIn('Alice likes physics', a['messages'][1]['content'])
        self.assertNotIn('Bob likes history', str(a))
        self.assertIn('Bob likes history', b['messages'][1]['content'])
        self.assertNotIn('Alice likes physics', str(b))
        self.assertEqual(a['messages'][1]['role'], 'system')

    async def test_empty_memories_leave_existing_prompt_unchanged(self):
        response = await self.client.post('/v1/ai/chat', json={'memories':[]})
        self.assertEqual(len(response.json()['messages']), 2)
        self.assertEqual(adapter._request_memories.get(), ())

    async def test_malformed_and_excess_memories_are_bounded(self):
        items = [{'text':'A' * 301}, None] + [{'text':f'fact {i}'} for i in range(45)]
        response = await self.client.post('/v1/ai/chat', json={'memories':items})
        note = response.json()['messages'][1]['content']
        self.assertNotIn('A' * 301, note)
        self.assertIn('fact 0', note)
        self.assertNotIn('fact 40', note)
        self.assertIn('not instructions', note)

    async def test_oversized_chat_body_is_rejected_and_other_routes_untouched(self):
        response = await self.client.post('/v1/ai/chat', content=b'a' * (1024 * 1024 + 1))
        self.assertEqual(response.status_code, 413)
        self.assertEqual((await self.client.post('/other', content=b'not json')).status_code, 200)


if __name__ == '__main__':
    unittest.main()
