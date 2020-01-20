#encoding=utf-8
import django
django.setup()
from sefaria.model import *
if __name__ == "__main__":
    i = library.get_index("Midrash Tanchuma")
    node = i.nodes.children[2]
    node.add_title("Genesis", 'en')
    i.save()
    i = library.get_index("Gur Aryeh on Bereishit")
    i.nodes.add_title("Gur Aryeh on Genesis", 'en')
    i.save()
    i = library.get_index("Gur Aryeh on Bamidbar")
    i.nodes.add_title("Gur Aryeh on Numbers", 'en')
    i.save()
    i = library.get_index("Gur Aryeh on Devarim")
    i.nodes.add_title("Gur Aryeh on Deuteronomy", 'en')
    i.save()
    i = library.get_index("Meshech Hochma")
    node = library.get_index("Meshech Hochma").nodes.children[4]
    node.add_title("Chayei Sara", 'en')
    node = library.get_index("Meshech Hochma").nodes.children[6]
    node.add_title("Vayetzei", "en")
    node = library.get_index("Meshech Hochma").nodes.children[45]
    node.add_title("Korach", "en")
    i.save()
    t = Term().load({"titles.text": "Ki Tisa"})
    t.add_title('פרשת כי-תשא', 'he')
    t.save()
    t = Term().load({'titles.text': "Bechukotai"})
    t.add_title('פרשת בחקותי', 'he')
    t.save()
    t = Term().load({"titles.text": "Sh'lach"})
    t.add_title('פרשת שלח לך', 'he')
    t.save()
    t = Term().load({"titles.text": "Pinchas"})
    t.add_title('פרשת פינחס', 'he')
    t.save()