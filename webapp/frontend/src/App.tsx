import { useEffect, useMemo, useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listPapers();
      setPapers(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h2>Research Papers</h2>
          <p className="muted">Every paper listed here is already indexed inside the ChatGPT instructor assistant.</p>
        </div>
        <div className="page-actions">
          <button onClick={onBack}>Back</button>
          <button onClick={refresh}>Refresh</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? <p>Loading papers…</p> : <PaperList papers={papers} />}
    </section>
  );
}

function PaperList({ papers }: { papers: Paper[] }) {
  if (!papers.length) {
    return <p>No papers found yet. Use the ChatGPT app to add one or run the ingestion scripts.</p>;
  }
  return (
    <ul className="paper-list">
      {papers.map((paper) => (
        <li key={paper.id}>
          <div className="paper-title">{paper.title || "Untitled paper"}</div>
          <div className="paper-meta">
            {paper.source_url && (
              <a href={paper.source_url} target="_blank" rel="noreferrer">
                Source
              </a>
            )}
            <span>Notes: {paper.note_count ?? 0}</span>
            {paper.created_at && <span>{new Date(paper.created_at).toLocaleString()}</span>}
          </div>
        </li>
      ))}
    </ul>
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

  useEffect(() => {
    refreshAll();
  }, []);

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
      paperId: note.paper_id ?? undefined
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
      [field]: field === "paperId" ? (value ? Number(value) : undefined) : value
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
          paper_id: form.paperId ?? null
        });
      } else {
        saved = await createNote({
          title: form.title,
          body: form.body,
          paper_id: form.paperId ?? null
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
      <div className="note-layout">
        <aside>
          <div className="list-head">
            <h3>Notes</h3>
            <button onClick={startNewNote}>New</button>
          </div>
          <ul className="note-list">
            {notes.map((note) => (
              <li
                key={note.id}
                className={note.id === selectedNoteId ? "active" : ""}
                onClick={() => handleSelect(note)}
              >
                <strong>{note.title || "Untitled note"}</strong>
                <span className="muted">{note.paper_title || "Unassigned"}</span>
              </li>
            ))}
          </ul>
        </aside>
        <div className="note-editor">
          <label>
            Title
            <input value={form.title} onChange={(e) => handleFieldChange("title", e.target.value)} placeholder="Note title" />
          </label>
          <label>
            Paper
            <select value={form.paperId ?? ""} onChange={(e) => handleFieldChange("paperId", e.target.value)}>
              <option value="">Unassigned</option>
              {papers.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Body
            <textarea value={form.body} onChange={(e) => handleFieldChange("body", e.target.value)} rows={12} placeholder="Write or paste a summary…" />
          </label>
          <div className="form-actions">
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
    </section>
  );
}

function QuestionSetsPage({ onBack }: { onBack: () => void }) {
  const [sets, setSets] = useState<QuestionSetMeta[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [questions, setQuestions] = useState<QuestionForm[]>([emptyQuestion()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

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
      setStatus(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function startNewSet() {
    setSelectedId(null);
    setPrompt("");
    setQuestions([emptyQuestion()]);
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
      if (!selectedId) {
        setSelectedId(payload.question_set.id);
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

  return (
    <section className="page questions">
      <div className="page-head">
        <div>
          <h2>Question Sets</h2>
          <p className="muted">Add, edit, or delete test questions. Markdown exports update automatically.</p>
        </div>
        <div className="page-actions">
          <button onClick={onBack}>Back</button>
          <button onClick={startNewSet}>New Set</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="question-layout">
        <aside>
          <div className="list-head">
            <h3>Existing Sets</h3>
            <button onClick={refreshSets}>Refresh</button>
          </div>
          <ul className="set-list">
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
        </aside>
        <div className="question-editor">
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
        </div>
      </div>
    </section>
  );
}
