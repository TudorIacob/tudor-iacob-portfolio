import argparse
import asyncio
import httpx
from app.core.config import Settings
from app.services.providers import CompatibleProvider
from app.services.vector_store import SupabaseVectorStore
from ingestion.loaders import load_documents
from ingestion.chunking import chunk_documents

async def ingest(dry_run: bool):
    documents = load_documents()
    chunks = chunk_documents(documents)
    if not chunks:
        raise RuntimeError('Refusing to replace the index with empty content')
    print(f'Loaded {len(documents)} public documents; prepared {len(chunks)} chunks.')
    if dry_run:
        return
    settings = Settings(mode='live')
    async with httpx.AsyncClient(timeout=45) as client:
        provider = CompatibleProvider(settings, client)
        store = SupabaseVectorStore(settings, client)
        for offset in range(0, len(chunks), 32):
            batch = chunks[offset:offset + 32]
            vectors = await provider.embed([chunk['content'] for chunk in batch])
            for chunk, vector in zip(batch, vectors, strict=True):
                chunk['embedding'] = vector
                chunk['metadata']['embedding_model'] = settings.embedding_model
        await store.replace_index(chunks)
    print(f'Atomically replaced the portfolio index with {len(chunks)} chunks.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Rebuild the public portfolio vector index')
    parser.add_argument('--dry-run', action='store_true', help='Validate loading and chunking without network access')
    try:
        asyncio.run(ingest(parser.parse_args().dry_run))
    except Exception as error:
        # Validation errors and HTTP exceptions can contain credential-bearing input.
        print(f'Ingestion failed ({type(error).__name__}). Check configuration and provider/database availability. The index is replaced only after all embeddings succeed.')
        raise SystemExit(1) from None
