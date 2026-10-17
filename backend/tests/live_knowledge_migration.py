"""Opt-in migration verification: read public rows; compare retrieval before/after."""
import asyncio
import json
import sys
from pathlib import Path

import httpx

from app.core.config import Settings
from app.services.providers import CompatibleProvider
from app.services.vector_store import SupabaseVectorStore
from ingestion.loaders import load_documents
from ingestion.chunking import chunk_documents

SNAPSHOT = Path(__file__).resolve().parents[2] / 'artifacts/knowledge-index-before.json'
QUESTIONS = ['What does Tudor currently do?', 'Ce servicii oferă Tudor prin PFA?', 'Tell me about the Company & UAT Profiling Agent.']

async def main(before):
    settings = Settings(mode='live')
    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.get(settings.supabase_url.rstrip('/')+'/rest/v1/portfolio_chunks',headers={'apikey':settings.supabase_secret_key},params={'select':'id,content,metadata','limit':'1000'})
        if response.status_code != 200:
            raise RuntimeError('Could not verify public index')
        rows = response.json()
        assert rows
        store=SupabaseVectorStore(settings,client)
        if before:
            vectors=await CompatibleProvider(settings,client).embed(QUESTIONS)
            retrieval=[]
            for vector in vectors:
                chunks=await store.search(vector,settings.top_k,settings.similarity_threshold)
                retrieval.append([{'content':c.content,'document_id':c.metadata['document_id'],'url':c.metadata['url']} for c in chunks])
            SNAPSHOT.parent.mkdir(exist_ok=True)
            SNAPSHOT.write_text(json.dumps({'rows':rows,'vectors':vectors,'retrieval':retrieval},ensure_ascii=False),encoding='utf-8')
            print('Captured',len(rows),'public rows and three retrieval baselines before replacement.')
        else:
            baseline=json.loads(SNAPSHOT.read_text(encoding='utf-8'))
            expected={c['id']:c for c in chunk_documents(load_documents())}
            assert len(rows)==len(expected)==len(baseline['rows'])
            assert {r['id'] for r in rows}==set(expected)
            for row in rows:
                assert row['content']==expected[row['id']]['content']
                for key,value in expected[row['id']]['metadata'].items():
                    if key!='updated_at': assert row['metadata'][key]==value
                assert '.md.txt' not in json.dumps(row['metadata'])
            print('All',len(rows),'live chunks match prepared IDs, content and source metadata. No duplicate or stale IDs.')
            for question,vector,previous in zip(QUESTIONS,baseline['vectors'],baseline['retrieval'],strict=True):
                chunks=await store.search(vector,settings.top_k,settings.similarity_threshold)
                actual=[{'content':c.content,'document_id':c.metadata['document_id'],'url':c.metadata['url']} for c in chunks]
                assert actual==json.loads(json.dumps(previous).replace('.md.txt','.md'))
                print('Retrieval unchanged:',question)

if __name__=='__main__':
    try:
        asyncio.run(main('--before' in sys.argv))
    except Exception as error:
        print('Verification failed:',type(error).__name__)
        raise SystemExit(1) from None
