from sefaria.model import *

def make_commentary2(commentator):
    indices = IndexSet({"title": {"$regex": "^%s on " % commentator}})
    for i in indices:
        print(i.title)
        basetext = i.title[(len(commentator) + 4):]
        b = library.get_index(basetext)
        i.categories = ["Commentary2"] + b.categories + [basetext]
        i.save()

#make_commentary2("Rosh")
#make_commentary2("Rif")
#make_commentary2("Divrey Chamudot")
#make_commentary2("Korban Netanel")
#make_commentary2("Maadaney Yom Tov")
#make_commentary2("Pilpula Charifta")
#make_commentary2("Tiferet Shmuel")
#make_commentary2("Chidushei Agadot")
#make_commentary2("Chidushei Halachot")