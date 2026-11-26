---
title: Categories
excerpt: Learn about how texts are categorized in the Sefaria Library.
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
  pages:
    - type: endpoint
      slug: getting-started
      title: Getting Started With The Sefaria API
---
All texts at Sefaria are sorted into categories. The 14 highest-level categories are visible on the Sefaria Library homepage ([Sefaria.org](https://sefaria.org)). These include Tanakh, Talmud, Mishnah, and more, and can be used to navigate the digital stacks. In the Sefaria database, categories are first-class objects. They can be retrieved by using the Categories API.

Categories are present on the `Index` of a text, and are a requirement for `Index` creation. For example, the `Index` of `Genesis`has a category of `Torah`. The `Torah` category is a child of the `Tanakh` (a highest-level category), so the full category for `Genesis` would appear: `["Tanakh", "Torah"]`.

To learn more about the Sefaria `Index`, see [The Structure of a Book on Sefaria](doc:the-structure-of-a-text-on-sefaria) or [the Index API](ref:get-v2-index).

## The Structure of the Category Object

Category objects have specific field requirements. These include:

### `path`

Category objects require `path`, which is a list of primary titles of categories that form the path of ancestors to this one.  The current category's title is included in the path. The path is stored in a list, with the highest-level ancestor at position 0, and the current category's title at the end of the list. See below for clarification:

| Category                                                                                                             | Full Path of the Category Object                                                                              | Depth | Highest  Ancestor | Current Category (`lastPath`) |
| :------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ | :---- | :---------------- | :---------------------------- |
| [Tanakh](https://www.sefaria.org/texts/Tanakh)                                                                       | `["Tanakh"]`                                                                                                  | `1`   | `Tanakh`          | `Tanakh`                      |
| [Korban Netanel](https://www.sefaria.org/texts/Talmud/Bavli/Rishonim%20on%20Talmud/Rosh/Commentary/Korban%20Netanel) | `[     "Talmud",     "Bavli",     "Rishonim on Talmud",     "Rosh",     "Commentary",     "Korban Netanel" ]` | `6`   | `Talmud`          | `Korban Netanel`              |
| [Rashbam](https://www.sefaria.org/texts/Tanakh/Rishonim%20on%20Tanakh/Rashbam)                                       | `[    "Tanakh",      "Rishonim on Tanakh",      "Rashbam" ]`                                                  | `3`   | `Tanakh`          | `Rashbam`                     |

***

### `titles` or `sharedTitle`

Categories also must contain either `titles` or `sharedTitle`:

`titles` refers to a list of `title` objects, with each object containing the language code (`lang`), the `text`, and a boolean indicating whether or not this is a primary title.

See below for an example of the titles list on the `Index` of `Bamidbar`:

```
[
	{
		"lang" : "he",
		"text" : "במדבר",
		"primary" : true
  },
{
		"lang" : "en",
		"text" : "Numbers",
		"primary" : true
`}
]
```

`sharedTitle` refers to a string key for an existing `Term` object. A `Term` is a shared title block, which can be used across multiple `Index` objects and `Category` objects. Please note: This Term **must** exist before attempting to create the category.

## Derived Attributes

### `lastPath`

`lastPath` is derived from the `path` attribute. It does not need to be specified on object creation. This attribute contains the title of the current category, and is represented by the last string in the path list.

### `depth`

`depth` is derived from the `path` attribute. It also does not need to be specified on object creation.

## Optional Attributes

- `enDesc`: An English-language description of the category
- `heDesc`: A Hebrew-language description of the category
- `isPrimary`: A boolean flag, which, when `True`, means that this category won't be nested within another, but will have its own page. For example, the Mishnah category, which you can see [here](https://sefaria.org/texts/Mishnah), has its own page in the Sefaria Library because it is a primary category.
- `searchRoot`: A string, which, when present, means that this category will be moved within the specified root category, in the context of search filters.

## Example Category Objects

### Example 1: The `Category` for the commentary of `Metzudat David`:

```text JSON
{
    "lastPath" : "Metzudat David",
    "path" : [
        "Tanakh",
        "Acharonim on Tanakh",
        "Metzudat David"
    ],
    "depth" : NumberInt(3),
    "enDesc" : "",
    "heDesc" : "",
    "enShortDesc" : "18th-century classic commentary on Prophets and Writings explaining verses in clear and simple language, primarily based on the Radak’s commentary.",
    "heShortDesc" : "פירוש קלאסי מן המאה ה-18 על נביאים וכתובים, המתבסס בעיקר על פירוש רד\"ק ומבאר את הפסוקים בשפה ברורה ופשוטה.",
    "sharedTitle" : "Metzudat David"
}
```

### Example 2: The `Category` for the commentary of `Targum`:

```text JSON
{
    "lastPath" : "Targum",
    "path" : [
        "Tanakh",
        "Targum"
    ],
    "depth" : NumberInt(2),
    "enDesc" : "Targum (“translation”) is the name of a category of texts that translate the Tanakh into Aramaic, originally transmitted orally and committed to writing between the 1st and 6th centuries CE.",
    "heDesc" : "הקטגוריה של 'תרגומים' כוללת את תרגומי התורה לארמית, תרגומים שהועברו במקור בעל פה והועלו על הכתב בין המאה ה-1 ל-6 לספירה.",
    "enShortDesc" : "Translations of Tanakh into Aramaic, originally transmitted orally and mostly committed to writing between the 1st and 8th centuries CE.",
    "heShortDesc" : "תרגום של התנ\"ך לארמית, במקור הועבר בעל פה, והועלה על הכתב מן המאה ה-1 עד המאה ה-8 לספירה.",
    "sharedTitle" : "Targum",
    "searchRoot" : "Targum",
    "order" : NumberInt(20)
}
```

<br />
