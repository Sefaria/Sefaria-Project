---
title: Workflowy
excerpt: >-
  When working with local installation, tools like our Workflowy Parser may be
  helpful for creating indices and adding text on Sefaria.
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
---
# What is Sefaria's Workflowy Parser?

This tool is designed to integrate [Workflowy](https://workflowy.com/) capabilities so developers can create complex texts in Sefaria with ease. Sefaria's content team has used Workflowy to create `Index` objects for over 300 books in the Sefaria Library, including resources such as [Mesilat Yesharim](https://www.sefaria.org/Mesilat_Yesharim?tab=contents), [Horeb](https://www.sefaria.org/Horeb?tab=contents), [Shulchan Arukh HaRav](https://www.sefaria.org/Shulchan_Arukh_HaRav?tab=contents), [Guide for the Perplexed](https://www.sefaria.org/Guide_for_the_Perplexed?tab=contents), and [From Sinai to Ethiopia,](https://www.sefaria.org/From_Sinai_to_Ethiopia?tab=contents) among others. This is an important tooling option for `Index` creation that usually doesn't require any engineering skills.

## What is Workflowy?

[Workflowy](https://workflowy.com/) is a versatile web-based tool for organizing information through nested lists, offering features such as tagging, collaboration, and offline access. [Workflowy](https://workflowy.com/) allows users to build nested lists that can be exported to an `.opml` file. Once exported, the lists can be parsed and ingested as an `Index` or `Version` in the Sefaria Library.

## How can we use Workflowy to add texts to the Sefaria Library?

As mentioned above, we can use [Workflowy](https://workflowy.com/) to create a table of contents for a text (an `Index` record), and even to fill in simple text for that Index (a `Version`).

This involves two main steps:

1. Creating a [Workflowy](https://workflowy.com/) document representing the text
2. Uploading the `.opml` file on your local instance of Sefaria

# Part 1: Preparing the [Workflowy](https://workflowy.com/) Document:

[Workflowy](https://workflowy.com/) stores nodes as an outline. The parsing script (mentioned above) will use this form to create a layered table of contents.

In order to begin, you'll need to create a new [Workflowy](https://workflowy.com/) document.

_Please note: To use Workflowy, you'll need to register for and log in to a free account._

Once logged in to your Workflowy account, use their interface to create a new document, then define the following criteria.

### 1) Book Structure Definition

In order to use Workflowy to define a book structure:

1. Add a single bullet to the main page containing the title of the book being described. All other bullets describing the internal structure of the text **must be nested under this initial bullet**.
2. Separate the English title from the Hebrew title by using the forward slash `/` character on the keyboard. Titles in both languages are required.&#x20;
3. If you wish to add alternate English or Hebrew titles, please group each language together (i.e., do _not_ write one English title, then one Hebrew title, and then another English title), separated by the `/` character. Alternate titles should be separated into their respective language catgories using the pipe `|` character, usually found above the enter key (on a PC) or the return key (on a Mac).

   The result should look like: English Title 1|English Title 2 / Hebrew Title 1|Hebrew Title 2
4. Proceed to add nested bullets as needed to describe the text structure. The same rules of adding titles apply to each of the nested bullets.

#### For example:

- Siddur A / סידור א
  - Shacharit / תפילת שחרית
    - Minchah / תפילת מנחה
    - Maariv|Arvit / מעריב|ערבית
      - Vehu Rachum / והוא רחום

### 2) Segment Depth Specification

The deepest bullet at any point will be the one where text is actually stored. By default, this means that you can only create a series of paragraphs at a single level of depth at this point. For example: A bullet titled "The Tale of the Four Kings" will only be able to have references such as `The Tale of the Four Kings.1`, `The Tale of the Four Kings.2`, etc., unless otherwise specified.

Therefore, if you want a certain bullet title to use numeric continuation at a depth larger than one (such as Chapter and Verse), you must specify this in square brackets `[]` after the titles.

#### For example:

When using only a number to denote depth, indicate it like this:

- Midrash on Kings
  - Introduction
  - The Tale of the Four Kings \[2]

When using section names and implying depth from the number of section names, indicate it like this:

- Midrash on Kings
  - Introduction
  - The Tale of the Four Kings \['Chapter', 'Verse']

When using both section names and types, indicate them like this:

- Midrash on Kings
  - Introduction
  - The Tale of the Four Kings \["Chapter:Integer", "Verse:Integer"]

### 3) Default Titles

Sometimes you will find yourself with a structure like this:

- The Tale of the Four Kings
  - Introduction
  - The Tale of the Four Kings

In such a case, we use a notion called a default node in order to eliminate the title repetition. To accomplish this, simply replace the redundant title with the special string `\*\*default\*\*`:

#### For example:&#x20;

When creating an Index Outline with a default string, indicate it like this:

- The Tale of the Four Kings
  - Introduction
  - `\*\*default\*\*`

### 4) Specifying Categories

If you wish to specify text categories that align with those found in the Sefaria Library (e.g., Talmud --> Bavli --> Seder Zeraim), please add them to the root bullet after the title. Surround the text category with the percent sign( `%`). The categories themselves should be separated with a comma (e.g., Talmud,Bavli,Seder Zeraim).

#### For example:&#x20;

When creating an Index Outline that includes text categories, indicate them like this:

- Modern Commentary on Esther / פירוש מודרני על מגילת אסתר %Tanakh,Commentary,Modern Commentary%
  - Introduction / הקדמה
    - Part One / חלק א׳
    - Part Two / חלק ב׳
  - `\*\*default\*\*`

# Important Notes

### Delimiters and Forbidden Characters

The following characters are used as delimiters, and therefore may **not** be used inside of any title:

- `/` - The forward slash
- `|` - The pipe character

Additionally, do **not** use a hyphen (i.e., `-`) as part of a title. Titles are used to craft URLs to Sefaria, and a hyphen is an illegal character inside a URL.

### Commenting

If you need to make a comment that should not be parsed, surround the comment by the pound sign `#` , so it will be ignored.

#### For example:

- Modern Commentary on Esther / פירוש מודרני על מגילת אסתר %Tanakh,Commentary,Modern Commentary%
  - Introduction / הקדמה
    - Part One / חלק א׳ # Remember to get the text for this!
    - Part Two / חלק ב׳ # I have the text in a .docx file, must convert!
  - `\*\*default\*\*`

### 5) Optional: Adding version text to the Workflowy outline

In some cases, it might be preferable to enter the version text into the Workflowy rather than later, through the Sefaria GUI. In this case, text can be added to outline nodes using the Workflowy "add note" feature. In order to use this feature, hover the cursor over the appropriate bullet and select "add note".&#x20;

_Please note: Only text of depth 1 can be added in this way. Any higher depth will not be possible (e.g., you can add a list of verses, but not a list of chapters with verses inside them)._

#### Parsing Text Formatting

This script uses the following standards when parsing:

- Text inside parenthesis `()`  is italicized (`<em>`).
- A paragraph break \[i.e., the enter or return key] separates paragraphs.
- Forward slashes `/` are interpreted as line breaks.
- If you need to list version attributes (e.g., versionTitle, versionSource, etc.), use the notes on the primary text title (the topmost title that refers to the whole book), as that will usually not have other text under it.

### 6) Exporting the Workflowy:

To export, simply hover the cursor over the bullet of a root node in the Workflowy document. Select "export" and choose opml. Save to `.opml` file.

#### For example:

An `.opml` file may look like this:

```html OPML
<?xml version="1.0"?>
<opml version="2.0">
  <head>
    <ownerEmail>
      sefaria-fan@my-email.com
    </ownerEmail>
  </head>
  <body>
    <outline text="Text" _note="Version is ABCDE&#10;">
      <outline text="My Text | Textual Text / הטקסט שלי %Tanakh,Modern Commentary%">
        <outline text="Chapter 1 / פרק א׳" _note="The first verse,The second verse,The third verse&#10;" />
        <outline text="Chapter 2 / פרק ב׳" />
      </outline>
    </outline>
  </body>
</opml>
```

# Part 2: Uploading the Index via Moderator Tools

To upload the text to Sefaria, make sure your local installation of the project is running.

To do so, log in to your local user account and make sure you have admin permissions set.

Once logged in, navigate to `/modtools`. On most machines this will be found at [http://127.0.0.1:8000/modtools](http://127.0.0.1:8000/modtools). Then, scroll down to the `Workflowy Outline Upload` section, pictured below:


<Image src="https://files.readme.io/a93b28b-Screen_Shot_2024-02-21_at_12.58.33.png" align="center" width="60% " border={true} />


Click on `choose file` and select the `.opml` file downloaded from Workflowy. Select whether you are **only&#x20;**&#x63;reating an `Index` or **both creating an&#x20;**`Index`**&#x20;and also adding a&#x20;**`Version`**&#x20;of the text**.&#x20;

Once you've completed selection, click `upload` to upload your text to your local Sefaria database.

Upon success, you will see the full `Index` record for the newly created text in the text box beneath the `upload` button, like this:


<Image src="https://files.readme.io/e067bb5-Screen_Shot_2024-02-21_at_12.47.22.png" align="center" width="60% " border={true} />


_Please note: To see this in the code, navigate to&#x20;_[_Sefaria-Project/sefaria/views.py_](https://github.com/Sefaria/Sefaria-Project/blob/54f78cb72a2c071261cee3cfd8317141fc5bed9d/sefaria/views.py#L1334)_&#x20;and look at the&#x20;_`modtools_upload_workflowy()`_&#x20;function._
