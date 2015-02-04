import sefaria.model as model
from sefaria.system.database import db

commentary_texts = model.library.get_commentary_versions()

def find_blanks_at_start(vlist):
    if isinstance(vlist, list) and len(vlist):
        return len(vlist) >1 and vlist[0].strip() == ''
    return False


with open("log/length_comparisgiton.txt", 'w+') as out:
    for commentary in commentary_texts:
        if commentary.language == 'he':
            for ch,chapter in enumerate(commentary.chapter,1):
                for vs, verse in enumerate(chapter, 1):
                    if find_blanks_at_start(verse):
                        str = "%s [%s]: %s.%s\n" % (commentary.title, commentary.versionTitle, ch, vs)
                        out.write(str.encode('utf-8'))




