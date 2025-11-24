import { useMemo, useRef, useState } from "react";
import { agentChat, uploadQuestionContext } from "../api";
import type { AgentChatMessage, QuestionContext } from "../types";

interface QwenChatWidgetProps {
  onNavigate?: (page: "landing" | "papers" | "notes" | "questions") => void;
}

export function QwenChatWidget({ onNavigate }: QwenChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<AgentChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm the Qwen agent. Ask me anything—I'll pick the right tool (web/news/arXiv/PDF/YouTube) and guide you to Research Library, Notes, or Question Sets when needed."
    }
  ]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const placeholder = useMemo(() => "Start chatting...", []);

  async function runTool() {
    if (!input.trim()) return;
    setBusy(true);
    const nextHistory = [...messages, { role: "user" as const, content: input.trim() }];
    setMessages(nextHistory);
    setInput("");
    try {
      const updated = await agentChat(nextHistory);
      setMessages(updated);
      // Detect new papers added by the agent and broadcast an event so other views can refresh.
      const addedPaperIds: number[] = [];
      updated
        .filter((m) => m.role === "tool" && typeof m.content === "string")
        .forEach((m) => {
          try {
            const parsed = JSON.parse(m.content);
            if (parsed && typeof parsed === "object" && typeof parsed.paper_id === "number") {
              addedPaperIds.push(parsed.paper_id);
            }
            if (parsed && typeof parsed === "object" && typeof parsed.note_id === "number") {
              window.dispatchEvent(new CustomEvent("qwen:note-added", { detail: { noteId: parsed.note_id } }));
            }
            if (parsed && typeof parsed === "object" && parsed.markdown && parsed.download === true) {
              triggerDownload(parsed.markdown, parsed.filename || "question-set.md");
            }
            if (parsed && parsed.action === "open_md_editor") {
              onNavigate?.("questions");
            }
          } catch {
            /* ignore malformed JSON */
          }
        });
      if (addedPaperIds.length > 0 && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("qwen:paper-added", { detail: { paperIds: addedPaperIds } })
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function triggerDownload(markdown: string, filename: string) {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleFileSelect(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    const file = fileList[0];
    setUploading(true);
    try {
      const ctx: QuestionContext = await uploadQuestionContext(file);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Uploaded ${ctx.filename} for question generation. Ask me to generate questions when ready.`,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Upload failed: ${err?.message || "Unknown error"}` },
      ]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <button
        className="qwen-chat-fab"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Qwen assistant"
      >
        {open ? "×" : "💬"}
      </button>

      {open && (
        <div className="qwen-chat-panel">
          <header className="qwen-chat-head">
            <div>
              <strong>Qwen Agent</strong>
              <p className="muted small">Tool-aware assistant</p>
            </div>
            <div className="qwen-head-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setMessages((prev) => prev.slice(0, 1))}
              >
                Reset
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                Minimize
              </button>
            </div>
          </header>

          <div className="qwen-quick-links">
            <span>Jump to:</span>
            <button type="button" onClick={() => onNavigate?.("papers")}>
              Research Library
            </button>
            <button type="button" onClick={() => onNavigate?.("notes")}>
              Note Editor
            </button>
            <button type="button" onClick={() => onNavigate?.("questions")}>
              Question Sets
            </button>
          </div>

          <div className="qwen-log">
            {messages
              .filter((m) => m.role !== "tool")
              .map((m, idx) => {
              const label = m.role === "user" ? "You" : m.role === "assistant" ? "Qwen" : m.name || "Tool";
              return (
                <div key={idx} className={`qwen-msg ${m.role}`}>
                  <div className="qwen-msg-role">{label}</div>
                  <pre>{m.content}</pre>
                </div>
              );
            })}
          </div>

          <div className="qwen-controls">
            <div className="qwen-input-row">
              <div className="qwen-input-left">
                <button
                  className="qwen-attach-btn"
                  type="button"
                  title="Attach PDF/PPTX for question generation"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  📎
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.ppt,.pptx"
                  style={{ display: "none" }}
                  onChange={(e) => handleFileSelect(e.target.files)}
                />
              </div>
              <input
                className="qwen-input"
                placeholder={placeholder}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) {
                    runTool();
                  }
                }}
                disabled={busy}
              />
              <button className="qwen-send-btn" type="button" onClick={runTool} disabled={busy}>
                {busy ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
