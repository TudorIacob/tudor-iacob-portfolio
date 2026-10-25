from fastapi.testclient import TestClient
from app.core.config import Settings
from app.main import create_app


def test_validation_does_not_echo_input():
    with TestClient(create_app(Settings(_env_file=None))) as client:
        response = client.post('/chat', json={'message': 123, 'unexpected': 'private-visitor-text'})
        assert response.status_code == 422
        assert response.json() == {'detail': 'Invalid request'}
        assert 'private-visitor-text' not in response.text
        assert response.headers['cache-control'] == 'no-store'


def test_live_schema_and_docs_are_disabled():
    settings = Settings(_env_file=None, mode='live', backend_api_key='test-only',
                        llm_api_key='test-only', supabase_url='https://database.example',
                        supabase_secret_key='sb_secret_test-only')
    with TestClient(create_app(settings)) as client:
        for path in ['/docs', '/redoc', '/openapi.json']:
            assert client.get(path).status_code == 404
        assert client.post('/chat', json={'message': 'Hello'}).status_code == 401
        assert client.get('/health').status_code == 200


def test_local_demo_schema_remains_available():
    with TestClient(create_app(Settings(_env_file=None))) as client:
        assert client.get('/openapi.json').status_code == 200
