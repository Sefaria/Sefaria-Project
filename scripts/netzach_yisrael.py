#encoding=utf-8
import django
django.setup()
from sefaria.helper.schema import *

root = SchemaNode()
root.add_primary_titles("Netzach Yisrael", "נצח ישראל")
intro = JaggedArrayNode()
intro.add_structure(["Paragraph"])
intro.add_shared_term("Introduction")
intro.key = "intro"
intro.validate()
default = JaggedArrayNode()
default.default = True
default.key = "default"
default.add_structure(["Chapter", "Paragraph"])
default.validate()
root.append(intro)
root.append(default)
root.validate()
schema = root.serialize()

mapping = {}
for i in range(1, 65):
    actual_value = i-1
    if actual_value == 0:
        mapping["Netzach Yisrael 1"] = "Netzach Yisrael, Introduction"
    else:
        mapping["Netzach Yisrael {}".format(i)] = "Netzach Yisrael {}".format(actual_value)


migrate_to_complex_structure("Netzach Yisrael", schema, mapping)


library.rebuild(include_toc=True)

i = library.get_index("Netzach Yisrael")
section_refs = i.all_section_refs()
for ref in section_refs:
    new_text = ref.text('he').text[1:]
    tc = TextChunk(ref, vtitle="Netzach Yisrael", lang="he")
    tc.text = new_text
    tc.save(force_save=True)


