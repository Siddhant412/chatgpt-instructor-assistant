from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional

import arxiv
import feedparser
import yt_dlp
from duckduckgo_search import DDGS
from pypdf import PdfReader

# Download location shared by all tools
DOWNLOADS_DIR = Path(__file__).resolve().parents[1] / "downloads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _safe_path(raw: str | Path, default_name: str = "output") -> Path:
    """
    Resolve a user-provided path, anchoring to the downloads directory unless the
    path is absolute and already inside the project root.
    """
    candidate = Path(raw) if isinstance(raw, (str, Path)) else Path(default_name)
    project_root = Path(__file__).resolve().parents[2]
    if candidate.is_absolute():
        try:
            candidate.relative_to(project_root)
            return candidate
        except ValueError:
            # Outside the repo; fall back to downloads dir
            return DOWNLOADS_DIR / candidate.name
    return DOWNLOADS_DIR / candidate


def web_search(query: str, max_results: int = 5) -> Dict[str, object]:
    """Search the web using DuckDuckGo."""
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=max_results))
    return {
        "query": query,
        "results": [
            {
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", ""),
            }
            for r in results
        ],
    }


def get_news(topic: str, limit: int = 10) -> Dict[str, object]:
    """Fetch headlines from Google News RSS."""
    url = f"https://news.google.com/rss/search?q={topic}&hl=en-US&gl=US&ceid=US:en"
    feed = feedparser.parse(url)
    articles = [
        {
            "title": entry.get("title", ""),
            "link": entry.get("link", ""),
            "published": entry.get("published", ""),
            "summary": entry.get("summary", "")[:500],
        }
        for entry in (feed.entries or [])[:limit]
    ]
    return {"topic": topic, "articles": articles}


def arxiv_search(query: str, max_results: int = 5) -> Dict[str, object]:
    """Search arXiv for papers matching a query."""
    search = arxiv.Search(
        query=query,
        max_results=max_results,
        sort_by=arxiv.SortCriterion.Relevance,
    )
    papers: List[Dict[str, object]] = []
    for result in search.results():
        papers.append(
            {
                "title": result.title,
                "authors": [author.name for author in result.authors],
                "arxiv_id": result.entry_id.split("/")[-1],
                "published": str(result.published),
                "summary": result.summary[:500],
                "pdf_url": result.pdf_url,
            }
        )
    return {"query": query, "papers": papers}


def arxiv_download(arxiv_id: str, output_path: Optional[str] = None) -> Dict[str, object]:
    """Download an arXiv PDF by ID and return metadata + saved path."""
    clean_id = arxiv_id.replace("arxiv:", "").replace("arXiv:", "")
    search = arxiv.Search(id_list=[clean_id])
    paper = next(search.results(), None)
    if not paper:
        raise ValueError(f"Paper {arxiv_id} not found")

    out_path = _safe_path(output_path or f"{clean_id}.pdf")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    paper.download_pdf(dirpath=str(out_path.parent), filename=out_path.name)

    return {
        "arxiv_id": clean_id,
        "title": paper.title,
        "file_path": str(out_path),
        "pdf_url": paper.pdf_url,
    }


def pdf_summary(pdf_path: str) -> Dict[str, object]:
    """Extract text from a PDF and return a capped preview."""
    path = _safe_path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF file not found: {path}")

    text_parts: List[str] = []
    with open(path, "rb") as f:
        reader = PdfReader(f)
        for page in reader.pages:
            text_parts.append(page.extract_text() or "")
    text = "\n".join(text_parts)
    text = text[:5000] if len(text) > 5000 else text
    return {
        "pdf_path": str(path),
        "extracted_text": text,
        "text_length": len(text),
        "note": "Text capped to 5000 characters for downstream models.",
    }


def youtube_search(query: str, max_results: int = 5) -> Dict[str, object]:
    """Search YouTube for videos."""
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
    }
    videos: List[Dict[str, object]] = []
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f"ytsearch{max_results}:{query}", download=False)
        for entry in info.get("entries", []) or []:
            if not entry:
                continue
            videos.append(
                {
                    "title": entry.get("title", ""),
                    "url": f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                    "duration": entry.get("duration", 0),
                    "channel": entry.get("channel", ""),
                    "view_count": entry.get("view_count", 0),
                }
            )
    return {"query": query, "videos": videos}


def youtube_download(video_url: str, output_path: Optional[str] = None) -> Dict[str, object]:
    """Download a YouTube video to the downloads directory."""
    out_template = _safe_path(output_path or "%(title)s.%(ext)s")
    out_template.parent.mkdir(parents=True, exist_ok=True)

    ydl_opts = {
        "outtmpl": str(out_template),
        "format": "best[ext=mp4]/best",
        "quiet": False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(video_url, download=True)
        filename = ydl.prepare_filename(info)

    return {
        "video_url": video_url,
        "title": info.get("title", ""),
        "file_path": filename,
        "duration": info.get("duration", 0),
    }


TOOL_MAP = {
    "web_search": web_search,
    "get_news": get_news,
    "arxiv_search": arxiv_search,
    "arxiv_download": arxiv_download,
    "pdf_summary": pdf_summary,
    "youtube_search": youtube_search,
    "youtube_download": youtube_download,
}


def execute_tool(name: str, **kwargs) -> Dict[str, object]:
    """Dispatch tool by name; raises if unknown or underlying tool fails."""
    if name not in TOOL_MAP:
        raise ValueError(f"Unknown tool: {name}")
    return TOOL_MAP[name](**kwargs)
