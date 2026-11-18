---
title: Index and Versions
excerpt: >-
  In the Sefaria Library, titles are represented by an Index, while editions of
  titles are represented by Versions.
deprecated: false
hidden: false
metadata:
  title: ''
  description: >-
    The document explains the structure and categorization of books in a library
    system through an Index, which includes metadata and schema, and describes
    how different Versions of a text, such as translations or editions, relate
    to a single Index while maintaining a consistent structure.
  robots: index
next:
  description: ''
  pages:
    - type: basic
      slug: the-index-schema
      title: The Index Schema
---
# The Index

The `Index` of a book describes the structure of the book (in the `schema` attribute) and details how it is categorized in the Sefaria Library.  It also contains metadata about the book, such as when it was written and who authored it.  To see a full `Index` record of a given book, see the [v2 Raw Index API](ref:get-v2-index).

Below is a snippet from the `Index` record for the scroll of Esther (to see the full record, click [here](https://www.sefaria.org/api/v2/raw/index/Esther)). In this selection from the `Index` you can see the book title, as well as metadata about the book. 

Please note: In the example below, the `schema` field is collapsed. For an in-depth exploration of the `schema` field, see in [this article](doc:the-index-schema). 

```
{
    "title" : "Esther",
    "categories" : [
        "Tanakh",
        "Writings"
    ],
    "schema" : {},
    "order" : [
        NumberInt(34),
        NumberInt(8)
    ],
    "authors" : [],
    "enDesc" : "The Book of Esther is one of the five megillot (scrolls), part of the section of the Hebrew Bible called Writings. It tells the story of Esther, a Jew who becomes queen of Persia and together with her cousin, Mordechai, foils a plot of the evil Haman to destroy the Jews. To commemorate the transformation from “grief and mourning to festive joy” (9:22), Esther and Mordechai establish the Purim holiday. The book of Esther is read publicly in the evening and morning of Purim.",
    "heDesc" : "מגילת אסתר, אחת מקובץ חמש המגילות שבחטיבת הכתובים שבמקרא, מספרת את סיפורה של אסתר, יהודייה שנעשית למלכה פרס, ועם דודה מרדכי מסכלת את מזימתו המרושעת של המן להשמיד את היהודים. להנצחת המהפך \"מיגון לשמחה ומאבל ליום טוב\" (אסתר ט, כב) קבעו אסתר ומרדכי את חג הפורים. מגילת אסתר נקראת בציבור בליל חג הפורים ובבוקרו.",
    "enShortDesc" : "Esther becomes queen of Persia and foils a plot to destroy the Jews, establishing the Purim holiday.",
    "heShortDesc" : "אסתר נעשית מלכת פרס ומסכלת מזימה להשמיד את היהודים, ולרגל נס ההצלה נקבע לדורות חג הפורים.",
    "pubDate" : [
        NumberInt(1488)
    ],
    "hasErrorMargin" : true,
    "compDate" : [
        NumberInt(-400),
        NumberInt(-200)
    ],
    "compPlace" : "Shushan",
    "pubPlace" : "Soncino",
    "is_cited" : true,
    "corpora" : [
        "Tanakh"
    ]
}
```

# Versions

Each `Version` reflects an edition of the text.  Each `Version` must relate to a single `Index`.  The `Version` will be structured according to the shape defined in the Index `schema`.  Generally, there will be one `Version` reflecting the original edition of the text, along with one `Version` for each different translation or edition.  In some cases there may be multiple variant versions of the original, or a single translation may be spread across multiple `Version` records.

For example, Genesis is represented by a single `Index`. Associated with that `Index`,  we have close to fifty versions in multiple languages including Hebrew, English, French, Spanish, Yiddish, Ladino, Russian, and German. A `Version` contains the metadata associated with that edition of the text, as well as the text itself. While each `Version` of an `Index` may differ slightly in its text, each `Version` of a given `Index` will follow the exact same structure.

For example, here is the text for `Genesis 1:1` across several of our versions:

| Index Title | Version Title                                                                                           | Ref           | Text                                                      |
| :---------- | :------------------------------------------------------------------------------------------------------ | :------------ | :-------------------------------------------------------- |
| Genesis     | Tanach with Text Only                                                                                   | `Genesis 1:1` | בראשית ברא אלהים את השמים ואת הארץ                        |
| Genesis     | Tanach with Nikkud                                                                                      | `Genesis 1:1` | בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ |
| Genesis     | Bible du Rabbinat 1899 [fr]                                                                             | `Genesis 1:1` | Au commencement, Dieu créa le ciel et la terre.           |
| Genesis     | Russian Torah translation, by Dmitri Slivniak, Ph.D., edited by Dr. Itzhak Streshinsky. Da Project [ru] | `Genesis 1:1` | Вначале, когда творил Бог небеса и землю,                 |
| Genesis     | Jewish English Torah                                                                                    | `Genesis 1:1` | In the beginning God created the heavens and the earth    |
| Genesis     | The Holy Scriptures: A New Translation (JPS 1917)                                                       | `Genesis 1:1` | In the beginning God created the heaven and the earth.    |

You will notice that the only real differences appear in the `versionTitle` for a given text, and in the translation or edition itself. All versions of the same text will definitionally share the same `Index`. Since they share that structure, the segments will be referred to by the same `Ref`.

To query a`Version`, see the [v3 Texts API](https://developers.sefaria.org/reference/get-v3-texts).
