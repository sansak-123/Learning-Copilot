
# # from fastapi import FastAPI
# # from dotenv import load_dotenv
# # import os
# # from client import generate_api_response

# # load_dotenv()

# # DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

# # app = FastAPI(title="RAG Playground 🚀")

# # # Dummy documents / context for testing
# # docs = [
# #     "Python is a programming language.",
# #     "FastAPI is a Python framework for building APIs.",
# #     "LangChain helps you build RAG applications."
# # ]

# # def ask_question(query: str) -> str:
# #     """
# #     Retrieves context from documents and queries DeepSeek API.
# #     """
# #     # For now, just join all docs as context
# #     context = "\n".join(docs)
# #     return generate_api_response(context, query)

# # @app.get("/")
# # def home():
# #     return {"message": "RAG Playground running 🚀"}

# # @app.get("/ask")
# # def ask(q: str):
# #     answer = ask_question(q)
# #     return {"question": q, "answer": answer}


# # main.py
# # from fastapi import FastAPI, Query
# # from fastapi.middleware.cors import CORSMiddleware
# # from pydantic import BaseModel
# # from typing import List
# from dotenv import load_dotenv

# from fastapi import FastAPI, UploadFile, File, Form, Query, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from typing import List,Any
# from pydantic import BaseModel
# from io import BytesIO
# import PyPDF2
# from pdf import extract_pdf_text, chunk_text
# from embeddings import get_embedding
# from vectorstore import VectorStore
# import hashlib
# import json
# from pdf import extract_pdf_text, chunk_text    

# load_dotenv()

# from client import generate_api_response
# from content import generate_subtopic_items
# from general import generate_general_response   

# app = FastAPI(title="RAG Roadmap API")

# origins = [
#     "http://localhost:3000",
#     "http://127.0.0.1:3000",
# ]

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=origins,            # Allow only your local frontend
#     allow_credentials=True,
#     allow_methods=["GET", "POST", "OPTIONS"],  # adjust as needed
#     allow_headers=["*"],
# )

# metadata_cache = {}  # dict with metadata hash as key



# def get_or_create_store(metadata_str):
#     key = hashlib.md5(metadata_str.encode()).hexdigest()
#     if key in metadata_cache:
#         return metadata_cache[key]
#     chunks = chunk_text(metadata_str)
#     embeddings = [get_embedding(c) for c in chunks]
#     store = VectorStore(dim=len(embeddings[0]))
#     store.add(chunks, embeddings)
#     metadata_cache[key] = store
#     return store

# # Pydantic models for response docs
# class SubtopicItemModel(BaseModel):
#     type: str
#     content: str

# class SubtopicModel(BaseModel):
#     type: str
#     name: str

# class TopicModel(BaseModel):
#     type: str
#     name: str
#     subtopics: List[SubtopicModel]

# class MetadataModel(BaseModel):
#     events: List[Any]
#     roadmap: List[Any]
#     messages: List[Any]

# class GeneralRequest(BaseModel):
#     metadata: MetadataModel
#     query: str




# @app.get("/")
# def home():
#     return {"message": "RAG Roadmap running"}

# @app.get("/ask", response_model=List[TopicModel])
# def ask(q: str = Query(..., description="Subject to generate roadmap for")):
#     """
#     Returns an array of Topic objects for the requested subject.
#     """
#     # You can include ctx from files/repo if available, currently empty string used
#     context = ""
#     result = generate_api_response(context, q)
#     # result=generate_subtopic_items(context, q)
#     # result is already a list of dicts validated & repaired by client
#     return result

# # ------------------ content.py ------------------
# @app.get("/content")
# def ask(q: str = Query(..., description="Subject to generate roadmap for")):
#     """
#     Returns an array of Topic objects for the requested subject.
#     """
#     # You can include ctx from files/repo if available, currently empty string used
#     context = ""
#     # result = generate_api_response(context, q)
#     result=generate_subtopic_items(context, q)
#     # result is already a list of dicts validated & repaired by client
#     return result

# @app.post("/general")
# def general(request: GeneralRequest):
#     """
#     Accepts metadata and a query, uses metadata as context,
#     returns standardized output from LLM.
#     """
#     # Flatten metadata as context string
#     try:
#         import json
#         context_str = json.dumps(request.metadata.dict())
#     except Exception as e:
#         raise HTTPException(status_code=400, detail=f"Invalid metadata: {e}")

#     query = request.query

#     try:
#         # Call your existing API wrapper (no system prompt)
#         result = generate_general_response(context_str, query)
#         return result
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Error generating response: {e}")



# @app.post("/pdf/topics", response_model=List[TopicModel])
# async def pdf_topics(file: UploadFile = File(...), query: str = Form(...)):
#     """
#     Generate topics and subtopics from uploaded PDF.
#     """
#     if not file.filename.endswith(".pdf"):
#         raise HTTPException(status_code=400, detail="Only PDF files are supported")
#     try:
#         chunks = extract_pdf_text(file.file)
#         context = "\n".join(chunks)
#         result = generate_api_response(context, query)
#         return result
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Error generating topics: {e}")

# @app.post("/pdf/subtopic_items", response_model=List[SubtopicItemModel])
# async def pdf_subtopic_items(file: UploadFile = File(...), subtopic: str = Form(...)):
#     """
#     Generate QA/STUDY items for a subtopic from uploaded PDF.
#     """
#     if not file.filename.endswith(".pdf"):
#         raise HTTPException(status_code=400, detail="Only PDF files are supported")
#     try:
#         chunks = extract_pdf_text(file.file)
#         context = "\n".join(chunks)
#         result = generate_subtopic_items(subtopic, context)
#         return result
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Error generating subtopic items: {e}")
    

# @app.post("/pdf/topics_embeddings")
# async def pdf_topics_embeddings(file: UploadFile = File(...), query: str = Form(...)):
#     try:
#         if not file.filename.endswith(".pdf"):
#             raise HTTPException(status_code=400, detail="Only PDF files are supported")

#         # Extract PDF text and chunk
#         text = extract_pdf_text(file.file)
#         chunks = chunk_text(text, chunk_size=300)
#         if not chunks:
#             raise HTTPException(status_code=400, detail="PDF is empty")

#         # Generate embeddings safely
#         embeddings = []
#         for c in chunks:
#             try:
#                 emb = get_embedding(c)
#                 embeddings.append(emb)
#             except Exception as e:
#                 print(f"Skipping chunk due to embedding error: {e}")

#         if not embeddings:
#             raise HTTPException(status_code=500, detail="Failed to generate embeddings for PDF")

#         # Build vector store
#         store = VectorStore(dim=len(embeddings[0]))
#         store.add(chunks, embeddings)

#         # Embed query and search
#         query_embedding = get_embedding(query)
#         relevant_chunks = store.search(query_embedding, top_k=5)
#         context = "\n".join(relevant_chunks)

#         # Call LLM
#         result = generate_api_response(context, query)
#         return result

#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


# main.py
from fastapi import FastAPI, UploadFile, File, Form, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import logging
import json
import hashlib
from dotenv import load_dotenv
import os

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Import your modules with error handling
try:
    from client import generate_api_response
    from content import generate_subtopic_items
    from general import generate_general_response
    from pdf import extract_pdf_text, chunk_text
    from embeddings import get_embedding
    from vectorstore import VectorStore
    logger.info("Successfully imported all modules")
except ImportError as e:
    logger.error(f"Import error: {e}")
    # Create fallback functions if imports fail
    def generate_api_response(context, query):
        return [{"type": "TOPIC", "name": "Error", "subtopics": [{"type": "SUBTOPIC", "name": "Import Error", "content": str(e)}]}]
    
    def generate_subtopic_items(subtopic, context=""):
        return [{"type": "STUDY", "content": f"Import error: {e}"}]

app = FastAPI(title="Learning App with PDF Support")

# CORS setup
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Global cache for vector stores
metadata_cache: Dict[str, Any] = {}

# Pydantic Models
class SubtopicItemModel(BaseModel):
    type: str  # "QA" or "STUDY"
    content: str

class SubtopicModel(BaseModel):
    type: str
    name: str
    content: Optional[str] = ""

class TopicModel(BaseModel):
    type: str
    name: str
    subtopics: List[SubtopicModel]

class MetadataModel(BaseModel):
    events: List[Any] = []
    roadmap: List[Any] = []
    messages: List[Any] = []

class GeneralRequest(BaseModel):
    metadata: MetadataModel
    query: str

class PDFQueryResponse(BaseModel):
    query: str
    answer: str
    context_used: str
    source: str = "PDF"

# Helper Functions
def get_or_create_store(text_content: str) -> Any:
    """Create or retrieve cached vector store for text content"""
    try:
        key = hashlib.md5(text_content.encode()).hexdigest()
        if key in metadata_cache:
            logger.info("Using cached vector store")
            return metadata_cache[key]
        
        # Create new vector store
        chunks = chunk_text(text_content, chunk_size=500)  # Smaller chunks for better context
        if not chunks:
            raise ValueError("No chunks generated from text")
            
        embeddings = []
        for chunk in chunks:
            try:
                emb = get_embedding(chunk)
                embeddings.append(emb)
            except Exception as e:
                logger.warning(f"Failed to embed chunk: {e}")
        
        if not embeddings:
            raise ValueError("No embeddings generated")
            
        store = VectorStore(dim=len(embeddings[0]))
        store.add(chunks, embeddings)
        metadata_cache[key] = store
        logger.info(f"Created new vector store with {len(chunks)} chunks")
        return store
        
    except Exception as e:
        logger.error(f"Error creating vector store: {e}")
        return None

# Routes

@app.get("/")
def home():
    return {"message": "Learning App API Running", "endpoints": ["/ask", "/content", "/pdf/query", "/pdf/topics", "/general"]}

@app.get("/health")
def health_check():
    return {"status": "healthy", "message": "API is running"}

# @app.get("/ask", response_model=List[TopicModel])
# def ask(q: str = Query(..., description="Subject to generate roadmap for")):
#     """Generate learning roadmap for a subject (without PDF)"""
#     try:
#         logger.info(f"Generating roadmap for: {q}")
#         context = ""
#         result = generate_api_response(context, q)
#         logger.info(f"Generated {len(result)} topics")
#         return result
#     except Exception as e:
#         logger.error(f"Error in /ask: {e}")
#         raise HTTPException(status_code=500, detail=f"Error generating roadmap: {str(e)}")

# @app.get("/content", response_model=List[SubtopicItemModel])
# def content(q: str = Query(..., description="Subject to generate content for")):
#     """Generate learning content items for a subject (without PDF)"""
#     try:
#         logger.info(f"Generating content for: {q}")
#         context = ""
#         result = generate_subtopic_items(subtopic=q, context=context)
#         logger.info(f"Generated {len(result)} content items")
#         return result
#     except Exception as e:
#         logger.error(f"Error in /content: {e}")
#         raise HTTPException(status_code=500, detail=f"Error generating content: {str(e)}")

@app.get("/ask", response_model=List[TopicModel])
def ask(q: str = Query(..., description="Subject to generate roadmap for")):
    """
    Returns an array of Topic objects for the requested subject.
    """
    # You can include ctx from files/repo if available, currently empty string used
    context = ""
    result = generate_api_response(context, q)
    # result=generate_subtopic_items(context, q)
    # result is already a list of dicts validated & repaired by client
    return result

# ------------------ content.py ------------------
@app.get("/content")
def ask(q: str = Query(..., description="Subject to generate roadmap for")):
    """
    Returns an array of Topic objects for the requested subject.
    """
    # You can include ctx from files/repo if available, currently empty string used
    context = ""
    # result = generate_api_response(context, q)
    result=generate_subtopic_items(context, q)
    # result is already a list of dicts validated & repaired by client
    return result
# main.py  (only the changed / added bits)

import hashlib

# --- fix: logger name ---
logger = logging.getLogger(__name__)  # was _name_

def _sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()

@app.post("/pdf/query")
async def pdf_query(
    file: UploadFile = File(..., description="PDF file to analyze"),
    query: str = Form(..., description="Question about the PDF content")
):
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Please upload a PDF file")
    try:
        logger.info(f"Processing PDF query: {query} for file: {file.filename}")
        pdf_text = extract_pdf_text(file.file)
        if not pdf_text or len(pdf_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="PDF appears to be empty or has insufficient text")

        # choose context strategy (same as your code)
        if len(pdf_text) < 10000:
            context = pdf_text
            answer = generate_api_response(context, query)
            source_label = f"PDF: {file.filename}"
        else:
            try:
                store = get_or_create_store(pdf_text)
                if store is None:
                    chunks = chunk_text(pdf_text, chunk_size=1000)
                    context = "\n\n".join(chunks[:5])
                else:
                    query_embedding = get_embedding(query)
                    relevant_chunks = store.search(query_embedding, top_k=3)
                    context = "\n\n".join(relevant_chunks)

                try:
                    answer = generate_general_response(context, query)
                except Exception:
                    answer = f"Query: {query}\n\nRelevant PDF content:\n{context}"
                source_label = f"PDF: {file.filename} (vector search)"
            except Exception as e:
                logger.warning(f"Vector search failed, using fallback: {e}")
                chunks = chunk_text(pdf_text, chunk_size=1000)
                context = "\n\n".join(chunks[:3])
                answer = f"Based on the PDF content:\n\n{context}"
                source_label = f"PDF: {file.filename} (fallback)"

        context_excerpt = context[:1200]  # keep it light for metadata
        metadata_patch = {
            "type": "pdf",
            "filename": file.filename,
            "context_excerpt": context_excerpt,
            "context_hash": _sha1(context_excerpt),
            "bytes_used": len(context),
            "source": source_label,
        }

        return {
            "query": query,
            "answer": answer,
            "context_used": context_excerpt,
            "source": source_label,
            "metadata_patch": metadata_patch,   # <—— NEW
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing PDF query: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

@app.post("/pdf/topics", response_model=List[TopicModel])
async def pdf_topics(
    file: UploadFile = File(..., description="PDF file to analyze"),
    query: str = Form(..., description="Subject to generate roadmap for")
):
    """Generate learning roadmap from PDF content"""
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Please upload a PDF file")
    
    try:
        logger.info(f"Generating topics from PDF: {file.filename}")
        pdf_text = extract_pdf_text(file.file)
        
        if not pdf_text or len(pdf_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="PDF appears to be empty or has insufficient text")
        
        # Chunk the text for context
        chunks = chunk_text(pdf_text, chunk_size=2000)
        context = "\n\n".join(chunks[:5])  # Use first 5 chunks as context
        
        result = generate_api_response(context, query)
        logger.info(f"Generated {len(result)} topics from PDF")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating topics from PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

@app.post("/pdf/content", response_model=List[SubtopicItemModel])
async def pdf_content(
    file: UploadFile = File(..., description="PDF file to analyze"),
    subtopic: str = Form(..., description="Subtopic to generate content for")
):
    """Generate learning content for a subtopic from PDF"""
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Please upload a PDF file")
    
    try:
        logger.info(f"Generating content for subtopic: {subtopic}")
        pdf_text = extract_pdf_text(file.file)
        
        if not pdf_text or len(pdf_text.strip()) < 50:
            raise HTTPException(status_code=400, detail="PDF appears to be empty or has insufficient text")
        
        chunks = chunk_text(pdf_text, chunk_size=1500)
        context = "\n\n".join(chunks[:3])  # Use first 3 chunks as context
        
        result = generate_subtopic_items(subtopic=subtopic, context=context)
        logger.info(f"Generated {len(result)} content items")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating content from PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")


# @app.post("/general")
# def general(request: GeneralRequest):
#     """
#     Accepts metadata and a query, uses metadata as context,
#     returns standardized output from LLM.
#     """
#     # Flatten metadata as context string
#     try:
#         import json
#         context_str = json.dumps(request.metadata.dict())
#     except Exception as e:
#         raise HTTPException(status_code=400, detail=f"Invalid metadata: {e}")

#     query = request.query

#     try:
#         # Call your existing API wrapper (no system prompt)
#         result = generate_general_response(context_str, query)
#         return result
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Error generating response: {e}")


# replace your existing /general route with this function
@app.post("/general")
def general(request: GeneralRequest):
    """
    Accepts metadata and a query, uses metadata as context via local embeddings,
    and returns a focused answer (prioritizing recent messages).
    """
    try:
        md = request.metadata.dict()
        query = request.query.strip()

        # 1) Build textual corpus items from metadata (keep items short & meaningful)
        items = []
        if md.get("events"):
            # keep events compact
            try:
                ev_text = "\n".join(
                    (f"{e.get('type','event')}: {e.get('text', json.dumps(e))}" 
                     if isinstance(e, dict) else str(e))
                    for e in md["events"]
                )
                items.append("Events:\n" + ev_text)
            except Exception:
                items.append("Events: " + json.dumps(md["events"])[:1000])

        if md.get("roadmap"):
            try:
                items.append("Roadmap:\n" + json.dumps(md["roadmap"]))
            except Exception:
                items.append("Roadmap (truncated)")

        # messages: preserve role + content as separate items (better retrieval granularity)
        if md.get("messages"):
            for m in md["messages"]:
                role = m.get("role", "user") if isinstance(m, dict) else "user"
                content = m.get("content", str(m)) if isinstance(m, dict) else str(m)
                # keep messages reasonably short
                items.append(f"{role}: {content}")

        # if items is empty, build a fallback from full metadata json
        if not items:
            items = [json.dumps(md)[:4000]]

        # 2) Create / load vector store for the metadata corpus
        # join into a single text blob for hashing in get_or_create_store
        corpus_blob = "\n\n".join(items)
        store = get_or_create_store(corpus_blob)

        # 3) Build context using vector search (if store exists), otherwise fallback to raw blob
        context_blocks = []
        TOP_K = 6
        if store is not None:
            try:
                q_emb = get_embedding(query)
                hits = store.search(q_emb, top_k=TOP_K)  # returns list of (text, score)
                # take only the texts (most relevant first)
                context_blocks = [h[0] if isinstance(h, (list, tuple)) else h for h in hits]
                # dedupe while preserving order
                seen = set()
                deduped = []
                for c in context_blocks:
                    if c not in seen:
                        deduped.append(c)
                        seen.add(c)
                context_blocks = deduped
            except Exception as e:
                logger.warning(f"Vector search failed: {e}")
                context_blocks = [corpus_blob]
        else:
            context_blocks = [corpus_blob]

        # 4) Always append the last 1-2 messages explicitly to prioritize recency
        last_msgs = (md.get("messages") or [])[-2:]
        for lm in last_msgs:
            if isinstance(lm, dict):
                context_blocks.append(f"{lm.get('role','user')}: {lm.get('content','')}")
            else:
                context_blocks.append(f"user: {lm}")

        # 5) Append the latest user query (strong recency signal)
        context_blocks.append(f"Latest user query: {query}")

        # 6) Assemble final context string, trimming to safe length
        # adjust trim_chars to suit your LLM token budget (e.g., 3000-6000 characters)
        trim_chars = 4000
        context = "\n\n".join(context_blocks)
        if len(context) > trim_chars:
            # keep most relevant: take top hits and always keep the tail (recent messages + query)
            # find split point where we keep last ~1000 chars for recency then fill from start
            tail = "\n\n".join(context_blocks[-3:])  # last few blocks
            head = "\n\n".join(context_blocks[: max(0, TOP_K - 3)])
            composed = head + "\n\n" + tail
            context = composed[:trim_chars]

        # 7) Call your LLM wrapper with the context and query
        answer = generate_general_response(context, query)

        # 8) Return structured response plus a small metadata patch for caching/logging
        context_excerpt = context[:1200]
        metadata_patch = {
            "context_hash": hashlib.sha1(context_excerpt.encode("utf-8")).hexdigest(),
            "context_excerpt": context_excerpt,
            "source": "metadata_vector_search" if store is not None else "metadata_raw",
            "items_indexed": len(items)
        }

        return answer

    except Exception as e:
        logger.exception("Error in /general route")
        raise HTTPException(status_code=500, detail=f"Error generating response: {str(e)}")
