from server.db import get_conn
from server.pdf_resolver import resolve_any_to_pdf, extract_pages
from pathlib import Path

async def add_paper(input_str: str, source_url: str | None = None):
    title, pdf_path = await resolve_any_to_pdf(input_str)
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("INSERT INTO papers(title, source_url, pdf_path) VALUES(?,?,?)",
                  (title, source_url or input_str, str(pdf_path)))
        paper_id = c.lastrowid
        # index pages
        for page_no, text in extract_pages(pdf_path):
            c.execute("INSERT INTO sections(paper_id, page_no, text) VALUES(?,?,?)",
                      (paper_id, page_no, text))
        conn.commit()
    return {"paper_id": paper_id, "title": title}


def add_local_pdf(title: str | None, pdf_path: str | Path, source_url: str | None = None):
    """
    Ingest a local PDF (already downloaded) into the research library and index its pages.
    """
    path = Path(pdf_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"PDF not found at {path}")
    final_title = title or path.stem
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO papers(title, source_url, pdf_path) VALUES(?,?,?)",
            (final_title, source_url or str(path), str(path)),
        )
        paper_id = c.lastrowid
        for page_no, text in extract_pages(path):
            c.execute(
                "INSERT INTO sections(paper_id, page_no, text) VALUES(?,?,?)",
                (paper_id, page_no, text),
            )
        conn.commit()
    return {"paper_id": paper_id, "title": final_title, "pdf_path": str(path), "source_url": source_url or str(path)}
