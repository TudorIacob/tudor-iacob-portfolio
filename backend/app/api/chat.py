import asyncio
import hmac
import json
import logging
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from app.models.chat import ChatRequest
from app.rag.prompts import FALLBACK
from app.rag.intent import route_message

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post('/chat')
async def chat(payload: ChatRequest, request: Request):
    settings = request.app.state.settings
    if settings.backend_api_key and not hmac.compare_digest(request.headers.get('x-api-key', '').encode(), settings.backend_api_key.encode()):
        raise HTTPException(status_code=401, detail='Unauthorized')
    # Secondary per-peer/process safety guard. Next.js + Redis enforce visitor quotas.
    # Ignore forwarded headers: only the gateway is public in production.
    key = request.client.host if request.client else 'unknown'
    if not request.app.state.limiter.allow(key):
        raise HTTPException(status_code=429, detail='Please try again later', headers={'Retry-After': '60'})

    async def events():
        try:
            async with asyncio.timeout(50):
                if settings.mode == 'demo':
                    reply = route_message(payload).reply or 'Backend demo mode. ' + FALLBACK
                    yield json.dumps({'type': 'token', 'text': reply}, ensure_ascii=False) + '\n'
                    yield json.dumps({'type': 'sources', 'sources': []}) + '\n'
                    yield json.dumps({'type': 'done', 'mode': 'demo'}) + '\n'
                else:
                    async for event in request.app.state.pipeline.events(payload):
                        if await request.is_disconnected():
                            break
                        yield json.dumps(event, ensure_ascii=False) + '\n'
        except Exception as error:
            # Never log visitor content, credentials, provider payloads, or stack traces.
            logger.warning('Chat failed (%s)', type(error).__name__)
            yield json.dumps({'type': 'error', 'message': 'T AI could not complete this answer. Please try again shortly.'}) + '\n'
    return StreamingResponse(events(), media_type='application/x-ndjson', headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})
