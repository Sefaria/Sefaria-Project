# -*- coding: utf-8 -*-

import django
django.setup()
import argparse
import os
import json
import urllib.request, urllib.parse, urllib.error
import urllib.request, urllib.error, urllib.parse
import requests

from sefaria.model import *
from sefaria.datatype.jagged_array import JaggedTextArray, JaggedArray

try:
    from sefaria.local_settings import SEFARIA_BOT_API_KEY
except ImportError:
    SEFARIA_BOT_API_KEY = None


class ServerTextCopier(object):

    def __init__(self, dest_server, apikey, title, post_index=True, versions=None, post_links=False, step=0):
        self._dest_server = dest_server
        self._apikey = apikey
        self._title_to_retrieve = title
        self._versions_to_retrieve = versions
        self._post_index = post_index
        self._post_links = post_links
        self._post_links_step = step

    def post_terms_from_schema(self):

        def retrieve_terms(node, previous_terms=None):
            if previous_terms is None:
                previous_terms = []

            if node.sharedTitle:
                previous_terms.append(node.sharedTitle)
            for child in node.children:
                retrieve_terms(child, previous_terms)
            return set(previous_terms)

        possible_terms = retrieve_terms(self._index_obj.nodes)
        possible_terms.update(self._index_obj.categories)
        if hasattr(self._index_obj, 'collective_title'):
            possible_terms.add(self._index_obj.collective_title)
        necessary_terms = []
        for t in possible_terms:
            response = requests.get('{}/api/terms/{}'.format(self._dest_server, t))
            if response.json().get('error', '') == "Term does not exist.":
                necessary_terms.append(t)
        for t in necessary_terms:
            self._upload_term(t)

    def load_objects(self):
        self._index_obj = library.get_index(self._title_to_retrieve)
        if not self._index_obj:
            raise AttributeError("No record found for {}".format(self._title_to_retrieve))
        self._version_objs = []
        if self._versions_to_retrieve:
            if self._versions_to_retrieve == 'all':
                self._version_objs = VersionSet({'title': self._title_to_retrieve}).array()
            else:
                for version in self._versions_to_retrieve:
                    version['title'] = self._title_to_retrieve
                    vs = Version().load(version)
                    if not vs:
                        print("Warning: No version object found for  lang: {} version title: {}. Skipping.".format(version['language'], version['versionTitle']))
                    else:
                        self._version_objs.append(vs)
        if self._post_links:
            if self._post_links == 1: # only manual
                query = {"$and" : [{ "refs": {"$regex": Ref(self._index_obj.title).regex()}}, { "$or" : [ { "auto" : False }, { "auto" : 0 }, {"auto" :{ "$exists": False}} ] } ]}
            else:
                query = {"refs": {"$regex": Ref(self._index_obj.title).regex()}}

            self._linkset = LinkSet(query).array()

    def do_copy(self):
        self.load_objects()
        if self._post_index:
            idx_contents = self._index_obj.contents(raw=True)
            idx_title = self._index_obj.title
            self.post_terms_from_schema()
            self._handle_categories()
            self._make_post_request_to_server(self._prepare_index_api_call(idx_title), idx_contents)
        content_nodes = self._index_obj.nodes.get_leaf_nodes()
        for ver in self._version_objs:
            found_non_empty_content = False
            print(ver.versionTitle.encode('utf-8'))
            flags = {}
            for flag in ver.optional_attrs:
                if hasattr(ver, flag):
                    flags[flag] = getattr(ver, flag, None)
            for node_num, node in enumerate(content_nodes,1):
                print(node.full_title(force_update=True))
                text = JaggedTextArray(ver.content_node(node)).array()
                version_payload = {
                        "versionTitle": ver.versionTitle,
                        "versionSource": ver.versionSource,
                        "language": ver.language,
                        "text": text
                }
                if len(text) > 0:
                    # only bother posting nodes that have content.
                    found_non_empty_content = True
                    if node_num == len(content_nodes):
                        # try:
                        self._make_post_request_to_server(self._prepare_text_api_call(node.full_title(force_update=True), count_after=True), version_payload)
                        # except:
                        #     pass
                    else:
                        self._make_post_request_to_server(self._prepare_text_api_call(
                            node.full_title(force_update=True)), version_payload)
            if not found_non_empty_content:
                # post the last node again with dummy text, to make sure an actual version db object is created
                # then post again to clear the dummy text
                dummy_text = "This is a dummy text"
                empty = ""
                for _ in range(node.depth):
                    dummy_text = [dummy_text]
                    empty = [empty]
                version_payload['text'] = dummy_text
                self._make_post_request_to_server(self._prepare_text_api_call(node.full_title()), version_payload)
                version_payload['text'] = empty
                self._make_post_request_to_server(self._prepare_text_api_call(node.full_title()), version_payload)
            if flags:
                self._make_post_request_to_server(self._prepare_version_attrs_api_call(ver.title, ver.language, ver.versionTitle), flags)
        if self._post_links and len(self._linkset) > 0:
            if self._post_links_step <= 0 or self._post_links_step > len(self._linkset):
                self._post_links_step = len(self._linkset)
            links = [l.contents() for l in self._linkset if not getattr(l, 'source_text_oid', None)]
            for i in range(0, len(links), self._post_links_step):
                self._make_post_request_to_server(self._prepare_links_api_call(), links[i:i+self._post_links_step])

    def _handle_categories(self):
        if getattr(self, '_index_obj') is None:
            return
        categories = self._index_obj.categories
        try:
            dest_category = requests.get('{}/api/category/{}'.format(self._dest_server, '/'.join(categories))).json()
        except ValueError:
            return

        if dest_category.get('error') == 'Category not found':
            if dest_category.get('closest_parent'):
                cat_index = len(dest_category['closest_parent']['path'])
            else:
                cat_index = 0

            # upload necessary category items
            for i in range(cat_index+1, len(categories)+1):
                c = Category().load({'path': categories[:i]})
                if c is None:
                    raise IndexError("Necessary category for this index is missing. "
                                     "Path {} was not found".format(categories[:i]))
                if getattr(c, 'sharedTitle', None) is not None:
                    self._upload_term(c.sharedTitle)
                self._make_post_request_to_server("api/category", c.contents())

    def _upload_term(self, name):
        t = Term().load({'name': name})
        if t is None:
            raise AttributeError("Necessary Term {} not Present on this Environment".format(name))
        self._make_post_request_to_server('api/terms/{}'.format(urllib.parse.quote(name)), t.contents())

    def _prepare_index_api_call(self, index_title):
        return 'api/v2/raw/index/{}'.format(index_title.replace(" ", "_"))

    def _prepare_text_api_call(self, terminal_ref, count_after=False):
        return 'api/texts/{}?count_after={}&index_after=0'.format(urllib.parse.quote(terminal_ref.replace(" ", "_").encode('utf-8')), int(count_after))

    def _prepare_version_attrs_api_call(self, title, lang, vtitle):
        return "api/version/flags/{}/{}/{}".format(urllib.parse.quote(title), urllib.parse.quote(lang), urllib.parse.quote(vtitle))

    def _prepare_links_api_call(self):
        return "api/links/"

    def _make_post_request_to_server(self, url, payload):
        full_url = "{}/{}".format(self._dest_server, url)
        jpayload = json.dumps(payload)
        values = {'json': jpayload, 'apikey': self._apikey}
        data = urllib.parse.urlencode(values).encode('utf-8')
        req = urllib.request.Request(full_url, data)
        try:
            response = urllib.request.urlopen(req)
            if 'prof' in full_url:
                filename = '/var/tmp/prof_mdt_{}_{}.txt'.format(payload['versionTitle'][:5], payload['language'])
                with open(filename, 'wb+') as filep:
                    filep.write(response.read())
                print("{}. Profiling Saved at: {}".format(response.read(), filename))
            else:
                print(response.read())
        except urllib.error.HTTPError as e:
            print('Error code: ', e.code)
            print(e.read())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("title", help="title argument")
    parser.add_argument("--noindex", action="store_false", help="Specify this flag when you do not wish to create a new Index record at the destination")
    parser.add_argument("-v", "--versionlist", help="pipe separated version list: lang:versionTitle. To copy all versions, simply input 'all'")
    parser.add_argument("-k", "--apikey", help="non default api key", default=SEFARIA_BOT_API_KEY)
    parser.add_argument("-d", "--destination_server", help="override destination server", default='http://eph.sefaria.org')
    parser.add_argument("-l", "--links", default=0, type=int, help="Enter '1' to move manual links on this text as well, '2' to move auto links")
    parser.add_argument("-s", "--step", default=-1, type=int, help="Enter step size for link posting.  Size of 400 means links are posted 400 at a time.")
    args = parser.parse_args()
    print(args)
    if not args.apikey:
        raise argparse.ArgumentTypeError( 'The API key must be supplied or be present by default on the server' )
    if args.versionlist:
        if args.versionlist != 'all':
            version_arr = []
            for versionstr in args.versionlist.split("|"):
                lang_vtitle = versionstr.split(":", 1)
                version_arr.append({'language': lang_vtitle[0], "versionTitle": lang_vtitle[1]})
            args.versionlist = version_arr
    copier = ServerTextCopier(args.destination_server, args.apikey, args.title, args.noindex, args.versionlist, args.links, args.step)
    copier.do_copy()

    try:
        url = os.environ["SLACK_URL"]
        message = json.dumps({'text': 'Upload Complete'})
        request = urllib.request.Request(url, message.encode('utf-8'))
        urllib.request.urlopen(request)

    except KeyError:
        pass
