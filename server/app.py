# server/app.py
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, List

from pydantic import BaseModel, Field
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import Context  # kept for fallback summarize
from mcp.types import CallToolResult, TextContent

from server.db import init_db, get_conn
from server.tools.render_library import render_library_structured
from server.tools.add_paper import add_paper as add_paper_impl
from server.tools.index_paper import index_paper as index_paper_impl
from server.tools.get_paper_chunk import get_paper_chunk as get_paper_chunk_impl
from server.tools.save_note import save_note as save_note_impl

# =====================================================================================
# Load widget bundle
# =====================================================================================

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
    with get_conn() as conn:
        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='notes'"
        ).fetchone()
        if not row:
            return
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

def _ensure_question_tables() -> None:
    with get_conn() as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS question_sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                set_id INTEGER NOT NULL,
                kind TEXT NOT NULL,                 -- 'mcq' | 'short_answer' | etc.
                text TEXT NOT NULL,
                options_json TEXT,                  -- JSON array for MCQ options
                answer TEXT,
                explanation TEXT,
                reference TEXT,                     -- e.g., 'Page 12' or 'Slide 5'
                FOREIGN KEY(set_id) REFERENCES question_sets(id) ON DELETE CASCADE
            );
        """)
        conn.commit()

init_db()
_ensure_notes_fk_set_null()
_ensure_question_tables()

# =====================================================================================
# MCP server
# =====================================================================================

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
    return CallToolResult(
        content=[TextContent(type="text", text=text)],
        meta=META_SILENT,
    )


def _delete_paper_and_detach(paper_id: int) -> tuple[dict[str, Any], str]:
    msg = ""
    with get_conn() as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("BEGIN")
        conn.execute("UPDATE notes SET paper_id=NULL WHERE paper_id=?", (paper_id,))
        conn.execute("DELETE FROM sections WHERE paper_id=?", (paper_id,))
        cur = conn.execute("DELETE FROM papers WHERE id=?", (paper_id,))
        deleted = cur.rowcount or 0
        conn.execute("COMMIT")
        msg = "Deleted paper (notes retained)." if deleted else f"Paper {paper_id} not found."
    return render_library_structured(), msg

# =====================================================================================
# Tools
# =====================================================================================

@mcp.tool(name="render_library", meta=META_UI)
def render_library() -> CallToolResult:
    data = render_library_structured()
    c = len(data.get("papers", []))
    return _ui_result(data, f"Showing {c} {'papers' if c != 1 else 'paper'} in your library.")

@mcp.tool(name="add_paper", meta=META_UI)
async def add_paper(url: str) -> CallToolResult:
    await add_paper_impl(url, url)
    return _ui_result(render_library_structured(), "Added paper and refreshed library.")

@mcp.tool(name="index_paper", meta=META_SILENT)
def index_paper(paperId: int | str) -> CallToolResult:
    payload = index_paper_impl(int(paperId))
    return _text_result(json.dumps(payload, ensure_ascii=False))

@mcp.tool(name="get_paper_chunk", meta=META_SILENT)
def get_paper_chunk(paperId: int | str, sectionId: int | str) -> CallToolResult:
    chunk = get_paper_chunk_impl(int(sectionId))
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

# Back-compat aliases
@mcp.tool(name="add_paper_tool", meta=META_UI)
async def add_paper_tool(input_str: str, source_url: str | None = None) -> CallToolResult:
    await add_paper_impl(input_str, source_url)
    return _ui_result(render_library_structured(), "Added paper and refreshed library.")

@mcp.tool(name="index_paper_tool", meta=META_SILENT)
def index_paper_tool(paper_id: int | str) -> CallToolResult:
    return index_paper(paper_id)

@mcp.tool(name="get_paper_chunk_tool", meta=META_SILENT)
def get_paper_chunk_tool(section_id: int | str) -> CallToolResult:
    return get_paper_chunk(0, section_id)

@mcp.tool(name="delete_paper_tool", meta=META_UI)
def delete_paper_tool(paper_id: int | str) -> CallToolResult:
    pid = int(paper_id)
    structured, msg = _delete_paper_and_detach(pid)
    return _ui_result(structured, msg)

# =====================================================================================
# Notes tools for independent editor
# =====================================================================================

@mcp.tool(name="list_notes_tool", meta=META_UI)
def list_notes_tool() -> CallToolResult:
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

# =====================================================================================
# Question set tools
# =====================================================================================

@mcp.tool(name="save_question_set", meta=META_UI)
def save_question_set(prompt: str, items: list[dict]) -> CallToolResult:
    """
    The model calls this AFTER reading user-attached files (direct attachments).
    items[i] JSON shape (validated loosely here):
      {
        "kind": "mcq" | "short_answer" | "...",
        "text": "...",
        "options": ["A","B","C","D"],      # for mcq; optional otherwise
        "answer": "...",
        "explanation": "...",
        "reference": "Page 12" | "Slide 5" | "..."
      }
    """
    if not isinstance(items, list) or not items:
        return _ui_result(render_library_structured(), "No questions received.")

    # Persist
    with get_conn() as conn:
        conn.execute("BEGIN")
        conn.execute("INSERT INTO question_sets (prompt) VALUES (?)", (prompt,))
        set_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        for it in items:
            kind = (it.get("kind") or "").strip().lower() or "short_answer"
            text = (it.get("text") or "").strip()
            if not text:
                # skip empty
                continue
            options = it.get("options")
            options_json = json.dumps(options, ensure_ascii=False) if isinstance(options, list) else None
            answer = (it.get("answer") or "").strip() or None
            explanation = (it.get("explanation") or "").strip() or None
            reference = (it.get("reference") or "").strip() or None
            conn.execute("""
                INSERT INTO questions (set_id, kind, text, options_json, answer, explanation, reference)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (set_id, kind, text, options_json, answer, explanation, reference))
        conn.execute("COMMIT")

        # Load back with counts
        header = conn.execute("""
            SELECT id, prompt, created_at FROM question_sets WHERE id=?
        """, (set_id,)).fetchone()
        rows = conn.execute("""
            SELECT id, set_id, kind, text, options_json, answer, explanation, reference
            FROM questions WHERE set_id=? ORDER BY id
        """, (set_id,)).fetchall()

    structured = render_library_structured()  # keep library intact on push
    structured["question_set"] = dict(header)
    structured["questions"] = [
        {
            "id": r["id"],
            "set_id": r["set_id"],
            "kind": r["kind"],
            "text": r["text"],
            "options": json.loads(r["options_json"]) if r["options_json"] else None,
            "answer": r["answer"],
            "explanation": r["explanation"],
            "reference": r["reference"],
        }
        for r in rows
    ]
    return _ui_result(structured, f"Saved {len(rows)} questions.")

@mcp.tool(name="list_question_sets_tool", meta=META_UI)
def list_question_sets_tool(set_id: Optional[int] = None) -> CallToolResult:
    with get_conn() as conn:
        heads = conn.execute("""
            SELECT qs.id, qs.prompt, qs.created_at, COUNT(q.id) AS count
            FROM question_sets qs
            LEFT JOIN questions q ON q.set_id = qs.id
            GROUP BY qs.id
            ORDER BY datetime(qs.created_at) DESC, qs.id DESC
        """).fetchall()

        structured = render_library_structured()
        structured["question_sets"] = [dict(h) for h in heads]

        if set_id is not None:
            rows = conn.execute("""
                SELECT id, set_id, kind, text, options_json, answer, explanation, reference
                FROM questions WHERE set_id=? ORDER BY id
            """, (set_id,)).fetchall()
            structured["question_set"] = next((dict(h) for h in heads if h["id"] == set_id), None)
            structured["questions"] = [
                {
                    "id": r["id"],
                    "set_id": r["set_id"],
                    "kind": r["kind"],
                    "text": r["text"],
                    "options": json.loads(r["options_json"]) if r["options_json"] else None,
                    "answer": r["answer"],
                    "explanation": r["explanation"],
                    "reference": r["reference"],
                }
                for r in rows
            ]
    return _ui_result(structured, "Loaded question sets.")

@mcp.tool(name="delete_question_set_tool", meta=META_UI)
def delete_question_set_tool(set_id: int) -> CallToolResult:
    with get_conn() as conn:
        conn.execute("DELETE FROM questions WHERE set_id=?", (set_id,))
        conn.execute("DELETE FROM question_sets WHERE id=?", (set_id,))
        conn.commit()
    structured = render_library_structured()
    return _ui_result(structured, "Deleted question set.")

# =====================================================================================
# Minimal fallback summarize tool
# =====================================================================================

class SummarySchema(BaseModel):
    summary: str = Field(..., description="250-400 word narrative summary")
    bullets: str | None = Field(None, description="Five key takeaways, one per line starting with '- '")
    limitations: str | None = Field(None, description="Three limitations, one per line starting with '- '")

def _local_extractive_summary(excerpts: List[str]) -> Tuple[str, List[str], List[str]]:
    text = " ".join(excerpts)
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
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
    try:
        index_paper_impl(int(paper_id))
    except Exception:
        pass

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

# =====================================================================================
# Run server
# =====================================================================================

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
