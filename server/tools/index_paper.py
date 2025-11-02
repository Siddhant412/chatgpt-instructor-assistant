from server.db import get_conn

def index_paper(paper_id: int):
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT id, page_no FROM sections WHERE paper_id=? ORDER BY page_no ASC", (paper_id,)
        )]
    return {"sections": rows}
