---
title: Titles for Index
excerpt: How to initialize a new Index on a local instance of Sefaria
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
---
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
