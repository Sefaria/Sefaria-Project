# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.model.schema import *
from sefaria.utils.util import list_depth
from sefaria.datatype.jagged_array import *

import json
import argparse
import csv




def migrate_to_complex_structure(title, schema, mapping):
    print title
    print mappings
    print json.dumps(schema)

    #TODO: add method on model.Index to change all 3 (title, nodes.key and nodes.primary title)

    #create a new index with a temp file #make sure to later add all the alternate titles
    old_index = Index().load({"title": title})
    new_index_contents = {
        "title": title,
        "categories": old_index.categories,
        "schema": schema
    }
    #TODO: these are ugly hacks to create a temp index
    complex_index = Index(new_index_contents)
    en_title = complex_index.get_title('en')
    complex_index.title = "Complex {}".format(en_title)
    he_title = complex_index.get_title('he')
    complex_index.set_title(u'{} זמני'.format(he_title), 'he')
    complex_index.save()

    #create versions for the main text
    versions = VersionSet({'title': title})
    migrate_versions_of_text(title, complex_index.title, complex_index, versions, mapping)

    #are there commentaries? Need to move the text for them to conform to the new structure
    #basically a repeat process of the above, sans creating the index record
    commentaries = library.get_commentary_versions_on_book(title)
    migrate_versions_of_text(title, complex_index.title, complex_index, commentaries, mapping)




def migrate_versions_of_text(orig_title, new_title, base_index, versions, mapping):
    for version in versions:
        new_version_title = version.title.replace(orig_title, new_title)
        print new_version_title
        new_version = Version(
                {
                    "chapter": base_index.nodes.create_skeleton(),
                    "versionTitle": version.versionTitle,
                    "versionSource": version.versionSource,
                    "language": version.language,
                    "title": new_version_title
                }
            )
        for attr in ['status', 'license', 'licenseVetted']:
            value = getattr(version, attr, None)
            if value:
                setattr(new_version, attr, value)
        new_version.save()
        for mapping in mappings:
            orig_ref = mapping[0].replace(orig_title, version.title)
            print orig_ref
            tc = Ref(orig_ref).text(lang=version.language, vtitle=version.versionTitle)
            ref_text = tc.text

            dest_ref = mapping[1].replace(orig_title, version.title)
            dest_ref = dest_ref.replace(orig_title, new_title)
            print dest_ref
            dRef = Ref(dest_ref)

            ref_depth = dRef.range_index() if dRef.is_range() else len(dRef.sections)
            text_depth = 0 if isinstance(ref_text, basestring) else list_depth(ref_text)
            implied_depth = ref_depth + text_depth
            desired_depth = dRef.index_node.depth
            for i in range(implied_depth, desired_depth):
                ref_text = [ref_text]

            new_tc = dRef.text(lang=version.language, vtitle=version.versionTitle)
            new_tc.versionSource = version.versionSource
            new_tc.text = ref_text
            new_tc.save()
        #additional attributes?

        # new_version = Version().load({'title': new_version_title, 'versionTitle': version.versionTitle})




































""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    #parser.add_argument("title", help="title of existing index record")
    #parser.add_argument("schema_file", help="path to json schema file")
    #parser.add_argument("mapping_file", help="title of existing index record")
    args = parser.parse_args()
    args.title = 'Pesach Haggadah'
    args.schema_file = "data/tmp/pesach_haggadah_complex.json"
    args.mapping_file = "data/tmp/Pessach Haggadah Convert.csv"
    print args
    with open(args.schema_file, 'r') as filep:
        schema = json.load(filep)
    with open(args.mapping_file, 'rb') as csvfile:
        mapping_csv = csv.reader(csvfile, delimiter='\t')
        mappings = []
        next(mapping_csv, None)
        for entry in mapping_csv:
            mappings.append(entry)
    migrate_to_complex_structure(args.title, schema, mappings)