import django
django.setup()

import re
from tqdm import tqdm
from sefaria.model import *
from sefaria.system.exceptions import InputError
from collections import defaultdict
from sefaria.utils.tibetan import has_tibetan
from sefaria.model.linker.match_template import MatchTemplate
from sefaria.model.schema import TitleGroup
from sefaria.utils.hebrew import encode_hebrew_numeral
from sefaria.helper.linker_index_converter import DiburHamatchilAdder, LinkerCategoryConverter, LinkerIndexConverter, ReusableTermManager


def get_ref_by_book_oref_and_sections(book_oref, sections, toSections=None):
    toSections = toSections or sections
    return Ref(_obj={
        "index": book_oref.index,
        "book": book_oref.normal(),
        "index_node": book_oref.index_node,
        "sections": sections,
        "toSections": toSections,
    })


class ReusableTermCreator():

    def __init__(self, reusable_term_manager: ReusableTermManager):
        self.RTM = reusable_term_manager

    def simple_get_commentary_term(self, collective_title):
        return self.RTM.get_term_by_old_term_name(collective_title)

    def create_numeric_perek_terms(self):
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
            term = self.RTM.create_term(context="numeric perek", en=ord_en[i - 1], he=primary_he, alt_he=alt_he, alt_en=alt_en)
            self.RTM.num_to_perek_term_map[i] = term
        self.RTM.num_to_perek_term_map['last'] = self.RTM.create_term(context="numeric perek", en='last', he='בתרא')

    def create_base_non_unique_terms(self):
        self.RTM.create_term(context="base", en='Bavli', he='בבלי', alt_en=['Babylonian Talmud', 'B.T.', 'BT', 'Babli'])
        self.RTM.create_term(context="base", en="Gemara", he="גמרא", alt_he=["גמ'"])
        self.RTM.create_term(context="base", en="Talmud", he="תלמוד")
        self.RTM.create_term(context="base", en="Tractate", he="מסכת", alt_en=['Masekhet', 'Masechet', 'Masekhes', 'Maseches'], alt_he=["מס'", "מס׳"])
        self.RTM.create_term(context="base", en='Rashi', he='רש"י', alt_he=['פירש"י'])
        self.RTM.create_term(context="base", en='Mishnah', he='משנה', alt_en=['M.', 'M', 'Mishna', 'Mishnah', 'Mishnaiot'])
        self.RTM.create_term(context="base", en='Tosefta', he='תוספתא', alt_en=['Tosephta', 'T.', 'Tosef.', 'Tos.'])
        self.RTM.create_term(context="base", en='Yerushalmi', he='ירושלמי', alt_en=['Jerusalem Talmud', 'J.T.', 'JT'])
        self.RTM.create_term(context="base", en='Tosafot', he='תוספות', alt_he=["תוס'", 'תוד"ה', 'תד"ה', "תו'"], alt_en=['Tosaphot'])
        self.RTM.create_term(context="base", en='Gilyon HaShas', he='גליון הש"ס')
        self.RTM.create_term(context="base", en='Midrash Rabbah', he='מדרש רבה', alt_en=['Midrash Rabba', 'Midrash Rabah'], alt_he=['מדרש רבא'])  # TODO no good way to compose titles for midrash rabbah...
        self.RTM.create_term(context="base", en='Midrash', he='מדרש')
        self.RTM.create_term(context="base", en='Rabbah', he='רבה', alt_en=['Rabba', 'Rabah', 'Rab.', 'R.', 'Rab .', 'R .', 'rabba', 'r.', 'r .', 'rabbati'], alt_he=['רבא'])
        self.RTM.create_term(context="base", en='Ran', he='ר"ן')
        self.RTM.create_term(context="base", en='Perek', he='פרק', alt_en=["Pereq", 'Chapter'], alt_he=['ס"פ', 'ר"פ'])
        self.RTM.create_term(context="base", en='Parasha', he='פרשה', alt_he=["פרשת"], alt_en=['Parshah', 'Parashah', 'Parašah', 'Parsha', 'Paraša', 'Paršetah', 'Paršeta', 'Parsheta', 'Parshetah', 'Parashat', 'Parshat'])
        self.RTM.create_term(context="base", en='Sefer', he='ספר')
        self.RTM.create_term(context="base", en='Halakha', he='הלכה', alt_en=['Halakhah', 'Halacha', 'Halachah', 'Halakhot'])
        self.RTM.create_term(context="base", en='Mishneh Torah', he='משנה תורה', alt_en=["Mishnah Torah"])
        self.RTM.create_term(context="base", en='Rambam', he='רמב"ם')
        self.RTM.create_term(context="base", en='Shulchan Arukh', he='שולחן ערוך', alt_en=['shulchan aruch', 'Shulchan Aruch', 'Shulḥan Arukh', 'Shulhan Arukh', 'S.A.', 'SA', 'Shulḥan Arukh'], alt_he=['שו"ע', 'שלחן ערוך'])
        self.RTM.create_term(context="base", en='Hilchot', he='הלכות', alt_en=['Laws of', 'Laws', 'Hilkhot', 'Hilhot'], alt_he=["הל'"])
        self.RTM.create_term(context='base', en='Zohar', he='זהר', alt_he=['זוהר', 'זוה"ק', 'זה"ק'])
        self.RTM.create_term(context='base', en='Introduction', he='הקדמה', alt_he=['מבוא'])
        for old_term in TermSet({"scheme": {"$in": ["toc_categories", "commentary_works"]}}):
            existing_term = self.RTM.get_term_by_primary_title('base', old_term.get_primary_title('en'))
            if existing_term is None:
                new_term = self.RTM.create_term_from_titled_obj(old_term, context="base")
            else:
                new_term = existing_term
            self.RTM.old_term_map[old_term.name] = new_term
        missing_old_term_names = [
            "Lechem Mishneh", "Mishneh LaMelech", "Melekhet Shelomoh", "Targum Jonathan", "Onkelos", "Targum Neofiti",
            "Targum Jerusalem", "Tafsir Rasag", "Kitzur Baal HaTurim", "Rav Hirsch", "Pitchei Teshuva",
            "Chatam Sofer", "Rabbi Akiva Eiger", "Dagul MeRevava", "Yad Ephraim", "Kereti", "Peleti", "Chiddushei Hilkhot Niddah",
            "Tiferet Yisrael"
        ]
        for name in missing_old_term_names:
            new_term = self.RTM.create_term_from_titled_obj(Term().load({"name": name}), context="base")
            self.RTM.old_term_map[name] = new_term

    @staticmethod
    def get_abbr_for_one_word_hebrew_name(name):
        if re.search('^[א-ת]*$', name):
            return [name[:x] + "'" for x in range(2, len(name))]
        return []

    def create_shas_terms(self):
        """
        create generic shas terms that can be reused for mishnah, tosefta, bavli and yerushalmi
        """
        hard_coded_title_map = {
            "Avodah Zarah": ["Avodah zarah", "ˋAvodah zarah"],
            "Beitzah": ["Yom Tov", "Besah", "Beẓah", "Bezah"],
            "Berakhot": ["Berkahot"],
            "Bava Batra": ["Bava batra", "Baba batra", "Bava bathra", "בבא-בתרא"],
            "Bava Kamma": ["Bava kamma", "Bava kama", "Baba kamma", "Baba kama", "Bava qama", "Baba qama", "Bava Qama", "Baba Qama", "Bava qamma", "Bava Qamma", "בבא-קמא"],
            "Bava Metzia": ["Bava mesi`a", "Baba Mesi‘a", "Baba mesi`a", "Bava Mesi‘a", "Bava mesi‘a", "Bava mesiaˋ", "Baba meẓi‘a", "בבא-מציעא"],
            "Chullin": ["Hulin"],
            "Demai": ["Demay"],
            "Eduyot": ["Idiut"],
            "Gittin": ["גטין"],
            "Horayot": ["Horaiot"],
            "Kelim Batra": ["Kelim Baba Batra", "Kelim Baba batra", "Kelim Bava batra", "Kelim Bava bathra"],
            "Kelim Kamma": ["Kelim Bava qamma", "Kelim Baba qamma", "Kelim Bava qama"],
            "Kelim Metzia": ["Kelim Bava meṣiaˋ", "Kelim mesi`a", "Kelim Bava Meṣiaˋ"],
            "Kiddushin": ["Qiddušin", "Qiddusin"],
            "Keritut": ["Kritut", "Kritot", "Keritot"],
            "Kilayim": ["Kilaim", "Kil’aim", "Kil`aim", "כלאיים"],
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
            alt_titles |= set(hard_coded_title_map.get(generic_title_en, []))
            alt_he = [tit for tit in alt_titles if has_tibetan(tit) and tit != generic_title_he]
            alt_he += [t for t in self.get_abbr_for_one_word_hebrew_name(generic_title_he) if t not in alt_he]
            alt_en = [tit for tit in alt_titles if not has_tibetan(tit) and tit != generic_title_en]
            term = self.RTM.create_term(context="shas", en=generic_title_en, he=generic_title_he, alt_en=alt_en, alt_he=alt_he)
            title_term_map[generic_title_en] = term
        return title_term_map

    def create_tanakh_terms(self):
        hard_coded_tanakh_map = {
            "Ezekiel": ["Ezechiel"],
            "I Samuel": ["1S.", "I-Samuel", "1-Samuel"],
            "II Samuel": ["2S.", "II-Samuel", "2-Samuel"],
            "I Kings": ["1K.", "1Kings"],
            "II Kings": ["2K.", "2Kings"],
            "Zechariah": ["Sach."],
            "I Chronicles": ["1Chr.", 'דבהי"א'],
            "II Chronicles": ["2Chr.", 'דבהי"ב'],
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
            "Achrei Mot": ["Ahare", "Aḥare Mot", "Ahare Mot"],
            "Bechukotai": ["Behuqqotai"],
            "Kedoshim": ["Qedošim"],
            "Metzora": ["Mesora‘", "Mesora"],
            "Nitzavim": ["ניצבים"],
            "Shemot": ["ואלה שמות", "אלה שמות"],
            "Sh'lach": ["שלח לך"],
            "Tazria": ["Tazria‘", "Tazria`"],
            "Tzav": ["Saw"],
            "Vayikra": ["Wayyiqra"],
            "Ki Teitzei": ["כי-תצא"],
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
            alt_titles = hard_coded_alt_titles if hard_coded_alt_titles else []
            alt_titles += [t for t in self.get_abbr_for_one_word_hebrew_name(index.get_title('he')) if t not in alt_titles]
            self.RTM.create_term_from_titled_obj(index.nodes, "tanakh", alt_titles, title_adder=tanakh_title_adder)

        for term in TermSet({"scheme": "Parasha"}):
            hard_coded_alt_titles = hard_coded_parsha_map.get(term.name)
            self.RTM.create_term_from_titled_obj(term, "tanakh", hard_coded_alt_titles, title_adder=tanakh_title_adder, title_modifier=parsha_title_modifier)

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
            self.RTM.create_term_from_titled_obj(index.nodes, "mishneh torah", temp_alt_titles, title_modifier=title_modifier)


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
            self.RTM.create_term_from_titled_obj(index.nodes, "shulchan arukh", temp_alt_titles, title_modifier=title_modifier)

    def create_all_terms(self):
        NonUniqueTermSet().delete()  # reset non unique terms collection
        self.create_base_non_unique_terms()
        self.create_numeric_perek_terms()
        self.create_tanakh_terms()
        self.create_shas_terms()
        self.create_mt_terms()
        self.create_sa_terms()


class SpecificConverterManager:

    def __init__(self):
        self.dibur_hamatchil_adder = DiburHamatchilAdder()

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

        def get_commentary_match_template_suffixes(base_index):
            title_slug = RTM.get_term_by_primary_title('tanakh', base_index.title).slug
            return [MatchTemplate([title_slug])]

        def get_commentary_other_fields(base_index, node, depth, isibling, num_siblings, is_alt_node):
            index =node.ref().index
            title_prefixes_with_intro_default_nodes = {"Ramban on "}
            if (node.is_root() and not index.is_complex()) or (any(index.title.startswith(prefix) for prefix in title_prefixes_with_intro_default_nodes) and node.is_default()):
                if len(node.addressTypes) == 3:
                    collective_title = getattr(index, 'collective_title', None)
                    dh_regexes = self.dibur_hamatchil_adder.get_dh_regexes(collective_title, "Tanakh")
                    if dh_regexes:
                        self.dibur_hamatchil_adder.add_index(node.index)
                    return {
                        "addressTypes": ["Perek", "Pasuk", "Integer"],
                        "isSegmentLevelDiburHamatchil": True,
                        "diburHamatchilRegexes": dh_regexes,
                    }
                elif index.categories[1] == "Targum" and len(node.addressTypes) == 2:
                    return {
                        "addressTypes": ["Perek", "Pasuk"],
                    }

        converter = LinkerCategoryConverter("Tanakh", is_corpus=True, get_match_templates=get_match_templates,
                                            get_commentary_match_template_suffixes=get_commentary_match_template_suffixes,
                                            get_commentary_term=reusable_term_creator.simple_get_commentary_term,
                                            get_commentary_other_fields=get_commentary_other_fields)
        converter.convert()

    def convert_bavli(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):

            if is_alt_node:
                perek_slug = RTM.get_term_by_primary_title('base', 'Perek').slug  # TODO english titles are 'Chapter N'. Is that an issue?
                perek_term = RTM.create_term_from_titled_obj(node, 'shas perek')
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
                talmud_slug = RTM.get_term_by_primary_title('base', 'Talmud').slug
                tractate_slug = RTM.get_term_by_primary_title('base', 'Tractate').slug
                title = node.get_primary_title('en')
                title_slug = RTM.get_term_by_primary_title('shas', title).slug
                return [
                    MatchTemplate([talmud_slug, bavli_slug, title_slug]),
                    MatchTemplate([talmud_slug, bavli_slug, tractate_slug, title_slug]),
                    MatchTemplate([talmud_slug, title_slug]),
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
            else:
                return {"referenceableSections": [True, False]}

        def get_commentary_match_template_suffixes(base_index):
            title_slug = RTM.get_term_by_primary_title('shas', base_index.title).slug
            return [MatchTemplate([title_slug])]

        def get_commentary_other_fields(base_index, node, depth, isibling, num_siblings, is_alt_node):
            nonlocal self
            if isinstance(node, JaggedArrayNode):
                # assuming second address is always "Line"
                referenceable_sections = [True, False, True] if node.depth == 3 else [True, True]
                collective_title = getattr(node.index, 'collective_title', None)
                dh_regexes = self.dibur_hamatchil_adder.get_dh_regexes(collective_title, "Bavli")
                if dh_regexes:
                    self.dibur_hamatchil_adder.add_index(node.index)
                return {
                    "isSegmentLevelDiburHamatchil": True,
                    "referenceableSections": referenceable_sections,
                    "diburHamatchilRegexes": dh_regexes,
                }

        def get_commentary_alt_structs(base_index, index):
            collective_title = getattr(index, 'collective_title', None)
            if collective_title not in {'Rashi', 'Tosafot'}:
                # TODO generalize to work with other commenatries
                # TODO main issue is figuring out the `wholeRef`
                return
            collective_slug = RTM.get_term_by_primary_title('base', collective_title).slug
            alt_struct = base_index.get_alt_structures()['Chapters'].copy()
            base_templates = []
            children_to_delete = []
            for perek_node in alt_struct.children:
                base_ref = Ref(perek_node.wholeRef)
                book_oref = Ref(f"{collective_title} on {base_index.title}")
                try:
                    perek_begin_ref = get_ref_by_book_oref_and_sections(book_oref, base_ref.sections[:])
                    try:
                        perek_end_ref = get_ref_by_book_oref_and_sections(book_oref, base_ref.toSections[:])
                    except Exception:
                        perek_end_ref = perek_begin_ref.last_segment_ref()
                    perek_ref = perek_begin_ref.to(perek_end_ref)
                except Exception as yoE:
                    print(f"Couldn't make perek ref '{collective_title} on {base_ref}'")
                    print(yoE)
                    children_to_delete += [perek_node]
                    continue
                perek_node.wholeRef = perek_ref.normal()

                perek_node.isSegmentLevelDiburHamatchil = True
                base_templates += [perek_node.match_templates[:]]
                alone_templates = []
                combined_templates = []
                for template in perek_node.match_templates:
                    # commentary alt struct nodes need to include commentary name and therefore need to be limited to "alone"
                    if template.get('scope') != 'any':
                        continue
                    temp_template = template.copy()
                    temp_template['term_slugs'] = [collective_slug] + template['term_slugs']
                    temp_template['scope'] = 'alone'
                    alone_templates += [temp_template]
                for template in perek_node.match_templates:
                    # remove 'any' scope which doesn't apply to commentary perakim
                    temp_template = template.copy()
                    try:
                        del temp_template['scope']
                    except KeyError:
                        pass
                    combined_templates += [temp_template]
                perek_node.match_templates = alone_templates + combined_templates
            for child in children_to_delete:
                alt_struct.children.remove(child)
            return {
                "Chapters": alt_struct,
            }
        converter = LinkerCategoryConverter("Bavli", is_corpus=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields,
                                            get_commentary_match_template_suffixes=get_commentary_match_template_suffixes,
                                            get_commentary_term=reusable_term_creator.simple_get_commentary_term,
                                            get_commentary_other_fields=get_commentary_other_fields,
                                            get_commentary_alt_structs=get_commentary_alt_structs)
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
            if cat == "Talmud":
                cat = node.index.categories[1]
            base_term = RTM.get_term_by_primary_title('base', cat)
            tractate_slug = RTM.get_term_by_primary_title('base', 'Tractate').slug
            generic_term = get_generic_term(node)
            match_templates = [MatchTemplate([base_term.slug, generic_term.slug])]
            if cat == "Mishnah":
                match_templates += [
                    MatchTemplate([generic_term.slug]),
                    MatchTemplate([tractate_slug, generic_term.slug]),
                ]
            elif cat == "Yerushalmi":
                talmud_slug = RTM.get_term_by_primary_title('base', 'Talmud').slug
                match_templates += [
                    MatchTemplate([base_term.slug, tractate_slug, generic_term.slug]),
                    MatchTemplate([talmud_slug, base_term.slug, tractate_slug, generic_term.slug]),
                    MatchTemplate([talmud_slug, base_term.slug, generic_term.slug]),
                ]
            return match_templates

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if is_alt_node: return
            cat = node.index.categories[0]
            if cat == "Talmud":
                cat = node.index.categories[1]
            base_term = RTM.get_term_by_primary_title('base', cat)
            generic_term = get_generic_term(node)
            if cat == "Yerushalmi":
                halakha_slug = RTM.get_term_by_primary_title('base', 'Halakha').slug
                return {
                    "addressTypes": ["Perek"] + node.addressTypes[1:],
                    "ref_resolver_context_swaps": {halakha_slug: [base_term.slug, generic_term.slug]},
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
                term = RTM.create_term_from_titled_obj(node, new_alt_titles=alt_titles)
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
                    named_term = RTM.create_term_from_titled_obj(node, new_alt_titles=alt_titles)
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
            mid_slug = RTM.get_term_by_primary_title('base', 'Midrash').slug
            mid_rab_slug = RTM.get_term_by_primary_title('base', 'Midrash Rabbah').slug
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
                    term = RTM.create_term_from_titled_obj(node, context='midrash rabbah')
                return [MatchTemplate([term.slug])]
            return [
                MatchTemplate([tanakh_slug, rabbah_slug]),
                MatchTemplate([mid_slug, tanakh_slug, rabbah_slug]),
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

        def get_commentary_match_template_suffixes(base_index):
            hilchot_slug = RTM.get_term_by_primary_title('base', 'Hilchot').slug
            term_key = base_index.title.replace("Mishneh Torah, ", "")
            title_slug = RTM.get_term_by_primary_title('mishneh torah', term_key).slug
            return [
                MatchTemplate([hilchot_slug, title_slug]),
                MatchTemplate([title_slug]),
            ]
        converter = LinkerCategoryConverter("Mishneh Torah", get_match_templates=get_match_templates,
                                            get_commentary_match_template_suffixes=get_commentary_match_template_suffixes,
                                            get_commentary_term=reusable_term_creator.simple_get_commentary_term)
        converter.convert()

    def convert_tur(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if is_alt_node:
                title_slug = RTM.create_term_from_titled_obj(node, 'shulchan arukh').slug
                return [MatchTemplate([title_slug])]
            sa_title_swaps = {
                "Orach Chaim": "Orach Chayim",
                "Yoreh Deah": "Yoreh De'ah"
            }
            title = node.get_primary_title('en')
            if node.is_root():
                title_slug = RTM.create_term_from_titled_obj(node, 'tur').slug
            elif not node.is_default():
                title = sa_title_swaps.get(title, title)
                if title == "Introduction":
                    title_term = RTM.get_term_by_primary_title('base', title)
                else:
                    title_term = RTM.get_term_by_primary_title('shulchan arukh', title)
                if title_term is None:
                    title_slug = RTM.create_term_from_titled_obj(node, 'tur').slug
                else:
                    title_slug = title_term.slug
            else:
                title_slug = None
            if title_slug:
                return [MatchTemplate([title_slug])]
        converter = LinkerIndexConverter('Tur', get_match_templates=get_match_templates)
        converter.convert()

    def convert_shulchan_arukh(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if is_alt_node or node.is_default(): return
            title = node.get_primary_title('en')
            sa_slug = RTM.get_term_by_primary_title('base', 'Shulchan Arukh').slug
            term_key = title.replace("Shulchan Arukh, ", "")
            try:
                title_slug = RTM.get_term_by_primary_title('shulchan arukh', term_key).slug
            except:
                title_slug = RTM.create_term_from_titled_obj(node, 'shulchan arukh').slug
                return [MatchTemplate([title_slug])]
            return [
                MatchTemplate([sa_slug, title_slug]),
                MatchTemplate([title_slug])
            ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):

            if is_alt_node: return
            if depth == 1 and node.is_default():
                # for some reason this one was missed in a previous pass
                new_addr_types = node.addressTypes[:]
                new_addr_types[1] = "Seif"
                return {"addressTypes": new_addr_types}

        def get_commentary_match_template_suffixes(index):
            term_key = index.title.replace("Shulchan Arukh, ", "")
            title_slug = RTM.get_term_by_primary_title('shulchan arukh', term_key).slug
            return [
                MatchTemplate([title_slug]),
            ]
        converter = LinkerCategoryConverter('Shulchan Arukh', get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields,
                                            get_commentary_match_template_suffixes=get_commentary_match_template_suffixes,
                                            get_commentary_term=reusable_term_creator.simple_get_commentary_term)
        converter.convert()

    def convert_zohar(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            sefer_slug = RTM.get_term_by_primary_title('base', 'Sefer').slug
            parasha_slug = RTM.get_term_by_primary_title('base', 'Parasha').slug
            title_slug = RTM.get_term_by_primary_title('base', 'Zohar').slug
            if is_alt_node and node.ref().normal().startswith('Zohar 1:1a'):
                return #i'm not sure how to handle this
            elif is_alt_node: #TODO - we need to change the code to catch the daf after parashah
                title = node.get_primary_title('en')
                if title == 'Haman':
                    title = 'Beshalach' #I didn't find direct references to parashat haman in the literature
                if title == 'HaIdra Zuta Kadisha':
                    title_slug = RTM.create_term(en='Idra Zuta', alt_en=['HaIdra zuta'], he='אדרא זוטא', alt_he=['אידרא זוטא', 'אד"ז']).slug
                    haazinue_slug = RTM.get_term_by_primary_title('tanakh', "Ha'Azinu").slug
                    return {
                        MatchTemplate([haazinue_slug]),
                        MatchTemplate([haazinue_slug, title_slug]),
                        MatchTemplate([title_slug, haazinue_slug], scope='any'),
                        MatchTemplate([title_slug], scope='any')
                    }
                title_slug = RTM.get_term_by_primary_title('tanakh', title).slug
                return [
                    MatchTemplate([parasha_slug, title_slug]),
                    MatchTemplate([title_slug])
                ]
            else:
                return [
                    MatchTemplate([sefer_slug, title_slug]),
                    MatchTemplate([title_slug])
                ]
            #Zohar has many sub books, but we don't reflect it (maybe it will change in the future), so I'm not sure what to do.
            #Maybe we have to add them as one term for cacthing refs like זוהר בראשית סתרי תורה כג. ?

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if not is_alt_node: return {
                    "referenceableSections": [True, True, False]
                }

        converter = LinkerCategoryConverter('Zohar', is_index=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields)
        converter.convert()

    def convert_zohar_chadash(self):
        #mostly referred by paged, but we don't have them.
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            title = node.get_primary_title('en')
            if title == 'Zohar Chadash':
                title_slug = RTM.create_term_from_titled_obj(node, 'zohar chadash').slug
                return [MatchTemplate([title_slug])]
            try:
                title_slug = RTM.get_term_by_primary_title('tanakh', title).slug
            except:
                if 'Rut' in title:
                    title_slug = RTM.get_term_by_primary_title('tanakh', 'Ruth').slug
                elif 'Eichah' in title:
                    title_slug = RTM.get_term_by_primary_title('tanakh', 'Lamentations').slug
                else:
                    return
            if 'פרשת' in node.get_primary_title('he'):
                parasha_slug = RTM.get_term_by_primary_title('base', 'Parasha').slug
                return [
                    MatchTemplate([parasha_slug, title_slug]),
                    MatchTemplate([title_slug])
                ]
            else:
                return [
                    MatchTemplate([title_slug])
                ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if not node.get_primary_title('en') == 'Zohar Chadash':
                return {
                    "referenceableSections": [False]
                }

        converter = LinkerCategoryConverter('Zohar Chadash', is_index=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields)
        converter.convert()

    def convert_tikkunei_zohar(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                title_slug = RTM.create_term_from_titled_obj(node, context="base",
                                                         new_alt_titles=['תקונים', 'תיקונים', 'ת"ז']).slug
            elif node.get_primary_title('en') == 'Introduction to Tikkunei HaZohar':
                title_slug = RTM.create_term_from_titled_obj(node, context="base",
                                                         new_alt_titles=['הקדמה', 'הקדמה', 'Introduction']).slug
            elif node.get_primary_title('en') == 'Second Introduction to Tikkunei HaZohar':
                title_slug = RTM.create_term_from_titled_obj(node, context="base",
                                                         new_alt_titles=['הקדמה שנייה', 'הקדמה אחרת', 'Second Introduction']).slug
            elif node.get_primary_title('en') == 'Additional Tikkunim':
                title_slug = RTM.create_term_from_titled_obj(node, context="base").slug
            else:
                return
            return [MatchTemplate([title_slug])]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                return {"referenceableSections": [True, False]}

        converter = LinkerCategoryConverter('Tikkunei Zohar', is_index=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields)
        converter.convert()


    def convert_minor_tractates(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            alts = {
                    "Avot D'Rabbi Natan": ['Avot DeRabbi Natan', 'Avot of Rabbi Natan', 'Avot DeRabbi Nathan', 'Avot of Rabbi Nathan',
                                           "Avot D'Rabbi Nathan", 'AdRN', "אבות דר' נתן", 'אדר"נ'],
                    'Tractate Derekh Eretz Zuta': ['ד"א זוטא'],
                    'Tractate Derekh Eretz Rabbah': ['DER', 'ד"א רבה'],
                    'Tractate Tzitzit': ['Ṣiṣiṯ', 'Tzitzis'],
                    "Tractate Semachot": ['Avel Rabbati', 'Semachos']
                    }
            title = node.get_primary_title('en')
            if not title:
                return
            if 'Introduction' in title:
                return #masechet semachot has intro which I think we can skip
            elif 'Section on Peace' in title:
                title_slug = RTM.create_term(en='Section on Peace', alt_en=['Perek HaShalom', 'Perek ha-Shalom'], he='פרק השלום',
                                             alt_he=["פר' השלום", "פ' השלום"]).slug
                return [MatchTemplate([title_slug], scope='any')]
            alt = alts[title] if title in alts else None
            title_slug = RTM.create_term_from_titled_obj(node, context='base', new_alt_titles=alt,
                                                         title_modifier=lambda _, x: re.sub('(?:Treat\.|Tractate|Masechet|מסכת) ', '', x)).slug
            tractate_slug = RTM.get_term_by_primary_title('base', 'Tractate').slug
            return [
                MatchTemplate([title_slug]),
                MatchTemplate([tractate_slug, title_slug])
            ]

        converter = LinkerCategoryConverter('Minor Tractates', get_match_templates=get_match_templates)
        converter.convert()

    def convert_sefer_hachinukh(self):
        #chinukh has two different mitzvot order. I think ours is the common
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                title_slug = RTM.create_term_from_titled_obj(node, context='base',
                                                               title_modifier=lambda _, x: re.sub('(?:Sefer|ספר) ', '', x)).slug
                return [
                MatchTemplate([title_slug]),
                MatchTemplate([RTM.get_term_by_primary_title('base', 'Sefer').slug, title_slug])
                ]
            if is_alt_node: #TODO - we need to change the code to catch the mittzah after parashah
                title = node.get_primary_title('en')
                title_slug = RTM.get_term_by_primary_title('tanakh', title).slug
                return [
                MatchTemplate([title_slug]),
                MatchTemplate([RTM.get_term_by_primary_title('base', 'Parasha').slug, title_slug])
                ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_default():
                return {
                    "referenceableSections": [True, False],
                    'addressTypes': ['Siman', 'Integer'] #TODO mitzvah term. it can be also siman. also there is no addressType for this
                }

        converter = LinkerCategoryConverter('Sefer HaChinukh', is_index=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields)
        converter.convert()

    def convert_mechilta_dry(self):
        #mekhita dry is also refered by parasha which we don't have (what we call here parasha is masekhta)
        #do we want to add alt_structs for parashah? or can we refer parasha by chapter and pasuk?

        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if not is_alt_node:
                title_slug = RTM.create_term_from_titled_obj(node, context="base",
                                                             new_alt_titles=["מכילתא דר' ישמעאל", 'מכדר"י', 'מדר"י', 'Mekhilta of Rabbi Ishmael', 'Mekhilta de-Rabbi Ishmael', 'MRI']).slug
                return [
                    MatchTemplate([title_slug]),
                    MatchTemplate([title_slug, RTM.get_term_by_primary_title('tanakh', 'Exodus').slug])
                ]
            else:
                title_slug = RTM.create_term_from_titled_obj(node).slug
                return [
                MatchTemplate([title_slug])
                ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if not is_alt_node:
                return {
                    "referenceableSections": [True, True, False],
                    'addressTypes': ['Perek', 'Pasuk', 'Integer']
                }

        converter = LinkerCategoryConverter("Mekhilta d'Rabbi Yishmael", is_index=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields)
        converter.convert()

    def convert_mechilta_drshbi(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                title_slug = RTM.create_term_from_titled_obj(node, context="base", new_alt_titles=["מכילתא דר' שמעון", "מגילתא דר' שמעון בן יוחאי", "מכילתא דר' שמעון בר יוחאי", 'Mekhilta of Rabbi Shimon Ben Yochai', "Mekhilta de-Rabbi Shim'on ben Yoḥai"]).slug
                return [
                    MatchTemplate([title_slug])
                ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_default():
                return {
                    "referenceableSections": [True, False],
                }

        converter = LinkerCategoryConverter("Mekhilta DeRabbi Shimon Ben Yochai", is_index=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields)
        converter.convert()

    def convert_sifrei(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                title_slug = RTM.create_term_from_titled_obj(node, context="base").slug
                return [
                    MatchTemplate([title_slug])
                ]
            title = node.get_primary_title('en')
            try:
                title_slug = RTM.get_term_by_primary_title('tanakh', title).slug
                return [
                    MatchTemplate([title_slug]),
                    MatchTemplate([RTM.get_term_by_primary_title('base', 'Parasha').slug, title_slug])
                ]
            except:
                pass

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                return {
                    'addressTypes': ['Siman', 'Integer'],
                    "referenceableSections": [True, False],
                }

        for sefer in ['Bamidbar', 'Devarim']:
            converter = LinkerCategoryConverter(f"Sifrei {sefer}", is_index=True, get_match_templates=get_match_templates,
                                                get_other_fields=get_other_fields)
            converter.convert()

    def convert_pesikta(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                title_slug = RTM.create_term_from_titled_obj(node, context="base").slug
                return [
                    MatchTemplate([title_slug])
                ]

        for sefer in ["Pesikta D'Rav Kahanna", 'Pesikta Rabbati']:
            converter = LinkerCategoryConverter(sefer, is_index=True, get_match_templates=get_match_templates)
            converter.convert()

    def convert_pdre_and_tde(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                if node.get_primary_title('en') == 'Pirkei DeRabbi Eliezer':
                    new = ['פדר"א', "פרקי ר' אליעזר הגדול", "פרקי ר' אליעזר", "ברייתא דר' אליעזר", 'ברייתא דרבי אליעזר', 'ברייתת רבי אליעזר', "ברייתת ר' אליעזר"]
                elif node.get_primary_title('en') == 'Tanna Debei Eliyahu Rabbah':
                    new = ['תנא דבי אליהו', 'סדר אליהו', 'סדר אליהו רבה', 'סדר אליהו רבא']
                elif node.get_primary_title('en') == 'Tanna debei Eliyahu Zuta':
                    new = ['סדר אליהו זוטא', 'תנדב"א זוטא' , 'תנד"א זוטא']
                title_slug = RTM.create_term_from_titled_obj(node, context="base", new_alt_titles=new).slug
                return [
                    MatchTemplate([title_slug])
                ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_default():
                return {
                    "referenceableSections": [True, False],
                    'addressTypes': ['Perek', 'Integer']
                }
            if node.is_root() and node.get_primary_title != 'Tanna debei Eliyahu Zuta':
                return {
                    "referenceableSections": [True, False],
                }

        for book in ["Pirkei DeRabbi Eliezer", "Tanna Debei Eliyahu Rabbah", "Tanna debei Eliyahu Zuta"]:
            converter = LinkerCategoryConverter(book, is_index=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields)
            converter.convert()

    def convert_yalkut(self): #in the middle of work
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                title_slug = RTM.create_term_from_titled_obj(node, context="base",
                                                         new_alt_titles=['Yalkut Shimoni', 'Yalkut', 'ילקוט שמעוני', 'יל״ש', 'יל״ש', 'ילקוט']).slug
                return [MatchTemplate([title_slug])]
            elif node.depth == 0 or 'Nach' in node.wholeRef:
                title = node.get_primary_title('en')
                title = title.replace('Bereishit', 'Bereshit')
                title_slug = RTM.get_term_by_primary_title('tanakh', title).slug
                context_slug = RTM.get_term_by_primary_title('base', 'Parasha').slug if node.depth == 0 else RTM.get_term_by_primary_title('base', 'Sefer').slug
                yalkut_slug = RTM.get_term_by_primary_title('base', 'Yalkut Shimoni on Nach').slug
                return [
                    MatchTemplate([title_slug]),
                    MatchTemplate([context_slug, title_slug]),
                    MatchTemplate([yalkut_slug, title_slug], scope='alone'),
                    MatchTemplate([yalkut_slug, context_slug, title_slug], scope='alone')
                ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if not node.is_root() and 'Nach' in node.wholeRef:
                return {"referenceableSections": [False],}

        for book in ["Yalkut Shimoni on Nach", "Yalkut Shimoni on Torah"]:
            converter = LinkerCategoryConverter(book, is_index=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields)
            converter.convert()

    def convert_midrash_tehilim_and_mishlei(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            title_slug = RTM.create_term_from_titled_obj(node, context="base").slug
            return [MatchTemplate([title_slug])]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            return {"referenceableSections": [True, False],
                    'addressTypes': ['Perek', 'Integer']}

        for book in ["Midrash Mishlei", "Midrash Tehillim"]:
            converter = LinkerCategoryConverter(book, is_index=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields)
            converter.convert()

    def convert_tanchuma(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                new = ['ילמדנו'] if node.key == 'Midrash Tanchuma' else []
                title_slug = RTM.create_term_from_titled_obj(node, context="base", new_alt_titles=new).slug
                return [MatchTemplate([title_slug])]
            title = node.get_primary_title('en')
            parashah_slug = RTM.get_term_by_primary_title('base', 'Parasha').slug
            try:
                title_slug = RTM.get_term_by_primary_title('tanakh', title).slug
            except:
                pass
                # print(title)
            else:
                return [
                    MatchTemplate([title_slug]),
                    MatchTemplate([parashah_slug, title_slug])
                ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if not node.is_root() and node.get_primary_title('en') not in ['Foreword', 'Introduction']:
                return {"referenceableSections": [True, False],}

        for book in ["Midrash Tanchuma", "Midrash Tanchuma Buber"]:
            converter = LinkerCategoryConverter(book, is_index=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields)
            converter.convert()

    def convert_seder_olam(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                title_slug = RTM.create_term_from_titled_obj(node, context="base", new_alt_titles=['ס"ע']).slug
                return [MatchTemplate([title_slug])]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_default():
                return {"referenceableSections": [True, False]}

        converter = LinkerCategoryConverter('Seder Olam Rabbah', is_index=True, get_match_templates=get_match_templates,
                                        get_other_fields=get_other_fields)
        converter.convert()

    def convert_maccabees(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            h, e = ('ב', 'II') if 'II' in node.get_primary_title('en') else ('א', 'I')
            heb = ['מקבים', 'מכבים', 'חשמונאים']
            heb = [f'{x} {h}' for x in heb] + [f'מק"{h}']
            eng = []
            for en in ['Maccabees', 'Hashmonaem', 'Macc.']:
                for n in [e, len(e)]:
                    eng += [f'{n} {en}', f'{en} {e}']
            title_slug = RTM.create_term(en='I Maccabees', alt_en=eng, he='מקבים א', alt_he=heb).slug
            return [
                MatchTemplate([title_slug]),
                MatchTemplate([RTM.get_term_by_primary_title('base', 'Sefer').slug, title_slug])
            ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            return {"addressTypes": ['Perek', 'Pasuk']}

        for i in ["I", "II"]:
            converter = LinkerCategoryConverter(f'The Book of Maccabees {i}', is_index=True, get_match_templates=get_match_templates,
                                            get_other_fields=get_other_fields)
            converter.convert()

    def convert_arukh_hashulchan(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if is_alt_node:
                title_slug = RTM.create_term_from_titled_obj(node, 'arukh hashulchan').slug
                return [MatchTemplate([title_slug])]
            sa_title_swaps = {
                "Orach Chaim": "Orach Chayim",
                "Yoreh Deah": "Yoreh De'ah"
            }
            title = node.get_primary_title('en')
            if node.is_root():
                title_slug = RTM.create_term_from_titled_obj(node, 'arukh hashulchan').slug
            elif not node.is_default():
                if title == "Introduction":
                    title_term = RTM.get_term_by_primary_title('base', title)
                else:
                    title = sa_title_swaps.get(title, title)
                    title_term = RTM.get_term_by_primary_title('shulchan arukh', title)
                if title_term is None:
                    title_slug = RTM.create_term_from_titled_obj(node, 'arukh hashulchan').slug
                else:
                    title_slug = title_term.slug
            else:
                title_slug = None
            if title_slug:
                return [MatchTemplate([title_slug])]

        converter = LinkerIndexConverter('Arukh HaShulchan', get_match_templates=get_match_templates)
        converter.convert()

    def convert_lkiutei(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            new = ['לקוטי מוהר"ן'] if node.is_root() else ['תניינא'] if node.get_primary_title('en') == 'Part II' else []
            if not node.is_default():
                if node.get_primary_title('en') == "Introduction":
                    title_slug = RTM.get_term_by_primary_title('base', 'Introduction').slug
                else:
                    title_slug = RTM.create_term_from_titled_obj(node, context="base", new_alt_titles=new).slug
                return [MatchTemplate([title_slug])]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if not node.is_root():
                return {"referenceableSections": [True] * (node.depth-1) + [False]}

        converter = LinkerCategoryConverter('Likutei Moharan', is_index=True, get_match_templates=get_match_templates,
                                        get_other_fields=get_other_fields)
        converter.convert()

    def convert_yeztirah(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            book_slug = RTM.get_term_by_primary_title('base', 'Sefer').slug
            title_slug = RTM.create_term(en='Yetzirah', alt_en=['Formation', "Y’tsirah"], he='יצירה').slug
            if 'Gra' in node.get_primary_title('en'):
                gra_slug = RTM.create_term(en='Gra', alt_en=['Vilna Gaon'], he='גר"א').slug
                return [MatchTemplate([title_slug, gra_slug]),
                        MatchTemplate([book_slug, title_slug, gra_slug])]
            else:
                return [MatchTemplate([title_slug]), MatchTemplate([book_slug, title_slug])]

        for book in ['Sefer Yetzirah Gra Version', 'Sefer Yetzirah']:
            converter = LinkerCategoryConverter(book, is_index=True, get_match_templates=get_match_templates)
            converter.convert()

    def convert_likutei_halakhot(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                return [MatchTemplate([RTM.create_term_from_titled_obj(node, context="base", new_alt_titles=['לקוטי הלכות']).slug])]
            if node.has_children():
                sa_title_swaps = {
                    "Orach Chaim": "Orach Chayim",
                    "Yoreh Deah": "Yoreh De'ah"
                }
                title = node.get_primary_title('en')
                title = sa_title_swaps.get(title, title)
                return [MatchTemplate([RTM.get_term_by_primary_title('shulchan arukh', title).slug])]
            if node.depth == 1:
                return [MatchTemplate([RTM.get_term_by_primary_title('base', 'Introduction').slug])]
            else:
                index_slug = RTM.get_term_by_primary_title('base', 'Likutei Halakhot').slug
                title_slug = RTM.create_term_from_titled_obj(node, context="base").slug
                return [
                    MatchTemplate([index_slug, title_slug], scope='alone'),
                    MatchTemplate([title_slug]),
                ]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if not node.has_children():
                d = {"referenceableSections": [True] * (node.depth-1) + [False]}
                if node.depth == 3:
                    d['addressTypes'] = ['Halakhah', 'Siman', 'Integer']
                return d

        converter = LinkerCategoryConverter('Likutei Halakhot', is_index=True, get_match_templates=get_match_templates,
                                        get_other_fields=get_other_fields)
        converter.convert()

    def convert_mishnah_berurah(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                return [MatchTemplate([RTM.get_term_by_primary_title('base', node.get_primary_title('en')).slug])]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_default():
                return {'addressTypes': ['Siman', 'SeifKatan']}

        converter = LinkerIndexConverter('Mishnah Berurah', get_match_templates=get_match_templates, get_other_fields=get_other_fields)
        converter.convert()

    def convert_aramaic_targum(self):
        aramaic_targum_slug = RTM.create_term(en='Aramaic Targum', he='תרגום', context="base").slug

        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                title = node.get_primary_title('en')
                title_slug = RTM.get_term_by_primary_title('tanakh', title.replace("Aramaic Targum to ", "")).slug
                return [MatchTemplate([aramaic_targum_slug, title_slug])]

        converter = LinkerCategoryConverter('Aramaic Targum', include_dependant=True, get_match_templates=get_match_templates)
        converter.convert()

    def convert_pesach_haggadah(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            title_slug = RTM.create_term_from_titled_obj(node, context="haggadah").slug
            return [MatchTemplate([title_slug])]

        converter = LinkerIndexConverter('Pesach Haggadah', get_match_templates=get_match_templates)
        converter.convert()

    def convert_mesilat_yesharim(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if is_alt_node or node.is_default(): return
            if node.get_primary_title('en') == "Introduction":
                title_slug = RTM.get_term_by_primary_title('base', 'Introduction').slug
            else:
                title_slug = RTM.create_term_from_titled_obj(node, context="mesilat yesharim").slug
            return [MatchTemplate([title_slug])]

        converter = LinkerIndexConverter('Mesilat Yesharim', get_match_templates=get_match_templates)
        converter.convert()

    def convert_kaf_hachayim(self):
        # kaf_slug = RTM.create_term(en="Kaf HaChayim", he="כף החיים", alt_en=["Kaf Hachayim", "Kaf Hachaim", "Kaf HaChaim"], alt_he=["כה\"ח", "כה״ח", "כה”ח"], context="base").slug
        kaf_slug = RTM.get_term_by_primary_title("base", "Kaf HaChayim").slug

        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            if node.is_root():
                title = node.get_primary_title('en')
                sa_title = title.replace("Kaf HaChayim on Shulchan Arukh, ", "")
                return [MatchTemplate([
                    kaf_slug,
                    RTM.get_term_by_primary_title('shulchan arukh', sa_title).slug,
                ])]

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            if not is_alt_node:
                return {'addressTypes': ['Siman', 'SeifKatan', 'Integer']}

        converter = LinkerCategoryConverter('Kaf HaChayim', include_dependant=True, get_match_templates=get_match_templates, get_other_fields=get_other_fields)
        converter.convert()

    def convert_megilat_taanit(self):
        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            return [MatchTemplate([RTM.create_term_from_titled_obj(node, 'base').slug])]
        converter = LinkerIndexConverter("Megillat Taanit", get_match_templates=get_match_templates)
        converter.convert()

    def convert_minor_rashis(self):
        rashi_slug = RTM.get_term_by_primary_title('base', 'Rashi').slug
        bereshit_slug = RTM.get_term_by_primary_title('tanakh', 'Genesis').slug
        rabbah_slug = RTM.get_term_by_primary_title('base', 'Rabbah').slug
        mid_slug = RTM.get_term_by_primary_title('base', 'Midrash').slug
        mid_rab_slug = RTM.get_term_by_primary_title('base', 'Midrash Rabbah').slug
        tractate_slug = RTM.get_term_by_primary_title('base', 'Tractate').slug
        avot_slug = RTM.get_term_by_primary_title('shas', "Pirkei Avot").slug
        mishnah_slug = RTM.get_term_by_primary_title('base', "Mishnah").slug

        def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
            title = node.get_primary_title('en')
            if "Rabbah" in title:
                return [
                    MatchTemplate([rashi_slug, bereshit_slug, rabbah_slug]),
                    MatchTemplate([rashi_slug, mid_slug, bereshit_slug, rabbah_slug]),
                    MatchTemplate([rashi_slug, mid_rab_slug, bereshit_slug]),
                ]
            else:
                # Avot
                return [
                    MatchTemplate([rashi_slug, mishnah_slug, avot_slug]),
                    MatchTemplate([rashi_slug, avot_slug]),
                    MatchTemplate([rashi_slug, tractate_slug, avot_slug]),
                    MatchTemplate([rashi_slug, mishnah_slug, tractate_slug, avot_slug]),
                ]

        def get_other_fields_rabbah(node, depth, isibling, num_siblings, is_alt_node):
            return {
                "addressTypes": ["Perek", "Integer", "Integer"]
            }

        def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
            dh_regexes = self.dibur_hamatchil_adder.get_dh_regexes("Rashi", "Minor")
            if dh_regexes:
                self.dibur_hamatchil_adder.add_index(node.index)

            ret = {
                "isSegmentLevelDiburHamatchil": True,
                "diburHamatchilRegexes": dh_regexes,
            }

            title = node.get_primary_title('en')
            if "Rabbah" in title:
                ret["addressTypes"] = ["Perek", "Integer", "Integer"]
            return ret

        converter = LinkerIndexConverter("Rashi on Bereshit Rabbah", get_match_templates=get_match_templates, get_other_fields=get_other_fields)
        converter.convert()

        converter = LinkerIndexConverter("Rashi on Avot", get_match_templates=get_match_templates, get_other_fields=get_other_fields)
        converter.convert()


if __name__ == '__main__':
    RTM = ReusableTermManager()
    reusable_term_creator = ReusableTermCreator(RTM)
    reusable_term_creator.create_all_terms()

    converter_manager = SpecificConverterManager()
    converter_manager.convert_tanakh()
    converter_manager.convert_bavli()
    converter_manager.convert_rest_of_shas()
    converter_manager.convert_sifra()
    converter_manager.convert_midrash_rabbah()
    converter_manager.convert_mishneh_torah()
    converter_manager.convert_tur()
    converter_manager.convert_shulchan_arukh()
    converter_manager.convert_arukh_hashulchan()
    converter_manager.convert_mishnah_berurah()
    # converter_manager.convert_zohar()
    converter_manager.convert_zohar_chadash()
    converter_manager.convert_minor_tractates()
    converter_manager.convert_sefer_hachinukh()
    converter_manager.convert_mechilta_dry()
    converter_manager.convert_pdre_and_tde()
    converter_manager.convert_mechilta_drshbi()
    converter_manager.convert_sifrei()
    converter_manager.convert_pesikta()
    converter_manager.convert_yalkut()
    converter_manager.convert_midrash_tehilim_and_mishlei()
    converter_manager.convert_tanchuma()
    converter_manager.convert_tikkunei_zohar()
    converter_manager.convert_seder_olam()
    converter_manager.convert_maccabees()
    converter_manager.convert_lkiutei()
    converter_manager.convert_yeztirah()
    converter_manager.convert_likutei_halakhot()
    converter_manager.convert_aramaic_targum()
    converter_manager.convert_pesach_haggadah()
    converter_manager.convert_mesilat_yesharim()
    converter_manager.convert_kaf_hachayim()
    converter_manager.convert_megilat_taanit()
    converter_manager.convert_minor_rashis()

    # add DHs at end
    converter_manager.dibur_hamatchil_adder.add_all_dibur_hamatchils()

