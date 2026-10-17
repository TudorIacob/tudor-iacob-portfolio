"""High-confidence RO/EN language hints; the model handles other languages.

These hints never classify intent or establish facts. Ambiguous short turns inherit
the latest user language, not the language of an assistant answer or source document.
"""
import re

from app.models.chat import ChatRequest
from app.rag.intent import normalize

RO = set('am sunt vreau doresc as dori clinica stomatologica programari apeluri telefonice folosim meu mea pentru despre care cum ce salut multumesc da este sunt capitala vremea cine explica reteta'.split())
EN = set('i we my our want need run would like which what how who does did built work for please hello thanks appointments calls use is are the'.split())


def detect(message: str) -> str | None:
    text = normalize(message)
    if re.search(r'\b(in english|speak english|answer in english)\b', text):
        return 'English'
    if re.search(r'\b(in romana|romaneste|limba romana)\b', text):
        return 'Romanian'
    words = set(text.split())
    ro, en = len(words & RO), len(words & EN)
    if ro >= 2 and ro > en:
        return 'Romanian'
    if en >= 2 and en > ro:
        return 'English'
    return None


def language_hint(request: ChatRequest) -> str:
    current = detect(request.message)
    if current:
        return current
    # Longer unsupported-language messages must be interpreted by the model,
    # rather than forced into the preceding RO/EN language.
    if len(normalize(request.message).split()) <= 4:
        for message in reversed(request.history):
            if message.role == 'user' and (previous := detect(message.content)):
                return f'{previous}, unless the current message clearly switches language'
    return 'the language of the current user message; use history only if ambiguous'
