from functools import lru_cache

from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def get_embedding_model() -> SentenceTransformer:
    return SentenceTransformer(EMBEDDING_MODEL)


def split_text(text: str) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    return [chunk for chunk in splitter.split_text(text) if chunk.strip()]


def embed_documents(chunks: list[str]) -> list[list[float]]:
    if not chunks:
        return []

    embeddings = get_embedding_model().encode(
        chunks,
        batch_size=16,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    embedding = get_embedding_model().encode(
        query,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    return embedding.tolist()
