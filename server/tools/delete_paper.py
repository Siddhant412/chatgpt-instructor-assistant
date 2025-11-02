from server.db import get_conn

def delete_paper(paper_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM papers WHERE id=?", (paper_id,))
        conn.execute("DELETE FROM sections WHERE paper_id=?", (paper_id,))
        conn.execute("DELETE FROM notes WHERE paper_id=?", (paper_id,))
        conn.commit()
    return {"deleted": True}
