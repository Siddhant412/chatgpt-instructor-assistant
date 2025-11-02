from server.db import get_conn

def save_note(paper_id: int, body: str):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("INSERT INTO notes(paper_id, body) VALUES(?,?)", (paper_id, body))
        conn.commit()
        note_id = c.lastrowid
    return {"note_id": note_id}
