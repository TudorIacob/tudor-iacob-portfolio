import asyncio
import json
import httpx
import pytest
from app.core.config import Settings
from app.services.providers import CompatibleProvider
from app.services.vector_store import SupabaseVectorStore

def test_embeddings_validate_and_preserve_input_order():
    def handler(request):
        assert request.url.path == '/v1/embeddings'
        assert request.headers['authorization'] == 'Bearer test-only'
        assert json.loads(request.content)['dimensions'] == 1536
        return httpx.Response(200, json={'data': [{'index': 1, 'embedding': [0.2]*1536}, {'index': 0, 'embedding': [0.1]*1536}]})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            vectors = await CompatibleProvider(Settings(llm_api_key='test-only'), client).embed(['one', 'two'])
            assert vectors[0][0] == 0.1 and vectors[1][0] == 0.2
    asyncio.run(run())

def test_generation_sse_requires_completion_marker():
    frame = 'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n'
    async def run(complete):
        transport = httpx.MockTransport(lambda request: httpx.Response(200, text=frame + ('data: {"type":"response.completed","response":{"status":"completed"}}\n\n' if complete else '')))
        async with httpx.AsyncClient(transport=transport) as client:
            provider = CompatibleProvider(Settings(), client)
            return [token async for token in provider.stream([{'role':'user','content':'Hello'}])]
    assert asyncio.run(run(True)) == ['Hello']
    with pytest.raises(ValueError, match='interrupted'):
        asyncio.run(run(False))

def test_vector_rpc_passes_threshold_and_server_credentials():
    def handler(request):
        assert request.url.path == '/rest/v1/rpc/match_portfolio_chunks'
        assert request.headers['apikey'] == 'sb_secret_test_only_not_a_real_key'
        assert 'authorization' not in request.headers
        payload = json.loads(request.content)
        assert payload['match_threshold'] == 0.5 and payload['match_count'] == 3
        return httpx.Response(200, json=[{'id':'chunk','content':'Public knowledge','metadata':{'title':'Skills'},'similarity':0.8}])
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            store = SupabaseVectorStore(Settings(supabase_url='https://example.invalid', supabase_secret_key='sb_secret_test_only_not_a_real_key'), client)
            assert (await store.search([0.1]*1536, 3, 0.5))[0].similarity == 0.8
    asyncio.run(run())
