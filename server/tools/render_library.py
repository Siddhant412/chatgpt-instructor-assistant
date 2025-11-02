from server.db import get_conn

def render_library_structured():
    with get_conn() as conn:
        papers = [dict(row) for row in conn.execute(
            "SELECT id, title, source_url, created_at FROM papers ORDER BY created_at DESC"
        )]
        counts = dict(conn.execute(
            "SELECT paper_id, count(*) as note_count FROM notes GROUP BY paper_id"
        ).fetchall())
        for p in papers:
            p["note_count"] = counts.get(p["id"], 0)
    # This object is injected as window.openai.toolOutput in the iframe
    return {"papers": papers}
