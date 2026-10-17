import shutil
from pathlib import Path

import pytest

from ingestion.loaders import REPO, load_documents
from ingestion.chunking import chunk_documents


def test_markdown_sources_resolve_to_existing_files():
    documents = load_documents()
    for document in documents:
        for source in document['source'].split(';'):
            if source.startswith('knowledge/'):
                assert source.endswith('.md')
                assert (REPO / source).is_file()
    experience = next(doc for doc in documents if doc['id'] == 'knowledge/experience.md')
    assert experience['url'] == '/#about'
    assert experience['title'] == 'Professional Experience'
    chunks = chunk_documents(documents)
    assert len({chunk['id'] for chunk in chunks}) == len(chunks)
    assert len({doc['id'] for doc in documents}) == len(documents)


@pytest.fixture
def knowledge_copy(tmp_path):
    shutil.copytree(REPO / 'knowledge', tmp_path / 'knowledge')
    (tmp_path / 'data').mkdir()
    shutil.copyfile(REPO / 'data/portfolio.json', tmp_path / 'data/portfolio.json')
    return tmp_path


def test_new_markdown_file_is_not_automatically_indexed(knowledge_copy):
    expected = load_documents(knowledge_copy)
    (knowledge_copy / 'knowledge/not-public.md').write_text('Unreviewed content', encoding='utf-8')
    assert load_documents(knowledge_copy) == expected


def test_markdown_frontmatter_validation_preserved(knowledge_copy):
    path = knowledge_copy / 'knowledge/experience.md'
    path.write_text('Missing frontmatter', encoding='utf-8')
    with pytest.raises(ValueError, match='Invalid front matter'):
        load_documents(knowledge_copy)


def test_nonpublic_markdown_remains_excluded(knowledge_copy):
    path = knowledge_copy / 'knowledge/experience.md'
    path.write_text(path.read_text(encoding='utf-8').replace('public: true','public: false'),encoding='utf-8')
    assert not any(doc['id']=='knowledge/experience.md' for doc in load_documents(knowledge_copy))
