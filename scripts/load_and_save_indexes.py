
from sefaria.model import *

for indx in IndexSet():
    try:
        indx.save()
    except Exception as e:
        print u"Caught exception: {}".format(e)