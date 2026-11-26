---
title: The Sefaria Linker API
excerpt: Learn how to use the Sefaria Linker API.
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
---
The [Sefaria Linker](https://www.sefaria.org/linker) relies on a POST API, as documented below.

# Introduction

Takes in text input and returns the corresponding location, along with a Sefaria link for each citation recognized in the text input.

_Please note: The response format has changed recently. See [Response Format](#response-format) below._

See the table below for information on current support by language.

| Language | Support                                                                                                                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| English  | Relies on Convolutional Neural Network (CNN) models. Aims to limit false positives, supports ibid citations, and will return multiple options if a citation is ambiguous.                                                   |
| Hebrew   | Relies on a BERT-based transformer model. Aims to limit false positives, supports ibid citations, and will return multiple options if a citation is ambiguous. Performance is often better than found in the English model. |

# The API

## POST /api/find-refs

This endpoint takes a text input and returns the corresponding location along with a Sefaria link for each recognized citation.

### URL Parameters

| URL param    | Description                                                                                                                                                             | Type                   | Default |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| with_text    | Returns the text for each citation. See [with_text format section](#with_text-format) for details.                                                                      | 0 or 1                 | 0       |
| debug        | Returns debug information for each citation. See [debug format section](#debug-format) for details.                                                                     | 0 or 1                 | 0       |
| max_segments | When `with_text` is `1`, this defines the max number of segments to return for a citation and limits the size of the response for general citations like `פרשת בראשית`. | int. 0 means no limit. | 0       |

### POST body

The POST body should be a serialized JSON with the following fields:

| Field | Description                                                                           | Required |
| ----- | ------------------------------------------------------------------------------------- | -------- |
| text  | Text to search for citations in. See [text format section](#text-format) for details. | Yes      |

### Response Format

This responds with HTTP code 202, indicating the request was accepted but not yet completed, and a task ID in the following format:

```javascript
{
  "task_id": <str>
}
```

This task ID can then be used to poll the async API until a 200 response code is received. When the async API returns a 200, the response will contain a `"result"` key with the following object: 

```javascript
{
   "title": {
      // data corresponding to results in the "title" field of the POST data
      "results": [
         "startChar": <int>,    // start character of result relative to input text.
         "endChar": <int>,      // end character of result relative to input text.
         "text": <str>,         // text of the citation for this result. corresponds to data.title.substring(startChar, endChar)
         "linkFailed": <bool>,  // true if reference was located but failed to be linked to a source on Sefaria. Could mean an error in the linker or the source doesn't exist on Sefaria.
         "refs": [<str>],       // list of references in Sefaria format that this result could be linked to. If more than one reference, then the citation was considered to be ambiguous.
      ],
      "refData": {
         // object with keys for every ref in "results".
         <ref>: {
            heRef: <str>,           // Hebrew translation of reference
            url: <str>,             // reference in URL form. Create a URL to Sefaria with this format: www.sefaria.org/<url>
            primaryCategory: <str>  // primary category of reference in Sefaria. Corresponds to location in table of contents ([sefaria.org/texts](sefaria.org/texts).
            he: <str>,              // Hebrew text of <ref>. Only included if `with_text` URL param is `1`.
            en: <str>,              // English text of <ref>. Only included if `with_text` URL param is `1`.
            isTruncated: <bool>     // Was text truncated. Only included if `with_text` URL param is `1` and `max_segments` URL param is greater than 0.
         }
      },  
      "debugData": [],  // array of debug data where each element corresponds to an element in "results". only included if "debug" URL param is `1`. see "debug format" section.
   },
   "body": {
       // data corresponding to results in the "body" field of the POST data
       // same format as "title" object
   }
}
```

For further information on this, see the following [example](#example).

### with_text format

When `with_text` URL param is `1`, the following keys are added to the response object at `response.title.refData` and `response.body.refData`:

| Field       | Description                                                                            |
| ----------- | -------------------------------------------------------------------------------------- |
| he          | Hebrew text of `<ref>`, where `<ref>` is the key of the `refData` element.             |
| en          | English text of `<ref>`, where `<ref>` is the key of the `refData` element.            |
| isTruncated | Defines whether text has been truncated according to the `max_segments` URL parameter. |

### debug format

When the `debug` URL param is `1`, the `debugData` field is added to the response object at `response.title` and `response.body`. The `debugData` field has the same shape as the `response.title.results` and `response.body.results` fields (a 2-D array, wherein the outer array describes each citation found and the inner arrays describe each possible way of parsing a given citation). 

Here is an example of a single element in `debugData` with comments explaining each field:

```javascript
 {
               "orig_part_strs":[  // original input string broken into parts
                  "איוב",
                  "פרק יז"
               ],
               "orig_part_types":[  // associated types for each part in `orig_part_strs`
                  "NAMED",
                  "NUMBERED"
               ],
               "final_part_strs":[  // final part strings after processing (often times this is the same as `orig_part_strs` but can differ if in some cases)
                  "איוב",
                  "פרק יז"
               ],
               "final_part_types":[  // associated types for each part in `final_part_strs`
                  "NAMED",
                  "NUMBERED"
               ],
               "resolved_part_strs":[  // actual parts that were resolved. This is important because sometimes the parts are merged during resolution
                  "איוב",
                  "פרק יז"
               ],
               "resolved_part_types":[  // associated types for each part in `resolved_part_strs`
                  "NAMED",
                  "NUMBERED"
               ],
               "resolved_part_classes":[  // associated classes for each part in `resolved_part_strs`. This can help debug cases where context and ibid were used.
                  "RawRefPart",
                  "RawRefPart"
               ],
               "context_ref":null,  // If a context ref was used to resolve the citation (e.g. in the case of an ibid citation), it will appear here.
               "context_type":null  // associated type of context for `context_ref`.
            }
```

### text format

The POST data field `text` should be formatted in the following manner:

```javascript
{
   "title": <str>,  // text of the title of the document. May be empty string when there is not title. Any citations found in the title will be assumed as context for citations found in the "body". This is useful for articles that focus on one Perek of Tanakh for example.
   "body": <str>  // text of the body of the document
}
```

# Linker API Example

Below is an example in cURL format that uses all the URL parameters. Please note that none of the URL parameters in this example are required; they are included here for explanatory purposes. The example below shows how a citation in the "title" field may provide context for citations in the "body" field.

## Example Input

```curl
curl -X POST 'https://www.sefaria.org/api/find-refs?debug=1&with_text=1&max_segments=5' --data-raw '{"text":{"body": "ראה מה שכתוב בפסוק א.", "title": "עיון על איוב פרק יז"}}'
```

## Example Output

The API call above will return a task ID such as: 

```javascript
{ "task_id": "my-task-id" }
```

Once you receive the task ID, poll the async API until you get a 200 response code:

```curl
curl -X GET 'https://www.sefaria.org/api/async/my-task-id
```

When the async API returns a 200 response code, you will see the following response: 

_Please note: The linker API response data is found in the `"result"`field._

```javascript
{
  "task_id": "my-task-id",
  "state": "SUCCESS",
  "ready": true,
  "result": {
    "title": {
      "results": [
        {
          "startChar": 8,
          "endChar": 19,
          "text": "איוב פרק יז",
          "linkFailed": false,
          "refs": [
            "Job 17"
          ]
        }
      ],
      "refData": {
        "Job 17": {
          "heRef": "איוב י״ז",
          "url": "Job.17",
          "primaryCategory": "Tanakh",
          "he": [
            "רוּחִ֣י חֻ֭בָּלָה יָמַ֥י נִזְעָ֗כוּ קְבָרִ֥ים לִֽי׃",
            "אִם־לֹ֣א הֲ֭תֻלִים עִמָּדִ֑י וּ֝בְהַמְּרוֹתָ֗ם תָּלַ֥ן עֵינִֽי׃",
            "שִֽׂימָה־נָּ֭א עׇרְבֵ֣נִי עִמָּ֑ךְ מִ֥י ה֝֗וּא לְיָדִ֥י יִתָּקֵֽעַ׃",
            "כִּֽי־לִ֭בָּם צָפַ֣נְתָּ מִּשָּׂ֑כֶל עַל־כֵּ֝֗ן לֹ֣א תְרֹמֵֽם׃",
            "לְ֭חֵלֶק יַגִּ֣יד רֵעִ֑ים וְעֵינֵ֖י בָנָ֣יו תִּכְלֶֽנָה׃"
          ],
          "en": [
            "My spirit is crushed, my days run out;<br/>The graveyard waits for me.<br/>",
            "Surely mocking men keep me company,<br/>And with their provocations I close my eyes.",
            "Come now, stand surety for me!<br/>Who will give his hand on my behalf?",
            "You have hidden understanding from their minds;<br/>Therefore You must not exalt [them].",
            "He informs on his friends for a share [of their property],<br/>And his children’s eyes pine away.<br/>"
          ],
          "isTruncated": true
        }
      },
      "debugData": [
        [
          {
            "orig_part_strs": [
              "איוב",
              "פרק יז"
            ],
            "orig_part_types": [
              "NAMED",
              "NUMBERED"
            ],
            "final_part_strs": [
              "איוב",
              "פרק יז"
            ],
            "final_part_types": [
              "NAMED",
              "NUMBERED"
            ],
            "resolved_part_strs": [
              "איוב",
              "פרק יז"
            ],
            "resolved_part_types": [
              "NAMED",
              "NUMBERED"
            ],
            "resolved_part_classes": [
              "RawRefPart",
              "RawRefPart"
            ],
            "context_ref": null,
            "context_type": null
          }
        ]
      ]
    },
    "body": {
      "results": [
        {
          "startChar": 13,
          "endChar": 20,
          "text": "בפסוק א",
          "linkFailed": false,
          "refs": [
            "Job 17:1"
          ]
        }
      ],
      "refData": {
        "Job 17:1": {
          "heRef": "איוב י״ז:א׳",
          "url": "Job.17.1",
          "primaryCategory": "Tanakh",
          "he": [
            "רוּחִ֣י חֻ֭בָּלָה יָמַ֥י נִזְעָ֗כוּ קְבָרִ֥ים לִֽי׃"
          ],
          "en": [
            "My spirit is crushed, my days run out;<br/>The graveyard waits for me.<br/>"
          ],
          "isTruncated": false
        }
      },
      "debugData": [
        [
          {
            "orig_part_strs": [
              "בפסוק א"
            ],
            "orig_part_types": [
              "NUMBERED"
            ],
            "final_part_strs": [
              "בפסוק א"
            ],
            "final_part_types": [
              "NUMBERED"
            ],
            "resolved_part_strs": [
              "job",
              "SectionContext(AddressPerek(0), 'Chapter', 17)",
              "בפסוק א"
            ],
            "resolved_part_types": [
              "NAMED",
              "NUMBERED",
              "NUMBERED"
            ],
            "resolved_part_classes": [
              "TermContext",
              "SectionContext",
              "RawRefPart"
            ],
            "context_ref": "Job 17",
            "context_type": "CURRENT_BOOK"
          }
        ]
      ]
    }
  }
}
```

# Debugging Using Local Webpage

To easily debug why certain citations aren't working, it is useful to use the linker.js plugin, which has built-in debug tools. Below is a skeleton HTML page you can use to test content against the linker. This webpage has linker.js embedded in debug mode, which will show all citations caught, including ones that weren't linked. See [here](https://github.com/Sefaria/Sefaria-Project/wiki/Sefaria-Auto-Linker-v3#debug) for more information on how the `debug` option works.

```html
<html>
    <body>
        <h1>TITLE HERE</h1>
        <p>BODY HERE</p>
    </body>
    <script type="text/javascript" charset="utf-8" src="https://www.sefaria.org/linker.v3.js"></script>
    <script>sefaria.link({debug: true});</script>
</html>
```