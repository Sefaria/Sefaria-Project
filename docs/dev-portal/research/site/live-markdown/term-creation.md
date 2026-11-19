---
updatedAt: 2025-09-01T11:01:46.000Z
agentTools:
  projectIndex: https://developers.sefaria.org/llms.txt
---

# Term Creation

Two ways of creating a Term on a local instance of Sefaria

When creating an Index record with a new English titled element (e.g. a new sub category in the Table of Contents) a corresponding `Term` must be added to supply, at the very least, a matching Hebrew title.

Example Terms API Payload:

```
term_obj = {
    "name": "Ramban",
    "scheme": "commentary_works",
    "titles": [
        {
            "lang": "en",
            "text": "Ramban",
            "primary": True
        },
        {
            "lang": "he",
            "text": u"רמבן",
            "primary": True
        }
    ]
}
full_url = "http://whatever.server.exmp/api/terms/{}".format(urllib.quote("Ramban"))
```

Alternatively, you can use the post\_term method located in `sources/functions.py` in `Sefaria-Data`:

```
from sources.functions import post_term
term_obj = {
    "name": "Ramban",
    "scheme": "commentary_works",
    "titles": [
        {
            "lang": "en",
            "text": "Ramban",
            "primary": True
        },
        {
            "lang": "he",
            "text": u"רמבן",
            "primary": True
        }
    ]
}
post_term(term_obj)

```