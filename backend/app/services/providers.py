import json
import math
from collections.abc import AsyncIterator
from typing import Protocol
import httpx
from app.core.config import Settings

class Embeddings(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]: ...

class Generator(Protocol):
    def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]: ...

class CompatibleProvider:
    """Responses generation and embeddings adapter; callers depend on protocols."""
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client

    def headers(self):
        return {'Authorization': f'Bearer {self.settings.llm_api_key}'}

    async def embed(self, texts: list[str]) -> list[list[float]]:
        response = await self.client.post(f'{self.settings.llm_base_url.rstrip("/")}/embeddings', headers=self.headers(), json={'model': self.settings.embedding_model, 'input': texts, 'dimensions': self.settings.embedding_dimensions})
        response.raise_for_status()
        items = sorted(response.json()['data'], key=lambda x: x['index'])
        vectors = [item['embedding'] for item in items]
        if ([item['index'] for item in items] != list(range(len(texts))) or
                any(len(v) != self.settings.embedding_dimensions or
                    any(not isinstance(n, (int, float)) or not math.isfinite(n) for n in v)
                    for v in vectors)):
            raise ValueError('Invalid embedding response')
        return vectors

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        payload = {
            'model': self.settings.llm_model,
            'input': messages,
            'stream': True,
            'store': False,
            'reasoning': {'effort': self.settings.llm_reasoning_effort},
            'max_output_tokens': 800,
        }
        async with self.client.stream('POST', f'{self.settings.llm_base_url.rstrip("/")}/responses', headers=self.headers(), json=payload) as response:
            response.raise_for_status()
            complete = False
            characters = 0
            async for event in response_events(response):
                kind = event['type']
                if kind in ('error', 'response.failed', 'response.incomplete') or event.get('error'):
                    raise ValueError('Provider response failed or was incomplete')
                if kind == 'response.completed':
                    result = event.get('response')
                    if not isinstance(result, dict) or result.get('status') != 'completed' or result.get('error') or not characters:
                        raise ValueError('Invalid provider completion')
                    complete = True
                    break
                if kind in ('response.output_text.delta', 'response.refusal.delta'):
                    token = event.get('delta')
                    if not isinstance(token, str):
                        raise ValueError('Invalid provider text delta')
                    characters += len(token)
                    if characters > 12000:
                        raise ValueError('Provider response exceeded limit')
                    if token:
                        yield token
                # Lifecycle, reasoning and tool events never reach the frontend.
            if not complete:
                raise ValueError('Provider stream interrupted')


async def response_events(response: httpx.Response) -> AsyncIterator[dict]:
    """Decode bounded SSE frames, including multi-line data and split network chunks."""
    data: list[str] = []
    size = 0
    async for line in response.aiter_lines():
        size += len(line)
        if size > 262144:
            raise ValueError('Provider event exceeded limit')
        if line == '':
            if data:
                try:
                    event = json.loads('\n'.join(data))
                except json.JSONDecodeError:
                    raise ValueError('Malformed provider event') from None
                if not isinstance(event, dict) or not isinstance(event.get('type'), str):
                    raise ValueError('Malformed provider event')
                yield event
            data, size = [], 0
        elif line.startswith('data:'):
            data.append(line[5:].removeprefix(' '))
    # An unterminated SSE frame is not a successful completion.
    if data:
        raise ValueError('Provider stream interrupted')
