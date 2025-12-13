"""
minimal code to keep existing imports working.
database logic shifted in webapp.core.database
"""
from webapp.core.database import DB_PATH, get_conn, init_db, ensure_question_tables  # noqa: F401
