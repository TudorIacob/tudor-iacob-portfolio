The primary public source is data/portfolio.json, shared by the website and T AI.
This directory preserves supplied reference material and selected supplemental facts.

The ingestion allowlist in backend/ingestion/loaders.py loads only experience.md,
education.md, projects/company-profiling-agent.md and projects/document-analyst.md.
Project supplements merge into their matching JSON project. Other files are references,
not automatically indexed. Generated overview documents summarize projects and skills.
New files need an explicit loader entry and a valid internal source URL.

Rules:
- Only verified information may be added.
- Do not invent professional experience.
- Do not invent technologies or certifications.
- Do not include private information.
- Update this knowledge base before re-running the ingestion pipeline.
