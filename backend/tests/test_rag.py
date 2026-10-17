import asyncio
import json
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.core.config import Settings
from app.models.chat import ChatRequest, Chunk
from app.rag.pipeline import RAGPipeline
from app.rag.prompts import FALLBACK
from ingestion.chunking import chunk_documents
from ingestion.loaders import load_documents

class FakeProvider:
    def __init__(self):
        self.calls = []
        self.scope_calls = []
    async def embed(self, texts):
        self.calls.append(texts)
        return [[0.1] * 1536]
    async def stream(self, messages):
        if messages[0]['content'].startswith('SCOPE_CLASSIFICATION:'):
            from app.rag.intent import classify
            self.scope_calls.append(messages)
            intent = classify(json.loads(messages[-1]['content'])['question'])
            yield json.dumps({'intent': 'portfolio_query' if intent == 'ambiguous' else intent, 'language': 'English'})
            return
        self.calls.append(messages)
        yield 'Grounded answer.'

class FakeStore:
    def __init__(self, chunks):
        self.chunks = chunks
    async def search(self, vector, top_k, threshold):
        return self.chunks

async def collect(pipeline, request):
    return [event async for event in pipeline.events(request)]

def test_no_evidence_uses_language_aware_generation_without_sources():
    provider = FakeProvider()
    events = asyncio.run(collect(RAGPipeline(provider, provider, FakeStore([]), Settings()), ChatRequest(message='Unknown fact?')))
    assert events[0]['sources'] == []
    assert len(provider.calls) == 2
    assert json.loads(provider.calls[-1][-1]['content'])['retrieved_evidence'] == []
    assert events[-1]['type'] == 'done'

def test_evidence_only_and_source_safety():
    provider = FakeProvider()
    chunks = [Chunk(id='1', content='Tudor uses Python.', metadata={'document_id':'skills', 'title':'Skills', 'url':'javascript:alert(1)'})]
    events = asyncio.run(collect(RAGPipeline(provider, provider, FakeStore(chunks), Settings()), ChatRequest(message='Skills?')))
    assert events[0]['sources'][0]['url'] == ''
    assert 'Tudor uses Python.' in provider.calls[1][-1]['content']
    assert events[1]['text'] == 'Grounded answer.'

def test_distinct_documents_sharing_anchor_keep_their_citations():
    provider = FakeProvider()
    chunks = [
        Chunk(id='education-1', content='Tudor studied Civil Engineering.', metadata={'document_id': 'education', 'title': 'Education', 'url': '/#about'}),
        Chunk(id='experience-1', content='Tudor works freelance through a PFA.', metadata={'document_id': 'experience', 'title': 'Professional Experience', 'url': '/#about'}),
        Chunk(id='experience-2', content='Freelance activity started in 2026.', metadata={'document_id': 'experience', 'title': 'Professional Experience', 'url': '/#about'}),
    ]
    events = asyncio.run(collect(RAGPipeline(provider, provider, FakeStore(chunks), Settings()), ChatRequest(message='What does Tudor currently do?')))
    assert [source['id'] for source in events[0]['sources']] == ['education', 'experience']


def test_content_ingestion_and_stable_ids():
    documents = load_documents()
    first = chunk_documents(documents)
    second = chunk_documents(documents)
    assert first and [c['id'] for c in first] == [c['id'] for c in second]
    assert all(c['metadata']['url'].startswith('/') for c in first)
    assert all('[ADD CREDENTIAL URL]' not in c['content'] for c in first)
    assert any('pending confirmation' in c['content'] for c in first)

def test_long_paragraph_is_bounded():
    records = chunk_documents([{'id':'test','title':'Title','category':'profile','source':'test','url':'/#about','content':'word ' * 2000}], limit=1000)
    assert len(records) > 5
    assert all(len(r['content']) <= 1006 for r in records)

def test_api_validation_auth_size_and_demo():
    with TestClient(create_app(Settings(backend_api_key='test-key'))) as client:
        assert client.post('/chat', json={'message':'Hi'}).status_code == 401
        headers = {'X-API-Key':'test-key'}
        assert client.post('/chat', json={'message':'   '}, headers=headers).status_code == 422
        assert client.post('/chat', json={'message':'x'*2001}, headers=headers).status_code == 422
        assert client.post('/chat', content='x'*16001, headers=headers).status_code == 413
        response = client.post('/chat', json={'message':'Hello'}, headers=headers)
        events = [json.loads(line) for line in response.text.splitlines()]
        assert response.status_code == 200 and events[-1]['mode'] == 'demo'
        assert client.get('/health').json()['status'] == 'ok'

def test_rate_limit():
    with TestClient(create_app(Settings(rate_limit_per_minute=1))) as client:
        assert client.post('/chat', json={'message':'Hello'}).status_code == 200
        response = client.post('/chat', json={'message':'Hello'}, headers={'X-Forwarded-For': '192.0.2.8'})
        assert response.status_code == 429
        assert response.headers['Retry-After'] == '60'

def test_backend_safety_default():
    assert Settings(_env_file=None).rate_limit_per_minute == 60

def test_live_mode_requires_secrets():
    with pytest.raises(ValueError):
        Settings(mode='live', backend_api_key='', llm_api_key='', supabase_url='', supabase_secret_key='')

def test_live_mode_requires_supabase_secret_key():
    with pytest.raises(ValueError, match='Live mode requires'):
        Settings(_env_file=None, mode='live', backend_api_key='test-only', llm_api_key='test-only', supabase_url='https://example.invalid', supabase_secret_key='')

@pytest.mark.parametrize('key', ['eyJtest.not-a-real.jwt', 'sb_publishable_test_only', 'sb_secret_', 'sb_secret_test with spaces'])
def test_supabase_secret_key_rejects_wrong_format(key):
    with pytest.raises(ValueError, match='SUPABASE_SECRET_KEY must be'):
        Settings(_env_file=None, supabase_secret_key=key)

def test_ingestion_loads_secret_key_and_uses_apikey_only(monkeypatch):
    import httpx
    from ingestion import ingest

    # Deliberately invalid credentials, used only with an in-memory HTTP transport.
    monkeypatch.setenv('MODE', 'demo')
    monkeypatch.setenv('BACKEND_API_KEY', 'test-only')
    monkeypatch.setenv('LLM_API_KEY', 'test-only')
    monkeypatch.setenv('LLM_BASE_URL', 'https://provider.invalid/v1')
    monkeypatch.setenv('SUPABASE_URL', 'https://database.invalid')
    monkeypatch.setenv('SUPABASE_SECRET_KEY', 'sb_secret_test_only_not_a_real_key')
    monkeypatch.setenv('EMBEDDING_MODEL', 'text-embedding-3-small')
    monkeypatch.setenv('EMBEDDING_DIMENSIONS', '1536')
    settings = Settings(_env_file=None, mode='live')
    assert settings.supabase_secret_key == 'sb_secret_test_only_not_a_real_key'
    calls = []

    def handler(request):
        calls.append(request.url.path)
        payload = json.loads(request.content)
        if request.url.host == 'provider.invalid':
            assert request.url.path == '/v1/embeddings'
            assert payload['model'] == 'text-embedding-3-small'
            assert payload['dimensions'] == 1536
            return httpx.Response(200, json={'data': [{'index': i, 'embedding': [0.1]*1536} for i in range(len(payload['input']))]})
        assert request.url.host == 'database.invalid'
        assert request.url.path == '/rest/v1/rpc/replace_portfolio_index'
        assert request.headers['apikey'] == settings.supabase_secret_key
        assert 'authorization' not in request.headers
        assert payload['records'] and len(payload['records'][0]['embedding']) == 1536
        return httpx.Response(204)

    client_type = httpx.AsyncClient
    monkeypatch.setattr(ingest.httpx, 'AsyncClient', lambda **kwargs: client_type(transport=httpx.MockTransport(handler), **kwargs))
    asyncio.run(ingest.ingest(dry_run=False))
    assert '/v1/embeddings' in calls
    assert calls[-1] == '/rest/v1/rpc/replace_portfolio_index'

def test_provider_failure_is_safe():
    class BrokenPipeline:
        async def events(self, request):
            raise RuntimeError('secret provider details')
            yield
    app = create_app(Settings())
    with TestClient(app) as client:
        app.state.settings.mode = 'live'
        app.state.pipeline = BrokenPipeline()
        response = client.post('/chat', json={'message':'Question'})
        assert 'secret' not in response.text
        assert json.loads(response.text)['type'] == 'error'
