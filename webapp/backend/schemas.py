from __future__ import annotations

from typing import Dict, List, Optional
from typing import Literal

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    body: str = Field(..., min_length=1)
    paper_id: Optional[int] = Field(default=None, ge=1)


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    body: Optional[str] = Field(default=None, min_length=1)
    paper_id: Optional[int] = Field(default=None, ge=1)


class Question(BaseModel):
    kind: str = Field(default="short_answer", min_length=1)
    text: str = Field(..., min_length=1)
    options: Optional[List[str]] = None
    answer: Optional[str] = None
    explanation: Optional[str] = None
    reference: Optional[str] = None


class QuestionSetCreate(BaseModel):
    prompt: str = Field(..., min_length=3)
    questions: List[Question] = Field(..., min_length=1)


class QuestionSetUpdate(BaseModel):
    prompt: Optional[str] = Field(default=None, min_length=3)
    questions: List[Question] = Field(..., min_length=1)


class QuestionGenerationRequest(BaseModel):
    instructions: str = Field(..., min_length=5)
    context: Optional[str] = None
    question_count: Optional[int] = Field(default=None, ge=1, le=100)
    question_types: Optional[List[str]] = None
    provider: Optional[str] = Field(
        default=None,
        description="LLM provider identifier, e.g., 'openai' or 'local'."
    )
    format: Optional[str] = Field(
        default="json",
        description="Desired response format; currently only 'json' is supported."
    )


class QuestionGenerationResponse(BaseModel):
    questions: List[Question]
    markdown: str
    raw_response: Optional[str] = None


class QuestionContextUploadResponse(BaseModel):
    context_id: str
    filename: str
    characters: int
    preview: str
    text: str


class PaperRecord(BaseModel):
    id: int
    title: Optional[str] = None
    source_url: Optional[str] = None
    pdf_path: Optional[str] = None
    pdf_url: Optional[str] = None
    created_at: Optional[str] = None
    note_count: Optional[int] = None


class NoteRecord(BaseModel):
    id: int
    paper_id: Optional[int] = None
    title: Optional[str] = None
    body: str
    created_at: Optional[str] = None


class PaperDownloadRequest(BaseModel):
    source: str = Field(..., min_length=3)
    source_url: Optional[str] = None


class PaperChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1)


class PaperChatRequest(BaseModel):
    messages: List[PaperChatMessage] = Field(..., min_length=1)


class CanvasPushRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    course_id: Optional[str] = Field(default=None, min_length=1)
    time_limit: Optional[int] = Field(default=None, ge=1, le=600)
    publish: Optional[bool] = None
    points: Optional[Dict[str, int]] = None


class CanvasPushResponse(BaseModel):
    quiz_id: int
    quiz_url: str
    quiz_title: str
    course_id: str
    total_questions: int
    uploaded_questions: int
    published: bool
