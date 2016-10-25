# -*- coding: utf-8 -*-

from sefaria.model import *
from datetime import datetime

NotificationSet().update({"is_global": False})

GlobalNotification()\
    .make_version(Version().load({'title': 'Kedushat Levi', 'versionTitle': 'Kedushat Levi translated by Rb. Eliyahu Munk'})) \
    .set_date(datetime(2016,9,7,20,0,0)) \
    .save()

GlobalNotification()\
    .set_en("Two more volumes of Teshuvot from <a href='http://www.eretzhemdah.org/'>Eretz Hemdah</a> - B'Mareh HaBazak <a href=\"B'Mareh_HaBazak_Part_Six\">Six</a> and <a href=\"B'Mareh_HaBazak_Part_Eight\">Eight</a>")\
    .set_he(u"שני כרכים נוספים של שו״ת <a href='http://www.eretzhemdah.org/'>ארץ חמדה</a>- במראה הבזק חלקים <a href=\"B'Mareh_HaBazak_Part_Six\">ו׳</a> ו-<a href=\"B'Mareh_HaBazak_Part_Eight\">ח׳</a>")\
    .set_date(datetime(2016, 9, 17, 8, 20, 0)) \
    .save()

GlobalNotification()\
    .set_en("Every comment of the <a href='/Mishnah_Berurah'>Mishnah Berurah</a> is now linked to the <a href='/Shulchan_Arukh,_Orach_Chayim'>Shulchan Aruch</a>")\
    .set_he(u"כל הערות <a href='/Mishnah_Berurah'>המשנה ברורה</a> מקושרות ל<a href='/Shulchan_Arukh,_Orach_Chayim'>שלחן הערוך</a>")\
    .set_date(datetime(2016,9,21,12,0,0))\
    .save()

GlobalNotification()\
    .make_index(library.get_index("Tafsir Rasag"))\
    .set_date(datetime(2016,9,25,10,30,0))\
    .set_en("R. Saadia Gaon's translation of the Torah into Judeo-Arabic")\
    .set_he(u"תרגומו של רס״ג לתורה לערבית יהודית")\
    .save()

GlobalNotification()\
    .make_version(Version().load({"title":"Kol Dodi Dofek", "language":"en"})) \
    .set_en("An English translation of R. Joseph B. Soloveitchik's classic essay on the return to Zion") \
    .set_he(u"תרגום אנגלי לחיבורו הקלאסי של רב יוסף סולוויצ׳יק על השיבה לציון") \
    .set_date(datetime(2016,9,27,20,0,0)) \
    .save()

GlobalNotification()\
    .make_index(library.get_index("Minchat Chinuch"))\
    .set_date(datetime(2016,9,28,20,0,0))\
    .save()

GlobalNotification()\
    .make_index(library.get_index("Shev_Shmat'ta")) \
    .set_date(datetime(2016, 10, 9, 16, 0, 0)) \
    .set_en("Shev Shmat'ta: composed of seven intricate halachic discussions, this work is widely popular in Yeshivah curricula") \
    .set_he(u"שב שמעעתא, חיבור העוסק בשבע סוגיות תלמודיות סבוכות. נחשב כפופלרי בעולם הישיבות.") \
    .save()

#Index: Mei HaShiloah
#General: Ein Mishpat on ??
