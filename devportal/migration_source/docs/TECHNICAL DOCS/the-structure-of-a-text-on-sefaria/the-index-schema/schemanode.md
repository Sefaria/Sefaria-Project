---
title: SchemaNode
excerpt: >-
  These intermediate nodes are used to define the schema of an Index, thereby
  creating the structure of a book.
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
  pages:
    - type: basic
      slug: the-structure-of-a-simple-text
      title: The Structure of a Simple Text
---
# `SchemaNode`

A `SchemaNode` is an intermediate node in the `Index` schema tree.  A `SchemaNode` generally serves to position multiple child nodes in an order.  Together, the nodes form trees that define a storage format.  Versions of a text will follow the structure as defined by the schema [tree](https://en.wikipedia.org/wiki/Tree_\(data_structure\)).

Here's the easiest way to think of a `SchemaNode` as found in the context of most texts in the Sefaria Library:

As opposed to a `JaggedArrayNode`, which indicates that text will be stored at this location. (i.e., the `Version` has a `JaggedArray` at this point in the structure, containing the text in nested arrays), this node _positions other nodes_.

A complex text will be comprised of a `SchemaNode` with other nodes as children. The nodes at the leaves, indicating locations where text can be stored, will be of type`JaggedArrayNode`.

For more on `SchemaNode`, and to view examples, see [The Structure of a Complex Text](doc:the-structure-of-a-complex-text).
