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
    term.save()
    return term

def get_dh(s):
    dh_parts = re.split(r'[\-–]', s)
    if len(dh_parts) < 2:
        return
    dh = dh_parts[0]
    if '.' in dh:
        return dh.split('.')[0]
    dh = re.sub(r"מתני'|גמ'", '', dh).strip()
    return dh

def add_alt_structs():
    # Rashi
    indexes = library.get_indexes_in_category_path(['Talmud', 'Bavli', 'Rishonim on Talmud', 'Rashi'], True, True)
    for index in tqdm(indexes, desc='rashi', total=indexes.count()):
        base_index = library.get_index(index.base_text_titles[0])
        base_alt_struct = base_index.get_alt_structures()['Chapters']
        for perek_node in base_alt_struct.children:
            perek_node.wholeRef = "Rashi on " + perek_node.wholeRef
            perek_node.isSegmentLevelDiburHamatchil = True
            perek_node.aloneRefPartTermPrefixes = ["rashi"]
        base_alt_struct.validate()
        index.set_alt_structure("Chapters", base_alt_struct)
        index.save()

def create_non_unique_terms():
    NonUniqueTermSet().delete()
    DiburHamatchilNodeSet().delete()

    bavli = t(en='Bavli', he='בבלי')
    rashi = t(en='Rashi', he='רש"י')
    perek = t(en='Perek', he='פרק')

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

    # Rashi
    indexes = library.get_indexes_in_category_path(['Talmud', 'Bavli', 'Rishonim on Talmud', 'Rashi'], True, True)
    for index in tqdm(indexes, desc='rashi', total=indexes.count()):
        base_index = library.get_index(index.base_text_titles[0])
        n = index.nodes
        seg_perek_mapping = {}
        for perek_node in base_index.get_alt_struct_nodes():
            perek_ref = Ref(perek_node.wholeRef)
            for seg_ref in perek_ref.all_segment_refs():
                seg_perek_mapping["Rashi on " + seg_ref.normal()] = "Rashi on " + perek_ref.normal()
        masechet_slug = AbstractMongoRecord.normalize_slug(base_index.title)
        assert NonUniqueTerm.init(masechet_slug).get_primary_title('en') == base_index.title, f'base index: {base_index.title}. slug: {masechet_slug}'
        n.ref_part_terms = [rashi.slug, masechet_slug]
        n.ref_parts_optional = [False, False]
        n.isSegmentLevelDiburHamatchil = True
        n.referenceableSections = [True, False, True]
        index.save()
        for iseg, segment_ref in enumerate(index.all_segment_refs()):
            perek_ref = seg_perek_mapping[segment_ref.section_ref().normal()]

            # TODO remove
            if iseg > 3 and perek_ref not in {"Rashi on Beitzah 15b:1-23b:10", "Rashi on Rosh Hashanah 29b:5-35a:13"}: continue
            
            chunk = TextChunk(segment_ref, 'he')
            dh = get_dh(chunk.text)
            if dh is None:
                continue
            DiburHamatchilNode({
                "dibur_hamatchil": dh,
                "container_refs": [segment_ref.top_section_ref().normal(), perek_ref, index.title],
                "ref": segment_ref.normal()
            }).save()
if __name__ == "__main__":
    create_non_unique_terms()
    add_alt_structs()