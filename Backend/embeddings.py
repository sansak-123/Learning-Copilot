# import os
# import openai
# import numpy as np

# openai.api_key = os.getenv("OPENAI_API_KEY")

# def get_embedding(text: str, model="text-embedding-3-small") -> np.ndarray:
#     """Return embedding vector for a given text."""
#     resp = openai.Embedding.create(input=text, model=model)
#     return np.array(resp['data'][0]['embedding'], dtype=np.float32)


# embeddings_local.py
from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List
import math

# Choose compact & fast model: 'all-MiniLM-L6-v2' (small, works great)
# If you have GPU & more RAM, you can pick larger models.
MODEL_NAME = "all-MiniLM-L6-v2"
_model = None

def _ensure_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model

def get_embedding(text: str) -> List[float]:
    """
    Return a list[float] embedding for the input text using sentence-transformers.
    """
    model = _ensure_model()
    emb = model.encode(text, show_progress_bar=False, convert_to_numpy=True)
    # normalize to unit vector (helps cosine similarity)
    norm = np.linalg.norm(emb) + 1e-12
    emb = emb / norm
    return emb.tolist()

def get_embeddings(texts: List[str], batch_size: int = 32) -> List[List[float]]:
    """
    Batch encode texts. Returns list of normalized vectors.
    """
    model = _ensure_model()
    embeddings = model.encode(texts, batch_size=batch_size, show_progress_bar=False, convert_to_numpy=True)
    # normalize rows
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True) + 1e-12
    embeddings = embeddings / norms
    return embeddings.tolist()
