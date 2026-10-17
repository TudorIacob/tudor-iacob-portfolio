import json
import re
from pathlib import Path
import yaml

REPO = Path(__file__).resolve().parents[2]

def load_documents(root: Path = REPO) -> list[dict]:
    """Shared public content wins; preserve supplied markdown for deeper background."""
    data = json.loads((root / 'data/portfolio.json').read_text(encoding='utf-8'))
    docs = []
    def add(identifier, title, category, content, url):
        docs.append({'id': identifier, 'title': title, 'category': category, 'content': content, 'url': url, 'source': 'portfolio'})
    profile = data['profile']
    add('profile', 'About Tudor Iacob', 'profile', '\n\n'.join([profile['name'], profile['role'], profile['about'], profile['background'], 'Location: ' + profile['location']]), '/#about')
    add('contact', 'Contact Tudor', 'contact', '\n'.join([profile['email'], profile['github'], profile['linkedin']]), '/#contact')
    for p in data['projects']:
        add(p['slug'], p['title'], 'project', p['longDescription'] + '\n\nTechnologies: ' + ', '.join(p['technologies']) + '\n\n' + '\n'.join(p['highlights']), '/projects/' + p['slug'])
    add('projects-overview', 'Projects Tudor has worked on', 'project',
        'Tudor Iacob portfolio projects:\n' + '\n'.join(p['title'] + ': ' + p['longDescription'] for p in data['projects']), '/#projects')
    add('skills-overview', 'Technologies Tudor works with', 'skills',
        'Tudor Iacob skills and technology stack:\n' + '\n'.join(s['title'] + ': ' + ', '.join(s['items']) for s in data['skills']), '/#skills')
    for i, s in enumerate(data['skills']):
        add(f'skills-{i}', s['title'], 'skills', ', '.join(s['items']), '/#skills')
    for i, s in enumerate(data['services']):
        add(f'service-{i}', s['title'], 'services', s['description'] + '\n\n' + s['areas'], '/#services')
    for i, c in enumerate(data['certifications']):
        add(f'credential-{i}', c['name'], 'certifications', f"{c['name']} — {c['issuer']}. {c['status']}. Credential URL: {c['credentialUrl'] or 'not supplied'}. Dates not supplied.", '/#certifications')
    # These original documents supply additional facts; other original files are
    # retained as reference but superseded by the shared, reviewed content above.
    for filename in ['experience.md', 'education.md', 'projects/company-profiling-agent.md', 'projects/document-analyst.md']:
        path = root / 'knowledge' / filename
        raw = path.read_text(encoding='utf-8').replace('\r\n', '\n')
        match = re.fullmatch(r'---\n(.*?)\n---\n(.*)', raw, re.S)
        if not match:
            raise ValueError(f'Invalid front matter in {filename}')
        meta = yaml.safe_load(match[1])
        body = match[2].strip()
        if not isinstance(meta, dict) or not all(isinstance(meta.get(k), str) and meta[k].strip() for k in ('title', 'category')) or not body:
            raise ValueError(f'Invalid document metadata or empty body in {filename}')
        if meta.get('public') is not True:
            continue
        url = '/projects/' + meta['slug'] if meta.get('slug') else '/#about'
        project = next((d for d in docs if d['url'] == url and d['category'] == 'project'), None)
        if project:
            project['content'] += '\n\n' + body
            project['source'] += ';knowledge/' + filename
        else:
            add('knowledge/' + filename, meta['title'], meta['category'], body, url)
            docs[-1]['source'] = 'knowledge/' + filename
    if len({d['id'] for d in docs}) != len(docs):
        raise ValueError('Duplicate document IDs')
    for document in docs:
        if re.search(r'\[ADD [^\]]+\]', document['content']):
            raise ValueError('Unresolved placeholder in indexed document: ' + document['id'])
    return docs
