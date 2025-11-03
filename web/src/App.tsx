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
.ra-outer{ background:var(--ra-panel); border:1px solid var(--ra-border); border-radius:18px; box-shadow:0 10px 24px var(--ra-elev); padding:20px; max-height:100vh; overflow:hidden; }
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
.ra-notes-content{ margin-top:8px; overflow:auto; max-height:88vh; padding-right:6px; }
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
`;

type PaperRow = { id: number; title: string; source_url?: string | null; note_count?: number };
type NoteRow = { id: number; paper_id: number | null; title?: string | null; body: string; created_at?: string; paper_title?: string | null };

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
  const [data, setData] = useState<{ papers: PaperRow[]; notesByPaper: Record<string, NoteRow[]> }>(() =>
    normalizeStructured(window.openai?.structuredContent) ??
    normalizeStructured(window.openai?.toolOutput?.structuredContent) ?? { papers: [], notesByPaper: {} }
  );
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(() => data.papers[0]?.id ?? null);

  // Inline "Add paper" UI state
  const [addPaperOpen, setAddPaperOpen] = useState(false);
  const [addPaperValue, setAddPaperValue] = useState("");
  const [addingPaper, setAddingPaper] = useState(false);
  const [addPaperErr, setAddPaperErr] = useState<string | null>(null);

  // Edit Notes mode (independent)
  const [editorOpen, setEditorOpen] = useState(false);
  const [allNotes, setAllNotes] = useState<NoteRow[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saveState, setSaveState] = useState<"idle"|"saving"|"saved">("idle");
  const [addingNote, setAddingNote] = useState(false);

  const selectedNotes = useMemo(() => {
    if (selectedPaperId == null) return [];
    return data.notesByPaper[String(selectedPaperId)] ?? [];
  }, [data, selectedPaperId]);

  const selectedPaper = useMemo(
    () => data.papers.find(p => p.id === selectedPaperId) ?? null,
    [data, selectedPaperId]
  );

  // subscribe for library pushes
  useEffect(() => {
    const off = window.openai?.onStructuredContent?.((sc: any) => {
      const next = normalizeStructured(sc);
      if (next) {
        setData(next);
        if (next.papers.length > 0 && (selectedPaperId == null || !next.papers.some(p => p.id === selectedPaperId))) {
          setSelectedPaperId(next.papers[0].id);
        }
      }
    });
    return () => { if (typeof off === "function") off(); };
  }, [selectedPaperId]);

  async function refreshLibrary() {
    const out = await window.openai?.callTool?.("render_library", {});
    const sc = normalizeStructured(out?.structuredContent ?? out);
    if (sc) setData(sc);
  }

  // ---------- Helpers: All notes (independent editor) ----------
  async function loadAllNotes(): Promise<NoteRow[]> {
    const out = await window.openai?.callTool?.("list_notes_tool", {});
    const notes = Array.isArray(out?.structuredContent?.notes) ? out.structuredContent.notes : [];
    setAllNotes(notes);
    return notes;
  }

  function enterEditor(openFirst = true) {
    setEditorOpen(true);
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
  function exitEditor() {
    setEditorOpen(false);
    setActiveNoteId(null);
    setSaveState("idle");
  }
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
      const args: any = { title: payload.title, body: payload.body };
      if (activeNoteId != null) args.note_id = activeNoteId;
      if (current && current.paper_id != null) args.paper_id = current.paper_id; // preserve link if it exists
      const res = await window.openai?.callTool?.("save_note_tool", args);
      const note = res?.structuredContent?.note;
      if (note && typeof note.id === "number") setActiveNoteId(note.id);
      setSaveState("saved");
      await loadAllNotes();
    } catch {
      setSaveState("idle");
    }
  }, 700);

  function onTitleChange(v: string) { setDraftTitle(v); debouncedAutosave({ title: v, body: draftBody }); }
  function onBodyChange(v: string) { setDraftBody(v); debouncedAutosave({ title: draftTitle, body: v }); }

  async function handleAddPaper() {
    setAddPaperErr(null);
    const val = (addPaperValue || "").trim();
    if (!val) { setAddPaperErr("Paste a DOI, landing page, or PDF link."); return; }
    setAddingPaper(true);
    try {
      await window.openai?.callTool?.("add_paper", { url: val });
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

  async function addNewNote() {
    setAddingNote(true);
    try {
      // Keep independent note creation via save_note_tool (paper_id can be null)
      const res = await window.openai?.callTool?.("save_note_tool", { title: "Untitled", body: "New note" });
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
  }

  async function deleteActiveNote() {
    if (activeNoteId == null) return;
    await window.openai?.callTool?.("delete_note_tool", { note_id: activeNoteId });
    const notes = await loadAllNotes();
    const first = notes[0];
    if (first) { pickNote(first); } else { setActiveNoteId(null); setDraftTitle("Untitled"); setDraftBody(""); }
  }

  // Summarization via follow-up message
  async function summarizeViaFollowUp(paperId: number, title: string) {
    const prompt = `
You are connected to a Research Notes App with these tools (use EXACT names and argument shapes):
- index_paper { "paperId": ${JSON.stringify(String(paperId))} }
- get_paper_chunk { "paperId": ${JSON.stringify(String(paperId))}, "sectionId": "<section id>" }
- save_note { "paperId": ${JSON.stringify(String(paperId))}, "title": ${JSON.stringify(title)}, "summary": "<final note body>" }

Goal:
1) Ensure the paper is indexed once using index_paper.
2) Read sections by calling get_paper_chunk for those most informative (e.g., Abstract, Intro, Methods, Results, Conclusion). You may sample up to ~12 sections if the paper is long.
3) Write a faithful 250–400 word narrative summary using ONLY retrieved text. Then add:
   - "Key takeaways:" with 5 bullets (each line starts with "- ").
   - "Limitations:" with 3 bullets (each line starts with "- ").
4) Save the note via save_note with:
   - paperId as above,
   - title equal to the exact paper title,
   - summary = the full note body (narrative + bullets).

Rules:
- Do NOT output the summary to chat; store it only via save_note.
- Do NOT call render_library; save_note already refreshes the UI.
- Keep claims strictly within retrieved content; no outside knowledge or invented facts.
- If some sections are noisy or duplicate, skip them.
`;
    if (window.openai?.sendFollowUpMessage) {
      await window.openai.sendFollowUpMessage({ prompt });
    } else {
      // Fallback to server summarize tool if sendFollowUpMessage is unavailable
      await window.openai?.callTool?.("summarize_paper_tool", { paper_id: paperId });
    }
  }

  // ---------- Library actions ----------
  async function summarizeCurrent() {
    if (!selectedPaperId || !selectedPaper) return;
    await summarizeViaFollowUp(selectedPaperId, selectedPaper.title || "Paper Summary");
    // No manual refresh needed; save_note returns structuredContent and onStructuredContent updates the UI.
  }

  // ---------- Render ----------
  return (
    <div className="ra-root">
      <style>{RA_THEME}</style>

      <div className="ra-outer">
        {!editorOpen ? (
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
                      <button
                        className="ra-btn soft-danger"
                        onClick={async () => {
                          if (!selectedPaperId) return;
                          await window.openai?.callTool?.("delete_paper_tool", { paper_id: selectedPaperId });
                          await refreshLibrary();
                        }}
                        disabled={!selectedPaperId}
                      >Delete</button>
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

            {/* Right: notes for the selected paper (read-only list) */}
            <section className="ra-col-right">
              <div className="ra-head">
                <h1 className="ra-h1">Notes</h1>
                <div className="ra-actions">
                  <button className="ra-btn link" onClick={refreshLibrary}>Refresh</button>
                  <button className="ra-btn soft-primary" onClick={summarizeCurrent} disabled={!selectedPaperId}>Summarize this paper</button>
                  <button className="ra-btn" onClick={() => enterEditor(true)}>Edit Notes</button>
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
        ) : (
          /* -------------------- Edit Notes Mode (Independent) -------------------- */
          <div className="ra-shell">
            {/* Left: all note titles */}
            <section>
              <div className="ra-head">
                <h1 className="ra-h1">All Notes</h1>
                <div className="ra-actions">
                  <button className="ra-btn" onClick={exitEditor}>Back</button>
                  <button className="ra-btn" onClick={loadAllNotes}>Refresh</button>
                  <button className="ra-btn soft-primary" onClick={addNewNote} disabled={addingNote}>{addingNote ? "Adding…" : "Add"}</button>
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

            {/* Right: editor for the active note */}
            <section className="ra-col-right">
              <div className="ra-head">
                <h1 className="ra-h1">Editor</h1>
                <div className="ra-actions">
                  <span className="ra-status">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}</span>
                  <button className="ra-btn soft-danger" onClick={deleteActiveNote} disabled={activeNoteId == null}>Delete</button>
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
        )}
      </div>
    </div>
  );
}
