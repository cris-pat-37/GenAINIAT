# GenAI NIAT

A single deployable GenAI project with two live workflows:

- **Savage AI Chat**: a configurable Groq-powered chatbot with name memory and selectable tones.
- **PDF Intelligence Studio**: upload a PDF and get a summary, key points, concept map, study cards, keywords, and action items.

The project uses a FastAPI backend and a custom HTML/CSS/JS frontend served from the same app, so one deployment link is enough for college demos.

## Tech Stack

- FastAPI
- Groq OpenAI-compatible chat API
- pypdf
- HTML, CSS, JavaScript

## Run Locally

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

## Environment Variables

Create `.env` locally:

```env
GROQ_API_KEY=your_groq_api_key_here
DEFAULT_MODEL=llama-3.1-8b-instant
```

Users can also paste their own API key in the app settings to override the server key.

## Deploy On Render

1. Push this repository to GitHub.
2. Create a new Render **Web Service** from the repository.
3. Use:
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables:
   - `GROQ_API_KEY`
   - `DEFAULT_MODEL` = `llama-3.1-8b-instant`
5. Deploy and use the Render URL as the live project link.

## Deploy On Vercel

1. Import the GitHub repository into Vercel.
2. Choose the **FastAPI** preset and keep the root directory as `./`.
3. Add environment variables:
   - `GROQ_API_KEY`
   - `DEFAULT_MODEL` = `llama-3.1-8b-instant`
4. Deploy.

Vercel uses `api/main.py` and `pyproject.toml` to locate the FastAPI app at `backend.main:app`.

## Project Notes

- `.env` is ignored by Git so API keys do not get committed.
- The frontend can use the server API key or a user-provided key.
- Scanned/image-only PDFs need OCR first because standard PDF text extraction will not find text.
