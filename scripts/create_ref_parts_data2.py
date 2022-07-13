import django, re
django.setup()
from tqdm import tqdm
from sefaria.model import *
from sefaria.system.database import db
from collections import defaultdict
from sefaria.utils.hebrew import is_hebrew
from sefaria.model.ref_part import MatchTemplate
from sefaria.model.abstract import AbstractMongoRecord
from sefaria.model.schema import DiburHamatchilNode, DiburHamatchilNodeSet, TitleGroup

"""
Documentation of new fields which can be added to SchemaNodes
    - match_templates: List[MatchTemplate]
        List of serialized MatchTemplate objects. See ref_part.MatchTemplate.serialize()
        Each inner array is similar to an alt-title. The difference is each NonUniqueTerm can have its own independent alt-titles so it is more flexible.
        Example:
            Some match_templates for "Berakhot" might be
            "match_templates" : [
                { "term_slugs" : ["bavli", "berakhot"] }, 
                { "term_slugs" : ["gemara", "berakhot"]}, 
                { "term_slugs" : ["bavli", "tractate", "berakhot"] }
            ]
            
        Match templates can include a key "scope". If not included, the default is "combined"
        Values for "scope":
            "combined": need to match at least one match template for every node above this node + one match template for this node
            "alone": only need to match one match template from this node. This is helpful when certain nodes can be referenced independent of the book's title (e.g. perek of Rashi)
            "any": both "combined" and "alone"
        Example:
            Some match templates for the first perek of "Rashi on Berkahot" might be:
            (Note, the "alone" templates don't need to match the match_templates of the root node (i.e. ["rashi", "berakhot"])
            "match_templates" : [
                {
                    "term_slugs" : ["rashi", "perek", "מאימתי"], 
                    "scope" : "alone"
                }, 
                {
                    "term_slugs" : ["perek", "מאימתי"]
                }, 
                {
                    "term_slugs" : ["perek", "first"]
                }
            ]
    - isSegmentLevelDiburHamatchil
        Only used for JaggedArrayNodes.
        bool.
        True means the segment level should be referenced by DH and not by number.
        E.g. No one references Rashi on Genesis 2:1:1. They reference Rashi on Genesis 2:1 DH ויכל
    - referenceableSections
        Only used for JaggedArrayNodes.
        List of bool. Should be same length as `depth`
        If a section is False in this list, it will not be referenceable.
        If field isn't defined, assumed to be True for every section.
        E.g. The section level of Rashi on Berakhot is not referenced since it corresponds to paragraph number in our break-up of Talmud
        So for Rashi on Berakhot, referenceableSections = [True, False, True].
        This effectively means this text can be referenced as depth 2.
    - diburHamatchilRegexes
        Only used for JaggedArrayNodes.
        List[str]
        Each string represents a regex.
        Each regex will be run sequentially and final output will be the Dibur Hamatchil for that segment
        Each regex should either not match OR return match with result in group 1
        Example
            For Rashi on Berakhot, diburHamatchilRegexes = ['^(.+?)[\-–]', '\.(.+?)$', "^(?:(?:מתני'|גמ')\s?)?(.+)$"]
    - numeric_equivalent
        int
        Used for SchemaNodes that should be referenceable by number as well
        E.g. Sifra has many nodes like "Chapter 1" that are SchemaNodes but should be referenceable by gematria        

"""


class ReusableTermManager:

    def __init__(self):
        self.context_and_primary_title_to_term = {}
        self.num_to_perek_term_map = {}
        self.old_term_map = {}
        self.reg_map = {
            "rashi": ['^(.+?)[\-–]', '\.(.+?)$', "^(?:(?:מתני'|גמ')\s?)?(.+)$"],
            "ran": ['^(.+?)[\-–]', "^(?:(?:מתני'|גמ')\s?)?(.+)$"],
            "tosafot": ['^(.+?)[\-–\.]', "^(?:(?:מתני'|גמ')\s?)?(.+)$"],
            "gilyon-hashas": ["^<b>(.+?)</b>"],
        }

    def get_dh_regexes(self, index, comm_term_slug):
        return self.reg_map.get(index.title, self.reg_map.get(comm_term_slug))

    def get_term_by_primary_title(self, context, title):
        return self.context_and_primary_title_to_term.get((context, title))

    def get_term_by_old_term_name(self, old_term_name):
        return self.old_term_map.get(old_term_name)

    def get_perek_term_by_num(self, perek_num):
        return self.num_to_perek_term_map.get(perek_num)

    def create_term(self, **kwargs):
        """

        @param kwargs:
            'en'
            'he'
            'alt_en'
            'alt_he'
            'ref_part_role'
            'context'
        @return:
        """
        slug = kwargs.get('en', kwargs.get('he'))
        term = NonUniqueTerm({
            "slug": slug,
            "titles": []
        })
        for lang in ('en', 'he'):
            if kwargs.get(lang, False):
                term.title_group.add_title(kwargs.get(lang), lang, primary=True)
            for title in kwargs.get(f"alt_{lang}", []):
                term.title_group.add_title(title, lang)
        term.ref_part_role = kwargs['ref_part_role']
        term.save()
        self.context_and_primary_title_to_term[(kwargs.get('context'), term.get_primary_title('en'))] = term
        return term

    def create_term_from_titled_obj(self, obj, ref_part_role, context=None, new_alt_titles=None, title_modifier=None, title_adder=None):
        """
        Create a NonUniqueTerm from 'titled object' (see explanation of `obj` param)
        Accepts params to modify or add new alt titles
        @param obj: either of instance `TitleGroup` or has an attribute `title_group` (e.g. a `Term` or `SchemaNode` has this field)
        @param context: Optional string (or any hashable object) to distinguish terms with the same primary title. For use with `get_term_by_primary_title()`
        @param ref_part_role: See docs for attribute `ref_part_role` on NonUniqueTerm class
        @param new_alt_titles: list[str]. optional list of alt titles to add. will auto-detect language of title.
        @param title_modifier: function(lang, str) -> str. given lang and current alt title, replaces alt title with return value. Useful for removing common prefixes such as "Parshat" or "Mesechet"
        @param title_adder: function(lang, str) -> str. given lang and current alt title, returns new alt title. If returns None, no alt title is added for given title. Useful for creating variations on existing alt titles.
        @return: new NonUniqueTerm

        Example:

        .. highlight:: python
        .. code-block:: python

            # make NonUniqueTerm based on index node of "Genesis"
            # remove leading "Sefer " from all alt titles
            # add new titles that replace "sh" with "š"

            def title_modifier(lang, title):
                if lang == "en":
                    return re.sub(r"^Sefer ", "", title)
                return title

            def title_adder(lang, title):
                if "sh" in title:
                    return title.repalce("sh", "š")

            index = library.get_index("Genesis")
            gen_term = ReusableTermManager.create_term_from_titled_obj(
                index.nodes, "structural", ["Bˋershis", "Breišis"],
                title_modifier, title_adder
            )

        ...

        """
        new_alt_titles = new_alt_titles or []
        title_group = obj if isinstance(obj, TitleGroup) else obj.title_group
        en_title = title_group.primary_title('en')
        he_title = title_group.primary_title('he')
        alt_en_titles = [title for title in title_group.all_titles('en') if title != en_title]
        alt_he_titles = [title for title in title_group.all_titles('he') if title != he_title]
        if title_modifier:
            en_title = title_modifier('en', en_title)
            he_title = title_modifier('he', he_title)
        for new_alt in new_alt_titles:
            if is_hebrew(new_alt):
                alt_he_titles += [new_alt]
            else:
                alt_en_titles += [new_alt]
        for alt_title_list, lang in zip((alt_en_titles + [en_title], alt_he_titles + [he_title]), ('en', 'he')):
            if title_adder:
                new_alt_titles = [title_adder(lang, alt_title) for alt_title in alt_title_list]
                alt_title_list += list(filter(None, new_alt_titles))
            if title_modifier:
                alt_title_list[:] = [title_modifier(lang, t) for t in alt_title_list]
        # make unique
        alt_en_titles = list(set(alt_en_titles))
        alt_he_titles = list(set(alt_he_titles))
        term = self.create_term(en=en_title, he=he_title, context=context, alt_en=alt_en_titles, alt_he=alt_he_titles, ref_part_role=ref_part_role)
        if isinstance(obj, Term):
            self.old_term_map[obj.name] = term
        return term

    def create_numeric_perek_terms(self):
        from sefaria.utils.hebrew import encode_hebrew_numeral
        ord_en = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth', 'Twenty First', 'Twenty Second', 'Twenty Third', 'Twenty Fourth', 'Twenty Fifth', 'Twenty Sixth', 'Twenty Seventh', 'Twenty Eighth', 'Twenty Ninth', 'Thirtieth']
        ordinals = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'ששי', 'שביעי', 'שמיני', 'תשיעי', 'עשירי']
        cardinals = ['אחד', 'שניים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמנה', 'תשע', 'עשר', 'אחד עשרה', 'שניים עשרה', 'שלוש עשרה', 'ארבע עשרה', 'חמש עשרה', 'שש עשרה', 'שבע עשרה', 'שמונה עשרה', 'תשע עשרה', 'עשרים', 'עשרים ואחד', 'עשרים ושניים', 'עשרים ושלוש', 'עשרים וארבע', 'עשרים וחמש', 'עשרים ושש', 'עשרים ושבע', 'עשרים ושמונה', 'עשרים ותשע', 'שלושים']
        for i in range(1, 31):
            gemat = encode_hebrew_numeral(i, punctuation=False)
            gemat_punc = encode_hebrew_numeral(i)
            alt_he = [
                f'פ"{gemat}',
                f'רפ"{gemat}',
                f'ספ"{gemat}',
                gemat,
                gemat_punc,
                gemat_punc.replace("\u05F3", "'").replace("\u05F4", '"'),
                cardinals[i-1],
            ]
            alt_en = [
                str(i),
                ord_en[i-1].lower(),
            ]
            if i == 1:
                alt_he += [
                    'קמא',
                    'פ"ק',
                ]
            primary_he = ordinals[i-1] if i < len(ordinals) else cardinals[i-1]
            term = self.create_term(context="numeric perek", en=ord_en[i - 1], he=primary_he, alt_he=alt_he, alt_en=alt_en, ref_part_role='structural')
            self.num_to_perek_term_map[i] = term
        self.num_to_perek_term_map['last'] = self.create_term(context="numeric perek", en='last', he='בתרא', ref_part_role='structural')

    def create_base_non_unique_terms(self):
        self.create_term(context="base", en='Bavli', he='בבלי', alt_en=['Babylonian Talmud', 'B.T.', 'BT', 'Babli'], ref_part_role='structural')
        self.create_term(context="base", en="Gemara", he="גמרא", alt_he=["גמ'"], ref_part_role='structural')
        self.create_term(context="base", en="Tractate", he="מסכת", alt_en=['Masekhet', 'Masechet', 'Masekhes', 'Maseches'], ref_part_role='alt_title')
        self.create_term(context="base", en='Rashi', he='רש"י', alt_he=['פירש"י'], ref_part_role='structural')
        self.create_term(context="base", en='Mishnah', he='משנה', alt_en=['M.', 'M', 'Mishna', 'Mishnah', 'Mishnaiot'], ref_part_role='structural')
        self.create_term(context="base", en='Tosefta', he='תוספתא', alt_en=['Tosephta', 'T.', 'Tosef.', 'Tos.'], ref_part_role='structural')
        self.create_term(context="base", en='Yerushalmi', he='ירושלמי', alt_en=['Jerusalem Talmud', 'J.T.', 'JT'], ref_part_role='structural')
        self.create_term(context="base", en='Tosafot', he='תוספות', alt_he=["תוס'", 'תוד"ה', 'תד"ה', "תו'"], alt_en=['Tosaphot'], ref_part_role='structural')
        self.create_term(context="base", en='Gilyon HaShas', he='גליון הש"ס', ref_part_role='structural')
        self.create_term(context="base", en='Midrash Rabbah', he='מדרש רבה', alt_en=['Midrash Rabba', 'Midrash Rabah'], alt_he=['מדרש רבא'], ref_part_role='structural')  # TODO no good way to compose titles for midrash rabbah...
        self.create_term(context="base", en='Rabbah', he='רבה', alt_en=['Rabba', 'Rabah', 'Rab.', 'R.', 'Rab .', 'R .', 'rabba', 'r.', 'r .', 'rabbati'], alt_he=['רבא'], ref_part_role='structural')
        self.create_term(context="base", en='Ran', he='ר"ן', ref_part_role='structural')
        self.create_term(context="base", en='Perek', he='פרק', alt_en=["Pereq", 'Chapter'], alt_he=['ס"פ', 'ר"פ'], ref_part_role='alt_title')
        self.create_term(context="base", en='Parasha', he='פרשה', alt_he=["פרשת"], alt_en=['Parashah', 'Parašah', 'Parsha', 'Paraša', 'Paršetah', 'Paršeta', 'Parsheta', 'Parshetah', 'Parashat', 'Parshat'], ref_part_role='alt_title')
        self.create_term(context="base", en='Sefer', he='ספר', ref_part_role='alt_title')
        self.create_term(context="base", en='Halakha', he='הלכה', alt_en=['Halakhah', 'Halacha', 'Halachah', 'Halakhot'], ref_part_role='context_swap')
        self.create_term(context="base", en='Mishneh Torah', he='משנה תורה', alt_en=["Mishnah Torah"], ref_part_role='structural')
        self.create_term(context="base", en='Rambam', he='רמב"ם', ref_part_role='structural')
        self.create_term(context="base", en='Shulchan Arukh', he='שולחן ערוך', alt_en=['shulchan aruch', 'Shulchan Aruch', 'Shulḥan Arukh', 'Shulhan Arukh', 'S.A.', 'SA', 'Shulḥan Arukh'], alt_he=['שו"ע', 'שלחן ערוך'], ref_part_role='structural')
        self.create_term(context="base", en='Hilchot', he='הלכות', alt_en=['Laws of', 'Laws', 'Hilkhot', 'Hilhot'], alt_he=["הל'"], ref_part_role='alt_title')
        self.create_term_from_titled_obj(Term().load({"name": "Parasha"}), context="base", ref_part_role='alt_title')
        for old_term in TermSet({"scheme": {"$in": ["toc_categories", "commentary_works"]}}):
            new_term = self.create_term_from_titled_obj(old_term, context="base", ref_part_role='structural')
            self.old_term_map[old_term.name] = new_term
        missing_old_term_names = [
            "Lechem Mishneh", "Mishneh LaMelech", "Melekhet Shelomoh", "Targum Jonathan", "Onkelos", "Targum Neofiti",
            "Targum Jerusalem", "Tafsir Rasag", "Kitzur Baal HaTurim", "Rav Hirsch", "Pitchei Teshuva",
            "Chatam Sofer", "Rabbi Akiva Eiger", "Dagul MeRevava", "Yad Ephraim", "Kereti", "Peleti", "Chiddushei Hilkhot Niddah",
            "Tiferet Yisrael"
        ]
        for name in missing_old_term_names:
            new_term = self.create_term_from_titled_obj(Term().load({"name": name}), context="base", ref_part_role='structural')
            self.old_term_map[name] = new_term

    def create_shas_terms(self):
        """
        create generic shas terms that can be reused for mishnah, tosefta, bavli and yerushalmi
        """
        hard_coded_title_map = {
            "Avodah Zarah": ["Avodah zarah", "ˋAvodah zarah"],
            "Beitzah": ["Yom Tov", "Besah", "Beẓah", "Bezah"],
            "Berakhot": ["Berkahot"],
            "Bava Batra": ["Bava batra", "Baba batra", "Bava bathra"],
            "Bava Kamma": ["Bava kamma", "Bava kama", "Baba kamma", "Baba kama", "Bava qama", "Baba qama", "Bava Qama", "Baba Qama", "Bava qamma", "Bava Qamma"],
            "Bava Metzia": ["Bava mesi`a", "Baba Mesi‘a", "Baba mesi`a", "Bava Mesi‘a", "Bava mesi‘a", "Bava mesiaˋ", "Baba meẓi‘a"],
            "Chullin": ["Hulin"],
            "Demai": ["Demay"],
            "Eduyot": ["Idiut"],
            "Horayot": ["Horaiot"],
            "Kelim Batra": ["Kelim Baba Batra", "Kelim Baba batra", "Kelim Bava batra", "Kelim Bava bathra"],
            "Kelim Kamma": ["Kelim Bava qamma", "Kelim Baba qamma", "Kelim Bava qama"],
            "Kelim Metzia": ["Kelim Bava meṣiaˋ", "Kelim mesi`a", "Kelim Bava Meṣiaˋ"],
            "Kiddushin": ["Qiddušin", "Qiddusin"],
            "Keritut": ["Kritut", "Kritot", "Keritot"],
            "Kilayim": ["Kilaim", "Kil’aim", "Kil`aim"],
            "Maaserot": ["Maserot", "Maˋserot", "Maasrot", "Maˋsrot"],
            "Makhshirin": ["Makhširin"],
            "Makkot": ["Makkot", "Makot"],
            "Meilah": ["Me‘ilah", "Meˋilah"],
            "Menachot": ["Menaḥot"],
            "Mikvaot": ["Miqwaot", "Miqwa’ot", "Miqwaˋot"],
            "Moed Katan": ["Mo‘ed qatan", "Mo‘ed Qatan", "Moˋed qatan", "Moˋed Qatan", "Moëd qaṭan", "Mašqin", "Masqin"],
            "Nedarim": ["N'edarim", "Nˋedarim"],
            "Negaim": ["Negaˋim"],
            "Oholot": ["Ahilut", "Ahilot"],
            "Oktzin": ["Uqeẓin", "Uqezin", "Uqesin"],
            "Pesachim": ["Pisha", "Psachim", "Pesachim", "Pesaḥim"],
            "Rosh Hashanah": ["Roš Haššanah", "Rosh Haššanah"],
            "Shabbat": ["Šabbat", "Sabbat"],
            "Shekalim": ["Šeqalim"],
            "Sheviit": ["Ševi‘it", "Ševiˋit"],
            "Shevuot": ["Šebuot", "Ševuˋot", "Ševu‘ot", "Šebuot", "Ševuot"],
            "Taanit": ["Ta ˋ anit", "Taˋanit", "Ta‘anit", "Taˋaniot", "Taäniot", "Taänit"],
            "Yadayim": ["Yadaim"],
            "Yevamot": ["Yebamot", "Jebamot", "Jebamoth"],
            "Yoma": ["Kippurim"],
            "Zevachim": ["Zevahim", "Zebahim"],
        }
        title_map = defaultdict(set)
        repls = ['M.', 'M', 'Mishna', 'Mishnah', 'משנה', 'Masechet', 'Masekhet', 'משנה מסכת', 'Tractate', 'Talmud', 'BT', 'T.B.', 'Maseches', 'Tosefta', 'T.', 'Tos.', 'Tosef.']
        repl_reg = fr'^({"|".join(re.escape(r) for r in repls)}) '

        # MISHNAH
        indexes = library.get_indexes_in_category("Mishnah", full_records=True)
        for index in indexes:
            title_map[(index.title.replace('Mishnah ', ''), index.get_title('he').replace('משנה ', ''))] |= {re.sub(r'<[^>]+>', '', re.sub(repl_reg, '', tit['text'])) for tit in index.nodes.title_group.titles}

        # TALMUD
        minor_tractates = {title for title in library.get_indexes_in_category("Minor Tractates")}
        indexes = library.get_indexes_in_category("Bavli", full_records=True)
        for index in tqdm(indexes, desc='talmud', total=indexes.count()):
            if index.title in minor_tractates: continue
            title_map[(index.title, index.get_title('he'))] |= {re.sub(r'<[^>]+>', '', re.sub(repl_reg, '', tit['text'])) for tit in index.nodes.title_group.titles}

        # SOME STRAGGLERS FROM TOSEFTA
        for title in ['Tosefta Kelim Kamma', 'Tosefta Kelim Metzia', 'Tosefta Kelim Batra']:
            index = library.get_index(title)
            title_map[(index.title.replace('Tosefta ', ''), index.get_title('he').replace('תוספתא ', ''))] |= {re.sub(r'<[^>]+>', '', re.sub(repl_reg, '', tit['text'])) for tit in index.nodes.title_group.titles}
        title_term_map = {}
        for (generic_title_en, generic_title_he), alt_titles in sorted(title_map.items(), key=lambda x: x[0]):
            alt_he = [tit for tit in alt_titles if is_hebrew(tit) and tit != generic_title_he]
            alt_en = [tit for tit in alt_titles if not is_hebrew(tit) and tit != generic_title_en]
            alt_en += hard_coded_title_map.get(generic_title_en, [])
            term = self.create_term(context="shas", en=generic_title_en, he=generic_title_he, alt_en=alt_en, alt_he=alt_he, ref_part_role='structural')
            title_term_map[generic_title_en] = term
        return title_term_map

    def create_tanakh_terms(self):
        hard_coded_tanakh_map = {
            "Ezekiel": ["Ezechiel"],
            "I Samuel": ["1S."],
            "II Samuel": ["2S."],
            "I Kings": ["1K.", "1Kings"],
            "II Kings": ["2K.", "2Kings"],
            "Zechariah": ["Sach."],
            "I Chronicles": ["1Chr."],
            "II Chronicles": ["2Chr."],
            "Lamentations": ["Thr.", "Threni", "Lament.", "Ekha"],
            "Zephaniah": ["Soph."],
            "Ruth": ["Ru."],
            "Song of Songs": ["Cant."],
            "Psalms": ["Pss."],
            "Deuteronomy": ["D eut."],
            "Ecclesiastes": ["Qohelet"],
            "Malachi": ["Maleachi"],
        }
        hard_coded_parsha_map = {
            "Metzora": ["Mesora‘", "Mesora"],
            "Kedoshim": ["Qedošim"],
            "Vayikra": ["Wayyiqra"],
            "Bechukotai": ["Behuqqotai"],
            "Tazria": ["Tazria‘", "Tazria`"],
            "Tzav": ["Saw"],
            "Achrei Mot": ["Ahare", "Aḥare Mot", "Ahare Mot"],
            "Nitzavim": ["ניצבים"],
            "Sh'lach": ["שלח לך"],
        }

        def tanakh_title_adder(lang, title):
            if re.search(r'\.$', title) is not None:
                return re.sub(r'\.$', ' .', title)

        parsha_title_term = NonUniqueTerm.init('parasha')
        parsha_title_regex = "|".join(re.escape(title['text']) for title in parsha_title_term.titles)
        def parsha_title_modifier(lang, title):
            nonlocal parsha_title_regex
            return re.sub(fr"(?:{parsha_title_regex}) ", '', title)

        indexes = library.get_indexes_in_corpus("Tanakh", full_records=True)
        for index in tqdm(indexes, desc='tanakh', total=indexes.count()):
            hard_coded_alt_titles = hard_coded_tanakh_map.get(index.title)
            self.create_term_from_titled_obj(index.nodes, "structural", "tanakh", hard_coded_alt_titles, title_adder=tanakh_title_adder)

        for term in TermSet({"scheme": "Parasha"}):
            hard_coded_alt_titles = hard_coded_parsha_map.get(term.name)
            self.create_term_from_titled_obj(term, "structural", "tanakh", hard_coded_alt_titles, title_adder=tanakh_title_adder, title_modifier=parsha_title_modifier)

    def create_mt_terms(self):
        hard_coded_title_map = {}

        repls = ['Mishneh Torah,', 'Rambam,', 'רמב"ם,', 'משנה תורה,', 'רמב"ם', 'משנה תורה', 'רמב”ם,', 'רמב”ם', 'רמב״ם', 'רמב״ם,']
        hil_repls = ['Hilchot', 'Hilkhot', 'Laws of', 'הלכות', "הל'"]
        repl_reg = fr'^(({"|".join(re.escape(r) for r in repls)}) )?(({"|".join(re.escape(r) for r in hil_repls)}) )?'

        def title_modifier(lang, title):
            nonlocal repl_reg
            title = re.sub(r'<[^>]+>', '', title)
            title = re.sub(repl_reg, '', title)
            return title

        indexes = library.get_indexes_in_category("Mishneh Torah", full_records=True)
        for index in indexes:
            temp_alt_titles = hard_coded_title_map.get(index.title)
            self.create_term_from_titled_obj(index.nodes, 'structural', "mishneh torah", temp_alt_titles, title_modifier=title_modifier)

    def create_sa_terms(self):
        hard_coded_title_map = {

        }
        repls = ['shulchan aruch', 'Shulchan Aruch', 'Shulchan Arukh', 'Shulḥan Arukh', 'Shulhan Arukh', 'S.A.', 'SA', 'שולחן ערוך', 'שו"ע', 'שלחן ערוך', 'שו”ע', 'שו״ע', 'Shulḥan Arukh']
        repl_reg = fr'^({"|".join(re.escape(r) for r in repls)}),? ?'

        def title_modifier(lang, title):
            nonlocal repl_reg
            title = re.sub(r'<[^>]+>', '', title)
            title = re.sub(repl_reg, '', title)
            title = title.replace('סי\'', '').strip()
            return title

        indexes = library.get_indexes_in_category("Shulchan Arukh", full_records=True)
        for index in indexes:
            temp_alt_titles = hard_coded_title_map.get(index.title)
            self.create_term_from_titled_obj(index.nodes, 'structural', "shulchan arukh", temp_alt_titles, title_modifier=title_modifier)


def get_reusable_components() -> ReusableTermManager:
    """
    Static method to build up datastructures that are necessary for every run of LinkerIndexConverter
    @return:
    """
    NonUniqueTermSet().delete()  # reset non unique terms collection
    reusable_term_manager = ReusableTermManager()
    reusable_term_manager.create_base_non_unique_terms()
    reusable_term_manager.create_numeric_perek_terms()
    reusable_term_manager.create_tanakh_terms()
    reusable_term_manager.create_shas_terms()
    reusable_term_manager.create_mt_terms()
    reusable_term_manager.create_sa_terms()
    return reusable_term_manager


class LinkerCategoryConverter:
    """
    Manager which handles converting all indexes in a category or corpus.
    """

    def __init__(self, title, is_corpus=False, **linker_index_converter_kwargs):
        index_getter = library.get_indexes_in_corpus if is_corpus else library.get_indexes_in_category
        self.titles = index_getter(title)
        self.linker_index_converter_kwargs = linker_index_converter_kwargs

    def convert(self):
        for title in self.titles:
            index_converter = LinkerIndexConverter(title, **self.linker_index_converter_kwargs)
            index_converter.convert()


class LinkerCommentaryConverter:
    
    def __init__(self, base_text_title, base_match_templates, **linker_index_converter_kwargs):
        self.titles = [index.title for index in IndexSet({"base_text_titles": base_text_title})]
        self.linker_index_converter_kwargs = linker_index_converter_kwargs
        self.linker_index_converter_kwargs['get_match_templates'] = self.get_match_templates
        self.base_match_templates = base_match_templates

    def get_match_templates(self, node, depth, isibling, num_siblings, is_alt_node):
        if is_alt_node: return
        title = node.get_primary_title('en')
        try:
            comm_term = RTM.get_term_by_old_term_name(node.collective_title)
        except KeyError:
            print(
                f"\nMissing commentary term for '{node.collective_title}' used on index '{title}'")
            return
        except AttributeError:
            print(f"No collective title for '{title}'")
            return
        match_templates = [template.clone() for template in self.base_match_templates]
        for template in match_templates:
            template.term_slugs = [comm_term.slug] + template.term_slugs
        return match_templates

    def convert(self):
        for title in self.titles:
            index_converter = LinkerIndexConverter(title, **self.linker_index_converter_kwargs)
            index_converter.convert()


class LinkerIndexConverter:

    def __init__(self, title, get_other_fields=None, get_match_templates=None, fast_unsafe_saving=True):
        """

        @param title: title of index to convert
        @param get_other_fields: function of form
            (node: SchemaNode, depth: int, isibling: int, num_siblings: int, is_alt_node: bool) -> dict.
            Returns a dict where keys are other fields to modify. These can be any valid key on `node`
            Some common examples are below. Many of them are documented at the top of this file.
                - isSegmentLevelDiburHamatchil
                - referenceableSections
                - diburHamatchilRegexes
                - numeric_equivalent
                - ref_resolver_context_swaps
            Can return None for any of these
            See top of file for documentation for these fields
        @param get_match_templates: function of form
            (node: SchemaNode, depth: int, isibling: int, num_siblings: int, is_alt_node: bool) -> List[MatchTemplate].
        @param fast_unsafe_saving: If true, skip Python dependency checks and save directly to Mongo (much faster but potentially unsafe)
        """
        self.index = library.get_index(title)
        self.get_other_fields = get_other_fields
        self.get_match_templates = get_match_templates
        self.fast_unsafe_saving = fast_unsafe_saving

    @staticmethod
    def _traverse_nodes(node, callback, depth=0, isibling=0, num_siblings=0, is_alt_node=False, **kwargs):
        callback(node, depth, isibling, num_siblings, is_alt_node, **kwargs)
        [LinkerIndexConverter._traverse_nodes(child, callback, depth + 1, jsibling, len(node.children), is_alt_node, **kwargs) for (jsibling, child) in enumerate(node.children)]

    def _update_lengths(self):
        if self.index.is_complex(): return
        sn = StateNode(self.index.title)
        ac = sn.get_available_counts("he")
        self.index.nodes.lengths = ac[:]

    def convert(self):
        self._traverse_nodes(self.index.nodes, self.node_visitor, is_alt_node=False)
        alt_nodes = self.index.get_alt_struct_nodes()
        for inode, node in enumerate(alt_nodes):
            self.node_visitor(node, 1, inode, len(alt_nodes), True)
        self._update_lengths()  # update lengths for good measure
        self.save_index()

    def save_index(self):
        if self.fast_unsafe_saving:
            props = self.index._saveable_attrs()
            db.index.replace_one({"_id": self.index._id}, props, upsert=True)
        else:
            self.index.save()

    def node_visitor(self, node, depth, isibling, num_siblings, is_alt_node):
        if self.get_match_templates:
            templates = self.get_match_templates(node, depth, isibling, num_siblings, is_alt_node)
            if templates is not None:
                node.match_templates = [template.serialize() for template in templates]

        if self.get_other_fields:
            other_fields_dict = self.get_other_fields(node, depth, isibling, num_siblings, is_alt_node)
            if other_fields_dict is not None:
                for key, val in other_fields_dict.items():
                    if val is None: continue
                    setattr(node, key, val)


RTM = get_reusable_components()


class SpecificConverterManager:
    def convert_tanakh(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):

            sefer_slug = RTM.get_term_by_primary_title('base', 'Sefer').slug
            parasha_slug = RTM.get_term_by_primary_title('base', 'Parasha').slug
            title = node.get_primary_title('en')
            try:
                title_slug = RTM.get_term_by_primary_title('tanakh', title).slug
            except AttributeError:
                # Psalms alt struct node
                return []
            if is_alt_node and node.ref().index.categories[-1] == "Torah":
                return [
                    MatchTemplate([parasha_slug, title_slug], scope='any'),
                    MatchTemplate([title_slug], scope='any'),
                ]
            elif not is_alt_node:
                return [
                    MatchTemplate([sefer_slug, title_slug]),
                    MatchTemplate([title_slug]),
                ]
            else:
                return []
        converter = LinkerCategoryConverter("Tanakh", is_corpus=True, get_match_templates=get_match_templates)
        converter.convert()

    def convert_bavli(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):

            if is_alt_node:
                perek_slug = RTM.get_term_by_primary_title('base', 'Perek').slug  # TODO english titles are 'Chapter N'. Is that an issue?
                perek_term = RTM.create_term_from_titled_obj(node, 'structural', 'shas perek')
                is_last = isibling == num_siblings-1
                numeric_equivalent = min(isibling+1, 30)
                perek_num_term = RTM.get_perek_term_by_num(numeric_equivalent)
                last_perek_num_term = RTM.get_perek_term_by_num('last')
                match_templates = [
                    MatchTemplate([perek_slug, perek_term.slug], scope='any'),
                    MatchTemplate([perek_slug, perek_num_term.slug]),
                    MatchTemplate([perek_term.slug], scope='any'),
                    MatchTemplate([perek_num_term.slug])
                ]
                if is_last:
                    match_templates += [
                        MatchTemplate([perek_slug, last_perek_num_term.slug]),
                        MatchTemplate([last_perek_num_term.slug]),
                    ]
                return match_templates
            else:
                bavli_slug = RTM.get_term_by_primary_title('base', 'Bavli').slug
                gemara_slug = RTM.get_term_by_primary_title('base', 'Gemara').slug
                tractate_slug = RTM.get_term_by_primary_title('base', 'Tractate').slug
                title = node.get_primary_title('en')
                title_slug = RTM.get_term_by_primary_title('shas', title).slug
                return [
                    MatchTemplate([bavli_slug, title_slug]),
                    MatchTemplate([gemara_slug, title_slug]),
                    MatchTemplate([bavli_slug, tractate_slug, title_slug]),
                    MatchTemplate([gemara_slug, tractate_slug, title_slug]),
                    MatchTemplate([tractate_slug, title_slug]),
                    MatchTemplate([title_slug]),
                ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if is_alt_node:
                return {"numeric_equivalent": min(isibling + 1, 30)}

        converter = LinkerCategoryConverter("Bavli", is_corpus=True, get_match_templates=get_match_templates, get_other_fields=get_other_fields)
        converter.convert()

    def convert_rest_of_shas(self):
        title_swaps = {
            "Moed Kattan": "Moed Katan",
            "Oktsin": "Oktzin"
        }

        def get_generic_term(node):
            nonlocal title_swaps
            generic_title = re.sub(r"^(Mishnah|Tosefta|Jerusalem Talmud) ", "", node.get_primary_title('en'))
            generic_title = re.sub(r" \(Lieberman\)$", "", generic_title)
            generic_title = title_swaps.get(generic_title, generic_title)
            generic_term = RTM.get_term_by_primary_title('shas', generic_title)
            if not generic_term:
                print(generic_title)
            return generic_term

        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):

            if is_alt_node: return []
            cat = node.index.categories[0]
            base_term = RTM.get_term_by_primary_title('base', cat)
            tractate_slug = RTM.get_term_by_primary_title('base', 'Tractate').slug
            generic_term = get_generic_term(node)
            match_templates = [MatchTemplate([base_term.slug, generic_term.slug])]
            if cat == "Mishnah":
                match_templates += [
                    MatchTemplate([generic_term.slug]),
                    MatchTemplate([tractate_slug, generic_term.slug]),
                ]
            return match_templates

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if is_alt_node: return
            cat = node.index.categories[0]
            base_term = RTM.get_term_by_primary_title('base', cat)
            generic_term = get_generic_term(node)
            if cat == "Yerushalmi":
                return {
                    "addressTypes": ["Perek"] + node.addressTypes[1:],
                    "ref_resolver_context_swaps": [base_term.slug, generic_term.slug],
                    "referenceableSections": [True, True, False]
                }

        for corpus in ("Mishnah", "Tosefta", "Yerushalmi"):
            is_corpus = corpus != "Tosefta"
            converter = LinkerCategoryConverter(corpus, is_corpus=is_corpus, get_match_templates=get_match_templates, get_other_fields=get_other_fields)
            converter.convert()

    def convert_sifra(self):
        parsha_map = {
            "Shemini": "Shmini",
            "Acharei Mot": "Achrei Mot",
        }
        other_node_map = {
            'Sifra': [],
            "Braita d'Rabbi Yishmael": ["Introduction"],
            "Vayikra Dibbura d'Nedavah": ["Wayyiqra 1", "Wayyiqra I"],
            "Vayikra Dibbura d'Chovah": ["Wayyiqra 2", "Wayyiqra II"],
            "Tazria Parashat Yoledet": [],
            "Tazria Parashat Nega'im": [],
            "Metzora Parashat Zavim": [],
        }
        other_perek_node_map = {
            "Mechilta d'Miluim": [],
        }

        def get_match_templates(node, *args):

            title = node.get_primary_title('en')
            parsha_title = parsha_map.get(title, title)
            parsha_term = RTM.get_term_by_primary_title('tanakh', parsha_title)
            if parsha_term:
                return [MatchTemplate([parsha_term.slug])]
            elif title in other_node_map:
                alt_titles = other_node_map[title]
                term = RTM.create_term_from_titled_obj(node, 'structural', new_alt_titles=alt_titles)
                return [MatchTemplate([term.slug])]
            else:
                # second level node
                named_term_slug = None
                if 'Chapter' in title:
                    named_term_slug = RTM.get_term_by_primary_title('base', 'Perek').slug
                elif 'Section' in title:
                    named_term_slug = RTM.get_term_by_primary_title('base', 'Parasha').slug
                if named_term_slug is None:
                    alt_titles = other_perek_node_map[re.search(r'^(.+) \d+$', title).group(1)]
                    named_term = RTM.create_term_from_titled_obj(node, 'structural', new_alt_titles=alt_titles)
                    named_term_slug = named_term.slug
                num_match = re.search(' (\d+)$', title)
                if num_match is None:
                    print(node.ref(), 'no num_match for Sifra')
                    return []
                numeric_equivalent = int(num_match.group(1))
                num_term = RTM.get_perek_term_by_num(numeric_equivalent)  # NOTE: these terms can be used for both parsha and perek nodes b/c they only contain a "פ" prefix.
                node.numeric_equivalent = numeric_equivalent

                return [
                    MatchTemplate([named_term_slug, num_term.slug]),
                    MatchTemplate([num_term.slug])
                ]

        def get_other_fields(node, depth, *args):
            if depth != 2: return
            title = node.get_primary_title('en')
            num_match = re.search(' (\d+)$', title)
            if num_match is None:
                print(node.ref(), 'no num_match for Sifra')
                return
            return {"numeric_equivalent": int(num_match.group(1))}

        converter = LinkerIndexConverter("Sifra", get_match_templates=get_match_templates, get_other_fields=get_other_fields)
        converter.convert()

    def convert_midrash_rabbah(self):
        tanakh_title_map = {
            "Bereishit": "Genesis",
            "Shemot": "Exodus",
            "Vayikra": "Leviticus",
            "Bamidbar": "Numbers",
            "Devarim": "Deuteronomy",
            "Eichah": "Lamentations",
            "Kohelet": "Ecclesiastes",
            "Shir HaShirim": "Song of Songs",
        }

        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            nonlocal tanakh_title_map
            if node.is_default(): return []
            rabbah_slug = RTM.get_term_by_primary_title('base', 'Rabbah').slug
            mid_rab_slug =  RTM.get_term_by_primary_title('base', 'Midrash Rabbah').slug
            title = node.get_primary_title('en')
            tanakh_title = title.replace(" Rabbah", "")
            tanakh_title = tanakh_title_map.get(tanakh_title, tanakh_title)
            try:
                tanakh_slug = RTM.get_term_by_primary_title('tanakh', tanakh_title).slug
            except:
                # Petichta
                term = RTM.get_term_by_primary_title('midrash rabbah', title)
                if not term:
                    # create it
                    term = RTM.create_term_from_titled_obj(node, 'structural', context='midrash rabbah')
                return [MatchTemplate([term.slug])]
            return [
                MatchTemplate([tanakh_slug, rabbah_slug]),
                MatchTemplate([mid_rab_slug, tanakh_slug]),
            ]
        converter = LinkerCategoryConverter("Midrash Rabbah", get_match_templates=get_match_templates)
        converter.convert()

    def convert_mishneh_torah(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):

            title = node.get_primary_title('en')
            term_key = title.replace("Mishneh Torah, ", "")
            mt_slug = RTM.get_term_by_primary_title('base', 'Mishneh Torah').slug
            ram_slug = RTM.get_term_by_primary_title('base', 'Rambam').slug
            hilchot_slug = RTM.get_term_by_primary_title('base', 'Hilchot').slug
            try:
                title_slug = RTM.get_term_by_primary_title('mishneh torah', term_key).slug
            except:
                print(term_key)
                return []
            return [
                MatchTemplate([mt_slug, hilchot_slug, title_slug]),
                MatchTemplate([mt_slug, title_slug]),
                MatchTemplate([ram_slug, hilchot_slug, title_slug]),
                MatchTemplate([ram_slug, title_slug]),
                MatchTemplate([hilchot_slug, title_slug]),
            ]
        converter = LinkerCategoryConverter("Mishneh Torah", get_match_templates=get_match_templates)
        converter.convert()

    def convert_tur(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):

            sa_title_swaps = {
                "Orach Chaim": "Orach Chayim",
                "Yoreh Deah": "Yoreh De'ah"
            }
            title = node.get_primary_title('en')
            if depth == 1:
                title_slug = RTM.create_term_from_titled_obj(node, 'structural', 'tur').slug
            else:
                title = sa_title_swaps.get(title, title)
                title_slug = RTM.get_term_by_primary_title('shulchan arukh', title).slug
            return [MatchTemplate([title_slug])]
        converter = LinkerIndexConverter('Tur', get_match_templates=get_match_templates)
        converter.convert()

    def convert_shulchan_arukh(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if is_alt_node: return []
            title = node.get_primary_title('en')
            sa_slug = RTM.get_term_by_primary_title('base', 'Shulchan Arukh').slug
            term_key = title.replace("Shulchan Arukh, ", "")
            try:
                title_slug = RTM.get_term_by_primary_title('shulchan arukh', term_key).slug
            except:
                title_slug = RTM.create_term_from_titled_obj(node, 'structural', 'shulchan arukh').slug
                return [MatchTemplate([title_slug])]
            return [
                MatchTemplate([sa_slug, title_slug]),
                MatchTemplate([title_slug])
            ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):

            if is_alt_node: return
            if depth == 2 and node.is_default():
                # for some reason this one was missed in a previous pass
                new_addr_types = node.addressTypes[:]
                new_addr_types[1] = "Seif"
                return {"addressTypes": new_addr_types}
        converter = LinkerCategoryConverter('Shulchan Arukh', get_match_templates=get_match_templates, get_other_fields=get_other_fields)
        converter.convert()


if __name__ == '__main__':
    converter_manager = SpecificConverterManager()
    converter_manager.convert_tanakh()
    converter_manager.convert_bavli()
    converter_manager.convert_rest_of_shas()
    converter_manager.convert_sifra()
    converter_manager.convert_midrash_rabbah()
    converter_manager.convert_mishneh_torah()
    converter_manager.convert_shulchan_arukh()


"""
Still TODO
- base commentaries for
    MT
    Tanakh
    Bavli
    SA
"""

