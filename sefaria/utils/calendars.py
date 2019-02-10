# -*- coding: utf-8 -*-
"""
calendar.py - functions for looking up information relating texts to dates.

Uses MongoDB collections: dafyomi, parshiot
"""
import sefaria.model as model
from sefaria.system.database import db
import p929
from sefaria.utils.util import graceful_exception
from sefaria.utils.hebrew import encode_hebrew_numeral, hebrew_parasha_name
import datetime
from django.utils import timezone


import logging
logger = logging.getLogger(__name__)


"""
Calendar items:
calendar title
hebrew calendar title
display value
hebrew display value
ref
"""

@graceful_exception(logger=logger, return_value=[])
def daily_929(datetime_obj):
    #datetime should just be a date, like datetime.today()
    p = p929.Perek(datetime_obj.date())
    rf = model.Ref("{} {}".format(p.book_name, p.book_chapter))
    display_en = "{} ({})".format(rf.normal(), p.number)
    display_he = u"{} ({})".format(rf.he_normal(), p.number)
    return [{
        'title' : {'en':'929', 'he': u'929'},
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
    daf_str = [daf["daf"]] if isinstance(daf["daf"], basestring) else daf["daf"]
    daf_yomi = []
    for d in daf_str:
        rf = model.Ref(d)
        if rf.index.get_primary_category() == "Talmud":
            displayVal = rf.normal()[:-1] #remove the a
            heDisplayVal = rf.he_normal()[:-2] #remove the alef and the space before it
        else:
            displayVal = rf.normal()
            heDisplayVal = rf.he_normal()
        daf_yomi.append({
            'title': {'en': 'Daf Yomi', 'he': u'דף יומי'},
            'displayValue': {'en': displayVal, 'he': heDisplayVal},
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
        'title': {'en': 'Daily Mishnah', 'he': u'משנה יומית'},
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
    display_value_he = rf.he_normal().replace(u"משנה תורה, ", u"")
    return [{
        'title': {'en': 'Daily Rambam', 'he': u'הרמב"ם היומי'},
        'displayValue': {'en': display_value_en, 'he': display_value_he},
        'url': rf.url(),
        'ref': rf.normal(),
        'order': 6,
        'category': rf.index.get_primary_category()
    }]


@graceful_exception(logger=logger, return_value=[])
def daily_rambam_three(datetime_obj):
    rambam_items = []
    datetime_obj = datetime.datetime(datetime_obj.year, datetime_obj.month, datetime_obj.day)
    database_obj = db.daily_rambam_three.find_one({"date": {"$eq": datetime_obj}})
    for rf in database_obj["refs"]:
        rf = model.Ref(rf)
        display_en = rf.normal().replace("Mishneh Torah, ", "")
        display_he = rf.he_normal().replace(u"משנה תורה, ", u"")
        rambam_items.append({
            "title": {"en": "Daily Rambam (3)", "he": u'הרבמ"ם היומי {}'.format(u"(3)")},
            "displayValue": {"en": display_en, "he": display_he},
            "url": rf.url(),
            "ref": rf.normal(),
            "order": 7,
            "category": rf.index.get_primary_category()
        })
    return rambam_items


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
    daf_str = [daf["daf"]] if isinstance(daf["daf"], basestring) else daf["daf"]
    daf_weekly_list = []

    for d in daf_str:
        rf = model.Ref(d)
        display_val = rf.normal()
        he_display_val = rf.he_normal()
        if rf.index.get_primary_category() == "Talmud":
            display_val = display_val[:-1]  # remove the a
            he_display_val = he_display_val[:-2]  # remove the alef and the space before it

        daf_weekly_list.append({
            "title": {"en": "Daf a Week", "he": u"דף השבוע"},
            "displayValue": {"en": display_val, "he": he_display_val},
            "url": rf.url(),
            "ref": rf.normal(),
            "order": 8,
            "category": rf.index.get_primary_category()
        })
    return daf_weekly_list


@graceful_exception(logger=logger, return_value=[])
def halakhah_yomit(datetime_obj):
    datetime_obj = datetime.datetime(datetime_obj.year, datetime_obj.month, datetime_obj.day)
    db_obj = db.halkhah_yomit.find_one({"date": {"$eq": datetime_obj}})
    rf = model.Ref(db_obj["ref"])
    display_en = rf.normal().replace("Shulchan Arkuh, ", "")
    display_he = rf.he_normal()
    halakha = {
        "title": {"en": "Halakhah Yomit", "he": u"הלכה יומית"},
        "displayValue": {"en": display_en, "he": display_he},
        "url": rf.url(),
        "ref": rf.normal(),
        "order": 9,
        "category": rf.index.get_primary_category()
    }
    return [halakha]


def make_haftarah_by_custom_response_from_calendar_entry(db_haftara, custom, add_custom_to_display):
    shorthands = {
        "ashkenazi" : {"en": 'A', "he": u'א'},
        "sephardi": {"en": 'S', "he": u'ס'},
        "edot hamizrach": {"en": 'EM', "he": u'עמ'}
    }
    haftarah_objs = []
    for h in db_haftara:
        rf = model.Ref(h)
        haftara = {
            'title': {'en': 'Haftarah', 'he': u'הפטרה'},
            'displayValue': {'en': rf.normal(), 'he': rf.he_normal()},
            'url': rf.url(),
            'ref': rf.normal(),
            'order': 2,
            'category': rf.index.get_primary_category(),
        }
        if add_custom_to_display:
            for lang in haftara['title']:
                haftara['title'][lang] = u'{} ({})'.format(haftara['title'][lang], shorthands[custom][lang])
        haftarah_objs.append(haftara)
    return haftarah_objs


def make_haftarah_response_from_calendar_entry(db_parasha, custom=None):
    haftarah_objs = []
    if isinstance(db_parasha["haftara"], list): #backwards compatability
        haftarah_objs += make_haftarah_by_custom_response_from_calendar_entry(db_parasha["haftara"], "ashkenazi", False)
    elif len(db_parasha["haftara"].keys()) == 1 or not len(db_parasha["haftara"].get(custom, [])):
        haftarah_objs += make_haftarah_by_custom_response_from_calendar_entry(db_parasha["haftara"].get("ashkenazi"), "ashkenazi", False)
    elif custom:
        haftarah_objs += make_haftarah_by_custom_response_from_calendar_entry(db_parasha["haftara"].get(custom, []), custom, True)
    else:
        for key in db_parasha["haftara"]:
            haftarah_objs += make_haftarah_by_custom_response_from_calendar_entry(db_parasha["haftara"].get(key), key, True)
    return haftarah_objs


def make_parashah_response_from_calendar_entry(db_parasha):
    rf = model.Ref(db_parasha["ref"])
    parasha = {
        'title': {'en': 'Parashat Hashavua', 'he': u'פרשת השבוע'},
        'displayValue': {'en': db_parasha["parasha"], 'he': hebrew_parasha_name(db_parasha["parasha"])},
        'url': rf.url(),
        'ref': rf.normal(),
        'order': 1,
        'category': rf.index.get_primary_category()
    }
    return [parasha]


def this_weeks_parasha(datetime_obj, diaspora=True):
    """
    Returns the upcoming Parasha for datetime.
    """
    p = db.parshiot.find({"date": {"$gt": datetime_obj}, "diaspora": {'$in': [diaspora, None]}}, limit=1).sort([("date", 1)])
    p = p.next()

    return p

@graceful_exception(logger=logger, return_value=[])
def parashat_hashavua_and_haftara(datetime_obj, diaspora=True, custom=None):
    parasha_items = []
    db_parasha = this_weeks_parasha(datetime_obj, diaspora=diaspora)

    parasha_items += make_parashah_response_from_calendar_entry(db_parasha)
    parasha_items += make_haftarah_response_from_calendar_entry(db_parasha, custom)
    return parasha_items


def get_all_calendar_items(datetime_obj, diaspora=True, custom="sephardi"):
    cal_items  = []
    cal_items += parashat_hashavua_and_haftara(datetime_obj, diaspora=diaspora, custom=custom)
    cal_items += daf_yomi(datetime_obj)
    cal_items += daily_929(datetime_obj)
    cal_items += daily_mishnayot(datetime_obj)
    cal_items += daily_rambam(datetime_obj)
    cal_items += daily_rambam_three(datetime_obj)
    cal_items += daf_weekly(datetime_obj)
    cal_items += halakhah_yomit(datetime_obj)
    cal_items = [item for item in cal_items if item]
    return cal_items


def get_todays_calendar_items(diaspora=True, custom=None):
    return get_all_calendar_items(timezone.localtime(timezone.now()), diaspora=diaspora, custom=custom)

def get_keyed_calendar_items(diaspora=True, custom=None):
    cal_items = get_todays_calendar_items(diaspora=diaspora, custom=custom)
    cal_dict = {}
    for cal_item in cal_items:
        cal_dict[cal_item["title"]["en"]] = cal_item
    return cal_dict