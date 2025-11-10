import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createNote,
  createQuestionSet,
  deleteNote,
  deleteQuestionSet,
  getQuestionSet,
  listNotes,
  listPapers,
  listQuestionSets,
  updateNote,
  updateQuestionSet
} from "./api";
import type { Note, Page, Paper, Question, QuestionSetMeta } from "./types";

type QuestionForm = Question & { optionsDraft?: string };
type QuestionMode = "generate" | "upload";
type PaperMode = "library" | "ingest";

const emptyNoteForm = (): { id?: number; title: string; body: string; paperId?: number | null } => ({
  title: "",
  body: "",
  paperId: undefined
});

const emptyQuestion = (): QuestionForm => ({
  kind: "short_answer",
  text: "",
  options: [],
  answer: "",
  explanation: "",
  reference: "",
  optionsDraft: ""
});

const MARKDOWN_PLACEHOLDER = `<!-- Prompt: Describe your assessment goals -->

### Question Set Preview

_The generated markdown will appear here once the LLM workspace is connected._
`;

function App() {
  const [page, setPage] = useState<Page>("landing");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Instructor Assistant</h1>
          <p className="muted">Work with your research library, notes, and test prep from the same data the ChatGPT app uses.</p>
        </div>
        <nav>
          <button className={page === "landing" ? "primary" : ""} onClick={() => setPage("landing")}>
            Home
          </button>
          <button className={page === "papers" ? "primary" : ""} onClick={() => setPage("papers")}>
            Research Papers
          </button>
          <button className={page === "notes" ? "primary" : ""} onClick={() => setPage("notes")}>
            Notes
          </button>
          <button className={page === "questions" ? "primary" : ""} onClick={() => setPage("questions")}>
            Question Sets
          </button>
        </nav>
      </header>
      <main>
        {page === "landing" && <Landing onNavigate={setPage} />}
        {page === "papers" && <ResearchPapersPage onBack={() => setPage("landing")} />}
        {page === "notes" && <NotesPage onBack={() => setPage("landing")} />}
        {page === "questions" && <QuestionSetsPage onBack={() => setPage("landing")} />}
      </main>
    </div>
  );
}

export default App;

function Landing({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <section className="panel-grid">
      <article className="panel-card">
        <header>
          <h2>Research Library</h2>
          <p>Browse the indexed papers that your ChatGPT workspace already knows about.</p>
        </header>
        <button className="primary" onClick={() => onNavigate("papers")}>
          Open Papers
        </button>
      </article>
      <article className="panel-card">
        <header>
          <h2>Note Editor</h2>
          <p>Review captured summaries, create new notes, or clean up outdated annotations.</p>
        </header>
        <button className="primary" onClick={() => onNavigate("notes")}>
          Manage Notes
        </button>
      </article>
      <article className="panel-card">
        <header>
          <h2>Question Sets</h2>
          <p>Build and refine practice tests. Each save also refreshes the Canvas markdown export.</p>
        </header>
        <button className="primary" onClick={() => onNavigate("questions")}>
          Create Questions
        </button>
      </article>
    </section>
  );
}

function ResearchPapersPage({ onBack }: { onBack: () => void }) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [localPapers, setLocalPapers] = useState<Paper[]>([]);
  const [hiddenPaperIds, setHiddenPaperIds] = useState<Set<number>>(new Set());
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paperMode, setPaperMode] = useState<PaperMode>("library");
  const [pdfFullscreen, setPdfFullscreen] = useState(false);
  const [downloadForm, setDownloadForm] = useState({ title: "", url: "", doi: "" });
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  const combinedPapers = useMemo(() => {
    const all = [...localPapers, ...papers];
    if (!hiddenPaperIds.size) {
      return all;
    }
    return all.filter((paper) => !hiddenPaperIds.has(paper.id));
  }, [localPapers, papers, hiddenPaperIds]);
  const selectedPaper = combinedPapers.find((paper) => paper.id === selectedPaperId) ?? null;
  const pdfSrc = selectedPaper?.pdf_path || selectedPaper?.source_url || null;

  useEffect(() => {
    if (!selectedPaperId && combinedPapers.length) {
      setSelectedPaperId(combinedPapers[0].id);
    }
  }, [combinedPapers, selectedPaperId]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listPapers();
      setPapers(data);
      if (!selectedPaperId && data.length) {
        setSelectedPaperId(data[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectPaper(paper: Paper) {
    setSelectedPaperId(paper.id);
    setPdfFullscreen(false);
  }

  function handleDownloadFieldChange(field: "title" | "url" | "doi", value: string) {
    setDownloadForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleDownloadPaperAction() {
    if (!downloadForm.title && !downloadForm.url && !downloadForm.doi) {
      setDownloadStatus("Provide a title, DOI, or URL to continue.");
      return;
    }
    const fallbackTitle = downloadForm.title || downloadForm.url || downloadForm.doi || "Untitled paper";
    const newPaper: Paper = {
      id: Date.now(),
      title: fallbackTitle,
      source_url: downloadForm.url || undefined,
      created_at: new Date().toISOString(),
      note_count: 0
    };
    setLocalPapers((prev) => [newPaper, ...prev]);
    setDownloadStatus("Paper added to your library. Full download + summary automation coming soon.");
    setDownloadForm({ title: "", url: "", doi: "" });
    setSelectedPaperId(newPaper.id);
    setPaperMode("library");
  }

  function handleDeletePaper(paper: Paper) {
    if (typeof window !== "undefined" && !window.confirm("Remove this paper from the list?")) {
      return;
    }
    const remaining = combinedPapers.filter((p) => p.id !== paper.id);
    if (selectedPaperId === paper.id) {
      setSelectedPaperId(remaining.length ? remaining[0].id : null);
    }
    if (localPapers.some((p) => p.id === paper.id)) {
      setLocalPapers((prev) => prev.filter((p) => p.id !== paper.id));
    } else {
      setHiddenPaperIds((prev) => {
        const next = new Set(prev);
        next.add(paper.id);
        return next;
      });
    }
  }

  function openPaperSource() {
    if (selectedPaper?.source_url && typeof window !== "undefined") {
      window.open(selectedPaper.source_url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <section className="page research">
      <div className="page-head">
        <div>
          <h2>Research Papers</h2>
          <p className="muted">Browse existing PDFs or queue up new downloads to summarize with the instructor assistant.</p>
        </div>
        <div className="page-actions">
          <button onClick={onBack}>Back</button>
          <button onClick={refresh}>Refresh</button>
        </div>
      </div>
      <div className="question-mode-toggle">
        <button className={paperMode === "library" ? "primary" : ""} onClick={() => setPaperMode("library")}>
          View Your Research Papers
        </button>
        <button className={paperMode === "ingest" ? "primary" : ""} onClick={() => setPaperMode("ingest")}>
          Download and Summarize Papers
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {paperMode === "library" ? (
        <div className="research-view-layout">
          <aside className="papers-sidebar">
            <div className="notes-sidebar-head">
              <div>
                <p className="eyebrow-label">Library</p>
                <h3>Papers ({combinedPapers.length})</h3>
              </div>
              <button onClick={refresh}>Sync</button>
            </div>
            {loading ? (
              <p>Loading papers…</p>
            ) : combinedPapers.length ? (
              <ul className="paper-list modern">
                {combinedPapers.map((paper) => (
                  <li key={paper.id}>
                    <div className={`paper-card ${paper.id === selectedPaperId ? "active" : ""}`} onClick={() => handleSelectPaper(paper)}>
                      <div className="paper-card-info">
                        <strong>{paper.title || "Untitled paper"}</strong>
                        <span>{paperDomain(paper.source_url) || "Local file"}</span>
                      </div>
                      <div className="paper-card-meta">
                        <span className="paper-date">{friendlyDate(paper.created_at)}</span>
                        <button
                          className="ghost paper-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePaper(paper);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No papers yet. Switch to download mode to add one.</p>
            )}
          </aside>
          <div className="paper-viewer-column">
            {pdfFullscreen && <div className="pdf-backdrop" onClick={() => setPdfFullscreen(false)} />}
            <div className={`paper-viewer-shell ${pdfFullscreen ? "fullscreen" : ""}`}>
              <div className="paper-viewer-head">
                <div>
                  <h3>{selectedPaper?.title || "Select a paper"}</h3>
                  <p className="muted">
                    {selectedPaper
                      ? selectedPaper.source_url
                        ? paperDomain(selectedPaper.source_url)
                        : "No external link provided."
                      : "Choose a paper on the left to preview the PDF."}
                  </p>
                </div>
                <div className="paper-viewer-actions">
                  <button onClick={openPaperSource} disabled={!selectedPaper?.source_url}>
                    Open Source
                  </button>
                  <button onClick={() => setPdfFullscreen((prev) => !prev)} disabled={!pdfSrc}>
                    {pdfFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  </button>
                </div>
              </div>
              <div className="paper-viewer-body">
                {selectedPaper ? (
                  pdfSrc ? (
                    <iframe src={pdfSrc} title={selectedPaper.title || "Research PDF"} />
                  ) : (
                    <div className="pdf-placeholder">
                      <p>No PDF available for this entry yet.</p>
                      <p className="muted">Use Download & Summarize to fetch the file automatically.</p>
                    </div>
                  )
                ) : (
                  <div className="pdf-placeholder">
                    <p>Select a paper from the list to begin.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="papers-download-layout">
          <div className="download-card">
            <h3>Download a Paper</h3>
            <p className="muted">Provide whatever you have—DOI, title, or URL—and we&apos;ll queue the PDF.</p>
            <label>
              Paper Title
              <input value={downloadForm.title} onChange={(e) => handleDownloadFieldChange("title", e.target.value)} placeholder="e.g., Attention Is All You Need" />
            </label>
            <label>
              DOI
              <input value={downloadForm.doi} onChange={(e) => handleDownloadFieldChange("doi", e.target.value)} placeholder="10.5555/3295222.3295349" />
            </label>
            <label>
              URL
              <input value={downloadForm.url} onChange={(e) => handleDownloadFieldChange("url", e.target.value)} placeholder="https://arxiv.org/abs/1706.03762" />
            </label>
            <div className="form-actions">
              <button className="primary" onClick={handleDownloadPaperAction}>
                Download Paper
              </button>
              <button onClick={() => setDownloadForm({ title: "", url: "", doi: "" })}>Clear</button>
            </div>
            {downloadStatus && <p className="status">{downloadStatus}</p>}
          </div>
          <div className="papers-chat-card">
            <h3>Summarize with the Assistant</h3>
            <p className="muted">Chatbot hooks coming soon. You&apos;ll be able to drop PDFs, ask for abstracts, and push highlights to Notes.</p>
            <div className="chat-placeholder tall">
              <div className="chat-screen">Chatbot workspace placeholder</div>
            </div>
            <ul className="coming-soon-list">
              <li>Ask for executive summaries or quizzes.</li>
              <li>Auto-create notes directly in the editor.</li>
              <li>Track download status + ingestion logs.</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function NotesPage({ onBack }: { onBack: () => void }) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [form, setForm] = useState(emptyNoteForm());
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchPreview, setMatchPreview] = useState<{ id: number; snippet: string }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    refreshAll();
  }, []);

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) {
      setMatchPreview([]);
      return notes;
    }
    const q = searchQuery.toLowerCase();
    const matches: { id: number; snippet: string }[] = [];
    const filtered = notes.filter((note) => {
      const title = note.title?.toLowerCase() ?? "";
      const body = note.body?.toLowerCase() ?? "";
      const found = title.includes(q) || body.includes(q);
      if (found) {
        const snippet = buildSnippet(note.body || "", q);
        matches.push({ id: note.id, snippet });
      }
      return found;
    });
    setMatchPreview(matches);
    return filtered;
  }, [notes, searchQuery]);

  const wordCount = useMemo(() => {
    const text = (form.body || "").trim();
    if (!text) {
      return 0;
    }
    return text.split(/\s+/).length;
  }, [form.body]);

  const highlightedBody = useMemo(() => {
    return renderHighlightedBody(form.body || "", searchQuery);
  }, [form.body, searchQuery]);

  useEffect(() => {
    const textarea = textareaRef.current;
    const highlightLayer = highlightRef.current;
    if (!textarea || !highlightLayer) {
      return;
    }
    const layer = highlightLayer;
    const area = textarea;
    const syncScroll = () => {
      layer.scrollTop = area.scrollTop;
    };
    area.addEventListener("scroll", syncScroll);
    return () => {
      area.removeEventListener("scroll", syncScroll);
    };
  }, [form.body, searchQuery]);

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      const [paperRows, noteRows] = await Promise.all([listPapers(), listNotes()]);
      setPapers(paperRows);
      setNotes(noteRows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(note: Note) {
    setSelectedNoteId(note.id);
    setForm({
      id: note.id,
      title: note.title || "",
      body: note.body,
      paperId: undefined
    });
    setStatus(null);
  }

  function startNewNote() {
    setSelectedNoteId(null);
    setForm(emptyNoteForm());
    setStatus(null);
  }

  function handleFieldChange(field: "title" | "body" | "paperId", value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: field === "paperId" ? undefined : value
    }));
  }

  async function handleSave() {
    if (!form.body.trim()) {
      setError("Note body cannot be empty.");
      return;
    }
    setError(null);
    setStatus("Saving…");
    try {
      let saved: Note;
      if (selectedNoteId) {
        saved = await updateNote(selectedNoteId, {
          title: form.title,
          body: form.body,
          paper_id: null
        });
      } else {
        saved = await createNote({
          title: form.title,
          body: form.body,
          paper_id: null
        });
        setSelectedNoteId(saved.id);
      }
      await refreshAll();
      setStatus(`Saved note ${saved.id}.`);
    } catch (err) {
      setError((err as Error).message);
      setStatus(null);
    }
  }

  async function handleDelete() {
    if (!selectedNoteId) {
      return;
    }
    if (!window.confirm("Delete this note?")) {
      return;
    }
    try {
      await deleteNote(selectedNoteId);
      startNewNote();
      await refreshAll();
      setStatus("Deleted note.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="page notes">
      <div className="page-head">
        <div>
          <h2>Note Editor</h2>
          <p className="muted">Create new summaries or refine existing ones without leaving your desktop.</p>
        </div>
        <div className="page-actions">
          <button onClick={onBack}>Back</button>
          <button onClick={refreshAll}>Refresh</button>
        </div>
      </div>
      {loading && <p>Loading notes…</p>}
      {error && <p className="error">{error}</p>}
      <div className="note-layout modern-notes">
        <aside className="notes-sidebar">
          <div className="notes-sidebar-head">
            <div>
              <p className="eyebrow-label">Notebook</p>
              <h3>All Notes</h3>
            </div>
            <button onClick={startNewNote}>New</button>
          </div>
          <div className="notes-sidebar-hero">
            <div>
              <span className="hero-label">Notes Saved</span>
              <strong>{notes.length}</strong>
            </div>
            <div>
              <span className="hero-label">Last Refresh</span>
              <strong>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
            </div>
          </div>
          <div className="note-search">
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search in notes…" />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} aria-label="Clear search">
                ×
              </button>
            )}
          </div>
          <ul className="note-list modern">
            {filteredNotes.map((note) => (
              <li
                key={note.id}
                className={`note-card ${note.id === selectedNoteId ? "active" : ""}`}
                onClick={() => handleSelect(note)}
              >
                <div>
                  <span className="note-title">{truncateNoteTitle(note.title)}</span>
                  {searchQuery && (
                    <p className="note-snippet">
                      {matchPreview.find((match) => match.id === note.id)?.snippet || "Contains match"}
                    </p>
                  )}
                </div>
                <span className="note-date">{friendlyDate(note.created_at)}</span>
              </li>
            ))}
            {!filteredNotes.length && (
              <li className="empty-state">{searchQuery ? "No notes match that search." : "No notes yet. Tap New to capture your first one."}</li>
            )}
          </ul>
        </aside>
        <div className="notes-editor-shell">
          <div className="notes-editor-head">
            <div>
              <p className="eyebrow-label">{selectedNoteId ? "Editing note" : "New note"}</p>
              <span className="word-count">{wordCount} words</span>
            </div>
            <span className="note-tag pill">{selectedNoteId ? `#${selectedNoteId}` : "Draft"}</span>
          </div>
          <div className="note-editor modern">
            <div className="note-canvas">
              <input
                className="note-canvas-title"
                value={form.title}
                onChange={(e) => handleFieldChange("title", e.target.value)}
                placeholder="Untitled note"
              />
              <div className="note-body-wrapper">
                <div className="note-highlight-layer" aria-hidden="true" ref={highlightRef} dangerouslySetInnerHTML={{ __html: highlightedBody }} />
                <textarea
                  className="note-canvas-body overlay"
                  ref={textareaRef}
                  value={form.body}
                  onChange={(e) => handleFieldChange("body", e.target.value)}
                  placeholder="Write or paste a summary…"
                />
              </div>
            </div>
            <div className="form-actions floating">
              <button className="primary" onClick={handleSave}>
                {selectedNoteId ? "Update Note" : "Create Note"}
              </button>
              {selectedNoteId && (
                <button className="danger" onClick={handleDelete}>
                  Delete
                </button>
              )}
            </div>
            {status && <p className="status">{status}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function friendlyDate(value?: string | null): string {
  if (!value) {
    return "Draft";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Draft";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncateNoteTitle(value?: string | null, maxWords = 6): string {
  const title = (value || "").trim();
  if (!title) {
    return "Untitled note";
  }
  const words = title.split(/\s+/);
  if (words.length <= maxWords) {
    return title;
  }
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function paperDomain(url?: string | null): string {
  if (!url) {
    return "";
  }
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function buildSnippet(body: string, query: string, radius = 60): string {
  const normalized = body || "";
  const lower = normalized.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) {
    return normalized.slice(0, radius).trim();
  }
  const start = Math.max(0, idx - radius / 2);
  const end = Math.min(normalized.length, idx + query.length + radius / 2);
  let snippet = normalized.slice(start, end).trim();
  if (start > 0) {
    snippet = `…${snippet}`;
  }
  if (end < normalized.length) {
    snippet = `${snippet}…`;
  }
  return snippet;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedBody(body: string, query: string): string {
  const safe = escapeHtml(body).replace(/\n/g, "<br />");
  if (!query.trim()) {
    return safe || '<span class="placeholder-text">Write or paste a summary…</span>';
  }
  const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
  return safe.replace(regex, "<mark>$1</mark>") || '<span class="placeholder-text">Write or paste a summary…</span>';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function QuestionSetsPage({ onBack }: { onBack: () => void }) {
  const [sets, setSets] = useState<QuestionSetMeta[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [questions, setQuestions] = useState<QuestionForm[]>([emptyQuestion()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<QuestionMode>("generate");
  const [markdownDraft, setMarkdownDraft] = useState<string>(MARKDOWN_PLACEHOLDER);
  const [markdownStatus, setMarkdownStatus] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("question-set.md");

  useEffect(() => {
    refreshSets();
  }, []);

  async function refreshSets() {
    setError(null);
    try {
      const rows = await listQuestionSets();
      setSets(rows);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadSet(id: number) {
    setLoading(true);
    setError(null);
    try {
      const data = await getQuestionSet(id);
      setMode("upload");
      setSelectedId(id);
      setPrompt(data.question_set.prompt || "");
      setQuestions(
        data.questions.length
          ? data.questions.map((q) => ({
              ...q,
              options: q.options || undefined,
              optionsDraft: (q.options || []).join("\n")
            }))
          : [emptyQuestion()]
      );
      syncMarkdownFromQuestions(data.question_set.prompt || "", data.questions, data.question_set.canvas_md_path, id);
      setStatus(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function startNewSet() {
    setMode("upload");
    setSelectedId(null);
    setPrompt("");
    setQuestions([emptyQuestion()]);
    setMarkdownDraft(MARKDOWN_PLACEHOLDER);
    setSelectedFileName("question-set.md");
    setMarkdownStatus(null);
    setStatus(null);
  }

  function handleQuestionChange(index: number, updates: Partial<QuestionForm>) {
    setQuestions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }

  function handleOptionChange(index: number, raw: string) {
    const entries = raw.split("\n").map((o) => o.trim()).filter(Boolean);
    handleQuestionChange(index, {
      options: entries.length ? entries : undefined,
      optionsDraft: raw
    });
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  const normalizedQuestions = useMemo(() => {
    return questions.map(({ optionsDraft, ...rest }) => ({
      ...rest,
      options: rest.options && rest.options.length ? rest.options : undefined
    }));
  }, [questions]);

  async function handleSave() {
    if (!prompt.trim()) {
      setError("Provide a prompt or description for the question set.");
      return;
    }
    if (!normalizedQuestions.every((q) => q.text.trim())) {
      setError("Each question needs text.");
      return;
    }
    setError(null);
    setStatus("Saving…");
    try {
      const payload = selectedId
        ? await updateQuestionSet(selectedId, { prompt, questions: normalizedQuestions })
        : await createQuestionSet({ prompt, questions: normalizedQuestions });
      const newId = payload.question_set.id;
      if (!selectedId) {
        setSelectedId(newId);
      }
      setPrompt(payload.question_set.prompt || "");
      setQuestions(
        payload.questions.length
          ? payload.questions.map((q) => ({
              ...q,
              options: q.options || undefined,
              optionsDraft: (q.options || []).join("\n")
            }))
          : [emptyQuestion()]
      );
      await refreshSets();
      const canvasMsg = payload.question_set.canvas_md_path ? ` Markdown: ${payload.question_set.canvas_md_path}` : "";
      setStatus(`Saved ${payload.questions.length} questions.${canvasMsg}`);
      syncMarkdownFromQuestions(payload.question_set.prompt || "", payload.questions, payload.question_set.canvas_md_path, newId);
    } catch (err) {
      setError((err as Error).message);
      setStatus(null);
    }
  }

  async function handleDeleteSet(id: number) {
    if (!window.confirm("Delete this question set?")) {
      return;
    }
    try {
      await deleteQuestionSet(id);
      if (id === selectedId) {
        startNewSet();
      }
      await refreshSets();
      setStatus("Deleted question set.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleMarkdownUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setMode("upload");
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setMarkdownDraft(text || MARKDOWN_PLACEHOLDER);
      setSelectedFileName(file.name);
      setMarkdownStatus(`Loaded ${file.name}`);
    };
    reader.onerror = () => {
      setMarkdownStatus("Unable to read that file.");
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function handleDownloadMarkdown() {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    if (!markdownDraft.trim()) {
      setMarkdownStatus("Add markdown content before saving.");
      return;
    }
    const blob = new Blob([markdownDraft], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = selectedFileName || "question-set.md";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setMarkdownStatus("Markdown downloaded locally.");
  }

  function syncMarkdownFromQuestions(promptValue: string, items: Question[], canvasPath?: string | null, fallbackId?: number | null) {
    const rendered = renderMarkdownFromQuestions(promptValue, items);
    setMarkdownDraft(rendered.trim() ? rendered : MARKDOWN_PLACEHOLDER);
    const fallbackName = fallbackId ? `question_set_${fallbackId}.md` : "question-set.md";
    setSelectedFileName(extractFileName(canvasPath) || fallbackName);
    setMarkdownStatus("Markdown editor synced with the structured questions.");
  }

  const markdownPane = (
    <div className="markdown-panel">
      <div className="markdown-head">
        <div>
          <h3>Question Set Markdown</h3>
          <p className="muted">{selectedFileName ? `Editing ${selectedFileName}` : "No markdown loaded yet."}</p>
        </div>
        <div className="markdown-actions">
          <button className="primary" onClick={handleDownloadMarkdown}>
            Save .md
          </button>
          <button className="ghost" disabled>
            Send to Canvas (coming soon)
          </button>
        </div>
      </div>
      <textarea className="markdown-textarea" value={markdownDraft} onChange={(e) => { setMarkdownDraft(e.target.value); setMarkdownStatus(null); }} rows={20} />
      {markdownStatus && <p className="status">{markdownStatus}</p>}
    </div>
  );

  return (
    <section className="page questions">
      <div className="page-head">
        <div>
          <h2>Question Sets</h2>
          <p className="muted">Generate assessments with the upcoming chatbot or continue uploading and editing markdown manually.</p>
        </div>
        <div className="page-actions">
          <button onClick={onBack}>Back</button>
          <button onClick={startNewSet}>New Set</button>
        </div>
      </div>
      <div className="question-mode-toggle">
        <button
          className={mode === "generate" ? "primary" : ""}
          onClick={() => {
            setMode("generate");
            setMarkdownDraft("");
            setSelectedFileName("");
            setMarkdownStatus(null);
          }}
        >
          Generate Question Set
        </button>
        <button
          className={mode === "upload" ? "primary" : ""}
          onClick={() => {
            setMode("upload");
            if (!markdownDraft.trim()) {
              setMarkdownDraft(MARKDOWN_PLACEHOLDER);
            }
            if (!selectedFileName) {
              setSelectedFileName("question-set.md");
            }
          }}
        >
          Upload Question Sets
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {mode === "generate" ? (
        <div className="dual-pane">
          <div className="chat-pane">
            <h3>Instructor Assistant Workspace</h3>
            <p className="muted">Chat with your LLM, upload context, and let it draft the markdown. Placeholder UI for now.</p>
            <div className="chat-placeholder">
              <div className="chat-screen">Chatbot interface placeholder</div>
            </div>
            <div className="chat-footnote muted">The conversational UI and LLM hooks will live here.</div>
          </div>
          {markdownPane}
        </div>
      ) : (
        <div className="upload-layout">
          <div className="upload-left">
            <section className="upload-card">
              <h3>Upload Markdown</h3>
              <p className="muted">Bring in an existing `.md` file or one created via the chatbot.</p>
              <label className="file-upload">
                <input type="file" accept=".md,.markdown,text/markdown" onChange={handleMarkdownUpload} />
                Choose .md file
              </label>
              {selectedFileName && <span className="file-pill">Currently editing: {selectedFileName}</span>}
            </section>
            <section className="upload-card">
              <div className="list-head">
                <h3>LLM Generated Files</h3>
                <button onClick={refreshSets}>Refresh</button>
              </div>
              <ul className="set-list compact">
                {sets.map((set) => (
                  <li key={set.id} className={selectedId === set.id ? "active" : ""}>
                    <div onClick={() => loadSet(set.id)}>
                      <strong>{set.prompt ? set.prompt.slice(0, 80) : "Untitled set"}</strong>
                      <span className="muted">
                        {set.count ?? 0} questions • {set.created_at ? new Date(set.created_at).toLocaleDateString() : "—"}
                      </span>
                    </div>
                    <button className="danger ghost" onClick={() => handleDeleteSet(set.id)}>
                      ×
                    </button>
                  </li>
                ))}
                {!sets.length && <li>No question sets yet.</li>}
              </ul>
            </section>
            <section className="upload-card manual-builder">
              <div className="manual-head">
                <div>
                  <h3>Manual Question Builder</h3>
                  <p className="muted">Keep crafting questions the classic way and sync them to markdown.</p>
                </div>
                <button onClick={startNewSet}>New Set</button>
              </div>
              <label>
                Prompt / Description
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Describe what this set should cover…" />
              </label>
              {loading ? (
                <p>Loading set…</p>
              ) : (
                <div className="question-list">
                  {questions.map((q, idx) => (
                    <div key={idx} className="question-card">
                      <div className="question-head">
                        <span>Question {idx + 1}</span>
                        <button onClick={() => removeQuestion(idx)} disabled={questions.length === 1}>
                          Remove
                        </button>
                      </div>
                      <label>
                        Kind
                        <select value={q.kind} onChange={(e) => handleQuestionChange(idx, { kind: e.target.value })}>
                          <option value="mcq">Multiple Choice</option>
                          <option value="short_answer">Short Answer</option>
                          <option value="true_false">True / False</option>
                          <option value="essay">Essay</option>
                        </select>
                      </label>
                      <label>
                        Text
                        <textarea value={q.text} onChange={(e) => handleQuestionChange(idx, { text: e.target.value })} rows={3} placeholder="Question text…" />
                      </label>
                      {q.kind === "mcq" && (
                        <label>
                          Options (one per line)
                          <textarea
                            value={q.optionsDraft ?? (q.options || []).join("\n")}
                            onChange={(e) => handleOptionChange(idx, e.target.value)}
                            rows={4}
                            placeholder={"Option A\nOption B\nOption C\nOption D"}
                          />
                        </label>
                      )}
                      <label>
                        Answer
                        <input value={q.answer || ""} onChange={(e) => handleQuestionChange(idx, { answer: e.target.value })} placeholder="Answer text or letter" />
                      </label>
                      <label>
                        Explanation
                        <textarea value={q.explanation || ""} onChange={(e) => handleQuestionChange(idx, { explanation: e.target.value })} rows={2} placeholder="Optional explanation" />
                      </label>
                      <label>
                        Reference
                        <input value={q.reference || ""} onChange={(e) => handleQuestionChange(idx, { reference: e.target.value })} placeholder="Optional citation" />
                      </label>
                    </div>
                  ))}
                  <button onClick={addQuestion}>Add Question</button>
                </div>
              )}
              <div className="form-actions">
                <button className="primary" onClick={handleSave}>
                  {selectedId ? "Update Set" : "Create Set"}
                </button>
              </div>
              {status && <p className="status">{status}</p>}
            </section>
          </div>
          {markdownPane}
        </div>
      )}
    </section>
  );
}

function renderMarkdownFromQuestions(prompt: string, items: Question[]): string {
  if (!items || !items.length) {
    return prompt.trim() ? `<!-- Prompt: ${prompt.trim()} -->\n` : "";
  }
  const points = {
    mcq: 3,
    short_answer: 4,
    true_false: 2,
    essay: 5
  };

  const buckets = {
    mcq: [] as Question[],
    short_answer: [] as Question[],
    true_false: [] as Question[],
    essay: [] as Question[]
  };

  items.forEach((item) => {
    const kind = (item.kind || "").toLowerCase();
    if (["mcq", "multiple_choice", "multiple_choice_question"].includes(kind)) {
      buckets.mcq.push(item);
    } else if (["short_answer", "short-answer", "shortanswer"].includes(kind)) {
      buckets.short_answer.push(item);
    } else if (["true_false", "truefalse", "tf"].includes(kind)) {
      buckets.true_false.push(item);
    } else if (["essay", "long_answer", "longanswer"].includes(kind)) {
      buckets.essay.push(item);
    } else {
      buckets.short_answer.push(item);
    }
  });

  const lines: string[] = [];
  let qnum = 1;

  if (buckets.mcq.length) {
    lines.push(`### Multiple Choice Questions (MCQ) - ${points.mcq} points each`, "");
    buckets.mcq.forEach((it) => {
      lines.push(...formatMcq(qnum, it), "");
      qnum += 1;
    });
  }

  if (buckets.short_answer.length) {
    lines.push(`### Short Answer Questions - ${points.short_answer} points each`, "");
    buckets.short_answer.forEach((it) => {
      lines.push(...formatShortAnswer(qnum, it), "");
      qnum += 1;
    });
  }

  if (buckets.true_false.length) {
    lines.push(`### True/False Questions (T/F) - ${points.true_false} points each`, "");
    buckets.true_false.forEach((it) => {
      lines.push(...formatTrueFalse(qnum, it), "");
      qnum += 1;
    });
  }

  if (buckets.essay.length) {
    lines.push(`### Essay Questions - ${points.essay} points each`, "");
    buckets.essay.forEach((it) => {
      lines.push(...formatEssay(qnum, it), "");
      qnum += 1;
    });
  }

  const promptBlock = prompt.trim() ? `<!-- Prompt: ${prompt.trim()} -->\n\n` : "";
  const body = lines.join("\n").trim();
  return body ? `${promptBlock}${body}\n` : promptBlock;
}

function formatMcq(qnum: number, item: Question): string[] {
  const text = cleanText(item.text) || "Untitled question";
  const options = ensureFourOptions(item.options);
  const answer = pickAnswerLetter(options, item.answer);
  const explanation = composeExplanation(item.explanation, item.reference);
  const lines = [
    `**${qnum}. ${text}**`,
    `a) ${options[0]}`,
    `b) ${options[1]}`,
    `c) ${options[2]}`,
    `d) ${options[3]}`,
    `**Answer:** ${answer}`
  ];
  if (explanation) {
    lines.push(`**Explanation:** ${explanation}`);
  }
  return lines;
}

function formatShortAnswer(qnum: number, item: Question): string[] {
  const text = cleanText(item.text) || "Untitled question";
  const answer = cleanText(item.answer) || "—";
  const explanation = composeExplanation(item.explanation, item.reference);
  const lines = [`**${qnum}. ${text}**`, `**Answer:** ${answer}`];
  if (explanation) {
    lines.push(`**Explanation:** ${explanation}`);
  }
  return lines;
}

function formatTrueFalse(qnum: number, item: Question): string[] {
  const text = cleanText(item.text) || "Untitled statement";
  const answerRaw = cleanText(item.answer).toLowerCase();
  const answer = ["true", "t", "yes", "1"].includes(answerRaw) ? "True" : "False";
  const explanation = composeExplanation(item.explanation, item.reference);
  const lines = [`**${qnum}. T/F: ${text}**`, `**Answer:** ${answer}`];
  if (explanation) {
    lines.push(`**Explanation:** ${explanation}`);
  }
  return lines;
}

function formatEssay(qnum: number, item: Question): string[] {
  const text = cleanText(item.text) || "Essay prompt";
  const explanation = composeExplanation(item.explanation, item.reference);
  const lines = [`**${qnum}. ${text}**`, "**Answer:**"];
  if (explanation) {
    lines.push(`**Explanation:** ${explanation}`);
  }
  return lines;
}

function ensureFourOptions(options?: string[] | null): string[] {
  const cleaned = (options || []).map((opt) => cleanText(opt)).filter(Boolean);
  while (cleaned.length < 4) {
    cleaned.push("—");
  }
  return cleaned.slice(0, 4);
}

function pickAnswerLetter(options: string[], answer?: string | null): string {
  const choice = (answer || "").trim().toUpperCase();
  if (["A", "B", "C", "D"].includes(choice)) {
    return choice;
  }
  const normalized = cleanText(answer).toLowerCase();
  const idx = options.findIndex((opt) => cleanText(opt).toLowerCase() === normalized);
  return idx >= 0 ? "ABCD"[idx] : "A";
}

function composeExplanation(explanation?: string | null, reference?: string | null): string {
  const parts: string[] = [];
  const expl = cleanText(explanation);
  const ref = cleanText(reference);
  if (expl) {
    parts.push(expl);
  }
  if (ref) {
    parts.push(`(Ref: ${ref})`);
  }
  return parts.join(" ").trim();
}

function cleanText(value?: string | null): string {
  if (!value) {
    return "";
  }
  return value.toString().replace(/\s+/g, " ").trim();
}

function extractFileName(path?: string | null): string | null {
  if (!path) {
    return null;
  }
  const parts = path.split("/");
  return parts.pop() || null;
}
