# from langchain.embeddings import OpenAIEmbeddings
# from langchain.chat_models import ChatOpenAI
# from langchain.vectorstores import FAISS
# from langchain.chains import RetrievalQA
# from langchain.schema import Document
# from langchain.schema import HumanMessage

# from dotenv import load_dotenv
# import os

# load_dotenv()  # loads variables from .env

# # # Load embeddings + LLM
# # api_key = os.getenv("OPENAI_API_KEY")

# # embeddings = OpenAIEmbeddings(openai_api_key=api_key)
# # llm = ChatOpenAI(openai_api_key=api_key, model_name="gpt-3.5-turbo")
# # # For now just return dummy
# # def ask_question(query: str) -> str:
# #     return f"Echo: {query} "

# # api_key = os.getenv("OPENAI_API_KEY")
# # # Initialize the Chat model
# # llm = ChatOpenAI(openai_api_key=api_key, model_name="gpt-3.5-turbo")

# # def ask_question(query: str) -> str:
# #     """
# #     Sends the query directly to the LLM and returns the response.
# #     """
# #     # Wrap the query in a HumanMessage
# #     message = HumanMessage(content=query)
# #     response = llm([message])  # call the model directly with a list of messages
# #     return response.content



# api_key = os.getenv("OPENAI_API_KEY")

# # Initialize embeddings + LLM
# embeddings = OpenAIEmbeddings(openai_api_key=api_key)
# llm = ChatOpenAI(openai_api_key=api_key, model_name="gpt-3.5-turbo")

# # Dummy documents for testing
# docs = [
#     Document(page_content="Python is a programming language."),
#     Document(page_content="FastAPI is a Python framework for building APIs."),
#     Document(page_content="LangChain helps you build RAG applications."),
# ]

# # Create FAISS vector store
# vector_store = FAISS.from_documents(docs, embeddings)

# # Create a retrieval-based QA chain
# retriever = vector_store.as_retriever()
# qa = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)

# # Function to ask questions
# def ask_question(query: str) -> str:
#     return qa.run(query)



import os
import requests
from dotenv import load_dotenv
from langchain.chat_models import ChatOpenAI
from langchain.schema import HumanMessage

load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Initialize LLM (still using OpenAI for answer generation)
llm = ChatOpenAI(openai_api_key=OPENAI_API_KEY, model_name="gpt-3.5-turbo")

# Dummy documents for testing
docs = [
    {"id": "1", "content": "Python is a programming language."},
    {"id": "2", "content": "FastAPI is a Python framework for building APIs."},
    {"id": "3", "content": "LangChain helps you build RAG applications."},
]

# Function to create embeddings in Deepseek
def create_deepseek_embeddings(texts):
    url = "https://api.deepseek.ai/v1/embeddings"
    headers = {"Authorization": f"Bearer {DEEPSEEK_API_KEY}"}
    data = {"texts": texts}
    response = requests.post(url, json=data, headers=headers)
    response.raise_for_status()
    return response.json()["embeddings"]

# Generate embeddings for docs
doc_texts = [d["content"] for d in docs]
embeddings = create_deepseek_embeddings(doc_texts)

# Store embeddings in a simple list for retrieval
for i, d in enumerate(docs):
    d["embedding"] = embeddings[i]

# Function to compute cosine similarity
import numpy as np

def cosine_similarity(a, b):
    a = np.array(a)
    b = np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# Retrieval function using Deepseek embeddings
def retrieve_docs(query, top_k=2):
    query_embedding = create_deepseek_embeddings([query])[0]
    scores = [(d, cosine_similarity(query_embedding, d["embedding"])) for d in docs]
    scores.sort(key=lambda x: x[1], reverse=True)
    return [d["content"] for d, _ in scores[:top_k]]

# Function to ask a question using retrieved docs + LLM
def ask_question(query: str) -> str:
    relevant_docs = retrieve_docs(query)
    context = "\n".join(relevant_docs)
    prompt = f"Answer the question based on the following context:\n{context}\n\nQuestion: {query}"
    message = HumanMessage(content=prompt)
    response = llm([message])
    return response.content

# Example usage
if __name__ == "__main__":
    print(ask_question("What is FastAPI?"))
    answer = ask_question(q)