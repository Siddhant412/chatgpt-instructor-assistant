import { useState, useEffect, KeyboardEvent } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import { ragIngest, ragGetStatus, ragQuery } from "../api";
import type { RAGIngestRequest, RAGIndexStatusResponse, RAGQueryRequest, RAGQueryResponse } from "../types";

interface RAGMessage {
  role: "user" | "assistant";
  content: string;
  context?: RAGQueryResponse["context"];
  timestamp: Date;
}

function RAGPage({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<"ingest" | "query">("query");
  const [indexStatus, setIndexStatus] = useState<RAGIndexStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Ingestion state
  const [ingestForm, setIngestForm] = useState<RAGIngestRequest>({
    papers_dir: "server/data/pdfs",
    index_dir: "index",
    chunk_size: 1200,
    chunk_overlap: 200
  });
  const [ingestResult, setIngestResult] = useState<string | null>(null);

  // Query state
  const [queryInput, setQueryInput] = useState("");
  const [messages, setMessages] = useState<RAGMessage[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [headless, setHeadless] = useState(false); // Default to false so browser window opens

  useEffect(() => {
    checkIndexStatus();
  }, []);

  async function checkIndexStatus() {
    try {
      const status = await ragGetStatus(ingestForm.index_dir);
      setIndexStatus(status);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleIngest() {
    setLoading(true);
    setError(null);
    setIngestResult(null);
    setStatus("Starting ingestion...");
    try {
      const result = await ragIngest(ingestForm);
      if (result.success) {
        setStatus("Ingestion completed successfully!");
        setIngestResult(
          `✓ Successfully ingested ${result.num_documents} document${result.num_documents !== 1 ? 's' : ''} into ${result.num_chunks} chunks. Index saved to ${result.index_dir}`
        );
      } else {
        setStatus(null);
        setIngestResult(result.message);
      }
      await checkIndexStatus();
    } catch (err) {
      setError((err as Error).message);
      setStatus(null);
      setIngestResult(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
      setStatus(null);
    }
  }

  async function handleQuery() {
    if (!queryInput.trim()) {
      return;
    }

    const questionText = queryInput.trim();
    
    const userMessage: RAGMessage = {
      role: "user",
      content: questionText,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMessage]);
    setQueryInput("");
    setQueryLoading(true);
    setError(null);

    try {
      const request: RAGQueryRequest = {
        question: questionText,
        index_dir: ingestForm.index_dir,
        k: 6,
        headless: headless
      };

      const response = await ragQuery(request);

      const assistantMessage: RAGMessage = {
        role: "assistant",
        content: response.answer,
        context: response.context,
        timestamp: new Date()
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError((err as Error).message);
      const errorMessage: RAGMessage = {
        role: "assistant",
        content: `Error: ${(err as Error).message}`,
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setQueryLoading(false);
    }
  }

  function handleQueryKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!queryLoading) {
        handleQuery();
      }
    }
  }

  return (
    <section className="page rag">
      <div className="page-head">
        <div>
          <h2>RAG System</h2>
          <p className="muted">Retrieval-Augmented Generation: Query your PDF library with citations.</p>
        </div>
        <div className="page-actions">
          <button onClick={onBack}>Back</button>
          <button onClick={checkIndexStatus}>Refresh Status</button>
        </div>
      </div>

      <div className="question-mode-toggle">
        <button className={mode === "ingest" ? "primary" : ""} onClick={() => setMode("ingest")}>
          Ingest PDFs
        </button>
        <button className={mode === "query" ? "primary" : ""} onClick={() => setMode("query")}>
          Query System
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {status && <p className="status">{status}</p>}

      {indexStatus && !loading && (
        <div className={`status-card ${indexStatus.exists ? "success" : "warning"}`}>
          <strong>Index Status:</strong> {indexStatus.message}
          {indexStatus.index_dir && <span className="muted"> ({indexStatus.index_dir})</span>}
        </div>
      )}

      {mode === "ingest" ? (
        <div className="ingest-panel">
          <div className="ingest-card">
            <h3>PDF Ingestion</h3>
            <p className="muted">
              Load PDFs from the papers directory, extract text, split into chunks, create embeddings, and build a FAISS index.
            </p>

            <label>
              Papers Directory
              <input
                type="text"
                value={ingestForm.papers_dir}
                onChange={(e) => setIngestForm((prev) => ({ ...prev, papers_dir: e.target.value }))}
                placeholder="server/data/pdfs"
              />
            </label>

            <label>
              Index Directory
              <input
                type="text"
                value={ingestForm.index_dir}
                onChange={(e) => setIngestForm((prev) => ({ ...prev, index_dir: e.target.value }))}
                placeholder="index"
              />
            </label>

            <div className="form-row">
              <label>
                Chunk Size
                <input
                  type="number"
                  value={ingestForm.chunk_size}
                  onChange={(e) =>
                    setIngestForm((prev) => ({ ...prev, chunk_size: parseInt(e.target.value) || 1200 }))
                  }
                  min={100}
                  max={5000}
                />
              </label>

              <label>
                Chunk Overlap
                <input
                  type="number"
                  value={ingestForm.chunk_overlap}
                  onChange={(e) =>
                    setIngestForm((prev) => ({ ...prev, chunk_overlap: parseInt(e.target.value) || 200 }))
                  }
                  min={0}
                  max={1000}
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="primary" onClick={handleIngest} disabled={loading}>
                {loading ? "Ingesting..." : "Start Ingestion"}
              </button>
            </div>

            {loading && status && (
              <div className="status-card">
                <p>{status}</p>
              </div>
            )}

            {ingestResult && !loading && (
              <div className={`result-card ${ingestResult.includes("Successfully") || ingestResult.includes("✓") ? "success" : "error"}`}>
                <p>{ingestResult}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="query-panel">
          {!indexStatus?.exists ? (
            <div className="warning-card">
              <p>
                <strong>Index not found.</strong> Please run ingestion first to create the vector index.
              </p>
              <button onClick={() => setMode("ingest")}>Go to Ingestion</button>
            </div>
          ) : (
            <>
              <div className="query-options" style={{ marginBottom: "1rem", padding: "1rem", background: "#f5f5f5", borderRadius: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={!headless}
                    onChange={(e) => setHeadless(!e.target.checked)}
                  />
                  <span>Show browser window (required for login)</span>
                </label>
                {!headless && (
                  <p style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.5rem", marginLeft: "1.5rem" }}>
                    A browser window will open. Please log in to ChatGPT when prompted.
                  </p>
                )}
              </div>
              <div className="chat-window rag-chat">
                <div className="chat-log">
                  {messages.length === 0 && (
                    <p className="empty-chat-hint">
                      Ask a question about your PDF library. The system will retrieve relevant chunks and generate an answer with citations.
                    </p>
                  )}
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`chat-bubble ${msg.role}`}>
                      <div className="chat-content">
                        <MarkdownRenderer markdown={msg.content} />
                      </div>
                      {msg.role === "assistant" && msg.context && msg.context.length > 0 && (
                        <div className="chat-sources">
                          <strong>Sources ({msg.context.length}):</strong>
                          <ul>
                            {msg.context.map((ctx, ctxIdx) => (
                              <li key={ctxIdx}>
                                [{ctx.index}] {ctx.paper} ({ctx.chunk_count} chunks)
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                  {queryLoading && (
                    <div className="chat-bubble assistant">
                      <p>Thinking...</p>
                    </div>
                  )}
                </div>
                <div className="chat-input-bar">
                  <textarea
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    onKeyDown={handleQueryKeyDown}
                    placeholder="Ask a question about your PDF library..."
                    disabled={queryLoading}
                  />
                  <div className="chat-bar-actions">
                    <button className="primary" onClick={handleQuery} disabled={queryLoading || !queryInput.trim()}>
                      {queryLoading ? "Querying..." : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default RAGPage;

