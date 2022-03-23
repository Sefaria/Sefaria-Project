import csv

import django, re
django.setup()
from tqdm import tqdm
from sefaria.model import *
from sefaria.system.database import db
from collections import defaultdict
from sefaria.utils.hebrew import is_hebrew
from sefaria.model.abstract import AbstractMongoRecord
from sefaria.model.schema import DiburHamatchilNode, DiburHamatchilNodeSet, TitleGroup


class RefPartModifier:

    def __init__(self):
        self.old_term_map = {}
        self.create_base_non_unique_terms()
        self.shas_map = self.create_shas_terms()
        self.tanakh_map, self.parsha_map = self.create_tanakh_terms()
        self.perek_number_map = self.create_numeric_perek_terms()
        self.mt_map = self.create_mt_terms()
        self.sa_map = self.create_sa_terms()

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
        title_group = obj if isinstance(obj, TitleGroup) else obj.title_group
        en_title = title_group.primary_title('en')
        he_title = title_group.primary_title('he')
        alt_en_titles = [title for title in title_group.all_titles('en') if title != en_title]
        alt_he_titles = [title for title in title_group.all_titles('he') if title != he_title]
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
            "tosafot": ['^(.+?)[\-–\.]', "^(?:(?:מתני'|גמ')\s?)?(.+)$"],
            "gilyon-hashas": ["^<b>(.+?)</b>"],
        }
        return reg_map.get(index.title, reg_map.get(comm_term_slug))


    def modify_bavli_commentaries(self, fast=False, create_dhs=False, add_alt_structs=False):
        """
        index_only. true when you don't want to touch existing dh's in db
        """
        if create_dhs:
            DiburHamatchilNodeSet().delete()
        for comm_ref_prefix, comm_term_slug, comm_cat_path in (
            ('Rashi on ', 'rashi', ['Talmud', 'Bavli', 'Rishonim on Talmud', 'Rashi']),
            ('Tosafot on ', 'tosafot', ['Talmud', 'Bavli', 'Rishonim on Talmud', 'Tosafot']),
            ('Ran on ', 'ran', ['Talmud', 'Bavli', 'Rishonim on Talmud', 'Ran']),
            ('Gilyon HaShas on ', 'gilyon-hashas', ['Talmud', 'Bavli', 'Acharonim on Talmud', 'Gilyon HaShas']),
        ):
            indexes = library.get_indexes_in_category_path(comm_cat_path, True, True)
            for index in tqdm(indexes, desc=comm_term_slug, total=indexes.count()):
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
        n.match_templates = [
            {
                "term_slugs": [comm_term.slug, base_index_term.slug],
            }
        ]
        n.isSegmentLevelDiburHamatchil = True
        n.referenceableSections = [True, False, True] if n.depth == 3 else [True, True]  # assuming second address is always "Line"
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
        base_templates = []
        for perek_node in base_alt_struct.children:
            perek_node.wholeRef = comm_ref_prefix + perek_node.wholeRef
            perek_node.isSegmentLevelDiburHamatchil = True
            base_templates += [perek_node.match_templates[:]]
            alone_templates = []
            combined_templates = []
            for template in perek_node.match_templates:
                temp_template = template.copy()
                temp_template['term_slugs'] = [comm_term_slug] + template['term_slugs']
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
        base_alt_struct.validate()
        index.set_alt_structure("Chapters", base_alt_struct)
        index.save()
        for iperek, perek_node in enumerate(base_alt_struct.children):
            perek_node.wholeRef = perek_node.wholeRef[len(comm_ref_prefix):]
            delattr(perek_node, 'isSegmentLevelDiburHamatchil')
            perek_node.match_templates = base_templates[iperek]

    def modify_bavli(self, fast=False):
        perek = NonUniqueTerm.init('perek')
        bavli = NonUniqueTerm.init('bavli')
        gemara = NonUniqueTerm.init('gemara')
        tractate = NonUniqueTerm.init('tractate')
        minor_tractates = {title for title in library.get_indexes_in_category("Minor Tractates")}
        indexes = library.get_indexes_in_category("Bavli", full_records=True)
        for index in tqdm(indexes, desc='talmud', total=indexes.count()):
            if index.title in minor_tractates: continue
            index_term = self.shas_map[index.title]
            index_term.save()
            index.nodes.match_templates = [
                {
                    "term_slugs": [bavli.slug, index_term.slug],
                },
                {
                    "term_slugs": [gemara.slug, index_term.slug],
                },
                {
                    "term_slugs": [bavli.slug, tractate.slug, index_term.slug],
                },
                {
                    "term_slugs": [gemara.slug, tractate.slug, index_term.slug],
                },
                {
                    "term_slugs": [index_term.slug],
                }
            ]
            index.nodes.referenceableSections = [True, False]
            # add perek terms
            perakim = index.get_alt_struct_nodes()
            for iperek, perek_node in enumerate(perakim):
                perek_term = self.t(he=perek_node.get_primary_title('he'), ref_part_role='structural')  # TODO english titles are 'Chapter N'. Is that an issue?
                is_last = iperek == len(perakim)-1
                numeric_equivalent = min(iperek+1, 30)
                perek_node.numeric_equivalent = numeric_equivalent
                perek_node.match_templates = [
                    {
                        "term_slugs": [perek.slug, perek_term.slug],
                        "scope": "any"
                    },
                    {
                        "term_slugs": [perek.slug, self.perek_number_map[numeric_equivalent].slug]
                    },
                    {
                        "term_slugs": [perek_term.slug],
                        "scope": "any"
                    },
                    {
                        "term_slugs": [self.perek_number_map[numeric_equivalent].slug]
                    },
                ]
                if is_last:
                    perek_node.match_templates += [
                        {
                            "term_slugs": [perek.slug, self.perek_number_map['last'].slug]
                        },
                        {
                            "term_slugs": [self.perek_number_map['last'].slug]
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

    def modify_base_text_commentaries(self, base_text_title, base_match_templates, fast=False):
        # commentaries
        comm_indexes = IndexSet({"base_text_titles": base_text_title})
        for comm_index in comm_indexes:
            try:
                comm_term = self.old_term_map[comm_index.collective_title]
            except KeyError:
                print(
                    f"\nMissing commentary term for '{comm_index.collective_title}' used on index '{comm_index.title}'")
                continue
            except AttributeError:
                print(f"No collective title for '{comm_index.title}'")
                continue
            comm_match_templates = []
            for template in base_match_templates:
                temp_match_template = template.copy()
                temp_match_template['term_slugs'] = [comm_term.slug] + template['term_slugs']
                comm_match_templates += [temp_match_template]
            comm_index.nodes.match_templates = comm_match_templates
            if fast:
                self.fast_index_save(comm_index)
            else:
                comm_index.save()

    def modify_tanakh(self, fast=False):
        sefer = NonUniqueTerm.init('sefer')
        parasha = NonUniqueTerm.init('parasha')
        indexes = library.get_indexes_in_category("Tanakh", full_records=True)
        for index in tqdm(indexes, desc='tanakh', total=indexes.count()):
            index_term = self.tanakh_map[index.title]
            index.nodes.match_templates = [
                {
                    "term_slugs": [sefer.slug, index_term.slug],
                },
                {
                    "term_slugs": [index_term.slug],
                }
            ]

            # add parsha terms
            if index.categories[-1] == 'Torah':
                for parsha_node in index.get_alt_struct_nodes():
                    parsha_term = self.parsha_map[parsha_node.get_primary_title('en')]
                    parsha_node.match_templates = [
                        {
                            "term_slugs": [parasha.slug, parsha_term.slug],
                            "scope": "any"
                        },
                        {
                            "term_slugs": [parsha_term.slug],
                            "scope": "any"
                        }
                    ]
            if fast:
                self.fast_index_save(index)
            else:
                index.save()
            self.modify_base_text_commentaries(index.title, [{"term_slugs": [index_term.slug]}], fast=fast)

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

                # update lengths
                sn = StateNode(index.title)
                ac = sn.get_available_counts("he")
                index.nodes.lengths = ac[:]

                if not generic_term:
                    print(generic_title)
                    continue
                if cat == "Yerushalmi":
                    index.nodes.addressTypes[0] = "Perek"
                    index.nodes.ref_resolver_context_swaps = {
                        "halakha": [base_term.slug, generic_term.slug]
                    }
                    index.nodes.referenceableSections = [True, True, False]
                index.nodes.match_templates = [
                    {
                        "term_slugs": [base_term.slug, generic_term.slug],
                    }
                ]
                if cat == "Mishnah":
                    index.nodes.match_templates += [{"term_slugs": [generic_term.slug]}]
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
        mid_rab_term = NonUniqueTerm.init('midrash-rabbah')
        for index in tqdm(indexes, desc='midrash rabbah', total=indexes.count()):
            tanakh_title = index.title.replace(" Rabbah", "")
            tanakh_title = tanakh_title_map.get(tanakh_title, tanakh_title)
            tanakh_term = self.tanakh_map.get(tanakh_title)
            index.nodes.match_templates = [
                {
                    "term_slugs": [tanakh_term.slug, rabbah_term.slug],
                },
                {
                    "term_slugs": [mid_rab_term.slug, tanakh_term.slug],
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
        index = library.get_index('Sifra')
        index.nodes.match_templates = [
            {
                "term_slugs": ['sifra']
            }
        ]
        for node in index.nodes.children:
            node_title = node.get_primary_title('en')
            node_title_he = node.get_primary_title('he')
            parsha_title = parsha_map.get(node_title, node_title)
            parsha_term = self.parsha_map.get(parsha_title, None)
            if parsha_term is None:
                alt_titles = other_node_map[node_title]
                node_term = self.t(en=node_title, he=node_title_he, alt_en=alt_titles, ref_part_role='structural')
                node.match_templates = [
                    {
                        "term_slugs": [node_term.slug]
                    }
                ]
            else:
                node.match_templates = [
                    {
                        "term_slugs": [parsha_term.slug]
                    }
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
                numeric_equivalent = int(num_match.group(1))
                num_term = self.perek_number_map[numeric_equivalent]  # NOTE: these terms can be used for both parsha and perek nodes b/c they only contain a "פ" prefix.
                par_per_node.numeric_equivalent = numeric_equivalent
                par_per_node.match_templates = [
                    {
                        "term_slugs": [named_term_slug, num_term.slug],
                    },
                    {
                        "term_slugs": [num_term.slug],
                    },
                ]

        if fast:
            self.fast_index_save(index)
        else:
            index.save()

    def modify_mishneh_torah(self, fast=False):
        for index in tqdm(library.get_indexes_in_category("Mishneh Torah", full_records=True), desc='mishneh torah'):
            term_key = index.title.replace("Mishneh Torah, ", "")
            term = self.mt_map[term_key]
            index.nodes.match_templates = [
                {
                    "term_slugs": ["mishneh-torah", "hilchot", term.slug]
                },
                {
                    "term_slugs": ["mishneh-torah", term.slug]
                },
                {
                    "term_slugs": ["rambam", "hilchot", term.slug]
                },
                {
                    "term_slugs": ["rambam", term.slug]
                },
                {
                    "term_slugs": ["hilchot", term.slug]
                }
            ]
            if fast:
                self.fast_index_save(index)
            else:
                index.save()

            base_match_templates = [
                {"term_slugs": ['hilchot', term.slug]},
                {"term_slugs": [term.slug]},
            ]
            self.modify_base_text_commentaries(index.title, base_match_templates, fast=fast)

    def modify_tur(self, fast=False):
        index = library.get_index('Tur')
        sa_title_swaps = {
           "Orach Chaim": "Orach Chayim",
            "Yoreh Deah": "Yoreh De'ah"
        }
        term = self.t_from_titled_obj(TitleGroup(index.schema['titles']), ref_part_role='structural')
        index.nodes.match_templates = [
            {
                "term_slugs": [term.slug]
            }
        ]
        for node in index.nodes.children:
            node_title = node.get_primary_title('en')
            node_title = sa_title_swaps.get(node_title, node_title)
            sa_term = self.sa_map.get(node_title, None)
            node.match_templates = [
                {
                    "term_slugs": [sa_term.slug]
                }
            ]
        if fast:
            self.fast_index_save(index)
        else:
            index.save()

    def modify_shulchan_arukh(self, fast=False):
        for index in library.get_indexes_in_category("Shulchan Arukh", full_records=True):
            term_key = index.title.replace("Shulchan Arukh, ", "")
            sa_term = self.sa_map[term_key]
            index.nodes.match_templates = [
                {"term_slugs": ["shulchan-arukh", sa_term.slug]},
                {"term_slugs": [sa_term.slug]},
            ]
            self.modify_base_text_commentaries(index.title, [{"term_slugs": [sa_term.slug]}], fast)
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
            term = self.t(en=ord_en[i-1], he=primary_he, alt_he=alt_he, alt_en=alt_en, ref_part_role='structural')
            term_map[i] = term
        term_map['last'] = self.t(en='last', he='בתרא', ref_part_role='structural')
        return term_map

    def create_base_non_unique_terms(self):
        NonUniqueTermSet().delete()

        self.t(en='Bavli', he='בבלי', alt_en=['Babylonian Talmud', 'B.T.', 'BT', 'Babli'], ref_part_role='structural')
        self.t(en="Gemara", he="גמרא", alt_he=["גמ'"], ref_part_role='structural')
        self.t(en="Tractate", he="מסכת", alt_en=['Masekhet', 'Masechet', 'Masekhes', 'Maseches'], ref_part_role='alt_title')
        self.t(en='Rashi', he='רש"י', ref_part_role='structural')
        self.t(en='Mishnah', he='משנה', alt_en=['M.', 'M', 'Mishna', 'Mishnah', 'Mishnaiot'], ref_part_role='structural')
        self.t(en='Tosefta', he='תוספתא', alt_en=['Tosephta', 'T.', 'Tosef.', 'Tos.'], ref_part_role='structural')
        self.t(en='Yerushalmi', he='ירושלמי', alt_en=['Jerusalem Talmud', 'J.T.', 'JT'],ref_part_role='structural')
        self.t(en='Tosafot', he='תוספות', alt_he=["תוס'", 'תוד"ה', 'תד"ה', "תו'"], alt_en=['Tosaphot'], ref_part_role='structural')
        self.t(en='Gilyon HaShas', he='גליון הש"ס', ref_part_role='structural')
        self.t(en='Midrash Rabbah', he='מדרש רבה', alt_en=['Midrash Rabba', 'Midrash Rabah'], alt_he=['מדרש רבא'], ref_part_role='structural')  # TODO no good way to compose titles for midrash rabbah...
        self.t(en='Rabbah', he='רבה', alt_en=['Rabba', 'Rabah', 'Rab.', 'R.', 'Rab .', 'R .', 'rabba', 'r.', 'r .', 'rabbati'], alt_he=['רבא'], ref_part_role='structural')
        self.t(en='Sifra', he='סיפרא', alt_he=['ספרא'], ref_part_role='structural')
        self.t(en='Ran', he='ר"ן', ref_part_role='structural')
        self.t(en='Perek', he='פרק', alt_en=["Pereq", 'Chapter'], ref_part_role='alt_title')
        self.t(en='Parasha', he='פרשה', alt_en=['Parashah', 'Parašah', 'Parsha', 'Paraša', 'Paršetah', 'Paršeta', 'Parsheta', 'Parshetah'], ref_part_role='alt_title')
        self.t(en='Sefer', he='ספר', ref_part_role='alt_title')
        self.t(en='Halakha', he='הלכה', alt_en=['Halakhah', 'Halacha', 'Halachah', 'Halakhot'], ref_part_role='context_swap')
        self.t(en='Mishneh Torah', he='משנה תורה', alt_en=["Mishnah Torah"], ref_part_role='structural')
        self.t(en='Rambam', he='רמב"ם', ref_part_role='structural')
        self.t(en='Shulchan Arukh', he='שולחן ערוך', alt_en=['shulchan aruch', 'Shulchan Aruch', 'Shulḥan Arukh', 'Shulhan Arukh', 'S.A.', 'SA', 'Shulḥan Arukh'], alt_he=['שו"ע', 'שלחן ערוך'], ref_part_role='structural')
        self.t(en='Hilchot', he='הלכות', alt_en=['Laws of', 'Laws', 'Hilkhot', 'Hilhot'], alt_he=["הל'"], ref_part_role='alt_title')
        self.t_from_titled_obj(Term().load({"name": "Parasha"}), ref_part_role='alt_title')
        for old_term in TermSet({"scheme": {"$in": ["toc_categories", "commentary_works"]}}):
            new_term = self.t_from_titled_obj(old_term, ref_part_role='structural')
            self.old_term_map[old_term.name] = new_term
        missing_old_term_names = [
            "Lechem Mishneh", "Mishneh LaMelech", "Melekhet Shelomoh", "Targum Jonathan", "Onkelos", "Targum Neofiti",
            "Targum Jerusalem", "Tafsir Rasag", "Kitzur Baal HaTurim", "Rav Hirsch", "Pitchei Teshuva",
            "Chatam Sofer", "Rabbi Akiva Eiger", "Dagul MeRevava", "Yad Ephraim", "Kereti", "Peleti", "Chiddushei Hilkhot Niddah",
            "Tiferet Yisrael"
        ]
        for name in missing_old_term_names:
            new_term = self.t_from_titled_obj(Term().load({"name": name}), ref_part_role='structural')
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
            term = self.t(en=generic_title_en, he=generic_title_he, alt_en=alt_en, alt_he=alt_he, ref_part_role='structural')
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
            "Nitzavim": ["ניצבים", "פרשת ניצבים"],
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
                        "lang": "he" if is_hebrew(alt_title) else "en"
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
            term = self.t(en=generic_title_en, he=generic_title_he, alt_en=alt_en, alt_he=alt_he,
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
            term = self.t(en=generic_title_en, he=generic_title_he, alt_en=alt_en, alt_he=alt_he,
                          ref_part_role='structural')
            title_term_map[generic_title_en] = term
        return title_term_map

    def modify_all(self):
        fast = True
        create_dhs = False
        add_comm_alt_structs = True
        self.modify_bavli(fast)
        self.modify_tanakh(fast)
        self.modify_rest_of_shas(fast)
        self.modify_bavli_commentaries(fast, create_dhs, add_comm_alt_structs)  # on first run, rerun because ArrayMapNodes are cached
        self.modify_midrash_rabbah(fast)
        self.modify_sifra(fast)
        self.modify_mishneh_torah(fast)
        self.modify_tur(fast)
        self.modify_shulchan_arukh(fast)


if __name__ == "__main__":
    modifier = RefPartModifier()
    modifier.modify_all()

"""
Add parts to Gilyon CSV

Texts to add
- commentary on Mishnah (Tosafot Yom Tov)
- Magen Avraham should have title "Magen Avraham" by itself
- Mishnah Berurah
- במס' דרך ארץ רבה פ"ג
מדרש תנחומא ר"פ וירא
בשאלתות דרא"ג פ' לך לך
"""
