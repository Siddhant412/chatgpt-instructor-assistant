export type Page = "landing" | "papers" | "notes" | "questions";

export interface Paper {
  id: number;
  title: string;
  source_url?: string | null;
  created_at?: string | null;
  note_count?: number;
  pdf_path?: string;
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
