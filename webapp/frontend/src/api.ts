import { Note, Paper, Question, QuestionSetMeta, QuestionSetPayload } from "./types";

const DEFAULT_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "http://localhost:8010/api";
const API_BASE = DEFAULT_BASE.replace(/\/$/, "");

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
