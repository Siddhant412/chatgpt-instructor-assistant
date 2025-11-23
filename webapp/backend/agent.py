from __future__ import annotations

import json
import os
from typing import List, Dict, Any

import ollama

from . import qwen_tools

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
]


SYSTEM_PROMPT = """You are an autonomous assistant with access to callable tools.

Pick and call tools when they help answer the user's request. Prefer accurate retrieval over guessing.
If a task references the app's pages, you can mention the right section (Research Library, Notes, Question Sets) but tools are your primary way to fetch fresh info.
Never fabricate tool results—if a tool fails, explain briefly."""

QWEN_MODEL = os.getenv("QWEN_AGENT_MODEL", "qwen2.5:7b")
OLLAMA_HOST = os.getenv("OLLAMA_HOST")  # optional override


def _chat_with_ollama(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {
        "model": QWEN_MODEL,
        "messages": messages,
        "tools": TOOL_DEFS,
    }
    if OLLAMA_HOST:
        kwargs["host"] = OLLAMA_HOST
    return ollama.chat(**kwargs)


def run_agent(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Run an agent loop with function calling via Ollama (Qwen).
    Accepts messages with role user/assistant/tool.
    Returns the expanded conversation (excluding the initial system prompt).
    """
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
                result = qwen_tools.execute_tool(name or "", **(args or {}))
                result_text = json.dumps(result, ensure_ascii=False, indent=2)
            except Exception as exc:  # pragma: no cover - best-effort guard
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
