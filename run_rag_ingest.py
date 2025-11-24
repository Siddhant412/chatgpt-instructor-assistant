#!/usr/bin/env python3
"""Run RAG ingestion on server/data/pdfs"""

import sys
from pathlib import Path

# Add webapp/backend to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root / "webapp" / "backend"))

from rag.ingest import load_pdfs, split_documents, create_faiss_index

def main():
    papers_dir = "server/data/pdfs"
    index_dir = "index"

    print("=" * 50)
    print("PDF Ingestion Pipeline")
    print("=" * 50)
    print(f"Papers directory: {papers_dir}")
    print(f"Index directory: {index_dir}")
    print("=" * 50)

    documents = load_pdfs(papers_dir)

    if not documents:
        print(f"No documents to process. Please add PDF files to {papers_dir}/")
        return

    chunks = split_documents(documents, chunk_size=1200, chunk_overlap=200)
    create_faiss_index(chunks, index_dir=index_dir)

    print("=" * 50)
    print("✓ Ingestion complete!")
    print("=" * 50)
    print("\nYou can now query the RAG system!")

if __name__ == "__main__":
    main()

