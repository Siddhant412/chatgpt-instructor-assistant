import React, { useEffect, useMemo, useRef, useState } from "react";

const RA_THEME = `
:root{
  --ra-bg:#ffffff; --ra-panel:#ffffff; --ra-text:#1f2937; --ra-heading:#111827; --ra-muted:#6b7280;
  --ra-border:rgba(0,0,0,0.12); --ra-elev:rgba(17,24,39,0.06); --ra-primary:#3b82f6; --ra-danger:#ef4444;
  --ra-soft-blue:rgba(59,130,246,0.12); --ra-soft-red:rgba(239,68,68,0.12); --ra-hover:rgba(0,0,0,0.04);
  --ra-focus:#c7d2fe; --ra-divider:rgba(0,0,0,0.08);
}
html, body { background: transparent; }
.ra-root{ font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial; color:var(--ra-text); }
.ra-outer{
  background:var(--ra-panel);
  border:1px solid var(--ra-border);
  border-radius:18px;
  box-shadow:0 10px 24px var(--ra-elev);
  padding:20px;
  max-height:100vh;      /* keep your caps */
  overflow:hidden;
}
.ra-shell{ display:grid; grid-template-columns:1fr 1.2fr; gap:28px; align-items:start; }
.ra-col-right{ border-left:1px solid var(--ra-divider); padding-left:28px; display:flex; flex-direction:column; min-height:240px; }
.ra-h1{ font-size:20px; font-weight:700; color:var(--ra-heading); margin:0 0 6px 0; }
.ra-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; gap:12px; }
.ra-actions{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }

.ra-btn{ appearance:none; border:1px solid var(--ra-border); background:#fff; color:var(--ra-heading); border-radius:999px; padding:6px 12px; font-weight:600; cursor:pointer; transition:background .15s,border-color .15s,transform .02s,opacity .15s; }
.ra-btn:hover{ background:var(--ra-hover); } .ra-btn:active{ transform:translateY(1px); } .ra-btn:focus{ outline:2px solid var(--ra-focus); outline-offset:1px; } .ra-btn:disabled{ opacity:.5; cursor:not-allowed; }
.ra-btn.link{ border-color:transparent; background:transparent; padding-left:0; padding-right:0; font-weight:700; }
.ra-btn.soft-primary{ background:var(--ra-soft-blue); border-color:rgba(59,130,246,0.25); color:#1e40af; }
.ra-btn.soft-danger{ background:var(--ra-soft-red); border-color:rgba(239,68,68,0.25); color:#7f1d1d; }

.ra-card{ background:#fff; border:1px solid var(--ra-border); border-radius:16px; box-shadow:0 6px 16px var(--ra-elev); padding:16px; }
.ra-card + .ra-card{ margin-top:12px; }
.ra-list{ margin:0; padding:0; list-style:none; }
.ra-list-item{ padding:12px 14px; margin:8px 0; border:1px solid var(--ra-border); border-radius:14px; background:#fff; transition:background .15s,border-color .15s,transform .04s; cursor:pointer; }
.ra-list-item:hover{ background:var(--ra-hover); }
.ra-list-item.active{ background:rgba(59,130,246,0.08); border-color:rgba(59,130,246,0.35); }
.ra-list-item .title{ color:var(--ra-heading); font-weight:700; letter-spacing:-0.01em; }
.ra-note-count{ margin-top:4px; font-size:12px; color:var(--ra-muted); }

.ra-notes-content{
  margin-top:8px;
  overflow:auto;
  max-height:88vh;
  padding-right:6px;
}
.ra-note-title{ font-weight:800; color:var(--ra-heading); margin:0 0 4px 0; }
.ra-note-date{ font-size:12px; color:var(--ra-muted); margin-bottom:10px; }
.ra-note-body{ white-space:pre-wrap; }

.ra-note-list{ overflow:auto; max-height:88vh; }
.ra-note-row{ padding:10px 12px; margin:8px 0; border:1px solid var(--ra-border); border-radius:12px; background:#f8fafc; cursor:pointer; transition:background .15s,border-color .15s; }
.ra-note-row:hover{ background:var(--ra-hover); }
.ra-note-row.active{ background:rgba(59,130,246,0.08); border-color:rgba(59,130,246,0.35); }
.ra-note-row .t{ font-weight:700; color:var(--ra-heading); }
.ra-note-row .d{ font-size:12px; color:var(--ra-muted); }
.ra-note-row .badge{ font-size:11px; color:#1e3a8a; background:rgba(59,130,246,0.10); border:1px solid rgba(59,130,246,0.25); border-radius:999px; padding:2px 8px; margin-left:8px; }

.ra-editor-pane{ display:flex; flex-direction:column; overflow:auto; max-height:88vh; }
.ra-input{ width:100%; border:1px solid var(--ra-border); border-radius:12px; padding:10px 12px; font-size:15px; }
.ra-input:focus{ outline:2px solid var(--ra-focus); outline-offset:1px; }
.ra-textarea{ width:100%; min-height:220px; border:1px solid var(--ra-border); border-radius:12px; padding:10px 12px; font-size:14px; resize:vertical; }
.ra-textarea:focus{ outline:2px solid var(--ra-focus); outline-offset:1px; }

.ra-inline-add{ display:flex; align-items:center; gap:8px; }
.ra-inline-add .fld{ min-width: 360px; flex: 1 1 auto; }
.ra-err{ color:#b91c1c; font-size:12px; margin-left:8px; }
.ra-status{ font-size:12px; color: var(--ra-muted); }

/* Test Builder */
.ra-test-list{ overflow:auto; max-height:88vh; }
.ra-q{ padding:12px; border:1px solid var(--ra-border); border-radius:12px; background:#fff; }
.ra-q + .ra-q{ margin-top:10px; }
.ra-q .kind{ font-size:12px; color:#1e40af; background:rgba(59,130,246,0.10); border:1px solid rgba(59,130,246,0.25); border-radius:999px; padding:2px 8px; margin-right:8px; }
.ra-q .ref{ font-size:12px; color:var(--ra-muted); }
`;

type PaperRow = { id: number; title: string; source_url?: string | null; note_count?: number };
type NoteRow = { id: number; paper_id: number | null; title?: string | null; body: string; created_at?: string; paper_title?: string | null };

type QuestionItem = {
  id?: number;
  set_id?: number;
  kind: "mcq" | "short_answer";
  text: string;
  options?: string[] | null;
  answer?: string | null;
  explanation?: string | null;
  reference?: string | null;
};
type QuestionSet = { id: number; prompt: string; created_at?: string; count?: number };

declare global {
  interface Window {
    openai?: {
      callTool?: (name: string, args?: any) => Promise<any>;
      sendFollowUpMessage?: (payload: { prompt: string }) => Promise<void>;
      onStructuredContent?: (cb: (data: any) => void) => () => void;
      structuredContent?: any;
      toolOutput?: any;
    };
  }
}

function normalizeStructured(sc: any): { papers: PaperRow[]; notesByPaper: Record<string, NoteRow[]> } | null {
  if (!sc || typeof sc !== "object") return null;
  if (!("papers" in sc)) return null;
  const papers = Array.isArray(sc.papers) ? sc.papers : [];
  const raw = sc.notesByPaper && typeof sc.notesByPaper === "object" ? sc.notesByPaper : {};
  const map: Record<string, NoteRow[]> = {};
  for (const [k, v] of Object.entries(raw)) map[k] = Array.isArray(v) ? (v as NoteRow[]) : [];
  return { papers, notesByPaper: map };
}

function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay: number) {
  const ref = useRef<number | undefined>();
  return (...args: Parameters<T>) => {
    window.clearTimeout(ref.current);
    ref.current = window.setTimeout(() => fn(...args), delay);
  };
}

export default function App() {
  // ----- Modes -----
  const [editorOpen, setEditorOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  // ----- Library data -----
  const [data, setData] = useState<{ papers: PaperRow[]; notesByPaper: Record<string, NoteRow[]> }>(() =>
    normalizeStructured(window.openai?.structuredContent) ??
    normalizeStructured(window.openai?.toolOutput?.structuredContent) ?? { papers: [], notesByPaper: {} }
  );
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(() => data.papers[0]?.id ?? null);

  // Inline "Add paper"
  const [addPaperOpen, setAddPaperOpen] = useState(false);
  const [addPaperValue, setAddPaperValue] = useState("");
  const [addingPaper, setAddingPaper] = useState(false);
  const [addPaperErr, setAddPaperErr] = useState<string | null>(null);

  // Notes editor
  const [allNotes, setAllNotes] = useState<NoteRow[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saveState, setSaveState] = useState<"idle"|"saving"|"saved">("idle");
  const [addingNote, setAddingNote] = useState(false);

  // Test Builder
  const [testPrompt, setTestPrompt] = useState("Create practice questions for study (not for graded exams): 10 MCQs (4 options) and 5 short-answer. Include page/slide references and brief explanations.");
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [testBusy, setTestBusy] = useState<"idle"|"generating">("idle");

  // Handshake / nonce (silent, no instructions to the model)
  const [nonce, setNonce] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const out = await window.openai?.callTool?.("session_handshake", {});
        const text = out?.content?.[0]?.text || out?.text || "";
        const j = (() => { try { return JSON.parse(text || "{}"); } catch { return {}; } })();
        if (j?.nonce) setNonce(j.nonce);
      } catch {}
    })();
  }, []);

  const selectedNotes = useMemo(() => {
    if (selectedPaperId == null) return [];
    return data.notesByPaper[String(selectedPaperId)] ?? [];
  }, [data, selectedPaperId]);
  const selectedPaper = useMemo(
    () => data.papers.find(p => p.id === selectedPaperId) ?? null,
    [data, selectedPaperId]
  );

  // Structured pushes:
  useEffect(() => {
    const off = window.openai?.onStructuredContent?.((sc: any) => {
      // If in Test mode, ignore library pushes so the UI doesnt jump back
      if (!testOpen) {
        const nextLib = normalizeStructured(sc);
        if (nextLib) {
          setData(nextLib);
          setEditorOpen(false);
          if (nextLib.papers.length > 0 && (selectedPaperId == null || !nextLib.papers.some(p => p.id === selectedPaperId))) {
            setSelectedPaperId(nextLib.papers[0].id);
          }
        }
      }
      // Test data can flow in anytime
      if (sc && typeof sc === "object") {
        if (sc.question_set) setQuestionSet(sc.question_set as QuestionSet);
        if (Array.isArray(sc.questions)) setQuestions(sc.questions as QuestionItem[]);
        if (Array.isArray(sc.question_sets)) setSets(sc.question_sets as QuestionSet[]);
      }
    });
    return () => { if (typeof off === "function") off(); };
  }, [testOpen, selectedPaperId]);

  async function refreshLibrary() {
    const out = await window.openai?.callTool?.("render_library", {});
    const sc = normalizeStructured(out?.structuredContent ?? out);
    if (sc) {
      setData(sc);
      setEditorOpen(false);
      setTestOpen(false);
    }
  }

  // ---------- Notes editor ----------
  async function loadAllNotes(): Promise<NoteRow[]> {
    const out = await window.openai?.callTool?.("list_notes_tool", {});
    const notes = Array.isArray(out?.structuredContent?.notes) ? out.structuredContent.notes : [];
    setAllNotes(notes);
    return notes;
  }
  function enterEditor(openFirst = true) {
    setEditorOpen(true);
    setTestOpen(false);
    (async () => {
      const notes = await loadAllNotes();
      if (openFirst && notes.length > 0) {
        const first = notes[0];
        setActiveNoteId(first.id);
        setDraftTitle(first.title || "");
        setDraftBody(first.body || "");
      } else {
        setActiveNoteId(null);
        setDraftTitle("Untitled");
        setDraftBody("");
      }
      setSaveState("idle");
    })();
  }
  function exitEditor() { setEditorOpen(false); setActiveNoteId(null); setSaveState("idle"); }
  function pickNote(n: NoteRow) {
    setActiveNoteId(n.id);
    setDraftTitle(n.title || "");
    setDraftBody(n.body || "");
    setSaveState("idle");
  }
  const debouncedAutosave = useDebouncedCallback(async (payload: {title: string; body: string}) => {
    setSaveState("saving");
    try {
      const current = allNotes.find(n => n.id === activeNoteId) || null;
      const args: any = { title: payload.title, body: payload.body, nonce };
      if (activeNoteId != null) args.note_id = activeNoteId;
      if (current && current.paper_id != null) args.paper_id = current.paper_id;
      const res = await window.openai?.callTool?.("save_note_tool", args);
      const note = res?.structuredContent?.note;
      if (note && typeof note.id === "number") setActiveNoteId(note.id);
      setSaveState("saved");
      await loadAllNotes();
    } catch { setSaveState("idle"); }
  }, 700);
  function onTitleChange(v: string) { setDraftTitle(v); debouncedAutosave({ title: v, body: draftBody }); }
  function onBodyChange(v: string) { setDraftBody(v); debouncedAutosave({ title: draftTitle, body: v }); }

  // ---------- Papers ----------
  async function handleAddPaper() {
    setAddPaperErr(null);
    const val = (addPaperValue || "").trim();
    if (!val) { setAddPaperErr("Paste a DOI, landing page, or PDF link."); return; }
    setAddingPaper(true);
    try {
      await window.openai?.callTool?.("add_paper_tool", { input_str: val });
      setAddPaperValue("");
      setAddPaperOpen(false);
      await refreshLibrary();
      if ((data.papers ?? []).length > 0) {
        setSelectedPaperId((prev) => prev ?? data.papers[0]?.id ?? null);
      }
    } catch (e:any) {
      setAddPaperErr(e?.message || "Failed to add paper.");
    } finally {
      setAddingPaper(false);
    }
  }
  async function deleteSelectedPaper() {
    if (!selectedPaperId) return;
    await window.openai?.callTool?.("delete_paper_tool", { paper_id: selectedPaperId });
    await refreshLibrary();
  }
  async function summarizeViaFollowUp(paperId: number, title: string) {
    const prompt = `
Use ONLY these tools and do not print the summary:
- index_paper { "paperId": "${paperId}" }
- get_paper_chunk { "paperId": "${paperId}", "sectionId": "<section id>" }
- save_note { "paperId": "${paperId}", "title": ${JSON.stringify(title)}, "summary": "<final note body>" }
Steps: index, read chunks, write 250-400 word summary + 5 takeaways + 3 limitations; then call save_note. No other tools. No chat output.`;
    if (window.openai?.sendFollowUpMessage) {
      await window.openai.sendFollowUpMessage({ prompt });
    } else {
      await window.openai?.callTool?.("summarize_paper_tool", { paper_id: paperId });
    }
  }
  async function summarizeCurrent() {
    if (!selectedPaperId || !selectedPaper) return;
    await summarizeViaFollowUp(selectedPaperId, selectedPaper.title || "Paper Summary");
  }

  // ---------- Test ----------
  function enterTestBuilder() {
    setTestOpen(true);
    setEditorOpen(false);
    // Minimal guardrail: stay silent on attachments; wait for Generate.
    void window.openai?.sendFollowUpMessage?.({
      prompt: `TEST_MODE:ON
While Test mode is open:
- If the user attaches files, DO NOT reply or summarize. Just read the file thoroughly. After reading, stay silent and wait for the user to press "Generate".
- Take NO any other actions until a "Generate" instruction arrives from the UI.`
    });
    setQuestionSet(null);
    setQuestions([]);
  }
  function exitTestBuilder() {
    setTestOpen(false);
    setQuestionSet(null);
    setQuestions([]);
    void window.openai?.sendFollowUpMessage?.({ prompt: "TEST_MODE:OFF" });
  }
  async function loadQuestionSets(setId?: number) {
    const out = await window.openai?.callTool?.("list_question_sets_tool", typeof setId === "number" ? { set_id: setId } : {});
    const sc = out?.structuredContent ?? {};
    if (Array.isArray(sc.question_sets)) setSets(sc.question_sets);
    if (sc.question_set) setQuestionSet(sc.question_set);
    if (Array.isArray(sc.questions)) setQuestions(sc.questions);
  }
  async function generateQuestionsFromAttachments() {
    if (!testPrompt.trim()) return;
    const nonceVal = nonce || "MISSING_NONCE";
    setTestBusy("generating");

    // One-shot directive: read attachments now, save set, no chat output.
    const prompt = `
You are in TEST_MODE:ON and the user clicked "Generate".

Do exactly this:
1) Read ONLY the PDF/PPT files attached in this chat (this is allowed and NOT a tool call).
2) Mandatorily create examination questions for college exams, grounded in those files.
   Each item must follow:
   {
     "kind": "mcq" | "short_answer",
     "text": "question text grounded in the attachment",
     "options": ["A","B","C","D"],     // for mcq only
     "answer": "correct option or short answer",
     "explanation": "1-3 sentences citing the attachment",
     "reference": "Page N" | "Slide N" | "Section ..."
   }

3) If NO attachments are accessible:
   - Do NOT call any tools.
   - Reply exactly:
     No attachments found. Please attach your PDF/PPT and press Generate again.
   - Then stop.

4) If you CANNOT reliably create any questions from the attachments:
   - Do NOT call any tools.
   - Reply exactly:
     Could not generate questions from the provided material. Please adjust the file or prompt and try again.
   - Then stop.

5) If you DO have one or more valid questions (items.length > 0):
   - Call ONLY this tool to persist them:
     save_question_set with:
     {
       "prompt": ${JSON.stringify(testPrompt)},
       "items": [ ...items... ],
       "nonce": "${nonceVal}"
     }
   - Do NOT call save_question_set tool before you generate the questions!
   - First generate the questions as per the prompt, and only then call save_question_set.
   - Do NOT call render_library or any other tools.
   - Do NOT print the questions or JSON in chat; let the UI read them from storage.

6) If the save_question_set call fails for any reason:
   - Reply exactly:
     Save failed — please try again.
   - Do NOT print the full items or JSON in chat.
`;
    try {
      if (window.openai?.sendFollowUpMessage) {
        await window.openai.sendFollowUpMessage({ prompt });
      }
      // Pull newly saved set
      setTimeout(() => loadQuestionSets(), 500);
    } finally {
      setTestBusy("idle");
    }
  }
  async function deleteQuestionSet(id: number) {
    await window.openai?.callTool?.("delete_question_set_tool", { set_id: id, nonce });
    setQuestionSet(null); setQuestions([]);
    await loadQuestionSets();
  }

  // ---------- Render ----------
  return (
    <div className="ra-root">
      <style>{RA_THEME}</style>

      <div className="ra-outer">
        {!editorOpen && !testOpen ? (
          /* -------------------- Library Mode -------------------- */
          <div className="ra-shell">
            {/* Left: papers */}
            <section>
              <div className="ra-head">
                <h1 className="ra-h1">Research Papers</h1>
                <div className="ra-actions">
                  {!addPaperOpen ? (
                    <>
                      <button className="ra-btn link" onClick={refreshLibrary}>Refresh</button>
                      <button className="ra-btn soft-danger" onClick={deleteSelectedPaper} disabled={!selectedPaperId}>Delete</button>
                      <button className="ra-btn soft-primary" onClick={() => { setAddPaperOpen(true); setAddPaperErr(null); }}>
                        Add
                      </button>
                    </>
                  ) : (
                    <div className="ra-inline-add">
                      <input
                        className="ra-input fld"
                        placeholder="Paste DOI / landing page / direct PDF link"
                        value={addPaperValue}
                        onChange={(e) => setAddPaperValue(e.target.value)}
                        disabled={addingPaper}
                      />
                      <button className="ra-btn soft-primary" onClick={handleAddPaper} disabled={addingPaper}>Add</button>
                      <button className="ra-btn" onClick={() => { setAddPaperOpen(false); setAddPaperErr(null); }}>Cancel</button>
                      {addPaperErr && <span className="ra-err">{addPaperErr}</span>}
                    </div>
                  )}
                </div>
              </div>

              <ul className="ra-list" role="list">
                {data.papers.map(p => {
                  const count = p.note_count ?? (data.notesByPaper[String(p.id)]?.length ?? 0);
                  return (
                    <li key={p.id} className={`ra-list-item ${selectedPaperId === p.id ? "active" : ""}`} onClick={() => setSelectedPaperId(p.id)}>
                      <div className="title">{p.title || "Untitled paper"}</div>
                      <div className="ra-note-count">{count} note{count === 1 ? "" : "s"}</div>
                    </li>
                  );
                })}
                {data.papers.length === 0 && <li className="ra-card">No papers yet. Click <b>Add</b> to paste a DOI, landing page, or direct PDF URL.</li>}
              </ul>
            </section>

            {/* Right: notes & actions */}
            <section className="ra-col-right">
              <div className="ra-head">
                <h1 className="ra-h1">Notes</h1>
                <div className="ra-actions">
                  <button className="ra-btn link" onClick={refreshLibrary}>Refresh</button>
                  <button className="ra-btn soft-primary" onClick={summarizeCurrent} disabled={!selectedPaperId}>Summarize this paper</button>
                  <button className="ra-btn" onClick={() => enterEditor(true)}>Edit Notes</button>
                  <button className="ra-btn" onClick={enterTestBuilder}>Create Practice Questions</button>
                </div>
              </div>

              <div className="ra-notes-content">
                {selectedPaperId == null || selectedNotes.length === 0 ? (
                  <div className="ra-card">No notes yet for <b>{selectedPaper?.title || "this paper"}</b>.</div>
                ) : (
                  selectedNotes.map(n => (
                    <article key={n.id} className="ra-card">
                      <h3 className="ra-note-title">{n.title || (selectedPaper?.title ? `Summary — ${selectedPaper.title}` : "Note")}</h3>
                      {n.created_at && <div className="ra-note-date">{new Date(n.created_at).toLocaleString()}</div>}
                      <div className="ra-note-body">{n.body}</div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : editorOpen ? (
          /* -------------------- Editor Mode -------------------- */
          <div className="ra-shell">
            {/* Left: all notes */}
            <section>
              <div className="ra-head">
                <h1 className="ra-h1">All Notes</h1>
                <div className="ra-actions">
                  <button className="ra-btn" onClick={exitEditor}>Back</button>
                  <button className="ra-btn" onClick={loadAllNotes}>Refresh</button>
                  <button
                    className="ra-btn soft-primary"
                    onClick={async () => {
                      setAddingNote(true);
                      try {
                        const res = await window.openai?.callTool?.("save_note_tool", { title: "Untitled", body: "New note", nonce });
                        const notes = await loadAllNotes();
                        const newId = res?.structuredContent?.note?.id;
                        const created = typeof newId === "number" ? notes.find(n => n.id === newId) : notes[0];
                        if (created) {
                          setActiveNoteId(created.id);
                          setDraftTitle(created.title || "Untitled");
                          setDraftBody(created.body || "");
                        }
                      } finally {
                        setAddingNote(false);
                      }
                    }}
                    disabled={addingNote}
                  >
                    {addingNote ? "Adding…" : "Add"}
                  </button>
                </div>
              </div>

              <div className="ra-note-list">
                {allNotes.length === 0 && <div className="ra-card">No notes yet. Click <b>Add</b> to create one.</div>}
                {allNotes.map(n => (
                  <div key={n.id} className={`ra-note-row ${activeNoteId === n.id ? "active" : ""}`} onClick={() => pickNote(n)}>
                    <div className="t">
                      {n.title || "Untitled"}{n.paper_title ? <span className="badge">{n.paper_title}</span> : null}
                    </div>
                    {n.created_at && <div className="d">{new Date(n.created_at).toLocaleString()}</div>}
                  </div>
                ))}
              </div>
            </section>

            {/* Right: editor */}
            <section className="ra-col-right">
              <div className="ra-head">
                <h1 className="ra-h1">Editor</h1>
                <div className="ra-actions">
                  <span className="ra-status">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}</span>
                  <button className="ra-btn soft-danger" onClick={async () => {
                    if (activeNoteId == null) return;
                    await window.openai?.callTool?.("delete_note_tool", { note_id: activeNoteId, nonce });
                    const notes = await loadAllNotes();
                    const first = notes[0];
                    if (first) { setActiveNoteId(first.id); setDraftTitle(first.title || ""); setDraftBody(first.body || ""); }
                    else { setActiveNoteId(null); setDraftTitle("Untitled"); setDraftBody(""); }
                  }} disabled={activeNoteId == null}>Delete</button>
                </div>
              </div>

              <div className="ra-editor-pane">
                <div className="ra-card" style={{ marginBottom: 12 }}>
                  <input className="ra-input" placeholder="Note title" value={draftTitle} onChange={(e) => onTitleChange(e.target.value)} />
                </div>
                <div className="ra-card">
                  <textarea className="ra-textarea" placeholder="Write your note…" value={draftBody} onChange={(e) => onBodyChange(e.target.value)} />
                </div>
              </div>
            </section>
          </div>
        ) : (
          /* -------------------- Test Builder -------------------- */
          <div className="ra-shell">
            {/* Left: attach files + prompt */}
            <section>
              <div className="ra-head">
                <h1 className="ra-h1">Create Practice Questions</h1>
                <div className="ra-actions">
                  <button className="ra-btn" onClick={exitTestBuilder}>Back</button>
                  <button className="ra-btn" onClick={() => loadQuestionSets()}>History</button>
                  <button className="ra-btn soft-primary" onClick={generateQuestionsFromAttachments} disabled={testBusy === "generating"}>
                    {testBusy === "generating" ? "Generating…" : "Generate"}
                  </button>
                </div>
              </div>

              <div className="ra-card" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>How it works</div>
                <div className="ra-status">
                  Attach one or more PDF/PPT files via the paperclip in ChatGPT, then click <b>Generate</b>. The model stays silent on upload and saves questions here.
                </div>
              </div>

              {sets.length > 0 && (
                <div className="ra-card" style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Recent Practice Sets</div>
                  <div className="ra-test-list">
                    {sets.map(s => (
                      <div key={s.id} className="ra-note-row" onClick={() => loadQuestionSets(s.id)}>
                        <div className="t">Set #{s.id} — {(s.count ?? 0)} items</div>
                        <div className="d">{s.created_at}</div>
                        <div className="d" style={{ marginTop: 4, color: "#374151" }}>{s.prompt}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Right: viewer */}
            <section className="ra-col-right">
              <div className="ra-head">
                <h1 className="ra-h1">Practice Set</h1>
                <div className="ra-actions">
                  {questionSet && (
                    <button className="ra-btn soft-danger" onClick={() => questionSet && deleteQuestionSet(questionSet.id)}>
                      Delete Set
                    </button>
                  )}
                </div>
              </div>

              <div className="ra-test-list">
                {!questionSet ? (
                  <div className="ra-card">Attach files and click <b>Generate</b> to create a question set.</div>
                ) : (
                  <>
                    <div className="ra-card" style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 700 }}>Set #{questionSet.id}</div>
                      <div className="ra-status">{questionSet.created_at}</div>
                      <div style={{ marginTop: 6 }}>{questionSet.prompt}</div>
                    </div>

                    {questions.length === 0 ? (
                      <div className="ra-card">No questions found in this set.</div>
                    ) : (
                      questions.map((q, idx) => (
                        <div key={q.id ?? idx} className="ra-q">
                          <div style={{ marginBottom: 6 }}>
                            <span className="kind">{q.kind}</span>
                            {q.reference && <span className="ref"> &nbsp;Ref: {q.reference}</span>}
                          </div>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>{idx + 1}. {q.text}</div>
                          {Array.isArray(q.options) && q.options.length > 0 && (
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {q.options.map((o, i) => <li key={i}>{o}</li>)}
                            </ul>
                          )}
                          {q.answer && <div style={{ marginTop: 6 }}><b>Answer:</b> {q.answer}</div>}
                          {q.explanation && <div style={{ marginTop: 4 }}><b>Why:</b> {q.explanation}</div>}
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
