"""
Compatibility wrapper for Canvas markdown helpers which are shifted in webapp.core.questions
"""
from webapp.core.questions import (  # noqa: F401
    save_canvas_md_for_set,
    render_canvas_markdown,
)

