"""
Standalone module to generate structured items (QA / STUDY) for a single subtopic
using OpenRouter chat completions. Drop this file into your project and import
`generate_subtopic_items` where needed.

Public API:
    generate_subtopic_items(subtopic: str, context: str = "", model: str = "openai/gpt-3.5-turbo", min_items: int = 6) -> List[Dict[str,str]]

Each returned item has the shape:
    {"type": "QA" | "STUDY", "content": "..."}

The module is defensive: it attempts to parse JSON from the model response and
falls back to returning a single STUDY item containing the raw text if parsing
fails.
"""

import os
import json
import re
import requests
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

if not OPENROUTER_API_KEY:
    raise ValueError("OpenRouter API key not found. Please check your .env file.")


# ------------------ Utility helpers ------------------

def _extract_json(text: str) -> Optional[str]:
    """Return the largest JSON object/array substring that successfully parses.
    If nothing parses, return None.
    """
    text = (text or "").strip()
    # Quick try: the whole text
    try:
        json.loads(text)
        return text
    except Exception:
        pass

    candidates: List[str] = []
    stack: List[tuple[str, int]] = []
    pairs = {"{": "}", "[": "]"}
    opens = set(pairs.keys())
    closes = set(pairs.values())

    for i, ch in enumerate(text):
        if ch in opens:
            stack.append((ch, i))
        elif ch in closes and stack:
            open_ch, start_idx = stack.pop()
            if pairs.get(open_ch) == ch:
                candidates.append(text[start_idx:i + 1])

    candidates.sort(key=len, reverse=True)
    for c in candidates:
        try:
            json.loads(c)
            return c
        except Exception:
            continue

    return None


def _validate_subtopic_items(parsed: Any, raw_text: str) -> List[Dict[str, str]]:
    """Normalize parsed model output into a list of {type, content} dicts.

    Accepts list/dict/string shapes and performs conservative repairs.
    """

    def normalize_type(t: Any) -> str:
        if not isinstance(t, str):
            return "STUDY"
        t_up = t.strip().upper()
        if t_up in {"QA", "Q&A", "Q/A", "QUESTION", "Q"}:
            return "QA"
        if t_up in {"STUDY", "NOTE", "NOTES", "SUMMARY", "EXPLAIN"}:
            return "STUDY"
        if "Q" in t_up and "A" in t_up:
            return "QA"
        return "STUDY"

    out: List[Dict[str, str]] = []

    # parsed is a list
    if isinstance(parsed, list):
        for elem in parsed:
            if isinstance(elem, dict):
                item_type = normalize_type(elem.get("type") or elem.get("kind") or elem.get("role"))
                content = elem.get("content") or elem.get("text") or elem.get("body") or ""
                if isinstance(content, str) and content.strip():
                    out.append({"type": item_type, "content": content.strip()})
            elif isinstance(elem, str) and elem.strip():
                out.append({"type": "STUDY", "content": elem.strip()})

        cleaned = [i for i in out if i.get("content")]
        if cleaned:
            return cleaned

    # parsed is a dict
    if isinstance(parsed, dict):
        # if dict looks like {"1": "Q...", "2": "..."} convert keys->items
        if all(isinstance(k, str) and isinstance(v, str) for k, v in parsed.items()):
            for k, v in parsed.items():
                item_type = normalize_type(k)
                if v.strip():
                    out.append({"type": item_type, "content": v.strip()})
            cleaned = [i for i in out if i.get("content")]
            if cleaned:
                return cleaned

        # standard single-item dict
        item_type = normalize_type(parsed.get("type") or parsed.get("kind"))
        content = parsed.get("content") or parsed.get("text") or parsed.get("body") or ""
        if isinstance(content, str) and content.strip():
            return [{"type": item_type, "content": content.strip()}]

    # fallback: embed raw text as a single STUDY item
    snippet = (raw_text or "").strip()
    if len(snippet) > 3000:
        snippet = snippet[:2997] + "..."
    return [{"type": "STUDY", "content": snippet or f"No content generated for subtopic."}]


# ------------------ Public API ------------------

# inside src/api/subtopic_items.py (replace previous generate_subtopic_items)
def generate_subtopic_items(
    subtopic: str,
    context: str = "",
    model: str = "openai/gpt-3.5-turbo",
    min_items: int = 6,
    temperature: float = 0.9,
    max_tokens: int = 2400,
    raise_on_error: bool = False,
) -> List[Dict[str, str]]:
    """
    Generate QA / STUDY items (safe: no import-time exceptions).
    If raise_on_error=True, it will re-raise caught exceptions (useful for local debugging).
    """
    # validate API key at call-time, not import-time
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
    if not OPENROUTER_API_KEY:
        msg = "OPENROUTER_API_KEY not set in environment"
        if raise_on_error:
            raise RuntimeError(msg)
        return [{"type": "STUDY", "content": msg}]

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    system_prompt = (
        "You are an assistant that MUST output only valid JSON (no markdown, no explanations). "
        "Output a JSON ARRAY. Each array element must be an OBJECT with exactly these keys:\n"
        '  \"type\": \"SUBTOPIC\",\n'
        '  \"name\": \"Short subtopic name\",\n'
        '  \"content\": \"detailed learning content for this subtopic\"\n\n'
        "Rules:\n"
        "1) make the content sound like a teacher make it extremely detailed do one paragraph per point, use real world examples and explain in detail\n"

        "2) Each object must have type exactly 'SUBTOPIC'.\n"
        "3) Do NOT include any additional top-level keys.\n"
        "4) The 'content' field must contain at least 1-3 detailed points, detailed explanation, or key concepts.\n"
        "5) Keep names concise. Do not include explanations outside the JSON.\n"
        "6)Give code snippets and real world examples whenever its a computer science topic "
        "7) Give Atleast 5 content jsons for each subtopic.\n"
        "8) Give Atleast 2 question jsons for each subtopic\n"
        "9)Top-level value MUST be an ARRAY even if it contains one element. \n"
        
    )

    user_prompt = (
        f"Subtopic: {subtopic}\n"
        f"Context (optional): {context}\n\n"
        "Return an ARRAY of subtopic objects only, each with a 'name' and meaningful 'content'. "
        
    )

    # (system_prompt and user_prompt same as earlier file)
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens
    }

    try:
        resp = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.RequestException as e:
        # network/API error: return an item that makes debugging visible
        err_msg = f"API request failed: {e}"
        if raise_on_error:
            raise
        return [{"type": "STUDY", "content": err_msg}]
    except Exception as e:
        if raise_on_error:
            raise
        return [{"type": "STUDY", "content": f"Unexpected error: {e}"}]

    # extract assistant text
    assistant_text = ""
    try:
        assistant_text = data["choices"][0]["message"]["content"] or ""
    except Exception:
        assistant_text = data.get("choices", [{}])[0].get("text", "") or ""

    assistant_text = (assistant_text or "").strip()

    # parse and validate (reuse _extract_json and _validate_subtopic_items)
    try:
        parsed = json.loads(assistant_text)
        items = _validate_subtopic_items(parsed, assistant_text)
    except json.JSONDecodeError:
        candidate = _extract_json(assistant_text)
        if candidate:
            try:
                parsed = json.loads(candidate)
                items = _validate_subtopic_items(parsed, assistant_text)
            except json.JSONDecodeError:
                items = [{"type": "STUDY", "content": assistant_text or "Malformed JSON returned by model"}]
        else:
            items = [{"type": "STUDY", "content": assistant_text or "No JSON returned by model"}]
    except Exception as e:
        if raise_on_error:
            raise
        return [{"type": "STUDY", "content": f"Parsing/validation error: {e}"}]

    # normalize types & content
    normalized = []
    for it in items:
        t = (it.get("type") or "STUDY").strip().upper()
        t_norm = "QA" if t in ("QA", "Q&A", "QUESTION", "Q/A") else "STUDY"
        content = (it.get("content") or "").strip()
        if content:
            normalized.append({"type": t_norm, "content": content})

    if not normalized:
        normalized = [{"type": "STUDY", "content": f"No generated content for subtopic: {subtopic}"}]

    return normalized

    
    # return generate_subtopic_items(context, query)

