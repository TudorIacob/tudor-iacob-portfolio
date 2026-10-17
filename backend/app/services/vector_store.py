from typing import Protocol
import httpx
from app.core.config import Settings
from app.models.chat import Chunk

class VectorStore(Protocol):
    async def search(self, vector: list[float], top_k: int, threshold: float) -> list[Chunk]: ...

class SupabaseVectorStore:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client

    async def rpc(self, name: str, payload: dict):
        response = await self.client.post(
            f'{self.settings.supabase_url.rstrip("/")}/rest/v1/rpc/{name}',
            headers={'apikey': self.settings.supabase_secret_key},
            json=payload,
        )
        response.raise_for_status()
        return response.json() if response.content else None

    async def search(self, vector: list[float], top_k: int, threshold: float) -> list[Chunk]:
        rows = await self.rpc('match_portfolio_chunks', {'query_embedding': vector, 'match_count': top_k, 'match_threshold': threshold})
        return [Chunk(**row) for row in rows]

    async def replace_index(self, records: list[dict]):
        # Transactional replacement removes stale chunks only after all embeddings exist.
        if not isinstance(records, list) or not records:
            raise ValueError('Refusing to replace the index with empty or null records')
        await self.rpc('replace_portfolio_index', {'records': records})
