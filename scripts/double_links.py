__author__ = 'stevenkaplan'
from sefaria.model import *
from sefaria.system.exceptions import *
import csv

class DoubleLinks:
    def __init__(self):
        self.specific_first_num = 0
        self.commentary = 0
        self.double_links = []
        self.midrash = 0
        self.all_links = {}
        self.both_auto = 0
        self.general_auto_specific_manual = 0
        self.specific_auto_general_manual = 0
        self.both_manual = 0
        self.bad_ids = {}


    def get_doubles_for_delete(self, ref1, ref2):
        if ref1 not in self.all_links:
            self.all_links[ref1] = [ref2]
        else:
            for each_ref in self.all_links[ref1]:
                if each_ref.book != ref2.book or each_ref == ref2:
                    continue
                general = None
                specific = None
                if each_ref.contains(ref2) and each_ref.is_section_level():
                    general = each_ref
                    specific = ref2
                elif ref2.contains(each_ref) and ref2.is_section_level():
                    general = ref2
                    specific = each_ref
                
                if general:
                    self.create_links(ref1, general, specific)
    
    
            self.all_links[ref1].append(ref2)
        
    
    
    def create_links(self, ref1, general, specific):
        #FIRST, CHECK THAT SPECIFIC AND GENERAL ARE BOTH TANAKH
        assert general.primary_category == "Tanakh" and specific.primary_category == "Tanakh", "{} {} {}".format(ref1, general, specific)


        #NEXT, SINCE ORDER MATTERS< FOR REFS IN A LINK, TRY BOTH ORDERS TO SEE WHICH IS THE RIGHT ORDER
        #FOR BOTH GENERAL AND SPECIFIC
        general_links = [Link().load({"refs": [general.normal(), ref1.normal()]}),
                         Link().load({"refs": [ref1.normal(), general.normal()]})]
        general_links = filter(lambda x: x is not None, general_links)
    
        specific_links = [Link().load({"refs": [specific.normal(), ref1.normal()]}),
                          Link().load({"refs": [ref1.normal(), specific.normal()]})]
        specific_links = filter(lambda x: x is not None, specific_links)

        #NEXT, CHECK THAT THERE IS ONE AND ONLY ONE SPECIFIC LINK AND ONE AND ONLY ONE GENERAL LINK
        assert len(general_links) == len(specific_links) == 1, "{} {}".format(general_links, specific_links)

        #NOW, ADD THE LINK TO DOUBLE LINKS
        self.double_links.append(general_links[0])


        #FINALLY, GATHER DATA ON THE TIME OF CREATION OF THE LINK AND WHETHER IT IS MANUAL OR AUTOMATIC,
        #AND WHETHER IT IS FROM MIDRASH OR RASHI

        general_auto = general_links[0].auto
        general_date = general_links[0]._id.generation_time
    
        specific_auto = specific_links[0].auto
        specific_date = specific_links[0]._id.generation_time


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

        if "Midrash" in ref1.index.categories:
            self.midrash += 1


    def get_links(self, category):
        ls = []
        indexes = library.get_indexes_in_category(category)
        for index in indexes:
            ls += LinkSet(Ref(index))
        return ls


    
    def delete_links_and_output_results(self):
        how_many = 0
        for l in self.double_links:
            assert l
            l.delete()
            how_many += 1
        print "Deleted {} links".format(how_many)

        print "Both auto: {}".format(self.both_auto)
        print "Both manual: {}".format(self.both_manual)
        print "General auto only: {}".format(self.general_auto_specific_manual)
        print "Specific auto only: {}".format(self.specific_auto_general_manual)

        print "Specific Added After/Same Time as General: {}".format(self.specific_first_num)

        print "Commentary links: {}".format(self.commentary)
        print "Midrash links: {}".format(self.midrash)



    def get_exact_doubles(self):
        ls = LinkSet()
        link_refs = {}
        count = 0
        for l in ls:
            refs = tuple(sorted(l.refs))
            if refs in link_refs:
                count += 1
                if refs not in self.bad_ids:
                    prev = link_refs[refs]
                    self.bad_ids[refs] = [l._id, prev]
                else:
                    self.bad_ids[refs].append(l._id)
            else:
                link_refs[refs] = l._id


    def delete_exact_doubles(self):
        total = 0
        max_num = 0
        which_one = []
        deleted_num = 0
        for each in self.bad_ids:
            ids = self.bad_ids[each]
            if len(ids) > max_num:
                max_num = len(ids)
                which_one = ids[0]
            for id in ids[1:]:
                l = Link().load({"_id": id})
                assert l
                l.delete()
                deleted_num += 1
            total += len(ids)


        print "Number of refs that have more than one link: {}".format(len(self.bad_ids))
        print "Number of links deleted: {}".format(deleted_num)
        print "Number of links total: {}".format(total)
        print "ID {} of Ref with {} links.".format(which_one, max_num)




if __name__ == "__main__":
    DL = DoubleLinks()
    DL.get_exact_doubles()
    DL.delete_exact_doubles()


    count = 0
    category = "Tanakh"
    delete = True
    for l in DL.get_links(category):
        count += 1
        if count % 10000 == 0:
            print count
        ref1, ref2 = l.refs
        invalid = False
        try:
            ref1 = Ref(ref1)
        except InputError:
            invalid = True
        try:
            ref2 = Ref(ref2)
        except InputError:
            invalid = True

        if not invalid:
            if ref1.primary_category != category: #only care about commentaries on category
                DL.get_doubles_for_delete(ref1, ref2)
            elif ref2.primary_category != category:
                DL.get_doubles_for_delete(ref2, ref1)
            else:
                assert ref1.primary_category == ref2.primary_category == category

    DL.delete_links_and_output_results()
