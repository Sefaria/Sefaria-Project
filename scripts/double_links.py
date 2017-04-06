__author__ = 'stevenkaplan'
from sefaria.model import *
from sefaria.system.exceptions import *
import csv

def check_doubles(all_links, double_links, ref1, ref2):
    if ref1 not in all_links:
        all_links[ref1] = [ref2]
    else:
        insert = True
        for each_ref in all_links[ref1]:
            if each_ref.book != ref2.book or each_ref == ref2:
                continue
            if each_ref.contains(ref2) or ref2.contains(each_ref):
                if ref1 not in double_links:
                    double_links[ref1] = set()
                double_links[ref1].add(each_ref)
                double_links[ref1].add(ref2)

        all_links[ref1].append(ref2)

def get_links(category):
    ls = []
    indexes = library.get_indexes_in_category(category)
    for index in indexes:
        ls += LinkSet(Ref(index))
    return ls


def pass_test(r1, r2):
    return not r1.is_bavli() and not r2.is_bavli()
    #return True

def get_pairs(double_links):
    sum = 0
    for ref in double_links:
        sum += len(double_links[ref])

    return sum, float(sum)/float(len(double_links))


if __name__ == "__main__":
    invalid_refs = open("invalid refs.txt", 'w')
    count = 0
    categories = ["Tanakh"]
    for category in categories:
        all_links = {}
        double_links = {}
        for l in get_links(category):
            count += 1
            if count % 100000 == 0:
                print count
            ref1, ref2 = l.refs
            invalid = False
            try:
                ref1 = Ref(ref1)
            except InputError:
                invalid_refs.write(ref1+"\n")
                invalid = True
            try:
                ref2 = Ref(ref2)
            except InputError:
                invalid_refs.write(ref2+"\n")
                invalid = True

            if not invalid:
                if ref1.primary_category != category: #only care about commentaries
                    check_doubles(all_links, double_links, ref1, ref2)
                elif ref2.primary_category != category:
                    check_doubles(all_links, double_links, ref2, ref1)
                else:
                    assert ref1.primary_category == ref2.primary_category == category
        print "DOUBLE LINKS for {}:".format(category)
        print len(double_links)
        print "ALL LINKS"
        print len(all_links)
        sum, avg = get_pairs(double_links)
        print "SUM {}; AVG {}".format(sum, avg)
        dbl_links_out = open("double_links_{}.csv".format(category), 'w')
        csvwriter = csv.writer(dbl_links_out, delimiter=',')
        for each in double_links:
           print_each = each.normal().replace(",", ";")
           csvwriter.writerow([print_each, str(double_links[each])])
        dbl_links_out.close()
    invalid_refs.close()
