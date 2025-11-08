import { ChangeEvent, useEffect, useMemo, useState } from "react";
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
