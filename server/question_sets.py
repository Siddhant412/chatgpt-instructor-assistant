from __future__ import annotations

import json
from json import JSONDecodeError
from typing import Any, Dict, List, Optional, Sequence, Tuple

from server.db import get_conn
from server.tools.canvas_export import save_canvas_md_for_set


QuestionPayload = Dict[str, Any]
QuestionSetPayload = Dict[str, Any]


def list_question_sets() -> List[Dict[str, Any]]:
    """Return all question sets with question counts."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT qs.id, qs.prompt, qs.created_at, COUNT(q.id) AS count
            FROM question_sets qs
            LEFT JOIN questions q ON q.set_id = qs.id
            GROUP BY qs.id
            ORDER BY datetime(qs.created_at) DESC, qs.id DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def get_question_set(set_id: int) -> Optional[QuestionSetPayload]:
    with get_conn() as conn:
        header = conn.execute(
            "SELECT id, prompt, created_at FROM question_sets WHERE id=?",
            (set_id,),
        ).fetchone()
        if not header:
            return None
        rows = conn.execute(
            """
            SELECT id, set_id, kind, text, options_json, answer, explanation, reference
            FROM questions
            WHERE set_id=?
            ORDER BY id
            """,
            (set_id,),
        ).fetchall()
    return {
        "question_set": dict(header),
        "questions": _rows_to_questions(rows),
    }


def create_question_set(prompt: str, items: Sequence[Dict[str, Any]]) -> QuestionSetPayload:
    if not isinstance(items, Sequence) or len(items) == 0:
        raise ValueError("No questions supplied.")

    with get_conn() as conn:
        conn.execute("BEGIN")
        conn.execute(
            "INSERT INTO question_sets (prompt) VALUES (?)",
            (prompt,),
        )
        set_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        _replace_questions(conn, set_id, items)
        conn.execute("COMMIT")

    payload = get_question_set(set_id)
    if not payload:
        raise RuntimeError("Failed to load created question set.")

    _attach_canvas_md(payload)
    return payload


def update_question_set(
    set_id: int,
    prompt: Optional[str],
    items: Sequence[Dict[str, Any]],
) -> QuestionSetPayload:
    if not get_question_set(set_id):
        raise ValueError(f"Question set {set_id} not found.")
    if not isinstance(items, Sequence) or len(items) == 0:
        raise ValueError("No questions supplied.")

    with get_conn() as conn:
        conn.execute("BEGIN")
        if prompt is not None:
            conn.execute(
                "UPDATE question_sets SET prompt=? WHERE id=?",
                (prompt, set_id),
            )
        conn.execute("DELETE FROM questions WHERE set_id=?", (set_id,))
        _replace_questions(conn, set_id, items)
        conn.execute("COMMIT")

    payload = get_question_set(set_id)
    if not payload:
        raise RuntimeError("Failed to load updated question set.")

    _attach_canvas_md(payload)
    return payload


def delete_question_set(set_id: int) -> None:
    with get_conn() as conn:
        conn.execute("BEGIN")
        conn.execute("DELETE FROM questions WHERE set_id=?", (set_id,))
        conn.execute("DELETE FROM question_sets WHERE id=?", (set_id,))
        conn.execute("COMMIT")


def _replace_questions(conn, set_id: int, items: Sequence[Dict[str, Any]]) -> None:
    for it in items:
        q = _normalize_question(it)
        if q is None:
            continue
        conn.execute(
            """
            INSERT INTO questions
                (set_id, kind, text, options_json, answer, explanation, reference)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (set_id, *q),
        )


def _normalize_question(it: Dict[str, Any]) -> Optional[Tuple[str, str, Optional[str], Optional[str], Optional[str]]]:
    kind = (it.get("kind") or "").strip().lower() or "short_answer"
    text = (it.get("text") or "").strip()
    if not text:
        return None

    options = it.get("options")
    options_json = (
        json.dumps(options, ensure_ascii=False)
        if isinstance(options, list) and len(options) > 0
        else None
    )
    answer = (it.get("answer") or "").strip() or None
    explanation = (it.get("explanation") or "").strip() or None
    reference = (it.get("reference") or "").strip() or None
    return (kind, text, options_json, answer, explanation, reference)


def _rows_to_questions(rows) -> List[QuestionPayload]:
    out: List[QuestionPayload] = []
    for r in rows:
        options = _parse_options(r["options_json"])
        out.append(
            {
                "id": r["id"],
                "set_id": r["set_id"],
                "kind": r["kind"],
                "text": r["text"],
                "options": options,
                "answer": r["answer"],
                "explanation": r["explanation"],
                "reference": r["reference"],
            }
        )
    return out


def _parse_options(raw: Optional[str]) -> Optional[List[str]]:
    if not raw:
        return None
    try:
        options = json.loads(raw)
    except (JSONDecodeError, TypeError):
        return None
    if isinstance(options, list):
        sanitized = [str(opt) for opt in options if isinstance(opt, str) and opt.strip()]
        return sanitized or None
    return None


def _attach_canvas_md(payload: QuestionSetPayload) -> None:
    qs = payload.get("question_set")
    questions = payload.get("questions") or []
    if not qs:
        return
    set_id = qs["id"]
    prompt = qs.get("prompt") or ""
    try:
        canvas_path = save_canvas_md_for_set(set_id, prompt, questions)
    except Exception:
        return
    qs["canvas_md_path"] = str(canvas_path)
