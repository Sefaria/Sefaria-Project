import django
django.setup()
from sefaria.model import *
from sefaria.helper.schema import *

def needs_rewrite(*args):
  if args[0].startswith("Tanna debei Eliyahu Zuta, Seder Eliyahu Zuta"):
    print("needs_rewrite", args[0])
    return True
  print("doesnt need rewrite", args[0])
  return False

def rewriter(x):
  x = x.replace(", Seder Eliyahu Zuta", "")
  print(x)
  return x

def convert_node_to_default(node):
    from sefaria.model.schema import TitleGroup
    vs = [v for v in node.index.versionSet()]
    for v in vs:
        curr_chapter = v.chapter
        for key in node.version_address()[:-1]:
            curr_chapter = curr_chapter[key]
        curr_chapter['default'] = curr_chapter[node.version_address()[-1]]
        curr_chapter.pop(node.version_address()[-1])
        v.save(override_dependencies=True)

    node.title_group = TitleGroup()
    node.default = True
    node.key = "default"
    node.index.save(override_dependencies=True)
    library.rebuild()
    refresh_version_state(node.index.title)

i = library.get_index("Tanna debei Eliyahu Zuta")
#
merge_default_into_parent(i.nodes.children[0])
i.save(override_dependencies=True)

i = library.get_index("Tanna debei Eliyahu Zuta")
convert_node_to_default(i.nodes.children[0])
i.save(override_dependencies=True)
cascade("Tanna debei Eliyahu Zuta", rewriter=rewriter, needs_rewrite=needs_rewrite)
