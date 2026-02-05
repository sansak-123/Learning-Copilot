"""
Standalone module to handle PDF uploads and generate structured
learning content using OpenRouter.

Functions:
1. generate_pdf_topics(pdf_file: UploadFile, query: str, chunk_size=1000) -> List[Dict]
2. generate_pdf_subtopic_items(pdf_file: UploadFile, subtopic: str, chunk_size=1000) -> List[Dict]

Each function extracts text from the PDF, chunks it for context,
and then calls either the roadmap generator or QA/STUDY generator.
"""

import os
import json
from typing import List
from PyPDF2 import PdfReader
import requests
from dotenv import load_dotenv

# Load env vars
load_dotenv()

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
if not OPENROUTER_API_KEY:
    raise RuntimeError("OPENROUTER_API_KEY not found in environment")


# ------------------- PDF Helpers -------------------

def extract_pdf_text(file) -> str:
    """Extract all text from a PDF file."""
    reader = PdfReader(file)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text.strip()


def chunk_text(text: str, chunk_size: int = 1000) -> List[str]:
    """Split text into chunks of approximately chunk_size words."""
    words = text.split()
    return [" ".join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]


# ------------------- API Call Helpers -------------------

def call_openrouter(messages: List[dict], model="openai/gpt-4o-mini", max_tokens=2000, temperature=0.3) -> str:
    """Call OpenRouter API and return assistant text."""
    headers = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}

    resp = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"] or ""
    except Exception:
        return data.get("choices", [{}])[0].get("text", "") or ""


def extract_json(text: str):
    """Attempt to extract JSON from a model output."""
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        # fallback: return empty
        return None


# ------------------- Main PDF Functions -------------------

def generate_pdf_topics(pdf_file, query: str, chunk_size: int = 1000, model="openai/gpt-4o-mini") -> List[dict]:
    """
    Generate topics and subtopics from a PDF.
    Returns list of topic dicts:
    [
        {"type":"TOPIC", "name":"...", "subtopics":[{"type":"SUBTOPIC","name":"...","content":"..."}]}
    ]
    """
    text = extract_pdf_text(pdf_file)
    if not text:
        return [{"type": "TOPIC", "name": "RESOURCE", "subtopics": [{"type": "SUBTOPIC", "name": "RESOURCE", "content": "PDF has no text"}]}]

    chunks = chunk_text(text, chunk_size)

    system_prompt = (
        "You are an assistant that MUST output only valid JSON. "
        "The top-level value MUST be an array. Each element is an object with keys: "
        "'type' (TOPIC), 'name' (topic title), 'subtopics' (array of SUBTOPIC objects). "
        "Each SUBTOPIC object has keys: 'type' (SUBTOPIC), 'name', 'content'. "
        "Generate at least 5 topics, each with at least 5 subtopics, using the PDF context."
    )

    all_results = []

    for chunk in chunks:
        user_prompt = f"Subject/Query: {query}\n\nContext from PDF:\n{chunk}\n\nReturn JSON array of topics only."
        try:
            assistant_text = call_openrouter(
                [{"role": "system", "content": system_prompt},
                 {"role": "user", "content": user_prompt}],
                model=model
            )
            parsed = extract_json(assistant_text)
            if parsed:
                all_results.extend(parsed)
        except Exception as e:
            # Optional: log chunk errors without stopping all processing
            all_results.append({
                "type": "TOPIC",
                "name": f"RESOURCE (error in chunk: {str(e)})",
                "subtopics": [{"type": "SUBTOPIC", "name": "RESOURCE", "content": assistant_text or ""}]
            })

    # If no valid results from any chunk, fallback
    if not all_results:
        return [{"type": "TOPIC", "name": "RESOURCE", "subtopics": [{"type": "SUBTOPIC", "name": "RESOURCE", "content": "No content generated"}]}]

    return all_results
    # text = extract_pdf_text(pdf_file)
    # if not text:
    #     return [{"type": "TOPIC", "name": "RESOURCE", "subtopics": [{"type": "SUBTOPIC", "name": "RESOURCE", "content": "PDF has no text"}]}]

    # chunks = chunk_text(text, chunk_size)
    # context = "\n".join(chunks)

    # system_prompt = (
    #     "You are an assistant that MUST output only valid JSON. "
    #     "The top-level value MUST be an array. Each element is an object with keys: "
    #     "'type' (TOPIC), 'name' (topic title), 'subtopics' (array of SUBTOPIC objects). "
    #     "Each SUBTOPIC object has keys: 'type' (SUBTOPIC), 'name', 'content'. "
    #     "Generate at least 5 topics, each with at least 5 subtopics, using the PDF context."
    # )

    # user_prompt = f"Subject/Query: {query}\n\nContext from PDF:\n{context}\n\nReturn JSON array of topics only."

    # assistant_text = call_openrouter([{"role": "system", "content": system_prompt},
    #                                   {"role": "user", "content": user_prompt}], model=model)

    # parsed = extract_json(assistant_text)
    # if parsed:
    #     return parsed
    # return [{"type": "TOPIC", "name": "RESOURCE", "subtopics": [{"type": "SUBTOPIC", "name": "RESOURCE", "content": assistant_text}]}]


def generate_pdf_subtopic_items(pdf_file, subtopic: str, chunk_size: int = 1000, model="openai/gpt-4o-mini") -> List[dict]:
    """
    Generate QA/STUDY items for a single subtopic from PDF.
    Returns list of dicts: [{"type":"QA or STUDY","content":"..."}, ...]
    """
    text = extract_pdf_text(pdf_file)
    if not text:
        return [{"type": "STUDY", "content": "PDF has no text"}]

    chunks = chunk_text(text, chunk_size)
    context = "\n".join(chunks)

    system_prompt = (
        "You are an assistant that MUST output a JSON array. "
        "Each element must be an object with keys: 'type' (QA or STUDY), 'content'. "
        "Generate at least 5 STUDY items and 2 QA items for the subtopic using the PDF context."
    )

    user_prompt = f"Subtopic: {subtopic}\n\nContext from PDF:\n{context}\n\nReturn JSON array of items only."

    assistant_text = call_openrouter([{"role": "system", "content": system_prompt},
                                      {"role": "user", "content": user_prompt}], model=model)

    parsed = extract_json(assistant_text)
    if parsed:
        # normalize type keys
        out = []
        for item in parsed:
            t = (item.get("type") or "STUDY").upper()
            t_norm = "QA" if t in ("QA", "Q&A", "QUESTION") else "STUDY"
            content = item.get("content", "").strip()
            if content:
                out.append({"type": t_norm, "content": content})
        if out:
            return out
    # fallback
    return [{"type": "STUDY", "content": assistant_text or "No content generated"}]
