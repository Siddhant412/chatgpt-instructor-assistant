import {
  ChatMessage,
  Note,
  Paper,
  PaperChatResponse,
  Question,
  QuestionContext,
  QuestionGenerationPayload,
  QuestionGenerationResult,
  QuestionInsertionPayload,
  QuestionInsertionPreview,
  QuestionSetMeta,
  QuestionSetPayload,
  QuestionStreamEvent,
  CanvasPushRequest,
  CanvasPushResult,
  AgentChatMessage,
  WebSearchResult,
  NewsResult,
  ArxivSearchResult,
  ArxivDownloadResult,
  PdfSummaryResult,
  YoutubeSearchResult,
  YoutubeDownloadResult,
  RAGIngestRequest,
  RAGIngestResponse,
  RAGIndexStatusResponse,
  RAGQueryRequest,
  RAGQueryResponse
} from "./types";

const DEFAULT_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "http://localhost:8010/api";
export const API_BASE = DEFAULT_BASE.replace(/\/$/, "");

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || JSON.stringify(data);
    } catch {
      // swallow
    }
    throw new Error(detail || "Request failed");
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function listPapers(): Promise<Paper[]> {
  const data = await request<{ papers: Paper[] }>("/papers");
  return data.papers;
}

export async function listNotes(): Promise<Note[]> {
  const data = await request<{ notes: Note[] }>("/notes");
  return data.notes;
}

export async function createNote(input: { title?: string; body: string; paper_id?: number | null }): Promise<Note> {
  const data = await request<{ note: Note }>("/notes", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return data.note;
}

export async function updateNote(noteId: number, input: { title?: string; body?: string; paper_id?: number | null }): Promise<Note> {
  const data = await request<{ note: Note }>(`/notes/${noteId}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
  return data.note;
}

export async function deleteNote(noteId: number): Promise<void> {
  await request<void>(`/notes/${noteId}`, { method: "DELETE" });
}

export async function listQuestionSets(): Promise<QuestionSetMeta[]> {
  const data = await request<{ question_sets: QuestionSetMeta[] }>("/question-sets");
  return data.question_sets;
}

export async function getQuestionSet(setId: number): Promise<QuestionSetPayload> {
  return request<QuestionSetPayload>(`/question-sets/${setId}`);
}

export async function createQuestionSet(input: { prompt: string; questions: Question[] }): Promise<QuestionSetPayload> {
  return request<QuestionSetPayload>("/question-sets", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateQuestionSet(setId: number, input: { prompt?: string; questions: Question[] }): Promise<QuestionSetPayload> {
  return request<QuestionSetPayload>(`/question-sets/${setId}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function deleteQuestionSet(setId: number): Promise<void> {
  await request<void>(`/question-sets/${setId}`, { method: "DELETE" });
}

export async function generateQuestionSetWithLLM(input: QuestionGenerationPayload): Promise<QuestionGenerationResult> {
  return request<QuestionGenerationResult>("/question-sets/generate", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function uploadQuestionContext(file: File): Promise<QuestionContext> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/question-sets/context`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Failed to upload context");
  }
  return (await res.json()) as QuestionContext;
}

export async function streamQuestionGeneration(
  input: QuestionGenerationPayload,
  onEvent: (event: QuestionStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/question-sets/generate/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    signal
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(text || "Failed to start generation stream");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      chunk
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            if (!payload) {
              return;
            }
            try {
              onEvent(JSON.parse(payload));
            } catch {
              // ignore malformed chunk
            }
          }
        });
    }
  }
}

export async function downloadPaper(input: { source: string; source_url?: string }): Promise<Paper> {
  const data = await request<{ paper: Paper }>("/papers/download", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return data.paper;
}

export async function deletePaper(paperId: number): Promise<void> {
  await request<void>(`/papers/${paperId}`, { method: "DELETE" });
}

export async function chatPaper(paperId: number, messages: ChatMessage[]): Promise<PaperChatResponse> {
  return request<PaperChatResponse>(`/papers/${paperId}/chat`, {
    method: "POST",
    body: JSON.stringify({ messages })
  });
}

export async function pushQuestionSetToCanvas(setId: number, input: CanvasPushRequest): Promise<CanvasPushResult> {
  return request<CanvasPushResult>(`/question-sets/${setId}/canvas`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function previewQuestionInsertion(
  setId: number,
  input: QuestionInsertionPayload
): Promise<QuestionInsertionPreview> {
  return request<QuestionInsertionPreview>(`/question-sets/${setId}/preview/insert`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

// Agent chat

export async function agentChat(messages: AgentChatMessage[]): Promise<AgentChatMessage[]> {
  const data = await request<{ messages: AgentChatMessage[] }>("/agent/chat", {
    method: "POST",
    body: JSON.stringify({ messages })
  });
  return data.messages;
}

// Qwen tool calls

export async function toolWebSearch(input: { query: string; max_results?: number }): Promise<WebSearchResult> {
  const data = await request<{ result: WebSearchResult }>("/tools/web-search", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return data.result;
}

export async function toolNews(input: { topic: string; limit?: number }): Promise<NewsResult> {
  const data = await request<{ result: NewsResult }>("/tools/news", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return data.result;
}

export async function toolArxivSearch(input: { query: string; max_results?: number }): Promise<ArxivSearchResult> {
  const data = await request<{ result: ArxivSearchResult }>("/tools/arxiv/search", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return data.result;
}

export async function toolArxivDownload(input: {
  arxiv_id: string;
  output_path?: string | null;
}): Promise<ArxivDownloadResult> {
  const data = await request<{ result: ArxivDownloadResult }>("/tools/arxiv/download", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return data.result;
}

export async function toolPdfSummary(input: { pdf_path: string }): Promise<PdfSummaryResult> {
  const data = await request<{ result: PdfSummaryResult }>("/tools/pdf/summary", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return data.result;
}

export async function toolYoutubeSearch(input: { query: string; max_results?: number }): Promise<YoutubeSearchResult> {
  const data = await request<{ result: YoutubeSearchResult }>("/tools/youtube/search", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return data.result;
}

export async function toolYoutubeDownload(input: {
  video_url: string;
  output_path?: string | null;
}): Promise<YoutubeDownloadResult> {
  const data = await request<{ result: YoutubeDownloadResult }>("/tools/youtube/download", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return data.result;
}

// RAG API functions

export async function ragIngest(input: RAGIngestRequest): Promise<RAGIngestResponse> {
  // Use a longer timeout for ingestion (5 minutes)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);
  
  try {
    const res = await fetch(`${API_BASE}/rag/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const data = await res.json();
        detail = data.detail || JSON.stringify(data);
      } catch {
        // swallow
      }
      throw new Error(detail || "Request failed");
    }
    
    return (await res.json()) as RAGIngestResponse;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Ingestion timeout: The process is taking longer than expected. Please check the server logs.");
    }
    throw err;
  }
}

export async function ragGetStatus(index_dir?: string): Promise<RAGIndexStatusResponse> {
  const params = index_dir ? `?index_dir=${encodeURIComponent(index_dir)}` : "";
  return request<RAGIndexStatusResponse>(`/rag/status${params}`);
}

export async function ragQuery(input: RAGQueryRequest): Promise<RAGQueryResponse> {
  return request<RAGQueryResponse>("/rag/query", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
