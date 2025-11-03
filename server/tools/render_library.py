from collections import defaultdict
from typing import Any, Dict, List

from server.db import get_conn

def render_library_structured() -> Dict[str, Any]:
    """Return the full library structure (papers + notes)."""
    with get_conn() as conn:
        paper_rows = conn.execute(
            "SELECT id, title, source_url, created_at FROM papers ORDER BY created_at DESC"
        ).fetchall()
        papers: List[Dict[str, Any]] = [dict(row) for row in paper_rows]

        # Collect notes per paper (newest first)
        notes_stmt = conn.execute(
            "SELECT id, paper_id, title, body, created_at FROM notes ORDER BY created_at DESC"
        ).fetchall()

        notes_by_paper: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for row in notes_stmt:
            note = dict(row)
            paper_id = str(note["paper_id"])
            # Fallback title if missing
            note["title"] = note.get("title") or (note["body"].splitlines()[0][:80] if note["body"] else "Note")
            notes_by_paper[paper_id].append(note)

        for p in papers:
            key = str(p["id"])
            notes = notes_by_paper.get(key)
            if notes is None:
                notes = []
                notes_by_paper[key] = notes
            p["note_count"] = len(notes)

    return {"papers": papers, "notesByPaper": dict(notes_by_paper)}
