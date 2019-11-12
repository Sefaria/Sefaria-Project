
from sefaria.model import *

titles = library.get_indexes_in_category("Bavli")
for title in titles:
    indx = get_index(title)
    print(indx.title)
    try:
        indx.nodes.checkFirst["en"] = "Mishnah " + title
        indx.save()
    except Exception as e:
        print("Caught exception: {}".format(e))