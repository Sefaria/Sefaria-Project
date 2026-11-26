---
title: Alternate Structures
excerpt: Learn how to work with texts that feature alternate structures.
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
      slug: commentaries
      title: Commentaries
---
# Alternate Structures

Often, a text is referred to using multiple overlapping schemes. In these cases, alternate structures may be specified on Index records. Two examples of this phenomenon are the Torah, which has both a chapter-verse addressing schema and a parashah-aliyah addressing schema, and the Talmud, which has both a daf addressing schema and a chapter-mishnah addressing schema.

If a text has multiple overlapping schemes, the text's storage format will be the structure that provides the greatest detail.  This is specified in the `schema` attribute of the `Index` record.  Other possible structures are specified in the `alt_structs` attribute of the text's Index record.

In short, `alt_structs` acts as a dictionary, mapping structure keys (which can be arbitrary) to alt structures.  Alt structures look very much like [the Index Schema](doc:the-index-schema) but with a few key differences:

* The `nodeType` is generally `ArrayMapNode`
* The root node has no titles; instead, it uses the titles of the schema root.
* All nodes of the alt structure do not have `key` fields.
* Terminal nodes in an alternate structure have mappings to underlying references, using either one or both of the following attributes:
  * `wholeRef`: This single string has a ref to the whole range covered by the relevant node.
  * `refs`: This jagged array of refs corresponds to the way in which `wholeRef` is broken into sections, named by `sectionNames`. This attribute is only required when `depth` is greater than zero.
* Display attributes can be customized. This affects how an alternate structure is visualized in its Table of Contents. Customization options include:
  * `includeSections`: when True, the node will include links to each individual section within `wholeRef` underneath the alternate node name (e.g., [Zohar](http://www.sefaria.org/Zohar)).

**For example: A section of the alternate structure of the book of Exodus**

```
   "alt_structs" : {
        "Parasha" : {
            "nodes" : [ 
                {
                    "sharedTitle" : "Shemot",
                    "nodeType" : "ArrayMapNode",
                    "depth" : 1,
                    "sectionNames" : [ 
                       "Aliyah"
                    ],
                    "wholeRef" : "Exodus 1:1-6:1",
                    "refs" : [ 
                        "Exodus 1:1-1:17", 
                        "Exodus 1:18-2:10", 
                        "Exodus 2:11-2:25", 
                        "Exodus 3:1-3:15", 
                        "Exodus 3:16-4:17", 
                        "Exodus 4:18-4:31", 
                        "Exodus 5:1-6:1"
                    ],
                    "addressTypes" : [ 
                        "Integer"
                    ]
                }, 
                {
                    "sharedTitle" : "Vaera",
                    "nodeType" : "ArrayMapNode",
                    "depth" : 1,
                    "sectionNames" : [ 
                        "Aliyah"
                    ],
                    "wholeRef" : "Exodus 6:2-9:35",
                    "refs" : [ 
                        "Exodus 6:2-6:13", 
                        "Exodus 6:14-6:28", 
                        "Exodus 6:29-7:7", 
                        "Exodus 7:8-8:6", 
                        "Exodus 8:7-8:18", 
                        "Exodus 8:19-9:16", 
                        "Exodus 9:17-9:35"
                    ],
                    "addressTypes" : [ 
                        "Integer"
                    ]
                }, 
                {
                    "sharedTitle" : "Bo",
                    "nodeType" : "ArrayMapNode",
                    "depth" : 1,
                    "sectionNames" : [ 
                        "Aliyah"
                    ],
                    "wholeRef" : "Exodus 10:1-13:16",
                    "refs" : [ 
                        "Exodus 10:1-10:11", 
                        "Exodus 10:12-10:23", 
                        "Exodus 10:24-11:3", 
                        "Exodus 11:4-12:20", 
                        "Exodus 12:21-12:28", 
                        "Exodus 12:29-12:51", 
                        "Exodus 13:1-13:16"
                    ],
                    "addressTypes" : [ 
                        "Integer"
                    ]
                }, 
...
```
