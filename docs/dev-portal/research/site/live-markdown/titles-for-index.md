---
updatedAt: 2025-09-01T11:01:47.000Z
agentTools:
  projectIndex: https://developers.sefaria.org/llms.txt
---

# Titles for Index

How to initialize a new Index on a local instance of Sefaria

If you are creating a new `Index` (within your local clone of the project) with no titles or changing the titles within an object, the field `sharedTitle` cannot be set, and instead the method `add_shared_term()` must be called in Python, as follows:

```python
import django

django.setup()

from sefaria.model import *


node = JaggedArrayNode()
node.key = "Genesis"
node.add_shared_term("Genesis")
node.depth = 1
node.addressTypes = ['Integer']
node.sectionNames = ['Verse']
record.append(node)
record.validate()
```

##