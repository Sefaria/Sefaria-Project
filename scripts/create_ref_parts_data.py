import csv

import django, re
django.setup()
from tqdm import tqdm
from sefaria.model import *
from sefaria.system.database import db
from sefaria.model.abstract import AbstractMongoRecord
from sefaria.model.schema import DiburHamatchilNode, DiburHamatchilNodeSet

class RefPartModifier:

    def __init__(self):
        self.create_base_non_unique_terms()
        self.shas_map = self.create_shas_terms()
        self.tanakh_map, self.parsha_map = self.create_tanakh_terms()
        self.perek_number_map = self.create_numeric_perek_terms()

    def t(self, **kwargs):
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


    def fast_index_save(self, index):
        props = index._saveable_attrs()
        db.index.replace_one({"_id": index._id}, props, upsert=True)


    def t_from_titled_obj(self, obj, ref_part_role):
        en_title = obj.get_primary_title('en')
        he_title = obj.get_primary_title('he')
        alt_en_titles = [title for title in obj.title_group.all_titles('en') if title != en_title]
        alt_he_titles = [title for title in obj.title_group.all_titles('he') if title != he_title]
        return self.t(en=en_title, he=he_title, alt_en=alt_en_titles, alt_he=alt_he_titles, ref_part_role=ref_part_role)


    def get_dh(self, s, regexes, oref):
        for reg in regexes:
            match = re.search(reg, s)
            if not match: continue
            s = match.group(1)
        s = s.strip()
        return s


    def get_dh_regexes(self, index, comm_term_slug):
        reg_map = {
            "rashi": ['^(.+?)[\-–]', '\.(.+?)$', "^(?:(?:מתני'|גמ')\s?)?(.+)$"],
            "ran": ['^(.+?)[\-–]', "^(?:(?:מתני'|גמ')\s?)?(.+)$"],
            "tosafot": ['^(.+?)[\-–\.]', "^(?:(?:מתני'|גמ')\s?)?(.+)$"]
        }
        return reg_map.get(index.title, reg_map.get(comm_term_slug))


    def modify_talmud_commentaries(self, fast=False, create_dhs=False, add_alt_structs=False):
        """
        index_only. true when you don't want to touch existing dh's in db
        """
        if create_dhs:
            DiburHamatchilNodeSet().delete()
        for comm_ref_prefix, comm_term_slug, comm_cat_path in (
            ('Rashi on ', 'rashi', ['Talmud', 'Bavli', 'Rishonim on Talmud', 'Rashi']),
            ('Tosafot on ', 'tosafot', ['Talmud', 'Bavli', 'Rishonim on Talmud', 'Tosafot']),
            ('Ran on ', 'ran', ['Talmud', 'Bavli', 'Rishonim on Talmud', 'Ran']),
        ):
            indexes = library.get_indexes_in_category_path(comm_cat_path, True, True)
            for index in tqdm(indexes, desc=comm_term_slug, total=indexes.count()):
                # if "Nedarim" not in index.title: continue
                self.add_new_fields_to_commentary_root_node(comm_ref_prefix, comm_term_slug, index, fast)
                if create_dhs:
                    self.add_dibur_hamatchils(comm_ref_prefix, index)
                if add_alt_structs:
                    self.add_alt_structs_to_talmud_commentaries(comm_ref_prefix, comm_term_slug, index)


    def add_new_fields_to_commentary_root_node(self, comm_ref_prefix, comm_term_slug, index, fast=False):
        comm_term = NonUniqueTerm.init(comm_term_slug)
        base_index = library.get_index(index.base_text_titles[0])
        n = index.nodes

        base_index_term = self.shas_map[base_index.title]
        n.ref_parts = [
            {
                "slugs": [comm_term.slug],
                "optional": False,
                "scopes": ["combined"]
            },
            {
                "slugs": [base_index_term.slug],
                "optional": False,
                "scopes": ["combined"]
            }
        ]
        n.isSegmentLevelDiburHamatchil = True
        n.referenceableSections = [True, False, True]
        n.diburHamatchilRegexes = self.get_dh_regexes(index, comm_term_slug)
        if fast:
            self.fast_index_save(index)
        else:
            index.save()


    def add_dibur_hamatchils(self, comm_ref_prefix, index):
        base_index = library.get_index(index.base_text_titles[0])
        seg_perek_mapping = {}
        for perek_node in base_index.get_alt_struct_nodes():
            perek_ref = Ref(perek_node.wholeRef)
            for seg_ref in perek_ref.all_segment_refs():
                seg_perek_mapping[comm_ref_prefix + seg_ref.normal()] = comm_ref_prefix + perek_ref.normal()
        for iseg, segment_ref in enumerate(index.all_segment_refs()):
            perek_ref = seg_perek_mapping[segment_ref.section_ref().normal()]

            # # TODO remove
            # if iseg > 3 and perek_ref not in {"Rashi on Beitzah 15b:1-23b:10", "Rashi on Rosh Hashanah 29b:5-35a:13"}: continue

            chunk = TextChunk(segment_ref, 'he')
            dh = self.get_dh(chunk.text, index.nodes.diburHamatchilRegexes, segment_ref)
            if dh is None:
                continue
            DiburHamatchilNode({
                "dibur_hamatchil": dh,
                "container_refs": [segment_ref.top_section_ref().normal(), perek_ref, index.title],
                "ref": segment_ref.normal()
            }).save()


    def add_alt_structs_to_talmud_commentaries(self, comm_ref_prefix, comm_term_slug, index):
        base_index = library.get_index(index.base_text_titles[0])
        base_alt_struct = base_index.get_alt_structures()['Chapters']
        for perek_node in base_alt_struct.children:
            perek_node.wholeRef = comm_ref_prefix + perek_node.wholeRef
            perek_node.isSegmentLevelDiburHamatchil = True
            perek_node.ref_parts = [
                {
                    "slugs": [comm_term_slug],
                    "optional": False,
                    "scopes": ["alone"]
                }
            ] + perek_node.ref_parts
        base_alt_struct.validate()
        index.set_alt_structure("Chapters", base_alt_struct)
        index.save()
        for perek_node in base_alt_struct.children:
            perek_node.wholeRef = perek_node.wholeRef[len(comm_ref_prefix):]
            delattr(perek_node, 'isSegmentLevelDiburHamatchil')
            perek_node.ref_parts = perek_node.ref_parts[1:]

    def modify_talmud(self, fast=False):
        perek = NonUniqueTerm.init('perek')
        bavli = NonUniqueTerm.init('bavli')
        minor_tractates = {title for title in library.get_indexes_in_category("Minor Tractates")}
        indexes = library.get_indexes_in_category("Bavli", full_records=True)
        for index in tqdm(indexes, desc='talmud', total=indexes.count()):
            if index.title in minor_tractates: continue
            index_term = self.shas_map[index.title]
            index_term.save()
            index.nodes.ref_parts = [
                {
                    "slugs": [bavli.slug],
                    "optional": True,
                    "scopes": ["combined"]
                },
                {
                    "slugs": [index_term.slug],
                    "optional": False,
                    "scopes": ["combined"]
                }
            ]
            # add perek terms
            perakim = index.get_alt_struct_nodes()
            for iperek, perek_node in enumerate(perakim):
                perek_term = self.t(he=perek_node.get_primary_title('he'), ref_part_role='structural')  # TODO english titles are 'Chapter N'. Is that an issue?
                is_last = iperek == len(perakim)-1
                perek_node.ref_parts = [
                    {
                        "slugs": [perek.slug],
                        "optional": True,
                        "scopes": ["any"]
                    },
                    {
                        "slugs": [perek_term.slug, self.perek_number_map[min(iperek+1, 30)].slug] + ([self.perek_number_map['last'].slug] if is_last else []),  # TODO get rid of min()
                        "optional": False,
                        "scopes": ["any", "combined"] + (["combined"] if is_last else [])
                    }
                ]
            try:
                delattr(index.nodes, 'checkFirst')
            except KeyError:
                pass
            if fast:
                self.fast_index_save(index)
            else:
                index.save()

    def modify_tanakh(self, fast=False):
        sefer = NonUniqueTerm.init('sefer')
        parasha = NonUniqueTerm.init('parasha')
        indexes = library.get_indexes_in_category("Tanakh", full_records=True)
        for index in tqdm(indexes, desc='tanakh', total=indexes.count()):
            index_term = self.tanakh_map[index.title]
            index.nodes.ref_parts = [
                {
                    "slugs": [sefer.slug],
                    "optional": True,
                    "scopes": ["combined"]
                },
                {
                    "slugs": [index_term.slug],
                    "optional": False,
                    "scopes": ["combined"]
                }
            ]

            # add parsha terms
            if index.categories[-1] == 'Torah':
                for parsha_node in index.get_alt_struct_nodes():
                    parsha_term = self.parsha_map[parsha_node.get_primary_title('en')]
                    parsha_node.ref_parts = [
                        {
                            "slugs": [parasha.slug],
                            "optional": True,
                            "scopes": ["any"]
                        },
                        {
                            "slugs": [parsha_term.slug],
                            "optional": False,
                            "scopes": ["any"]
                        }
                    ]
            if fast:
                self.fast_index_save(index)
            else:
                index.save()

    def modify_rest_of_shas(self, fast=False):
        title_swaps = {
            "Moed Kattan": "Moed Katan",
            "Oktsin": "Oktzin"
        }
        for cat, title_prefix in [("Mishnah", "Mishnah "), ("Tosefta", "Tosefta "), ("Yerushalmi", "Jerusalem Talmud ")]:
            base_term = NonUniqueTerm.init(cat.lower())
            indexes = library.get_indexes_in_category(cat, full_records=True)
            for index in tqdm(indexes, desc=cat, total=indexes.count()):
                generic_title = index.title.replace(title_prefix, '')
                if '(Lieberman)' in index.title:
                    generic_title = generic_title.replace(' (Lieberman)', '')
                generic_title = title_swaps.get(generic_title, generic_title)
                generic_term = self.shas_map[generic_title]
                if not generic_term:
                    print(generic_title)
                    continue
                if cat == "Yerushalmi":
                    index.nodes.addressTypes[0] = "Perek"
                    index.nodes.ref_resolver_context_swaps = {
                        "halakha": [base_term.slug, generic_term.slug]
                    }
                    index.nodes.referenceableSections = [True, True, False]
                index.nodes.ref_parts = [
                    {
                        "slugs": [base_term.slug],
                        "optional": True,
                        "scopes": ["combined"]
                    },
                    {
                        "slugs": [generic_term.slug],
                        "optional": False,
                        "scopes": ["combined"]
                    }
                ]
                if fast:
                    self.fast_index_save(index)
                else:
                    index.save()

    def modify_midrash_rabbah(self, fast=False):
        indexes = library.get_indexes_in_category("Midrash Rabbah", full_records=True)
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
        rabbah_term = NonUniqueTerm.init('rabbah')
        for index in tqdm(indexes, desc='midrash rabbah', total=indexes.count()):
            tanakh_title = index.title.replace(" Rabbah", "")
            tanakh_title = tanakh_title_map.get(tanakh_title, tanakh_title)
            tanakh_term = self.tanakh_map.get(tanakh_title)
            index.nodes.ref_parts = [
                {
                    "slugs": [tanakh_term.slug],
                    "optional": False,
                    "scopes": ["combined"],
                },
                {
                    "slugs": [rabbah_term.slug],
                    "optional": False,
                    "scopes": ["combined"],
                },
            ]
            if fast:
                self.fast_index_save(index)
            else:
                index.save()

    def modify_sifra(self, fast=False):
        parsha_map = {
            "Shemini": "Shmini",
            "Acharei Mot": "Achrei Mot",
        }
        other_node_map = {
            "Braita d'Rabbi Yishmael": ["Introduction", "Wayyiqra"],
            "Vayikra Dibbura d'Nedavah": [],
            "Vayikra Dibbura d'Chovah": [],
            "Tazria Parashat Yoledet": [],
            "Tazria Parashat Nega'im": [],
            "Metzora Parashat Zavim": [],
        }
        other_perek_node_map = {
            "Mechilta d'Miluim": [],
        }
        index = library.get_index('Sifra')
        index.nodes.ref_parts = [
            {
                "slugs": ['sifra'],
                "optional": False,
                "scopes": ["combined"],
            },
        ]
        for node in index.nodes.children:
            node_title = node.get_primary_title('en')
            node_title_he = node.get_primary_title('he')
            parsha_title = parsha_map.get(node_title, node_title)
            parsha_term = self.parsha_map.get(parsha_title, None)
            if parsha_term is None:
                alt_titles = other_node_map[node_title]
                node_term = self.t(en=node_title, he=node_title_he, alt_en=alt_titles, ref_part_role='structural')
                node.ref_parts = [
                    {
                        "slugs": [node_term.slug],
                        "optional": False,
                        "scopes": ["combined"],
                    },
                ]
            else:
                node.ref_parts = [
                    {
                        "slugs": [parsha_term.slug],
                        "optional": False,
                        "scopes": ["combined"],
                    },
                ]
            for par_per_node in node.children:
                temp_title = par_per_node.get_primary_title('en')
                named_term_slug = None
                if 'Chapter' in temp_title:
                    named_term_slug = 'perek'
                elif 'Section' in temp_title:
                    named_term_slug = 'parasha'
                if named_term_slug is None:
                    alt_titles = other_perek_node_map[re.search(r'^(.+) \d+$', temp_title).group(1)]
                    named_term_slug = self.t(en=temp_title, he=par_per_node.get_primary_title('he'), alt_en=alt_titles, ref_part_role='structural').slug
                num_match = re.search(' (\d+)$', temp_title)
                if num_match is None:
                    print(node_title, temp_title)
                    continue
                num_term = self.perek_number_map[int(num_match.group(1))]
                par_per_node.ref_parts = [
                    {
                        "slugs": [named_term_slug],
                        "optional": False,
                        "scopes": ["combined"],
                    },
                    {
                        "slugs": [num_term.slug],
                        "optional": False,
                        "scopes": ["combined"],
                    }
                ]

        if fast:
            self.fast_index_save(index)
        else:
            index.save()

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
            term = self.t(en=ord_en[i-1], he=primary_he, alt_he=alt_he, alt_en=alt_en, ref_part_role='structural')
            term_map[i] = term
        term_map['last'] = self.t(en='last', he='בתרא', ref_part_role='structural')
        return term_map

    def create_base_non_unique_terms(self):
        NonUniqueTermSet().delete()

        self.t(en='Bavli', he='בבלי', alt_en=['Babylonian Talmud', 'B.T.', 'BT', 'Babli'], ref_part_role='structural')
        self.t(en='Rashi', he='רש"י', ref_part_role='structural')
        self.t(en='Mishnah', he='משנה', alt_en=['M.', 'M', 'Mishna', 'Mishnah', 'Mishnaiot'], ref_part_role='structural')
        self.t(en='Tosefta', he='תוספתא', alt_en=['Tosephta', 'T.', 'Tosef.', 'Tos.'], ref_part_role='structural')
        self.t(en='Yerushalmi', he='יורשלמי', alt_en=['Jerusalem Talmud', 'J.T.', 'JT'],ref_part_role='structural')
        self.t(en='Tosafot', he='תוספות', alt_he=["תוס'", 'תוד"ה', 'תד"ה',], alt_en=['Tosaphot'], ref_part_role='structural')
        self.t(en='Midrash Rabbah', he='מדרש רבה', alt_en=['Midrash Rabba', 'Midrash Rabah'], alt_he=['מדרש רבא'], ref_part_role='structural')  # TODO no good way to compose titles for midrash rabbah...
        self.t(en='Rabbah', he='רבה', alt_en=['Rabba', 'Rabah', 'Rab.', 'R.', 'Rab .', 'R .', 'rabba', 'r.', 'r .', 'rabbati'], alt_he=['רבא'], ref_part_role='structural')
        self.t(en='Sifra', he='סיפרא', ref_part_role='structural')
        self.t(en='Ran', he='ר"ן', ref_part_role='structural')
        self.t(en='Perek', he='פרק', alt_en=["Pereq", 'Chapter'], ref_part_role='alt_title')
        self.t(en='Parasha', he='פרשה', alt_en=['Parashah', 'Parašah', 'Parsha', 'Paraša'], ref_part_role='alt_title')
        self.t(en='Sefer', he='ספר', ref_part_role='alt_title')
        self.t(en='Halakha', he='הלכה', alt_en=['Halakhah', 'Halacha', 'Halachah', 'Halakhot'], ref_part_role='context_swap')
        self.t_from_titled_obj(Term().load({"name": "Parasha"}), ref_part_role='alt_title')

    def create_shas_terms(self):
        """
        create generic shas terms that can be reused for mishnah, tosefta, bavli and yerushalmi
        """
        from collections import defaultdict
        from sefaria.utils.hebrew import is_hebrew
        hard_coded_title_map = {
            "Avodah Zarah": ["Avodah zarah"],
            "Beitzah": ["Yom Tov", "Besah"],
            "Berakhot": ["Berkahot"],
            "Bava Batra": ["Bava batra", "Baba batra"],
            "Bava Kamma": ["Bava kamma", "Bava kama", "Baba kamma", "Baba kama", "Bava qama", "Baba qama", "Bava Qama", "Baba Qama", "Bava qamma", "Bava Qamma"],
            "Bava Metzia": ["Bava mesi`a", "Baba Mesi‘a", "Baba mesi`a", "Bava Mesi‘a", "Bava mesi‘a"],
            "Chullin": ["Hulin"],
            "Demai": ["Demay"],
            "Eduyot": ["Idiut"],
            "Horayot": ["Horaiot"],
            "Kiddushin": ["Qiddušin"],
            "Kilayim": ["Kilaim"],
            "Makhshirin": ["Makhširin"],
            "Meilah": ["Me‘ilah", "Meˋilah"],
            "Moed Katan": ["Mo‘ed qatan", "Mo‘ed Qatan", "Moˋed qatan", "Moˋed Qatan"],
            "Negaim": ["Negaˋim"],
            "Oholot": ["Ahilut", "Ahilot"],
            "Pesachim": ["Pisha"],
            "Rosh Hashanah": ["Roš Haššanah", "Rosh Haššanah"],
            "Shabbat": ["Šabbat"],
            "Shekalim": ["Šeqalim"],
            "Sheviit": ["Ševi‘it", "Ševiˋit"],
            "Shevuot": ["Šebuot", "Ševuˋot", "Ševu‘ot"],
            "Taanit": ["Ta ˋ anit", "Taˋanit", "Ta‘anit"],
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
            term = self.t(en=generic_title_en, he=generic_title_he, alt_en=alt_en, alt_he=alt_he, ref_part_role='structural')
            title_term_map[generic_title_en] = term
        return title_term_map

    def create_tanakh_terms(self):
        hard_coded_tanakh_map = {
            "I Samuel": ["1S."],
            "II Samuel": ["2S."],
            "I Kings": ["1K."],
            "II Kings": ["2K."],
            "Zechariah": ["Sach."],
            "I Chronicles": ["1Chr."],
            "II Chronicles": ["2Chr."],
            "Lamentations": ["Thr.", "Threni"],
            "Ruth": ["Ru."],
            "Deuteronomy": ["D eut."],
        }
        hard_coded_parsha_map = {
            "Metzora": ["Mesora‘", "Mesora"],
            "Kedoshim": ["Qedošim"],
            "Vayikra": ["Wayyiqra"],
            "Bechukotai": ["Behuqqotai"],
            "Tazria": ["Tazria‘", "Tazria`"],
            "Tzav": ["Saw"],
            "Achrei Mot": ["Ahare", "Aḥare Mot", "Ahare Mot"],
        }
        indexes = library.get_indexes_in_category("Tanakh", full_records=True)
        tanakh_term_map = {}
        parsha_term_map = {}
        for index in tqdm(indexes, desc='tanakh', total=indexes.count()):
            titles = index.nodes.title_group.titles
            titles += [{
                "text": alt_title,
                "lang": "en"
            } for alt_title in hard_coded_tanakh_map.get(index.title, [])]
            titles += [{
                "text": alt_title_obj['text'].replace('.', ' .'),
                "lang": "en"
            } for alt_title_obj in titles if re.search(r'\.$', alt_title_obj['text']) is not None]
            index_term = NonUniqueTerm({
                "slug": index.title,
                "titles": titles,
                "ref_part_role": "structural"
            })
            index_term.save()
            tanakh_term_map[index.title] = index_term

            # parasha
            if index.categories[-1] == 'Torah':
                for parsha_node in index.get_alt_struct_nodes():
                    titles = parsha_node.title_group.titles
                    titles += [{
                        "text": alt_title,
                        "lang": "en"
                    } for alt_title in hard_coded_parsha_map.get(parsha_node.get_primary_title('en'), [])]
                    titles += [{
                        "text": alt_title_obj['text'].replace('.', ' .'),
                        "lang": "en"
                    } for alt_title_obj in titles if re.search(r'\.$', alt_title_obj['text']) is not None]
                    parsha_term = NonUniqueTerm({
                        "slug": parsha_node.get_primary_title('en'),
                        "titles": titles,
                        "ref_part_role": "structural"
                    })
                    parsha_term.save()
                    parsha_term_map[parsha_term.get_primary_title('en')] = parsha_term
        return tanakh_term_map, parsha_term_map

    def modify_all(self):
        fast = True
        create_dhs = False
        add_comm_alt_structs = False
        self.modify_talmud(fast)
        self.modify_tanakh(fast)
        self.modify_rest_of_shas(fast)
        self.modify_talmud_commentaries(fast, create_dhs, add_comm_alt_structs)  # on first run, rerun because ArrayMapNodes are cached
        self.modify_midrash_rabbah(fast)
        self.modify_sifra(fast)


if __name__ == "__main__":
    modifier = RefPartModifier()
    modifier.modify_all()