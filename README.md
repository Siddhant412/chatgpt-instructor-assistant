# ChatGPT Instructor Assistant – Web App

This repository contains the full-stack “Instructor Assistant” web app that helps faculty manage their research PDFs, annotate notes, and generate Canvas-ready question sets powered by OpenAI or a local Llama model.

## Features

- **Research Library** – Upload papers by DOI/URL/title, preview PDFs inline, delete entries, and summarize via an integrated chatbot that can save responses directly into the notes workspace.
- **Notes Workspace** – Apple-Notes inspired UI with search, inline highlighting, and word counts. Notes are no longer tied to specific papers and can be searched globally.
- **Question Sets** – Dual workflow:
  - *Generate*: Upload source files, chat with the instructor assistant, and stream exam-ready questions + Markdown. Choose between OpenAI GPT and a local Llama 3.1 model with inline tool access.
  - *Upload*: Import existing Markdown, edit, or manage previously generated sets.
- **Canvas Export** – Save Markdown locally or push directly to Canvas with per-quiz settings (course, title, time limit, publish toggle).
- **Local LLM Support** – When `LLM_PROVIDER=local`, the backend orchestrates tool calls (`list_contexts`, `read_context`) so a local Llama model can read uploaded PDFs/PPTX excerpts before answering.

## Repository Layout

```
webapp/
  backend/    # FastAPI app, LiteLLM/local LLM services, Canvas helper, context cache
  frontend/   # React + Vite SPA (TypeScript)
  server/     # ChatGPT Apps SDK utilities (not required for the webapp)
```

## Prerequisites

- Python 3.11+
- Node.js 18+ and npm
- (Optional) [Ollama](https://ollama.com/) or another local Llama runner
- An OpenAI API key for GPT-based generation

## Backend Setup

```bash
cd webapp/backend
python -m venv .webenv
source .webenv/bin/activate
pip install -r requirements.txt
```

Create `.env` with the desirable settings:

```dotenv
# OpenAI / LiteLLM
OPENAI_API_KEY=...
LITELLM_MODEL=gpt-5-mini

# Local LLM (via Ollama or compatible REST API)
LOCAL_LLM_URL=http://localhost:11434
LOCAL_LLM_MODEL=llama3.1:8b

# Canvas integration
CANVAS_API_URL=...
CANVAS_ACCESS_TOKEN=...
```


### Running the API

```bash
cd webapp/backend
source .webenv/bin/activate
cd..
cd..
uvicorn webapp.backend.main:app --host 0.0.0.0 --port 8010 --reload
```

This serves all REST endpoints under `http://localhost:8010/api`.

## Frontend Setup

```bash
cd webapp/frontend
npm install
npm run dev
```

The Vite dev server runs at `http://localhost:5173`

## Local LLM Workflow

1. Launch your local runner (example with Ollama):
   ```bash
   ollama run llama3.1:8b
   ```
2. In the Question Sets page, pick “Local (Llama 3.1)” from the provider dropdown.
3. Upload PDFs/PPTX: the backend extracts text and stores it in `context_store`. The local LLM can call the inline tools to list and read excerpts before generating JSON.

Logs prefixed with `[local-llm]` show each tool invocation and whether the model produced valid JSON.

## Canvas Push Workflow

1. Configure the Canvas env vars.
2. Generate or upload a question set.
3. In the Markdown panel, open “Send to Canvas,” fill in quiz settings, and click “Push to Canvas.”  
   The backend creates the quiz, optional question groups, uploads all questions, and returns the Canvas URL.
