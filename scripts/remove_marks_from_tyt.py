import re
from sefaria.model.text import IndexSet
from sefaria.helper.text import modify_text_by_function


def out_brace(raw_string):
    temp_string = re.sub(ur"\((.*?)\)", ur"#\1%", raw_string)
    temp_string = re.sub(ur" [\u05d0-\u05ea]{1,2}\)", u"", temp_string)
    temp_string = temp_string.replace(u"#", u"(")
    temp_string = temp_string.replace(u"%", u")")
    return temp_string

tyt = IndexSet({'title': {'$regex': '^Tosafot Yom Tov.*'}})
vtitle = 'Mishnah, ed. Romm, Vilna 1913'

for i, dex in enumerate(tyt):
    print "{}/{}".format(i+1, tyt.count())
    modify_text_by_function(dex.title, vtitle, 'he', out_brace, 23432)
    dex.versionState().refresh()