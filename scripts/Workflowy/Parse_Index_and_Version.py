# -*- coding: utf-8 -*-

"""
takes 3 command line arguments
first argument :: filename.opml
-t :: stores all items nodes in opml as shared terms (not including root)
-v :: saves any text stored in opml as notes to a single version
"""


import string
import xml.etree.ElementTree as ET
import urllib
import urllib2
import json
import regex as re
import sys
from sefaria.model import *


# saves shared term to db for each element in tree
def save_shared_terms(root):
    ts = TermScheme()
    if not ts.load({"name": "Siddur"}):
        ts.name = "Siddur"
        ts.save()

    skip = True
    for element in root.iter('outline'):

        # ugly way to skip the root node
        if skip:
            skip = False
            continue

        titles = parse_titles(element)

        if not Term().load({"name": titles["enPrim"]}):
            term = Term()
            term.name = titles["enPrim"]
            term.scheme = ts.name

            term.title_group.add_title(titles["enPrim"], "en", True)
            if "hePrim" in titles:
                term.title_group.add_title(titles["hePrim"], "he", True)
            if "enAltList" in titles:
                for title in titles["enAltList"]:
                    term.title_group.add_title(title, "en")
            if "heAltList" in titles:
                for title in titles["heAltList"]:
                    term.title_group.add_title(title, "he")
            term.save()


# en & he titles for each element > dict
def parse_titles(element):
    title = element.attrib["text"]
    # print title
    title = re.sub(ur"</b>|<b>|\(.*\)|'", u"", title)
    title = title.split(u",")
    titles = {}
    if len(title) == 2:
        he = title[1].split(u"/")
        titles["hePrim"] = he[0].strip()
        titles["heAltList"] = [t.strip() for t in he[1:]]
    en = title[0].split(u"/")
    titles["enPrim"] = en[0].strip()
    titles["enAltList"] = [t.strip() for t in en[1:]]
    # print node.attrib
    return titles


# appends primary, alternate, hebrew, english titles to node.
def add_titles(titles, n):
    term = Term()
    # check if the primary title is a "shared term"
    if term.load({"name": titles["enPrim"]}):
        n.add_shared_term(titles["enPrim"])

    else:  # manual add if not a shared term
        n.add_title(titles["enPrim"], 'en', primary=True)
        # print titles["enPrim"]
        if "hePrim" in titles:
            n.add_title(titles["hePrim"], 'he', primary=True)
            # print titles["hePrim"]
        if "enAltList" in titles:
            for title in titles["enAltList"]:
                n.add_title(title, 'en')
        if "heAltList" in titles:
            for title in titles["heAltList"]:
                n.add_title(title, 'he')
    return n


# object tree of each with jagged array nodes at the lowest level (recursive)
def build_index(element):
    if len(element) == 0:  # length of child nodes
        n = JaggedArrayNode()
        n.sectionNames = ['Paragraph']
        n.addressTypes = ['Integer']
        n.depth = 1
    else:  # yes child nodes >> schema node
        n = SchemaNode()
        for child in element:
            n.append(build_index(child))

    # either type of node:
    titles = parse_titles(element)  # an array of titles
    n.key = titles["enPrim"]
    n = add_titles(titles, n)
    return n


def build_post_index(tree):
    schema_root = build_index(tree)
    schema_root.validate()
    index = {
        'title': 'Siddur A',
        'categories': ['Liturgy'],
        'schema': schema_root.serialize()
    }

    post_api('Siddur_A', index, "index")


# divides text into paragraphs and sentences > list
def parse_text(element):
    n = (element.attrib["_note"])
    n = re.sub(r'[/]', '<br>', n)
    n = re.sub(r'[(]', '<em><small>', n)
    n = re.sub(r'[)]', '</small></em>', n)
    prayer = n.strip().splitlines()
    return prayer


# builds and posts text to api
def build_post_text(tree):
    j = {"versionTitle": "Siddur A", "versionSource": "daat", "language": "he"}
    parents = {c:p for p in tree.iter() for c in p}
    for e in tree.iter():
        if len(e) == 0 and "_note" in e.attrib.keys():
            j["text"] = parse_text(e)
            layers = []
            while e in parents.keys():
                layers.append(parse_titles(e)["enPrim"])
                e = parents[e]
            layers = list(reversed(layers))
            ref = "Siddur A, " + string.join(layers, ", ")
            post_api(ref, j, "text")


# posts to api
def post_api(ref, j, form):
   # server = u"localhost:8000"  
    server = u"dev.sefaria.org"
    json_text = json.dumps(j)
    if form == "index":
        url = 'http://' + server + '/api/v2/raw/index/{}'.format(ref)
    elif form == "text":
        ref = ref.replace(" ", "_")
        url = 'http://' + server + '/api/texts/%s?count_after=0&index_after=0' % ref

    values = {'json': json_text, 'apikey': u'D4tKwVg54Qw8ARUcbEsnRyoW237tlgxNaeI6cZkIMtk'}
    data = urllib.urlencode(values)
    try:
        url
    except NameError:
        print 'incorrect type'
    req = urllib2.Request(url, data)
    try:
        response = urllib2.urlopen(req)
        print response.read()
    except urllib2.HTTPError, e:
        print 'Error code: ', e.code
        print e.read()


def traverse(o, tree_types=(list, tuple)):
    if isinstance(o, tree_types):
        for value in o:
            for subvalue in traverse(value):
                yield subvalue
    else:
        yield o


def main():
    filename = sys.argv[1]
    flags = sys.argv[2:]
    tree = ET.parse(filename)
    tree = tree.getroot()[1][0]
    # for element in tree.iter('outline'):
    #     print parse_titles(element)["enPrim"]
    if '-t' in flags:
        save_shared_terms(tree)
    build_post_index(tree)
    if '-v' in flags:
        build_post_text(tree)


if __name__ == "__main__":
    main()

