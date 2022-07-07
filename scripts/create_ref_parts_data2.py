import django, re
django.setup()
from tqdm import tqdm
from sefaria.model import *
from sefaria.system.database import db
from collections import defaultdict
from sefaria.utils.hebrew import is_hebrew
from sefaria.model.abstract import AbstractMongoRecord
from sefaria.model.schema import DiburHamatchilNode, DiburHamatchilNodeSet, TitleGroup

"""
Strategy
- For each node can potentially define
    - match_templates
        - do we need a new term?
            - does this term need special-cased alt titles?
            - pass in dict mapping current primary titles to additional alt titles needed
        - is title an existing term? (e.g. parsha)
            - there are some reusable nodes that come up often.
                should be able to use mapping of sharedTitle to term slug.
                can detect possible missing sharedTitles
                - parsha
                - tanakh book
                - talmud book
                - MT book
                - tur part (looks like this tends to not be sharedTitle)
                
        - can we break the current title into multiple parts?
            - do some of the parts already exist as terms?
            - most commonly [section name] [section number]
    - isSegmentLevelDiburHamatchil
    - referenceableSections
    - diburHamatchilRegexes
Also need to add alt structs, but that is potentially a different issue

"""


class ReusableTermManager:

    def __init__(self):
        self.primary_title_to_term = {}
        self.alt_title_to_term = {}
        self.old_term_map = {}

    def create_term(self, **kwargs):
        """

        @param kwargs:
            'en'
            'he'
            'alt_en'
            'alt_he'
            'ref_part_role'
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
        return term

    def create_term_from_titled_obj(self, obj, ref_part_role, new_alt_title_map=None, title_modifier=None, title_adder=None):
        new_alt_title_map = new_alt_title_map or {}
        title_group = obj if isinstance(obj, TitleGroup) else obj.title_group
        en_title = title_group.primary_title('en')
        he_title = title_group.primary_title('he')
        alt_en_titles = [title for title in title_group.all_titles('en') if title != en_title]
        alt_he_titles = [title for title in title_group.all_titles('he') if title != he_title]
        new_alt_titles = new_alt_title_map.get(en_title, [])
        for new_alt in new_alt_titles:
            if is_hebrew(new_alt):
                alt_he_titles += [new_alt]
            else:
                alt_en_titles += [new_alt]
        for alt_title_list, lang in zip((alt_en_titles, alt_he_titles), ('en', 'he')):
            for alt_title in alt_title_list:
                if title_adder:
                    new_alt = title_adder(lang, alt_title)
                    if new_alt:
                        alt_title_list += [new_alt]
            if title_modifier:
                alt_title_list[:] = [title_modifier(lang, t) for t in alt_title_list]
        return self.create_term(en=en_title, he=he_title, alt_en=alt_en_titles, alt_he=alt_he_titles, ref_part_role=ref_part_role)

    def create_numeric_perek_terms(self):
        from sefaria.utils.hebrew import encode_hebrew_numeral
        ord_en = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth', 'Twenty First', 'Twenty Second', 'Twenty Third', 'Twenty Fourth', 'Twenty Fifth', 'Twenty Sixth', 'Twenty Seventh', 'Twenty Eighth', 'Twenty Ninth', 'Thirtieth']
        ordinals = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'ששי', 'שביעי', 'שמיני', 'תשיעי', 'עשירי']
        cardinals = ['אחד', 'שניים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמנה', 'תשע', 'עשר', 'אחד עשרה', 'שניים עשרה', 'שלוש עשרה', 'ארבע עשרה', 'חמש עשרה', 'שש עשרה', 'שבע עשרה', 'שמונה עשרה', 'תשע עשרה', 'עשרים', 'עשרים ואחד', 'עשרים ושניים', 'עשרים ושלוש', 'עשרים וארבע', 'עשרים וחמש', 'עשרים ושש', 'עשרים ושבע', 'עשרים ושמונה', 'עשרים ותשע', 'שלושים']
        term_map = {}
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
            term = self.create_term(en=ord_en[i - 1], he=primary_he, alt_he=alt_he, alt_en=alt_en, ref_part_role='structural')
            term_map[i] = term
        term_map['last'] = self.create_term(en='last', he='בתרא', ref_part_role='structural')
        return term_map

    def create_base_non_unique_terms(self):
        NonUniqueTermSet().delete()

        self.create_term(en='Bavli', he='בבלי', alt_en=['Babylonian Talmud', 'B.T.', 'BT', 'Babli'], ref_part_role='structural')
        self.create_term(en="Gemara", he="גמרא", alt_he=["גמ'"], ref_part_role='structural')
        self.create_term(en="Tractate", he="מסכת", alt_en=['Masekhet', 'Masechet', 'Masekhes', 'Maseches'], ref_part_role='alt_title')
        self.create_term(en='Rashi', he='רש"י', alt_he=['פירש"י'], ref_part_role='structural')
        self.create_term(en='Mishnah', he='משנה', alt_en=['M.', 'M', 'Mishna', 'Mishnah', 'Mishnaiot'], ref_part_role='structural')
        self.create_term(en='Tosefta', he='תוספתא', alt_en=['Tosephta', 'T.', 'Tosef.', 'Tos.'], ref_part_role='structural')
        self.create_term(en='Yerushalmi', he='ירושלמי', alt_en=['Jerusalem Talmud', 'J.T.', 'JT'], ref_part_role='structural')
        self.create_term(en='Tosafot', he='תוספות', alt_he=["תוס'", 'תוד"ה', 'תד"ה', "תו'"], alt_en=['Tosaphot'], ref_part_role='structural')
        self.create_term(en='Gilyon HaShas', he='גליון הש"ס', ref_part_role='structural')
        self.create_term(en='Midrash Rabbah', he='מדרש רבה', alt_en=['Midrash Rabba', 'Midrash Rabah'], alt_he=['מדרש רבא'], ref_part_role='structural')  # TODO no good way to compose titles for midrash rabbah...
        self.create_term(en='Rabbah', he='רבה', alt_en=['Rabba', 'Rabah', 'Rab.', 'R.', 'Rab .', 'R .', 'rabba', 'r.', 'r .', 'rabbati'], alt_he=['רבא'], ref_part_role='structural')
        self.create_term(en='Sifra', he='סיפרא', alt_he=['ספרא'], ref_part_role='structural')
        self.create_term(en='Ran', he='ר"ן', ref_part_role='structural')
        self.create_term(en='Perek', he='פרק', alt_en=["Pereq", 'Chapter'], alt_he=['ס"פ', 'ר"פ'], ref_part_role='alt_title')
        self.create_term(en='Parasha', he='פרשה', alt_he=["פרשת"], alt_en=['Parashah', 'Parašah', 'Parsha', 'Paraša', 'Paršetah', 'Paršeta', 'Parsheta', 'Parshetah', 'Parashat', 'Parshat'], ref_part_role='alt_title')
        self.create_term(en='Sefer', he='ספר', ref_part_role='alt_title')
        self.create_term(en='Halakha', he='הלכה', alt_en=['Halakhah', 'Halacha', 'Halachah', 'Halakhot'], ref_part_role='context_swap')
        self.create_term(en='Mishneh Torah', he='משנה תורה', alt_en=["Mishnah Torah"], ref_part_role='structural')
        self.create_term(en='Rambam', he='רמב"ם', ref_part_role='structural')
        self.create_term(en='Shulchan Arukh', he='שולחן ערוך', alt_en=['shulchan aruch', 'Shulchan Aruch', 'Shulḥan Arukh', 'Shulhan Arukh', 'S.A.', 'SA', 'Shulḥan Arukh'], alt_he=['שו"ע', 'שלחן ערוך'], ref_part_role='structural')
        self.create_term(en='Hilchot', he='הלכות', alt_en=['Laws of', 'Laws', 'Hilkhot', 'Hilhot'], alt_he=["הל'"], ref_part_role='alt_title')
        self.create_term_from_titled_obj(Term().load({"name": "Parasha"}), ref_part_role='alt_title')
        for old_term in TermSet({"scheme": {"$in": ["toc_categories", "commentary_works"]}}):
            new_term = self.create_term_from_titled_obj(old_term, ref_part_role='structural')
            self.old_term_map[old_term.name] = new_term
        missing_old_term_names = [
            "Lechem Mishneh", "Mishneh LaMelech", "Melekhet Shelomoh", "Targum Jonathan", "Onkelos", "Targum Neofiti",
            "Targum Jerusalem", "Tafsir Rasag", "Kitzur Baal HaTurim", "Rav Hirsch", "Pitchei Teshuva",
            "Chatam Sofer", "Rabbi Akiva Eiger", "Dagul MeRevava", "Yad Ephraim", "Kereti", "Peleti", "Chiddushei Hilkhot Niddah",
            "Tiferet Yisrael"
        ]
        for name in missing_old_term_names:
            new_term = self.create_term_from_titled_obj(Term().load({"name": name}), ref_part_role='structural')
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
            term = self.create_term(en=generic_title_en, he=generic_title_he, alt_en=alt_en, alt_he=alt_he, ref_part_role='structural')
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
        tanakh_term_map = {}
        parsha_term_map = {}
        for index in tqdm(indexes, desc='tanakh', total=indexes.count()):
            self.create_term_from_titled_obj(index.nodes, "structural", hard_coded_tanakh_map, title_adder=tanakh_title_adder)

        for term in TermSet({"scheme": "Parasha"}):
            self.create_term_from_titled_obj(term, "structural", hard_coded_parsha_map, title_adder=tanakh_title_adder, title_modifier=parsha_title_modifier)
        return tanakh_term_map, parsha_term_map

    def create_mt_terms(self):
        hard_coded_title_map = {

        }
        title_map = defaultdict(set)
        repls = ['Mishneh Torah,', 'Rambam,', 'רמב"ם,', 'משנה תורה,', 'רמב"ם', 'משנה תורה', 'רמב”ם,', 'רמב”ם', 'רמב״ם', 'רמב״ם,']
        hil_repls = ['Hilchot', 'Hilkhot', 'Laws of', 'הלכות', "הל'"]
        repl_reg = fr'^(({"|".join(re.escape(r) for r in repls)}) )?(({"|".join(re.escape(r) for r in hil_repls)}) )?'

        indexes = library.get_indexes_in_category("Mishneh Torah", full_records=True)
        for index in indexes:
            en_primary = re.sub(repl_reg, '', index.title)
            he_primary = re.sub(repl_reg, '', index.get_title('he'))
            title_map[(en_primary, he_primary)] |= {
                re.sub(r'<[^>]+>', '', re.sub(repl_reg, '', tit['text'])) for tit in index.nodes.title_group.titles}

        title_term_map = {}
        for (generic_title_en, generic_title_he), alt_titles in sorted(title_map.items(), key=lambda x: x[0]):
            alt_he = [tit for tit in alt_titles if is_hebrew(tit) and tit != generic_title_he]
            alt_en = [tit for tit in alt_titles if not is_hebrew(tit) and tit != generic_title_en]
            alt_en += hard_coded_title_map.get(generic_title_en, [])
            term = self.create_term(en=generic_title_en, he=generic_title_he, alt_en=alt_en, alt_he=alt_he,
                                    ref_part_role='structural')
            title_term_map[generic_title_en] = term
        return title_term_map

    def create_sa_terms(self):
        hard_coded_title_map = {

        }
        title_map = defaultdict(set)
        repls = ['shulchan aruch', 'Shulchan Aruch', 'Shulchan Arukh', 'Shulḥan Arukh', 'Shulhan Arukh', 'S.A.', 'SA', 'שולחן ערוך', 'שו"ע', 'שלחן ערוך', 'שו”ע', 'שו״ע', 'Shulḥan Arukh']
        repl_reg = fr'^({"|".join(re.escape(r) for r in repls)}),? ?'

        indexes = library.get_indexes_in_category("Shulchan Arukh", full_records=True)
        for index in indexes:
            title_map[(index.title.replace('Shulchan Arukh, ', ''), index.get_title('he'))] |= {
                re.sub(r'<[^>]+>', '', re.sub(repl_reg, '', tit['text'])).replace('סי\'', '').strip() for tit in index.nodes.title_group.titles}

        title_term_map = {}
        for (generic_title_en, generic_title_he), alt_titles in sorted(title_map.items(), key=lambda x: x[0]):
            alt_he = [tit for tit in alt_titles if is_hebrew(tit) and tit != generic_title_he]
            alt_en = [tit for tit in alt_titles if not is_hebrew(tit) and tit != generic_title_en]
            alt_en += hard_coded_title_map.get(generic_title_en, [])
            term = self.create_term(en=generic_title_en, he=generic_title_he, alt_en=alt_en, alt_he=alt_he,
                                    ref_part_role='structural')
            title_term_map[generic_title_en] = term
        return title_term_map


def get_reusable_components():
    """
    Static method to build up datastructures that are necessary for every run of LinkerIndexConverter
    @return:
    """


class LinkerIndexConverter:

    def __init__(self, title, node_mutator, get_term_prefixes, title_alt_title_map, fast_unsafe_saving=False):
        """

        @param title: title of index to conver
        @param node_mutator: function of form (node: SchemaNode, depth: int) -> None. Can add any necessary fields to `node`
        @param get_term_prefixes: function of form (node: SchemaNode, depth: int) -> List[List[NonUniqueTerm]].
        @param title_alt_title_map: mapping from primary node title to list of strings which are new alt titles.
            If a node title exists in the mapping, a new term will be created from current alt titles + ones in mapping
        @param fast_unsafe_saving:
        """
        self.index = library.get_index(title)
        self.node_mutator = node_mutator
        self.fast_unsafe_saving = fast_unsafe_saving

    def convert(self):
        self.index.nodes.traverse_to_string(self.node_visitor)
        self.index.save()

    def save_index(self):
        if self.fast_unsafe_saving:
            props = self.index._saveable_attrs()
            db.index.replace_one({"_id": self.index._id}, props, upsert=True)
        else:
            self.index.save()

    def node_visitor(self, node, depth):
        self.node_mutator(node, depth)
        return ""


if __name__ == '__main__':
    converter = LinkerIndexConverter("Orot")
    converter.convert()
