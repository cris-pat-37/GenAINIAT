import json
import os
import re
import time
from io import BytesIO
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pypdf import PdfReader

load_dotenv()

ROOT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT_DIR / "frontend"
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "llama-3.1-8b-instant")

app = FastAPI(
    title="GenAI NIAT",
    description="Savage AI chat and interactive PDF summarizer powered by Groq.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    user_name: str | None = None
    history: list[ChatMessage] = Field(default_factory=list)
    api_key: str | None = None
    model: str | None = None
    tone: str = "savage"


class PdfChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    summary: dict[str, Any] = Field(default_factory=dict)
    history: list[ChatMessage] = Field(default_factory=list)
    api_key: str | None = None
    model: str | None = None


def get_api_key(api_key: str | None) -> str:
    resolved = (api_key or os.getenv("GROQ_API_KEY") or "").strip()
    if not resolved:
        raise HTTPException(
            status_code=400,
            detail="Missing Groq API key. Add GROQ_API_KEY on the server or paste one in Settings.",
        )
    return resolved


async def groq_chat(
    messages: list[dict[str, str]],
    api_key: str | None,
    model: str | None,
    temperature: float = 0.8,
    max_tokens: int = 700,
) -> str:
    headers = {
        "Authorization": f"Bearer {get_api_key(api_key)}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model or DEFAULT_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(GROQ_CHAT_URL, headers=headers, json=payload)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}") from exc

    data = response.json()
    return data["choices"][0]["message"]["content"].strip()


def extract_name(text: str) -> str | None:
    text = text.lower().strip()
    greetings = {"hi", "hello", "hey", "yo", "sup", "bro"}
    patterns = [
        r"\bmy name is ([a-zA-Z][a-zA-Z'-]{1,30})",
        r"\bi am ([a-zA-Z][a-zA-Z'-]{1,30})",
        r"\bi'm ([a-zA-Z][a-zA-Z'-]{1,30})",
        r"\bcall me ([a-zA-Z][a-zA-Z'-]{1,30})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1).capitalize()
    if text.isalpha() and len(text) >= 3 and text not in greetings:
        return text.capitalize()
    return None


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ready"}


@app.post("/api/chat")
async def chat(request: ChatRequest) -> dict[str, Any]:
    detected_name = request.user_name or extract_name(request.message)
    if detected_name and not request.user_name:
        return {
            "reply": f"{detected_name}? Fine. Name registered. Now ask something worth the electricity.",
            "user_name": detected_name,
        }

    if not detected_name:
        system_prompt = """
You are Savage Sigma AI, a ruthless but useful study partner.
The user has not shared their name yet.
Do not answer their actual question. Demand their name first.
Roast the laziness hard, but do not use slurs, hate, threats, sexual content, or targeted harassment.
Keep it under 45 words.
"""
        reply = await groq_chat(
            [{"role": "system", "content": system_prompt}, {"role": "user", "content": request.message}],
            request.api_key,
            request.model,
            temperature=0.95,
            max_tokens=120,
        )
        return {"reply": reply, "user_name": None}

    tone_rules = {
        "mentor": "Be practical but still blunt. Encourage only after pointing out the weak habit.",
        "savage": "Maximum Sigma roast mode. Be brutal about lazy/simple questions. Challenge first, answer second.",
        "exam": "Be an exam coach with sharp pressure. Make the user earn clarity with concise, scoring-focused points.",
    }
    system_prompt = f"""
You are Savage Sigma AI inside the GenAI NIAT project.
The user's name is {detected_name}.
{tone_rules.get(request.tone, tone_rules["savage"])}
Never use slurs, hate, threats, sexual content, or targeted harassment.
No sugar coating. Your default personality is full attitude: roast weak effort, lazy prompts, and basic questions.
For very simple questions, do NOT immediately spoon-feed. First roast, then give a hint or ask them to try.
If the user has already tried, failed, or seems tired/frustrated, stop clowning for a moment: motivate them, give a clear hint, then show the answer.
For serious academic/project questions, still be useful, but keep the Sigma pressure high.
When giving code, use fenced markdown code blocks.
Keep answers concise unless the user asks for detail.
"""
    safe_history = [msg.model_dump() for msg in request.history[-10:] if msg.role in {"user", "assistant"}]
    messages = [{"role": "system", "content": system_prompt}, *safe_history, {"role": "user", "content": request.message}]
    reply = await groq_chat(messages, request.api_key, request.model, temperature=0.85, max_tokens=600)
    return {"reply": reply, "user_name": detected_name}


@app.post("/api/pdf-chat")
async def pdf_chat(request: PdfChatRequest) -> dict[str, str]:
    if not request.summary:
        raise HTTPException(status_code=400, detail="Summarize a PDF before asking follow-up questions.")

    summary_context = json.dumps(request.summary, ensure_ascii=False)[:12000]
    safe_history = [msg.model_dump() for msg in request.history[-8:] if msg.role in {"user", "assistant"}]
    system_prompt = f"""
You are Savage Sigma AI answering follow-up questions about a PDF summary.
Use ONLY the PDF summary context below. If the answer is not in the summary, say that bluntly and tell the user what to check in the PDF.
No sugar coating. Be brutally honest, high-attitude, and funny, but do not use slurs, hate, threats, sexual content, or targeted harassment.
For lazy follow-up questions, roast first, then give a useful answer.
If the user seems confused or tired, motivate them briefly, give hints, then explain clearly.
For decision questions like hiring, selection, pass/fail, yes/no, or rating: start with a direct verdict in the first line. No long warm-up. Then give 2-4 blunt reasons from the PDF summary.
If the user explicitly asks for "simple yes or no", answer with one clear verdict first, then one short reason.
When giving code or structured examples, use fenced markdown code blocks.

PDF summary context:
{summary_context}
"""
    reply = await groq_chat(
        [{"role": "system", "content": system_prompt}, *safe_history, {"role": "user", "content": request.question}],
        request.api_key,
        request.model,
        temperature=0.85,
        max_tokens=700,
    )
    return {"reply": reply}


def extract_pdf_text(file_bytes: bytes) -> tuple[str, int]:
    try:
        reader = PdfReader(BytesIO(file_bytes))
        pages = []
        for index, page in enumerate(reader.pages, start=1):
            page_text = page.extract_text() or ""
            if page_text.strip():
                pages.append(f"\n\n--- Page {index} ---\n{page_text.strip()}")
        return "".join(pages).strip(), len(reader.pages)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {exc}") from exc


def parse_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.S)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    return {
        "title": "PDF Summary",
        "overview": text,
        "key_points": [],
        "study_cards": [],
        "action_items": [],
        "keywords": [],
    }


@app.post("/api/summarize")
async def summarize_pdf(
    file: UploadFile = File(...),
    mode: str = Form("deep"),
    api_key: str | None = Form(None),
    model: str | None = Form(None),
) -> dict[str, Any]:
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Upload a PDF file.")

    started = time.time()
    file_bytes = await file.read()
    text, page_count = extract_pdf_text(file_bytes)
    if not text:
        raise HTTPException(
            status_code=400,
            detail="No extractable text found. This may be a scanned/image PDF.",
        )

    clipped_text = text[:18000]
    mode_guides = {
        "quick": "Make it short and high-signal for fast revision.",
        "deep": "Create a complete but readable academic summary.",
        "creative": "Make it engaging with analogies, examples, and memorable phrasing.",
        "exam": "Focus on likely exam answers, definitions, and important points.",
    }
    prompt = f"""
You are an expert document intelligence assistant inspired by GraphRAG-style connected thinking.
Analyze this PDF and return ONLY valid JSON with this schema:
{{
  "title": "short document title",
  "overview": "5-7 sentence summary",
  "key_points": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "concept_map": [
    {{"source": "concept", "target": "related concept", "reason": "relationship in 8 words"}}
  ],
  "study_cards": [
    {{"question": "question", "answer": "answer"}}
  ],
  "action_items": ["what the reader should do next"],
  "keywords": ["keyword1", "keyword2", "keyword3"]
}}

Mode: {mode}. {mode_guides.get(mode, mode_guides["deep"])}
Document text:
{clipped_text}
"""
    ai_text = await groq_chat(
        [{"role": "system", "content": "Return strict JSON only."}, {"role": "user", "content": prompt}],
        api_key,
        model,
        temperature=0.45,
        max_tokens=1600,
    )
    result = parse_json_object(ai_text)
    result["meta"] = {
        "file_name": file.filename,
        "pages": page_count,
        "characters_read": len(text),
        "characters_sent": len(clipped_text),
        "seconds": round(time.time() - started, 2),
        "model": model or DEFAULT_MODEL,
    }
    return result


app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="assets")


@app.get("/{full_path:path}")
def serve_frontend(full_path: str) -> FileResponse:
    requested = FRONTEND_DIR / full_path
    if full_path and requested.is_file():
        return FileResponse(requested)
    return FileResponse(FRONTEND_DIR / "index.html")
