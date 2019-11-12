# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.model.schema import *
import json

root = SchemaNode()
root.add_title("Pesach Haggadah", "en", primary=True)
root.key = root.primary_title()
root.add_title("הגדה של פסח", "he", primary=True)

#1. Kadesh
n = JaggedArrayNode()
n.add_title("Kadesh", "en", primary=True)
n.add_title("קדש", "he", primary=True)
n.key = n.primary_title()
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]
n.append_to(root)

#2. Urchatz
n = JaggedArrayNode()
n.add_title("Urchatz", "en", primary=True)
n.add_title("Wash", "en")
n.add_title("ורחץ", "he", primary=True)
n.key = n.primary_title()
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]
n.append_to(root)

#3. Karpas
n = JaggedArrayNode()
n.add_title("Karpas", "en", primary=True)
n.add_title("Greens", "en")
n.add_title("כרפס", "he", primary=True)
n.key = n.primary_title()
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]
n.append_to(root)

#4. Yachatz
n = JaggedArrayNode()
n.add_title("Yachatz", "en", primary=True)
n.add_title("Break", "en")
n.add_title("יחץ", "he", primary=True)
n.key = n.primary_title()
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]
n.append_to(root)

#5. Magid
n = SchemaNode()
n.add_title("Magid", "en", primary=True)
n.add_title("מגיד", "he", primary=True)
n.key = n.primary_title()

    #parts of Magid
m = JaggedArrayNode()
m.add_title("Ha Lachma Anya", "en", primary=True)
m.add_title("הא לחמא עניא", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Four Questions", "en", primary=True)
m.add_title("Ma Nishtana", "en")
m.add_title("מה נשתנה", "he", primary=True)
m.add_title("ארבע קושיות", "he")
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("We Were Slaves in Egypt", "en", primary=True)
m.add_title("עבדים היינו","he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Story of the Five Rabbis", "en", primary=True)
m.add_title("מעשה שהיה בבני ברק","he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("The Four Sons", "en", primary=True)
m.add_title("כנגד ארבעה בנים","he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Yechol Me'rosh Chodesh", "en", primary=True)
m.add_title("יכול מראש חודש?","he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("In the Beginning Our Fathers Were Idol Worshipers", "en", primary=True)
m.add_title("מתחילה עובדי עבודה זרה היו אבותינו","he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("First Fruits Declaration", "en", primary=True)
m.add_title("ארמי אבד אבי","he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("The Ten Plagues", "en", primary=True)
m.add_title("עשרת המכות","he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Dayenu", "en", primary=True)
m.add_title("דיינו","he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Rabban Gamliel's Three Things", "en", primary=True)
m.add_title("פסח מצה ומרור","he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("First Half of Hallel", "en", primary=True)
m.add_title("חצי הלל","he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Second Cup of Wine", "en", primary=True)
m.add_title("כוס שניה","he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

n.append_to(root)

#6. Rachtzah
n = JaggedArrayNode()
n.add_title("Rachtzah", "en", primary=True)
n.add_title("רחצה", "he", primary=True)
n.key = n.primary_title()
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]
n.append_to(root)

#7. Motzi Matzah
n = JaggedArrayNode()
n.add_title("Motzi Matzah", "en", primary=True)
n.add_title("מוציא מצה", "he", primary=True)
n.key = n.primary_title()
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]
n.append_to(root)

#8. Maror
n = JaggedArrayNode()
n.add_title("Maror", "en", primary=True)
n.add_title("מרור", "he", primary=True)
n.key = n.primary_title()
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]
n.append_to(root)

#9. Korech
n = JaggedArrayNode()
n.add_title("Korech", "en", primary=True)
n.add_title("כורך", "he", primary=True)
n.key = n.primary_title()
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]
n.append_to(root)

#10. Shulchan Orech
n = JaggedArrayNode()
n.add_title("Shulchan Orech", "en", primary=True)
n.add_title("Meal", "en")
n.add_title("שולחן עורך", "he", primary=True)
n.key = n.primary_title()
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]
n.append_to(root)

#11. Tzaphun
n = JaggedArrayNode()
n.add_title("Tzafun", "en", primary=True)
n.add_title("Afikoman", "en")
n.add_title("צפון", "he", primary=True)
n.add_title("אפיקומן", "he")
n.key = n.primary_title()
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]
n.append_to(root)

#12. Barech
n = SchemaNode()
n.add_title("Barech", "en", primary=True)
n.add_title("ברך", "he", primary=True)
n.key = n.primary_title()

m = JaggedArrayNode()
m.add_title("Birkat Hamazon", "en", primary=True)
m.add_title("Grace After the Meal", "en")
m.add_title("ברכת המזון", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Third Cup of Wine", "en", primary=True)
m.add_title("כוס שלישית", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Pour Out Thy Wrath", "en", primary=True)
m.add_title("שפוך חמתך", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

n.append_to(root)

#13. Hallel
n = SchemaNode()
n.add_title("Hallel", "en", primary=True)
n.add_title("הלל", "he", primary=True)
n.key = n.primary_title()

m = JaggedArrayNode()
m.add_title("Second Half of Hallel", "en", primary=True)
m.add_title("מסיימים את ההלל", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Songs of Praise and Thanks", "en", primary=True)
m.add_title("מזמורי הודיה", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Fourth Cup of Wine", "en", primary=True)
m.add_title("כוס רביעית", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

n.append_to(root)

#14. Nirtza
n = SchemaNode()
n.add_title("Nirtzah", "en", primary=True)
n.add_title("נרצה", "he", primary=True)
n.key = n.primary_title()

m = JaggedArrayNode()
m.add_title("Chasal Siddur Pesach", "en", primary=True)
m.add_title("חסל סידור פסח", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("L'Shana HaBaa", "en", primary=True)
m.add_title("לשנה הבאה", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("And It Happened at Midnight", "en", primary=True)
m.add_title("ויהי בחצי הלילה", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Zevach Pesach", "en", primary=True)
m.add_title("זבח פסח", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Ki Lo Na'e", "en", primary=True)
m.add_title("אדיר במלוכה", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Adir Hu", "en", primary=True)
m.add_title("אדיר הוא", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Sefirat HaOmer", "en", primary=True)
m.add_title("ספירת העומר", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Echad Mi Yodea?", "en", primary=True)
m.add_title("One, Who Knows?", "en")
m.add_title("אחד מי יודע", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

m = JaggedArrayNode()
m.add_title("Chad Gadya", "en", primary=True)
m.add_title("חד גדיא", "he", primary=True)
m.key = m.primary_title()
m.depth = 1
m.sectionNames = ["Paragraph"]
m.addressTypes = ["Integer"]
m.append_to(n)

n.append_to(root)



#index.nodes = root

print(json.dumps(root.serialize()))