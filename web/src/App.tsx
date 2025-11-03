import React, { useEffect, useMemo, useRef, useState } from "react";

const RA_THEME = `
:root{
  --ra-bg:#ffffff;
  --ra-panel:#ffffff;
  --ra-text:#1f2937;
  --ra-heading:#111827;
  --ra-muted:#6b7280;
  --ra-border:rgba(0,0,0,0.12);
  --ra-elev:rgba(17,24,39,0.06);
  --ra-primary:#3b82f6;
  --ra-danger:#ef4444;
  --ra-soft-blue:rgba(59,130,246,0.12);
  --ra-soft-red:rgba(239,68,68,0.12);
  --ra-hover:rgba(0,0,0,0.04);
  --ra-focus:#c7d2fe;
  --ra-divider:rgba(0,0,0,0.08);
}

html, body { background: transparent; }
.ra-root{
  font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
  color: var(--ra-text);
}

/* Single outer card containing both columns */
.ra-outer{
  background: var(--ra-panel);
  border: 1px solid var(--ra-border);
  border-radius: 18px;
  box-shadow: 0 10px 24px var(--ra-elev);
  padding: 20px;
  max-height: 100vh;     /* your preference */
  overflow: hidden;      /* inner content scrolls */
}

/* Two-column grid */
.ra-shell{
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 28px;
  align-items: start;
}

/* Right column always carries the divider */
.ra-col-right{
  border-left: 1px solid var(--ra-divider);
  padding-left: 28px;
  display: flex;
  flex-direction: column;
  min-height: 240px;
}

/* Headers & actions */
.ra-h1{
  font-size: 20px;
  font-weight: 700;
  color: var(--ra-heading);
  margin: 0 0 6px 0;
}
.ra-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom: 12px;
}
.ra-actions{ display:flex; gap:10px; flex-wrap:wrap; }

/* Buttons */
.ra-btn{
  appearance:none;
  border:1px solid var(--ra-border);
  background:#fff;
  color:var(--ra-heading);
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, transform .02s ease, opacity .15s ease;
}
.ra-btn:hover{ background: var(--ra-hover); }
.ra-btn:active{ transform: translateY(1px); }
.ra-btn:focus{ outline: 2px solid var(--ra-focus); outline-offset: 1px; }
.ra-btn:disabled{ opacity:.5; cursor:not-allowed; }
.ra-btn.link{
  border-color: transparent;
  background: transparent;
  padding-left:0; padding-right:0;
  font-weight: 700;
}
.ra-btn.soft-primary{
  background: var(--ra-soft-blue);
  border-color: rgba(59,130,246,0.25);
  color: #1e40af;
}
.ra-btn.soft-danger{
  background: var(--ra-soft-red);
  border-color: rgba(239,68,68,0.25);
  color: #7f1d1d;
}

/* Generic cards/list items */
.ra-card{
  background: #fff;
  border: 1px solid var(--ra-border);
  border-radius: 16px;
  box-shadow: 0 6px 16px var(--ra-elev);
  padding: 16px;
}
.ra-card + .ra-card{ margin-top: 12px; }

.ra-list{ margin:0; padding:0; list-style:none; }
.ra-list-item{
  padding: 12px 14px;
  margin: 8px 0;
  border: 1px solid var(--ra-border);
  border-radius: 14px;
  background: #fff;
  transition: background .15s ease, border-color .15s ease, transform .04s ease;
  cursor: pointer;
}
.ra-list-item:hover{ background: var(--ra-hover); }
.ra-list-item.active{
  background: rgba(59,130,246,0.08);
  border-color: rgba(59,130,246,0.35);
}
.ra-list-item .title{
  color: var(--ra-heading);
  font-weight: 700;
  letter-spacing: -0.01em;
}
.ra-note-count{
  margin-top: 4px;
  font-size: 12px;
  color: var(--ra-muted);
}

/* Library (read) notes column scroll area */
.ra-notes-content{
  margin-top: 8px;
  overflow: auto;
  max-height: 88vh;   /* your preference */
  padding-right: 6px;
}
.ra-note-title{ font-weight: 800; color: var(--ra-heading); margin: 0 0 4px 0; }
.ra-note-date{ font-size: 12px; color: var(--ra-muted); margin-bottom: 10px; }
.ra-note-body{ white-space: pre-wrap; }

/* EDIT MODE styles (2 columns total) */
.ra-note-list{
  overflow: auto;
  max-height: 88vh;
}
.ra-note-row{
  padding: 10px 12px;
  margin: 8px 0;
  border: 1px solid var(--ra-border);
  border-radius: 12px;
  background: #f8fafc;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
.ra-note-row:hover{ background: var(--ra-hover); }
.ra-note-row.active{
  background: rgba(59,130,246,0.08);
  border-color: rgba(59,130,246,0.35);
}
.ra-note-row .t{ font-weight: 700; color: var(--ra-heading); }
.ra-note-row .d{ font-size: 12px; color: var(--ra-muted); }

.ra-editor-pane{
  display:flex; flex-direction:column;
  overflow: auto;
  max-height: 88vh;  /* keep editor scrolling inside */
}
.ra-input{
  width: 100%;
  border: 1px solid var(--ra-border);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 15px;
}
.ra-input:focus{ outline: 2px solid var(--ra-focus); outline-offset: 1px; }
.ra-textarea{
  width: 100%;
  min-height: 220px;
  border: 1px solid var(--ra-border);
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  resize: vertical;
}
.ra-textarea:focus{ outline: 2px solid var(--ra-focus); outline-offset: 1px; }
.ra-status{ font-size:12px; color: var(--ra-muted); }
`;

/* ---------- Types ---------- */
type PaperRow = {
  id: number;
  title: string;
  source_url?: string | null;
  note_count?: number;
};
type NoteRow = {
  id: number;
  paper_id: number;
  title?: string | null;
  body: string;
  created_at?: string;
};

/* ---------- OpenAI Apps SDK shims ---------- */
declare global {
  interface Window {
    openai?: {
      callTool?: (name: string, args?: any) => Promise<any>;
      sendFollowUpMessage?: (payload: any) => Promise<void>;
      onStructuredContent?: (cb: (data: any) => void) => () => void;
      structuredContent?: any;
      toolOutput?: any;
    };
  }
}

/* Normalize initial structured content */
function normalizeStructured(sc: any): {
  papers: PaperRow[];
  notesByPaper: Record<string, NoteRow[]>;
} | null {
  if (!sc || typeof sc !== "object") return null;
  const papers = Array.isArray(sc.papers) ? sc.papers : [];
  const raw = sc.notesByPaper && typeof sc.notesByPaper === "object" ? sc.notesByPaper : {};
  const map: Record<string, NoteRow[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    map[k] = Array.isArray(v) ? (v as NoteRow[]) : [];
  }
  return { papers, notesByPaper: map };
}

/* Small debounce for autosave */
function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay: number) {
  const ref = useRef<number | undefined>();
  return (...args: Parameters<T>) => {
    window.clearTimeout(ref.current);
    ref.current = window.setTimeout(() => fn(...args), delay);
  };
}

/* ---------- App ---------- */
export default function App() {
  const [data, setData] = useState<{ papers: PaperRow[]; notesByPaper: Record<string, NoteRow[]> }>(() => {
    const seed =
      normalizeStructured(window.openai?.structuredContent) ??
      normalizeStructured(window.openai?.toolOutput?.structuredContent) ??
      { papers: [], notesByPaper: {} };
    return seed;
  });
  const [selectedId, setSelectedId] = useState<number | null>(() => data.papers[0]?.id ?? null);

  const [editorOpen, setEditorOpen] = useState(false);              // toggles Library vs Edit Notes modes
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saveState, setSaveState] = useState<"idle"|"saving"|"saved">("idle");

  const selectedNotes = useMemo(() => {
    if (selectedId == null) return [];
    return data.notesByPaper[String(selectedId)] ?? [];
  }, [data, selectedId]);
  const selectedPaper = useMemo(() => data.papers.find(p => p.id === selectedId) ?? null, [data, selectedId]);

  // subscribe to live pushes
  useEffect(() => {
    const off = window.openai?.onStructuredContent?.((sc: any) => {
      const next = normalizeStructured(sc);
      if (next) {
        setData(next);
        if (next.papers.length > 0 && (selectedId == null || !next.papers.some(p => p.id === selectedId))) {
          setSelectedId(next.papers[0].id);
        }
      }
    });
    return () => { if (typeof off === "function") off(); };
  }, [selectedId]);

  async function refresh() {
    const out = await window.openai?.callTool?.("render_library", {});
    const sc = normalizeStructured(out?.structuredContent ?? out);
    if (sc) setData(sc);
  }

  // ---------- Edit Notes helpers ----------
  function enterEditor(openNote?: NoteRow) {
    setEditorOpen(true);
    if (openNote) {
      setActiveNoteId(openNote.id);
      setDraftTitle(openNote.title || "");
      setDraftBody(openNote.body || "");
    } else {
      setActiveNoteId(null);
      setDraftTitle(selectedPaper?.title || "Untitled");
      setDraftBody("");
    }
    setSaveState("idle");
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
    if (!selectedId) return;
    setSaveState("saving");
    try {
      const args: any = { paper_id: selectedId, title: payload.title, body: payload.body };
      if (activeNoteId != null) args.note_id = activeNoteId;
      const res = await window.openai?.callTool?.("save_note_tool", args);
      if (res && res.structuredContent && res.structuredContent.note && typeof res.structuredContent.note.id === "number") {
        setActiveNoteId(res.structuredContent.note.id);
      }
      setSaveState("saved");
      await refresh();
    } catch {
      setSaveState("idle");
    }
  }, 700);

  function onTitleChange(v: string) {
    setDraftTitle(v);
    debouncedAutosave({ title: v, body: draftBody });
  }
  function onBodyChange(v: string) {
    setDraftBody(v);
    debouncedAutosave({ title: draftTitle, body: v });
  }

  async function deleteActiveNote() {
    if (activeNoteId == null) return;
    try {
      await window.openai?.callTool?.("delete_note_tool", { note_id: activeNoteId });
      setActiveNoteId(null);
      setDraftTitle(selectedPaper?.title || "");
      setDraftBody("");
      await refresh();
    } catch {}
  }

  async function addNewNote() { enterEditor(undefined); }

  // Summarize: save note with paper title then open editor on the newest note
  async function summarizeCurrent() {
    if (!selectedId) return;
    if (window.openai?.sendFollowUpMessage) {
      await window.openai.sendFollowUpMessage({
        role: "user",
        content: [{ type: "text", text: `Summarize the paper with id ${selectedId} and save a note titled with the paper's title.` }],
      });
    } else {
      await window.openai?.callTool?.("summarize_paper_tool", { paper_id: selectedId });
    }
    await refresh();
    // Open editor to newest note
    const newest = (data.notesByPaper[String(selectedId)] ?? [])[0];
    enterEditor(newest);
  }

  // ---------- Render ----------
  return (
    <div className="ra-root">
      <style>{RA_THEME}</style>

      <div className="ra-outer">
        {!editorOpen ? (
          /* ================== Library Mode ================== */
          <div className="ra-shell">
            {/* Left: Research papers */}
            <section>
              <div className="ra-head">
                <h1 className="ra-h1">Research Papers</h1>
                <div className="ra-actions">
                  <button className="ra-btn link" onClick={refresh}>Refresh</button>
                  <button
                    className="ra-btn soft-danger"
                    onClick={async () => {
                      if (!selectedId) return;
                      await window.openai?.callTool?.("delete_paper_tool", { paper_id: selectedId });
                      await refresh();
                    }}
                    disabled={!selectedId}
                  >
                    Delete
                  </button>
                  <button
                    className="ra-btn soft-primary"
                    onClick={async () => {
                      await window.openai?.sendFollowUpMessage?.({
                        role: "user",
                        content: [{ type: "input_text", text: "Add a paper (paste DOI / landing page / PDF link):" }],
                      });
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <ul className="ra-list" role="list">
                {data.papers.map(p => {
                  const count = p.note_count ?? (data.notesByPaper[String(p.id)]?.length ?? 0);
                  return (
                    <li
                      key={p.id}
                      className={`ra-list-item ${selectedId === p.id ? "active" : ""}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <div className="title">{p.title || "Untitled paper"}</div>
                      <div className="ra-note-count">{count} note{count === 1 ? "" : "s"}</div>
                    </li>
                  );
                })}
                {data.papers.length === 0 && (
                  <li className="ra-card">No papers yet. Click <b>Add</b> to paste a DOI, landing page, or direct PDF URL.</li>
                )}
              </ul>
            </section>

            {/* Right: Notes (read) */}
            <section className="ra-col-right">
              <div className="ra-head">
                <h1 className="ra-h1">Notes</h1>
                <div className="ra-actions">
                  <button className="ra-btn link" onClick={refresh}>Refresh</button>
                  <button className="ra-btn soft-primary" onClick={summarizeCurrent} disabled={!selectedId}>Summarize this paper</button>
                  <button className="ra-btn" onClick={() => enterEditor(selectedNotes[0])} disabled={!selectedId}>Edit Notes</button>
                </div>
              </div>

              <div className="ra-notes-content">
                {selectedId == null || selectedNotes.length === 0 ? (
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
          /* ================== Edit Notes Mode (two columns total) ================== */
          <div className="ra-shell">
            {/* Left: note titles list */}
            <section>
              <div className="ra-head">
                <h1 className="ra-h1">Notes — {selectedPaper?.title || "Untitled"}</h1>
                <div className="ra-actions">
                  <button className="ra-btn" onClick={exitEditor}>Back</button>
                  <button className="ra-btn" onClick={refresh}>Refresh</button>
                  <button className="ra-btn soft-primary" onClick={addNewNote} disabled={!selectedId}>Add</button>
                </div>
              </div>

              <div className="ra-note-list">
                {(selectedNotes.length === 0) && (
                  <div className="ra-card">No notes yet. Click <b>Add</b> to create one.</div>
                )}
                {selectedNotes.map(n => (
                  <div
                    key={n.id}
                    className={`ra-note-row ${activeNoteId === n.id ? "active" : ""}`}
                    onClick={() => pickNote(n)}
                  >
                    <div className="t">{n.title || "Untitled"}</div>
                    {n.created_at && <div className="d">{new Date(n.created_at).toLocaleString()}</div>}
                  </div>
                ))}
              </div>
            </section>

            {/* Right: editor pane (divider applied via ra-col-right) */}
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
                  <input
                    className="ra-input"
                    placeholder="Note title"
                    value={draftTitle}
                    onChange={(e) => onTitleChange(e.target.value)}
                  />
                </div>

                <div className="ra-card">
                  <textarea
                    className="ra-textarea"
                    placeholder="Write your note…"
                    value={draftBody}
                    onChange={(e) => onBodyChange(e.target.value)}
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
