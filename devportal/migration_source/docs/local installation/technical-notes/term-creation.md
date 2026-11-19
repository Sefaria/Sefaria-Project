---
title: Term Creation
excerpt: Two ways of creating a Term on a local instance of Sefaria
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
---
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
