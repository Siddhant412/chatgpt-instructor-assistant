import React, { useEffect, useMemo, useRef, useState } from "react";
import { agentChat, uploadQuestionContext } from "../api";
import type { AgentChatMessage, YoutubeSearchResult, WebSearchResult, NewsResult, ArxivSearchResult, QuestionContext } from "../types";

interface QwenFullPageProps {
  onNavigate?: (page: "landing" | "papers" | "notes" | "questions" | "qwen") => void;
  messages?: AgentChatMessage[];
  setMessages?: (msgs: AgentChatMessage[]) => void;
  onReset?: () => void;
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

    // For other tool results or if parsing fails, show formatted JSON (unless it's a pure navigation signal)
    if (data && typeof data === "object" && (data as any).action === "open_md_editor") {
      return null;
    }
    return <pre className="tool-result-json">{JSON.stringify(data, null, 2)}</pre>;
  } catch {
    // If it's not JSON, just return the content as-is
    return message.content;
  }
}

export function QwenFullPage({ onNavigate, messages: injectedMessages, setMessages: setInjectedMessages, onReset }: QwenFullPageProps) {
  const STORAGE_KEY = "qwen.chat.fullpage.history";
  const defaultMessages: AgentChatMessage[] = [
    {
      role: "assistant",
      content:
        "Hi! I'm the Qwen agent. Ask me anything—I'll pick the right tool (web/news/arXiv/PDF/YouTube) and guide you to Research Library, Notes, or Question Sets when needed."
    }
  ];
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [localMessages, setLocalMessages] = useState<AgentChatMessage[]>(defaultMessages);
  const messages = injectedMessages ?? localMessages;
  const setMessages = setInjectedMessages ?? setLocalMessages;
  const [contextIds, setContextIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const placeholder = useMemo(() => "Start chatting...", []);

  useEffect(() => {
    if (injectedMessages) return;
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setLocalMessages(parsed as AgentChatMessage[]);
      }
    } catch {
      /* ignore storage errors */
    }
  }, [injectedMessages]);

  useEffect(() => {
    if (injectedMessages) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages, injectedMessages]);

  async function runTool() {
    if (!input.trim()) return;
    setBusy(true);
    const contextHint =
      contextIds.length > 0
        ? [
            {
              role: "tool" as const,
              name: "context_hint",
              content: JSON.stringify({ context_ids: contextIds }),
            },
          ]
        : [];
    const nextHistory = [...messages, ...contextHint, { role: "user" as const, content: input.trim() }];
    setMessages(nextHistory);
    setInput("");
    try {
      const prevCount = messages.length;
      const updated = await agentChat(nextHistory);
      setMessages(updated);
      updated.slice(prevCount).forEach((m) => {
        if (m.role !== "tool") return;
        try {
          const parsed = JSON.parse(m.content);
          if (parsed && parsed.action === "open_md_editor" && parsed.markdown) {
            window.localStorage.setItem(
              "qwen.md.draft",
              JSON.stringify({ markdown: parsed.markdown, filename: parsed.filename || "question-set.md" })
            );
            onNavigate?.("questions");
          }
        } catch {
          /* ignore */
        }
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleFileSelect(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    const file = fileList[0];
    setUploading(true);
    try {
      const ctx: QuestionContext = await uploadQuestionContext(file);
      setContextIds((prev) => {
        const set = new Set(prev);
        set.add(ctx.context_id);
        return Array.from(set);
      });
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
    <section className="page qwen-full">
      <div className="page-head">
        <div>
          <h2>Qwen Agent</h2>
          <p className="muted">An autonomous AI agent that can use tools to answer your questions.</p>
        </div>
        <div className="page-actions">
          <button onClick={() => onNavigate?.("landing")}>Back</button>
          <button
            className="ghost"
            onClick={() => {
              if (onReset) {
                onReset();
              } else {
                setMessages(defaultMessages);
                if (typeof window !== "undefined") {
                  try {
                    window.localStorage.removeItem(STORAGE_KEY);
                  } catch {
                    /* ignore */
                  }
                }
              }
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="qwen-full-container">
        <div className="qwen-full-sidebar">
          <div className="qwen-full-section">
            <h3>Available Tools</h3>
            <ul className="qwen-tools-list">
              <li>Web Search (DuckDuckGo)</li>
              <li>News (Google News RSS)</li>
              <li>arXiv Search & Download</li>
              <li>PDF Summarization</li>
              <li>YouTube Search & Download</li>
            </ul>
          </div>

          <div className="qwen-full-section">
            <h3>Quick Links</h3>
            <div className="qwen-quick-links-vertical">
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
          </div>
        </div>

        <div className="qwen-full-chat">
          <div className="qwen-full-chat-header">
            <div>
              <strong>Chat</strong>
            </div>
            <button
              type="button"
              className="ghost"
              onClick={() => setMessages((prev) => prev.slice(0, 1))}
            >
              Reset Conversation
            </button>
          </div>

          <div className="qwen-full-log">
            {messages
              .filter((m) => !(m.role === "tool" && (m.name === "context_hint" || m.name === "context_hint_full")))
              .map((m, idx) => {
              // Hide assistant messages that immediately follow tool messages
              // (we show the formatted tool result instead)
              if (m.role === "assistant") {
                const prevMessage = messages[idx - 1];
                if (prevMessage && prevMessage.role === "tool") {
                  return null; // Skip assistant message that duplicates tool result
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

          <div className="qwen-full-controls">
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
      </div>
    </section>
  );
}
