# -*- coding: utf-8 -*-

from sefaria.model import *
from datetime import datetime

NotificationSet().update({"is_global": False})

GlobalNotification()\
    .make_version(Version().load({'title': 'Kedushat Levi', 'versionTitle': 'Kedushat Levi translated by Rb. Eliyahu Munk'})) \
    .set_date(datetime(2016,9,7,20,0,0)) \
    .save()

GlobalNotification()\
    .set_en("Two more volumes of Teshuvot from <a href='http://www.eretzhemdah.org/'>Eretz Hemdah</a> - B'Mareh HaBazak <a href=\"B'Mareh_HaBazak_Part_Six\">Six</a> and <a href=\"B'Mareh_HaBazak_Part_Eight\">Eight</a>.")\
    .set_he("שני כרכים נוספים של שו״ת <a href='http://www.eretzhemdah.org/'>ארץ חמדה</a>- במראה הבזק חלקים <a href=\"B'Mareh_HaBazak_Part_Six\">ו׳</a> ו-<a href=\"B'Mareh_HaBazak_Part_Eight\">ח׳</a>")\
    .set_date(datetime(2016, 9, 17, 8, 20, 0)) \
    .save()

GlobalNotification()\
    .set_en("Every comment of the <a href='/Mishnah_Berurah'>Mishnah Berurah</a> is now linked to the <a href='/Shulchan_Arukh,_Orach_Chayim'>Shulchan Aruch</a>.")\
    .set_he("כל הערות <a href='/Mishnah_Berurah'>המשנה ברורה</a> מקושרות ל<a href='/Shulchan_Arukh,_Orach_Chayim'>שלחן הערוך</a>")\
    .set_date(datetime(2016,9,21,12,0,0))\
    .save()

GlobalNotification()\
    .make_index(library.get_index("Tafsir Rasag"))\
    .set_date(datetime(2016,9,25,10,30,0))\
    .set_en("R. Saadia Gaon's translation of the Torah into Judeo-Arabic")\
    .set_he("תרגומו של רס״ג לתורה לערבית יהודית")\
    .save()

GlobalNotification()\
    .make_version(Version().load({"title":"Kol Dodi Dofek", "language":"en"})) \
    .set_en("An English translation of R. Joseph B. Soloveitchik's classic essay on the return to Zion") \
    .set_he("תרגום אנגלי לחיבורו הקלאסי של רב יוסף סולוויצ׳יק על השיבה לציון") \
    .set_date(datetime(2016,9,27,20,0,0)) \
    .save()

GlobalNotification()\
    .make_index(library.get_index("Minchat Chinuch"))\
    .set_date(datetime(2016,9,28,20,0,0))\
    .save()

GlobalNotification()\
    .make_index(library.get_index("Shev Shmat'ta")) \
    .set_date(datetime(2016, 10, 9, 16, 0, 0)) \
    .set_en("Shev Shmat'ta: composed of seven intricate halachic discussions, this work is widely popular in Yeshivah curricula.") \
    .set_he("שב שמעעתא, חיבור העוסק בשבע סוגיות תלמודיות סבוכות. נחשב כפופלרי בעולם הישיבות.") \
    .save()

GlobalNotification()\
    .make_index(library.get_index("Psalms")) \
    .set_date(datetime(2016, 10, 30, 14, 30, 0)) \
    .set_en("At the request of our users, we've added the 30 day cycle of readings to our edition of Psalms.") \
    .set_he("לבקשת הגולשים, הוספנו את הקריאות היומיות (30 יום) לגירסת התהילים שלנו.") \
    .save()

GlobalNotification()\
    .make_index(library.get_index("Iggeret haGra")) \
    .set_date(datetime(2016, 10, 30, 15, 00, 0)) \
    .set_en("Sent by the Vilna Gaon while traveling to Eretz Yisrael, this letter instructed his family in the ways of Mussar.") \
    .set_he('אגרת מוסר מפורסמת שכתב הגר"א לבני ביתו טרם נסיעתו לארץ ישראל') \
    .save()


#Index: Mei HaShiloah
#General: Ein Mishpat on ??
