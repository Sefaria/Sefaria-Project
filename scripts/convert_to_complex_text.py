# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.model.schema import *
from sefaria.utils.util import list_depth
from sefaria.datatype.jagged_array import *
from sefaria.helper.link import *

import json
import argparse
import csv




def migrate_to_complex_structure(title, schema, mappings):
    #print title
    #print mappings
    #print json.dumps(schema)
    print("begin conversion")
    #TODO: add method on model.Index to change all 3 (title, nodes.key and nodes.primary title)

    #create a new index with a temp file #make sure to later add all the alternate titles
    old_index = Index().load({"title": title})
    new_index_contents = {
        "title": title,
        "categories": old_index.categories,
        "schema": schema
    }
    #TODO: these are ugly hacks to create a temp index
    temp_index = Index(new_index_contents)
    en_title = temp_index.get_title('en')
    temp_index.title = "Complex {}".format(en_title)
    he_title = temp_index.get_title('he')
    temp_index.set_title('{} זמני'.format(he_title), 'he')
    temp_index.save()
    #the rest of the title variants need to be copied as well but it will create conflicts while the orig index exists, so we do it after removing the old index in completely_delete_index_and_related.py

    #create versions for the main text
    versions = VersionSet({'title': title})
    migrate_versions_of_text(versions, mappings, title, temp_index.title, temp_index)

    #are there commentaries? Need to move the text for them to conform to the new structure
    #basically a repeat process of the above, sans creating the index record
    #commentaries = library.get_commentary_versions_on_book(title)
    #migrate_versions_of_text(commentaries, mappings, title, temp_index.title, temp_index)
    #duplicate versionstate
    #TODO: untested
    vstate_old = VersionState().load({'title':title })
    vstate_new = VersionState(temp_index)
    vstate_new.flags = vstate_old.flags
    vstate_new.save()



"""def prepare_mapping(mappings, text_title, orig_title_component, temp_title_component):
    return [[mapping[0].replace(orig_title_component, text_title), mapping[1].replace(orig_title_component, text_title).replace(orig_title_component, temp_title_component)] for mapping in mappings]"""

def migrate_versions_of_text(versions, mappings, orig_title, new_title, base_index):
    for i, version in enumerate(versions):
        print(version.versionTitle.encode('utf-8'))
        new_version_title = version.title.replace(orig_title, new_title)
        print(new_version_title)
        new_version = Version(
                {
                    "chapter": base_index.nodes.create_skeleton(),
                    "versionTitle": version.versionTitle,
                    "versionSource": version.versionSource,
                    "language": version.language,
                    "title": new_version_title
                }
            )
        for attr in ['status', 'license', 'method', 'versionNotes', 'priority', "digitizedBySefaria", "heversionSource"]:
            value = getattr(version, attr, None)
            if value:
                setattr(new_version, attr, value)
        new_version.save()
        for mapping in mappings:
            #this makes the mapping contain the correct text/commentary title
            orig_ref = mapping[0].replace(orig_title, version.title)
            print(orig_ref)
            orRef = Ref(orig_ref)
            tc = orRef.text(lang=version.language, vtitle=version.versionTitle)
            ref_text = tc.text

            #this makes the destination mapping contain both the correct text/commentary title
            # and have it changed to the temp index title
            dest_ref = mapping[1].replace(orig_title, version.title)
            dest_ref = dest_ref.replace(orig_title, new_title)
            print(dest_ref)

            dRef = Ref(dest_ref)
            ref_depth = dRef.range_index() if dRef.is_range() else len(dRef.sections)
            text_depth = 0 if isinstance(ref_text, str) else list_depth(ref_text) #length hack to fit the correct JA
            implied_depth = ref_depth + text_depth
            desired_depth = dRef.index_node.depth
            for i in range(implied_depth, desired_depth):
                ref_text = [ref_text]

            new_tc = dRef.text(lang=version.language, vtitle=version.versionTitle)
            new_tc.versionSource = version.versionSource
            new_tc.text = ref_text
            new_tc.save()
            VersionState(dRef.index.title).refresh()
            #links
            linker = dref.autolinker(user=8646)
            if linker:
                linker.refresh_links()
            add_links_from_text(dRef, new_version.language, new_tc.text, new_version._id, 8646)
            if i == 0: #links are the same across versions
                migrate_links_of_ref(orRef, dRef)
            #version history
            text_hist = HistorySet({"ref": {"$regex": orRef.regex()}, 'version': version.versionTitle })
            for h in text_hist:
                new_h = h.copy()
                new_h.ref = translate_ref(Ref(h.ref), orRef, dRef).normal()
                new_h.save()


def translate_ref(ref, originScopeRef, destScopeRef):
    curStartRef = ref.starting_ref()
    curEndRef = ref.ending_ref()
    cdict = destScopeRef._core_dict()
    cdict["sections"]= curStartRef.in_terms_of(originScopeRef)
    cdict["toSections"]= curEndRef.in_terms_of(originScopeRef)
    return Ref(_obj=cdict)

#TODO: adapt to be able to remap links for the commentaries as well
def migrate_links_of_ref(orRef, destRef):
    query = {"$and" : [{ "refs": {"$regex": orRef.regex(), "$options": 'i'}}, { "$or" : [ { "auto" : False }, { "auto" : 0 }, {"auto" :{ "$exists": False}} ] } ]}
    ref_links = LinkSet(query)

    for link in ref_links:
        print(link.refs)
        linkRef1 = Ref(link.refs[0])
        linkRef2 = Ref(link.refs[1])
        curLinkRef = linkRef1 if orRef.contains(linkRef1) else linkRef2 #make sure we manipulate the right ref
        tranlsatedLinkRef = translate_ref(curLinkRef, orRef, destRef)
        newrefs = [tranlsatedLinkRef.normal(), linkRef2.normal()] if linkRef1 == curLinkRef else [linkRef1.normal(), tranlsatedLinkRef.normal()]
        tranlsatedLink = Link({'refs': newrefs, 'type': link.type})
        try:
            tranlsatedLink.save()
            make_link_history_record(curLinkRef, tranlsatedLinkRef)
            print(newrefs)
        except DuplicateRecordError:
            print("SUCH A LINK ALREADY EXISTS: {}".format(newrefs))


def make_link_history_record(curLinkRef, tranlsatedLinkRef):
    link_history = HistorySet({"new.refs": curLinkRef.normal(),'rev_type': {"$regex": 'link'}})
    for h in link_history:
        new_h = h.copy()
        new_h.new["refs"] = [r.replace(curLinkRef.normal(), tranlsatedLinkRef.normal(), 1) for r in h.new["refs"]]
        if getattr(h,'old', None):
            new_h.old["refs"] = [r.replace(curLinkRef.normal(), tranlsatedLinkRef.normal(), 1) for r in h.old["refs"]]
        new_h.save()
































""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("title", help="title of existing index record")
    parser.add_argument("schema_file", help="path to json schema file")
    parser.add_argument("mapping_file", help="title of existing index record")
    args = parser.parse_args()
    """args.title = 'Pesach Haggadah'
    args.schema_file = "data/tmp/pesach_haggadah_complex.json"
    args.mapping_file = "data/tmp/Pessach Haggadah Convert.csv"""""
    print(args)
    with open(args.schema_file, 'r') as filep:
        schema = json.load(filep)
    with open(args.mapping_file, 'rb') as csvfile:
        mapping_csv = csv.reader(csvfile, delimiter='\t')
        mappings = []
        next(mapping_csv, None)
        for entry in mapping_csv:
            mappings.append(entry)
    migrate_to_complex_structure(args.title, schema, mappings)