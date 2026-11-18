---
title: The Structure of a Book in the Sefaria Library
excerpt: >-
  Learn about the structure the data corresponding to individual texts in the
  Sefaria Library.
deprecated: false
hidden: false
metadata:
  title: ''
  description: >-
    Each book on Sefaria is represented by a unique Index, which may have one or
    more Version objects (translations or editions) associated with it, and is
    supported by a schema that provides structural and metadata information.
  robots: index
next:
  description: ''
  pages:
    - type: basic
      slug: each-book-is-an-index
      title: Index and Versions
---
### Quick Notes on Indexes and Versions in the Sefaria Library

Each book in the Sefaria Library is represented by a unique `Index`. Each book has one, and only one, `Index` associated with it.

Each version of a text (a translation, a different edition, etc.) is represented by a `Version` object. While it's possible for an `Index` to have no `Version` objects associated with it, this is not generally the case. More commonly, each `Index` will have at least one `Version` object associated with it.

**For more information about the `Index` and `Version` structures, see [Index and Versions](doc:each-book-is-an-index).**

<br />

Each `Index` is supported by a schema which represents the structure of the book in question and provides important relevant metadata and structural information.

**For more information about the Index Schema structure, read about [the Index Schema](doc:the-index-schema).**

<br />
