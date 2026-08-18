"""Create and populate the Linker webpage Elasticsearch index."""

import argparse
import django

django.setup()

from django.conf import settings
from semantic_search.embedder import embed_documents
from sefaria.helper.webpage_search import create_webpage_search_index, index_all_webpage_texts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--index-name")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--without-embeddings", action="store_true")
    args = parser.parse_args()

    index_name = create_webpage_search_index(args.index_name, force=args.force)
    embedding_callback = None
    if not args.without_embeddings:
        api_key = getattr(settings, "GEMINI_API_KEY", "")
        if not api_key:
            raise SystemExit("GEMINI_API_KEY is required unless --without-embeddings is used")
        embedding_callback = lambda texts: embed_documents(texts, api_key=api_key)
    count = index_all_webpage_texts(index_name, embedding_callback)
    print(f"Indexed {count} webpage chunks into {index_name}")


if __name__ == "__main__":
    main()
