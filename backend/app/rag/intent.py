"""Cheap exact social routing and portfolio intent hints before scope checking."""
import re
import unicodedata
from dataclasses import dataclass
from typing import Literal

from app.models.chat import ChatRequest

Intent = Literal['greeting', 'social', 'acknowledgement', 'portfolio_query', 'project_query', 'skills_query', 'experience_query', 'service_query', 'tai_query', 'follow_up', 'out_of_scope', 'ambiguous']


def normalize(message: str) -> str:
    text = ''.join(c for c in unicodedata.normalize('NFKD', message.casefold()) if not unicodedata.combining(c))
    return ' '.join(re.sub(r'[^\w\s]', ' ', text).split())


EN_GREETINGS = {'hi', 'hello', 'hey', 'hi there', 'hello there', 'good morning', 'good afternoon', 'good evening', 'greetings'}
RO_GREETINGS = {'salut', 'buna', 'buna ziua', 'buna seara', 'buna dimineata'}
EN_ACKS = {'thanks', 'thank you', 'thanks a lot', 'thank you very much', 'ok', 'okay', 'great', 'got it', 'interesting', 'cool', 'perfect'}
RO_ACKS = {'multumesc', 'mersi', 'multumesc mult', 'am inteles', 'bine', 'super'}
RO_SOCIAL = {'ce faci', 'ce mai faci', 'cum esti'}
EN_SOCIAL = {'how are you', 'how are you today', 'how are you doing', 'how is it going', 'how s it going', 'what s up', 'whats up'}
OTHER_SOCIAL = {'bonjour', 'bonsoir', 'hola', 'buenos dias', 'hallo', 'guten tag', 'ciao', 'merci', 'gracias', 'danke', 'comment ca va', 'como estas', 'wie geht es dir'}
FOLLOW_UP = re.compile(r'\b(it|that|those|they|them|he|his|this project|acesta|acest proiect|el|lui)\b|^(and |also |what about |si |dar )|^(tell me more|go on|continue|more details|spune mi mai multe|continua)$')
SERVICES = re.compile(r'\b(services?|consulting|automate|automation|invoice|internal ai assistant|servicii|automatizare)\b')
# Only obvious unrelated requests bypass RAG. This is deliberately not an exhaustive classifier.
UNRELATED = re.compile(r'\b(weather|world cup|president of|football score|vremea|cupa mondiala|capital of|capitala|albert einstein|quantum physics|fizica cuantica)\b|\b(write|create|code|build|scrie)\b.*\b(game|poem|recipe|reteta|joc)\b|\d\s*[+*/-]\s*\d')
PORTFOLIO = re.compile(r'\b(tudor|portfolio|portofoliu|t ai|profiling agent|document analyst)\b')
GENERAL_TECH = re.compile(r'^(what is|what are|explain|define|ce este|ce inseamna|explica)\b.*\b(rag|python|fastapi|llms?|ai|agents?|embeddings?)\b')
RAG_INTENTS = {'portfolio_query', 'project_query', 'skills_query', 'experience_query', 'service_query', 'tai_query', 'follow_up'}

REDIRECTS = {
    'English': (
        "I'm focused on Tudor's professional portfolio. Ask me about his projects, experience, skills, AI services, or how T AI works.",
        "My scope is Tudor's work and portfolio. I can help you explore his AI projects, technologies, experience, or services.",
        "I can help with Tudor's professional background and AI work. Would you like to explore a project or his services?",
    ),
    'Romanian': (
        'Sunt aici pentru întrebări despre proiectele, experiența, competențele și serviciile AI ale lui Tudor. Mă poți întreba și cum funcționează T AI.',
        'Mă concentrez pe portofoliul și activitatea profesională a lui Tudor. Putem explora proiectele AI, tehnologiile sau serviciile sale.',
        'Te pot ajuta să descoperi experiența profesională și proiectele AI ale lui Tudor. Ce parte a portofoliului ai vrea să explorăm?',
    ),
    'French': ("Je me concentre sur le portfolio de Tudor : ses projets, son expérience, ses compétences et ses services en IA.",),
    'Spanish': ('Me centro en el portafolio de Tudor: sus proyectos, experiencia, habilidades y servicios de IA.',),
    'German': ('Ich konzentriere mich auf Tudors Portfolio: seine Projekte, Erfahrung, Fähigkeiten und KI-Dienstleistungen.',),
    'Italian': ('Mi concentro sul portfolio di Tudor: progetti, esperienza, competenze e servizi di IA.',),
}


def reply_language(request: ChatRequest) -> str:
    from app.rag.language import language_hint
    text = normalize(request.message)
    if text in RO_GREETINGS | RO_ACKS | RO_SOCIAL:
        return 'Romanian'
    if text in EN_GREETINGS | EN_SOCIAL | {'thanks', 'thank you'}:
        return 'English'
    return 'Romanian' if language_hint(request).startswith('Romanian') else 'English'


def scope_redirect(request: ChatRequest, language: str | None = None) -> str:
    variants = REDIRECTS.get(language or reply_language(request), REDIRECTS['English'])
    turn = sum(m.role == 'user' for m in request.history)
    return variants[turn % len(variants)]


def greeting_suggestions(request: ChatRequest) -> tuple[str, ...]:
    if reply_language(request) == 'Romanian':
        return ('Care sunt proiectele AI ale lui Tudor?', 'Ce tehnologii folosește Tudor?',
                'Ce servicii AI oferă Tudor?', 'Cum funcționează T AI?')
    return ("What AI projects has Tudor built?", 'What technologies does Tudor work with?',
            'What AI services does Tudor offer?', 'How does T AI work?')


def classify(message: str) -> Intent:
    text = normalize(message)
    if text in EN_GREETINGS | RO_GREETINGS:
        return 'greeting'
    if text in EN_ACKS | RO_ACKS:
        return 'acknowledgement'
    if text in RO_SOCIAL | EN_SOCIAL | OTHER_SOCIAL:
        return 'social'
    if UNRELATED.search(message.casefold()) or UNRELATED.search(text):
        # Mixed requests and possible business use cases need semantic checking.
        if PORTFOLIO.search(text) or SERVICES.search(text) or re.search(r'\b(my|our|business|clinic|company|mea|meu|firma)\b', text):
            return 'ambiguous'
        return 'out_of_scope'
    if FOLLOW_UP.search(text) and not PORTFOLIO.search(text):
        return 'follow_up'
    if SERVICES.search(text):
        return 'service_query'
    if PORTFOLIO.search(text):
        if re.search(r'\bt ai\b', text):
            return 'tai_query'
        if re.search(r'\b(projects?|proiecte|proiectele|profiling agent|document analyst)\b', text):
            return 'project_query'
        if re.search(r'\b(skills?|technologies|stack|python|competente|tehnologii|tehnologiiile)\b', text):
            return 'skills_query'
        if re.search(r'\b(experience|experienta|education|certifications?|educatie|certificari|worked|years|ani)\b', text):
            return 'experience_query'
        return 'portfolio_query'
    if text in {'skills', 'technologies', 'projects', 'experience', 'education', 'certifications'}:
        return {'skills': 'skills_query', 'technologies': 'skills_query', 'projects': 'project_query'}.get(text, 'experience_query')
    return 'ambiguous'


@dataclass(frozen=True)
class Route:
    intent: Intent
    reply: str | None = None
    recent: tuple[str, ...] = ()
    needs_scope_check: bool = False
    suggestions: tuple[str, ...] = ()
    contact: bool = False


def route_message(request: ChatRequest) -> Route:
    intent = classify(request.message)
    text = normalize(request.message)
    previous = [m.content for m in request.history if m.role == 'user']
    # Deterministic variation across repeated greetings, without model calls or server state.
    turn = sum(classify(message) == intent for message in previous)
    if intent == 'greeting':
        replies = (
            ("Salut! Sunt T AI, asistentul de portofoliu al lui Tudor. Vrei să explorăm proiectele, experiența tehnică sau serviciile AI?",
             "Bună! Te pot ajuta să afli despre proiectele lui Tudor, tehnologiile folosite sau serviciile AI. Ce ai vrea să explorezi?")
            if text in RO_GREETINGS else
            ("Hi! I'm T AI, Tudor's portfolio assistant. Would you like to explore his projects, technical experience, or AI services?",
             "Hello! Happy to help you explore Tudor's portfolio. Ask me about a project, his Python experience, or AI services.")
        )
        return Route(intent, replies[turn % len(replies)], suggestions=greeting_suggestions(request))
    if intent == 'acknowledgement':
        # Ambiguous acknowledgements inherit the recent user's language locally.
        reply = ("Cu plăcere! Vrei să explorăm un proiect sau serviciile lui Tudor?" if reply_language(request) == 'Romanian' else
                 "You're welcome! Want to explore a project or Tudor's AI services?")
        return Route(intent, reply)
    if intent == 'out_of_scope':
        return Route(intent, scope_redirect(request))
    if intent == 'social':
        if text in RO_SOCIAL:
            return Route(intent, 'Sunt aici și gata să te ajut! Vrei să explorăm proiectele lui Tudor sau să discutăm o idee de automatizare?')
        if text in EN_SOCIAL:
            return Route(intent, "I'm here and ready to help! Would you like to explore Tudor's work or discuss an AI project idea?")
        return Route(intent)
    recent: list[str] = []
    if intent == 'follow_up':
        for question in reversed(previous):
            earlier = classify(question)
            if earlier in ('greeting', 'acknowledgement', 'social'):
                continue
            if earlier == 'out_of_scope':
                break
            recent.insert(0, question)
            if earlier != 'follow_up':
                break
        if not recent and text in {'tell me more', 'go on', 'continue', 'more details', 'spune mi mai multe', 'continua'}:
            return Route(intent, 'Ce proiect, competență sau serviciu al lui Tudor ai vrea să explorăm?' if text in {'spune mi mai multe', 'continua'} else "Which of Tudor's projects, skills, or services would you like to explore?")
    # Short requirements such as 'Appointments and phone calls' have no pronouns.
    # Include recent user turns for retrieval; semantic interpretation stays with the LLM.
    if not recent and len(text.split()) <= 8 and not PORTFOLIO.search(text):
        recent = [q for q in previous if classify(q) not in ('greeting', 'acknowledgement', 'social', 'out_of_scope')][-3:]
    if GENERAL_TECH.search(text) and not PORTFOLIO.search(text) and not previous:
        return Route('out_of_scope', scope_redirect(request))
    # Only explicit portfolio queries skip classification. Follow-ups and business
    # ideas are resolved semantically so unrelated history cannot expand scope.
    check = (intent in {'ambiguous', 'follow_up'} or
             (intent == 'service_query' and not PORTFOLIO.search(text)) or
             bool(re.search(r'\b(i want|i need|let s discuss|am nevoie|vreau)\b', text)) or
             bool(re.search(r'\b(hire|hiring|collaborate|collaboration|contact|angaja|colaborare)\b', text)) or
             bool(re.search(r'\b(ignore|instructions|system prompt|pretend|ignora|instructiuni)\b', text)))
    return Route(intent, recent=tuple(recent[-3:]), needs_scope_check=check)
