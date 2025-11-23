from __future__ import annotations

import base64
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from server.db import get_conn
from server.question_sets import (
    create_question_set,
    delete_question_set,
    get_question_set,
    list_question_sets,
    update_question_set,
)
from server.tools.render_library import render_library_structured
from server.tools.add_paper import add_paper
from server.tools.delete_paper import delete_paper as delete_paper_record

from .schemas import (
    CanvasPushRequest,
    CanvasPushResponse,
    NoteCreate,
    NoteUpdate,
    PaperChatRequest,
    PaperDownloadRequest,
    PaperRecord,
    QuestionContextUploadResponse,
    QuestionGenerationRequest,
    QuestionGenerationResponse,
    QuestionInsertionPreviewResponse,
    QuestionInsertionRequest,
    QuestionSetCreate,
    QuestionSetUpdate,
    AgentChatRequest,
    AgentChatResponse,
    WebSearchRequest,
    NewsRequest,
    ArxivSearchRequest,
    ArxivDownloadRequest,
    PdfSummaryRequest,
    YoutubeSearchRequest,
    YoutubeDownloadRequest,
)
from .services import (
    QuestionGenerationError,
    generate_insertion_preview,
    generate_questions,
    summarize_paper_chat,
    stream_generate_questions,
)
from .agent import run_agent
from .mcp_client import (
    MCPClientError,
    call_tool as call_mcp_tool,
    call_tool_async as call_mcp_tool_async,
    is_configured as mcp_configured,
)
from .canvas_service import CanvasPushError, push_question_set_to_canvas
from . import qwen_tools

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

logger = logging.getLogger(__name__)


def _get_paper(paper_id: int) -> Optional[Dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, title, source_url, pdf_path, created_at FROM papers WHERE id=?",
            (paper_id,)
        ).fetchone()
    if not row:
        return None
    data = dict(row)
    pdf_path = data.get("pdf_path")
    data["pdf_url"] = f"/api/papers/{data['id']}/file" if pdf_path else None
    return data

app = FastAPI(title="Instructor Assistant Web API")

app.add_middleware(
    CORSMiddleware,
    allow_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/papers")
def list_papers() -> Dict[str, List[Dict]]:
    data = render_library_structured()
    return {"papers": data.get("papers", [])}


@app.get("/api/papers/{paper_id}/file")
def download_paper_file(paper_id: int):
    with get_conn() as conn:
        row = conn.execute("SELECT title, pdf_path FROM papers WHERE id=?", (paper_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Paper not found.")
    pdf_path = Path(row["pdf_path"])
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not available on server.")
    headers = {"Content-Disposition": f"inline; filename=\"{pdf_path.name}\""}
    return FileResponse(pdf_path, media_type="application/pdf", headers=headers)


@app.get("/api/notes")
def list_notes() -> Dict[str, List[Dict]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT n.id, n.paper_id, n.title, n.body, n.created_at,
                   p.title AS paper_title
            FROM notes n
            LEFT JOIN papers p ON p.id = n.paper_id
            ORDER BY datetime(n.created_at) DESC, n.id DESC
            """
        ).fetchall()
    return {"notes": [dict(r) for r in rows]}


@app.post("/api/notes", status_code=201)
def create_note(payload: NoteCreate) -> Dict[str, Dict]:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO notes (paper_id, title, body, created_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (payload.paper_id, payload.title or "Untitled", payload.body),
        )
        note_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        row = conn.execute(
            """
            SELECT n.id, n.paper_id, n.title, n.body, n.created_at,
                   p.title AS paper_title
            FROM notes n
            LEFT JOIN papers p ON p.id = n.paper_id
            WHERE n.id=?
            """,
            (note_id,),
        ).fetchone()
    return {"note": dict(row)}


@app.put("/api/notes/{note_id}")
def update_note(note_id: int, payload: NoteUpdate) -> Dict[str, Dict]:
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id, paper_id, title, body FROM notes WHERE id=?",
            (note_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Note not found.")
        new_title = payload.title if payload.title is not None else existing["title"]
        new_body = payload.body if payload.body is not None else existing["body"]
        new_paper_id = payload.paper_id if payload.paper_id is not None else existing["paper_id"]
        conn.execute(
            "UPDATE notes SET paper_id=?, title=?, body=? WHERE id=?",
            (new_paper_id, new_title, new_body, note_id),
        )
        row = conn.execute(
            """
            SELECT n.id, n.paper_id, n.title, n.body, n.created_at,
                   p.title AS paper_title
            FROM notes n
            LEFT JOIN papers p ON p.id = n.paper_id
            WHERE n.id=?
            """,
            (note_id,),
        ).fetchone()
    return {"note": dict(row)}


@app.delete("/api/notes/{note_id}", status_code=204, response_class=Response)
def remove_note(note_id: int) -> Response:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
        conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Note not found.")
    return Response(status_code=204)


@app.get("/api/question-sets")
def get_question_sets() -> Dict[str, List[Dict]]:
    return {"question_sets": list_question_sets()}


@app.get("/api/question-sets/{set_id}")
def get_question_set_detail(set_id: int) -> Dict[str, Any]:
    payload = get_question_set(set_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Question set not found.")
    return payload


@app.post("/api/question-sets", status_code=201)
def create_question_set_handler(payload: QuestionSetCreate) -> Dict[str, Any]:
    try:
        data = create_question_set(payload.prompt, [q.model_dump() for q in payload.questions])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return data


@app.put("/api/question-sets/{set_id}")
def update_question_set_handler(set_id: int, payload: QuestionSetUpdate) -> Dict[str, Any]:
    try:
        data = update_question_set(set_id, payload.prompt, [q.model_dump() for q in payload.questions])
    except ValueError as exc:
        detail = str(exc)
        code = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=code, detail=detail)
    return data


@app.delete("/api/question-sets/{set_id}", status_code=204, response_class=Response)
def delete_question_set_handler(set_id: int) -> Response:
    if not get_question_set(set_id):
        raise HTTPException(status_code=404, detail="Question set not found.")
    delete_question_set(set_id)
    return Response(status_code=204)


@app.post("/api/question-sets/generate", response_model=QuestionGenerationResponse)
async def generate_question_set_ai(payload: QuestionGenerationRequest) -> QuestionGenerationResponse:
    try:
        return await run_in_threadpool(generate_questions, payload)
    except QuestionGenerationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/question-sets/generate/stream")
async def generate_question_set_stream(payload: QuestionGenerationRequest):
    async def event_stream():
        try:
            async for event in stream_generate_questions(payload):
                yield f"data: {json.dumps(event)}\n\n"
        except QuestionGenerationError as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/question-sets/context", response_model=QuestionContextUploadResponse)
async def upload_question_context(file: UploadFile = File(...)) -> QuestionContextUploadResponse:
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file was empty.")
    try:
        if not mcp_configured():
            raise HTTPException(status_code=500, detail="LOCAL_MCP_SERVER_URL must be configured to upload contexts.")
        data_b64 = base64.b64encode(contents).decode("utf-8")
        try:
            payload = await call_mcp_tool_async(
                "upload_context",
                {
                    "filename": file.filename or "upload",
                    "data_b64": data_b64,
                },
            )
        except MCPClientError as exc:
            raise HTTPException(status_code=500, detail=str(exc))
        context_data = (payload or {}).get("context")
        if not context_data:
            raise HTTPException(status_code=500, detail="MCP server did not return context metadata.")
        return QuestionContextUploadResponse(**context_data)
    except QuestionGenerationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/question-sets/{set_id}/preview/insert", response_model=QuestionInsertionPreviewResponse)
async def preview_question_insertion(set_id: int, payload: QuestionInsertionRequest) -> QuestionInsertionPreviewResponse:
    question_set_payload = get_question_set(set_id)
    if not question_set_payload:
        raise HTTPException(status_code=404, detail="Question set not found.")
    try:
        preview_questions, merged_questions, insert_index = await run_in_threadpool(
            generate_insertion_preview,
            question_set_payload,
            payload,
        )
    except QuestionGenerationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return QuestionInsertionPreviewResponse(
        question_set=question_set_payload["question_set"],
        preview_questions=preview_questions,
        merged_questions=merged_questions,
        insert_index=insert_index,
    )


@app.post("/api/papers/download", status_code=201)
async def download_paper(payload: PaperDownloadRequest) -> Dict[str, PaperRecord]:
    source = payload.source.strip()
    if not source:
        raise HTTPException(status_code=400, detail="Enter a DOI, URL, or PDF source.")
    try:
        result = await add_paper(source, payload.source_url or source)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    paper = _get_paper(result["paper_id"])
    if not paper:
        raise HTTPException(status_code=500, detail="Downloaded paper could not be loaded.")
    return {"paper": PaperRecord.model_validate(paper)}


@app.delete("/api/papers/{paper_id}", status_code=204, response_class=Response)
def delete_paper_handler(paper_id: int) -> Response:
    paper = _get_paper(paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found.")
    try:
        delete_paper_record(paper_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    path = paper.get("pdf_path")
    if path:
        pdf_path = Path(path)
        pdf_path.unlink(missing_ok=True)
    return Response(status_code=204)


@app.post("/api/papers/{paper_id}/chat")
async def paper_summary_chat(paper_id: int, payload: PaperChatRequest) -> Dict[str, Any]:
    if not payload.messages:
        raise HTTPException(status_code=400, detail="Provide at least one message.")
    try:
        data = await run_in_threadpool(summarize_paper_chat, paper_id, [m for m in payload.messages])
    except QuestionGenerationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return data


@app.post("/api/question-sets/{set_id}/canvas")
def push_question_set_canvas(set_id: int, payload: CanvasPushRequest) -> Dict[str, Any]:
    data = get_question_set(set_id)
    if not data:
        raise HTTPException(status_code=404, detail="Question set not found.")
    try:
        result = push_question_set_to_canvas(set_id, data, payload)
    except CanvasPushError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return CanvasPushResponse(**result)


# Qwen tool endpoints

def _wrap_tool_call(fn, **kwargs) -> Dict[str, Any]:
    try:
        return fn(**kwargs)
    except Exception as exc:
        logger.exception("Tool execution failed")
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/tools/web-search")
def tool_web_search(payload: WebSearchRequest) -> Dict[str, Any]:
    return {"result": _wrap_tool_call(qwen_tools.web_search, query=payload.query, max_results=payload.max_results or 5)}


@app.post("/api/tools/news")
def tool_news(payload: NewsRequest) -> Dict[str, Any]:
    return {"result": _wrap_tool_call(qwen_tools.get_news, topic=payload.topic, limit=payload.limit or 10)}


@app.post("/api/tools/arxiv/search")
def tool_arxiv_search(payload: ArxivSearchRequest) -> Dict[str, Any]:
    return {"result": _wrap_tool_call(qwen_tools.arxiv_search, query=payload.query, max_results=payload.max_results or 5)}


@app.post("/api/tools/arxiv/download")
def tool_arxiv_download(payload: ArxivDownloadRequest) -> Dict[str, Any]:
    return {
        "result": _wrap_tool_call(
            qwen_tools.arxiv_download,
            arxiv_id=payload.arxiv_id,
            output_path=payload.output_path,
        )
    }


@app.post("/api/tools/pdf/summary")
def tool_pdf_summary(payload: PdfSummaryRequest) -> Dict[str, Any]:
    return {"result": _wrap_tool_call(qwen_tools.pdf_summary, pdf_path=payload.pdf_path)}


@app.post("/api/tools/youtube/search")
def tool_youtube_search(payload: YoutubeSearchRequest) -> Dict[str, Any]:
    return {
        "result": _wrap_tool_call(
            qwen_tools.youtube_search, query=payload.query, max_results=payload.max_results or 5
        )
    }


@app.post("/api/tools/youtube/download")
def tool_youtube_download(payload: YoutubeDownloadRequest) -> Dict[str, Any]:
    return {
        "result": _wrap_tool_call(
            qwen_tools.youtube_download,
            video_url=payload.video_url,
            output_path=payload.output_path,
        )
    }


@app.post("/api/agent/chat", response_model=AgentChatResponse)
def agent_chat(payload: AgentChatRequest) -> AgentChatResponse:
    try:
        convo = run_agent([m.model_dump() for m in payload.messages])
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return AgentChatResponse(messages=convo)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("webapp.backend.main:app", host="0.0.0.0", port=8010, reload=True)
