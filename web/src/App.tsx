import React, { useEffect, useState } from "react";

declare global {
  interface Window {
    openai: {
      callTool: (name: string, args?: any) => Promise<any>;
      sendFollowUpMessage?: (content: any) => Promise<void>;
      toolOutput?: any;
    };
  }
}

type Paper = { id: number; title: string; source_url?: string; note_count?: number };

export default function App() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [input, setInput] = useState("");

  async function refresh() {
    const res = await window.openai.callTool("render_library");
    const sc = res?.structuredContent ?? window.openai.toolOutput;
    setPapers(sc?.papers ?? []);
  }

  async function addPaper() {
    if (!input.trim()) return;
    await window.openai.callTool("add_paper_tool", { input_str: input });
    setInput("");
    await refresh();
  }

  async function remove(paper_id: number) {
    await window.openai.callTool("delete_paper_tool", { paper_id });
    await refresh();
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div style={{ padding: 12, fontFamily: "system-ui" }}>
      <h3>Research Library (Python)</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Paste DOI / PDF URL / landing page"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={addPaper}>Add</button>
        <button onClick={refresh}>Refresh</button>
      </div>
      <ul style={{ padding: 0 }}>
        {papers.map(p => (
          <li key={p.id} style={{ listStyle: "none", padding: 8, border: "1px solid #eee", marginBottom: 8, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{p.title}</strong>
                {p.note_count ? <span style={{ marginLeft: 8, opacity:.6 }}>· {p.note_count} note(s)</span> : null}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => remove(p.id)}>Delete</button>
              </div>
            </div>
          </li>
        ))}
        {!papers.length && <div>No papers yet.</div>}
      </ul>
    </div>
  );
}
