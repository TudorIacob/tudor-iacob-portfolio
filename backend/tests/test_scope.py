import asyncio
import json

import pytest

from app.core.config import Settings
from app.models.chat import ChatRequest, Chunk
from app.rag.intent import route_message, classify
from app.rag.pipeline import RAGPipeline
from test_intent import NoNetwork
from test_rag import FakeProvider, FakeStore, collect


@pytest.mark.parametrize('question', [
    'Care este capitala Italiei?', "What's the weather like in California?",
    'Who is Albert Einstein?', 'Who is the president of France?',
    'Who won the World Cup?', 'Write me a recipe.', 'Explain quantum physics.',
    "What's 2 + 2?", 'Write me a Python game.', 'What is RAG?',
])
def test_obvious_unrelated_has_no_network_facts_sources_or_contact(question):
    provider = NoNetwork()
    events = asyncio.run(collect(RAGPipeline(provider, provider, provider, Settings()), ChatRequest(message=question)))
    text = events[1]['text']
    assert events[0] == {'type': 'sources', 'sources': []}
    assert 'Tudor' in text and 'contact' not in text.lower()
    assert all(term not in text.lower() for term in ['roma', 'rome', 'einstein', 'california', 'knowledge base', '2 + 2'])
    if question.startswith('Care'):
        assert 'Sunt aici' in text


def test_redirect_variants_and_topic_switch_do_not_inherit_rag():
    first = route_message(ChatRequest(message='Care este capitala Italiei?')).reply
    second = route_message(ChatRequest(message='Care este capitala Italiei?', history=[{'role':'user','content':'Tell me about T AI.'}])).reply
    assert first != second
    assert route_message(ChatRequest(message="What's the weather?", history=[{'role':'user','content':'Tell me about T AI.'}])).intent == 'out_of_scope'


@pytest.mark.parametrize('question, language', [('Hello','English'), ('Salut','Romanian')])
def test_greeting_suggestions_are_localized_and_no_network(question, language):
    provider = NoNetwork()
    events = asyncio.run(collect(RAGPipeline(provider, provider, provider, Settings()), ChatRequest(message=question)))
    assert len(events[-1]['suggestions']) == 4
    assert events[0]['sources'] == []
    assert events[-1]['suggestions'][0].startswith('Care' if language == 'Romanian' else 'What')


@pytest.mark.parametrize('question', ['How are you today?', "How's it going?", "What's up?", 'Ce faci?', 'Cum ești?', 'Thanks', 'Perfect'])
def test_small_talk_and_ack_use_no_providers(question):
    provider = NoNetwork()
    events = asyncio.run(collect(RAGPipeline(provider, provider, provider, Settings()), ChatRequest(message=question)))
    assert 'Tudor' in events[1]['text']
    assert 'How are you?' not in events[1]['text']


class ScopeProvider(FakeProvider):
    def __init__(self, decision):
        super().__init__()
        self.decision = decision
    async def stream(self, messages):
        if messages[0]['content'].startswith('SCOPE_CLASSIFICATION:'):
            self.scope_calls.append(messages)
            yield self.decision
        else:
            async for token in super().stream(messages):
                yield token


@pytest.mark.parametrize('decision', ['not JSON', '[]', '{"intent":[]}', '{"intent":"invented"}', 'x' * 2001,
                                     '{"intent":"out_of_scope","language":{}}',
                                     '{"intent":"out_of_scope","language":"Romanian"}'])
def test_ambiguous_or_invalid_classification_fails_closed(decision):
    provider = ScopeProvider(decision)
    events = asyncio.run(collect(RAGPipeline(provider, provider, NoNetwork(), Settings()), ChatRequest(message='Could you help me understand this?')))
    assert provider.calls == []  # No embeddings or answer generation.
    assert events[0]['sources'] == []
    assert 'Tudor' in events[1]['text']


@pytest.mark.parametrize('question, intent', [
    ('What projects has Tudor built?', 'project_query'),
    ('Ce experiență are Tudor cu Python?', 'skills_query'),
    ('How many Fortune 500 clients has Tudor worked with?', 'experience_query'),
    ('What AI services does Tudor offer?', 'service_query'),
    ('Tell me about T AI.', 'tai_query'),
])
def test_explicit_portfolio_retrieves_without_classifier(question, intent):
    provider = FakeProvider()
    chunk = Chunk(id='work', content='Tudor uses Python.', metadata={'title':'Skills','url':'/#skills'})
    events = asyncio.run(collect(RAGPipeline(provider, provider, FakeStore([chunk]), Settings()), ChatRequest(message=question)))
    assert classify(question) == intent
    assert provider.scope_calls == []
    assert events[0]['retrieved'] is True and len(events[0]['sources']) == 1
    assert len(provider.calls) == 2


def test_followup_context_is_checked_before_retrieval():
    provider = ScopeProvider('{"intent":"follow_up","language":"English"}')
    request = ChatRequest(message='What stack does it use?', history=[
        {'role':'user','content':'Tell me about T AI.'},
        {'role':'assistant','content':'UNTRUSTED claims'},
    ])
    asyncio.run(collect(RAGPipeline(provider, provider, FakeStore([]), Settings()), request))
    assert 'T AI' in provider.calls[0][0]
    assert 'UNTRUSTED' not in json.dumps(provider.scope_calls)
    assert 'UNTRUSTED' not in provider.calls[0][0]


def test_unrelated_followup_is_redirected_before_embedding():
    provider = ScopeProvider('{"intent":"out_of_scope","language":"English"}')
    request = ChatRequest(message='Tell me more about it.', history=[{'role':'user','content':'Who is Albert Einstein?'}])
    events = asyncio.run(collect(RAGPipeline(provider, provider, NoNetwork(), Settings()), request))
    assert provider.calls == []
    assert events[0]['sources'] == []


def test_business_project_inquiry_passes_semantic_gate():
    provider = ScopeProvider('{"intent":"service_query","language":"Romanian"}')
    question = 'Am o clinică stomatologică și aș dori un agent AI pentru recepție.'
    events = asyncio.run(collect(RAGPipeline(provider, provider, FakeStore([]), Settings()), ChatRequest(message=question)))
    assert len(provider.scope_calls) == 1 and len(provider.calls) == 2
    assert events[0]['sources'] == []
    assert 'CURRENT EVIDENCE STATE' in provider.calls[-1][0]['content']

@pytest.mark.parametrize('decision, expected', [
    ({'intent': 'service_query', 'contact': True}, True),
    ({'intent': 'service_query', 'contact': 'true'}, False),
    ({'intent': 'service_query', 'contact': False}, False),
    ({'intent': 'out_of_scope', 'contact': True}, False),
])
def test_contact_action_requires_valid_scope_decision(decision, expected):
    provider = ScopeProvider(json.dumps(decision))
    events = asyncio.run(collect(RAGPipeline(provider, provider, FakeStore([]), Settings()), ChatRequest(message='I need an AI assistant for my business.')))
    assert events[-1].get('contact', False) is expected


def test_project_metadata_only_for_project_routes():
    provider = FakeProvider()
    events = asyncio.run(collect(RAGPipeline(provider, provider, FakeStore([]), Settings()), ChatRequest(message='Tell me about T AI.')))
    assert events[-1]['projectContext'] is True
