
from sefaria.model import *

for indx in IndexSet():
    if indx.is_commentary():
        print "Skipping " + indx.title
        continue
    print indx.title
    try:
        indx.save()
    except Exception as e:
        print u"Caught exception: {}".format(e)