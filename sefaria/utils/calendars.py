# -*- coding: utf-8 -*-
"""
ar.py - functions for looking up information relating texts to dates.

Uses MongoDB collections: dafyomi, parshiot
"""
import datetime
import p929
import re
import urllib
from django.utils import timezone

import sefaria.model as model
from sefaria.system.database import db
from sefaria.utils.util import graceful_exception
from sefaria.utils.hebrew import hebrew_parasha_name
from sefaria.site.site_settings import SITE_SETTINGS
from sefaria.model.schema import Term

import structlog
logger = structlog.get_logger(__name__)


"""
Calendar items:
calendar title
hebrew calendar title
display value
hebrew display value
ref
"""

@graceful_exception(logger=logger, logLevel="warning", return_value=[])
def daily_929(datetime_obj):
    #datetime should just be a date, like datetime.today()
    p = p929.Perek(datetime_obj.date())
    rf = model.Ref("{} {}".format(p.book_name, p.book_chapter))
    display_en = "{} ({})".format(rf.normal(), p.number)
    display_he = "{} ({})".format(rf.he_normal(), p.number)
    return [{
        'title' : {'en':'929', 'he': '929'},
        'displayValue': {'en':display_en, 'he': display_he},
        'url': rf.url(),
        'ref': rf.normal(),
        'order': 4,
        'category': rf.index.get_primary_category()
    }]


@graceful_exception(logger=logger, return_value=[])
def daf_yomi(datetime_obj):
    """
    Returns the daf yomi for date
    """
    date_str = datetime_obj.strftime(" %m/ %d/%Y").replace(" 0", "").replace(" ", "")
    daf = db.dafyomi.find_one({"date": date_str})
    daf_en, daf_he = None, None
    if 'displayValue' in daf:
        daf_en, daf_he = daf['displayValue'].get('en', None), daf['displayValue'].get('he', None)
    daf_str = [daf["daf"]] if isinstance(daf["daf"], str) else daf["daf"]
    daf_yomi = []
    for d in daf_str:
        rf = model.Ref(d)

        daf_yomi.append({
            'title': {'en': 'Daf Yomi', 'he': 'דף יומי'},
            'displayValue': {'en': daf_en if daf_en else rf.normal(), 'he': daf_he if daf_he else rf.he_normal()},
            'url': rf.url(),
            'ref': rf.normal(),
            'order': 3,
            'category': rf.index.get_primary_category()
        })
    return daf_yomi


@graceful_exception(logger=logger, return_value=[])
def daily_mishnayot(datetime_obj):
    mishnah_items = []
    datetime_obj = datetime.datetime(datetime_obj.year,datetime_obj.month,datetime_obj.day)
    daily_mishnahs = db.daily_mishnayot.find({"date": {"$eq": datetime_obj}}).sort([("date", 1)])
    for dm in daily_mishnahs:
        rf = model.Ref(dm["ref"])
        mishnah_items.append({
        'title': {'en': 'Daily Mishnah', 'he': 'משנה יומית'},
        'displayValue': {'en': rf.normal(), 'he': rf.he_normal()},
        'url': rf.url(),
        'ref': rf.normal(),
        'order': 5,
        'category': rf.index.get_primary_category()
    })
    return mishnah_items


@graceful_exception(logger=logger, return_value=[])
def daily_rambam(datetime_obj):
    datetime_obj = datetime.datetime(datetime_obj.year,datetime_obj.month,datetime_obj.day)
    daily_rambam = db.daily_rambam.find_one({"date": {"$eq": datetime_obj}})
    rf = model.Ref(daily_rambam["ref"])
    display_value_en = rf.normal().replace("Mishneh Torah, ","")
    display_value_he = rf.he_normal().replace("משנה תורה, ", "")
    return [{
        'title': {'en': 'Daily Rambam', 'he': 'הרמב"ם היומי'},
        'displayValue': {'en': display_value_en, 'he': display_value_he},
        'url': rf.url(),
        'ref': rf.normal(),
        'order': 6,
        'category': rf.index.get_primary_category()
    }]

@graceful_exception(logger=logger, return_value=[])
def arukh_hashulchan(datetime_obj):
    items = []
    datetime_obj = datetime.datetime(datetime_obj.year, datetime_obj.month, datetime_obj.day)
    database_obj = db.arukh_hashulchan.find_one({"date": {"$eq": datetime_obj}})
    if not database_obj:
        return []
    rf = database_obj["refs"]
    rf = model.Ref(rf)
    display_en = rf.normal()
    display_he = rf.he_normal()
    items.append({
        "title": {"en": "Arukh HaShulchan Yomi", "he": 'ערוך השולחן היומי'},
        "displayValue": {"en": display_en.replace("Arukh HaShulchan, ", ""), "he": display_he.replace("ערוך השולחן, ", "")},
        "url": rf.url(),
        "ref": rf.normal(),
        "order": 10,
        "category": rf.index.get_primary_category()
    })
    return items

@graceful_exception(logger=logger, return_value=[])
def daily_rambam_three(datetime_obj):
    rambam_items = []
    datetime_obj = datetime.datetime(datetime_obj.year, datetime_obj.month, datetime_obj.day)
    database_obj = db.daily_rambam_three.find_one({"date": {"$eq": datetime_obj}})
    if not database_obj:
        return []
    for rf in database_obj["refs"]:
        rf = model.Ref(rf)
        display_en = rf.normal().replace("Mishneh Torah, ", "")
        display_he = rf.he_normal().replace("משנה תורה, ", "")
        rambam_items.append({
            "title": {"en": "Daily Rambam (3 Chapters)", "he": 'הרמב"ם היומי {}'.format("(3 פרקים)")},
            "displayValue": {"en": display_en, "he": display_he},
            "url": rf.url(),
            "ref": rf.normal(),
            "order": 7,
            "category": rf.index.get_primary_category()
        })
    return rambam_items


@graceful_exception(logger=logger, return_value=[])
def tanakh_yomi(datetime_obj):
    tanakh_items = []
    datetime_obj = datetime.datetime(datetime_obj.year, datetime_obj.month, datetime_obj.day)
    database_obj = db.tanakh_yomi.find_one({"date": {"$eq": datetime_obj}})
    if not database_obj:
        return []
    rf = database_obj["ref"]
    rf = model.Ref(rf)
    display_en = database_obj["displayValue"]
    display_he = database_obj["heDisplayValue"]
    tanakh_items.append({
        "title": {"en": "Tanakh Yomi", "he": 'תנ"ך יומי'},
        "displayValue": {"en": display_en, "he": display_he},
        "url": rf.url(),
        "ref": rf.normal(),
        "order": 11,
        "category": rf.index.get_primary_category()
    })
    return tanakh_items


@graceful_exception(logger=logger, return_value=[])
def tikkunei_yomi(datetime_obj):
    tikkunei_items = []
    datetime_obj = datetime.datetime(datetime_obj.year, datetime_obj.month, datetime_obj.day)
    database_obj = db.daily_tikkunei_zohar.find_one({"date": {"$eq": datetime_obj}})
    if not database_obj:
        return []
    rf = database_obj["ref"]
    rf = model.Ref(rf)
    display_en = database_obj["displayValue"]
    display_he = database_obj["heDisplayValue"]
    tikkunei_items.append({
        "title": {"en": "Zohar for Elul", "he": 'תיקוני זוהר לחודש אלול'},
        "displayValue": {"en": display_en, "he": display_he},
        "url": rf.url(),
        "ref": rf.normal(),
        "order": 13,
        "category": rf.index.get_primary_category()
    })
    return tikkunei_items

@graceful_exception(logger=logger, return_value=[])
def daf_weekly(datetime_obj):
    """
    :param datetime.datetime datetime_obj:
    :return:
    """
    """
    Weekday values in datetime start on Monday, i.e.
    Monday = 0, Tuesday = 1, Wednesday = 2,... Sunday = 6 
    We want to start on Sunday (a new daf is started every Sunday):
    Sunday = 0, Monday = 1, Tuesday = 2,...
    """
    cur_weekday = (datetime_obj.weekday() + 1) % 7
    sunday_obj = datetime_obj - datetime.timedelta(cur_weekday)
    sunday_obj = datetime.datetime(sunday_obj.year, sunday_obj.month, sunday_obj.day)

    daf = db.daf_weekly.find_one({"date": {"$eq": sunday_obj}})
    daf_str = [daf["daf"]] if isinstance(daf["daf"], str) else daf["daf"]
    daf_weekly_list = []

    for d in daf_str:
        rf = model.Ref(d)
        daf_weekly_list.append({
            "title": {"en": "Daf a Week", "he": "דף השבוע"},
            "displayValue": {"en": rf.normal(), "he": rf.he_normal()},
            "url": rf.url(),
            "ref": rf.normal(),
            "order": 8,
            "category": rf.index.get_primary_category()
        })
    return daf_weekly_list


@graceful_exception(logger=logger, return_value=[])
def halakhah_yomit(datetime_obj):
    datetime_obj = datetime.datetime(datetime_obj.year, datetime_obj.month, datetime_obj.day)
    db_obj = db.halakhah_yomit.find_one({"date": {"$eq": datetime_obj}})
    rf = model.Ref(db_obj["ref"])
    display_en = rf.normal().replace("Shulchan Arkuh, ", "")
    display_he = rf.he_normal()
    halakha = {
        "title": {"en": "Halakhah Yomit", "he": "הלכה יומית"},
        "displayValue": {"en": display_en, "he": display_he},
        "url": rf.url(),
        "ref": rf.normal(),
        "order": 9,
        "category": rf.index.get_primary_category()
    }
    return [halakha]


def make_haftarah_by_custom_response_from_calendar_entry(db_haftara, custom, add_custom_to_display):
    shorthands = {
        "ashkenazi" : {"en": 'A', "he": 'א'},
        "sephardi": {"en": 'S', "he": 'ס'},
        "edot hamizrach": {"en": 'EM', "he": 'עמ'}
    }
    haftarah_objs = []
    for h in db_haftara:
        rf = model.Ref(h)
        haftara = {
            'title': {'en': 'Haftarah', 'he': 'הפטרה'},
            'displayValue': {'en': rf.normal(), 'he': rf.he_normal()},
            'url': rf.url(),
            'ref': rf.normal(),
            'order': 2,
            'category': rf.index.get_primary_category(),
        }
        if add_custom_to_display:
            for lang in haftara['title']:
                haftara['title'][lang] = '{} ({})'.format(haftara['title'][lang], shorthands[custom][lang])
        haftarah_objs.append(haftara)
    return haftarah_objs


def make_haftarah_response_from_calendar_entry(db_parasha, custom=None):
    haftarah_objs = []
    if isinstance(db_parasha["haftara"], list): #backwards compatability
        haftarah_objs += make_haftarah_by_custom_response_from_calendar_entry(db_parasha["haftara"], "ashkenazi", False)
    elif len(list(db_parasha["haftara"].keys())) == 1 or not len(db_parasha["haftara"].get(custom, [])):
        haftarah_objs += make_haftarah_by_custom_response_from_calendar_entry(db_parasha["haftara"].get("ashkenazi"), "ashkenazi", False)
    elif custom:
        haftarah_objs += make_haftarah_by_custom_response_from_calendar_entry(db_parasha["haftara"].get(custom, []), custom, True)
    else:
        for key in db_parasha["haftara"]:
            haftarah_objs += make_haftarah_by_custom_response_from_calendar_entry(db_parasha["haftara"].get(key), key, True)
    return haftarah_objs


def make_parashah_response_from_calendar_entry(db_parasha):
    rf = model.Ref(db_parasha["ref"])

    parashiot = db_parasha["parasha"].split("-") # Could be a double parashah
    p_en, p_he = [], []
    for p in parashiot:
        parasha_topic = model.Topic().load({"parasha": p})
        if parasha_topic:
            p_en.append(parasha_topic.description["en"])
            p_he.append(parasha_topic.description["he"])
    parasha_description = {"en": "\n\n".join(p_en), "he": "\n\n".join(p_he)}

    parasha = {
        'title': {'en': 'Parashat Hashavua', 'he': 'פרשת השבוע'},
        'displayValue': {'en': db_parasha["parasha"], 'he': hebrew_parasha_name(db_parasha["parasha"])},
        'url': rf.url(),
        'ref': rf.normal(),
        'heRef': rf.he_normal(),
        'order': 1,
        'category': rf.index.get_primary_category(),
        'extraDetails': {'aliyot': db_parasha["aliyot"]},
        'description': parasha_description
    }
    return [parasha]


def aliyah_ref(parasha_db, aliyah):
    assert 1 <= aliyah <= 7
    return model.Ref(parasha_db["aliyot"][aliyah - 1])


def get_parasha(datetime_obj, diaspora=True, parasha=None):
    """
    Returns the upcoming Parasha for datetime.
    """
    datetime_obj = datetime.datetime(datetime_obj.year, datetime_obj.month, datetime_obj.day)
    query = {"date": {"$gte": datetime_obj}, "diaspora": {'$in': [diaspora, None]}}
    if parasha is not None:
        # regex search for potential double parasha. there can be dash before or after name
        query["parasha"] = re.compile('(?:(?<=^)|(?<=-)){}(?=-|$)'.format(parasha))

    p = db.parshiot.find(query).sort([("date", 1)]).limit(1)

    try:
        p = next(p)
    except StopIteration:
        p = None  # or handle the empty case appropriately

    return p


def get_todays_parasha(diaspora=True):
    return get_parasha(timezone.localtime(timezone.now()), diaspora=diaspora)


@graceful_exception(logger=logger, return_value=[])
def parashat_hashavua_and_haftara(datetime_obj, diaspora=True, custom=None, parasha=None, ret_type='list'):
    db_parasha = get_parasha(datetime_obj, diaspora=diaspora, parasha=parasha)
    parasha_item = make_parashah_response_from_calendar_entry(db_parasha)
    haftarah_item = make_haftarah_response_from_calendar_entry(db_parasha, custom)
    if ret_type not in {'list', 'dict'}:
        raise Exception('ret_type parameter must be either "list" or "dict')
    if ret_type == 'list':
        parasha_items = parasha_item + haftarah_item
    elif ret_type == 'dict':
        from sefaria.utils.util import get_hebrew_date
        he_date_in_english, he_date_in_hebrew = get_hebrew_date(db_parasha.get('date', None))
        parasha_items = {
            'parasha': parasha_item[0],
            'haftarah': haftarah_item,
            'date': db_parasha.get('date', None),
            'he_date': {
                "en": he_date_in_english,
                "he": he_date_in_hebrew
            }
        }
    return parasha_items


@graceful_exception(logger=logger, return_value=[])
def hok_leyisrael(datetime_obj, diaspora=True):

    def get_hok_parasha(datetime_obj, diaspora=diaspora):
        parasha = get_parasha(datetime_obj, diaspora=diaspora)['parasha']
        parasha = parasha.replace('Lech-Lecha', 'Lech Lecha')
        parasha = parasha.split('-')[0]
        if parasha == 'Shmini Atzeret':
            parasha = "V'Zot HaBerachah"
        parasha_term = Term().load({'category': 'Torah Portions', 'titles': {'$elemMatch': {'text': parasha}}})
        if not parasha_term:
            parasha_term = get_hok_parasha(datetime_obj + datetime.timedelta(7), diaspora=diaspora)
        return parasha_term

    parasha_term = get_hok_parasha(datetime_obj, diaspora=diaspora)
    parasha_he = parasha_term.get_primary_title('he')
    return [{
        "title": {"en": "Chok LeYisrael", "he": 'חק לישראל'},
        "displayValue": {"en": parasha_term.name, "he": parasha_he},
        "url": f'collections/חק-לישראל?tag={urllib.parse.quote(parasha_term.name)}',
        "order": 12,
        "category": 'Tanakh'
    }]


@graceful_exception(logger=logger, return_value=[])
def tanya_yomi(datetime_obj):
    tanya_items = []
    datetime_obj = datetime.datetime(datetime_obj.year, datetime_obj.month, datetime_obj.day)
    database_obj = db.tanya_yomi.find_one({"date": {"$eq": datetime_obj}})
    if not database_obj:
        return []
    rf = database_obj["ref"]
    rf = model.Ref(rf)
    display_en = database_obj["displayValue"]
    display_he = database_obj["heDisplayValue"]
    tanya_items.append({
        "title": {"en": "Tanya Yomi", "he": 'תניא יומי'},
        "displayValue": {"en": display_en, "he": display_he},
        "url": rf.url(),
        "ref": rf.normal(),
        "order": 15,
        "category": rf.index.get_primary_category()
    })
    return tanya_items


@graceful_exception(logger=logger, return_value=[])
def yerushalmi_yomi(datetime_obj):
    yerushalmi_items = []
    datetime_obj = datetime.datetime(datetime_obj.year, datetime_obj.month, datetime_obj.day)
    database_obj = db.yerushalmi_yomi.find_one({"date": {"$eq": datetime_obj}})
    if not database_obj:
        return []
    rf = database_obj["ref"]
    rf = model.Ref(rf)
    display_en = database_obj["displayValue"]
    display_he = database_obj["heDisplayValue"]
    yerushalmi_items.append({
        "title": {"en": "Yerushalmi Yomi", "he": 'ירושלמי יומי'},
        "displayValue": {"en": display_en, "he": display_he},
        "url": rf.url(),
        "ref": rf.normal(),
        "order": 16,
        "category": rf.index.get_primary_category()
    })
    return yerushalmi_items


def get_all_calendar_items(datetime_obj, diaspora=True, custom="sephardi"):
    if not SITE_SETTINGS["TORAH_SPECIFIC"]:
        return []
    cal_items  = []
    cal_items += parashat_hashavua_and_haftara(datetime_obj, diaspora=diaspora, custom=custom)
    cal_items += daf_yomi(datetime_obj)
    cal_items += daily_929(datetime_obj)
    cal_items += daily_mishnayot(datetime_obj)
    cal_items += daily_rambam(datetime_obj)
    cal_items += daily_rambam_three(datetime_obj)
    cal_items += daf_weekly(datetime_obj)
    cal_items += halakhah_yomit(datetime_obj)
    cal_items += arukh_hashulchan(datetime_obj)
    cal_items += tanakh_yomi(datetime_obj)
    cal_items += tikkunei_yomi(datetime_obj)
    cal_items += hok_leyisrael(datetime_obj, diaspora=diaspora)
    cal_items += tanya_yomi(datetime_obj)
    cal_items += yerushalmi_yomi(datetime_obj)
    cal_items = [item for item in cal_items if item]
    return cal_items


def get_keyed_calendar_items(diaspora=True, custom=None):
    cal_items = get_todays_calendar_items(diaspora=diaspora, custom=custom)
    cal_dict = {}
    for cal_item in cal_items:
        cal_dict[cal_item["title"]["en"]] = cal_item
    return cal_dict


def get_todays_calendar_items(diaspora=True, custom=None):
    return get_all_calendar_items(timezone.localtime(timezone.now()), diaspora=diaspora, custom=custom)



def verify_parashah_topics_exist():
    """Checks that topics exist corresponding to every entry in the parshiot collection"""
    missing = False
    parshiot = db.parshiot.distinct("parasha")
    for parashah in parshiot:
        if not model.Topic().load({"parasha": parashah}):
            missing = True
            print("Missing parashah topic for: {}".format(parashah))

    if not missing:
        print("All parashahs in the parshiot collection have corresponding topics.")