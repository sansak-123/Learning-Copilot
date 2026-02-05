# import faiss
# import numpy as np

# class VectorStore:
#     def __init__(self, dim):
#         self.dim = dim
#         self.index = faiss.IndexFlatL2(dim)  # L2 distance
#         self.texts = []  # store original text chunks

#     def add(self, text_chunks: list, embeddings: list):
#         vectors = np.array(embeddings, dtype=np.float32)
#         self.index.add(vectors)
#         self.texts.extend(text_chunks)

#     def search(self, query_embedding, top_k=5):
#         D, I = self.index.search(np.array([query_embedding], dtype=np.float32), top_k)
#         results = [self.texts[i] for i in I[0] if i < len(self.texts)]
#         return results


# vectorstore.py
import numpy as np
import pickle
from typing import List, Tuple

class VectorStore:
    def __init__(self, dim: int):
        self.dim = dim
        self.vectors = np.zeros((0, dim), dtype=np.float32)  # shape: (n, dim)
        self.payloads: List[str] = []  # original text chunks
        self.ids: List[str] = []

    def add(self, texts: List[str], embeddings: List[List[float]], ids: List[str] = None):
        if not embeddings:
            return
        arr = np.array(embeddings, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)
        # append
        self.vectors = np.vstack([self.vectors, arr]) if self.vectors.size else arr
        self.payloads.extend(texts)
        if ids:
            self.ids.extend(ids)
        else:
            # generate ids if not supplied
            self.ids.extend([str(len(self.ids) + i) for i in range(len(texts))])

    def _cosine_sim(self, q: np.ndarray, candidates: np.ndarray) -> np.ndarray:
        # q: (dim,), candidates: (n, dim)
        q_norm = np.linalg.norm(q) + 1e-12
        c_norm = np.linalg.norm(candidates, axis=1) + 1e-12
        sims = (candidates @ q) / (c_norm * q_norm)
        return sims

    def search(self, query_embedding: List[float], top_k: int = 5) -> List[Tuple[str, float]]:
        if self.vectors.size == 0:
            return []
        q = np.array(query_embedding, dtype=np.float32)
        sims = self._cosine_sim(q, self.vectors)
        idx = np.argsort(-sims)[:top_k]
        results = [(self.payloads[i], float(sims[i])) for i in idx]
        return results

    def save(self, path: str):
        with open(path, "wb") as f:
            pickle.dump({"dim": self.dim, "vectors": self.vectors, "payloads": self.payloads, "ids": self.ids}, f)

    @classmethod
    def load(cls, path: str):
        with open(path, "rb") as f:
            data = pickle.load(f)
        vs = cls(dim=data["dim"])
        vs.vectors = data["vectors"]
        vs.payloads = data["payloads"]
        vs.ids = data["ids"]
        return vs
