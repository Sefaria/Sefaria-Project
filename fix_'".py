# -*- coding: utf-8 -*-
import re, os, sys
import django
django.setup()
import codecs
from sources.functions import post_text, post_index, get_index_api
# p = os.path.dirname(os.path.abspath(__file__))
# sys.path.insert(0, p)
from sefaria.model import *
# from sefaria.system.exceptions import BookNameError

post = True

# for idx in IndexSet():
#     title_changed = False
#     # i = get_index_api(idx._title)
#     for title in idx.all_titles(lang='he'):
#     # for t in i['schema']['titles']:
#         # if t['lang'] == 'he':
#         #     title = t['text']
#         if re.search(ur'[\u2018\u2019\u0027\'\"“”]', title):
#             # new_title = re.sub(ur'([\u0590-\u05FF])([\u2018\u2019\u0027][\u2018\u2019\u0027]|[\"“”])([\u0590-\u05FF])', ur'\1״\3', title)
#             new_title = re.sub(ur'([\u2018\u2019\u0027][\u2018\u2019\u0027]|[\"“”])', ur'״', title)
#             new_title = re.sub(ur'[\'\u2018\u2019]', ur'׳', new_title)
#             if title != new_title:
#                 # print new_title
#                 # i['schema']['titles'].append({'lang': 'he', 'text': u''.format(new_title)})
#                 o_len = len(idx.all_titles(lang='he'))
#                 idx.nodes.add_title(new_title, 'he')
#                 if o_len != len(idx.all_titles(lang='he')):
#                     title_changed = True
#     if title_changed and post:
#         try:
#             idx.save()
#             print("saved {}".format(str(idx)))
#         except:
#             print("issue posting {}".format(str(idx)))
#         # post_index(i, weak_network=True) 
        
print "done with titles"
        
def walk_thru_action(s, tref, heTref, version):

    # hebrew letter, ugly quote, hebrew letter -> proper hebrew quote
    seg_text = re.sub(ur'([\u0590-\u05FF])([\u2018\u2019\u0027][\u2018\u2019\u0027]|[\"“”])([\u0590-\u05FF])', ur'\1״\3', s)
    # ugly quote -> american quote
    seg_text = re.sub(ur'([\u2018\u2019\u0027][\u2018\u2019\u0027]|[“”])', ur'"', seg_text)
    # hebrew letter, ugly single quote, hebrew letter -> geresh
    seg_text = re.sub(ur'([\u0590-\u05FF])[\u2018\u2019]([\u0590-\u05FF])', ur'\1׳\2', seg_text)
    # ugly quote -> american quote
    seg_text = re.sub(ur'[\u2018\u2019]', ur"'", seg_text)

    if post and (seg_text != s):
        try:
            text_version = {
                'versionTitle': version.versionTitle,
                'versionSource': version.versionSource,
                'language': 'he',
                'text': seg_text,
            }
            print post_text(tref, text_version)
        except:
            print u"Issue posting: {}".format(tref)
    return 

with codecs.open('fix' + '.tsv', 'wb+', 'utf-8') as csvfile:
        # s is the segment string
        # tref is the segment's english ref
        # heTref is the hebrew ref
        # version is the segment's version object. use it to get the version title and language```

    # vs = VersionSet({"title": "Siftei Kohen on Shulchan Arukh, Choshen Mishpat"})
    vs = VersionSet({"language": "he"})
    start_posting = True
    for v in vs:
        try:
            i = v.get_index()
            if (u'Chesed LeAvraham' not in i.get_title()) and (u'Rav Pealim' not in i.get_title()):
                # if u'Tosafot Yom Tov on Mishnah Oholot' in i.get_title():
                #     start_posting = True
                if start_posting:
                    v.walk_thru_contents(walk_thru_action, heTref=i.get_title('he'), schema=i.schema)
                    # if (u"B'Mareh HaBazak Volume VII" in i.get_title()):
                    #     start_posting = False
        # except BookNameError:
        #     print u"Skipping {}, {}".format(v.title, v.versionTitle)
        #     continue
        except Exception as e:
            print e, v.title, v.versionTitle
            continue
