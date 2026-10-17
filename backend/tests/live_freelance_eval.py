"""Opt-in paid acceptance checks for the public freelance content update."""
import asyncio
import json

import httpx

QUESTIONS = [
    'What does Tudor currently do?',
    'Does Tudor work freelance?',
    'What AI services does Tudor offer?',
    'Can Tudor help with an AI automation project?',
    'Ce servicii oferă Tudor prin PFA?',
    'Cu ce se ocupă Tudor în prezent?',
    'Is Tudor available for freelance AI work?',
    'Does Tudor have his own company?',
    'How many freelance clients does Tudor have?',
    "What was Tudor's biggest freelance contract?",
    'How much does Tudor charge?',
    'Which companies hired Tudor through his PFA?',
]


async def main():
    async with httpx.AsyncClient(timeout=90) as client:
        for question in QUESTIONS:
            response = await client.post(
                'http://localhost:3000/api/chat',
                headers={'Origin': 'http://localhost:3000'},
                json={'message': question, 'history': []},
            )
            response.raise_for_status()
            events = [json.loads(line) for line in response.text.splitlines() if line]
            assert events[-1]['type'] == 'done' and events[-1]['mode'] == 'live'
            sources = next(event for event in events if event['type'] == 'sources')
            assert sources.get('retrieved') is True
            answer = ''.join(event['text'] for event in events if event['type'] == 'token')
            print(json.dumps({'question': question, 'answer': answer,
                              'sources': sources['sources']}, ensure_ascii=False), flush=True)
            # Human review verifies factual claims, language and insufficiency;
            # completion and routing alone cannot certify generated wording.


if __name__ == '__main__':
    asyncio.run(main())
