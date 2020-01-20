from sefaria.model import *

all_refs = library.ref_list()
for r in all_refs:
    try:
        tc = TextChunk(r,'he')
        if len(tc.text) > 0:
            tc.text_index_map()
    except ValueError:
        print(str(r))
    except AssertionError:
        print("Assertion Error {}".format(r))