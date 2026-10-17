import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.models.chat import ChatRequest, Chunk
from app.rag.pipeline import RAGPipeline
from app.services.providers import CompatibleProvider
from test_rag import FakeProvider, FakeStore, collect


def frame(kind, **fields):
    return 'event: ' + kind + '\ndata: ' + json.dumps({'type': kind, **fields}) + '\n\n'


TEXT = frame('response.output_text.delta', delta='Python')
DONE = frame('response.completed', response={'status': 'completed'})


def test_defaults_preserve_embedding_contract():
    settings = Settings()
    assert settings.llm_model == 'gpt-6-luna'
    assert settings.llm_reasoning_effort == 'none'
    assert settings.embedding_model == 'text-embedding-3-small'
    assert settings.embedding_dimensions == 1536


@pytest.mark.parametrize('model', ['', ' ', 'invalid model', '\nmodel'])
def test_invalid_model_setting_rejected(model):
    with pytest.raises(ValueError):
        Settings(llm_model=model)


@pytest.mark.parametrize('effort', ['medium', 'high', 'invalid'])
def test_reasoning_remains_bounded(effort):
    with pytest.raises(ValueError):
        Settings(llm_reasoning_effort=effort)


def test_responses_request_and_incremental_multiline_sse():
    messages = [{'role': 'system', 'content': 'Ground facts.'}, {'role': 'user', 'content': 'Skills?'}]
    class SplitStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            # Includes a keepalive, a reasoning delta that must not be displayed,
            # multi-line JSON, UTF-8 split boundaries and text-done duplication.
            raw = (': ping\n\n' + frame('response.reasoning_text.delta', delta='private reasoning') +
                   'data: {"type":"response.output_text.delta",\ndata: "delta":"Bună"}\n\n' +
                   frame('response.output_text.delta', delta='!') +
                   frame('response.output_text.done', text='Bună!') + DONE).encode()
            for offset in range(0, len(raw), 7):
                yield raw[offset:offset + 7]
    def handler(request):
        assert request.url.path == '/v1/responses'
        body = json.loads(request.content)
        assert body == {'model': 'custom-model', 'input': messages, 'stream': True,
                        'store': False, 'reasoning': {'effort': 'none'}, 'max_output_tokens': 800}
        return httpx.Response(200, stream=SplitStream())
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = CompatibleProvider(Settings(llm_model='custom-model'), client)
            assert [text async for text in provider.stream(messages)] == ['Bună', '!']
    asyncio.run(run())


@pytest.mark.parametrize('content', [
    TEXT, TEXT + 'data: [DONE]\n\n', TEXT + 'data: broken\n\n',
    'data: []\n\n', 'data: {}\n\n',
    frame('response.output_text.delta', delta=123),
    frame('response.output_text.delta', delta='x' * 12001),
    'data:' + ' ' * 262145,
    TEXT + frame('response.failed', response={'error': {'message': 'private'}}),
    TEXT + frame('response.incomplete', response={'incomplete_details': {'reason': 'max_output_tokens'}}),
    TEXT + frame('error', message='private'),
    TEXT + frame('response.completed', response={'status': 'incomplete'}),
    TEXT + DONE.rstrip(), DONE,
], ids=['interrupted', 'legacy-marker', 'bad-json', 'array', 'missing-type',
        'non-text-delta', 'large-output', 'large-frame', 'failed', 'incomplete',
        'error', 'invalid-status', 'unterminated', 'empty-completion'])
def test_bad_or_incomplete_stream_never_completes(content):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, text=content))) as client:
            return [token async for token in CompatibleProvider(Settings(), client).stream([])]
    with pytest.raises(ValueError):
        asyncio.run(run())


def test_refusal_text_can_stream_without_exposing_raw_events():
    async def run():
        body = frame('response.refusal.delta', delta='I cannot help with that.') + DONE
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, text=body))) as client:
            assert [t async for t in CompatibleProvider(Settings(), client).stream([])] == ['I cannot help with that.']
    asyncio.run(run())


@pytest.mark.parametrize('failure', [400, 401, 403, 404, 429, 500, 'timeout', 'malformed', 'interrupted'])
def test_provider_errors_are_sanitized_at_api_boundary(failure):
    requests = []
    def handler(request):
        requests.append(request)
        if failure == 'timeout':
            raise httpx.ReadTimeout('private provider info')
        if failure == 'malformed':
            return httpx.Response(200, text='data: private provider info\n\n')
        if failure == 'interrupted':
            return httpx.Response(200, text=TEXT)
        return httpx.Response(failure, json={'error': {'message': 'private provider info'}})
    app = create_app(Settings(backend_api_key='test-only'))
    with TestClient(app) as client:
        app.state.settings.mode = 'live'
        # Test transport has no network or loop-bound connections.
        provider = CompatibleProvider(Settings(), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        app.state.pipeline = RAGPipeline(FakeProvider(), provider, FakeStore([Chunk(id='x', content='Python', metadata={})]), Settings())
        result = client.post('/chat', json={'message': 'Skills?'}, headers={'X-API-Key': 'test-only'})
        events = [json.loads(line) for line in result.text.splitlines()]
        assert events[-1]['type'] == 'error'
        assert 'private' not in result.text
        assert not any(e['type'] == 'done' for e in events)
        assert len(requests) == 1  # No fallback model or silent retry.
        asyncio.run(provider.client.aclose())


@pytest.mark.parametrize('question', [
    'What projects has Tudor worked on?', 'Tell me about the Company & UAT Profiling Agent.',
    'What technologies does Tudor work with?', 'What AI services does Tudor offer?',
    'Did Tudor work for Google?', 'How many years has Tudor worked as a machine learning engineer?',
])
def test_responses_adapter_preserves_rag_and_ndjson_contract(question):
    evidence = Chunk(id='skills', content='Tudor uses Python.', metadata={'title': 'Skills', 'url': '/#skills'})
    def handler(request):
        body = json.loads(request.content)
        assert body['model'] == 'gpt-6-luna'
        assert 'Only retrieved_evidence supports' in body['input'][0]['content']
        context = json.loads(body['input'][1]['content'])
        assert context['question'] == question
        assert context['retrieved_evidence'][0]['content'] == evidence.content
        return httpx.Response(200, text=TEXT + DONE)
    async def run():
        embeddings = FakeProvider()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            pipeline = RAGPipeline(embeddings, CompatibleProvider(Settings(), client), FakeStore([evidence]), Settings())
            events = await collect(pipeline, ChatRequest(message=question))
            assert len(embeddings.calls) == 1
            assert events[0]['sources'][0]['url'] == '/#skills'
            assert events[1] == {'type': 'token', 'text': 'Python'}
            assert events[-1]['type'] == 'done' and events[-1]['mode'] == 'live'
            assert events[-1]['contact'] is False
    asyncio.run(run())
