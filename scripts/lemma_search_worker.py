"""Local asynchronous search worker; run with the lemmatizer research virtualenv."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import version
import json
import hashlib
import unicodedata
import math
import itertools
from collections import defaultdict
from pathlib import Path
import sys
from threading import Lock
import time
import uuid


def validate(payload):
    query = payload.get("query", "")
    if not isinstance(query, str) or not query.strip() or len(query) > 500:
        raise ValueError("Enter a query of 1–500 characters.")
    weight = float(payload.get("weight", 1))
    depth = int(payload.get("depth", 20))
    if not math.isfinite(weight) or not 0 <= weight <= 10 or not 1 <= depth <= 50:
        raise ValueError("Weight must be 0–10 and result count 1–50.")
    slop = payload.get("slop", 10)
    if isinstance(slop, bool) or not isinstance(slop, int) or not 0 <= slop <= 50:
        raise ValueError("Phrase flexibility must be an integer from 0 to 50.")
    expand = payload.get("expand_yod_vav", False)
    if not isinstance(expand, bool):
        raise ValueError("Lemma expansion must be true or false")
    return query.strip(), weight, depth, slop, expand


def folded(lemma):
    # Empty reductions stay distinct: ו and י must not become one empty group.
    return lemma.translate(str.maketrans("", "", "יו")) or lemma


def expanded_clause(groups, weight, slop):
    """Enumerate bounded alternatives to preserve Elasticsearch phrase slop exactly."""
    count = math.prod(len(group) for group in groups)
    if count > 256:
        raise ValueError(f"Expansion would create {count} phrases (limit 256). Shorten the query or turn off Ignore י / ו.")
    phrases = [" ".join(words) for words in itertools.product(*groups)]
    return {"dis_max": {"queries": [
        {"match_phrase": {"shoshan_lemma": {"query": phrase, "slop": slop}}}
        for phrase in phrases], "tie_breaker": 0, "boost": weight, "_name": "lemma_expanded"}}


def token_parts(text, tokens):
    """Preserve original text, including marks; slice Python offsets on the server."""
    parts, cursor = [], 0
    for token in tokens:
        start, end = token["original_start"], token["original_end"]
        if not cursor <= start < end <= len(text):
            raise ValueError("Invalid saved token offsets")
        # Include trailing niqqud/cantillation in the same hover target.
        while end < len(text) and unicodedata.category(text[end]).startswith("M"):
            end += 1
        if start > cursor:
            parts.append({"text": text[cursor:start]})
        parts.append({"text": text[start:end], "lemma": token["lemma"],
                      "status": token["status"], "pos": token.get("pos")})
        cursor = end
    if cursor < len(text):
        parts.append({"text": text[cursor:]})
    return parts


class Annotations:
    """Read the exact exported annotations used to create this index, on demand."""
    def __init__(self, path, expected_hash):
        self.path, self.offsets = path, {}
        self.groups = defaultdict(set)
        digest = hashlib.sha256()
        with path.open("rb") as source:
            while True:
                offset = source.tell()
                line = source.readline()
                if not line:
                    break
                digest.update(line)
                row = json.loads(line)
                if row["doc_id"] in self.offsets:
                    raise ValueError("Duplicate annotation document")
                self.offsets[row["doc_id"]] = offset
                for lemma in row["shoshan_lemma"].split():
                    self.groups[folded(lemma)].add(lemma)
        if digest.hexdigest() != expected_hash:
            raise ValueError("Annotations differ from those used to build the index")

    def alternatives(self, lemma):
        return [lemma] + sorted(self.groups.get(folded(lemma), set()) - {lemma})

    @lru_cache(maxsize=256)
    def get(self, doc_id):
        with self.path.open("rb") as source:
            source.seek(self.offsets[doc_id])
            row = json.loads(source.readline())
        if row["doc_id"] != doc_id:
            raise ValueError("Annotation file changed; restart the worker")
        return row

    def parts(self, hit):
        row = self.get(hit["_id"])
        text = hit["_source"]["exact"]
        if hashlib.sha256(text.encode()).hexdigest() != row["text_sha256"]:
            raise ValueError("Annotation text does not match search result")
        if row["shoshan_lemma"] != hit["_source"]["shoshan_lemma"]:
            raise ValueError("Saved lemmas do not match indexed lemmas")
        return token_parts(text, row["tokens"])


class Engine:
    def __init__(self, root, url, index, device, annotations=None, request_fn=None):
        sys.path.insert(0, str(root / "src"))
        from offline_search import check_destination, request, query_body
        from evaluate_inference import sha
        if request_fn is None:
            check_destination(url, index)
        else:
            request = request_fn
        self.request, self.query_body = request, query_body
        self.url, self.index, self.device = url, index, device
        self.model = None
        meta = request(url + "/" + index)[index]["mappings"]["_meta"]
        if meta["status"] != "ready" or meta.get("partial"):
            raise ValueError("The experimental index must be complete and ready.")
        identity = meta["lemma_pipeline"]
        for name in ("search_lemma_core.py", "benchmark_core.py"):
            if sha(root / "src" / name) != identity["code"][name]:
                raise ValueError("Query/document preprocessing mismatch: " + name)
        if sha(root / "configs/model-installation.json") != identity["model_installation"]:
            raise ValueError("Query/document model manifest mismatch")
        for name, expected in identity["versions"].items():
            actual = version(name)
            # The CPU wheel has the same release plus a platform build suffix.
            compatible_cpu = name == "torch" and actual == expected + "+cpu"
            if actual != expected and not compatible_cpu:
                raise ValueError("Query/document dependency mismatch: " + name)
        install = json.loads((root / "configs/model-installation.json").read_text())
        for name, info in install["downloaded_files"].items():
            if name.startswith("shoshan/") and sha(root / "models" / name) != info["sha256"]:
                raise ValueError("Local model file changed: " + name)
        self.documents = meta["documents"]
        self.annotations = Annotations(annotations or root / "datasets/search_lemmas_mishnah_v1/lemmas.jsonl", meta["lemmas_sha256"])

    @lru_cache(maxsize=128)
    def annotate(self, query):
        if self.model is None:
            from search_lemma_core import FullTextLemmatizer
            self.model = FullTextLemmatizer(self.device)
        return self.model.annotate([query])[0]

    def compare(self, query, weight, depth, slop=10, expand_yod_vav=False):
        started = time.monotonic()
        annotation = self.annotate(query)
        annotation = dict(annotation, parts=token_parts(query, annotation["tokens"]))
        groups = [self.annotations.alternatives(t["lemma"]) if expand_yod_vav else [t["lemma"]]
                  for t in annotation["tokens"]]
        word_parts = [p for p in annotation["parts"] if "lemma" in p]
        for part, alternatives in zip(word_parts, groups):
            part["alternatives"] = alternatives
        expansion = expanded_clause(groups, weight, slop) if expand_yod_vav and weight > 0 and groups else None
        results = {}
        for mode in ("baseline", "enhanced"):
            # Weight zero means a true baseline, including the candidate set.
            lemmas = annotation["shoshan_lemma"] if mode == "enhanced" and weight > 0 else None
            body = self.query_body(query, lemmas, weight, depth, slop)
            if mode == "enhanced" and expansion is not None:
                body["query"]["function_score"]["query"]["bool"]["should"][1] = expansion
            body["_source"].append("shoshan_lemma")
            response = self.request(self.url + "/" + self.index + "/_search", "POST", body)
            if response.get("timed_out") or response["_shards"]["failed"]:
                raise RuntimeError("Elasticsearch returned incomplete results")
            for hit in response["hits"]["hits"]:
                hit["parts"] = self.annotations.parts(hit)
            results[mode] = {"total": response["hits"]["total"]["value"],
                             "hits": response["hits"]["hits"], "request": body}
        return {"query": query, "weight": weight, "depth": depth, "slop": slop, "expand_yod_vav": expand_yod_vav, "annotation": annotation,
                "index": self.index, "documents": self.documents, "results": results,
                "seconds": round(time.monotonic() - started, 3)}


class Jobs:
    def __init__(self, engine):
        self.engine = engine
        self.pool = ThreadPoolExecutor(max_workers=1)
        self.lock = Lock()
        self.jobs = {}

    def submit(self, args):
        with self.lock:
            if sum(not f.done() for f in self.jobs.values()) >= 8:
                raise ValueError("The worker is busy; try again shortly.")
            for key in list(self.jobs):
                if len(self.jobs) < 128:
                    break
                if self.jobs[key].done():
                    del self.jobs[key]
            key = uuid.uuid4().hex
            self.jobs[key] = self.pool.submit(self.engine.compare, *args)
            return key

    def result(self, key):
        with self.lock:
            future = self.jobs.get(key)
        if future is None:
            return {"status": "error", "error": "Job expired or unknown; run the search again."}
        if not future.done():
            return {"status": "running"}
        try:
            return {"status": "complete", "data": future.result()}
        except Exception as error:
            return {"status": "error", "error": str(error)}


def handler(jobs):
    class Handler(BaseHTTPRequestHandler):
        def reply(self, data, status=200):
            body = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if self.path != "/jobs":
                return self.reply({"error": "Not found"}, 404)
            try:
                length = int(self.headers.get("Content-Length", 0))
                if not 0 < length <= 10000:
                    raise ValueError("Invalid request size")
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError("Expected an object")
                key = jobs.submit(validate(payload))
                self.reply({"status": "running", "job": key}, 202)
            except (ValueError, TypeError) as error:
                self.reply({"error": str(error)}, 400)

        def do_GET(self):
            if self.path == "/health":
                return self.reply({"status": "ready", "index": jobs.engine.index,
                                   "documents": jobs.engine.documents})
            if self.path.startswith("/jobs/"):
                return self.reply(jobs.result(self.path.removeprefix("/jobs/")))
            self.reply({"error": "Not found"}, 404)
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--research-root", type=Path, default=Path(__file__).resolve().parents[2] / "Sefaria-Data/research/lemmatizer")
    parser.add_argument("--url", default="http://127.0.0.1:19200")
    parser.add_argument("--index", default="lemma-poc-tanakh-rashi-mishnah-v1")
    parser.add_argument("--device", choices=["mps", "cpu"], default="mps")
    parser.add_argument("--annotations", type=Path, help="Matching exported lemmas.jsonl; defaults to the Mishnah-expanded corpus")
    args = parser.parse_args()
    engine = Engine(args.research_root, args.url, args.index, args.device, args.annotations)
    server = ThreadingHTTPServer(("127.0.0.1", 19201), handler(Jobs(engine)))
    print(f"Lemma worker ready on http://127.0.0.1:19201 ({engine.documents} passages).", flush=True)
    print("Shoshan loads on the first query and stays loaded. Ctrl-C stops the worker.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
