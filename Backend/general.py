import os
import requests
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

if not OPENROUTER_API_KEY:
    raise ValueError("OpenRouter API key not found. Please check your .env file.")


def generate_general_response(context: str, query: str, model: str = "openai/gpt-4o-mini") -> str:
    """
    Calls OpenRouter API and returns a general response to the user's query,
    optionally using the provided context.
    """

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }

    system_prompt = (
        "You are an expert teacher. Use the full conversation history below, "
        "but give **highest priority to the most recent user query** when answering. "
        "If there are conflicts, resolve them in favor of the latest user input. "
        "Answer clearly and in detail, writing at least 3 paragraphs. "
        "Do NOT output JSON or code unless explicitly asked."
    )
    user_prompt = f"Question: {query}\n\nContext:\n{context if context else 'None'}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.9,
        "max_tokens": 1200
    }

    try:
        resp = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.RequestException as e:
        return f"Request failed: {str(e)}"
    except Exception:
        return f"Invalid response from API: {resp.text[:500]}"

    # Extract assistant message
    try:
        assistant_text = data["choices"][0]["message"]["content"]
    except Exception:
        assistant_text = "No response received from the model."

    return assistant_text.strip()
