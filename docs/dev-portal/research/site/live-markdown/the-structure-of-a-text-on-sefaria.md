---
updatedAt: 2026-02-19T16:19:49.000Z
agentTools:
  projectIndex: https://developers.sefaria.org/llms.txt
---

# The Structure of a Book in the Sefaria Library

Learn about the structure the data corresponding to individual texts in the Sefaria Library.

### Quick Notes on Indexes and Versions in the Sefaria Library

Each book in the Sefaria Library is represented by a unique `Index`. Each book has one, and only one, `Index` associated with it.

Each version of a text (a translation, a different edition, etc.) is represented by a `Version` object. While it's possible for an `Index` to have no `Version` objects associated with it, this is not generally the case. More commonly, each `Index` will have at least one `Version` object associated with it.

**For more information about the `Index` and `Version` structures, see [Index and Versions](https://developers.sefaria.org/docs/each-book-is-an-index).**

<br />

Each `Index` is supported by a schema which represents the structure of the book in question and provides important relevant metadata and structural information.

**For more information about the Index Schema structure, read about [the Index Schema](https://developers.sefaria.org/docs/the-index-schema).**

<br />