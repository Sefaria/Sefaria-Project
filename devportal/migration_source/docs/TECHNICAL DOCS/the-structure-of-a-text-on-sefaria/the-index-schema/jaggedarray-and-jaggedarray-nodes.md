---
title: JaggedArray and JaggedArray Nodes
excerpt: >-
  JaggedArray and JaggedArrayNodes are objects used for representing both the
  text content and the structure of simple texts.
deprecated: false
hidden: false
metadata:
  title: ''
  description: >-
    The document explains the structure and use of JaggedArrayNodes and
    JaggedArrays in organizing text data, particularly in representing texts
    like the Tanakh, where chapters are sections and verses are segments within
    a nested list structure.
  robots: index
next:
  description: ''
  pages:
    - type: basic
      slug: schemanode
      title: SchemaNode
---
# Content Nodes

Content nodes describe the structure in which the text is stored, from that level of the tree onward.  Currently, all content nodes are `JaggedArrayNodes` — nodes which describe a `JaggedArray` (i.e., a list of lists) structure.

# `JaggedArray`

A `JaggedArray` is a nested array of a specific depth, with the lowest level being an array of strings.  A `JaggedArray` with a depth of 2 is an array of arrays of strings. A typical example of a text represented by a `JaggedArray` of a depth of 2 is the structure of a book of Tanakh. A book of Tanakh has many chapters, and each chapter has many verses.  Each chapter is represented by an array within the outer array, which contains numerous strings, each representing a verse. An item's position in the array reflects its structural information.

## Example: A `JaggedArray` of `depth=2`

The example below mocks a `JaggedArray` for a text with four chapters, each containing a variable number of verses. Each sub-array represents a chapter. Each string inside the sub-array is a verse of the given chapter.

```python
[
  ["Text of 1:1", "Text of 1:2", ], # Chapter 1
  ["Text of 2:1", "Text of 2:2", "Text of 2:3", "Text of 2:4", "Text of 2:5"], # Chapter 2
  ["Text of 3:1", "Text of 3:2", "Text of 3:3"], # Chapter 3
  ["Text of 4:1", "Text of 4:2", "Text of 4:3", "Text of 4:4"] # Chapter 4

]
```

We refer to these objects as a `JaggedArray` since any element in the array could be empty, as many of our text versions are incomplete.

# `JaggedArrayNode`

A `JaggedArrayNode` in the schema of an `Index` is a node that indicates there will be a `JaggedArray` present to represent this part of the text in the `Version` record.   The simplest example is a schema that consists of a single `JaggedArrayNode`. In the `Version`, the entire book is contained in a single array.

## Segments and Sections

At Sefaria, we refer to the strings at the bottom of the `JaggedArray` as **segments**. The arrays that contain those strings are called **sections**. Generally speaking, segments reflect the maximum resolution that we are capable of reaching in a given text. Therefore, you can't directly reference a part of a segment.

For example, in a book of Tanakh organized into chapters and verses, a chapter would be a **section** and a verse would be a **segment**.
