# -*- coding: utf-8 -*-
"""
Copies one lexicon from the local database to another server (e.g. a cauldron) over its API:
  1. the lexicon record                                     -> api/lexicons/<name>
  2. its lexicon entries, in batches                        -> api/lexicons/<name>/entries
  3. word forms with a lookup into it (only those lookups)  -> api/lexicons/<name>/word-forms
  4. if the lexicon has an index_title: the Index, the version named by version_title
     (and version_lang), and optionally links, via move_draft_text.py's ServerTextCopier

Entries and word forms keep their local _id, which is how the server matches them on later uploads.
Nothing is deleted on the server. The destination must be running code that has the api/lexicons endpoints.

  ./run move_draft_lexicon.py "Jastrow Dictionary" -d https://www.<name>.cauldron.sefaria.org -k <apikey> -l 1
"""
import django
django.setup()
import argparse
import json
import sys
import urllib.parse

import requests

from sefaria.model import VersionSet
from sefaria.system.database import db
from move_draft_text import ServerTextCopier

try:
    from sefaria.local_settings import SEFARIA_BOT_API_KEY
except ImportError:
    SEFARIA_BOT_API_KEY = None


class ServerLexiconCopier:

    def __init__(self, dest_server, apikey, name, post_links=0, step=-1, batch_size=500):
        self._dest_server = dest_server.rstrip("/")
        self._apikey = apikey
        self._name = name
        self._post_links = post_links
        self._step = step
        self._batch_size = batch_size
        self.had_errors = False

    def do_copy(self):
        lexicon = db.lexicon.find_one({"name": self._name}, {"_id": 0})
        if not lexicon:
            raise ValueError(f"No lexicon named '{self._name}' locally")
        if not self._post("lexicon", "", lexicon):
            return  # entries and word forms need the lexicon on the server
        self._post_in_batches("entries", self._entries())
        self._post_in_batches("word-forms", self._word_forms())
        if lexicon.get("index_title"):
            self._copy_text(lexicon)

    def _entries(self):
        for entry in db.lexicon_entry.find({"parent_lexicon": self._name}).sort("_id"):
            entry["_id"] = str(entry["_id"])
            yield entry

    def _word_forms(self):
        for word_form in db.word_form.find({"lookups.parent_lexicon": self._name}).sort("_id"):
            word_form["_id"] = str(word_form["_id"])
            # Other lexicons' lookups on the same word form are theirs to send.
            word_form["lookups"] = [l for l in word_form["lookups"] if l.get("parent_lexicon") == self._name]
            yield word_form

    def _post_in_batches(self, label, records):
        totals = {"created": 0, "updated": 0, "unchanged": 0, "errors": 0}
        sent, batch = 0, []
        for record in records:
            batch.append(record)
            if len(batch) == self._batch_size:
                self._post_batch(label, sent, batch, totals)
                sent += len(batch)
                batch = []
        if batch:
            self._post_batch(label, sent, batch, totals)
            sent += len(batch)
        print(f"{label}: sent {sent}, {json.dumps(totals)}")

    def _post_batch(self, label, start, batch, totals):
        result = self._post(f"{label} {start}-{start + len(batch)}", f"/{label}", batch, quiet=True)
        if not result:
            totals["errors"] += len(batch)
            return
        for key in totals:
            totals[key] += result.get(key, 0)
        for detail in result.get("error_details", []):
            print(f"{label} error: {json.dumps(detail, ensure_ascii=False)}")

    def _post(self, label, path, payload, quiet=False):
        """Returns the response JSON, or None (after printing why) if the request failed."""
        url = f"{self._dest_server}/api/lexicons/{urllib.parse.quote(self._name)}{path}"
        try:
            # No redirects: following one turns this POST into a GET and the upload is silently lost.
            response = requests.post(url, data={"json": json.dumps(payload), "apikey": self._apikey},
                                     allow_redirects=False, timeout=600)
        except requests.RequestException as e:
            result = {"error": str(e)}
        else:
            if response.is_redirect:
                result = {"error": f"HTTP {response.status_code} redirect to {response.headers.get('Location')}"}
            else:
                try:
                    result = response.json()
                except ValueError:
                    result = {"error": f"HTTP {response.status_code}, not JSON: {response.text[:300]}"}
        failed = "error" in result
        if failed:
            self.had_errors = True
        if failed or not quiet:
            print(f"{label}: {json.dumps(result, ensure_ascii=False)}")
        if not failed and result.get("errors"):
            self.had_errors = True
        return None if failed else result

    def _copy_text(self, lexicon):
        query = {"title": lexicon["index_title"], "versionTitle": lexicon.get("version_title")}
        if lexicon.get("version_lang"):
            query["language"] = lexicon["version_lang"]
        versions = [{"language": v.language, "versionTitle": v.versionTitle} for v in VersionSet(query)] \
            if lexicon.get("version_title") else []
        print(f"text: {lexicon['index_title']} with versions {json.dumps(versions, ensure_ascii=False)}")
        ServerTextCopier(self._dest_server, self._apikey, lexicon["index_title"], post_index=True,
                         versions=versions, post_links=self._post_links, step=self._step).do_copy()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("name", help="name of the lexicon (its 'name' field in the lexicon collection)")
    parser.add_argument("-k", "--apikey", help="non default api key", default=SEFARIA_BOT_API_KEY)
    parser.add_argument("-d", "--destination_server", help="destination server, e.g. https://www.<name>.cauldron.sefaria.org", required=True)
    parser.add_argument("-l", "--links", default=0, type=int, help="Enter '1' to move only manual links, '2' to move auto links on the lexicon's Index as well")
    parser.add_argument("-s", "--step", default=-1, type=int, help="Enter step size for link posting.  Size of 400 means links are posted 400 at a time.")
    parser.add_argument("-b", "--batch_size", default=500, type=int, help="number of entries / word forms per request")
    args = parser.parse_args()
    if not args.apikey:
        raise argparse.ArgumentTypeError('The API key must be supplied or be present by default on the server')
    copier = ServerLexiconCopier(args.destination_server, args.apikey, args.name, args.links, args.step, args.batch_size)
    copier.do_copy()
    sys.exit(1 if copier.had_errors else 0)
