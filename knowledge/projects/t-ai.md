---
title: T AI
category: project
source: portfolio
slug: t-ai
public: true
---

# T AI — Personal RAG Assistant

T AI is the AI assistant integrated into Tudor Iacob's personal portfolio.

It is designed to answer questions about:

- Tudor's professional background
- technical skills
- projects
- certifications
- portfolio
- AI services

T AI uses Retrieval-Augmented Generation.

The intended architecture is:

User question
→ query embedding
→ vector similarity search
→ retrieval of relevant portfolio content
→ context construction
→ Large Language Model
→ generated answer
→ source citations

The application uses a dedicated public portfolio knowledge base rather than asking the LLM to invent information about Tudor.

The planned technology stack includes:

- Next.js
- TypeScript
- Python
- FastAPI
- LLM APIs
- embeddings
- Supabase
- PostgreSQL
- pgvector
- Retrieval-Augmented Generation

T AI should cite relevant portfolio sources when answering questions.

T AI must refuse to invent information when relevant context cannot be retrieved.

T AI is both a portfolio-navigation tool and a technical demonstration of a RAG application.


