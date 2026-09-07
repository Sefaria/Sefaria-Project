from sefaria.helper.schema import cascade
import re
from sefaria.model import *
from sefaria.model.text import TextChunk



## delete first segment in base text
for ref in library.get_index("Seder Olam Rabbah").all_section_refs():
  if ref.normal().startswith("Seder Olam Rabbah, Introduction"):
    continue
  for v in VersionSet({"title": "Seder Olam Rabbah"}):
     tc = TextChunk(ref, vtitle=v.versionTitle)
     if len(tc.text) == 2:
       tc.text = [tc.text[1]]
       try:
         tc.save()
       except Exception as e:
         print(tc)
         print(e)



## offset text in commentaries
books = ["Vilna Gaon", "Yaakov Emden", "Meir Ayin"]
for book in books:
  real_book = f"{book} on Seder Olam Rabbah"
  for ref in library.get_index(real_book).all_top_section_refs():
    if "Introduction" in ref.normal():
      continue
    for v in VersionSet({"title": real_book}):
      tc = TextChunk(ref, vtitle=v.versionTitle)
      if len(tc.text) == 0:
        continue
      tc.text = [tc.text[1]]
      try:
        tc.save()
      except Exception as e:
        print(tc)
        print(e)
    



## cascade to topics, links, and source sheets
needs_rewrite_base_text = lambda x, *y: x.startswith("Seder Olam Rabbah")
needs_rewrite_comm_text = lambda x, *y: " on Seder Olam Rabbah" in x

def rewriter_base_text(x):
  x = Ref(x).normal()
  if x.endswith(":2"):
    return x.replace(":2", ":1")
  return x

def rewriter_comm_text(x):
  x = Ref(x).normal()
  return re.sub(r'(\d+):2:(\d+)$', r'\1:1:\2', x)

for ref in library.get_index("Seder Olam Rabbah").all_segment_refs():
  cascade(ref, rewriter=rewriter_base_text, needs_rewrite=needs_rewrite_base_text)

for book in ["Vilna Gaon", "Yaakov Emden", "Meir Ayin"]:
  for ref in library.get_index(f"{book} on Seder Olam Rabbah"):
    cascade(ref, rewriter=rewriter_comm_text, needs_rewrite=needs_rewrite_comm_text)
