"""Opt-in live smoke evaluation: run from backend; uses configured paid APIs.

Prints only synthetic visitor questions and answers, never credentials. Language,
helpfulness and factual accuracy must be reviewed by a person, not a keyword score.
"""
import asyncio
import json
import sys
from time import perf_counter
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import Settings
from app.models.chat import ChatRequest
from app.rag.pipeline import RAGPipeline
from app.services.providers import CompatibleProvider


async def ask(client, message, history=None):
    started, first_token = perf_counter(), None
    events = []
    async with client.stream('POST', 'http://localhost:3000/api/chat',
                             headers={'Origin': 'http://localhost:3000'},
                             json={'message': message, 'history': history or []}) as response:
        response.raise_for_status()
        async for line in response.aiter_lines():
            if not line:
                continue
            event = json.loads(line)
            events.append(event)
            if event['type'] == 'token' and first_token is None:
                first_token = perf_counter() - started
    assert events[-1]['type'] == 'done' and events[-1]['mode'] == 'live'
    assert not any(e['type'] == 'error' for e in events)
    answer = ''.join(e['text'] for e in events if e['type'] == 'token')
    sources = [s['title'] for e in events if e['type'] == 'sources' for s in e['sources']]
    print(json.dumps({'question': message, 'answer': answer, 'sources': sources,
                      'first_token_seconds': round(first_token or 0, 2),
                      'total_seconds': round(perf_counter() - started, 2),
                      'token_events': sum(e['type'] == 'token' for e in events)}, ensure_ascii=False), flush=True)
    return answer


async def main():
    async with httpx.AsyncClient(timeout=60) as client:
        for message in ['Salut', 'Hello', 'Thanks', 'Ce faci?', 'How are you?',
                        'I run a dental clinic and need an AI receptionist.',
                        'What projects has Tudor worked on?',
                        'Tell me about the Company & UAT Profiling Agent.',
                        'What technologies does Tudor work with?',
                        'What AI services does Tudor offer?',
                        'Did Tudor work for Google?',
                        'How many years has Tudor worked as a machine learning engineer?',
                        'Cum îl pot contacta pe Tudor?',
                        'Bonjour, quels sont les projets de Tudor ?']:
            await ask(client, message)
        history = []
        for message in ['Am o clinică stomatologică și aș dori un agent AI pentru recepție.',
                        'Programări și apeluri telefonice.',
                        'Da, folosim un CRM.',
                        'Please continue in English. What should we check before integrating it?']:
            answer = await ask(client, message, history[-6:])
            history.extend([{'role': 'user', 'content': message}, {'role': 'assistant', 'content': answer}])
        # Exercise the real generator with deliberately empty retrieval results.
        class EmptyStore:
            async def search(self, *args):
                return []
        settings = Settings()
        provider = CompatibleProvider(settings, client)
        pipeline = RAGPipeline(provider, provider, EmptyStore(), settings)
        request = ChatRequest(message='Am o clinică și vreau un agent AI pentru recepție.')
        events = [event async for event in pipeline.events(request)]
        assert events[0]['sources'] == []
        assert events[-1]['type'] == 'done'
        print(json.dumps({'case': 'empty retrieval', 'answer': ''.join(e['text'] for e in events if e['type'] == 'token')}, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
