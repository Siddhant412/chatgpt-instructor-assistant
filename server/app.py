from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, List

from pydantic import BaseModel, Field
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import Context  # kept for compatibility (fallback summarize)
from mcp.types import CallToolResult, TextContent

from server.db import init_db, get_conn
from server.tools.render_library import render_library_structured
from server.tools.add_paper import add_paper as add_paper_impl
from server.tools.index_paper import index_paper as index_paper_impl
from server.tools.get_paper_chunk import get_paper_chunk as get_paper_chunk_impl
from server.tools.save_note import save_note as save_note_impl
from server.tools.delete_paper import delete_paper as delete_paper_impl  # not used directly; we do atomic helper


# Load widget bundle

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
        WIDGET_JS = _read_first(["*.js", "assets/*.js"]) or ""
        if not WIDGET_JS:
            print("[WARN] No web/dist/widget.js found. Run: cd web && npm i && npm run build")

WIDGET_CSS = _read_first(["*.css", "assets/*.css"])


def _ensure_notes_fk_set_null() -> None:
    """
    Ensure notes.paper_id is nullable and FK uses ON DELETE SET NULL.
    If your schema already has it, this is a no-op.
    """
    with get_conn() as conn:
        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='notes'"
        ).fetchone()
        if not row:
            return  # created elsewhere by init_db
        ddl = row[0] or ""
        if "FOREIGN KEY" in ddl and "ON DELETE SET NULL" in ddl:
            return

        print("[db] Migrating notes FK to ON DELETE SET NULL …", flush=True)
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("BEGIN")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS notes_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                paper_id INTEGER NULL,
                title TEXT,
                body TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(paper_id) REFERENCES papers(id) ON DELETE SET NULL
            );
        """)
        conn.execute("""
            INSERT INTO notes_new (id, paper_id, title, body, created_at)
            SELECT id, paper_id, title, body, created_at FROM notes;
        """)
        conn.execute("DROP TABLE IF EXISTS notes;")
        conn.execute("ALTER TABLE notes_new RENAME TO notes;")
        conn.execute("COMMIT")
        conn.execute("PRAGMA foreign_keys=ON")
        print("[db] Migration complete.", flush=True)

init_db()
_ensure_notes_fk_set_null()


# MCP server

mcp = FastMCP(name="research-notes-py")
TEMPLATE_URI = "ui://widget/research-notes.html"

@mcp.resource(
    TEMPLATE_URI,
    mime_type="text/html+skybridge",
    annotations={
        "openai/widgetAccessible": True,
        "openai/widgetPrefersBorder": True,
    },
)
def research_notes_widget() -> str:
    style_block = f"<style>{WIDGET_CSS}</style>\n" if WIDGET_CSS else ""
    script_body = WIDGET_JS.replace("</script>", "<\\/script>")
    return (
        '<div id="root"></div>\n'
        f"{style_block}"
        f"<script>\n{script_body}\n</script>"
    )

META_UI = {"openai/outputTemplate": TEMPLATE_URI, "openai/widgetAccessible": True}
META_SILENT = {"openai/widgetAccessible": False}

def _ui_result(structured: Dict[str, Any], msg: str) -> CallToolResult:
    return CallToolResult(
        content=[TextContent(type="text", text=msg)],
        structuredContent=structured,
        meta=META_UI,
    )

def _text_result(text: str) -> CallToolResult:
    # Silent text payload for the model to read/parse. no widget refresh.
    return CallToolResult(
        content=[TextContent(type="text", text=text)],
        meta=META_SILENT,
    )


def _delete_paper_and_detach(paper_id: int) -> tuple[dict[str, Any], str]:
    """
    Detach notes (paper_id=NULL), delete sections, then delete the paper.
    """
    msg = ""
    with get_conn() as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("BEGIN")
        # Keep notes
        conn.execute("UPDATE notes SET paper_id=NULL WHERE paper_id=?", (paper_id,))
        # Remove sections
        conn.execute("DELETE FROM sections WHERE paper_id=?", (paper_id,))
        # Delete paper
        cur = conn.execute("DELETE FROM papers WHERE id=?", (paper_id,))
        deleted = cur.rowcount or 0
        conn.execute("COMMIT")
        msg = "Deleted paper (notes retained)." if deleted else f"Paper {paper_id} not found."
    return render_library_structured(), msg


# Tools

@mcp.tool(name="render_library", meta=META_UI)
def render_library() -> CallToolResult:
    data = render_library_structured()
    c = len(data.get("papers", []))
    return _ui_result(data, f"Showing {c} {'papers' if c != 1 else 'paper'} in your library.")

@mcp.tool(name="add_paper", meta=META_UI)
async def add_paper(url: str) -> CallToolResult:
    # TS widget sends { url }
    await add_paper_impl(url, url)
    return _ui_result(render_library_structured(), "Added paper and refreshed library.")

@mcp.tool(name="index_paper", meta=META_SILENT)
def index_paper(paperId: int | str) -> CallToolResult:
    payload = index_paper_impl(int(paperId))  # returns sections listing etc.
    return _text_result(json.dumps(payload, ensure_ascii=False))

@mcp.tool(name="get_paper_chunk", meta=META_SILENT)
def get_paper_chunk(paperId: int | str, sectionId: int | str) -> CallToolResult:
    chunk = get_paper_chunk_impl(int(sectionId))  # { id, paper_id, page_no, text }
    return _text_result((chunk or {}).get("text", "") or "")

@mcp.tool(name="save_note", meta=META_UI)
def save_note(paperId: int | str, title: str, summary: str) -> CallToolResult:
    save_note_impl(int(paperId), summary, title)
    return _ui_result(render_library_structured(), "Saved note.")

@mcp.tool(name="delete_paper", meta=META_UI)
def delete_paper(paperId: int | str) -> CallToolResult:
    pid = int(paperId)
    structured, msg = _delete_paper_and_detach(pid)
    return _ui_result(structured, msg)


# Notes tools for independent editor

@mcp.tool(name="list_notes_tool", meta=META_UI)
def list_notes_tool() -> CallToolResult:
    """Return ALL notes (newest first) with optional joined paper title."""
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT n.id, n.paper_id, n.title, n.body, n.created_at,
                   p.title AS paper_title
            FROM notes n
            LEFT JOIN papers p ON p.id = n.paper_id
            ORDER BY datetime(n.created_at) DESC, n.id DESC
        """).fetchall()
    structured = render_library_structured()
    structured["notes"] = [dict(r) for r in rows]
    return _ui_result(structured, f"Loaded {len(structured['notes'])} notes.")

@mcp.tool(name="save_note_tool", meta=META_UI)
def save_note_tool(
    paper_id: Optional[int] = None,
    body: Optional[str] = None,
    title: Optional[str] = None,
    summary: Optional[str] = None,
    note_id: Optional[int] = None,
) -> CallToolResult:
    """
    Create/update a note for the Editor.
    - Create: omit note_id. paper_id may be None (independent note).
    - Update: provide note_id; paper_id optional (preserves if omitted).
    Returns: library + 'note' (the created/updated row).
    """
    text = body if body is not None else summary
    with get_conn() as conn:
        if note_id is not None:
            old = conn.execute("SELECT paper_id, title, body FROM notes WHERE id=?", (note_id,)).fetchone()
            if not old:
                return _ui_result(render_library_structured(), f"Note {note_id} not found.")
            new_title = title if title is not None else (old["title"] or "Untitled")
            new_body  = text  if text  is not None else (old["body"] or "")
            new_pid   = paper_id if paper_id is not None else old["paper_id"]
            conn.execute("UPDATE notes SET paper_id=?, title=?, body=? WHERE id=?", (new_pid, new_title, new_body, note_id))
            conn.commit()
            row = conn.execute("""
                SELECT n.id, n.paper_id, n.title, n.body, n.created_at, p.title AS paper_title
                FROM notes n LEFT JOIN papers p ON p.id = n.paper_id
                WHERE n.id=?
            """, (note_id,)).fetchone()
        else:
            if text is None:
                raise ValueError("Provide note text via 'body' or 'summary'.")
            conn.execute(
                "INSERT INTO notes (paper_id, title, body, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                (paper_id, title or "Untitled", text),
            )
            nid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            row = conn.execute("""
                SELECT n.id, n.paper_id, n.title, n.body, n.created_at, p.title AS paper_title
                FROM notes n LEFT JOIN papers p ON p.id = n.paper_id
                WHERE n.id=?
            """, (nid,)).fetchone()

    structured = render_library_structured()
    if row:
        structured["note"] = dict(row)
    return _ui_result(structured, "Saved note.")

@mcp.tool(name="delete_note_tool", meta=META_UI)
def delete_note_tool(note_id: int) -> CallToolResult:
    with get_conn() as conn:
        conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
        conn.commit()
    return _ui_result(render_library_structured(), "Deleted note.")


# Back compatibility aliases

@mcp.tool(name="add_paper_tool", meta=META_UI)
async def add_paper_tool(input_str: str, source_url: str | None = None) -> CallToolResult:
    await add_paper_impl(input_str, source_url)
    return _ui_result(render_library_structured(), "Added paper and refreshed library.")

@mcp.tool(name="index_paper_tool", meta=META_SILENT)
def index_paper_tool(paper_id: int | str) -> CallToolResult:
    return index_paper(paper_id)

@mcp.tool(name="get_paper_chunk_tool", meta=META_SILENT)
def get_paper_chunk_tool(section_id: int | str) -> CallToolResult:
    # paperId is ignored by the underlying implementation keeping signature compatible
    return get_paper_chunk(0, section_id)

@mcp.tool(name="delete_paper_tool", meta=META_UI)
def delete_paper_tool(paper_id: int | str) -> CallToolResult:
    pid = int(paper_id)
    structured, msg = _delete_paper_and_detach(pid)
    return _ui_result(structured, msg)


# Minimal fallback summarize tool if sendFollowUpMessage fails

class SummarySchema(BaseModel):
    summary: str = Field(..., description="250-400 word narrative summary")
    bullets: str | None = Field(None, description="Five key takeaways, one per line starting with '- '")
    limitations: str | None = Field(None, description="Three limitations, one per line starting with '- '")

def _local_extractive_summary(excerpts: List[str]) -> Tuple[str, List[str], List[str]]:
    text = " ".join(excerpts)
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    # take ~260 words
    acc, wc = [], 0
    for s in sents:
        acc.append(s)
        wc += len(s.split())
        if wc >= 260:
            break
    if not acc:
        acc = sents[:5]
    summary = " ".join(" ".join(acc).split()[:400])
    rest = sents[len(acc):]
    bullets: List[str] = []
    for s in rest:
        if len(bullets) >= 5:
            break
        bullets.append(s)
    if not bullets and acc:
        bullets = acc[:3]
    limits = [
        "Refer to the full paper for methodology details.",
        "Automated extractive summary may omit key nuances.",
        "Validate conclusions against original figures and tables.",
    ]
    return summary, bullets, limits

def _compose_note(summary: str, bullets: List[str], limits: List[str]) -> str:
    parts = [summary.strip()]
    if bullets:
        parts.append("Key takeaways:\n" + "\n".join(f"- {b.strip()}" for b in bullets[:5]))
    if limits:
        parts.append("Limitations:\n" + "\n".join(f"- {l.strip()}" for l in limits[:3]))
    return "\n\n".join(parts).strip()

@mcp.tool(name="summarize_paper_tool", meta=META_UI)
def summarize_paper_tool(paper_id: int, context: Context | None = None) -> CallToolResult:
    """
    Fallback summarizer: ensures the paper is indexed, pulls a limited amount of text,
    produces an extractive summary, saves it as a note, and refreshes the library.
    (Primary path should be sendFollowUpMessage with tools.)
    """
    # Ensure indexed (idempotent)
    try:
        index_paper_impl(int(paper_id))
    except Exception:
        pass

    # Gather up to 9000 chars across sections
    excerpts: List[str] = []
    total = 0
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT page_no, text FROM sections WHERE paper_id=? ORDER BY page_no ASC",
            (paper_id,),
        ).fetchall()
        paper = conn.execute("SELECT title FROM papers WHERE id=?", (paper_id,)).fetchone()
        paper_title = (paper["title"] if paper else "Paper Summary") or "Paper Summary"
    cap = 9000
    for r in rows:
        t = (r["text"] or "").strip()
        if not t:
            continue
        snip = f"[Page {r['page_no']}] {t}"
        if total + len(snip) > cap:
            snip = snip[: (cap - total)]
        excerpts.append(snip)
        total += len(snip)
        if total >= cap:
            break

    summary, bullets, limits = _local_extractive_summary(excerpts)
    body = "*Automated extractive summary (model follow-up path unavailable).*" + "\n\n" + _compose_note(summary, bullets, limits)

    save_note_impl(int(paper_id), body, f"Summary — {paper_title}")
    return _ui_result(render_library_structured(), "Summary saved to notes (fallback).")


# Run server

def run_server() -> None:
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
