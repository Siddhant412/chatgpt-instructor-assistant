from __future__ import annotations
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def save_canvas_md_for_set(
    set_id: int,
    prompt: str,
    items: List[Dict],
    out_dir: Optional[Path] = None,
    points_config: Optional[Dict[str, int]] = None,
) -> Path:
    out_dir = out_dir or (Path(__file__).resolve().parents[1] / "exports" / "canvas")
    out_dir.mkdir(parents=True, exist_ok=True)
    points = {
        "mcq": 3,
        "short_answer": 4,
        "true_false": 2,
        "essay": 5,
        **(points_config or {}),
    }

    content = render_canvas_markdown(prompt, items, points)
    fname = f"question_set_{set_id}.md"
    fpath = out_dir / fname
    fpath.write_text(content, encoding="utf-8")
    return fpath


def render_canvas_markdown(prompt: str, items: List[Dict], points: Dict[str, int]) -> str:
    mcqs, sa, tf, essay = [], [], [], []
    for it in items or []:
        kind = (it.get("kind") or "").lower().strip()
        if kind in ("mcq", "multiple_choice", "multiple_choice_question"):
            mcqs.append(it)
        elif kind in ("short_answer", "short-answer", "shortanswer"):
            sa.append(it)
        elif kind in ("true_false", "truefalse", "tf"):
            tf.append(it)
        elif kind in ("essay", "long_answer", "longanswer"):
            essay.append(it)

    lines: List[str] = []

    qnum = 1
    if mcqs:
        lines.append(f"### Multiple Choice Questions (MCQ) - {points.get('mcq', 3)} points each\n")
        for it in mcqs:
            lines.extend(_format_mcq(qnum, it))
            qnum += 1
            lines.append("")

    if sa:
        lines.append(f"### Short Answer Questions - {points.get('short_answer', 4)} points each\n")
        for it in sa:
            lines.extend(_format_short_answer(qnum, it))
            qnum += 1
            lines.append("")

    if tf:
        lines.append(f"### True/False Questions (T/F) - {points.get('true_false', 2)} points each\n")
        for it in tf:
            lines.extend(_format_true_false(qnum, it))
            qnum += 1
            lines.append("")

    if essay:
        lines.append(f"### Essay Questions - {points.get('essay', 5)} points each\n")
        for it in essay:
            lines.extend(_format_essay(qnum, it))
            qnum += 1
            lines.append("")

    preface = []
    if prompt.strip():
        preface.append(f"<!-- Prompt: {prompt.strip()} -->\n")
    body = "\n".join(lines).rstrip() + "\n"
    return "".join(preface) + body


def _format_mcq(qnum: int, it: Dict) -> List[str]:
    text = _clean(it.get("text") or "Untitled question")
    options = _ensure_four_options(it.get("options"))
    answer_letter = _pick_answer_letter(options, it.get("answer"))
    explanation = _compose_explanation(it.get("explanation"), it.get("reference"))

    out = [
        f"**{qnum}. {text}**",
        f"a) {options[0]}",
        f"b) {options[1]}",
        f"c) {options[2]}",
        f"d) {options[3]}",
        f"**Answer:** {answer_letter}",
    ]
    if explanation:
        out.append(f"**Explanation:** {explanation}")
    return out


def _format_short_answer(qnum: int, it: Dict) -> List[str]:
    text = _clean(it.get("text") or "Untitled question")
    answer = _clean(it.get("answer") or "")
    explanation = _compose_explanation(it.get("explanation"), it.get("reference"))
    out = [f"**{qnum}. {text}**"]
    out.append(f"**Answer:** {answer}")
    if explanation:
        out.append(f"**Explanation:** {explanation}")
    return out


def _format_true_false(qnum: int, it: Dict) -> List[str]:
    text = _clean(it.get("text") or "Untitled statement")
    answer = str(it.get("answer") or "").strip()
    answer_norm = "True" if answer.lower() in ("true", "t", "1", "yes") else "False"
    explanation = _compose_explanation(it.get("explanation"), it.get("reference"))
    out = [
        f"**{qnum}. T/F: {text}**",
        f"**Answer:** {answer_norm}",
    ]
    if explanation:
        out.append(f"**Explanation:** {explanation}")
    return out


def _format_essay(qnum: int, it: Dict) -> List[str]:
    text = _clean(it.get("text") or "Essay prompt")
    explanation = _compose_explanation(it.get("explanation"), it.get("reference"))
    out = [f"**{qnum}. {text}**", f"**Answer:**"]
    if explanation:
        out.append(f"**Explanation:** {explanation}")
    return out


def _ensure_four_options(options: Optional[List[str]]) -> List[str]:
    opts = [ _clean(o) for o in (options or []) if str(o).strip() ]
    while len(opts) < 4:
        opts.append("—")
    if len(opts) > 4:
        opts = opts[:4]
    return opts


def _pick_answer_letter(options: List[str], answer: Optional[str]) -> str:
    if isinstance(answer, str):
        a = answer.strip()
        if a.upper() in ("A", "B", "C", "D"):
            return a.upper()
    if isinstance(answer, str):
        a_norm = _canon(answer)
        for i, opt in enumerate(options):
            if _canon(opt) == a_norm:
                return "ABCD"[i]
    return "A"


def _compose_explanation(expl: Optional[str], ref: Optional[str]) -> str:
    parts: List[str] = []
    if expl and str(expl).strip():
        parts.append(_clean(expl))
    if ref and str(ref).strip():
        parts.append(f"(Ref: {ref.strip()})")
    return " ".join(parts).strip()


def _clean(s: str) -> str:
    return " ".join(str(s).split()).strip()


def _canon(s: str) -> str:
    return _clean(s).lower()
