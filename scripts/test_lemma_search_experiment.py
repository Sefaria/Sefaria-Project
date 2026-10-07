"""Isolated tests; run with the Django Python environment, without loading Mongo."""
import io
import json
import hashlib
import tempfile
from types import SimpleNamespace, ModuleType
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch
from urllib.error import URLError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
from django.conf import settings
if not settings.configured:
    settings.configure(DEBUG=True, SECRET_KEY="test-only", LEMMA_SEARCH_EXPERIMENT=True,
        INSTALLED_APPS=[], TEMPLATES=[{"BACKEND":"django.template.backends.django.DjangoTemplates",
                                    "DIRS":[str(ROOT / "templates")]}])
import django
django.setup()
from django.test import RequestFactory, override_settings, SimpleTestCase
from django.http import Http404
from django.core import signing
from reader.lemma_search import page, jobs, SALT
from lemma_search_worker import Engine, Jobs, validate, Annotations, token_parts, folded, expanded_clause, ranked_phrases, edit_distance, final_he_variant


from lemma_search_transport import validate_target, transport


class ExperimentTests(unittest.TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_page_and_csrf(self):
        response = page(self.factory.get("/experimental/lemma-search/"))
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"csrfmiddlewaretoken", response.content)
        self.assertIn(b"Side by side", response.content)

    @override_settings(LEMMA_SEARCH_EXPERIMENT=False)
    def test_disabled_is_404(self):
        with self.assertRaises(Http404):
            page(self.factory.get("/"))

    @override_settings(DEBUG=False)
    def test_not_available_in_production(self):
        with self.assertRaises(Http404):
            page(self.factory.get("/"))

    def test_remote_client_is_404(self):
        with self.assertRaises(Http404):
            page(self.factory.get("/", REMOTE_ADDR="192.0.2.1"))

    def test_invalid_job_does_not_contact_worker(self):
        with patch("reader.lemma_search.urlopen") as upstream:
            response = jobs(self.factory.get("/", {"job":"../../health"}))
        self.assertEqual(response.status_code, 400)
        upstream.assert_not_called()

    def test_missing_worker_returns_actionable_error(self):
        with patch("reader.lemma_search.urlopen", side_effect=URLError("refused")):
            response = jobs(self.factory.post("/", data={"query":"אמר"}, content_type="application/json"))
        self.assertEqual(response.status_code, 503)
        self.assertIn(b"lemma_search_worker.py", response.content)

    def test_submitting_only_queues_work(self):
        upstream = io.BytesIO(b'{"status":"running","job":"abc"}')
        upstream.status = 202
        with patch("reader.lemma_search.urlopen", return_value=upstream) as call:
            response = jobs(self.factory.post("/", data={"query":"אמר"}, content_type="application/json"))
        self.assertEqual(response.status_code, 202)
        self.assertEqual(call.call_args.args[0].full_url, "http://127.0.0.1:19201/jobs")

    def test_query_validation(self):
        self.assertEqual(validate({"query":" אמר ","weight":0}), ("אמר",0,20,10,False))
        for data in [{"query":""},{"query":"a"*501},{"query":"a","weight":"nan"},
                     {"query":"a","weight":-1},{"query":"a","depth":100},{"query":"a","slop":1.5},{"query":"a","slop":True},{"query":"a","slop":51}]:
            with self.assertRaises(ValueError):
                validate(data)

    def test_weight_zero_removes_lemma_candidate_clause(self):
        engine = Engine.__new__(Engine)
        engine.annotate = Mock(return_value={"shoshan_lemma":"בן ישראל", "tokens":[]})
        engine.index, engine.url, engine.documents = "lemma-poc-test", "http://127.0.0.1:19200", 10
        engine.query_body = Mock(side_effect=lambda q, lemmas, w, n, slop: {"lemmas":lemmas,"_source":[]})
        engine.request = Mock(return_value={"_shards":{"failed":0},"hits":{"total":{"value":1},"hits":[]}})
        engine.compare("בני ישראל", 0, 10)
        self.assertEqual([c.args[1] for c in engine.query_body.call_args_list], [None,None])
        self.assertEqual([c.args[4] for c in engine.query_body.call_args_list], [10,10])
        engine.query_body.reset_mock()
        engine.compare("בני ישראל", .5, 10, 0)
        self.assertEqual([c.args[1] for c in engine.query_body.call_args_list], [None,"בן ישראל"])
        self.assertEqual([c.args[4] for c in engine.query_body.call_args_list], [0,0])

    def test_excessive_expansion_keeps_ranked_phrases(self):
        engine = Engine.__new__(Engine)
        query = "לקרוא שמע בערב"
        tokens = [{"original_start":query.index(word),"original_end":query.index(word)+len(word),
                   "lemma":lemma,"status":"ok"}
                  for word, lemma in zip(query.split(), ["קרא","שמע","ערב"])]
        engine.annotate = Mock(return_value={"shoshan_lemma":"קרא שמע ערב","tokens":tokens})
        engine.annotations = Mock()
        # Reproduce the reported 504-combination query without loading a model.
        engine.annotations.alternatives.side_effect = lambda lemma: [lemma] + [lemma+str(i) for i in range({"קרא":6,"שמע":7,"ערב":8}[lemma])]
        engine.index, engine.url, engine.documents = "lemma-poc-test", "http://127.0.0.1:19200", 10
        engine.query_body = Mock(side_effect=lambda q, lemmas, w, n, slop: {"lemmas":lemmas,"_source":[]})
        engine.request = Mock(return_value={"_shards":{"failed":0},"hits":{"total":{"value":0},"hits":[]}})
        engine.annotations.frequencies = {}
        engine.query_body = Mock(side_effect=lambda q, lemmas, w, n, slop: {
            "lemmas":lemmas,"_source":[],"query":{"function_score":{"query":{"bool":{"should":[{},{}]}}}}})
        result = engine.compare(query, 1, 20, expand_yod_vav=True)
        self.assertTrue(result["expand_yod_vav"])
        self.assertIn("504", result["warnings"][0])
        self.assertEqual(result["expansion_selection"]["selected"],256)
        queries=result["results"]["enhanced"]["request"]["query"]["function_score"]["query"]["bool"]["should"][1]["dis_max"]["queries"]
        self.assertEqual(queries[0]["match_phrase"]["shoshan_lemma"]["query"],"קרא שמע ערב")
        self.assertEqual(result["results"]["baseline"]["request"]["query"]["function_score"]["query"]["bool"]["should"],[{},{}])

    def test_ranked_phrases_match_exhaustive_oracle(self):
        import itertools
        import math
        groups=[["קרא","קורא","קריא","קראה"],["שמע","שומע","שמוע"],["ערב","עורב","עירוב","ערבה"]]
        counts={"קורא":40,"קריא":5,"שומע":50,"שמוע":6,"עורב":32,"עירוב":1}
        def key(words):
            changed=[(group[0], word) for group,word in zip(groups,words) if group[0]!=word]
            return (sum(final_he_variant(a,b) for a,b in changed),len(changed),sum(edit_distance(a,b) for a,b in changed),
                    -sum(math.log1p(counts.get(b,0)) for a,b in changed),words)
        expected=sorted(itertools.product(*groups),key=key)
        for limit in (1,4,10,27,40):
            self.assertEqual(ranked_phrases(groups,counts,limit),expected[:limit])
        self.assertEqual(expected[0],("קרא","שמע","ערב"))
        self.assertLess(expected.index(("קורא","שמע","ערב")),expected.index(("קריא","שמע","ערב")))
        reversed_alternatives=[[g[0]]+list(reversed(g[1:])) for g in groups]
        self.assertEqual(ranked_phrases(reversed_alternatives,counts,10),expected[:10])

    def test_huge_product_is_bounded_and_preserves_original(self):
        groups=[["אב","איב","אוב"]]*30  # 3**30 potential phrases
        phrases=ranked_phrases(groups)
        self.assertEqual(len(phrases),256)
        self.assertEqual(len(set(phrases)),256)
        self.assertEqual(phrases[0],tuple(["אב"]*30))

    def test_parts_preserve_marks_punctuation_and_repeated_words(self):
        text = "😀 בֵּן, בֵּן!"
        tokens = [{"original_start":2,"original_end":6,"lemma":"בן","status":"ok"},
                  {"original_start":8,"original_end":12,"lemma":"בן","status":"ok"}]
        parts = token_parts(text,tokens)
        self.assertEqual("".join(p["text"] for p in parts),text)
        self.assertEqual([p["text"] for p in parts if "lemma" in p],["בֵּן","בֵּן"])

    def test_parts_extend_trailing_marks_and_label_fallback(self):
        parts = token_parts("בּ!",[{"original_start":0,"original_end":1,"lemma":"ב","status":"surface_fallback"}])
        self.assertEqual(parts[0]["text"],"בּ")
        self.assertEqual(parts[0]["status"],"surface_fallback")
        with self.assertRaises(ValueError):
            token_parts("ב",[{"original_start":0,"original_end":3}])

    def test_annotations_reject_wrong_export_or_text(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"lemmas.jsonl"
            row={"doc_id":"x","text_sha256":hashlib.sha256("בן".encode()).hexdigest(),
                 "shoshan_lemma":"בן","tokens":[{"original_start":0,"original_end":2,"lemma":"בן","status":"ok"}]}
            path.write_text(json.dumps(row)+"\n")
            digest=hashlib.sha256(path.read_bytes()).hexdigest()
            with self.assertRaises(ValueError): Annotations(path,"wrong")
            store=Annotations(path,digest)
            hit={"_id":"x","_source":{"exact":"בן","shoshan_lemma":"בן"}}
            self.assertEqual(store.parts(hit)[0]["lemma"],"בן")
            hit["_source"]["exact"]="בת"
            with self.assertRaises(ValueError): store.parts(hit)
            hit["_source"]={"exact":"בן","shoshan_lemma":"בת"}
            with self.assertRaises(ValueError): store.parts(hit)

    def test_expansion_groups_and_empty_reductions(self):
        self.assertEqual(folded("ביכה"),folded("בכה"))
        self.assertNotEqual(folded("ו"),folded("י"))
        store=Annotations.__new__(Annotations)
        store.groups={"בכה":{"בכה","ביכה","בוכה"}}
        self.assertEqual(store.alternatives("ביכה"),["ביכה","בוכה","בכה"])
        self.assertEqual(store.alternatives("חדש"),["חדש"])

    def test_expansion_preserves_phrase_positions_and_boost(self):
        clause=expanded_clause([["רחל"],["בכה","ביכה"],["בן"]],.5,10)["dis_max"]
        phrases=[q["match_phrase"]["shoshan_lemma"] for q in clause["queries"]]
        self.assertEqual([p["query"] for p in phrases],["רחל בכה בן","רחל ביכה בן"])
        self.assertTrue(all(p["slop"]==10 for p in phrases))
        self.assertEqual(clause["boost"],.5)
        self.assertEqual(clause["tie_breaker"],0)
        self.assertEqual(len(expanded_clause([[str(i) for i in range(17)]]*2,1,10)["dis_max"]["queries"]),256)

    def test_final_he_fallback_bridges_makkot_and_is_discounted(self):
        store=Annotations.__new__(Annotations)
        store.groups={"כתב":{"כתוב","כתב"}, "כתבה":{"כתבה"}, "כהתב":{"כהתב"}}
        self.assertIn("כתבה",store.alternatives("כתוב"))
        self.assertIn("כתוב",store.alternatives("כתבה"))
        self.assertNotIn("כהתב",store.alternatives("כתוב"))
        self.assertEqual(store.alternatives("ה"),["ה"])
        groups=[["העיד"],store.alternatives("כתוב")]
        phrases=expanded_clause(groups,2,10,{"כתבה":100000})["dis_max"]["queries"]
        rows=[p["match_phrase"]["shoshan_lemma"] for p in phrases]
        self.assertEqual(rows[0]["query"],"העיד כתוב")
        self.assertEqual(rows[-1]["query"],"העיד כתבה")
        self.assertEqual(rows[-1]["boost"],0.5)
        self.assertTrue(all(r["boost"]==1 for r in rows[:-1]))
        self.assertTrue(all(r["slop"]==10 for r in rows))
        self.assertNotIn(("העיד","כתבה"),ranked_phrases(groups,{"כתבה":100000},2))

    def test_worker_failure_is_returned_to_browser(self):
        engine = Mock()
        engine.compare.side_effect = ValueError("Model unavailable")
        queue = Jobs(engine)
        key = queue.submit(("אמר",1,10))
        queue.pool.shutdown(wait=True)
        self.assertEqual(queue.result(key), {"status":"error","error":"Model unavailable"})
        self.assertEqual(queue.result("missing")["status"], "error")


@override_settings(DEBUG=False, LEMMA_SEARCH_EXPERIMENT=True, LEMMA_SEARCH_BACKEND="celery",
                   LEMMA_SEARCH_INDEX="lemma-poc-test", LEMMA_SEARCH_QUEUE="test-lemma-search")
class ClusterTests(SimpleTestCase):
    def setUp(self):
        self.factory=RequestFactory()
        self.app=Mock()
        self.app.send_task.return_value.id="task-123"
        module=ModuleType("sefaria.celery_setup.app")
        module.app=self.app
        self.modules=patch.dict(sys.modules,{"sefaria.celery_setup.app":module})
        self.modules.start()
        self.addCleanup(self.modules.stop)

    def staff(self,request,pk=5):
        request.user=SimpleNamespace(pk=pk,is_staff=True,is_authenticated=True)
        return request

    def test_staff_page_works_without_debug_or_loopback(self):
        response=page(self.staff(self.factory.get("/",REMOTE_ADDR="192.0.2.1")))
        self.assertEqual(response.status_code,200)
        self.assertIn("no-store",response["Cache-Control"])

    def anonymous(self, request, session):
        request.user=SimpleNamespace(pk=None,is_staff=False,is_authenticated=False)
        request.session=session
        return request

    def test_nonstaff_and_anonymous_can_view_page(self):
        req=self.staff(self.factory.get("/"));req.user.is_staff=False
        self.assertEqual(page(req).status_code,200)
        response=page(self.anonymous(self.factory.get("/"),{}))
        self.assertEqual(response.status_code,200)
        self.assertIn("no-store",response["Cache-Control"])

    def test_anonymous_jobs_are_bound_to_independent_browser_sessions(self):
        session={}
        req=self.anonymous(self.factory.post("/",data={"query":"אמר"},content_type="application/json"),session)
        with patch("reader.lemma_search.cache.add",return_value=True) as rate:
            response=jobs(req)
        self.assertEqual(response.status_code,202)
        first_rate_key=rate.call_args.args[0]
        token=json.loads(response.content)["job"]
        self.app.AsyncResult.return_value.ready.return_value=False
        response=jobs(self.anonymous(self.factory.get("/",{"job":token}),session))
        self.assertEqual(json.loads(response.content)["status"],"running")
        response=jobs(self.anonymous(self.factory.get("/",{"job":token}),{}))
        self.assertEqual(response.status_code,400)
        other=self.anonymous(self.factory.post("/",data={"query":"אמר"},content_type="application/json"),{})
        with patch("reader.lemma_search.cache.add",return_value=True) as rate:
            self.assertEqual(jobs(other).status_code,202)
        self.assertNotEqual(first_rate_key,rate.call_args.args[0])

    def test_dispatch_and_poll_signed_job(self):
        req=self.staff(self.factory.post("/",data={"query":"אמר"},content_type="application/json"))
        with patch("reader.lemma_search.cache.add",return_value=True): response=jobs(req)
        self.assertEqual(response.status_code,202)
        self.assertEqual(self.app.send_task.call_args.kwargs["queue"],"test-lemma-search")
        token=json.loads(response.content)["job"]
        self.app.AsyncResult.return_value.ready.return_value=True
        self.app.AsyncResult.return_value.failed.return_value=False
        self.app.AsyncResult.return_value.result={"query":"אמר"}
        response=jobs(self.staff(self.factory.get("/",{"job":token})))
        self.assertEqual(json.loads(response.content)["status"],"complete")
        response=jobs(self.staff(self.factory.get("/",{"job":token}),pk=6))
        self.assertEqual(response.status_code,400)

    def test_invalid_or_other_index_job_rejected(self):
        for token in ["task-123",signing.dumps({"task":"x","owner":"user:5","index":"lemma-poc-other"},salt=SALT)]:
            self.assertEqual(jobs(self.staff(self.factory.get("/",{"job":token}))).status_code,400)
        self.app.AsyncResult.assert_not_called()

    def test_rate_limit_and_bad_payload(self):
        req=self.staff(self.factory.post("/",data={"query":"אמר"},content_type="application/json"))
        with patch("reader.lemma_search.cache.add",return_value=False): self.assertEqual(jobs(req).status_code,429)
        req=self.staff(self.factory.post("/",data={"query":""},content_type="application/json"))
        self.assertEqual(jobs(req).status_code,400)
        self.app.send_task.assert_not_called()

    def test_transport_target_and_write_guards(self):
        validate_target("http://dev-es:9200","lemma-poc-test",["dev-es"])
        for url,index in [("http://prod:9200","lemma-poc-test"),("http://dev-es:9200","text"),
                          ("http://user:secret@dev-es:9200","lemma-poc-test"),("http://dev-es:9200/path","lemma-poc-test")]:
            with self.assertRaises(ValueError): validate_target(url,index,["dev-es"])
        request=transport("http://dev-es:9200")
        with self.assertRaises(ValueError):request("http://elsewhere:9200")
        with self.assertRaises(ValueError):request("http://dev-es:9200/lemma-poc-test","DELETE")


if __name__ == "__main__":
    unittest.main()
