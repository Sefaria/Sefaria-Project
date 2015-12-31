# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.model.nli import ManuscriptReferenceSet

def manuscript_data(oref, unique_images=True):
    base_app_url = "http://web.nli.org.il/sites/NLI/Hebrew/collections/jewish-collection/Talmud/Pages/default.aspx?"
    base_img_url = "http://dlib.nli.org.il/webclient/DeliveryManager?&custom_att_2=ext&metadata_request=false&pid="
    corpora = {
        (u"Mishnah",): {
            "_prefix": "Mishnah ",
            "_mapping": "direct",
            "Fr_Co": "2"
        },
        (u"Tosefta",): {
            "_prefix": "Tosefta ",
            "_mapping": "direct",
            "Fr_Co": "3"
        },
        (u"Talmud", u"Bavli"): {
            "_prefix": "",
            "_mapping": "amud",
            "Fr_Co": "4"
        }
        # They havce Talmud by pages A-D.  We can't match that yet.
        #["Talmud", "Yerushalmi"]: {
        #    "_prefix": "Jerusalem Talmud ",
        #    "Fr_Co": 5
        #}
    }
    mesechet_map = {
        "Berakhot":	"01",
        "Peah":"02",
        "Demai":"03",
        "Kilayim":"04",
        "Kilaim":"04",
        "Sheviit":"05",
        "Shevi'it":"05",
        "Terumot":"06",
        "Maasrot":"07",
        "Ma'asrot":"07",
        "Maaser Sheni":"08",
        "Ma'aser Sheni":"08",
        "Challah":"09",
        "Orlah":"10",
        "Bikkurim":"11",
        "Shabbat":"12",
        "Eruvin":"13",
        "Eiruvin":"13",
        "Pesachim":"14",
        "Shekalim":"15",
        "Yoma":"16",
        "Sukkah":"17",
        "Beitzah":"18",
        "Beitsah":"18",
        "Rosh Hashanah":"19",
        "Rosh HaShanah":"19",
        "Taanit":"20",
        "Ta'anit":"20",
        "Megillah":"21",
        "Moed Katan":"22",
        "Moed Kattan":"22",
        "Chagigah":"23",
        "Yevamot":"24",
        "Ketubot":"25",
        "Nedarim":"26",
        "Nazir":"27",
        "Sotah":"28",
        "Gittin":"29",
        "Kiddushin":"30",
        "Bava Kamma":"31",
        "Bava Metzia":"32",
        "Bava Batra":"33",
        "Sanhedrin":"34",
        "Makkot":"35",
        "Shevuot":"36",
        "Eduyot":"37",
        "Avodah Zarah":"38",
        "Pirkei Avot":"39",
        "Horayot":"40",
        "Zevachim":"41",
        "Zevahim":"41",
        "Menachot":"42",
        "Menahot":"42",
        "Chullin":"43",
        "Bekhorot":"44",
        "Arakhin":"45",
        "Temurah":"46",
        "Keritot":"47",
        "Meilah":"48",
        "Tamid":"49",
        "Middot":"50",
        "Kinnim":"51",
        "Kelim":"52",
        "Oholot":"53",
        "Ohalot":"53",
        "Negaim":"54",
        "Parah":"55",
        "Tahorot":"56",
        "Tohorot":"56",
        "Mikvaot":"57",
        "Niddah":"58",
        "Makhshirin":"59",
        "Zavim":"60",
        "Tevul Yom":"61",
        "Yadayim":"62",
        "Oktzin":"63",
        "Uktsin": "63"
    }
    assert isinstance(oref, Ref)
    if oref.is_commentary():
        return None

    corpus = corpora.get(tuple(oref.index.categories[0:2])) or corpora.get(tuple([oref.index.categories[0]]))
    if not corpus:
        return None
    mesechet_name = oref.index.title.replace(corpus["_prefix"], "")
    mesechet_code = mesechet_map[mesechet_name]
    perek_number = None
    misnah_number = None
    if corpus["_mapping"] == "direct":
        if oref.is_segment_level():
            sref = oref
        else:
            sref = oref.padded_ref().subref(1)
        perek_number = sref.sections[0]
        misnah_number = sref.sections[1]

    elif corpus["_mapping"] == "amud":
        if oref.is_section_level():
            sref = oref
        else:
            sref = oref.padded_ref()
        daf_string = schema.AddressTalmud.toStr("en", sref.sections[0])
        perek_number = int(daf_string[:-1])
        misnah_number = 1 if daf_string[-1:] == "a" else 2

    # The DB inroduces an offset.  They use it to cover 11(i) and 11(ii) in some cases.   Ignoring that particular issue, since we don't have 11i/ii
    if perek_number > 11:
        perek_number += 2
    pe_code = str(perek_number).zfill(3)

    if misnah_number:
        if misnah_number > 11:
            misnah_number += 2
        mi_code = str(misnah_number).zfill(2)

    query = {
        "fr_code": corpus["Fr_Co"], # Collection
        "tr_code": mesechet_code, # Tractate
        "pe_code": pe_code, # Chapter or Daf - 3 digit pad
    }
    if misnah_number:
        query["mi_code"] = mi_code  # Mishnah, Halacha, or Amud - 2 digit pad

    mrefs = ManuscriptReferenceSet(query)

    results = []
    covered = {}

    for m in mrefs:
        if m.img_pid in covered:
            continue
        covered[m.img_pid] = 1
        results.append({
            "name_en": m.ms_name_en,
            "name_he": m.ms_name_he,
            "img_pid": m.img_pid,
            "pe_code": int(m.pe_code),
            "mi_code": int(m.mi_code),
            "img_url": base_img_url + str(m.img_pid),
            "app_url": base_app_url + \
                "IsByManuscript=False" + \
                "&Fr_Co=" + m.fr_code + \
                "&Fr_Tr=" + m.tr_code + \
                "&Pe_code=" + m.pe_code + \
                "&Mi_code=" + m.mi_code + \
                "&Im_Ms=" + str(m.ms_code) + \
                "&Li_code=-1",
        })

    return results

