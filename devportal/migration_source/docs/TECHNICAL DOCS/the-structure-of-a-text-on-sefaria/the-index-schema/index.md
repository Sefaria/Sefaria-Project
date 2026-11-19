---
title: The Index Schema
excerpt: 'Learn about how we define the structure of a book in the Sefaria Library. '
deprecated: false
hidden: false
metadata:
  title: ''
  description: >-
    The document explains the structure of book index schemas in Sefaria, which
    are tree-like structures composed of SchemaNode and JaggedArrayNode objects.
  robots: index
next:
  description: ''
  pages:
    - type: basic
      slug: jaggedarray-and-jaggedarray-nodes
      title: JaggedArray and JaggedArray Nodes
---
# Index Schemas

The structure of a book is defined in the `Index` schema.  These schemas are [trees](https://en.wikipedia.org/wiki/Tree_\(data_structure\)) made up of nodes.  
In the Python [code](https://github.com/Sefaria/Sefaria-Project/blob/fe9c971217b99cd763c0dd8f42b82339379b961c/sefaria/model/schema.py#L1218) , these nodes are instances of the class `sefaria.model.schema.SchemaNode` and its children.  The trees are stored in the database and transmitted through the API in a serialized form.

# Node Types for an `Index` Schema Tree

Index schemas are structured as trees. In most cases, the internal nodes of these trees are of type `SchemaNode`,  while the leaves of the tree are of type`JaggedArrayNode`. For further information on this, take a look at the [next section](doc:jaggedarray-and-jaggedarray-nodes)) of our documentation.

Below is a diagram of the class hierarchy that defines the various Index schema nodes.

<Image align="center" alt="Inheritance Hierarchy of Index Schema Nodes at Sefaria" caption="The Inheritance Hierarchy of Index Schema Nodes in the Sefaria Library" src="https://files.readme.io/b4a570b-index_schema_hierarchy.png" width="75% " />

Please note: Since not all of this information is immediately relevant to most engineers working on projects that use Sefaria's data, we only elaborate on `SchemaNode` and `JaggedArrayNode` in these docs. For a deeper dive, you can explore a more detailed description of the schema on [GitHub](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/model/schema.py).
