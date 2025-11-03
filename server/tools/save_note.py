from typing import Optional

from server.db import get_conn

def save_note(paper_id: int, body: str, title: Optional[str] = None):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO notes(paper_id, body, title) VALUES(?,?,?)",
            (paper_id, body, title),
        )
        conn.commit()
        note_id = c.lastrowid
    return {"note_id": note_id}
