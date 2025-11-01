import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "app.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("""
        CREATE TABLE IF NOT EXISTS papers(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT,
          source_url TEXT,
          pdf_path TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
        """)
        c.execute("""
        CREATE TABLE IF NOT EXISTS sections(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          paper_id INTEGER NOT NULL,
          page_no INTEGER NOT NULL,
          text TEXT,
          FOREIGN KEY(paper_id) REFERENCES papers(id) ON DELETE CASCADE
        );
        """)
        c.execute("""
        CREATE TABLE IF NOT EXISTS notes(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          paper_id INTEGER NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY(paper_id) REFERENCES papers(id) ON DELETE CASCADE
        );
        """)
        conn.commit()
