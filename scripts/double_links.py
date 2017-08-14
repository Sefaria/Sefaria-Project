# -*- coding: utf-8 -*-

__author__ = 'stevenkaplan'
from sefaria.model import *
from sefaria.system.exceptions import *
import csv
import sys

class DoubleLinks:
    def __init__(self):
        self.specific_first_num = 0
        self.commentary = 0
        self.less_informatives = []
        self.more_informatives = []
        self.midrash = 0
        self.all_links = {}
        self.both_auto = 0
        self.general_auto_specific_manual = 0
        self.specific_auto_general_manual = 0
        self.both_manual = 0
        self.tanakh = 0
        self.tanakh_only = False
        self.other = 0
        self.duplicate_ids = {}


    def set_tanakh(self, bool):
        self.tanakh_only = bool


    def get_doubles_for_delete(self, ref1, ref2, ranges=False):
        '''
        :param ref1:
        The reference in the book/category we aren't focused on.  We build a dictionary all_links
        that stores every reference from books/categories we aren't focused on as a key,
        and each key points to an array of 0...n references in the book/category we are focused on.
        :param ref2:
        The reference in book/category we are focused on.
        :param ranges:
        Whether or not we look for a range to double a particular reference or we look for a section.
        For example,
        If ranges == True, then the range Exodus 1:1-15 and Exodus 1:3-5 are considered doubles for Exodus 1:4, but
         Exodus 1 is not a double for Exodus 1:4 because it is a section-level ref, not a range.
        If ranges == False, then the only possible double for Exodus 1:4 will be on the section level: Exodus 1.
        '''
        contains_lambda = lambda x, y: x.contains(y) and x.is_section_level()
        overlaps_lambda = lambda x, y: x.overlaps(y) and x.is_range()
        double_lambda = contains_lambda if ranges is False else overlaps_lambda
        if ref1 not in self.all_links:
            self.all_links[ref1] = [ref2]
        else:
            for each_ref in self.all_links[ref1]:
                if each_ref.book != ref2.book or each_ref == ref2:
                    continue
                general = None
                specific = None
                if double_lambda(each_ref, ref2):
                    general = each_ref
                    specific = ref2
                elif double_lambda(ref2, each_ref):
                    general = ref2
                    specific = each_ref
                
                if general:
                    self.create_link_dict_and_gather_data(ref1, general, specific)

            self.all_links[ref1].append(ref2)
        
    
    
    def create_link_dict_and_gather_data(self, ref1, general, specific):
        #FIRST, CHECK THAT SPECIFIC AND GENERAL ARE BOTH TANAKH
        #assert general.primary_category == "Tanakh" and specific.primary_category == "Tanakh", "{} {} {}".format(ref1, general, specific)

        general_link = Link().load({"$and": [{"refs": general.normal()}, {"refs": ref1.normal()}]})
        specific_link = Link().load({"$and": [{"refs": specific.normal()}, {"refs": ref1.normal()}]})

        self.less_informatives.append(general_link)
        self.more_informatives.append(specific_link)

        #FINALLY, GATHER DATA ON THE TIME OF CREATION OF THE LINK AND WHETHER IT IS MANUAL OR AUTOMATIC,
        #AND WHETHER IT IS FROM MIDRASH OR RASHI

        general_auto = general_link.auto
        general_date = general_link._id.generation_time

        specific_link = Link().load({"$and": [{"refs": specific.normal()}, {"refs": ref1.normal()}]})
        specific_auto = specific_link.auto
        specific_date = specific_link._id.generation_time

        if specific_date >= general_date:
            self.specific_first_num += 1
            if specific_auto and general_auto:
                self.both_auto += 1
            elif general_auto and not specific_auto:
                self.general_auto_specific_manual += 1
            elif specific_auto and not general_auto:
                self.specific_auto_general_manual += 1
            else:
                self.both_manual += 1

        if "Commentary" in ref1.index.categories:
            self.commentary += 1
        elif "Midrash" in ref1.index.categories:
            self.midrash += 1
        elif "Tanakh" in ref1.index.categories:
            self.tanakh += 1
        else:
            self.other += 1


    @staticmethod
    def get_links_category(self, category):
        ls = []
        indexes = library.get_indexes_in_category(category)
        for index in indexes:
            ls += LinkSet(Ref(index))
        return ls


    
    def delete_links_and_output_results(self):
        how_many = 0
        print "LESS INFORMATIVES.."
        less_informative_set = set()
        more_informative_set = set()
        for l in self.less_informatives:
            refs = ", ".join(l.contents()["refs"])
            less_informative_set.add(refs)
            #l.delete()
            how_many += 1

        print "MORE INFORMATIVES..."
        for l in self.more_informatives:
            refs = l.contents()["refs"]
            more_informative_set.add(refs)

        print more_informative_set

        print "Deleted {} links".format(how_many)

        print "Both auto: {}".format(self.both_auto)
        print "Both manual: {}".format(self.both_manual)
        print "General auto only: {}".format(self.general_auto_specific_manual)
        print "Specific auto only: {}".format(self.specific_auto_general_manual)

        print "Specific Added After/Same Time as General: {}".format(self.specific_first_num)

        print "Commentary links: {}".format(self.commentary)
        print "Midrash links: {}".format(self.midrash)
        print "Tanakh-to-Tanakh links: {}".format(self.tanakh)
        print "Other links: {}".format(self.other)



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

        print "Number of refs that have more than one link: {}".format(len(self.duplicate_ids))
        print "Number of links deleted: {}".format(deleted_num)
        print "Number of links total: {}".format(total)
        print "Number of source_text_oid: {}".format(source_text)
        print "Number of generated_by: {}".format(generated_by)



    def delete_double_links_category_or_book(self, type, name):
        count = 0
        ls = LinkSet(Ref(name)) if type == "book" else DL.get_links_category(name)
        getattr_param = "book" if type == "book" else "primary_category"
        for l in ls:
            count += 1
            if count % 10000 == 0:
                print count
            ref1, ref2 = l.refs
            try:
                ref1 = Ref(ref1)
            except InputError:
                l.delete()
                continue
            try:
                ref2 = Ref(ref2)
            except InputError:
                l.delete()
                continue

            if getattr(ref1, getattr_param) != name:
                DL.get_doubles_for_delete(ref1, ref2, ranges=True)
            elif getattr(ref2, getattr_param) != name:
                DL.get_doubles_for_delete(ref2, ref1, ranges=True)
            else:
                DL.get_doubles_for_delete(ref1, ref2, ranges=True)
                DL.get_doubles_for_delete(ref2, ref1, ranges=True)

        DL.delete_links_and_output_results()


    def verify_args(self, args):
        args[0] = args[0].lower()
        assert args[0] in ["book", "category"], "Must be either book or category."
        if args[0] == "book":
            assert library.get_index(args[1]), "{} doesn't exist".format(args[1])
        else:
            assert library.get_indexes_in_category(args[1]) != [], "{} doesn't exist".format(args[1])

if __name__ == "__main__":
    '''
    Double link example: Link Between "Exodus 3" and "Bava Batra 2a", and a link between "Exodus 3:5" and "Bava Batra 2a"
    We want to delete the first link because it gives us less information than the second one.

    Usage:
    From Sefaria-Project -

    ./run scripts/double_links.py "book" "Rashi on Genesis"
    will delete for every double link in Rashi on Genesis, the less informative of the two.

    Likewise you can do the same for every book in the Tanakh:
    ./run scripts/double_links.py "category" "Tanakh"
    '''
    args = sys.argv[1:]

    DL = DoubleLinks()
    DL.verify_args(args)
    DL.delete_double_links_category_or_book(args[0], args[1])

    if len(args) == 3 and args[3] == "Exact Duplicates":
        DL.get_exact_doubles()
        DL.delete_exact_doubles()



