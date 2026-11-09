"""Loopback gateway for one ElevenAgents callback; expose this, not port 8000.

Only the streamed LLM POST and a credential-free health response are served.
The shared secret is checked before forwarding, then the backend validates the
short-lived session grant. No request headers/body are logged.
"""
import hmac
import os
from pathlib import Path
import runpy

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

CALLBACK_PATH = '/v1/ai/voice/llm/chat/completions'
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
shared_secret = ''


@app.get('/health')
async def health():
    return {'status': 'ok'}


@app.post(CALLBACK_PATH)
async def callback(request: Request):
    supplied = request.headers.get('authorization', '')
    if not shared_secret or not hmac.compare_digest(
        supplied.encode(), ('Bearer ' + shared_secret).encode()
    ):
        print('Voice callback rejected: HTTP 401 (shared-secret check)', flush=True)
        return JSONResponse({'error': {'type': 'unauthorized'}}, status_code=401)
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > 1024 * 1024:
            return JSONResponse({'error': {'type': 'body_too_large'}}, status_code=413)
        chunks.append(chunk)
    headers = {'Authorization': supplied, 'Content-Type': 'application/json'}
    for name in ['X-Lafina-Voice-Grant', 'X-Lafina-Conversation-Id']:
        value = request.headers.get(name)
        if value:
            headers[name] = value
    client = httpx.AsyncClient(timeout=40, follow_redirects=False, trust_env=False)
    try:
        response = await client.send(client.build_request(
            'POST', 'http://127.0.0.1:8000' + CALLBACK_PATH,
            headers=headers, content=b''.join(chunks),
        ), stream=True)
    except httpx.HTTPError:
        await client.aclose()
        return JSONResponse({'error': {'type': 'local_backend_unavailable'}}, status_code=503)

    async def close():
        await response.aclose()
        await client.aclose()

    async def content():
        count = 0
        try:
            async for chunk in response.aiter_raw():
                count += len(chunk)
                yield chunk
        finally:
            await close()
            # Status/size only: no request headers, text, audio or credentials.
            print(f'Voice callback HTTP {response.status_code}; response bytes {count}', flush=True)

    return StreamingResponse(
        content(), status_code=response.status_code,
        headers={'Content-Type': response.headers.get('content-type', 'application/json'),
                 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'},
        background=BackgroundTask(close),
    )


def main():
    global shared_secret
    runner = runpy.run_path(str(Path(__file__).with_name('run-provider-test-server.py')))
    runner['configure_environment']()
    shared_secret = os.environ['ELEVENLABS_AGENT_LLM_SECRET']
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8001, log_level='warning', access_log=False)


if __name__ == '__main__':
    main()
