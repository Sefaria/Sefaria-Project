import django

django.setup()
from sefaria.model import *
import re
from sefaria.utils.hebrew import strip_cantillation, encode_hebrew_numeral
from sefaria.model.linker.match_template import MatchTemplate
from sefaria.model.schema import Term, SchemaNode, ArrayMapNode
from sefaria.model.schema import NonUniqueTerm
from sefaria.system.exceptions import InputError
from sefaria.helper.linker_index_converter import LinkerIndexConverter, ReusableTermManager, LinkerCategoryConverter

RTM = ReusableTermManager()


def convert_kitzur_sa():
    def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
        if is_alt_node: return
        kitzur = RTM.create_term(en='Kitzur', alt_en=['Kitsur', 'Kiẓur'], he='קיצור', delete_if_existing=True).slug
        sa = "shulchan-arukh"
        oc = "orach-chayim"
        return [MatchTemplate([kitzur, sa, oc]), MatchTemplate([kitzur, sa])]

    converter = LinkerIndexConverter('Kitzur Shulchan Arukh', get_match_templates=get_match_templates)
    converter.convert()


def convert_tos_akiva_eiger():
    akiva_slug = RTM.create_term_from_titled_obj(Term().load({"name": "Tosafot Rabbi Akiva Eiger"})).slug

    def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
        if node.is_root():
            title = node.get_primary_title('en')
            mishnah_title = title.replace("Tosafot Rabbi Akiva Eiger on Mishnah ", "")
            mishnah_title = mishnah_title.replace("Tosafot Rabbi Akiva Eiger on ", "")  # for pirkei avot
            mishnah_term = NonUniqueTerm().load({"titles.text": mishnah_title})
            if mishnah_term is None:
                print(mishnah_title)
            mishnah_term = mishnah_term.slug
            return [
                MatchTemplate([akiva_slug, mishnah_term]),
                MatchTemplate([akiva_slug, 'mishnah', mishnah_term]),
            ]
        if is_alt_node:
            alt_term = NonUniqueTerm().load({"titles.text": node.get_primary_title('en')})
            if not alt_term:
                alt_term = RTM.create_term_from_titled_obj(node)

            return [
                MatchTemplate([alt_term.slug])
            ]

    def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
        if not is_alt_node:
            return {'addressTypes': ['Perek', 'Mishnah', 'Integer']}

    converter = LinkerCategoryConverter('Tosafot Rabbi Akiva Eiger', include_dependant=True,
                                        get_match_templates=get_match_templates, get_other_fields=get_other_fields)
    converter.convert()


def convert_jt_alts():
    def get_match_templates(node: ArrayMapNode, depth, isibling, num_siblings, is_alt_node):
        perek_num_slugs = [NonUniqueTerm.normalize_slug(ord_en) for ord_en in
                           ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth',
                            'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth',
                            'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth', 'Twenty First', 'Twenty Second',
                            'Twenty Third', 'Twenty Fourth', 'Twenty Fifth', 'Twenty Sixth', 'Twenty Seventh',
                            'Twenty Eighth', 'Twenty Ninth', 'Thirtieth']]
        bt_name = node.ref().index.title.replace("Jerusalem Talmud ", "")
        bt_index = Index().load({"title": bt_name})
        if is_alt_node:
            perek_num = isibling % (num_siblings // 2)
            if bt_index:
                assert isinstance(bt_index, Index)
                bt_alt_node = bt_index.get_alt_struct_leaves()[perek_num]
                assert isinstance(bt_alt_node, ArrayMapNode)
                return list(bt_alt_node.get_match_templates())
            else:
                # not in Bavli
                perek_slug = "perek"
                perek_name = derive_perek_name(node)
                perek_key = "jt" + bt_name + str(perek_num)
                perek_term = RTM.get_term_by_primary_title(perek_key, perek_name)
                if not perek_term:
                    perek_term = RTM.create_term(en=perek_name, he=perek_name, context=perek_key)
                is_last = perek_num == (num_siblings // 2) - 1
                numeric_equivalent = min(perek_num, 29)
                perek_num_slug = perek_num_slugs[numeric_equivalent]
                match_templates = [
                    MatchTemplate([perek_slug, perek_term.slug], scope='any'),
                    MatchTemplate([perek_slug, perek_num_slug]),
                    MatchTemplate([perek_term.slug], scope='any'),
                    MatchTemplate([perek_num_slug])
                ]
                if is_last:
                    match_templates += [
                        MatchTemplate([perek_slug, "last"]),
                        MatchTemplate(["last"]),
                    ]
                return match_templates
        else:
            # default struct
            talmud_slug = "talmud"
            tractate_slug = "tractate"
            other_shas_index = bt_index or Index().load({"title": f"Mishnah {bt_name}"})
            generic_term = list(list(other_shas_index.nodes.get_match_templates())[0].terms)[-1]
            match_templates = [
                MatchTemplate(["yerushalmi", generic_term.slug]),
                MatchTemplate(["yerushalmi", tractate_slug, generic_term.slug]),
                MatchTemplate([talmud_slug, "yerushalmi", tractate_slug, generic_term.slug]),
                MatchTemplate([talmud_slug, "yerushalmi", generic_term.slug]),
            ]
            return match_templates

    def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
        if is_alt_node:
            perek_num = isibling % (num_siblings // 2)
            return {"numeric_equivalent": min(perek_num + 1, 30), "referenceable": "optional"}

    converter = LinkerCategoryConverter('Yerushalmi', is_corpus=True, get_match_templates=get_match_templates,
                                        get_other_fields=get_other_fields)
    converter.convert()


parasha_term_map = {}
for index in library.get_indexes_in_corpus("Tanakh", full_records=True):
    if index.title not in {"Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"}:
        continue
    for parasha_node in index.get_alt_struct_leaves():
        parasha_term = list(list(parasha_node.get_match_templates())[0].terms)[-1]
        parasha_term_map[parasha_term.get_primary_title("en")] = parasha_term


def get_parasha_term(title):
    return parasha_term_map.get(title)


def convert_zohar():
    def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
        sefer_slug = "sefer"
        parasha_slug = "parasha"
        if is_alt_node:
            title = node.get_primary_title('en')
            if title.startswith("Volume"):
                volume_term = RTM.get_or_create_term_for_titled_obj(node, new_alt_titles=['ח"א', "חלק א", "חלק א'"])
                return [MatchTemplate([volume_term.slug])]
            else:
                parasha_term = get_parasha_term(title)
                if parasha_term:
                    return [
                        MatchTemplate([parasha_slug, parasha_term.slug]),
                        MatchTemplate([parasha_term.slug]),
                    ]
                else:
                    term_key = "zohar"
                    if not title and not node.get_primary_title('he'):
                        # empty node titles
                        return []
                    misc_term = RTM.get_term_by_primary_title(term_key, title)
                    if not misc_term:
                        misc_term = RTM.create_term_from_titled_obj(node, context=term_key)
                    return [MatchTemplate([misc_term.slug])]
        else:
            if node.is_root():
                title_slug = "zohar"
                return [
                    MatchTemplate([sefer_slug, title_slug]),
                    MatchTemplate([title_slug])
                ]

    def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
        if is_alt_node:
            title = node.get_primary_title('en')
            if title.startswith("Volume"):
                volume_num = title.replace("Volume ", "")
                return {"numeric_equivalent": len(volume_num), "referenceable": "optional"}

            parasha_term = get_parasha_term(title)
            if parasha_term:
                return {"referenceable": "optional"}

            # if not title and not node.get_primary_title('he'):
            #     # empty node titles
            #     return {"referenceable": "DELETE!"}

    converter = LinkerCategoryConverter('Zohar', is_index=True, get_match_templates=get_match_templates,
                                        get_other_fields=get_other_fields)
    converter.convert()


def derive_perek_name(perek: ArrayMapNode):
    oref = Ref(perek.wholeRef).range_list()[0]
    # guarantee beginning of perek
    oref = oref.section_ref().all_segment_refs()[0]
    seg_text = oref.text('he').as_string()
    seg_text = TextChunk.strip_itags(seg_text)
    seg_text = re.sub(r"<[^>]+>", "", seg_text)
    seg_text = strip_cantillation(seg_text, strip_vowels=True)
    seg_text = re.sub("^משנה: ", "", seg_text)
    seg_text = seg_text.replace("־", " ")
    seg_text = seg_text.strip()
    perek_name = " ".join(seg_text.split()[:2])
    return perek_name


def fix_bavli_perek_names():
    """
    bavli perakim: add Hebrew as English
    @return:
    """
    for index in library.get_indexes_in_corpus("Bavli", full_records=True):
        for perek in index.get_alt_struct_leaves():
            term = list(list(perek.get_match_templates())[0].terms)[-1]
            term.title_group.add_title(term.get_primary_title("he"), "en", True, True)
            secondary_titles = term.title_group.secondary_titles("en")
            if len(secondary_titles) > 0:
                term.title_group.remove_title(secondary_titles[0], "en")
            print(term.get_primary_title("en"))
            term.save()


def delete_bad_yerushalmi_pereks():
    for i in range(1, 12):
        gematria = encode_hebrew_numeral(i, punctuation=False)
        query = {"titles.text": {"$all": [f"Chapter {i}", f"פרק {gematria}"]}}
        NonUniqueTermSet(query).delete()


def make_aliyot_unreferenceable():
    for index in library.get_indexes_in_category_path(["Tanakh", "Torah"], full_records=True):
        for parsha in index.get_alt_struct_leaves():
            parsha.isMapReferenceable = False
        index.save()


def convert_sefer_hachinukh():
    #chinukh has two different mitzvot order. I think ours is the common
    def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
        if node.is_root():
            return [
                MatchTemplate(["hachinukh"]),
                MatchTemplate(['sefer', "hachinukh"])
            ]
        if is_alt_node: #TODO - we need to change the code to catch the mittzah after parashah
            title = node.get_primary_title('en')
            parasha_term = get_parasha_term(title)
            if not parasha_term:
                return
            return [
                MatchTemplate([parasha_term.slug]),
                MatchTemplate(["parasha", parasha_term.slug])
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


def convert_bahir():
    def title_modifier(lang, title):
        return title.replace("Sefer ", "").replace("ספר ", "")
    def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
        if is_alt_node: return
        bahir_term = RTM.get_or_create_term_for_titled_obj(node, title_modifier=title_modifier)
        return [MatchTemplate(["sefer", bahir_term.slug]), MatchTemplate([bahir_term.slug])]

    converter = LinkerIndexConverter('Sefer HaBahir', get_match_templates=get_match_templates)
    converter.convert()


def convert_moreh_nevuchim():
    def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
        if is_alt_node: return
        title = node.get_primary_title('en')
        if title.startswith("Part "):
            part_num = title.replace("Part ", "")
            part_heb_letter = encode_hebrew_numeral(int(part_num), punctuation=False)
            term = RTM.get_or_create_term_for_titled_obj(node, new_alt_titles=[f'ח"{part_heb_letter}', f"חלק {part_heb_letter}", part_heb_letter, f"{part_heb_letter}'"])
        else:
            try:
                term = RTM.get_or_create_term_for_titled_obj(node)
            except InputError as e:
                # No title. Just a JA, skip
                return None
        if node.is_root():
            return [MatchTemplate(["sefer", term.slug]), MatchTemplate([term.slug])]
        return [MatchTemplate([term.slug])]

    def get_other_fields(node, depth, *args):
        title = node.get_primary_title('en')
        if title.startswith("Part "):
            part_num = title.replace("Part ", "")
            return {"numeric_equivalent": int(part_num)}

    converter = LinkerIndexConverter('Guide for the Perplexed', get_match_templates=get_match_templates, get_other_fields=get_other_fields)
    converter.convert()

if __name__ == '__main__':
    # convert_kitzur_sa()
    # convert_tos_akiva_eiger()
    # convert_jt_alts()
    # convert_zohar()
    # fix_bavli_perek_names()
    # make_aliyot_unreferenceable()
    # convert_sefer_hachinukh()
    # delete_bad_yerushalmi_pereks()
    # convert_bahir()
    convert_moreh_nevuchim()
