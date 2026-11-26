---
title: Node Titles
excerpt: >-
  Learn how node titles work at Sefaria for books and sections of books, and how
  they work together in building text citations.
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
      slug: in-progress-alternate-structures
      title: Alternate Structures
---
# Types of Titles

There are three potential ways a title can be built:

1. As explicit titles on nodes
2. As shared titles (or Terms)
3. As default nodes

This article explains each of these title types and when they are used. First, let's look at some background.

### Notes on the Background of Titles

The full title of any node is built from the titles of all its parents, in order.  Looking at our example book from [The Structure of a Complex Text](doc:the-schema-of-a-complex-text), the normalized full title of the Introduction section would be `"Sample Book, Introduction"`.  A reference to that part of the book would use that title. As trees get deeper and the number of alternate titles grows, and considering that node names can be separated by a space or a comma and space, the number of titles for a node can expand combinatorially.

# How Titles Are Created

Let's look at the way nodes get titles. As a reference, let's take another look at the schema of our example book (referenced above). This time, we'll pay close attention to the `sharedTitle` and `titles` fields (which were intentionally omitted in The Structure of a Complex Text):

```json
 "schema" : {
        "nodes" : [
            {
                "nodeType" : "JaggedArrayNode",
                "depth" : NumberInt(1),
                "addressTypes" : ["Integer"],
                "sectionNames" : ["Paragraph"],
                "sharedTitle" : "Introduction",
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
                "sharedTitle" : "Conclusion",
                "key" : "Conclusion"
            }
        ],
        "nodeType" : "SchemaNode",
        "titles" : [
            {
                "lang" : "he",
                "text" : "ספר הדוגמא",
                "primary" : true
            },
            {
                "lang" : "en",
                "text" : "Example Book",
                "primary" : true
            },
            {
                "lang" : "en",
                "text" : "The Book of Examples"
            },
            {
                "lang" : "en",
                "text" : "Ex Book"
            }

        ],
        "key" : "Example Text"
    }
```

## 1. Explicit Titles on Nodes

A node can have explicit titles defined on it.  That is what we see in the above example text, which uses the `titles` attribute of the node.  As noted above, this attribute is a list of dictionaries, and each title dictionary has three  keys:

| Attribute | Status     | Examples       | Description                                                                                                                                                       |
| :-------- | :--------- | :------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`    | _Required_ | `Example Book` | The title string                                                                                                                                                  |
| `lang`    | _Required_ | `en`           | The language code, either `"en"` or `"he"`.`                                                                                                                      |
| `primary` | _Optional_ | `True`         | This field must be present and set to True for exactly one Hebrew and one English title.  It specifies the default title used for presentation and normalization. |

## 2. Shared Titles (Terms)

Instead of listing its titles in the `titles` field, a node can also specify the key of a shared title in the `sharedTitles` field.  This is useful for titles that are repeated, such as the names of Torah portions or talmudic tractates.  

Please note: 

* Each shared title has a collection of title dictionaries that are used on the node as if they were defined there.
* The `Term` class defines valid keys for shared titles. 
* A node that defines `sharedTitle` does not have a `titles` field.

An example node with shared titles can be seen in the above example, on the `Introduction` and `Conclusion` nodes. For example, here's the `Introduction` node:

```json
{
  "nodeType" : "JaggedArrayNode",
  "depth" : NumberInt(1),
  "addressTypes" : ["Integer"],
  "sectionNames" : ["Paragraph"],
  "sharedTitle" : "Introduction",
  "key" : "Introduction"
}
```

Notice that, instead of a `titles` field with a list of titles for this node, we have a `sharedTitle`. This is because the word `Introduction` is used repeatedly in titles of introductions to books across the Sefaria Library. This key was first defined using the Term class, and then used here as a `sharedTitle`.

## 3. Default Nodes

Once again, let's take a look at the Index record for the example book described above. Note that the section containing the book's main content does not have a `sharedTitle` or a `titles` block; instead, it simply has the `default` field set to `True` and the `key` set to `default`.

This is done to avoid adding further titles to this section of the book in question, which makes sense, as this node represents the book's main body. For example, a reference like `"Example Book, Contents 3:5"` would be unnecessary. All we need is: `"Example Book 3:5"`.  Since we want anything that isn't the Introduction or Conclusion to be part of the book's main body, we set this node as the default.

Some rules about default nodes:

* Default nodes must have `key: "default"`
* Default nodes must have `default: True` specified
* Default nodes do **not** have `titles` or `sharedTitle` attributes
* Default nodes must **not** have any other sibling that is a default node (There can be only one default node among siblings)
* Default nodes must be a content node (e.g., `JaggedArrayNode`)
* Default nodes cannot have any children nodes

Once a default node is specified, references to the parent that do not match any other nodes will default to matching the default node and its children.

Here's an example text that uses a `default` node:

```
{
"Introduction": ["Intro Paragraph 1", "Intro Paragraph 2", ...],
"default": [["Chapter 1, Section 1", "Chapter 1, Section 2"],["Chapter 2, Section 1", "Chapter 2, Section 2"], ...],
"Conclusion": ["Conclusion Paragraph 1", "Conclusion Paragraph 2", ...]
}

```

Let's look at the entire `Index` record for our example book again. This time, we'll omit any unrelated fields so we can focus on titles and get a better idea of how this works:

```
 "schema" : {
        "nodes" : [
            {
                "nodeType" : "JaggedArrayNode",
                "sharedTitle" : "Introduction",
                "key" : "Introduction"
            },
            {
                "nodeType" : "JaggedArrayNode",
                "default" : true,
                "key" : "default"
            },
            {
                "nodeType" : "JaggedArrayNode",
                "sharedTitle" : "Conclusion",
                "key" : "Conclusion"
            }
        ],
        "nodeType" : "SchemaNode",
        "titles" : [
            {
                "lang" : "he",
                "text" : "ספר הדוגמא",
                "primary" : true
            },
            {
                "text" : "Example Book",
                "lang" : "en",
                "primary" : true
            },
            {
                "lang" : "en",
                "text" : "The Book of Examples"
            },
            {
                "lang" : "en",
                "text" : "Ex Book"
            }

        ],
        "key" : "Example Text"
    }
```

You'll see that the titles for the text are defined on the root `SchemaNode`, at the bottom of the `Index` record. To refer to any content from the main body of the text, the `default` key will allow us to reference it by using any of those titles. So, `Ex Book 1:2`, `Example Book 1:2`, `The Book of Examples 1:2`, and `ספר הדוגמא 1:2 ` will all get us to the same place. In contrast, to get to either the introduction or conclusion, one would have to write the title with the `sharedTitle` for that specific node, so a valid title would look like `Example Book, Introduction 1`, with the `sharedTitle` concatenated to the root title.
