---
title: Commentaries
excerpt: 'Learn about working with commentaries in Sefaria''s database. '
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
      slug: terms
      title: Terms
---
# How to Work With Commentaries

In the Sefaria database, commentaries are considered texts like any other. In practical terms, this means works of commentary have an individual `Index`, and each edition of text for that commentary is represented by its own `Version` record.

## Index Attributes for Commentaries

Sefaria uses specific attributes on the `Index` record to indicate that an `Index` is a commentary relating to another source in the Library. These attributes are elaborated in the following table:

<Table align={["left","left","left"]}>
  <thead>
    <tr>
      <th>
        Attribute
      </th>

      <th>
        Type
      </th>

      <th>
        Description
      </th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>
        `dependence`
      </td>

      <td>
        `String`
      </td>

      <td>
        Generally `Commentary` or `Targum`. This field is used to indicate commentaries and other texts that depend upon another source in the Library.
      </td>
    </tr>

    <tr>
      <td>
        `base_text_titles`
      </td>

      <td>
        `List` of `Strings`
      </td>

      <td>
        The base text that a commentary depends upon. For example, `Rashi on Genesis` is dependent on `Genesis`.
      </td>
    </tr>

    <tr>
      <td>
        `base_text_mapping`
      </td>

      <td>
        `String`
      </td>

      <td>
        Enables auto-linking between a base text and a commentary. These values  match keys in the `class_map` found in  [sefaria.helper.link.AutoLinkerFactory](https://github.com/Sefaria/Sefaria-Project/blob/fe9c971217b99cd763c0dd8f42b82339379b961c/sefaria/helper/link.py#L325).

        So far, there are four options for auto-linking: `"one_to_one"`, `"many_to_one"`, `"many_to_one_default_only"` and `one_to_one_default_only`.

        `many_to_one`: This is the most common case, wherein multiple comments exist for a single segment of the base text. For example, there are many Rashi comments per verse of Tanakh. Tanakh is a depth-2 text, and Rashi on Tanakh is depth-3.

        `one_to_one`: This is only used for commentaries defined as `targum`. They are linked to their original texts one-to-one, since they are structured in exactly the same way as their base text. Two examples are Targum on Amos and Amos (both depth-2) and Steinsaltz on Bavli (both the commentary and the base text have the same depth). The latter example also functions as a `one-to-one` commentary.

        The corresponding `default` keys work in the same way. The only difference is that `default` nodes will be linked, while non- `default`  nodes will be ignored.

        These keys help maintain the auto-linking feature once afforded commentaries by default. They also make room to expand, and to implement various algorithms for linking between a dependent text and its base text/s.
      </td>
    </tr>

    <tr>
      <td>
        `collective_title`
      </td>

      <td>
        `String`
      </td>

      <td>
        This is the value for a group of index records. It is used to contain a former commentator name, which was once the primary handle on a commentary and is now used to group many indices belonging to a larger corpus, such as commentaries.

        This key requires a matching Hebrew `Term`.

        For example: The `collective_title` for `Rashi on Genesis` is the same as the `Index` title, `Rashi`.
      </td>
    </tr>

    <tr>
      <td>
        `is_cited`
      </td>

      <td>
        `Boolean`
      </td>

      <td>
        Only texts with `is_cited` set to `True` will be picked up as a citation in referencing texts.

        The default for this key is `True`.
      </td>
    </tr>
  </tbody>
</Table>

For example: Here is how these specific fields would be filled on the `Index` record of `Ramban on Genesis`:

```
"title": "Ramban on Genesis"
"base_text_titles": [
   "Genesis"
],
"base_text_mapping": "many_to_one",
"collective_title": "Ramban",
"dependence": "Commentary",
"categories": ["Tanakh", "Rishonim on Tanakh", "Ramban", "Torah"]  
```

## Commentaries and Categories

[Categories](doc:categories) are mostly used to indicate where a book will show up in the [Sefaria Table of Contents](https://sefaria.org).  
For example: The text `"Ramban on Genesis"`, with the category path of  `["Tanakh", "Rishonim on Tanakh", "Ramban", "Torah"]`, will show up under [Tanakh](https://www.sefaria.org/texts/Tanakh) >> Rishonim on Tanakh >> [Ramban](https://www.sefaria.org/texts/Tanakh/Rishonim%20on%20Tanakh/Ramban) >> Torah.

Please note:

* For a commentary, the category indicating the type of commentary (e.g., `Rishonim on Tanakh`) comes after one top level category (e.g.,`["Tanakh", "Rishonim on Tanakh", "Ramban", "Torah"]`)

* In some cases, a commentary will be indicated after multiple categories. This is particularly common for commentaries on Talmud (e.g.,`["Talmud", "Bavli", "Rishonim on Talmud", "Rashi", "Seder Zeraim" ]`)
