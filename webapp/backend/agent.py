from __future__ import annotations

import json
import os
import logging
from typing import List, Dict, Any

from pathlib import Path
import ollama
from server.db import get_conn

from . import qwen_tools
from server.tools.add_paper import add_local_pdf
from webapp.backend.services import summarize_paper_chat
from webapp.backend.schemas import PaperChatMessage

# Define the function-calling tool schemas for the model
TOOL_DEFS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for information using DuckDuckGo",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query string"},
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_news",
            "description": "Get latest news articles from Google News RSS feed",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {"type": "string", "description": "News topic to search"},
                    "limit": {
                        "type": "integer",
                        "description": "Max number of articles",
                        "default": 10,
                    },
                },
                "required": ["topic"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "arxiv_search",
            "description": "Search for research papers on arXiv",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query for arXiv"},
                    "max_results": {
                        "type": "integer",
                        "description": "Max number of papers",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "arxiv_download",
            "description": "Download a PDF paper from arXiv by ID",
            "parameters": {
                "type": "object",
                "properties": {
                    "arxiv_id": {"type": "string", "description": "arXiv paper ID"},
                    "output_path": {
                        "type": "string",
                        "description": "Optional output path (relative to downloads dir)",
                    },
                },
                "required": ["arxiv_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "pdf_summary",
            "description": "Extract text from a PDF and return a summary-ready excerpt",
            "parameters": {
                "type": "object",
                "properties": {
                    "pdf_path": {"type": "string", "description": "Path to the PDF file"}
                },
                "required": ["pdf_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "youtube_search",
            "description": "Search for videos on YouTube",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "max_results": {
                        "type": "integer",
                        "description": "Max number of videos",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "youtube_download",
            "description": "Download a YouTube video by URL",
            "parameters": {
                "type": "object",
                "properties": {
                    "video_url": {"type": "string", "description": "YouTube video URL"},
                    "output_path": {
                        "type": "string",
                        "description": "Optional output path (relative to downloads dir)",
                    },
                },
                "required": ["video_url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "summarize_paper",
            "description": "Summarize a downloaded paper (defaults to most recent download).",
            "parameters": {
                "type": "object",
                "properties": {
                    "paper_id": {
                        "type": "integer",
                        "description": "Paper ID to summarize (optional).",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_note_entry",
            "description": "Save a note/summary to the Research Library.",
            "parameters": {
                "type": "object",
                "properties": {
                    "paper_id": {"type": "integer", "description": "Paper ID to attach the note to"},
                    "title": {"type": "string", "description": "Note title"},
                    "body": {"type": "string", "description": "Note body content"},
                },
                "required": ["paper_id", "body"],
            },
        },
    },
]


SYSTEM_PROMPT = """You are an autonomous assistant with access to callable tools.

Pick and call tools when they help answer the user's request. Prefer accurate retrieval over guessing.
If a task references the app's pages, you can mention the right section (Research Library, Notes, Question Sets) but tools are your primary way to fetch fresh info.
Never fabricate tool results—if a tool fails, explain briefly.
When the user asks for a paper summary:
- If no paper_id is provided and no recent download is known, ask which paper (by id/title) to summarize.
- If summarization fails, report the error instead of guessing.
After summarizing, ask if the user wants to save it to Notes; if yes, call save_note_entry with the summary.
When saving a summary/note, use the paper title as the note title (unless the user provides one) and tell the user it was saved to Notes (not the Research Library)."""

QWEN_MODEL = os.getenv("QWEN_AGENT_MODEL", "qwen2.5:7b")
OLLAMA_HOST = os.getenv("OLLAMA_HOST")  # optional override
_LAST_DOWNLOADED_PAPER_ID: int | None = None
logger = logging.getLogger(__name__)


def _chat_with_ollama(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {
        "model": QWEN_MODEL,
        "messages": messages,
        "tools": TOOL_DEFS,
    }
    if OLLAMA_HOST:
        kwargs["host"] = OLLAMA_HOST
    return ollama.chat(**kwargs)


def _save_note_direct(paper_id: int, title: str | None, body: str) -> Dict[str, Any]:
    with get_conn() as conn:
        paper_row = conn.execute(
            "SELECT title FROM papers WHERE id=?",
            (paper_id,),
        ).fetchone()
    paper_title = (paper_row["title"] if paper_row else None) or "Untitled paper"
    note_title = (title or paper_title or "Summary").strip() or paper_title
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO notes (paper_id, title, body, created_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (paper_id, note_title, body),
        )
        nid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        row = conn.execute(
            """
            SELECT n.id, n.paper_id, n.title, n.body, n.created_at,
                   p.title AS paper_title
            FROM notes n
            LEFT JOIN papers p ON p.id = n.paper_id
            WHERE n.id=?
            """,
            (nid,),
        ).fetchone()
    return {"note_id": nid, "note": dict(row) if row else None, "paper_title": paper_title}


def _summarize_paper(paper_id: int) -> Dict[str, Any]:
    logger.info("[agent] summarize_paper paper_id=%s", paper_id)
    data = summarize_paper_chat(
        paper_id,
        [PaperChatMessage(role="user", content="Summarize this paper.")],
    )
    if not data or not data.get("message"):
        raise ValueError("Summarization returned no content. Ensure the paper is indexed and try again.")
    return {
        "paper_id": paper_id,
        "summary": data.get("message"),
        "suggested_title": data.get("suggested_title") or data.get("paper_title") or "Summary",
        "paper_title": data.get("paper_title"),
    }


def run_agent(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Run an agent loop with function calling via Ollama (Qwen).
    Accepts messages with role user/assistant/tool.
    Returns the expanded conversation (excluding the initial system prompt).
    """
    global _LAST_DOWNLOADED_PAPER_ID
    convo: List[Dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in messages:
        entry: Dict[str, Any] = {"role": m["role"], "content": m.get("content", "")}
        if m["role"] == "tool" and m.get("name"):
            entry["name"] = m["name"]
        convo.append(entry)

    max_iters = 5
    for _ in range(max_iters):
        resp = _chat_with_ollama(convo)
        message = resp["message"]
        tool_calls = message.get("tool_calls") or []

        # If no tool calls, finalize
        if not tool_calls:
            convo.append({"role": "assistant", "content": message.get("content", "")})
            break

        # Append assistant stub with tool calls (for traceability)
        convo.append(
            {
                "role": "assistant",
                "content": message.get("content", "") or "",
                "tool_calls": tool_calls,
            }
        )

        # Execute each tool call and feed back results
        for call in tool_calls:
            func = call.get("function", {})
            name = func.get("name")
            raw_args = func.get("arguments") or "{}"
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
            except json.JSONDecodeError:
                args = {}
            try:
                result = None
                if name in {
                    "web_search",
                    "get_news",
                    "arxiv_search",
                    "arxiv_download",
                    "pdf_summary",
                    "youtube_search",
                    "youtube_download",
                }:
                    result = qwen_tools.execute_tool(name or "", **(args or {}))
                elif name == "summarize_paper":
                    pid = args.get("paper_id") if isinstance(args, dict) else None
                    target_id = int(pid) if pid is not None else (_LAST_DOWNLOADED_PAPER_ID or 0)
                    if not target_id:
                        raise ValueError("No paper_id provided and no recent download available. Download a paper first or specify paper_id.")
                    result = _summarize_paper(target_id)
                elif name == "save_note_entry":
                    pid = args.get("paper_id") if isinstance(args, dict) else None
                    if pid is None:
                        raise ValueError("paper_id is required.")
                    result = _save_note_direct(int(pid), args.get("title"), args.get("body") or "")
                else:
                    raise ValueError(f"Unknown tool: {name}")

                if name == "arxiv_download" and isinstance(result, dict) and result.get("file_path"):
                    try:
                        ingest = add_local_pdf(
                            result.get("title"),
                            Path(result["file_path"]),
                            result.get("pdf_url") or result.get("arxiv_id"),
                        )
                        result["paper_id"] = ingest["paper_id"]
                        _LAST_DOWNLOADED_PAPER_ID = ingest["paper_id"]
                    except Exception as ingest_exc:
                        result["ingest_error"] = f"Failed to add to library: {ingest_exc}"
                result_text = json.dumps(result, ensure_ascii=False, indent=2)
            except Exception as exc:  # pragma: no cover - best-effort guard
                logger.exception("Tool '%s' failed", name)
                result_text = f"Tool '{name}' failed: {exc}"

            convo.append(
                {
                    "role": "tool",
                    "tool_call_id": call.get("id"),
                    "name": name,
                    "content": result_text,
                }
            )
    # Drop system prompt before returning
    return [m for m in convo if m.get("role") != "system"]
