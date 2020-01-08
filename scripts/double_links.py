__author__ = 'stevenkaplan'

# Takes ones argument - the primary name of an Index

from sefaria.model import *
from sefaria.system.exceptions import *
import csv
import sys

class DoubleLinks:
    def __init__(self):
        self.double_links = []
        self.all_links = {}
        self.both_auto = 0
        self.general_auto_specific_manual = 0
        self.specific_auto_general_manual = 0
        self.both_manual = 0
        self.duplicate_ids = {}


    def get_doubles_for_delete(self, ref1, ref2):
        if ref1 not in self.all_links:
            self.all_links[ref1] = [ref2]
        else:
            for each_ref in self.all_links[ref1]:
                if each_ref.book != ref2.book or each_ref == ref2: #first case is this can't be a double link and second case is this is an exact double (see delete_exact_doubles() below)
                    continue
                general = None
                specific = None
                found_double = False
                if each_ref.contains(ref2) and each_ref.is_section_level(): #check is_section_level() because each_ref might contain() ref2 because each_ref is a range
                    general = each_ref
                    specific = ref2
                elif ref2.contains(each_ref) and ref2.is_section_level():
                    general = ref2
                    specific = each_ref

                found_double = general is not None
                if found_double:
                    general_link = Link().load({"$and": [{"refs": general.normal()}, {"refs": ref1.normal()}]})
                    specific_link = Link().load({"$and": [{"refs": specific.normal()}, {"refs": ref1.normal()}]})
                    self.double_links.append(general_link)
                    self.gather_data(general_link, specific_link)

            self.all_links[ref1].append(ref2)
        
    
    
    def gather_data(self, general_link, specific_link):
        #FINALLY, GATHER DATA ON THE TIME OF CREATION OF THE LINK AND WHETHER IT IS MANUAL OR AUTOMATIC,
        #AND WHETHER IT IS FROM MIDRASH OR RASHI

        general_auto = general_link.auto
        # general_date = general_link._id.generation_time

        specific_auto = specific_link.auto
        # specific_date = specific_link._id.generation_time

        if specific_auto and general_auto:
            self.both_auto += 1
        elif general_auto and not specific_auto:
            self.general_auto_specific_manual += 1
        elif specific_auto and not general_auto:
            self.specific_auto_general_manual += 1
        else:
            self.both_manual += 1

    
    def delete_links_and_output_results(self):
        how_many = 0
        for l in self.double_links:
            assert l
            l.delete()
            how_many += 1
        print("Deleted {} links".format(how_many))

        print("Both auto: {}".format(self.both_auto))
        print("Both manual: {}".format(self.both_manual))
        print("General auto only: {}".format(self.general_auto_specific_manual))
        print("Specific auto only: {}".format(self.specific_auto_general_manual))





    def get_exact_doubles(self):
        ls = LinkSet()
        link_refs = {}
        count = 0
        for l in ls:
            refs = tuple(sorted(l.refs))
            if refs in link_refs:
                count += 1
                if refs not in self.duplicate_ids:
                    first_link_id = link_refs[refs]
                    self.duplicate_ids[refs] = [l._id, first_link_id]
                else:
                    self.duplicate_ids[refs].append(l._id)
            else:
                link_refs[refs] = l._id


    def delete_exact_doubles(self):
        total = 0
        deleted_num = 0
        source_text = 0
        generated_by = 0
        for refs_key in self.duplicate_ids:
            primary_link_to_save = None
            secondary_link_to_save = None
            ids = self.duplicate_ids[refs_key]
            total += len(ids)

            #determine which link should not be deleted, with priority to having a source_text_oid,
            #if there isn't one, then pick the one that has a generated_by,
            #finally, if there isn't a generated_by, then just pick the first one
            assert len(ids) > 1
            for id in ids:
                l = Link().load({"_id": id})
                if l.source_text_oid:
                    primary_link_to_save = l._id
                    break
                if l.generated_by:
                    secondary_link_to_save = l._id

            if primary_link_to_save:
                ids = [id for id in ids if id != primary_link_to_save]
                source_text += 1
            elif secondary_link_to_save:
                ids = [id for id in ids if id != secondary_link_to_save]
                generated_by += 1
            else:
                ids = ids[1:]

            for id in ids:
                l = Link().load({"_id": id})
                l.delete()
                deleted_num += 1

        print("Number of refs that have more than one link: {}".format(len(self.duplicate_ids)))
        print("Number of links deleted: {}".format(deleted_num))
        print("Number of links total: {}".format(total))
        print("Number of source_text_oid: {}".format(source_text))
        print("Number of generated_by: {}".format(generated_by))




if __name__ == "__main__":
    DL = DoubleLinks()
    #DL.get_exact_doubles()
    #DL.delete_exact_doubles()


    count = 0
    assert len(sys.argv) != 1, "Input error: Requires name of text."
    title = " ".join(sys.argv[1:])
    print(title)
    index = library.get_index(title)
    category = index.categories[0]
    delete = True
    for l in LinkSet(Ref(title)):
        count += 1
        if count % 10000 == 0:
            print(count)
        ref1, ref2 = l.refs
        invalid = False
        try:
            ref1 = Ref(ref1)
        except InputError:
            invalid = True
            l.delete()
            continue
        try:
            ref2 = Ref(ref2)
        except InputError:
            invalid = True
            l.delete()
            continue

        if not invalid:
            if ref1.book != title:
                DL.get_doubles_for_delete(ref1, ref2)
            elif ref2.book != title:
                DL.get_doubles_for_delete(ref2, ref1)
            else:
                DL.get_doubles_for_delete(ref1, ref2)
                DL.get_doubles_for_delete(ref2, ref1)

    DL.delete_links_and_output_results()
