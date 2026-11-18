---
title: The Structure of a Complex Text
excerpt: >-
  Learn more about the Index schema of "complex" texts and how they work in the
  context of the structures of texts in the Sefaria Library. 
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
      slug: node-titles
      title: Node Titles
---
# Complex Schemas (Multi-Node Trees)

Texts that are more complex than a simple `Jagged Array` need a complex Index schema.  Complex schemas are always structured as trees of many nodes, usually a combination of `SchemaNode` and `JaggedArrayNode`.  Each node has a `key` and `titles`. If it is a `SchemaNode`, it will have other nodes as children; otherwise, it is a `JaggedArrayNode` describing `JaggedArray` content.

_Please note: The`titles` blocks in all of the examples below were left as empty arrays for the sake of brevity, and `sharedTitle` was omitted for the same reasons. We will dive deeper into titles in [Schema Node Titles](doc:node-titles)_

###

## Example 1: A "Simple" Complex Text

Let's look at a moderately complex text and the Index schema that describes it. The example text below has the following three sections:

1. **Introduction**: This is structured as a series of paragraphs.
2. **Main Body**: This is structured as chapters that contain sections.
3. **Conclusion**: This is structured as a series of paragraphs.

The text looks like this when viewed in a `JaggedArray`:

```python
{
    "Introduction": ["Intro Paragraph 1", "Intro Paragraph 2", ...],
    "Contents": [
      						["Chapter 1, Section 1", "Chapter 1, Section 2"],
                  ["Chapter 2, Section 1", "Chapter 2, Section 2"], 
                 ...],
    "Conclusion": ["Conclusion Paragraph 1", "Conclusion Paragraph 2", ...]
}

```

The schema, as serialized in the `Index` record, looks something like this:

```json
 "schema" : {
        "nodes" : [
            {
                "nodeType" : "JaggedArrayNode",
                "depth" : NumberInt(1),
                "addressTypes" : ["Integer"],
                "sectionNames" : ["Paragraph"],
                "titles": [...],
                "key" : "Introduction"
            },
            {
                "nodeType" : "JaggedArrayNode",
                "depth" : NumberInt(3),
                "addressTypes" : ["Perek","Pasuk","Integer"],
                "sectionNames" : ["Chapter","Verse","Comment"],
                "default" : true,
                "key" : "default"
            },
            {
                "nodeType" : "JaggedArrayNode",
                "depth" : NumberInt(1),
                "addressTypes" : ["Integer"],
                "sectionNames" : ["Paragraph"],
                "titles": [...],
                "key" : "Conclusion"
            }
        ],
        "nodeType" : "SchemaNode",
        "titles" : [...],
        "key" : "Example Text"
    }
```

The root node in the schema, besides the required `key` and `titles` attributes, has an attribute called `nodes`.  `nodes `is a list of dictionaries, with each of those dictionaries itself containing a node. Take a look at the keys of each of those children: They match the keys of the dictionary of the text.  Each child node in the Index record describes how the corresponding section of the text is structured.

Let's take a step back and conceptualize the structure of this Index record as a tree:

<Image align="center" width="75% " src="https://files.readme.io/ef788d0-complex_schema.drawio.png" />

You'll see that at the root of the tree, there is a `SchemaNode` representing the entirety of the text. This `SchemaNode` has three `JaggedArrayNode` children, each representing the content of that section, which is stored on the `Version` in an associated `JaggedArray`.

## Example 2: Abarbanel on Torah

For a more complicated example of a complex text, let's look at the commentary known as [Abarbanel on Torah](https://www.sefaria.org/Abarbanel_on_Torah?tab=contents). This text has a more nuanced structure, with multiple layers of `SchemaNode`nodes. The author has written a verse-by-verse commentary on each of the Five Books of Moses. In addition, he wrote introductions for each of his five commentaries, one for each book.

The schema as it appears in the Index record is shown in the snippet below.

### The Index Record Schema for Abarbanel on Torah

```json
 "schema" : {
        "nodes" : [
            {
                "nodes" : [
                    {
                        "nodeType" : "JaggedArrayNode",
                        "depth" : NumberInt(1),
                        "addressTypes" : ["Integer"],
                        "sectionNames" : ["Paragraph"],
                        "key" : "Introduction"
                    },
                    {
                        "nodeType" : "JaggedArrayNode",
                        "depth" : NumberInt(3),
                        "addressTypes" : ["Perek","Integer","Integer"],
                        "sectionNames" : ["Chapter","Verse","Paragraph"],
                        "default" : true,
                        "key" : "default"
                    }
                ],
                "titles" : [...],
                "key" : "Genesis"
            },
            {
                "nodes" : [
                    {
                        "nodeType" : "JaggedArrayNode",
                        "depth" : NumberInt(1),
                        "addressTypes" : ["Integer"],
                        "sectionNames" : ["Paragraph"],
                        "key" : "Introduction"
                    },
                    {
                        "nodeType" : "JaggedArrayNode",
                        "depth" : NumberInt(3),
                        "addressTypes" : ["Perek","Integer","Integer"],
                        "sectionNames" : ["Chapter","Verse","Paragraph"],
                        "default" : true,
                        "key" : "default"
                    }
                ],
                "titles" : [...],
                "key" : "Exodus"
            },
            {
                "nodes" : [
                    {
                        "nodeType" : "JaggedArrayNode",
                        "depth" : NumberInt(1),
                        "addressTypes" : ["Integer"],
                        "sectionNames" : ["Paragraph"],
                        "key" : "Introduction"
                    },
                    {
                        "nodeType" : "JaggedArrayNode",
                        "depth" : NumberInt(3),
                        "addressTypes" : [
                            "Perek",
                            "Integer",
                            "Integer"
                        ],
                        "sectionNames" : [
                            "Chapter",
                            "Verse",
                            "Paragraph"
                        ],
                        "default" : true,
                        "key" : "default"
                    }
                ],
                "titles" : [...],
                "key" : "Leviticus"
            },
            {
                "nodes" : [
                    {
                        "nodeType" : "JaggedArrayNode",
                        "depth" : NumberInt(1),
                        "addressTypes" : ["Integer"],
                        "sectionNames" : ["Paragraph"],
                        "key" : "Introduction"
                    },
                    {
                        "nodeType" : "JaggedArrayNode",
                        "depth" : NumberInt(3),
                        "addressTypes" : ["Perek","Integer","Integer"],
                        "sectionNames" : ["Chapter","Verse","Paragraph"],
                        "default" : true,
                        "key" : "default"
                    }
                ],
                "titles" : [...],
                "key" : "Numbers"
            },
            {
                "nodes" : [
                    {
                        "nodeType" : "JaggedArrayNode",
                        "depth" : NumberInt(1),
                        "addressTypes" : ["Integer"],
                        "sectionNames" : ["Paragraph"],
                        "key" : "Introduction"
                    },
                    {
                        "nodeType" : "JaggedArrayNode",
                        "depth" : NumberInt(3),
                        "addressTypes" : ["Perek","Integer","Integer"],
                        "sectionNames" : ["Chapter","Verse","Paragraph"],
                        "default" : true,
                        "key" : "default"
                    }
                ],
                "titles" : [...],
                "key" : "Deuteronomy"
            }
        ]
```

You'll see that the `schema` is a JSON object, with a `nodes` key that contains an array of five JSON objects, each one representing a `SchemaNode` that points to the introduction and commentary corresponding to each book of Torah. Each of these JSON objects has a `nodes` key, which points to an array of the two `JaggedArrayNodes` that correspond to the `JaggedArray` for the introduction and the commentary for the given book.

Let's visualize this as a tree:

<Image align="center" alt="The Schema of Abarbanel on Torah as a Tree" caption="The Schema of Abarbanel on Torah as a Tree" src="https://files.readme.io/79a8c38-abarbanel_complex.drawio.png" width="125% " />

You can see in the above diagram that the Abarbanel on Torah has two layers of `SchemaNode` nodes (represented by the purple circles). The root is the `SchemaNode` representing the entire Index. The immediate children are each a `SchemaNode` representing the Abarbanel's commentary on one of the five books of Torah. The children of each "book-level" `SchemaNode` are `JaggedArrayNode`nodes (represented by the yellow rectangles). Each book has a `JaggedArrayNode` for the Introduction (with a key of `Introduction`) and a `JaggedArrayNode` for the main body of the commentary on that book (with a key of `default`, more on that in [Default Nodes](doc:default-nodes)). Each `JaggedArrayNode` corresponds to an actual `JaggedArray` (i.e., a list of lists, represented by the loosely associated blue rectangles) on the `Version` of the text containing the actual text of that corresponding section of the Index.

# Summary

Schema trees can descend to any depth.  Each Index will have a different structure, varying widely in composition and complexity. It is crucial to understand `JaggedArray`, `JaggedArrayNode`, and `SchemaNode`. With these building blocks, one can understand how `Index` schema trees are built and how to read the schema as presented in serialized form in the `Index` record. This information underpins every text in the Sefaria Library and is key to a deep understanding of how we store and structure text.

<br />
