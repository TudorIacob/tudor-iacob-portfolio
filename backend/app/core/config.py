from pathlib import Path
from typing import Literal
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / '.env', extra='ignore', hide_input_in_errors=True)
    mode: Literal['demo', 'live'] = 'demo'
    backend_api_key: str = Field(default='', repr=False)
    llm_api_key: str = Field(default='', repr=False)
    llm_base_url: str = 'https://api.openai.com/v1'
    llm_model: str = Field(default='gpt-6-luna', min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$')
    llm_reasoning_effort: Literal['none', 'low'] = 'none'
    embedding_model: str = 'text-embedding-3-small'
    embedding_dimensions: int = 1536
    supabase_url: str = ''
    supabase_secret_key: str = Field(default='', repr=False)
    cors_origins: list[str] = ['http://localhost:3000']
    top_k: int = Field(default=5, ge=1, le=10)
    similarity_threshold: float = Field(default=0.35, ge=0, le=1)
    rate_limit_per_minute: int = Field(default=60, ge=1)

    @field_validator('llm_base_url', 'supabase_url')
    @classmethod
    def secure_endpoint(cls, value: str) -> str:
        from urllib.parse import urlsplit
        if not value:
            return value
        url = urlsplit(value)
        if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError('Provider endpoints must be HTTPS URLs without credentials, query or fragment.')
        return value.rstrip('/')

    @field_validator('cors_origins')
    @classmethod
    def explicit_origins(cls, values: list[str]) -> list[str]:
        from urllib.parse import urlsplit
        for value in values:
            url = urlsplit(value)
            if url.scheme not in ('http', 'https') or not url.hostname or url.path or url.query or url.fragment or url.username:
                raise ValueError('CORS requires explicit origins without paths or wildcards.')
        return values

    @field_validator('supabase_secret_key')
    @classmethod
    def validate_supabase_secret_key(cls, value: str) -> str:
        if value and (not value.startswith('sb_secret_') or len(value) <= len('sb_secret_') or any(char.isspace() for char in value)):
            raise ValueError('SUPABASE_SECRET_KEY must be an sb_secret_ key, not a JWT or publishable key.')
        return value

    @model_validator(mode='after')
    def validate_live(self):
        if self.embedding_dimensions != 1536:
            raise ValueError('This migration requires 1536-dimensional embeddings.')
        if self.mode == 'live' and not all([self.backend_api_key, self.llm_api_key, self.supabase_url, self.supabase_secret_key]):
            raise ValueError('Live mode requires backend authentication, LLM credentials, and Supabase credentials.')
        return self

