from __future__ import annotations

from pathlib import Path
from typing import Any, Tuple

import uvicorn
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware

from mcp.server.fastmcp import FastMCP

from server.db import init_db
from server.tools.render_library import render_library_structured
from server.tools.add_paper import add_paper
from server.tools.index_paper import index_paper
from server.tools.get_paper_chunk import get_paper_chunk
from server.tools.save_note import save_note
from server.tools.delete_paper import delete_paper


DIST_DIR = (Path(__file__).parent.parent / "web" / "dist")


def _read_first(patterns: list[str]) -> str:
    """
    Return the text of the first file in dist matching any of the given glob patterns
    """
    for pat in patterns:
        for p in DIST_DIR.glob(pat):
            return p.read_text(encoding="utf-8")
    return ""


WIDGET_JS_TEXT: str
WIDGET_FIXED = DIST_DIR / "widget.js"
if WIDGET_FIXED.exists():
    WIDGET_JS_TEXT = WIDGET_FIXED.read_text(encoding="utf-8")
else:
    WIDGET_NO_EXT = DIST_DIR / "widget"
    if WIDGET_NO_EXT.exists():
        WIDGET_JS_TEXT = WIDGET_NO_EXT.read_text(encoding="utf-8")
    else:
        WIDGET_JS_TEXT = _read_first(["*.js", "assets/*.js"])
        if not WIDGET_JS_TEXT:
            raise FileNotFoundError(
                "No JS bundle found in web/dist. Build the widget: `cd web && npm run build`."
            )

WIDGET_CSS_TEXT = _read_first(["*.css", "assets/*.css"])


# MCP server

mcp = FastMCP(name="research-notes-py")
TEMPLATE_URI = "ui://widget/research-notes.html"

init_db()


@mcp.resource(TEMPLATE_URI)
def research_notes_widget() -> dict[str, Any]:
    """
    UI template rendered inside ChatGPT (Apps SDK).
    Must be served as `text/html+skybridge` and should enable component-initiated tool calls
    with `_meta["openai/widgetAccessible"] = True`.
    """
    html = f"""
<div id="root"></div>
{f"<style>{WIDGET_CSS_TEXT}</style>" if WIDGET_CSS_TEXT else ""}
<script type="module">
{WIDGET_JS_TEXT}
</script>
""".strip()

    return {
        "contents": [
            {
                "uri": TEMPLATE_URI,
                "mimeType": "text/html+skybridge",
                "text": html,
                "_meta": {
                    "openai/widgetAccessible": True,
                    "openai/widgetPrefersBorder": True,
                    "openai/widgetCSP": {
                        "connect_domains": [],
                        "resource_domains": [],
                    },
                },
            }
        ]
    }


# Tools (return _meta.openai/outputTemplate so ChatGPT renders the widget)

@mcp.tool()
def render_library() -> dict:
    """
    Show the research library: returns the current list of papers (title, id, note counts).
    Use when the user asks to view or refresh the library.
    """
    return {
        "content": [],
        "structuredContent": render_library_structured(),
        "_meta": {
            "openai/outputTemplate": TEMPLATE_URI,
            "openai/toolInvocation/invoking": "Loading library…",
            "openai/toolInvocation/invoked": "Library loaded.",
        },
    }


@mcp.tool()
async def add_paper_tool(input_str: str, source_url: str | None = None) -> dict:
    """
    Add a paper to the library by DOI, direct PDF URL, or landing-page URL.
    Indexes pages for later chunk access. Returns updated library view.
    Use when the user provides a DOI/URL and wants it added and indexed.
    """
    res = await add_paper(input_str, source_url)
    return {
        "content": [{"type": "text", "text": f"Added: {res['title']}"}],
        "structuredContent": render_library_structured(),
        "_meta": {
            "openai/outputTemplate": TEMPLATE_URI,
            "openai/toolInvocation/invoking": "Working…",
            "openai/toolInvocation/invoked": "Done.",
        },
    }


@mcp.tool()
def index_paper_tool(paper_id: int) -> dict:
    """
    List all indexed sections for a paper (ids + page numbers).
    Use to browse chunks before requesting a specific chunk or summary.
    """
    return {
        "content": [],
        "structuredContent": index_paper(paper_id),
        "_meta": {
            "openai/outputTemplate": TEMPLATE_URI,
            "openai/toolInvocation/invoking": "Working…",
            "openai/toolInvocation/invoked": "Done.",
        },
    }


@mcp.tool()
def get_paper_chunk_tool(section_id: int) -> dict:
    """
    Fetch the text of a specific section/chunk by id.
    Use when the user asks to read a particular page/chunk.
    """
    return {
        "content": [],
        "structuredContent": get_paper_chunk(section_id),
        "_meta": {
            "openai/outputTemplate": TEMPLATE_URI,
            "openai/toolInvocation/invoking": "Working…",
            "openai/toolInvocation/invoked": "Done.",
        },
    }


@mcp.tool()
def save_note_tool(paper_id: int, body: str) -> dict:
    """
    Save a note attached to a paper.
    Use when the user dictates or submits a note for a given paper.
    """
    return {
        "content": [],
        "structuredContent": save_note(paper_id, body),
        "_meta": {
            "openai/outputTemplate": TEMPLATE_URI,
            "openai/toolInvocation/invoking": "Working…",
            "openai/toolInvocation/invoked": "Done.",
        },
    }


@mcp.tool()
def delete_paper_tool(paper_id: int) -> dict:
    """
    Remove a paper and its notes/sections from the library.
    Use when the user asks to delete a paper.
    """
    return {
        "content": [],
        "structuredContent": delete_paper(paper_id),
        "_meta": {
            "openai/outputTemplate": TEMPLATE_URI,
            "openai/toolInvocation/invoking": "Working…",
            "openai/toolInvocation/invoked": "Done.",
        },
    }


def _make_mcp_asgi() -> Tuple[Any, str]:
    """
    Return (mcp_asgi_app, mount_where), adapting to the FastMCP version installed.

    - If http_app(path="/mcp") exists, use it and mount at ROOT ("/") because the app
      internally serves under /mcp.
    - Else if sse_app(path="/mcp") exists, same.
    - Else if asgi_app() exists (no path support), mount it under "/mcp".
    - Else raise a clear error.
    """
    # Prefer HTTP transport if available
    if hasattr(mcp, "http_app"):
        try:
            return mcp.http_app(path="/mcp"), "root"
        except TypeError:
            # Older signature without 'path'
            return mcp.http_app(), "mcp"

    # Fall back to SSE transport
    if hasattr(mcp, "sse_app"):
        try:
            return mcp.sse_app(path="/mcp"), "root"
        except TypeError:
            return mcp.sse_app(), "mcp"

    if hasattr(mcp, "asgi_app"):
        return mcp.asgi_app(), "mcp"

    raise RuntimeError(
        "FastMCP does not expose http_app, sse_app, or asgi_app. "
        "Please upgrade the 'mcp' package (pip install -U mcp)."
    )


def build_asgi():
    """
    Build a Starlette app and mount the MCP ASGI app in a way that works across
    FastMCP versions.
    """
    mcp_app, mount_where = _make_mcp_asgi()

    # Propagate MCP lifespan if present (ensures sessions initialize correctly)
    lifespan = getattr(mcp_app, "lifespan", None)
    app = Starlette(lifespan=lifespan) if lifespan else Starlette()

    # CORS: open during dev
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if mount_where == "root":
        app.mount("/", mcp_app)
    else:
        app.mount("/mcp", mcp_app)

    return app


if __name__ == "__main__":
    uvicorn.run(build_asgi(), host="127.0.0.1", port=8000)
