---
updatedAt: 2026-06-15T18:17:50.000Z
agentTools:
  projectIndex: https://developers.sefaria.org/llms.txt
---

# Terms

Learn about these objects, used for grouping titles, alternate titles, and other bilingual terms.

## What is a Term?

A `Term` is a `sharedTitle `node, used to group titles, alternate titles, and non-English titles (e.g., Hebrew). Some objects, such as `Index` records, store their own various titles. However, for other system objects, that is not possible at this time. This is why we use the `Term` object to add titles to items that need them, such as categories, `sharedTitles` on [Categories](https://developers.sefaria.org/docs/categories), and section names.

## Examples of Terms

Sample `Term` For the Section Name for `chapters`:

```json
{
  "scheme" : "section_names",
  "titles" : [
    {
      "lang" : "en",
      "text" : "Chapters",
      "primary" : true
    },
    {
      "lang" : "he",
      "text" : "פרקים",
      "primary" : true
    }
  ],
  "name" : "Chapters"
}
```

Sample `Term` For the Table Of Contents Sub-category `Geonim`:

```json
{
  "name" : "Geonim",
  "titles" : [
    {
      "lang" : "en",
      "text" : "Geonim",
      "primary" : true
    },
    {
      "lang" : "he",
      "text" : "גאונים",
      "primary" : true
    }
  ],
  "scheme" : "toc_categories"
}
```