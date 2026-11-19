---
title: Shape API
excerpt: Learn more about how to use the Shape API.
deprecated: false
hidden: true
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
  pages:
    - type: basic
      slug: categories
      title: Categories
---
# Shape API

The shape API allows one to retrieve information about the shape of an `Index` on Sefaria. The shape refers to some basic statistics about the `Index`, most prominently the number of chapters and segments per chapter.

## GET /api/shape/:title

### Path Parameters

`title` - A valid node title or a path to a category, separated by `/`.

### Example requests:

* `/api/shape/Genesis`
* `/api/shape/Pesach_Haggadah`
* `/api/shape/Talmud/Bavli`

### Query Parameters

The following two query parameters can be passed in calls to the Shape API to further filter results.

<Table align={["left","left","left","left"]}>
  <thead>
    <tr>
      <th>
        Parameter
      </th>

      <th>
        Type
      </th>

      <th>
        Default value
      </th>

      <th>
        Explanation
      </th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>
        `depth`
      </td>

      <td>
        `int`
      </td>

      <td>
        `2`
      </td>

      <td>
        The `depth` parameter in the query string indicates how many levels in the category tree to descend.  
        If `depth=0`is passed, then the returned JSON descends to end of tree.
      </td>
    </tr>

    <tr>
      <td>
        `dependents`
      </td>

      <td>
        `bool`
      </td>

      <td>
        `false`
      </td>

      <td>
        The `dependents` parameter, if true, includes dependent texts.  These are filtered out by default.
      </td>
    </tr>
  </tbody>
</Table>

### Example Responses

#### Simple Texts

For simple texts, the response returns a dict with keys that contain the following fields:

```
{
	"section": Category immediately above book
	"heTitle": Hebrew title of node
	"length": Number of chapters
	"chapters": List of Chapter Lengths 
	"title": English title of node
	"book": English title of Book
}
```

Below is an example of a response for `sefaria.org/api/shape/Jonah`:

```
[
  {
    "section": "Prophets",
    "heTitle": "יונה",
    "title": "Jonah",
    "length": 4,
    "chapters": [
      16,
      11,
      10,
      11
    ],
  "book": "Jonah",
  "heBook": "יונה"
  }
]
```

#### Complex Texts

For complex texts or categories, the Shape API will return a list of dicts for each text within that category or text.

Here is a snippet of what is returned when querying the Shape API for the category `Liturgy`. To see the full response, [try the full query here](https://www.sefaria.org/api/shape/Liturgy).

```
[
  ...
	{
		"section": "Siddur",
		"heTitle": "סידור אשכנז, ימי חול, תפילת שחרית, הכנה לתפילה, מה טובו",
		"title": "Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Ma Tovu",
		"length": 1,
		"chapters": 1,
		"book": "Siddur Ashkenaz",
		"heBook": "סידור אשכנז"
	},
	{
		"section": "Siddur",
		"heTitle": "סידור אשכנז, ימי חול, תפילת שחרית, הכנה לתפילה, אדון עולם",
		"title": "Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Adon Olam",
		"length": 1,
		"chapters": 10,
		"book": "Siddur Ashkenaz",
		"heBook": "סידור אשכנז"
	},
	{
		"section": "Siddur",
		"heTitle": "סידור אשכנז, ימי חול, תפילת שחרית, הכנה לתפילה, יגדל",
		"title": "Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Yigdal",
		"length": 1,
		"chapters": 27,
		"book": "Siddur Ashkenaz",
		"heBook": "סידור אשכנז"
	}
...
]
```
