---
title: Migrating Source Sheets via the Sefaria API
excerpt: ''
deprecated: false
hidden: true
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
---
Sefaria Source Sheets are stored in a simple, home-grown JSON format which includes some limited uses of HTML. For any source sheet you can access on Sefaria, you can see the JSON which underlies it by adding `/api/` to the root of its URL path, e.g. [http://www.sefaria.org/api/sheets/6](http://www.sefaria.org/api/sheets/6).

## Overview

Source sheets include a number of top level fields setting the title, publication status and overall viewing options. The bulk of the sheet is stored in an array of sources objects which may be one of 4 types (Source, Outside Text, Media, Comment). Each source may further have individual display options. 

Any textual content which a user may edit supports a subset of HTML tags which include: `a`, `b`, `i`, `u`, `em`, `strong`, `small`, `p`, `br`, `div`, `span` and `img`. 

At a minimum, sheets must contain a `title`, `status`, and sheet level `options`

## Top Level Fields

* `title` - HTML of the sheet title. HTML is allowed to format the sheet header, but in UI contexts on the site the title is shown stripped of HTML.
* `status` - either `unlisted` or `public`, whether or not the sheet is listed among public sheets for all Sefaria users.
* `options` - object with fields describing general options for how the sheet is viewed. While a user is viewing a sheet, they can change the value of each of their fields to (temporarily) adjust how they see the sheet. The `options` fields are:
  * `numbered` - boolean whether to show a source number before each source.
  * `boxed` - boolean whether to display a box around each source.
  * `bsd` - whether to show `בס"ד` at the top of the sheet.
  * `language` - what language the content of the sheet should appear in, either `english`, `hebrew` or `bilingual`. 
  * `layout` - for bilingual sheets, how languages should lay out, either `stacked` (Hebrew on top of English) or `sideBySide`. 
  * `langLayout` - for side by side bilingual sheets, which language should appear on which side, either `heLeft` (Hebrew on the left) or `heRight` (Hebrew on the right).
  * `divineNames` - what (if any) substitution scheme to use for the four letter name of G-d. Either `noSub` (no substitution), `yy` (substitute `יי`), `ykvk` (substitute `יקוק`) or `h` (substitute `ה'`).
  * `collaboration` - determines who is allowed to edit or add to the sheet. Adding means being able to add new sources to a sheet, but not edit existing sources. Options are: `none` (only the owner can edit), `anyone-can-add`, `anyone-can-edit`, `group-can-add`, `group-can-edit`.
* `id` - a unique integer ID. To create a new sheet, post a document without an `id`. The server will assign an `id` and return it the response. To edit an existing sheet, include its `id` field.
* `tags` - an array of strings, each representing a tag which applies to the sheet. 
* `group` - a string naming the Sefaria group to which a sheet belongs. Only members of a given group may set this field to that group name.
* `attribution` - \[optional] HTML that stands in place of the authorship line of the sheet. Without this field, sheets include the line "Source Sheet by X" where X is the name and a link to the profile of the sheet owner. 
* `promptedToPublish`- an ISO timestamp representing the date when a user was prompted to publish the sheet. For sheets created external to Sefaria, setting this field to any time in the past will prevent future prompts on non-public sheets.  

## Sources

The top level `sources` field is an array of objects representing different kinds of items on the sheet. The type of each source is determined by its fields and the determines how the data is rendered. The options for `source` objects are:

### Source

Determined by the presence of `ref` field. A source that comes from inside the Sefaria Library. By virtue of being a part of the Sefaria library, the source automatically inherits features like being able to automatically look up and add connections, link to the text in Sefaria, and reset the text of the source to what exists in the Sefaria database.

* `ref` - a string reference (citation) that defines the segment or ranges of segments in the text. See [Text References](https://developers.sefaria.org/docs/text-references) for more. To determine if a `ref` is understood by Sefaria, you can issue a query to the [Texts API](https://github.com/Sefaria/Sefaria-Project/wiki/API-Documentation#get-apitextsref); if the `ref` is not understood it will generate an error.
* `heRef` - a string, the Hebrew translation of `ref`, shown above the Hebrew text.
* `text` - an object consisting of two fields, `en` and `he`, which contain the HTML of the source text itself in English and Hebrew respectively.
* `title` - \[optional] a string that is shown as a custom title above the source.

### Outside Text

Determined by the presence of either `outsideText` or `outsideBiText` field. This type supports including sources which do not appear in the Sefaria library as free HTML. It may be either a single language or have bilingual content to mirror a source. Single language outside texts can be used to insert any free form HTML into a sheet.

* `outsideText` - HTML of the text for a single language case.
* `outsideBiText` - an object consisting of the fields `en` and `he` which contain HTML of the English and Hebrew of the text respectively.

### Comment

Determined by the presence of the field `comment`.  Like single language outside texts, comments are free HTML, but comments are rendered in the interface with a comment icon and may in the future link to more social features. 

* `comment` - HTML of the comment text.

### Media

Determined by the presence of the field `media`. This type may be either an embedded image, MP3, or YouTube video.

* `media` - the URL of the media resource. How the media is rendered is determined by the URL's extension/domain:
  * Image: if the URL ends with `.jpg`, `.jpeg`, `.gif` or `.png` it is rendered in an `<img>` tag.
  * MP3: if the URL ends with `.mp3` or is hosted on `clyp.it`, it is rendered in an `<audio>` tag.
  * Video: if the URL is to a YouTube video, it is rendered as an `<iframe>` to YouTube.

## Source Level Options

Each source object may optionally include an `options` field with an object storing source level objects which override the default display of the source. These options are:

* `sourceLanguage` - which language to display the source content in;  either `hebrew`, `english` or `bilingual`.
* `sourceLayout` - for bilingual sources, whether the layout should be `stacked` or `sideBySide`.
* `sourceLangLayout` - for side by side bilingual sources, on which side the Hebrew text should be displayed. Either `heLeft` for Hebrew on the left, or `heRight` for Hebrew on the right.
* `indented` - sets an indentation level for a source. Three levels of indentation are supported with the values `indented-1`, `indented-2` and `indented-3`. 
* `sourcePrefix` - a string that contains content that can be displayed as marginalia.
* `PrependRefWithEn` - a string that contains content to prepend before the English reference of a source. 
* `PrependRefWithHe` - a string that contains content to prepend before the Hebrew reference of a source. 

## Fields Set only by the Server

A number of fields are set internally to Sefaria's database and cannot be set except in the process of saving a sheet within Sefaria. These include:

* `_id` - a unique Mongo ID.
* `owner` - user ID of the sheet's owner.
* `views` - integer number of times the sheet has been viewed.
* `likes` - array of integer user IDs of users who like this sheet. 
* `dateCreated` - ISO timestamp when the document was first created.
* `dateModified` - ISO timestamp when the document was last changed
* `lastModified` - ISO timestamp of the previous modification time, used to check if a sheet has been updated since the client last received its data.
* `nextNode` - integer used to track the next node ID to assign to a new source. Node IDs are used only for real time collaborative editing. 
* \[on a source] `node` - integer ID of the source used in real time collaborative editing.

## Example Script

```
# -*- coding: utf-8 -*-
"""
Post sheets to Sefaria using an API Key.
"""
import sys
import json
import requests

sheets = [
   {"title": "Source Sheet 1 Title" ...},
   {"title": "Source Sheet 2 Title" ...},
   ...
]

for sheet in sheets:

   sheet_json = {}
   sheet_json["status"] = "public"
   sheet_json["title"] = sheet["title"]
   sheet_json["sources"] = []
   sheet_json["options"] = {"numbered": 0,"assignable": 0,"layout": "sideBySide","boxed": 0,"language": "bilingual","divineNames": "noSub","collaboration": "none", "highlightMode": 0, "bsd": 0,"langLayout": "heRight"}

   sheet_content = json.dumps(sheet_json)
   values = {'json': sheet_content, 'apikey': 'API_KEY'}  # Fill in API_KEY with your api key. To obtain an api key, contact hello@sefaria.org

   try:
     response = requests.post("https://www.sefaria.org/api/sheets", data=values)  
     print("Sheet posted.")
     print(r.json())
   except urllib2.HTTPError as e:
     error_message = e.read()
     print(error_message)

```