import django
django.setup()
from collections import defaultdict
from sefaria.model import *
from sefaria.client.wrapper import get_links
from sefaria.system.database import db
from sefaria.system.exceptions import InputError

# TODO dont double count source and its commentary (might be costly)
# TODO do better job of double author
# TODO maybe distance penalty also??

DIRECT_LINK_SCORE = 2.0
COMMENTARY_LINK_SCORE = 0.7
SHEET_REF_SCORE = 1.0
INCLUDED_REF_MAX = 50
REF_RANGE_MAX = 30


class Recommendation:

    def __init__(self, oref=None, relevance=0.0, score=None, sources=None):
        self.ref = oref
        self.relevance = relevance
        self.novelty = None
        self._score = score
        self.sources = sources if sources is not None else []

    def __add__(self, other):
        new_ref = self.ref if self.ref is not None else other.ref
        return Recommendation(new_ref, relevance=self.relevance + other.relevance, novelty=self.novelty, sources=self.sources + other.sources)

    def __iadd__(self, other):
        self.ref = self.ref if self.ref is not None else other.ref
        self.relevance += other.relevance
        self.sources += other.sources
        return self

    def to_dict(self):
        return {
            "ref": self.ref.normal(),
            "score": self.score,
            "sources": self.sources
        }

    @property
    def score(self):
        if self._score is None:
            ref_data = RefData().load({"ref": self.ref.normal()})
            self.novelty = ref_data.inverse_pagesheetrank() if ref_data is not None else 1.0
            self._score = self.relevance * self.novelty
        return self._score

    def sources_interesting(self):
        # make sure either source has more than 2 sheets or direct linkss
        filt = filter(lambda x: (x.startswith("Sheet ") or x == "direct"), self.sources)
        return len(filt) >= 2


class RecommendationEngine:

    def __init__(self, tref, top=10, exclude_direct_commentary=True, limit_to_direct_link=False, cluster_max_dist=5):
        self.ref = Ref(tref)
        self.top = top
        self.exclude_direct_commentary = exclude_direct_commentary
        self.limit_to_direct_link = limit_to_direct_link
        self.cluster_max_dist = cluster_max_dist
        self.commentary_link_ref_set = set()
        self.direct_link_ref_set = set()
        self.recommendations = []

        self.get_all_possible_recs()
        self.reduce_recs()
        self.filter_recs()
        self.choose_top(top*5)
        self.cluster_recs()
        self.choose_top(top)

    def get_all_possible_recs(self):
        sheet_recs = self.get_recs_thru_sheets(self.ref)
        link_recs, commentary_link_ref_set, direct_link_ref_set = self.get_recs_thru_links(self.ref)
        self.commentary_link_ref_set = commentary_link_ref_set
        self.direct_link_ref_set = direct_link_ref_set

        self.recommendations = sheet_recs + link_recs
        return self

    def reduce_recs(self):
        d = defaultdict(Recommendation)
        for temp_rec in self.recommendations:
            d[temp_rec.ref.normal()] += temp_rec
        self.recommendations = d.values()
        return self

    def filter_recs(self):
        def filterer(rec):
            tref = rec.ref.normal()
            if self.exclude_direct_commentary and tref in self.commentary_link_ref_set:
                return False
            if self.limit_to_direct_link and tref not in self.direct_link_ref_set:
                return False
            if not rec.sources_interesting():
                return False
            return True
        self.recommendations = filter(filterer, self.recommendations)
        return self

    def choose_top(self, top):
        self.recommendations.sort(key=lambda rec: rec.score, reverse=True)
        self.recommendations = self.recommendations[:top]
        return self

    def cluster_recs(self):
        def combine_cluster(cluster):
            if len(cluster) == 1:
                return cluster[0]["data"]
            else:
                scores = [item["data"].score for item in cluster]
                sources = reduce(lambda a, b: a + b["data"].sources , cluster, [])
                if cluster[0]["data"].ref.primary_category in ("Tanakh", "Talmud"):
                    # only combine clusters for Tanakh and Talmud
                    ranged_ref = cluster[0]["data"].ref.to(cluster[-1]["data"].ref)
                    return Recommendation(ranged_ref, score=max(scores), sources=list(set(sources)))
                else:
                    argmax = max(range(len(scores)), key=lambda i: scores[i])  # see here for this semi-readable hack for argmax() https://towardsdatascience.com/there-is-no-argmax-function-for-python-list-cd0659b05e49
                    return cluster[argmax]["data"]

        ref_list = [rec.ref for rec in self.recommendations]
        clusters = self.cluster_close_refs(ref_list, self.recommendations, self.cluster_max_dist)
        self.recommendations = map(combine_cluster, clusters)
        return self

    @staticmethod
    def get_recs_thru_links(oref):
        '''
        Given a ref, returns items connected to central ref through links - direct links and links through commentaries.
        :param oref:
        :return: Twos things:
                    list of `Recommendation`s
                    [tref, tref] - all of the refs in the above set that are direct commentaries of original tref
        '''

        section_ref = oref.section_ref()
        commentary_links = []
        commentary_author_set = set()
        # set is used b/c sometimes there are duplicate links
        direct_links = {(x["ref"], x["category"] in ("Commentary", "Modern Commentary"))
                        for x in get_links(section_ref.normal(), with_text=False) if oref in Ref(x["anchorRef"]).range_list()}
        for link_tref, is_comment in direct_links:
            # Steinsaltz is hard-coded to have same connections as Talmud which will double count Talmud connections
            if is_comment and not link_tref.startswith("Steinsaltz on "):
                link_oref = Ref(link_tref)
                author = getattr(link_oref.index, "collective_title", None)
                temp_commentary_links, _, _ = RecommendationEngine.normalize_related_refs([x["ref"] for x in get_links(link_tref, with_text=False)], None, COMMENTARY_LINK_SCORE)
                for commentary_link in temp_commentary_links:
                    if author is not None and (commentary_link, author) in commentary_author_set:
                        # don't add same ref twice from same author
                        continue
                    commentary_author_set.add((commentary_link, author))
                    commentary_links += [Recommendation(Ref(commentary_link), relevance=COMMENTARY_LINK_SCORE, sources=[link_tref])]
        is_comment_list = [x[1] for x in direct_links]
        direct_links, _, is_comment_list = RecommendationEngine.normalize_related_refs([x[0] for x in direct_links], None, DIRECT_LINK_SCORE, other_data=is_comment_list)
        direct_ref_set = set(direct_links)
        final_rex = [Recommendation(Ref(x), relevance=DIRECT_LINK_SCORE, sources=["direct"]) for x in direct_links] + commentary_links
        commentary_ref_set = set(map(lambda x: x[0], filter(lambda x: x[1], zip(direct_links, is_comment_list))))
        return final_rex, commentary_ref_set, direct_ref_set

    @staticmethod
    def is_interesting_sheet(sheet):
        included_refs = sheet.get("includedRefs", [])
        if len(included_refs) > INCLUDED_REF_MAX:
            # this guy has waaaay too much to talk about. probably not interesting
            return False
        if sheet.get("title", "") == "New Source Sheet":
            # didn't care enough to change default title. wow
            return False
        return True

    @staticmethod
    def get_recs_thru_sheets(oref):
        '''

        :param oref:
        :return: list of tuples, each one with (tref, score, way of connection[str])
        '''
        section_ref = oref.section_ref()
        regex_list = section_ref.regex(as_list=True)
        ref_clauses = [{"includedRefs": {"$regex": r}} for r in regex_list]
        query = {"status": "public", "$or": ref_clauses, "viaOwner": {"$exists": 0}, "assignment_id": {"$exists": 0}}
        sheets_cursor = db.sheets.find(query, {"includedRefs": 1, "owner": 1, "id": 1, "tags": 1, "title": 1})
        included_ref_dict = {}
        for sheet in sheets_cursor:
            if not RecommendationEngine.is_interesting_sheet(sheet):
                continue
            temp_included, focus_range_factor, _ = RecommendationEngine.normalize_related_refs(sheet.get("includedRefs", []), oref.normal(), SHEET_REF_SCORE, check_has_ref=True, count_steinsaltz=True)
            if focus_range_factor == 0:
                continue
            ref_owner_keys = [(r, sheet["owner"]) for r in temp_included]
            for k in ref_owner_keys:
                if (k in included_ref_dict and included_ref_dict[k]["score"] < focus_range_factor) or k not in included_ref_dict:
                    included_ref_dict[k] = {"score": focus_range_factor, "source": "Sheet " + str(sheet["id"])}

        return [Recommendation(Ref(r), relevance=d["score"], sources=[d["source"]]) for (r, _), d in included_ref_dict.items()]

    @staticmethod
    def cluster_close_refs(ref_list, data_list, dist_threshold):
        '''

        :param ref_list: list of orefs
        :param data_list: list of data to associate w/ refs (same length as ref_list)
        :param dist_threshold: max distance where you want two refs clustered
        :return: List of lists where each internal list is a cluster
        '''

        clusters = []
        item_list = sorted(zip(ref_list, data_list), key=lambda x: x[0].order_id())
        for temp_oref, temp_data in item_list:
            added_to_cluster = False
            new_cluster_item = {"ref": temp_oref, "data": temp_data}
            for temp_cluster in clusters:
                for temp_cluster_item in temp_cluster:
                    if -1 < temp_cluster_item["ref"].distance(temp_oref) <= dist_threshold:
                        temp_cluster.append(new_cluster_item)
                        added_to_cluster = True
                        break
                if added_to_cluster:
                    break
            if not added_to_cluster:
                clusters += [[new_cluster_item]]
        return clusters

    @staticmethod
    def normalize_related_refs(related_refs, focus_ref, base_score, check_has_ref=False, other_data=None, count_steinsaltz=False):
        '''

        :param related_refs:
        :param focus_ref:
        :param base_score:
        :param check_has_ref:
        :param other_data:
        :param count_steinsaltz:
        :return:
        '''
        # make sure oref is in includedRefs but don't actually add those to the final includedRefs
        has_tref = not check_has_ref
        focus_range_factor = 0.0  # multiplicative factor based on how big a range the focus_ref is in
        final_refs = []
        other_data = [None]*len(related_refs) if other_data is None else other_data
        final_other_data = None if other_data is None else []
        for temp_tref, other_data_item in zip(related_refs, other_data):
            try:
                temp_oref = Ref(temp_tref)
            except InputError:
                continue
            if temp_oref.is_section_level():
                continue
            if temp_oref.is_range():
                temp_range_list = [subref.normal() for subref in temp_oref.range_list()]
                if focus_ref in temp_range_list:
                    temp_focus_range_factor = base_score/len(temp_range_list) if len(temp_range_list) < REF_RANGE_MAX else 0.0
                    if temp_focus_range_factor > focus_range_factor:
                        focus_range_factor = temp_focus_range_factor
                    has_tref = True
                    continue
                final_refs += temp_range_list
                final_other_data += [other_data_item] * len(temp_range_list)

            else:
                if focus_ref == temp_oref.normal():
                    focus_range_factor = base_score
                    has_tref = True
                    continue
                final_refs += [temp_tref]
                final_other_data += [other_data_item]
        if count_steinsaltz:
            # transform mentions of steinsaltz to talmud
            final_refs = map(lambda x: x.replace("Steinsaltz on ", ""), final_refs)
        else:
            # throw out steinsaltz
            filter_result = filter(lambda x: "Steinsaltz on " not in x[0], zip(final_refs, final_other_data))
            final_refs, final_other_data = reduce(lambda a, b: [a[0]+[b[0]], a[1]+[b[1]]], filter_result, [[], []])
        if has_tref:
            return final_refs, focus_range_factor, final_other_data
        return [], focus_range_factor, final_other_data

