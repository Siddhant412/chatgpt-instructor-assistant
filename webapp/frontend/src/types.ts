export type Page = "landing" | "papers" | "notes" | "questions";

export interface Paper {
  id: number;
  title: string;
  source_url?: string | null;
  created_at?: string | null;
  note_count?: number;
  pdf_path?: string;
  pdf_url?: string | null;
}

export interface Note {
  id: number;
  paper_id?: number | null;
  title?: string | null;
  body: string;
  created_at?: string;
  paper_title?: string | null;
}

export interface Question {
  id?: number;
  set_id?: number;
  kind: string;
  text: string;
  options?: string[] | null;
  answer?: string | null;
  explanation?: string | null;
  reference?: string | null;
}

export interface QuestionSetMeta {
  id: number;
  prompt: string;
  created_at?: string;
  count?: number;
  canvas_md_path?: string;
}

export interface QuestionSetPayload {
  question_set: QuestionSetMeta;
  questions: Question[];
}

export interface QuestionGenerationPayload {
  instructions: string;
  context?: string;
  question_count?: number;
  question_types?: string[];
  provider?: string;
}

export interface QuestionGenerationResult {
  questions: Question[];
  markdown: string;
  raw_response?: string;
}

export interface QuestionContext {
  context_id: string;
  filename: string;
  characters: number;
  preview: string;
  text: string;
}

export type QuestionStreamEvent =
  | { type: "chunk"; content: string }
  | { type: "complete"; questions: Question[]; markdown: string; raw_response?: string }
  | { type: "error"; message: string };

export interface QuestionInsertionPayload {
  instructions: string;
  context?: string;
  question_count?: number;
  question_types?: string[];
  provider?: string;
  anchor_question_id?: number;
  position?: "before" | "after";
}

export interface QuestionInsertionPreview {
  question_set: QuestionSetMeta;
  preview_questions: Question[];
  merged_questions: Question[];
  insert_index: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PaperChatResponse {
  message: string;
  paper_id: number;
  paper_title?: string | null;
  suggested_title?: string | null;
}

export interface CanvasPushRequest {
  title?: string;
  course_id?: string;
  time_limit?: number;
  publish?: boolean;
  points?: Record<string, number>;
}

export interface CanvasPushResult {
  quiz_id: number;
  quiz_url: string;
  quiz_title: string;
  course_id: string;
  total_questions: number;
  uploaded_questions: number;
  published: boolean;
}
