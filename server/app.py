from __future__ import annotations
import re
from pathlib import Path
from typing import Any, Dict, Tuple
from pydantic import BaseModel, Field
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import Context
from mcp.types import CallToolResult, TextContent

from server.db import init_db, get_conn
from server.tools.render_library import render_library_structured
from server.tools.add_paper import add_paper
from server.tools.index_paper import index_paper
from server.tools.get_paper_chunk import get_paper_chunk
from server.tools.save_note import save_note
from server.tools.delete_paper import delete_paper


DIST_DIR = (Path(__file__).parent.parent / "web" / "dist")

def _read_first(globs: list[str]) -> str:
    for pat in globs:
        for p in DIST_DIR.glob(pat):
            return p.read_text(encoding="utf-8")
    return ""

fixed = DIST_DIR / "widget.js"
if fixed.exists():
    WIDGET_JS = fixed.read_text(encoding="utf-8")
else:
    alt = DIST_DIR / "widget"
    if alt.exists():
        WIDGET_JS = alt.read_text(encoding="utf-8")
    else:
        WIDGET_JS = _read_first(["*.js", "assets/*.js"])
        if not WIDGET_JS:
            WIDGET_JS = ""
            print("[WARN] No web/dist/widget.js found. Run: cd web && npm i && npm run build")

WIDGET_CSS = _read_first(["*.css", "assets/*.css"])

# MCP server

mcp = FastMCP(name="research-notes-py")
TEMPLATE_URI = "ui://widget/research-notes.html"

init_db()

@mcp.resource(
    TEMPLATE_URI,
    mime_type="text/html+skybridge",
    annotations={
        "openai/widgetAccessible": True,
        "openai/widgetPrefersBorder": True,
    },
)
def research_notes_widget() -> str:
    """
    Return an HTML fragment rendered in the ChatGPT Apps UI.
    """
    style_block = f"<style>{WIDGET_CSS}</style>\n" if WIDGET_CSS else ""
    script_body = WIDGET_JS.replace("</script>", "<\\/script>")
    return (
        '<div id="root"></div>\n'
        f"{style_block}"
        f"<script>\n{script_body}\n</script>"
    )


# Tools

TOOL_META = {
    "openai/outputTemplate": TEMPLATE_URI,
    "openai/widgetAccessible": True,
}

def _tool_result(structured: Dict[str, Any], message: str) -> CallToolResult:
    """Common helper to attach widget metadata to every tool response."""
    return CallToolResult(
        content=[TextContent(type="text", text=message)],
        structuredContent=structured,
        meta=TOOL_META,
    )

@mcp.tool(meta=TOOL_META)
def render_library() -> CallToolResult:
    """Render the research library (papers with note counts)."""
    data = render_library_structured()
    count = len(data.get("papers", []))
    plural = "papers" if count != 1 else "paper"
    return _tool_result(data, f"Showing {count} {plural} in your library.")

@mcp.tool(meta=TOOL_META)
async def add_paper_tool(input_str: str, source_url: str | None = None) -> CallToolResult:
    """Add a paper by DOI/URL/PDF, index it, then refresh the library."""
    await add_paper(input_str, source_url)
    return _tool_result(render_library_structured(), "Added paper and refreshed library.")

@mcp.tool(meta=TOOL_META)
def index_paper_tool(paper_id: int) -> CallToolResult:
    return _tool_result(index_paper(paper_id), "Indexed sections listed above.")

@mcp.tool(meta=TOOL_META)
def get_paper_chunk_tool(section_id: int) -> CallToolResult:
    return _tool_result(get_paper_chunk(section_id), "Chunk content shown above.")


def _gather_excerpts(paper_id: int) -> Tuple[Dict[str, Any] | None, list[str]]:
    with get_conn() as conn:
        paper = conn.execute("SELECT id, title FROM papers WHERE id=?", (paper_id,)).fetchone()
        if not paper:
            return None, []
        sections = conn.execute(
            "SELECT page_no, text FROM sections WHERE paper_id=? ORDER BY page_no ASC",
            (paper_id,),
        ).fetchall()

    excerpts: list[str] = []
    total_chars = 0
    max_chars = 12000
    for row in sections:
        text = (row["text"] or "").strip()
        if not text:
            continue
        snippet = f"[Page {row['page_no']}] {text}"
        if total_chars + len(snippet) > max_chars:
            remaining = max_chars - total_chars
            if remaining <= 0:
                break
            snippet = snippet[:remaining]
        excerpts.append(snippet)
        total_chars += len(snippet)
        if total_chars >= max_chars:
            break
    return dict(paper), excerpts


def _local_summary(title: str, excerpts: list[str]) -> Tuple[str, list[str], list[str]]:
    text = " ".join(excerpts)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    summary_sentences: list[str] = []
    word_count = 0
    for s in sentences:
        summary_sentences.append(s)
        word_count += len(s.split())
        if word_count >= 260:
            break
    if not summary_sentences:
        summary_sentences = sentences[:5]
    summary_words = " ".join(summary_sentences).split()
    summary_text = " ".join(summary_words[:400])

    remaining_sentences = sentences[len(summary_sentences):]
    bullets: list[str] = []
    for s in remaining_sentences:
        if len(bullets) >= 5:
            break
        bullets.append(s)
    if not bullets and summary_sentences:
        bullets = summary_sentences[: min(3, len(summary_sentences))]

    limitations = [
        "Refer to the full paper for methodology details beyond this extract.",
        "Automated summary may omit nuanced results or caveats.",
        "Validate findings against the paper's original figures and discussion.",
    ]

    return summary_text, bullets, limitations


def _compose_note(summary_text: str, bullets: list[str], limitations: list[str]) -> str:
    body_parts: list[str] = [summary_text.strip()]
    cleaned_bullets = [line.lstrip("- ").strip() for line in bullets if line.strip()]
    if cleaned_bullets:
        body_parts.append(
            "Key takeaways:\n" + "\n".join(f"- {line}" for line in cleaned_bullets[:5])
        )
    cleaned_limits = [line.lstrip("- ").strip() for line in limitations if line.strip()]
    if cleaned_limits:
        body_parts.append(
            "Limitations:\n" + "\n".join(f"- {line}" for line in cleaned_limits[:3])
        )
    return "\n\n".join(part for part in body_parts if part).strip()

class SummarySchema(BaseModel):
    summary: str = Field(..., description="250-400 word narrative summary")
    bullets: str | None = Field(
        None,
        description="Five key takeaways, one per line starting with '- '",
    )
    limitations: str | None = Field(
        None,
        description="Three limitations or open questions, one per line starting with '- '",
    )

@mcp.tool(meta=TOOL_META)
async def summarize_paper_tool(paper_id: int, context: Context) -> CallToolResult:
    """Generate a summary for the paper and persist it as a note."""
    paper, excerpts = _gather_excerpts(paper_id)
    if not paper:
        return _tool_result(render_library_structured(), "Paper not found.")
    if not excerpts:
        return _tool_result(render_library_structured(), "No indexed text available to summarize.")

    summary_text = ""
    bullets: list[str] = []
    limitations: list[str] = []
    used_fallback = False

    try:
        prompt = (
            "You are drafting a concise research summary using the provided excerpts. "
            "Use only the supplied text; do not invent facts. "
            "Return the required fields only.\n\n"
            f"Paper title: {paper['title']}\n"
            "Return fields:\n"
            "- summary: 250-400 word prose overview.\n"
            "- bullets: five key takeaways, each on its own line starting with '- '.\n"
            "- limitations: three limitations or open questions, each on its own line starting with '- '.\n\n"
            "Excerpts:\n-----\n"
            + "\n\n".join(excerpts)
        )
        result = await context.elicit(message=prompt, schema=SummarySchema)
        if result.action == "accept":
            data = result.data
            summary_text = data.summary.strip()
            bullets = [line.strip() for line in (data.bullets or "").splitlines() if line.strip()]
            limitations = [
                line.strip() for line in (data.limitations or "").splitlines() if line.strip()
            ]
        else:
            used_fallback = True
    except Exception:
        used_fallback = True

    if used_fallback or not summary_text:
        summary_text, bullets, limitations = _local_summary(paper["title"], excerpts)

    note_body = _compose_note(summary_text, bullets, limitations)
    if used_fallback:
        note_body = (
            "*Automated extractive summary (model assistance unavailable).*\n\n"
            + note_body
        )

    save_note(paper_id, note_body, title=f"Summary — {paper['title']}")
    return _tool_result(render_library_structured(), "Summary saved to notes.")

@mcp.tool(meta=TOOL_META)
def save_note_tool(
    paper_id: int,
    body: str | None = None,
    title: str | None = None,
    summary: str | None = None,
) -> CallToolResult:
    """Persist a note for a paper (body or summary text required)."""
    text = body or summary
    if not text:
        raise ValueError("Provide note text via 'body' or 'summary'.")
    save_note(paper_id, text, title)
    return _tool_result(render_library_structured(), "Saved note.")

@mcp.tool(meta=TOOL_META)
def delete_paper_tool(paper_id: int) -> CallToolResult:
    delete_paper(paper_id)
    return _tool_result(render_library_structured(), "Deleted paper.")

# =============================================================================
# Start the server — built-in runner (no Starlette/Uvicorn)
# =============================================================================
def run_server() -> None:
    # Prefer the modern signature; fall back for older mcp versions.
    try:
        mcp.run(transport="streamable-http", path="/mcp", stateless_http=True)
        return
    except TypeError:
        try:
            mcp.run(transport="streamable-http", path="/mcp")
            return
        except TypeError:
            mcp.run(transport="streamable-http")

if __name__ == "__main__":
    run_server()
