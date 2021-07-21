import django, re
django.setup()
from tqdm import tqdm
from sefaria.model import *
from sefaria.model.abstract import AbstractMongoRecord
from sefaria.model.schema import DiburHamatchilNode, DiburHamatchilNodeSet


def t(**kwargs):
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
    term.save()
    return term


def t_from_titled_obj(obj):
    en_title = obj.get_primary_title('en')
    he_title = obj.get_primary_title('he')
    alt_en_titles = [title for title in obj.title_group.all_titles('en') if title != en_title]
    alt_he_titles = [title for title in obj.title_group.all_titles('he') if title != he_title]
    return t(en=en_title, he=he_title, alt_en=alt_en_titles, alt_he=alt_he_titles)


def get_dh(s, regexes, oref):
    for reg in regexes:
        match = re.search(reg, s)
        if not match: continue
        s = match.group(1)
    s = s.strip()
    return s


def get_dh_regexes(index, comm_term_slug):
    reg_map = {
        "rashi": ['^(.+?)[\-–]', '\.(.+?)$', "^(?:(?:מתני'|גמ')\s?)?(.+)$"],
        "ran": ['^(.+?)[\-–]', "^(?:(?:מתני'|גמ')\s?)?(.+)$"],
        "tosafot": ['^(.+?)[\-–\.]', "^(?:(?:מתני'|גמ')\s?)?(.+)$"]
    }
    return reg_map.get(index.title, reg_map.get(comm_term_slug))


def modify_commentaries():
    DiburHamatchilNodeSet().delete()
    for comm_ref_prefix, comm_term_slug, comm_cat_path in (
        ('Rashi on ', 'rashi', ['Talmud', 'Bavli', 'Rishonim on Talmud', 'Rashi']),
        ('Tosafot on ', 'tosafot', ['Talmud', 'Bavli', 'Rishonim on Talmud', 'Tosafot']),
        ('Ran on ', 'ran', ['Talmud', 'Bavli', 'Rishonim on Talmud', 'Ran']),
    ):
        indexes = library.get_indexes_in_category_path(comm_cat_path, True, True)
        for index in tqdm(indexes, desc=comm_term_slug, total=indexes.count()):
            # if "Nedarim" not in index.title: continue
            add_new_fields_to_commentary_root_node(comm_ref_prefix, comm_term_slug, index)
            add_dibur_hamatchils(comm_ref_prefix, index)
            add_alt_structs(comm_ref_prefix, comm_term_slug, index)


def add_new_fields_to_commentary_root_node(comm_ref_prefix, comm_term_slug, index):
    comm_term = NonUniqueTerm.init(comm_term_slug)
    base_index = library.get_index(index.base_text_titles[0])
    n = index.nodes

    masechet_slug = AbstractMongoRecord.normalize_slug(base_index.title)
    assert NonUniqueTerm.init(masechet_slug).get_primary_title('en') == base_index.title, f'base index: {base_index.title}. slug: {masechet_slug}'
    n.ref_part_terms = [comm_term.slug, masechet_slug]
    n.ref_parts_optional = [False, False]
    n.isSegmentLevelDiburHamatchil = True
    n.referenceableSections = [True, False, True]
    n.diburHamatchilRegexes = get_dh_regexes(index, comm_term_slug)
    index.save()


def add_dibur_hamatchils(comm_ref_prefix, index):
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
        dh = get_dh(chunk.text, index.nodes.diburHamatchilRegexes, segment_ref)
        if dh is None:
            continue
        DiburHamatchilNode({
            "dibur_hamatchil": dh,
            "container_refs": [segment_ref.top_section_ref().normal(), perek_ref, index.title],
            "ref": segment_ref.normal()
        }).save()


def add_alt_structs(comm_ref_prefix, comm_term_slug, index):
    base_index = library.get_index(index.base_text_titles[0])
    base_alt_struct = base_index.get_alt_structures()['Chapters']
    for perek_node in base_alt_struct.children:
        perek_node.wholeRef = comm_ref_prefix + perek_node.wholeRef
        perek_node.isSegmentLevelDiburHamatchil = True
        perek_node.aloneRefPartTermPrefixes = [comm_term_slug]
    base_alt_struct.validate()
    index.set_alt_structure("Chapters", base_alt_struct)
    index.save()
    for perek_node in base_alt_struct.children:
        perek_node.wholeRef = perek_node.wholeRef[len(comm_ref_prefix):]
        delattr(perek_node, 'isSegmentLevelDiburHamatchil')
        delattr(perek_node, 'aloneRefPartTermPrefixes')


def modify_talmud():
    perek = NonUniqueTerm.init('perek')
    bavli = NonUniqueTerm.init('bavli')
    minor_tractates = {title for title in library.get_indexes_in_category("Minor Tractates")}
    indexes = library.get_indexes_in_category("Bavli", full_records=True)
    for index in tqdm(indexes, desc='talmud', total=indexes.count()):
        if index.title in minor_tractates: continue
        index_term = NonUniqueTerm({
            "slug": index.title,
            "titles": index.nodes.title_group.titles
        })
        index_term.save()
        index.nodes.ref_part_terms = [bavli.slug, index_term.slug]
        index.nodes.ref_parts_optional = [True, False]

        # add perek terms
        for perek_node in index.get_alt_struct_nodes():
            perek_term = t(he=perek_node.get_primary_title('he'))  # TODO english titles are 'Chapter N'. Is that an issue?
            perek_node.ref_part_terms = [perek.slug, perek_term.slug]
            perek_node.ref_parts_optional = [True, False]
            perek_node.referenceableAlone = True
        index.save()


def modify_tanakh():
    sefer = NonUniqueTerm.init('sefer')
    parasha = NonUniqueTerm.init('parasha')
    indexes = library.get_indexes_in_category("Tanakh", full_records=True)
    for index in tqdm(indexes, desc='tanakh', total=indexes.count()):
        index_term = NonUniqueTerm({
            "slug": index.title,
            "titles": index.nodes.title_group.titles
        })
        index_term.save()
        index.nodes.ref_part_terms = [sefer.slug, index_term.slug]
        index.nodes.ref_parts_optional = [True, False]

        # add parsha terms
        if index.categories[-1] == 'Torah':
            for parsha_node in index.get_alt_struct_nodes():
                parsha_term = t_from_titled_obj(parsha_node)
                parsha_node.ref_part_terms = [parasha.slug, parsha_term.slug]
                parsha_node.ref_parts_optional = [True, False]
                parsha_node.referenceableAlone = True
        index.save()


def create_base_non_unique_terms():
    NonUniqueTermSet().delete()

    t(en='Bavli', he='בבלי')
    t(en='Rashi', he='רש"י')
    t(en='Tosafot', he='תוספות', alt_he=["תוס'", 'תוד"ה', 'תד"ה',])
    t(en='Ran', he='ר"ן')
    t(en='Perek', he='פרק')
    t(en='Sefer', he='ספר')
    t_from_titled_obj(Term().load({"name": "Parasha"}))

if __name__ == "__main__":
    # create_base_non_unique_terms()
    # modify_talmud()
    modify_tanakh()
    # modify_commentaries()