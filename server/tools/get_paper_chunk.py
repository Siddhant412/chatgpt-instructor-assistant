from server.db import get_conn

def get_paper_chunk(section_id: int):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, paper_id, page_no, text FROM sections WHERE id=?", (section_id,)
        ).fetchone()
        if not row:
            raise ValueError("Section not found")
        return dict(row)
