---
title: Lexicon
excerpt: Learn about the structure of dictionaries in the Sefaria Library
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
---
In Sefaria's parlance, a Lexicon is a dictionary or reference work. Lexicons are composed of a `Lexicon` object representing the entire reference work and `LexiconEntry` objects for each specific entry in the larger work.

Some Lexicons also have `WordForm` objects for each written expression of a word in the lexicon. `WordForm`objects represent various conjugations of words that appear in the texts in the Sefaria Library, and attempt to link them to the relevant headword.

If the Lexicon is viewed as an independent text, it also needs an `Index` record. This `Index` will have special fields. It may also have a `Version` record for any additional textual content which is not a dictionary entry (e.g., introductory text to the Lexicon).

To see documentation on our lexicon APIs, visit [this link](https://developers.sefaria.org/reference/get-words)

# Understanding the Lexicon Object Model

## Lexicon

If the Lexicon has an associated `Index`, the `Lexicon.index_title` must match the `title` of the `Index` object. In addition, `lexiconName` must match the `name` of the `Lexicon` object on the Index.  If the Lexicon in question has a `Version` associated with it, the title of the version should be placed in the `version_title`attribute, and the language of the version should be noted in the`version_lang` attribute of the Lexicon.

Please note the following fields:

- `name` is the key field for the Lexicon
- `attribution`, `source` and `source_url` are descriptive
- `language`
- `to_language`
- `text_categories`

See the following example of a `Lexicon` object in our database for clarification:

```
{ 
    "text_categories" : [], 
		"attribution" : "Rabbi Marcus Jastrow",
    "name" : "Jastrow Dictionary",
    "language" : "heb.talmudic",
    "version_lang" : "en",
    "to_language" : "eng",
    "index_title" : "Jastrow",
    "source" : "Jastrow Dictionary",
    "version_title" : "London, Luzac, 1903",
    "should_autocomplete" : true
}
```

## Lexicon Entry

As noted above, every `Lexicon` object is comprised of `LexiconEntry` objects, which represent the words in that `Lexicon`.

Please note the following requirements and characteristics of a Lexicon Entry:

- The `parent_lexicon` must match `Lexicon.name`
- The`headword`, taken together with `parent_lexicon`, is the key for the Lexicon entry.  The `headword` must be unique to the Lexicon in question.
- `prev_hw` indicates the headword for the entry directly before the one you are referencing. This is required when the Lexicon is presented as a text with an `Index`.
- `next_hw` indicates the headword for the entry directly before the one you are referencing. This is required when the Lexicon is presented as a text with an `Index`.
- `rid` is a unique ID that is used for lexical sorting.  When presented in order, the rid should appear in order.  `rid` values should begin with a letter in order to ensure lexical sorting instead of numerical sorting.

See the following example for a clarification of how a Lexicon Entry may appear:

```
{ 
    "headword" : "אִיזְמֵיל", 
    "parent_lexicon" : "Jastrow Dictionary", 
    "rid" : "A01200", 
    "language_code" : " h. a. ch.", 
    "refs" : [
        "Chullin 31a:11", 
        "Shemot Rabbah 26"
    ], 
    "content" : {
        "senses" : [
            {
                "definition" : " (זמל √<span dir=\"rtl\">מל</span>; cmp. b. h. <span dir=\"rtl\">סמל</span>; cmp. <a dir=\"rtl\" class=\"refLink\" href=\"/Jastrow,_*אִיזְגָּרָא.1\" data-ref=\"Jastrow, *אִיזְגָּרָא 1\">אִיזְגָּרָא</a>) <i>cutting tool, knife</i>, esp. <i>surgeon’s knife</i>. <a class=\"refLink\" href=\"/Aramaic_Targum_to_Job.16.9\" data-ref=\"Aramaic Targum to Job 16:9\">Targ. Job XVI, 9</a>; a. e.—<a class=\"refLink\" href=\"/Chullin.31a.11\" data-ref=\"Chullin 31a:11\">Ḥull. 31ᵃ</a> <span dir=\"rtl\">א׳ שיש לו קרנים</span> a knife which has hornlike projections as ornaments. Y. Sabb. XIX, beg. 16ᵈ <span dir=\"rtl\">אנשון מייתי או׳</span> they had forgotten to bring the knife (for circumcision). <a class=\"refLink\" href=\"/Shemot_Rabbah.26\" data-ref=\"Shemot Rabbah 26\">Ex. R. s. 26</a> man <span dir=\"rtl\">מכה באי׳ וכ׳</span> wounds with a knife (operating) and heals &c. Pl. Chald. <span dir=\"rtl\">אִזְמֵלַיָּיא</span>; <span dir=\"rtl\">אִזְמַלְוָון</span> (f.). <a class=\"refLink\" href=\"/Targum_Jonathan_on_Isaiah.44.13\" data-ref=\"Targum Jonathan on Isaiah 44:13\">Targ. Is. XLIV, 13</a>. <a class=\"refLink\" href=\"/Targum_Jonathan_on_Joshua.5.2\" data-ref=\"Targum Jonathan on Joshua 5:2\">Targ. Josh. V, 2</a>."
            }
        ], 
        "morphology" : "m."
    }, 
    "plural_form" : [
        "אִזְמֵלַיָּיא", 
        "אִזְמַלְוָון"
    ], 
    "alt_headwords" : [
        "אִיזְמֵל", 
        "אִזְ׳", 
        "(אוּזְמֵל)"
    ], 
    "quotes" : [

    ], 
    "prev_hw" : "אִיזְמָא", 
    "next_hw" : "איזמר"
}

```

When a `Lexicon` is to be presented as a text in itself (with an `Index` record), the `LexiconEntry` objects are arranged with pointers to the entries before and after.

## WordForm

There can be many `WordForm` objects that correspond to a single `LexiconEntry`. There can also be many `LexiconEntry` objects that correspond to a single `WordForm`.

For example:

```
	{ 
    "form" : "פתיח", 
    "lookups" : [
        {
            "parent_lexicon" : "Klein Dictionary", 
            "headword" : "פָּתֽיחַ ᴵ"
        }
    ], 
    "c_form" : "פתיח", 
    "refs" : [
        "Eruvin 24b:4", 
        "Megillah 26b:13"
    ], 
    "generated_by" : "prefix_adder_1"
}
```

Please note: The `lookups` field represents the list of `LexiconEntry` objects.  There can be many objects in the `lookups` list.

### Refs in WordForm

The `refs` list is designed to further restrict the correspondence between naturally occurring words in a given text and a `LexiconEntry`. Though a word may appear identical in various sources in the Sefaria Library, it may have different meanings due to the specific context of the work within which it appears. The `refs` list associate a given definition for a word with the various instances in which it appears that the word in question has identical meanings.

For example, if a word in biblical Hebrew has a different meaning it does in modern Hebrew works, there will be separate `WordForm` objects for each definition. The former object will represent the biblical Hebrew word and associating it with `refs` from the Bible, while the latter will represent the Modern Hebrew word and associate it with `refs` corresponding to its appearance in modern Hebrew works.

### Many-to-Many

When querying for a `WordForm` for a given string, one may receive many results. This is possible in order to enable maximum flexibility in representing natural language.

## Index

When a dictionary is presented as a text, it has a special `Index` record. This record includes a`lexiconName` element at the root and a `DictionaryNode` element in the schema. The `lexiconName` must match the `name` of the `Lexicon` object. Conversely, the `Lexicon.index_title` must match the `title` of the `Index` object.

### DictionaryNode

A `DictionaryNode` can be placed anywhere within a complex schema tree. For example:

- `nodeType`: This will be `DictionaryNode`
- `lexiconName`
- `default` : If true, entries can be referenced with the dictionary name alone.
- `lastWord`
- `firstWord`
- `headwordMap`

Below is the full record for the Jastrow dictionary. Please note the `lexiconName` and `DictionaryNode` elements in the schema.

```
{ 
    "categories" : [
        "Reference"
    ], 
    "schema" : {
        "key" : "Jastrow", 
        "nodes" : [
            {
                "lexiconName" : "Jastrow Dictionary", 
                "default" : true, 
                "lastWord" : "תתנא", 
                "firstWord" : "א", 
                "nodeType" : "DictionaryNode", 
                "headwordMap" : [
                    [
                        "א", 
                        "Jastrow, א"
                    ], 
                    [
                        "ב", 
                        "Jastrow, ב"
                    ], 
                    [
                        "ג", 
                        "Jastrow, ג"
                    ], 
                    [
                        "ד", 
                        "Jastrow, ד"
                    ], 
                    [
                        "ה", 
                        "Jastrow, ה"
                    ], 
                    [
                        "ו", 
                        "Jastrow, ו"
                    ], 
                    [
                        "ז", 
                        "Jastrow, ז"
                    ], 
                    [
                        "ח", 
                        "Jastrow, ח"
                    ], 
                    [
                        "ט", 
                        "Jastrow, ט"
                    ], 
                    [
                        "י", 
                        "Jastrow, י"
                    ], 
                    [
                        "כ", 
                        "Jastrow, כ"
                    ], 
                    [
                        "ל", 
                        "Jastrow, ל"
                    ], 
                    [
                        "מ", 
                        "Jastrow, מ"
                    ], 
                    [
                        "נ", 
                        "Jastrow, נ"
                    ], 
                    [
                        "ס", 
                        "Jastrow, ס"
                    ], 
                    [
                        "ע", 
                        "Jastrow, ע"
                    ], 
                    [
                        "פ", 
                        "Jastrow, פ"
                    ], 
                    [
                        "צ", 
                        "Jastrow, צ"
                    ], 
                    [
                        "ק", 
                        "Jastrow, ק"
                    ], 
                    [
                        "ר", 
                        "Jastrow, ר"
                    ], 
                    [
                        "ש", 
                        "Jastrow, שׁ"
                    ], 
                    [
                        "ת", 
                        "Jastrow, ת"
                    ]
                ]
            }, 
            {
                "key" : "Preface", 
                "addressTypes" : [
                    "Integer"
                ], 
                "sectionNames" : [
                    "Paragraph"
                ], 
                "nodeType" : "JaggedArrayNode", 
                "depth" : 1, 
                "titles" : [
                    {
                        "primary" : true, 
                        "lang" : "he", 
                        "text" : "הקדמה"
                    }, 
                    {
                        "primary" : true, 
                        "lang" : "en", 
                        "text" : "Preface"
                    }
                ]
            }, 
            {
                "key" : "Hebrew or Aramaic Abbreviations", 
                "addressTypes" : [
                    "Integer"
                ], 
                "sectionNames" : [
                    "Line"
                ], 
                "nodeType" : "JaggedArrayNode", 
                "depth" : 1, 
                "titles" : [
                    {
                        "primary" : true, 
                        "lang" : "he", 
                        "text" : "קיצורים בעברית או בארמית"
                    }, 
                    {
                        "primary" : true, 
                        "lang" : "en", 
                        "text" : "Hebrew or Aramaic Abbreviations"
                    }
                ]
            }, 
            {
                "key" : "List of Abbreviations", 
                "addressTypes" : [
                    "Integer"
                ], 
                "sectionNames" : [
                    "Line"
                ], 
                "nodeType" : "JaggedArrayNode", 
                "depth" : 1, 
                "titles" : [
                    {
                        "primary" : true, 
                        "lang" : "he", 
                        "text" : "רשימת קיצורים"
                    }, 
                    {
                        "primary" : true, 
                        "lang" : "en", 
                        "text" : "List of Abbreviations"
                    }
                ]
            }
        ], 
        "titles" : [
            {
                "primary" : true, 
                "lang" : "he", 
                "text" : "מילון יסטרוב"
            }, 
            {
                "primary" : true, 
                "lang" : "en", 
                "text" : "Jastrow"
            }
        ]
    }, 
    "enDesc" : "A Dictionary of the Targumim, the Talmud Bavli and Yerushalmi, and the Midrashic Literature", 
    "order" : [

    ], 
    "is_cited" : false, 
    "pubPlace" : "New York", 
    "compPlace" : "Philadelphia", 
    "lexiconName" : "Jastrow Dictionary", 
    "pubDate" : "1903", 
    "title" : "Jastrow", 
    "era" : "CO", 
    "errorMargin" : "10", 
    "authors" : [
        "Marcus Jastrow"
    ], 
    "compDate" : "1893"
}

```

## Version

This is necessary for any regular (non-definition) text.

## Important Notes

- In `sefaria/model/lexicon.py`, each dictionary relates to a subclass of `DictionaryEntry`.  Those correspondences are listed in `LexiconEntrySubClassMapping`
- `sefaria.js` includes a line that lists the available dictionaries:  `Sefaria.virtualBooksDict = [...]`
- If a lexicon participates in the cross-dictionary auto-completer, it needs to be listed in `library.build_lexicon_auto_completers`

<br />
