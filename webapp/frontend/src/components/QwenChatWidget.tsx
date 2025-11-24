import React, { useMemo, useRef, useState } from "react";
import { agentChat, uploadQuestionContext } from "../api";
import type { AgentChatMessage, QuestionContext, YoutubeSearchResult, WebSearchResult, NewsResult, ArxivSearchResult } from "../types";

interface QwenChatWidgetProps {
  onNavigate?: (page: "landing" | "papers" | "notes" | "questions" | "qwen") => void;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "Unknown";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatViewCount(count: number): string {
  if (!count) return "Unknown views";
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(2)}M views`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K views`;
  }
  return `${count} views`;
}

function stripHtml(html: string): string {
  if (!html) return "";
  // Remove HTML tags and decode HTML entities
  return html
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ") // Replace &nbsp; with space
    .replace(/&amp;/g, "&") // Decode &amp;
    .replace(/&lt;/g, "<") // Decode &lt;
    .replace(/&gt;/g, ">") // Decode &gt;
    .replace(/&quot;/g, '"') // Decode &quot;
    .replace(/&#39;/g, "'") // Decode &#39;
    .trim();
}

function formatToolResult(message: AgentChatMessage): React.ReactNode {
  if (message.role !== "tool" || !message.name) {
    return message.content;
  }

  try {
    const data = JSON.parse(message.content);
    
    // Format YouTube search results
    if (message.name === "youtube_search" && "videos" in data) {
      const result = data as YoutubeSearchResult;
      return (
        <div className="tool-result youtube-results">
          <div className="tool-result-header">Found {result.videos.length} video{result.videos.length !== 1 ? "s" : ""} for "{result.query}"</div>
          <ol className="tool-result-list">
            {result.videos.map((video, idx) => (
              <li key={idx} className="tool-result-item">
                <div className="tool-result-title">
                  <a href={video.url} target="_blank" rel="noopener noreferrer" className="tool-result-link">
                    {video.title}
                  </a>
                </div>
                <div className="tool-result-meta">
                  {video.channel && <span className="tool-result-channel">{video.channel}</span>}
                  <span className="tool-result-duration">{formatDuration(video.duration)}</span>
                  <span className="tool-result-views">{formatViewCount(video.view_count)}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      );
    }

    // Format web search results
    if (message.name === "web_search" && "results" in data) {
      const result = data as WebSearchResult;
      return (
        <div className="tool-result web-results">
          <div className="tool-result-header">Found {result.results.length} result{result.results.length !== 1 ? "s" : ""} for "{result.query}"</div>
          <ol className="tool-result-list">
            {result.results.map((item, idx) => (
              <li key={idx} className="tool-result-item">
                <div className="tool-result-title">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="tool-result-link">
                    {item.title}
                  </a>
                </div>
                {item.snippet && (
                  <div className="tool-result-snippet">{item.snippet}</div>
                )}
              </li>
            ))}
          </ol>
        </div>
      );
    }

    // Format news results
    if (message.name === "get_news" && "articles" in data) {
      const result = data as NewsResult;
      return (
        <div className="tool-result news-results">
          <div className="tool-result-header">Found {result.articles.length} article{result.articles.length !== 1 ? "s" : ""} about "{result.topic}"</div>
          <ol className="tool-result-list">
            {result.articles.map((article, idx) => (
              <li key={idx} className="tool-result-item">
                <div className="tool-result-title">
                  <a href={article.link} target="_blank" rel="noopener noreferrer" className="tool-result-link">
                    {article.title}
                  </a>
                </div>
                {(article.published || article.source) && (
                  <div className="tool-result-meta">
                    {article.source && <span className="tool-result-source">{article.source}</span>}
                    {article.published && <span className="tool-result-date">{article.published}</span>}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      );
    }

    // Format arXiv search results
    if (message.name === "arxiv_search" && "papers" in data) {
      const result = data as ArxivSearchResult;
      return (
        <div className="tool-result arxiv-results">
          <div className="tool-result-header">Found {result.papers.length} paper{result.papers.length !== 1 ? "s" : ""} for "{result.query}"</div>
          <ol className="tool-result-list">
            {result.papers.map((paper, idx) => (
              <li key={idx} className="tool-result-item">
                <div className="tool-result-title">
                  <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer" className="tool-result-link">
                    {paper.title}
                  </a>
                </div>
                {paper.authors && paper.authors.length > 0 && (
                  <div className="tool-result-meta">
                    <span className="tool-result-authors">By {paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 ? ` +${paper.authors.length - 3} more` : ""}</span>
                  </div>
                )}
                {paper.summary && (
                  <div className="tool-result-snippet">{paper.summary}</div>
                )}
              </li>
            ))}
          </ol>
        </div>
      );
    }

    // Format arXiv download results
    if (message.name === "arxiv_download" && "arxiv_id" in data) {
      const result = data as any;
      return (
        <div className="tool-result arxiv-download">
          <div className="tool-result-header">Downloaded paper</div>
          <div className="tool-result-item">
            <div className="tool-result-title">
              <strong>{result.title || "Untitled"}</strong>
            </div>
            <div className="tool-result-meta">
              <span>arXiv ID: {result.arxiv_id}</span>
              {result.file_path && <span>Saved to: {result.file_path}</span>}
            </div>
            {result.paper_id && (
              <div className="tool-result-success">✓ Added to Research Library (ID: {result.paper_id})</div>
            )}
            {result.ingest_error && (
              <div className="tool-result-error">⚠ {result.ingest_error}</div>
            )}
          </div>
        </div>
      );
    }

    // For other tool results or if parsing fails, show formatted JSON
    return (
      <pre className="tool-result-json">{JSON.stringify(data, null, 2)}</pre>
    );
  } catch {
    // If it's not JSON, just return the content as-is
    return message.content;
  }
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
                onClick={() => {
                  onNavigate?.("qwen");
                  setOpen(false);
                }}
                title="Open in full page"
              >
                Open Full Page
              </button>
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
            {messages.map((m, idx) => {
              // Hide assistant messages that immediately follow tool messages
              // (we show the formatted tool result instead)
              if (m.role === "assistant") {
                const prevMessage = messages[idx - 1];
                if (prevMessage && prevMessage.role === "tool") {
                  return null; // Skip assistant message that duplicates tool result
                }
                // Also hide assistant messages with tool_calls (they're just stubs before tool execution)
                const msgWithToolCalls = m as any;
                if (msgWithToolCalls.tool_calls && Array.isArray(msgWithToolCalls.tool_calls) && msgWithToolCalls.tool_calls.length > 0) {
                  return null;
                }
              }
              
              // Hide arxiv_download results when they immediately follow arxiv_search
              // (the search result is sufficient, download confirmation is redundant)
              if (m.role === "tool" && m.name === "arxiv_download") {
                const prevMessage = messages[idx - 1];
                if (prevMessage && prevMessage.role === "tool" && prevMessage.name === "arxiv_search") {
                  return null; // Hide download result when it follows a search
                }
              }
              
              const label = m.role === "user" ? "You" : m.role === "assistant" ? "Qwen" : m.name || "Tool";
              const content = m.role === "tool" ? formatToolResult(m) : m.content;
              return (
                <div key={idx} className={`qwen-msg ${m.role}`}>
                  <div className="qwen-msg-role">{label}</div>
                  {typeof content === "string" ? <pre>{content}</pre> : content}
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
