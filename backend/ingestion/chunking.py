import hashlib
import re
from datetime import datetime, timezone

def chunk_documents(documents: list[dict], limit: int = 1800) -> list[dict]:
    """Keep headings and paragraphs together; split oversized paragraphs by sentence."""
    records = []
    for document in documents:
        content = re.sub(r'\n{3,}', '\n\n', document['content'].strip())
        section, buffer, index = document['title'], '', 0
        def flush():
            nonlocal buffer, index
            if not buffer.strip():
                return
            text = document['title'] + '\n' + buffer.strip()
            identifier = hashlib.sha256(f"{document['id']}:{index}:{text}".encode()).hexdigest()
            records.append({'id': identifier, 'content': text, 'metadata': {'document_id': document['id'], 'title': document['title'], 'category': document['category'], 'section': section, 'project': document['id'] if document['category'] == 'project' else None, 'source': document['source'], 'url': document['url'], 'anchor': document['url'].partition('#')[2], 'updated_at': datetime.now(timezone.utc).isoformat()}})
            index += 1
            buffer = ''
        for paragraph in content.split('\n\n'):
            if paragraph.startswith('#'):
                flush()
                section = paragraph.lstrip('# ').strip()
            pieces = re.split(r'(?<=[.!?])\s+', paragraph) if len(paragraph) > limit else [paragraph]
            for piece in pieces:
                for offset in range(0, len(piece), limit):
                    fragment = piece[offset:offset + limit]
                    if buffer and len(buffer) + len(fragment) > limit:
                        flush()
                    buffer += fragment + '\n\n'
        flush()
    return records
