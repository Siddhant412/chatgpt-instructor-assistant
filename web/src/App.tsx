import React from "react";

const RA_THEME = `
:root{
  --ra-bg:#0b0f14;
  --ra-panel:#11161d;
  --ra-card:#131a23;
  --ra-border:rgba(255,255,255,0.10);
  --ra-elev:rgba(0,0,0,0.30);
  --ra-text:#e9edf3;
  --ra-heading:#ffffff;
  --ra-muted:#aab4c2;
  --ra-accent:#7aa2ff;
  --ra-success:#5fe1a5;
  --ra-danger:#ff6b6b;
  --ra-focus:#b3d3ff;
}
html, body { background: transparent; }
.ra-root{ font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial; color:var(--ra-text); }
.ra-grid{ display:grid; grid-template-columns: 360px 1fr; gap:16px; }
.ra-root h1,.ra-root h2,.ra-root h3{ color:var(--ra-heading); letter-spacing:.2px; margin:0 0 6px; }
.ra-muted{ color:var(--ra-muted); }
.ra-title{ font-weight:700; font-size:22px; }

/* Cards */
.ra-card{ background:var(--ra-card); border:1px solid var(--ra-border); border-radius:16px; box-shadow:0 4px 18px var(--ra-elev); padding:16px; }
.ra-card.section{ padding:18px; }
.ra-card + .ra-card{ margin-top:12px; }

/* List (papers) */
.ra-list{ margin:0; padding:0; list-style:none; }
.ra-list-item{ padding:10px 12px; margin:6px 0; border:1px solid var(--ra-border); border-radius:12px; background:rgba(255,255,255,0.02); cursor:pointer; transition:background .15s ease, border-color .15s ease, transform .04s ease; }
.ra-list-item:hover{ background:rgba(255,255,255,0.05); }
.ra-list-item.active{ background:linear-gradient(180deg, rgba(122,162,255,.20), rgba(122,162,255,.06)); border-color:rgba(122,162,255,.5); transform: translateY(-1px); }
.ra-list-item .title{ color:var(--ra-heading); font-weight:600; }
.ra-badge{ display:inline-flex; align-items:center; justify-content:center; background:rgba(122,162,255,.18); border-radius:10px; padding:0 6px; font-size:12px; color:var(--ra-accent); margin-left:8px; }

/* Buttons */
.ra-btn{ appearance:none; border:1px solid var(--ra-border); background:rgba(255,255,255,.04); color:var(--ra-heading); border-radius:12px; padding:8px 12px; font-weight:600; cursor:pointer; transition: transform .04s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease; }
.ra-btn:hover{ background:rgba(255,255,255,.07); }
.ra-btn:active{ transform: translateY(1px); }
.ra-btn:focus-visible{ outline:none; box-shadow:0 0 0 3px var(--ra-focus); border-color:var(--ra-focus); }
.ra-btn[disabled]{ opacity:.55; cursor:not-allowed; }
.ra-btn-primary{ background: linear-gradient(180deg, rgba(122,162,255,.35), rgba(122,162,255,.18)); border-color: rgba(122,162,255,.6); }
.ra-btn-primary:hover{ background: linear-gradient(180deg, rgba(122,162,255,.45), rgba(122,162,255,.22)); }
.ra-btn-outline{ background: transparent; border-color: var(--ra-border); }
.ra-btn-success{ background: linear-gradient(180deg, rgba(95,225,165,.35), rgba(95,225,165,.18)); border-color: rgba(95,225,165,.55); }
.ra-btn-danger{ background: linear-gradient(180deg, rgba(255,107,107,.35), rgba(255,107,107,.18)); border-color: rgba(255,107,107,.55); }
.ra-btn-danger:hover{ background: linear-gradient(180deg, rgba(255,107,107,.45), rgba(255,107,107,.22)); }

/* Header bar (each column) */
.ra-bar{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }

/* Inline add form */
.ra-add{ display:flex; gap:8px; margin-top:10px; }
.ra-input{
  flex:1 1 auto;
  padding:10px 12px;
  border-radius:10px;
  border:1px solid var(--ra-border);
  background:rgba(255,255,255,.03);
  color:var(--ra-text);
}
.ra-input::placeholder{ color:var(--ra-muted); }

/* Notes */
.ra-note-title{ font-weight:700; margin:10px 0 6px; }
.ra-note-time{ font-size:12px; color:var(--ra-muted); margin-bottom:8px; }
.ra-note-body p{ margin:8px 0; }
.ra-note-body ul{ margin:8px 0 8px 18px; }
.ra-note-body li{ margin: 4px 0; }

/* Scroll areas */
.ra-scroll{ max-height: 520px; overflow:auto; scrollbar-width: thin; }
.ra-scroll::-webkit-scrollbar { height: 6px; width: 8px; }
.ra-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 8px; }
`;

type PaperRow = { id: number | string; title: string; source_url?: string; note_count?: number };
type NoteRow = { id: number | string; paper_id: number | string; title?: string | null; body: string; created_at?: string | null };
type Structured = { papers: PaperRow[]; notesByPaper: Record<string, NoteRow[]> };

declare global {
  interface Window {
    openai: {
      callTool?: (name: string, args?: any) => Promise<any>;
      sendFollowUpMessage?: (payload: any) => Promise<void>;
      onStructuredContent?: (cb: (data: any) => void) => () => void;
      structuredContent?: any;
      toolOutput?: any;
    };
  }
}

function normalizeStructured(sc: any): Structured | null {
  if (!sc || typeof sc !== "object") return null;
  const papers = Array.isArray(sc.papers) ? sc.papers : [];
  const notesSrc = sc.notesByPaper && typeof sc.notesByPaper === "object" ? sc.notesByPaper : {};
  const notesByPaper: Record<string, NoteRow[]> = {};
  for (const [key, value] of Object.entries(notesSrc)) {
    if (!Array.isArray(value)) continue;
    notesByPaper[String(key)] = value.map((n: any) => ({
      id: n?.id ?? String(Math.random()),
      paper_id: n?.paper_id ?? key,
      title: n?.title ?? null,
      body: typeof n?.body === "string" ? n.body : "",
      created_at: n?.created_at ?? null,
    }));
  }
  return { papers, notesByPaper };
}

function useResearchAppTheme() {
  React.useEffect(() => {
    const host = document.getElementById("root") as HTMLElement | null;
    const target: ShadowRoot | HTMLElement | null = (host && (host as any).shadowRoot) || document.head;
    if (!target) return;
    const getById = (n: string) => ("getElementById" in target ? (target as any).getElementById(n) : document.getElementById(n));
    if (getById("ra-theme")) return;
    const style = document.createElement("style");
    (style as any).id = "ra-theme";
    style.textContent = RA_THEME;
    (target as any).appendChild(style);
  }, []);
}

export default function App() {
  useResearchAppTheme();

  const [data, setData] = React.useState<Structured>({ papers: [], notesByPaper: {} });
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [addMode, setAddMode] = React.useState(false);
  const [addUrl, setAddUrl] = React.useState("");

  const papers = data.papers ?? [];

  const updateFromStructured = React.useCallback((sc: any) => {
    const normalized = normalizeStructured(sc);
    if (!normalized) return;
    setData(normalized);
    if (!normalized.papers.length) {
      setSelectedId(null);
      return;
    }
    const firstId = String(normalized.papers[0]?.id);
    setSelectedId(prev => (prev && normalized.papers.some(p => String(p.id) === prev) ? prev : firstId));
  }, []);

  const fetchAndSetLibrary = React.useCallback(async () => {
    try {
      if (!window.openai?.callTool) return;
      const res = await window.openai.callTool("render_library", {});
      const sc = res?.structuredContent ?? window.openai?.toolOutput ?? {};
      updateFromStructured(sc);
    } catch (err) {
      console.error("render_library failed:", err);
    }
  }, [updateFromStructured]);

  React.useEffect(() => {
    const immediate = window.openai?.structuredContent ?? window.openai?.toolOutput;
    if (immediate) updateFromStructured(immediate);
    fetchAndSetLibrary();

    let dispose: (() => void) | undefined;
    try {
      dispose = window.openai?.onStructuredContent?.((sc: any) => updateFromStructured(sc));
    } catch (err) {
      console.warn("onStructuredContent hook not available", err);
    }

    const handleGlobals = () => {
      const next = window.openai?.structuredContent ?? window.openai?.toolOutput;
      if (next) updateFromStructured(next);
    };
    window.addEventListener("openai:set_globals", handleGlobals);
    return () => {
      dispose?.();
      window.removeEventListener("openai:set_globals", handleGlobals);
    };
  }, [fetchAndSetLibrary, updateFromStructured]);

  const currentPaper = React.useMemo(() => {
    if (!selectedId) return null;
    return papers.find(p => String(p.id) === selectedId) ?? null;
  }, [papers, selectedId]);

  const notes = React.useMemo(() => {
    if (!selectedId) return [] as NoteRow[];
    return data.notesByPaper[String(selectedId)] ?? [];
  }, [data.notesByPaper, selectedId]);

  const onAddSubmit = async () => {
    const value = addUrl.trim();
    if (!value || !window.openai?.callTool) return;
    try {
      await window.openai.callTool("add_paper_tool", { input_str: value });
      setAddUrl("");
      setAddMode(false);
      await fetchAndSetLibrary();
    } catch (err) {
      console.error("add_paper_tool failed:", err);
    }
  };

  const onDelete = async () => {
    if (!selectedId || !window.openai?.callTool) return;
    try {
      await window.openai.callTool("delete_paper_tool", { paper_id: Number(selectedId) });
      setSelectedId(null);
      await fetchAndSetLibrary();
    } catch (err) {
      console.error("delete_paper_tool failed:", err);
    }
  };

  const summarize = async () => {
    if (!currentPaper) return;
    const pid = Number(currentPaper.id);
    if (Number.isNaN(pid)) return;

    const summaryTitle = `Summary — ${currentPaper.title}`;

    if (window.openai?.sendFollowUpMessage) {
      try {
        await window.openai.sendFollowUpMessage({
          prompt: `You are assisting in a research library app with these tools:
- render_library
- add_paper_tool
- index_paper_tool
- get_paper_chunk_tool
- save_note_tool
- delete_paper_tool

Goal: Create a structured summary for paper id ${pid} (title: ${JSON.stringify(currentPaper.title)}).
Steps:
1. If sections are missing, call index_paper_tool { "paper_id": ${pid} }.
2. Read the sections you need via get_paper_chunk_tool.
3. Write a 250-400 word narrative summary plus 5 key takeaways and 3 limitations (each bullet starts with "- ").
4. Save the note only via save_note_tool {
     "paper_id": ${pid},
     "title": ${JSON.stringify(summaryTitle)},
     "body": "<your formatted summary, bullets, and limitations>"
   }.
Important: Use only the supplied section text. Do NOT output the summary in the chat message—after saving the note, reply briefly that the summary was saved.`,
        });
        return;
      } catch (err) {
        console.error("sendFollowUpMessage summarize flow failed:", err);
      }
    }

    if (window.openai?.callTool) {
      try {
        await window.openai.callTool("summarize_paper_tool", { paper_id: pid });
        await fetchAndSetLibrary();
      } catch (err) {
        console.error("summarize_paper_tool fallback failed:", err);
      }
    }
  };

  return (
    <div className="ra-root">
      <div className="ra-grid">
        <div className="ra-card section">
          <div className="ra-bar">
            <h2 className="ra-title">Research Papers</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ra-btn ra-btn-outline" onClick={fetchAndSetLibrary}>Refresh</button>
              <button className="ra-btn ra-btn-danger" onClick={onDelete} disabled={!currentPaper}>Delete</button>
              <button className="ra-btn ra-btn-primary" onClick={() => setAddMode(v => !v)}>
                {addMode ? "Close" : "Add"}
              </button>
            </div>
          </div>

          {addMode && (
            <div className="ra-add">
              <input
                className="ra-input"
                placeholder="Paste Title, DOI or landing page"
                value={addUrl}
                onChange={e => setAddUrl(e.target.value)}
              />
              <button className="ra-btn ra-btn-success" onClick={onAddSubmit}>Add</button>
            </div>
          )}

          <div className="ra-scroll" style={{ marginTop: addMode ? 8 : 0 }}>
            <ul className="ra-list">
              {papers.length === 0 && (
                <li className="ra-muted">No papers yet. Click “Add”.</li>
              )}
              {papers.map((p) => {
                const pid = String(p.id);
                return (
                  <li
                    key={pid}
                    className={`ra-list-item ${selectedId === pid ? "active" : ""}`}
                    onClick={() => setSelectedId(pid)}
                    title={p.title}
                  >
                    <div className="title">{p.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {p.note_count ? `${p.note_count} note${p.note_count === 1 ? "" : "s"}` : "No notes yet"}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="ra-card section">
          <div className="ra-bar">
            <h2 className="ra-title">Notes</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ra-btn ra-btn-outline" onClick={fetchAndSetLibrary}>Refresh</button>
              <button className="ra-btn ra-btn-primary" onClick={summarize} disabled={!currentPaper}>
                Summarize this paper
              </button>
            </div>
          </div>

          {!currentPaper && <div className="ra-muted">Select a paper to see notes.</div>}

          {currentPaper && (
            <div className="ra-scroll">
              {notes.length === 0 ? (
                <div className="ra-card" style={{ background: "rgba(255,255,255,.02)" }}>
                  <div className="ra-muted">No notes yet for this paper.</div>
                </div>
              ) : (
                notes.map((n) => (
                  <div className="ra-card" key={String(n.id)}>
                    <div className="ra-note-title">{n.title || "Note"}</div>
                    <div className="ra-note-time">
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                    </div>
                    <div className="ra-note-body">{renderMarkdownLite(n.body)}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderMarkdownLite(md: string) {
  const safe = typeof md === "string" ? md : "";
  let html = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n{2,}/g, "\n\n");
  const blocks = html.split(/\n\s*\n/);
  const nodes = blocks.map((blk, i) => {
    const lines = blk.split("\n");
    const isList = lines.every(l => /^(\u2022|-)\s+/.test(l.trim()));
    if (isList) {
      return (
        <ul key={i}>
          {lines.map((l, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: l.replace(/^(\u2022|-)\s+/, "") }} />
          ))}
        </ul>
      );
    }
    return <p key={i} dangerouslySetInnerHTML={{ __html: blk }} />;
  });
  return <>{nodes}</>;
}
