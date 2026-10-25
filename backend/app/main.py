from contextlib import asynccontextmanager
import asyncio
import os
import httpx
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.chat import router
from app.core.config import Settings
from app.core.limits import RateLimiter
from app.rag.pipeline import RAGPipeline
from app.services.providers import CompatibleProvider
from app.services.vector_store import SupabaseVectorStore

class BodyLimitMiddleware:
    def __init__(self, app, maximum=16000, timeout=10):
        self.app, self.maximum, self.timeout = app, maximum, timeout

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] != 'POST':
            return await self.app(scope, receive, send)
        messages, size = [], 0
        try:
            async with asyncio.timeout(self.timeout):
                while True:
                    message = await receive()
                    if message['type'] == 'http.disconnect':
                        return
                    size += len(message.get('body', b''))
                    if size > self.maximum:
                        response = JSONResponse({'detail': 'Request too large'}, status_code=413)
                        return await response(scope, receive, send)
                    messages.append(message)
                    if not message.get('more_body', False):
                        break
        except TimeoutError:
            return await JSONResponse({'detail': 'Request timeout'}, status_code=408)(scope, receive, send)
        async def replay():
            return messages.pop(0) if messages else await receive()
        await self.app(scope, replay, send)

def create_app(settings: Settings | None = None):
    settings = settings or Settings()
    if os.environ.get('K_SERVICE') and settings.mode != 'live':
        raise ValueError('Cloud Run requires MODE=live and complete server credentials.')
    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(timeout=httpx.Timeout(30, connect=5)) as client:
            provider = CompatibleProvider(settings, client)
            app.state.pipeline = RAGPipeline(provider, provider, SupabaseVectorStore(settings, client), settings)
            yield
    app = FastAPI(title='T AI Portfolio API', version='1.0.0', lifespan=lifespan, docs_url=None if settings.mode == 'live' else '/docs', redoc_url=None, openapi_url=None if settings.mode == 'live' else '/openapi.json')
    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        # FastAPI's default handler serializes input even with hide_input_in_errors.
        # Never echo visitor messages or arbitrary unexpected fields to clients/logs.
        return JSONResponse({'detail': 'Invalid request'}, status_code=422,
                            headers={'Cache-Control': 'no-store'})
    app.state.settings = settings
    app.state.limiter = RateLimiter(settings.rate_limit_per_minute)
    app.add_middleware(BodyLimitMiddleware)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=['POST', 'GET'], allow_headers=['Content-Type', 'X-API-Key'])
    app.include_router(router)
    @app.get('/health')
    async def health():
        return {'status': 'ok', 'mode': settings.mode}
    return app

app = create_app()
