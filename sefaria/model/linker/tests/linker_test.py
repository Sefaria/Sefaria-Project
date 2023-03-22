from sefaria.model.linker.ref_part import RangedRawRefParts, SectionContext, span_inds
from sefaria.model.linker.referenceable_book_node import DiburHamatchilNodeSet, NumberedReferenceableBookNode
from sefaria.model.linker.ref_resolver import ResolvedRef, ResolutionThoroughness, RefResolver, IbidHistory
from .linker_test_utils import *
from sefaria.model import schema
from sefaria.settings import ENABLE_LINKER

if not ENABLE_LINKER:
    pytest.skip("Linker not enabled", allow_module_level=True)

ref_resolver = library.get_ref_resolver()


def test_referenceable_child():
    i = library.get_index("Rashi on Berakhot")
    assert i.nodes.depth == 3
    ref_node = NumberedReferenceableBookNode(i.nodes)
    child = ref_node.get_children(Ref("Rashi on Berakhot 2a"))[0]
    assert isinstance(child, DiburHamatchilNodeSet)


def test_resolved_raw_ref_clone():
    index = library.get_index("Berakhot")
    raw_ref, context_ref, lang, _ = create_raw_ref_data(["@בבלי", "@ברכות", "#דף ב"])
    rrr = ResolvedRef(raw_ref, [], index.nodes, Ref("Berakhot"))
    rrr_clone = rrr.clone(ref=Ref("Genesis"))
    assert rrr_clone.ref == Ref("Genesis")


crrd = create_raw_ref_data


@pytest.mark.parametrize(('resolver_data', 'expected_trefs'), [
    # Numbered JAs
    [crrd(["@בבלי", "@ברכות", "#דף ב"]), ("Berakhot 2",)],   # amud-less talmud
    [crrd(["@ברכות", "#דף ב"]), ("Berakhot 2",)],  # amud-less talmud
    [crrd(["@בבלי", "@שבת", "#דף ב."]), ("Shabbat 2a",)],  # amud-ful talmud
    [crrd(['@בבלי', '#דף ב עמוד א', '@במכות']), ("Makkot 2a",)],  # out of order with prefix on title
    [crrd(['@ספר בראשית', '#פרק יג', '#פסוק א']), ("Genesis 13:1",)],
    [crrd(['@ספר בראשית', '#פסוק א', '#פרק יג']), ("Genesis 13:1",)],  # sections out of order
    [crrd(['@שמות', '#א', '#ב']), ("Exodus 1:2",)],  # used to also match Exodus 2:1 b/c would allow mixing integer parts

    # Amud split into two parts
    [crrd(['@בבלי', '@יבמות', '#סא', '#א']), ("Yevamot 61a",)],
    [crrd(['@בבלי', '#דף ב', '#עמוד א', '@במכות']), ("Makkot 2a",)],
    [crrd(['@בבלי', '#עמוד א', '#דף ב', '@במכות']), ("Makkot 2a",)],  # out of order daf and amud
    [crrd(['@בבלי', '#דף ב', '#עמוד ג', '@במכות']), tuple()],
    [crrd(['@בבלי', '#דף ב', '#עמוד א', '^עד', '#עמוד ב', '@במכות']), ("Makkot 2",)],
    [crrd(['@בבלי', '#דף ב', '#עמוד א', '^עד', '#דף ג', '#עמוד ב', '@במכות']), ("Makkot 2a-3b",)],
    [crrd(['@שבת', '#א', '#ב']), ["Mishnah Shabbat 1:2"]],  # shouldn't match Shabbat 2a by reversing order of parts
    [crrd(['@שבת', '#ב', '#א']), ["Shabbat 2a", "Mishnah Shabbat 2:1"]],  # ambiguous case

    # Aliases for perakim
    [crrd(["@משנה", "@ברכות", "#פרק קמא"]), ("Mishnah Berakhot 1",)],
    [crrd(["@משנה", "@ברכות", "#פרק בתרא"]), ("Mishnah Berakhot 9",)],
    [crrd(['#ר"פ בתרא', '@דמשנה ברכות']), ("Mishnah Berakhot 9",)],
    [crrd(['#רפ"ג', '@דכלאים']), ['Kilayim 3']],
    [crrd(['#ספ"ג', '@דכלאים']), ['Kilayim 3']],

    # Named alt structs
    [crrd(["@פרק אלו דברים", "@בפסחים"]), ("Pesachim 65b:10-73b:16",)],  # talmud perek (that's ambiguous)
    [crrd(["@פרק אלו דברים"]), ("Pesachim 65b:10-73b:16", "Berakhot 51b:11-53b:33")],  # talmud perek without book that's ambiguous
    [crrd(["@רש\"י", "@פרק יום טוב", "@בביצה"]), ("Rashi on Beitzah 15b:1-23b:10",)],  # rashi perek
    [crrd(["@רש\"י", "@פרק מאימתי"]), ("Rashi on Berakhot 2a:1-13a:15",)],  # rashi perek
    [crrd(["@רש\"י", "@פרק כל כנויי נזירות", "@בנזיר", "*ד\"ה כל כינויי נזירות"]), ("Rashi on Nazir 2a:1:1",)],  # rashi perek dibur hamatchil

    # Numbered alt structs
    [crrd(["#פרק קמא", "@בפסחים"]), ("Pesachim 2a:1-21a:7", "Mishnah Pesachim 1")],  # numbered talmud perek
    [crrd(['#פ"ק', '@בפסחים']), ("Pesachim 2a:1-21a:7", "Mishnah Pesachim 1")],  # numbered talmud perek
    [crrd(["#פרק ה", "@בפסחים"]), ("Pesachim 58a:1-65b:9", "Mishnah Pesachim 5")],  # numbered talmud perek
    [crrd(['#פ"ה', '@בפסחים']), ("Pesachim 58a:1-65b:9", "Mishnah Pesachim 5", "Pesachim 85")],  # numbered talmud perek
    [crrd(["#פרק בתרא", "@בפסחים"]), ("Mishnah Pesachim 10", "Pesachim 99b:1-121b:3")],  # numbered talmud perek
    [crrd(['@מגמ\'', '#דרפ\"ו', '@דנדה']), ("Niddah 48a:11-54b:9",)],  # prefixes in front of perek name

    # Dibur hamatchils
    [crrd(["@רש\"י", "@יום טוב", "*ד\"ה שמא יפשע"]), ("Rashi on Beitzah 15b:8:1",)],
    [crrd(["@רש\"י", "@ביצה", "*ד\"ה שמא יפשע"]), ("Rashi on Beitzah 15b:8:1",)],
    [crrd(["@רש\"י", "@יום טוב", "*ד\"ה אלא ביבנה"]), ("Rashi on Rosh Hashanah 29b:5:3",)],
    [crrd(['@שבועות', '#דף כה ע"א', '@תוד"ה', '*חומר']), ("Tosafot on Shevuot 25a:11:1",)],
    [crrd(["@רש\"י", "#דף ב עמוד א", "@בסוכה", "*ד\"ה סוכה ורבי"]), ("Rashi on Sukkah 2a:1:1",)], # rashi dibur hamatchil
    [crrd(["@רש\"י", "@בראשית", "#פרק א", "#פסוק א", "*ד\"ה בראשית"]), ("Rashi on Genesis 1:1:1", "Rashi on Genesis 1:1:2")],

    # Ranged refs
    [crrd(['@ספר בראשית', '#פרק יג', '#פסוק א', '^עד', '#פרק יד', '#פסוק ד']), ("Genesis 13:1-14:4",)],
    [crrd(['@בראשית', '#יג', '#א', '^-', '#יד', '#ד']), ("Genesis 13:1-14:4",)],
    [crrd(['@דברים', '#פרק יד', '#פסוקים מ', '^-', '#מה']), ("Deuteronomy 14:40-45",)],
    pytest.param(crrd(['@תלמוד', '@כתובות', '#קיב', '#א', '^-', '#ב']), ["Ketubot 112"], marks=pytest.mark.xfail(reason="Deciding that we can't handle daf and amud being separate in this case because difficult to know we need to merge")),
    [crrd(['@תלמוד', '@כתובות', '#קיב א', '^-', '#ב']), ["Ketubot 112"]],

    # Base text context
    [crrd(['@ובתוס\'', '#דכ"ז ע"ב', '*ד"ה והלכתא'], "Rashi on Berakhot 2a"), ("Tosafot on Berakhot 27b:14:2",)],  # shared context child via graph context

    # Ibid
    [crrd(['&שם', '#ז'], prev_trefs=["Genesis 1"]), ["Genesis 7", "Genesis 1:7"]],  # ambiguous ibid
    [crrd(['#ב'], prev_trefs=["Genesis 1"]), ["Genesis 1:2", "Genesis 2"]],  # ambiguous ibid
    [crrd(['#ב', '#ז'], prev_trefs=["Genesis 1:3", "Exodus 1:3"]), ["Genesis 2:7", "Exodus 2:7"]],
    [crrd(['@בראשית', '&שם', '#ז'], prev_trefs=["Exodus 1:3", "Genesis 1:3"]), ["Genesis 1:7"]],
    [crrd(['&שם', '#ב', '#ז'], prev_trefs=["Genesis 1"]), ["Genesis 2:7"]],
    [crrd(['#פרק ד'], prev_trefs=["Genesis 1"]), ("Genesis 4",)],
    [crrd(['#פרק ד'], prev_trefs=["Genesis 1", None]), tuple()],
    [crrd(['@תוספות', '*ד"ה והלכתא'], prev_trefs=["Berakhot 27b"]), ("Tosafot on Berakhot 27b:14:2",)],
    [crrd(['#דף כ'], 'Berakhot 2a', prev_trefs=["Shabbat 2a"]), ("Berakhot 20", "Shabbat 20")],  # conflicting contexts
    [crrd(['#דף כ', '&שם'], 'Berakhot 2a', prev_trefs=["Shabbat 2a"]), ("Shabbat 20",)],  # conflicting contexts which can be resolved by explicit sham
    [crrd(["@ותוס'", "&שם", "*ד\"ה תרי"], "Gilyon HaShas on Berakhot 30a:2", prev_trefs=["Berakhot 17b"]), ("Tosafot on Berakhot 17b:5:1",)],  # Ibid.
    [crrd(['&שם', '&שם', '#ב'], "Mishnah Berakhot 1", prev_trefs=['Mishnah Shabbat 1:1']), ("Mishnah Shabbat 1:2",)],  # multiple shams. TODO failing because we're not enforcing order
    [crrd(['&שם'], prev_trefs=['Genesis 1:1']), ('Genesis 1:1',)],
    [crrd(['#פסוקים מ', '^-', '#מה'], prev_trefs=['Deuteronomy 14']), ("Deuteronomy 14:40-45",)],
    [crrd(['#יג', '#א', '^-', '#ב'], prev_trefs=['Deuteronomy 1:20']), ("Deuteronomy 13:1-2",)],
    [crrd(['@ברכות', '#דף ב'], prev_trefs=['Rashi on Berakhot 3a']), ('Berakhot 2',)],  # dont use context when not needed
    [crrd(['#שבפרק ד'], prev_trefs=["Genesis 1"]), ("Genesis 4",)],  # prefix in front of section
    [crrd(['@שמות', '#י"ב', '#א'], prev_trefs=['Exodus 10:1-13:16']), ['Exodus 12:1']],  # broke with merging logic in final pruning
    [crrd(['@רמב"ן', '#ט"ז', '#ד'], prev_trefs=["Exodus 16:32"]), ["Ramban on Exodus 16:4"]],
    [crrd(['#פרק ז'], prev_trefs=["II Kings 17:31"]), ["II Kings 7"]],
    [crrd(['@ערוך השולחן', '#תצג'], prev_trefs=["Arukh HaShulchan, Orach Chaim 400"]), ["Arukh HaShulchan, Orach Chaim 493"]],  # ibid named part that's not root
    [crrd(['@רש"י', '&שם'], prev_trefs=["Genesis 25:9", "Rashi on Genesis 21:20"]), ["Rashi on Genesis 21:20", "Rashi on Genesis 25:9"]],  # ambiguous ibid

    # Relative (e.g. Lekaman)
    [crrd(["@תוס'", "<לקמן", "#ד ע\"ב", "*ד\"ה דאר\"י"], "Gilyon HaShas on Berakhot 2a:2"), ("Tosafot on Berakhot 4b:6:1",)],  # likaman + abbrev in DH
    [crrd(['<לקמן', '#משנה א'], "Mishnah Berakhot 1", prev_trefs=['Mishnah Shabbat 1']), ("Mishnah Berakhot 1:1",)],  # competing relative and sham

    # Superfluous information
    [crrd(['@תוספות', '#פרק קמא', '@דברכות', '#דף ב']), ['Tosafot on Berakhot 2']],

    # YERUSHALMI EN
    [crrd(['@Bavli', '#2a'], "Jerusalem Talmud Shabbat 1:1", "en"), ("Shabbat 2a",)],
    pytest.param(crrd(['@Berakhot', '#2', '#1'], "Jerusalem Talmud Shabbat 1:1", "en"), ("Jerusalem Talmud Berakhot 2:1",), marks=pytest.mark.xfail(reason="Tricky case. We've decided to always prefer explicit or ibid citations so this case fails.")),
    [crrd(['@Bavli', '#2a', '^/', '#b'], "Jerusalem Talmud Shabbat 1:1", 'en'), ("Shabbat 2",)],
    [crrd(['@Halakha', '#2', '#3'], "Jerusalem Talmud Shabbat 1:1", 'en'), ("Jerusalem Talmud Shabbat 2:3",)],
    [crrd(['#2', '#3'], "Jerusalem Talmud Shabbat 1:1", 'en'), ("Jerusalem Talmud Shabbat 2:3",)],
    [crrd(['@Tosephta', '@Ševi‘it', '#1', '#1'], "Jerusalem Talmud Sheviit 1:1:3", 'en'), ("Tosefta Sheviit 1:1", "Tosefta Sheviit (Lieberman) 1:1")],
    [crrd(['@Babli', '#28b', '~,', '#31a'], "Jerusalem Talmud Taanit 1:1:3", 'en'), ("Taanit 28b", "Taanit 31a")],  # non-cts with talmud
    [crrd(['@Exodus', '#21', '#1', '~,', '#3', '~,', '#22', '#5'], "Jerusalem Talmud Taanit 1:1:3", 'en'), ("Exodus 21:1", "Exodus 21:3", "Exodus 22:5")],  # non-cts with tanakh
    pytest.param(crrd(['@Roš Haššanah', '#4', '#Notes 42', '^–', '#43'], "Jerusalem Talmud Taanit 1:1:3", "en"), ("Jerusalem Talmud Rosh Hashanah 4",), marks=pytest.mark.xfail(reason="currently dont support partial ranged ref match. this fails since Notes is not a valid address type of JT")),
    [crrd(['@Tosaphot', '#85a', '*s.v. ולרבינא'], "Jerusalem Talmud Pesachim 1:1:3", 'en'), ("Tosafot on Pesachim 85a:14:1",)],
    [crrd(['@Unknown book', '#2'], "Jerusalem Talmud Pesachim 1:1:3", 'en'), tuple()],  # make sure title context doesn't match this
    [crrd(['@Tosafot', '@Megillah', '#21b', '*s. v . כנגד'], "Jerusalem Talmud Pesachim 1:1:3", 'en'), ("Tosafot on Megillah 21b:7:1",)],  # make sure title context doesn't match this
    [crrd(['@Sifra', '@Behar', '#Parašah 6', '#5'], "Jerusalem Talmud Pesachim 1:1:3", 'en'), ("Sifra, Behar, Section 6 5",)],
    [crrd(['@Sifra', '@Saw', '#Parashah 2(9–10'], "Jerusalem Talmud Pesachim 1:1:3", 'en'), tuple()],  # if raw ref gets broken into incorrect parts, make sure it handles it correctly

    # gilyon hashas
    [crrd(["@תוספות", "*ד\"ה אין"], "Gilyon HaShas on Berakhot 51b:1"), ("Tosafot on Berakhot 51b:8:1",)],  # commentator with implied book and daf from context commentator
    [crrd(["@קדושין", "#טו ע\"ב", "@תוס'", "*ד\"ה א\"ק"], "Gilyon HaShas on Berakhot 21a:3"), ("Tosafot on Kiddushin 15b:3:1", "Tosafot on Kiddushin 15b:4:1",)],  # abbrev in DH. ambiguous.
    [crrd(["@בב\"מ", "#פח ע\"ב"], "Gilyon HaShas on Berakhot 21a:3"), ("Bava Metzia 88b",)],  # TODO should this match Gilyon HaShas as well?

    # specific books
    # TODO still need to convert the following tests to new `crrd` syntax
    [crrd(['@טור', '@אורח חיים', '#סימן א']), ("Tur, Orach Chaim 1",)],
    [crrd(['@ספרא', '@בהר', '#ב', '#ד']), ("Sifra, Behar, Chapter 2:4", "Sifra, Behar, Section 2:4")],
    [crrd(['@רמב"ן', '@דברים', '#יד', '#כא']), ("Ramban on Deuteronomy 14:21",)],
    [crrd(['@הרמב"ם', '@תרומות', '#פ"א', '#ה"ח']), ("Mishneh Torah, Heave Offerings 1:8",)],
    [crrd(['@בירושלמי', '@שביעית', '#פ"ו', '#ה"א']), ("Jerusalem Talmud Sheviit 6:1",)],
    [crrd(['@בגמרא במסכת בסנהדרין', '#צז:']), ("Sanhedrin 97b",)],  # one big ref part that actually matches two separate terms + each part has prefix
    [crrd(['@לפרשת וילך']), ("Deuteronomy 31:1-30",)],  # lamed prefix
    [crrd(['@ברמב"ם', '#פ"ח', '@מהל\' תרומות', '#הי"א']), ("Mishneh Torah, Heave Offerings 8:11",)],
    [crrd(["@באה\"ע", "#סימן קנ\"ה", "#סי\"ד"]), ("Shulchan Arukh, Even HaEzer 155:14",)],
    [crrd(['@פירש"י', '@בקידושין', '#דף פ\' ע"א']), ("Rashi on Kiddushin 80a",)],
    # pytest.param(crrd("Gilyon HaShas on Berakhot 48b:1", 'he', '''תשב"ץ ח"ב (ענין קסא''', [0, 1, slice(3, 5)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Sefer HaTashbetz, Part II 161",), marks=pytest.mark.xfail(reason="Don't support Sefer HaTashbetz yet")),  # complex text
    [crrd(['@יבמות', '#לט ע״ב']), ["Yevamot 39b"]],
    [crrd(['@פרשת שלח לך']), ['Parashat Shelach']],
    [crrd(['@טור יורה דעה', '#סימן א']), ['Tur, Yoreh Deah 1']],
    [crrd(['@תוספתא', '@ברכות', '#א', '#א']), ['Tosefta Berakhot 1:1', 'Tosefta Berakhot (Lieberman) 1:1']],  # tosefta ambiguity
    [crrd(['@תוספתא', '@ברכות', '#א', '#טז']), ['Tosefta Berakhot 1:16']],  # tosefta ambiguity
    [crrd(['@זוה"ק', '#ח"א', '#דף פג:']), ['Zohar 1:83b']],
    # pytest.param(crrd(None, 'he', 'זוהר שמות י.', [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ['Zohar 2:10a'], marks=pytest.mark.xfail(reason="Don't support Sefer HaTashbetz yet")),  # infer Zohar volume from parasha
    [crrd(['@זהר חדש', '@בראשית']), ['Zohar Chadash, Bereshit']],
    [crrd(['@מסכת', '@סופרים', '#ב', '#ג']), ['Tractate Soferim 2:3']],
    [crrd(['@אדר"נ', '#ב', '#ג']), ["Avot D'Rabbi Natan 2:3"]],
    [crrd(['@פרק השלום', '#ג']), ["Tractate Derekh Eretz Zuta, Section on Peace 3"]],
    [crrd(['@ד"א זוטא', '@פרק השלום', '#ג']), ["Tractate Derekh Eretz Zuta, Section on Peace 3"]],
    [crrd(['@ספר החינוך', '@לך לך', '#ב']), ['Sefer HaChinukh 2']],
    [crrd(['@ספר החינוך', '#ב']), ['Sefer HaChinukh 2']],

    #ben yehuda project
    [crrd(["@בראש'", '#א', '#ב']), ["Genesis 1:2"]],
    [crrd(['@רש"י', "@כתוב'", '#י:']), ["Rashi on Ketubot 10b"]],
    [crrd(["@מקוא'", '#א', '#ב']), ["Mishnah Mikvaot 1:2"]],
    [crrd(['@תוספתא', "@יומ'", '#א', '#א']), ["Tosefta Yoma 1:1", 'Tosefta Yoma (Lieberman) 1:1']],

    # pytest.param(crrd(None, 'he', 'החינוך, כי תבא, עשה תר"ו', [0, slice(2, 4), 5, slice(6, 9)], [RPT.NAMED, RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ['Sefer HaChinukh 3'], marks=pytest.mark.xfail(reason="Don't support Aseh as address type yet")),
    # [crrd(None, 'he', 'מכילתא מסכתא דעמלק', [0, slice(1, 3)], [RPT.NAMED, RPT.NAMED]), ["Mekhilta d'Rabbi Yishmael 17:8-18:27"]],
    # [crrd(None, 'he', 'מכילתא שמות כא ג', [slice(0, 2), 2, 3], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Mekhilta d'Rabbi Yishmael 21:3"]],
    # [crrd(None, 'he', 'מכילתא שמות כא ג', [0, 1, 2, 3], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Mekhilta d'Rabbi Yishmael 21:3"]],
    # [crrd(None, 'he', 'מכילתא כא ג', [0, 1, 2], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Mekhilta d'Rabbi Yishmael 21:3"]],
    # [crrd(None, 'he', 'במדרש שמות רבה י"א ג', [0, slice(1, 3), slice(3, 6), 6], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Shemot Rabbah 11:3"]],
    # [crrd(None, 'he', 'ובפרשת ואלה שמות', [slice(0, 3)], [RPT.NAMED]), ["Exodus 1:1-6:1"]],
    # [crrd(None, 'he', 'פדר"א פרק כג', [slice(0,3), slice(3, 5)], [RPT.NAMED, RPT.NUMBERED]), ["Pirkei DeRabbi Eliezer 23"]],
    # [crrd(None, 'he', 'סדר אליהו פ"י', [slice(0, 2), slice(2, 5)], [RPT.NAMED, RPT.NUMBERED]), ["Tanna Debei Eliyahu Rabbah 10"]],
    # pytest.param(crrd(None, 'he', 'תנד"א זוטא יא', [slice(0, 4), 4], [RPT.NAMED, RPT.NUMBERED]), ["Tanna debei Eliyahu Zuta 11"], marks=pytest.mark.xfail(reason="Currently there's an unnecessary SchemaNode 'Seder Eliyahu Zuta' that needs to be removed for this to pass")),
    # [crrd(None, 'he', 'מכילתא דרשב"י פרק יב', [slice(0, 4), slice(4, 6)], [RPT.NAMED, RPT.NUMBERED]), ["Mekhilta DeRabbi Shimon Ben Yochai 12"]],

    # [crrd(None, 'he', "ספרי במדבר קמב", [slice(0, 2), 2], [RPT.NAMED, RPT.NUMBERED]), ["Sifrei Bamidbar 142"]],
    # pytest.param(crrd(None, 'he', "ספרי במדבר פיס' קמב", [slice(0, 2), slice(2, 5)], [RPT.NAMED, RPT.NUMBERED]), ["Sifrei Bamidbar 142"], marks=pytest.mark.xfail(reason="Don't support Piska AddressType")),
    # pytest.param(crrd(None, 'he', 'ספרי דברים פיסקא צט', [slice(0, 2), slice(2, 4)], [RPT.NAMED, RPT.NUMBERED]), ["Sifrei Devarim 99"], marks=pytest.mark.xfail(reason="Don't support Piska AddressType")),
    # pytest.param(crrd(None, 'he', 'ספרי במדבר פסקא יז', [slice(0, 2), slice(2, 4)], [RPT.NAMED, RPT.NUMBERED]), ["Sifrei Bamidbar 17"], marks=pytest.mark.xfail(reason="Don't support Piska AddressType")),
    # pytest.param(crrd(None, 'he', 'ספרי במדבר פרשת בהעלותך פיסקא עח', [slice(0, 2), slice(2, 4), slice(4, 6)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Sifrei Bamidbar 78"], marks=pytest.mark.xfail(reason="Don't support Piska AddressType")),
    # [crrd(None, 'he', "ספרי דברים וזאת הברכה סי' שמד", [slice(0, 2), slice(2, 4), slice(4, 7)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Sifrei Devarim 344"]],
    # [crrd(None, 'he', 'פסיקתא דר"כ ג', [slice(0, 4), 4], [RPT.NAMED, RPT.NUMBERED]), ["Pesikta D'Rav Kahanna 3"]],
    # [crrd(None, 'he', "פסיקתא רבתי טו", [slice(0, 2), 2], [RPT.NAMED, RPT.NUMBERED]), ["Pesikta Rabbati 15"]],
    # pytest.param(crrd(None, 'he', "ילקוט שמעוני כג", [slice(0, 2), 2], [RPT.NAMED, RPT.NUMBERED]), ["Yalkut Shimoni on Torah 23"], marks=pytest.mark.xfail(reason="Can't infer which Yalkut Shimoni from Remez")),
    # pytest.param(crrd(None, 'he', "ילקוט שמעוני בראשית רמז כג", [slice(0, 2), 2, 3], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ["Yalkut Shimoni on Torah 23"], marks=pytest.mark.xfail(reason="Can't infer which Yalkut Shimoni from book")),
    # pytest.param(crrd(None, 'he', 'ילקוט שמעוני על נ"ך רמז כג', [slice(0, 6), 6], [RPT.NAMED, RPT.NUMBERED]), ["Yalkut Shimoni on Nach 23"], marks=pytest.mark.xfail(reason="Can't infer which book in Yalkut Shimoni on Nach from Remez")),
    # [crrd(None, 'he', 'ילקוט שמעוני יהושע כג', [slice(0, 2), 2, 3], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ["Yalkut Shimoni on Nach 23"]],
    # [crrd(None, 'he', 'מדרש תהילים כג', [slice(0, 2), 2], [RPT.NAMED, RPT.NUMBERED]), ["Midrash Tehillim 23"]],
    # [crrd(None, 'he', 'מדרש משלי פרק כג', [slice(0, 2), slice(2, 4)], [RPT.NAMED, RPT.NUMBERED]), ["Midrash Mishlei 23"]],
    # [crrd(None, 'he', 'תנחומא בראשית יג', [0, 1, 2], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ["Midrash Tanchuma, Bereshit 13"]],
    # [crrd(None, 'he', 'תנחומא בובר בראשית יג', [slice(0,2), 2, 3], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ["Midrash Tanchuma Buber, Bereshit 13"]],
    # [crrd(None, 'he', 'תקוני זוהר כג ע"ב', [slice(0, 2), slice(2, 6)], [RPT.NAMED, RPT.NUMBERED]), ["Tikkunei Zohar 23b"]],
    # pytest.param(crrd(None, 'he', 'תקו"ז ט', [slice(0, 3), 3], [RPT.NAMED, RPT.NUMBERED]),["Tikkunei Zohar 24a:7-24b:1"], marks=pytest.mark.xfail(reason="Currently invalid way to refer to Tikkunei Zohar")),
    # pytest.param(crrd(None, 'he', 'ת"ז תיקון ט', [slice(0, 3), slice(3, 5)], [RPT.NAMED, RPT.NUMBERED]), ["Tikkunei Zohar 24a:7-24b:1"], marks=pytest.mark.xfail(reason="Currently invalid way to refer to Tikkunei Zohar")),
    # pytest.param(crrd(None, 'he', 'תקו"ז ט כד ע"ב', [slice(0, 3), 3, slice(4, 8)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Tikkunei Zohar 24b:1"], marks=pytest.mark.xfail(reason="Currently invalid way to refer to Tikkunei Zohar")),
    # [crrd(None, 'he', 'הקדמה לתקו"ז', [0, slice(1, 4)], [RPT.NAMED, RPT.NAMED]), ["Tikkunei Zohar 1a:1-16b:4"]],
    # [crrd(None, 'he', 'ס"ע פי"א', [slice(0, 3), slice(3, 6)], [RPT.NAMED, RPT.NUMBERED]), ["Seder Olam Rabbah 11"]],
    # [crrd(None, 'he', 'מק"א ג ד', [slice(0, 3), 3, 4], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["The Book of Maccabees I 3:4"]],
    # [crrd(None, 'he', 'ספר חשמונאים ב ו ב', [slice(0, 3), 3, 4], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["The Book of Maccabees II 6:2"]],
    # [crrd(None, 'he', 'ליקוטי מוהר"ן כג ב', [slice(0,4), 4, 5], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Likutei Moharan 23:2"]],
    # pytest.param(crrd(None, 'he', 'ליקוטי מוהר"ן תורה כג אות ב', [slice(0, 4), slice(4, 6), slice(6, 8)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Likutei Moharan 23:2"], marks=pytest.mark.xfail(reason="Torah and Ot are not valid AddressTypes yet")),
    # [crrd(None, 'he', 'ליקוטי מוהר"ן תניינא ד ב', [slice(0,4), 4, 5, 6], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Likutei Moharan, Part II 4:2"]],
    # [crrd(None, 'he', 'ספר יצירה פ"א מ"א', [0, 1, slice(2, 5), slice(5, 8)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Sefer Yetzirah 1:1"]],
    # [crrd(None, 'he', 'ספר יצירה נוסח הגר"א ב ב', [0, 1, slice(3, 6), 6, 7], [RPT.NAMED, RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Sefer Yetzirah Gra Version 2:2"]],
    # [crrd(None, 'he', 'לקוטי הלכות או"ח הלכות ציצית ב א', [slice(0, 2), slice(2, 5), slice(5, 7), 7, 8], [RPT.NAMED, RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Likutei Halakhot, Orach Chaim, Laws of Fringes 2:1"]],
    # [crrd(None, 'he', 'לקוטי הלכות הלכות מעקה ושמירת הנפש', [slice(0, 2), slice(2, 6)], [RPT.NAMED, RPT.NAMED]), ["Likutei Halakhot, Choshen Mishpat, Laws of Roof Rails and Preservation of Life"]],
    # [crrd(None, 'he', "בתלמוד ירושלמי כתובות פ\"א ה\"ב", [slice(0, 2), 2, slice(3, 6), slice(6, 9)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ["Jerusalem Talmud Ketubot 1:2"]],
    # [crrd(None, 'he', 'סוטה מג', [0, 1], [RPT.NAMED, RPT.NUMBERED]), ['Sotah 43']],
    # [crrd(None, 'he', 'משנה ברורה סימן א סק"א', [slice(0, 2), slice(2, 4), slice(4, 7)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ['Mishnah Berurah 1:1']],
    # [crrd(None, 'he', 'משנה ברורה סימן א סקט״ו', [slice(0, 2), slice(2, 4), slice(4, 7)],  [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ['Mishnah Berurah 1:15']],
    # [crrd(None, 'he', 'משנה ברורה סימן א סעיף קטן א', [slice(0, 2), slice(2, 4), slice(4, 7)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ['Mishnah Berurah 1:1']],
    # [crrd(None, 'he', 'משנה ברורה סימן א ס״ק א', [slice(0, 2), slice(2, 4), slice(4, 8)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ['Mishnah Berurah 1:1']],
    # [crrd(None, 'he', 'בשו"ע או"ח סימן שכ"ט ס"ו', [slice(0, 3), slice(3, 6), slice(6, 10), slice(10, 13)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ['Shulchan Arukh, Orach Chayim 329:6']],
    # [crrd(None, 'he', 'בשו"ע או"ח סימן ש"ל סי"א', [slice(0, 3), slice(3, 6), slice(6, 10), slice(10, 13)],
    #       [RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ['Shulchan Arukh, Orach Chayim 330:11']],
    #
    # # support basic ref instantiation as fall-back
    [crrd(['@Rashi on Genesis', '#1', '#1', '#1'], lang='en'), ["Rashi on Genesis 1:1:1"]],
])
def test_resolve_raw_ref(resolver_data, expected_trefs):
    ref_resolver.reset_ibid_history()  # reset from previous test runs
    raw_ref, context_ref, lang, prev_trefs = resolver_data
    if prev_trefs:
        for prev_tref in prev_trefs:
            if prev_tref is None:
                ref_resolver.reset_ibid_history()
            else:
                ref_resolver._ibid_history.last_refs = Ref(prev_tref)
    print_spans(raw_ref)
    ref_resolver.set_thoroughness(ResolutionThoroughness.HIGH)
    matches = ref_resolver.resolve_raw_ref(lang, context_ref, raw_ref)
    matched_orefs = sorted(reduce(lambda a, b: a + b, [[match.ref] if not match.is_ambiguous else [inner_match.ref for inner_match in match.resolved_raw_refs] for match in matches], []), key=lambda x: x.normal())
    if len(expected_trefs) != len(matched_orefs):
        print(f"Found {len(matched_orefs)} refs instead of {len(expected_trefs)}")
        for matched_oref in matched_orefs:
            print("-", matched_oref.normal())
    assert len(matched_orefs) == len(expected_trefs)
    for expected_tref, matched_oref in zip(sorted(expected_trefs, key=lambda x: x), matched_orefs):
        assert matched_oref == Ref(expected_tref)
class TestResolveRawRef:

    pass

@pytest.mark.parametrize(('context_tref', 'input_str', 'lang', 'expected_trefs', 'expected_pretty_texts'), [
    [None, """גמ' שמזונותן עליך. עיין ביצה (דף טו ע"ב רש"י ד"ה שמא יפשע:)""", 'he', ("Rashi on Beitzah 15b:8:1",), ['ביצה (דף טו ע"ב רש"י ד"ה שמא יפשע:)']],
    [None, """שם אלא ביתך ל"ל. ע' מנחות מד ע"א תד"ה טלית:""", 'he', ("Tosafot on Menachot 44a:12:1",), ['מנחות מד ע"א תד"ה טלית']],
    [None, """גמ' במה מחנכין. עי' מנחות דף עח ע"א תוס' ד"ה אחת:""", 'he',("Tosafot on Menachot 78a:10:1",), ['''מנחות דף עח ע"א תוס' ד"ה אחת''']],
    [None, """cf. Ex. 9:6,5""", 'en', ("Exodus 9:6", "Exodus 9:5"), ['Ex. 9:6', '5']],
    ["Gilyon HaShas on Berakhot 25b:1", 'רש"י תמורה כח ע"ב ד"ה נעבד שהוא מותר. זה רש"י מאוד יפה.', 'he', ("Rashi on Temurah 28b:4:2",), ['רש"י תמורה כח ע"ב ד"ה נעבד שהוא מותר']],
])
def test_full_pipeline_ref_resolver(context_tref, input_str, lang, expected_trefs, expected_pretty_texts):
    context_oref = context_tref and Ref(context_tref)
    resolved = ref_resolver.bulk_resolve_refs(lang, [context_oref], [input_str])[0]
    assert len(resolved) == len(expected_trefs)
    resolved_orefs = sorted(reduce(lambda a, b: a + b, [[match.ref] if not match.is_ambiguous else [inner_match.ref for inner_match in match.resolved_raw_refs] for match in resolved], []), key=lambda x: x.normal())
    if len(expected_trefs) != len(resolved_orefs):
        print(f"Found {len(resolved_orefs)} refs instead of {len(expected_trefs)}")
        for matched_oref in resolved_orefs:
            print("-", matched_oref.normal())
    for expected_tref, matched_oref in zip(sorted(expected_trefs, key=lambda x: x), resolved_orefs):
        assert matched_oref == Ref(expected_tref)
    for match, expected_pretty_text in zip(resolved, expected_pretty_texts):
        assert input_str[slice(*match.raw_ref.char_indices)] == match.raw_ref.text
        assert match.pretty_text == expected_pretty_text


@pytest.mark.parametrize(('input_addr_str', 'AddressClass','expected_sections'), [
    ['פ"ח', schema.AddressPerek, ([8, 88], [8, 88], [schema.AddressPerek, schema.AddressInteger])],
    ['מ"ד', schema.AddressTalmud, ([87], [88], [schema.AddressTalmud])],
    ['מ"ד.', schema.AddressTalmud, ([87], [87], [schema.AddressTalmud])],
    ['מ"ד ע"ב', schema.AddressTalmud, ([88], [88], [schema.AddressTalmud])],
    ['מ"ד', schema.AddressMishnah, ([4, 44], [4, 44], [schema.AddressMishnah, schema.AddressInteger])],
    ['פ"ק', schema.AddressPerek, ([1, 100], [1, 100], [schema.AddressPerek, schema.AddressPerek])],
])
def test_get_all_possible_sections_from_string(input_addr_str, AddressClass, expected_sections):
    exp_secs, exp2secs, exp_addrs = expected_sections
    sections, toSections, addr_classes = AddressClass.get_all_possible_sections_from_string('he', input_addr_str)
    sections = sorted(sections)
    toSections = sorted(toSections)
    assert sections == exp_secs
    assert toSections == exp2secs
    assert list(addr_classes) == exp_addrs


@pytest.mark.parametrize(('raw_ref_params', 'expected_section_slices'), [
    # [create_raw_ref_params('he', "בראשית א:א-ב", [0, 1, 3, 4, 5], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED]), (slice(1,3),slice(4,5))],  # standard case
    # [create_raw_ref_params('he', "א:א-ב", [0, 2, 3, 4], [RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED]), (slice(0,2),slice(3,4))],  # only numbered sections
    # [create_raw_ref_params('he', "בראשית א:א-ב:א", [0, 1, 3, 4, 5, 7], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED, RPT.NUMBERED]), (slice(1,3),slice(4,6))],  # full sections and toSections
    # [create_raw_ref_params('he', "בראשית א:א", [0, 1, 3], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), (None, None)],  # no ranged symbol
    # [create_raw_ref_params('he', 'ספר בראשית פרק יג פסוק א עד פרק יד פסוק ד', [slice(0, 2), slice(2, 4), slice(4, 6), 6, slice(7, 9), slice(9, 11)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED, RPT.NUMBERED]), (slice(1,3), slice(4,6))],  # verbose range
])
def test_group_ranged_parts(raw_ref_params, expected_section_slices):
    lang, raw_ref_parts, span = raw_ref_params
    raw_ref = RawRef(lang, raw_ref_parts, span)
    exp_sec_slice, exp2sec_slice = expected_section_slices
    if exp_sec_slice is None:
        expected_raw_ref_parts = raw_ref_parts
    else:
        sections = raw_ref_parts[exp_sec_slice]
        toSections = sections[:]
        toSections[-(exp2sec_slice.stop-exp2sec_slice.start):] = raw_ref_parts[exp2sec_slice]
        expected_ranged_raw_ref_parts = RangedRawRefParts(sections, toSections)
        expected_raw_ref_parts = raw_ref_parts[:exp_sec_slice.start] + \
                                 [expected_ranged_raw_ref_parts] + \
                                 raw_ref_parts[exp2sec_slice.stop:]
        ranged_raw_ref_parts = raw_ref.raw_ref_parts[exp_sec_slice.start]
        assert ranged_raw_ref_parts.sections == expected_ranged_raw_ref_parts.sections
        assert ranged_raw_ref_parts.toSections == expected_ranged_raw_ref_parts.toSections
        start_span = sections[0].span
        end_span = toSections[-1].span
        start_token_i, _ = span_inds(start_span)
        _, end_token_i = span_inds(end_span)
        full_span = start_span.doc[start_token_i:end_token_i]
        assert ranged_raw_ref_parts.span.text == full_span.text
    assert expected_raw_ref_parts == raw_ref.raw_ref_parts


@pytest.mark.parametrize(('context_tref', 'match_title', 'common_title', 'expected_sec_cons'), [
    ['Gilyon HaShas on Berakhot 12b:1', 'Tosafot on Berakhot', 'Berakhot', (('Talmud', 'Daf', 24),)],
    ['Berakhot 2a:1', 'Berakhot', 'Berakhot', (('Talmud', 'Daf', 3),)]  # skip "Line" address which isn't referenceable
])
def test_get_section_contexts(context_tref, match_title, common_title, expected_sec_cons):
    context_ref = Ref(context_tref)
    match_index = library.get_index(match_title)
    common_index = library.get_index(common_title)
    section_contexts = RefResolver._get_section_contexts(context_ref, match_index, common_index)
    if len(section_contexts) != len(expected_sec_cons):
        print(f"Found {len(section_contexts)} sec cons instead of {len(expected_sec_cons)}")
        for sec_con in section_contexts:
            print("-", sec_con)
    assert len(section_contexts) == len(expected_sec_cons)
    for i, (addr_str, sec_name, address) in enumerate(expected_sec_cons):
        assert section_contexts[i] == SectionContext(schema.AddressType.to_class_by_address_type(addr_str), sec_name, address)


def test_address_matches_section_context():
    r = Ref("Berakhot")
    sec_con = SectionContext(schema.AddressType.to_class_by_address_type('Talmud'), 'Daf', 34)
    assert NumberedReferenceableBookNode(r.index_node).matches_section_context(sec_con)


@pytest.mark.parametrize(('last_n_to_store', 'trefs', 'expected_title_len'), [
    [1, ('Job 1', 'Job 2', 'Job 3'), (1, 1, 1)],
    [1, ('Job 1', 'Genesis 2', 'Exodus 3'), (1, 1, 1)],
    [2, ('Job 1', 'Genesis 2', 'Exodus 3'), (1, 2, 2)],

])
def test_ibid_history(last_n_to_store, trefs, expected_title_len):
    ibid = IbidHistory(last_n_to_store)
    orefs = [Ref(tref) for tref in trefs]
    for i, (oref, title_len) in enumerate(zip(orefs, expected_title_len)):
        ibid.last_refs = oref
        end = i-len(orefs)+1
        start = end-title_len
        end = None if end == 0 else end
        curr_refs = orefs[start:end]
        assert ibid._last_titles == [r.index.title for r in curr_refs]
        assert len(ibid._title_ref_map) == title_len
        for curr_ref in curr_refs:
            assert ibid._title_ref_map[curr_ref.index.title] == curr_ref


@pytest.mark.parametrize(('crrd_params',), [
    [[['@ויקרא', '#י', '#י”ב']]],  # no change in inds
    [[['@ויקרא', '#י', '0<b>', '#י”ב', '0</b>']]],

])
def test_map_new_indices(crrd_params):
    # unnorm data
    raw_ref, _, lang, _ = crrd(*crrd_params)
    text = raw_ref.text
    doc = ref_resolver.get_raw_ref_model(lang).make_doc(text)
    indices = raw_ref.char_indices
    part_indices = [p.char_indices for p in raw_ref.raw_ref_parts]
    print_spans(raw_ref)

    # norm data
    n = ref_resolver._normalizer
    norm_text = n.normalize(text, lang=lang)
    norm_doc = ref_resolver.get_raw_ref_model(lang).make_doc(norm_text)
    mapping = n.get_mapping_after_normalization(text, reverse=True, lang=lang)
    norm_part_indices = n.convert_normalized_indices_to_unnormalized_indices(part_indices, mapping, reverse=True)
    norm_part_spans = [norm_doc.char_span(s, e) for (s, e) in norm_part_indices]
    norm_part_token_inds = []
    for span in norm_part_spans:
        start, end = span_inds(span)
        norm_part_token_inds += [slice(start, end)]

    part_types = [part.type for part in raw_ref.raw_ref_parts]
    raw_encoded_part_list = EncodedPart.convert_to_raw_encoded_part_list(lang, norm_text, norm_part_token_inds, part_types)
    norm_crrd_params = crrd_params[:]
    norm_crrd_params[0] = raw_encoded_part_list
    norm_raw_ref, _, _, _ = crrd(*norm_crrd_params)

    # test
    assert norm_raw_ref.text == norm_text.strip()
    norm_raw_ref.map_new_indices(doc, indices, part_indices)
    assert norm_raw_ref.text == raw_ref.text
    for norm_part, part in zip(norm_raw_ref.raw_ref_parts, raw_ref.raw_ref_parts):
        assert norm_part.text == part.text
