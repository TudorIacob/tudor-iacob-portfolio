from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

class HistoryMessage(BaseModel):
    model_config = ConfigDict(extra='forbid', hide_input_in_errors=True)
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=6000)

class ChatRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', hide_input_in_errors=True)
    message: str = Field(min_length=1, max_length=2000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=6)
    conversation_id: str | None = Field(default=None, max_length=100)

    @field_validator('message')
    @classmethod
    def nonempty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError('Question cannot be empty')
        return value.strip()

class Source(BaseModel):
    id: str
    title: str
    url: str

class Chunk(BaseModel):
    id: str
    content: str
    metadata: dict[str, str | None]
    similarity: float = 1.0
