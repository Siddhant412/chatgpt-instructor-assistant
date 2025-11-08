from __future__ import annotations

from typing import List, Optional

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
