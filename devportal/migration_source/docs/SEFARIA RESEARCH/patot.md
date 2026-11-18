---
title: Patot
excerpt: >-
  A Python toolkit for Hebrew/English-aware semantic chunking for model-ready
  units for downstream AI workflows
deprecated: false
hidden: false
metadata:
  robots: index
---
# Introducing Patot: Semantic Chunking for Jewish Texts

When you're building AI systems on top of long-form Jewish texts, one of the first problems you run into is chunking - how do you break a text into pieces that are small enough for a model to handle, but still meaningful enough to be useful?

We built [Patot](https://github.com/Sefaria/patot) to answer that question.

[Patot](https://github.com/Sefaria/patot) is an open-source Python toolkit for Hebrew/English-aware semantic chunking of Sefaria texts. It's designed to prepare texts for downstream AI workflows like embedding, retrieval, and question answering - and it's built around the specific structure and richness of Sefaria's corpus.

## The Problem with Naive Chunking

Most chunking strategies split text by character count or token limit. For general-purpose documents, that's often fine. For Jewish texts, it's a problem.

Sefaria's segment boundaries are meaningful. A chapter of Talmud, a passage of Maimonides, a section of Tanakh are structure that matters. Splitting across these segments blindly loses context, fractures arguments, and degrades retrieval quality.

At the same time, AI models have hard token limits. Ingesting an entire tractate is not feasible.

[Patot](https://github.com/Sefaria/patot) is designed to hold both constraints at once: respect the text's structure, and keep every chunk model-safe.

## How It Works

Patot processes one Sefaria section at a time, using a three-pass pipeline.

**Pass 1** runs semantic chunking across the ordered segments of a section, using statistical analysis of Gemini embeddings to identify where semantic continuity drops. Segments that belong together get grouped; segments that mark a topic shift get split. Crucially, chunk boundaries always fall on segment boundaries - **_Patot never splits a segment to complete a chunk_**.

**Pass 2** handles segments that weren't grouped with any neighbors in Pass 1. If a standalone segment is long enough to warrant further splitting, Patot applies the same semantic chunking method to break it into sentence and clause units. The result is either a group of whole segments, or a subdivision of exactly one segment.

**Pass 3** enforces hard token limits. Semantic chunking optimizes for coherence, not compliance - so this final pass validates every chunk against a configured maximum and splits any outliers safely.

## What You Get

The output is a set of chunks that are semantically coherent, structurally sound, and guaranteed to fit your embedding model. Whether you're building a RAG pipeline, a source-aware Q&A assistant, a topic clustering tool, or a source sheet recommender, [Patot](https://github.com/Sefaria/patot) gives you a principled foundation to build on.

## Try It

Patot is open source and available on GitHub. It's not yet on PyPI, but you can install it directly:

```bash
pip install "patot[chunking,pdf] @ git+https://github.com/Sefaria/patot@v0.1.0"
```

Full documentation and usage examples are in the [repo](https://github.com/Sefaria/patot). We'd love to hear how you're using it.

<Image align="center" src="https://files.readme.io/d2b8fe0feff426d8ad4b339d7eff1b96cdfa7bfb58d0702111bce739c0a08cce-patot_chunking_pipeline.svg" />

<br />
