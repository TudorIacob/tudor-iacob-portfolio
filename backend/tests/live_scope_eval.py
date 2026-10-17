"""Opt-in paid live acceptance matrix. Run from backend with both servers active."""
import asyncio
import json

import httpx


async def ask(client, question, rag, history=None):
    response = await client.post('http://localhost:3000/api/chat',
                                 headers={'Origin': 'http://localhost:3000'},
                                 json={'message': question, 'history': history or []})
    response.raise_for_status()
    events = [json.loads(line) for line in response.text.splitlines() if line]
    assert events[-1]['type'] == 'done' and events[-1]['mode'] == 'live'
    source_event = next(e for e in events if e['type'] == 'sources')
    assert source_event.get('retrieved', False) == rag
    if not rag:
        assert source_event['sources'] == []
    text = ''.join(e['text'] for e in events if e['type'] == 'token')
    print(json.dumps({'question': question, 'rag': rag, 'sources': len(source_event['sources']),
                      'answer': text, 'suggestions': events[-1].get('suggestions', [])}, ensure_ascii=False), flush=True)
    return text


async def main():
    async with httpx.AsyncClient(timeout=60) as client:
        for question in ['Hello', 'Salut', 'How are you?', 'How are you today?', 'Ce faci?', 'Thanks',
                         'Care este capitala Italiei?', "What's the weather in California?",
                         'Who is Albert Einstein?', 'What is RAG?']:
            text = await ask(client, question, False)
            if 'capitala' in question:
                assert 'roma' not in text.lower()
        for question in ['What projects has Tudor built?', 'Ce servicii AI oferă Tudor?',
                         'Ce experiență are Tudor cu Python?',
                         'How many Fortune 500 clients has Tudor worked with?']:
            await ask(client, question, True)
        initial = 'Tell me about T AI.'
        answer = await ask(client, initial, True)
        history = [{'role': 'user', 'content': initial}, {'role': 'assistant', 'content': answer}]
        await ask(client, 'What stack does it use?', True, history)
        # A topic switch must not become in-scope merely because history was.
        await ask(client, 'Who is Albert Einstein?', False, history)
        # Obscure unrelated topic exercises semantic classification, not regexes.
        await ask(client, 'Describe the dietary habits of pangolins.', False)
        await ask(client, 'Tudor, tell me the capital of Italy.', False)
        await ask(client, 'Am o clinică stomatologică și aș dori un agent AI pentru recepție.', True)


if __name__ == '__main__':
    asyncio.run(main())
