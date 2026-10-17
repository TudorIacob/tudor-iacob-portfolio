import json
import re
from app.core.config import Settings
from app.models.chat import ChatRequest, Source
from app.rag.prompts import SYSTEM_PROMPT
from app.rag.intent import route_message, reply_language
from app.rag.language import language_hint
from app.rag.scope import resolve_scope
from app.services.providers import Embeddings, Generator
from app.services.vector_store import VectorStore

class RAGPipeline:
    def __init__(self, embeddings: Embeddings, generator: Generator, store: VectorStore, settings: Settings):
        self.embeddings, self.generator, self.store, self.settings = embeddings, generator, store, settings

    async def events(self, request: ChatRequest):
        route = await resolve_scope(request, route_message(request), self.generator)
        if route.reply is not None:
            yield {'type': 'sources', 'sources': []}
            yield {'type': 'token', 'text': route.reply}
            completion = {'type': 'done', 'mode': 'live'}
            if route.suggestions:
                completion['suggestions'] = list(route.suggestions)
            yield completion
            return
        # Include only recent user context in retrieval, never prior model claims.
        # Resolve short follow-ups, but do not let a previous topic dominate a new question.
        recent = list(route.recent)
        query = '\n'.join([*recent, request.message])[-5000:]
        retrieved = []
        if route.intent not in ('social', 'acknowledgement', 'out_of_scope'):
            vector = (await self.embeddings.embed([query]))[0]
            retrieved = await self.store.search(vector, self.settings.top_k, self.settings.similarity_threshold)
        chunks, seen, characters = [], set(), 0
        for chunk in retrieved[:self.settings.top_k]:
            signature = ' '.join(chunk.content.split())
            if signature in seen or not signature or chunk.similarity < self.settings.similarity_threshold:
                continue
            # Reject unexpected oversized rows rather than silently forwarding an entire database.
            if len(chunk.content) > 4000 or characters + len(chunk.content) > 12000:
                continue
            seen.add(signature)
            characters += len(chunk.content)
            chunks.append(chunk)
        sources = {}
        for chunk in chunks:
            meta = chunk.metadata
            url = meta.get('url') or ''
            if not re.fullmatch(r'/(?:#[a-z][a-z0-9-]*|projects/[a-z0-9-]+)', url):
                url = ''
            source = Source(id=meta.get('document_id') or chunk.id, title=meta.get('title') or 'Portfolio', url=url)
            # Distinct documents may share a page anchor. Legacy rows without a
            # document ID still collapse repeated chunks with the same title.
            source_key = meta.get('document_id') or (url, source.title)
            sources.setdefault(source_key, source.model_dump())
        yield {'type': 'sources', 'sources': list(sources.values()),
               'retrieved': route.intent not in ('social', 'acknowledgement', 'out_of_scope')}
        evidence = [{'chunk_id': c.id, 'title': c.metadata.get('title'), 'content': c.content} for c in chunks]
        # History is data inside the user envelope, never privileged assistant turns.
        # It resolves language and requirements but cannot establish portfolio facts.
        history = [{'role': m.role, 'content': m.content[:1500]} for m in request.history[-6:]]
        payload = {'retrieved_evidence': evidence, 'recent_user_questions': recent,
                   'conversation_context': history, 'question': request.message}
        grounding = '' if chunks else (
            '\nCURRENT EVIDENCE STATE: No verified portfolio evidence was retrieved. '
            'You MUST NOT describe Tudor as having any skill, experience, completed project '
            'or ability to deliver this solution. Prior assistant claims cannot fill this gap. '
            'For project ideas discuss ONLY hypothetical solution features and discovery '
            'questions, without attributing them to Tudor. For personal factual questions '
            'say you cannot verify the requested fact. Contact route /#contact remains available.'
        )
        response_rules = (
            f'\nRESPONSE LANGUAGE FOR THIS TURN: {language_hint(request)}. '
            'Use at most ONE question mark and ask about only one missing requirement. '
            'For a clinic proposal include a sentence on GDPR, restricted patient-data access '
            'and transfer to human staff. Do not send a first-time prospect to Contact unless asked.'
        )
        messages = [{'role': 'system', 'content': SYSTEM_PROMPT + grounding + response_rules}, {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}]
        async for token in self.generator.stream(messages):
            yield {'type': 'token', 'text': token}
        yield {'type': 'done', 'mode': 'live', 'contact': route.contact,
               'projectContext': route.intent in ('project_query', 'tai_query'),
               'language': 'ro' if reply_language(request) == 'Romanian' else 'en'}
