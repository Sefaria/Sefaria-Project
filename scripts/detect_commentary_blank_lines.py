import argparse
from sefaria.model import *
from sefaria.system.database import db
from sefaria.helper.link import *


commentary_texts = library.get_commentary_versions()


def find_blanks_at_start(vlist):
    if isinstance(vlist, list) and len(vlist) >1:
        index = next(i for i, j in enumerate(vlist) if (isinstance(j,(str)) and j.strip() != ''))
        return index > 0
    return 0



def fix_blank_lines_in_commentary(fix=False):
    distinct_titles = []
    #with open("log/length_comparison.txt", 'w+') as out:
    for commentary in commentary_texts:
        if commentary.language == 'he':
            for ch,chapter in enumerate(commentary.chapter,1):
                for vs, verse in enumerate(chapter, 1):
                    #try:
                        offset = find_blanks_at_start(verse)
                        if offset > 0:
                            str = "%s [%s]: %s.%s\n" % (commentary.title, commentary.versionTitle, ch, vs)
                            print(str)
                            #out.write(str.encode('utf-8'))
                            if fix:
                                if commentary.versionTitle == 'On Your Way':
                                    if commentary.title not in distinct_titles:
                                        distinct_titles.append(commentary.title)
                                    print("Slicing verse (has %d comments) from %d" %(len(verse), offset))
                                    commentary.chapter[ch-1][vs-1][:] = verse[offset:]
                                    commentary.save()
                                deleted_segment = "%s %s:%s:%s" % (commentary.title, ch, vs, len(verse))
                                #delete the line in the version
                                #commentary.chapter[ch][vs] = commentary.chapter[ch][vs][1:]
                                #commentary.save()
                                links = LinkSet({'refs': deleted_segment})
                                if links.count() > 1:
                                    for link in links:
                                        print(link.refs)
                                print("----------------------------------------------------------------------------")
                    #except Exception, e:
                        #print "ERROR at %s [%s] %s.%s (%s)" % (commentary.title.encode('utf-8'), commentary.versionTitle.encode('utf-8'), ch, vs, e)
    for title in distinct_titles:
        print("rebuilding %s" % title)
        rebuild_commentary_links(title, 8646)





""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("-f", "--fix", help="Also fix detected blank lines",
                    action="store_true")
    args = parser.parse_args()
    print("fix: %s" % args.fix)
    fix_blank_lines_in_commentary(args.fix)