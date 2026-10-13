import contextlib

from sefaria.clean import remove_old_counts
from sefaria.model import *
from sefaria.system.database import db

# Clear out counts
remove_old_counts()
db.vstate.remove({})

# Remove mongo indexes for Index.titleVariants
for x in ["titleVariants", "titleVariants_1"]:
    with contextlib.suppress(BaseException):
        db.index.drop_index(x)

# Covert Indexes to new format
for indx in IndexSet():
    print(indx.title)
    try:
        indx.save()
    except Exception as e:
        print(f"Caught exception: {e}")

# Convert all existing Version counts to VersionState objects
for c in CountSet({"title": {"$exists": 1}}):
    print(c.title)
    try:
        vs = VersionState(c.title)
        vs.flags = getattr(c, "flags", {})
        vs.save()
    except Exception as e:
        print(f"Couldn't modify version state {c.title}: {e}")
