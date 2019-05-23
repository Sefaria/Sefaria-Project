import django
django.setup()
from collections import defaultdict
from sefaria.model import *
from sefaria.client.wrapper import get_links
from sefaria.system.database import db
from sefaria.system.exceptions import InputError

# TODO throw out refs in long sections
# TODO do better job of double author
# TODO nexus of sheet and commentator bonus? b/c it must be good if they both thought of it
# TODO maybe distance penalty also??

DIRECT_LINK_SCORE = 2.0
COMMENTARY_LINK_SCORE = 0.7
SHEET_REF_SCORE = 1.0
INCLUDED_REF_MAX = 50
REF_RANGE_MAX = 30


def R(tref):
    '''
    Relevance sources connected to central ref
    :param tref: Central ref
    :return: All of the related refs, scored (0...inf), and what it connects through.
        list of tuples:
            [(tref, {score: float,
                    sources: [str, ...]})]
    '''
    sheet_refs = get_sheets_for_ref(tref)
    link_refs, commentary_ref_set = get_items_linked_to_ref(tref)

    all_related = sheet_refs + link_refs
    d = defaultdict(lambda: {"score": 0.0, "sources": []})
    for tref, score, source in all_related:
        d[tref]["score"] += score
        d[tref]["sources"] += [source]
    # filter items with fewer than 2 votes
    ditems = filter(lambda x: x[0] not in commentary_ref_set and sources_interesting(x[1]["sources"]), d.items())
    return ditems


def sources_interesting(sources):
    # make sure either source has more than 3 voices, or there's at least one sheet or direct link
    filt = filter(lambda x: (x.startswith("Sheet ") or x == "direct"), sources)
    return len(sources) >= 3 or (len(sources) >= 2 and len(filt) > 0)


def get_items_linked_to_ref(tref):
    '''
    Given a ref, returns items connected to central ref through links - direct links and links through commentaries.
    :param tref:
    :return: Twos things:
                list of tuples, each one with (tref, score, way of connection[str])
                [tref, tref] - all of the refs in the above set that are direct commentaries of original tref
    '''

    oref = Ref(tref)
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
            temp_commentary_links, _, _ = normalize_related_refs([x["ref"] for x in get_links(link_tref, with_text=False)], None, COMMENTARY_LINK_SCORE)
            for commentary_link in temp_commentary_links:
                if author is not None and (commentary_link, author) in commentary_author_set:
                    # don't add same ref twice from same author
                    continue
                commentary_author_set.add((commentary_link, author))
                commentary_links += [(commentary_link, COMMENTARY_LINK_SCORE, link_tref)]
    is_comment_list = [x[1] for x in direct_links]
    direct_links, _, is_comment_list = normalize_related_refs([x[0] for x in direct_links], None, DIRECT_LINK_SCORE, other_data=is_comment_list)
    final_refs = [(x, DIRECT_LINK_SCORE, "direct") for x in direct_links] + commentary_links
    commentary_ref_set = set(map(lambda x: x[0], filter(lambda x: x[1], zip(direct_links, is_comment_list))))
    return final_refs, commentary_ref_set


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


def is_interesting_sheet(sheet):
    included_refs = sheet.get("includedRefs", [])
    if len(included_refs) > INCLUDED_REF_MAX:
        # this guy has waaaay too much to talk about. probably not interesting
        return False
    if sheet.get("title", "") == "New Source Sheet":
        # didn't care enough to change default title. wow
        return False
    return True

def get_sheets_for_ref(tref):
    '''
    
    :param tref:
    :return: list of tuples, each one with (tref, score, way of connection[str])
    '''
    oref = Ref(tref)
    section_ref = oref.section_ref()
    regex_list = section_ref.regex(as_list=True)
    ref_clauses = [{"includedRefs": {"$regex": r}} for r in regex_list]
    query = {"status": "public", "$or": ref_clauses, "viaOwner": {"$exists": 0}, "assignment_id": {"$exists": 0}}
    sheets_cursor = db.sheets.find(query, {"includedRefs": 1, "owner": 1, "id": 1, "tags": 1, "title": 1})
    included_ref_dict = {}
    for sheet in sheets_cursor:
        if not is_interesting_sheet(sheet):
            continue
        temp_included, focus_range_factor, _ = normalize_related_refs(sheet.get("includedRefs", []), tref, SHEET_REF_SCORE, check_has_ref=True, count_steinsaltz=True)
        if focus_range_factor == 0:
            continue
        ref_owner_keys = [(r, sheet["owner"]) for r in temp_included]
        for k in ref_owner_keys:
            if (k in included_ref_dict and included_ref_dict[k]["score"] < focus_range_factor) or k not in included_ref_dict:
                included_ref_dict[k] = {"score": focus_range_factor, "source": "Sheet " + str(sheet["id"])}

    included_refs = [(r, d["score"], d["source"]) for (r, _), d in included_ref_dict.items()]
    return included_refs


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


def recommend_simple(tref, n):
    """
    Wraps R, ranks results
    This function doesn't need to learn. Just calculates Relevance * Novelty
    Returns top N recommendations
    :param tref:
    :param n: Number of recommendations desired
    :return: Sorted list - All of the related refs, scored (0...inf), and what it connects through.
        list of tuples:
            [(tref, {score: float,
                    sources: [str, ...]})]
    """
    tref = Ref(tref).normal()  # normalize tref
    r_list = R(tref)
    score_list = []
    for other_tref, value in r_list:
        ref_data = RefData().load({"ref": other_tref})
        novelty = ref_data.inverse_pagesheetrank() if ref_data is not None else 1.0
        score_list += [(other_tref, value["score"]*novelty, value["sources"])]
    sorted_scores = filter(lambda x: x[1] > 0, sorted(score_list, key=lambda x: x[1], reverse=True))
    return sorted_scores[:n]


def recommend_simple_clusters(tref, top=10, threshold=5):
    '''

    :param tref:
    :param top: Number of recommendations desired
    :param threshold: Max cluster distance
    :return: Sorted list - All of the related refs, scored (0...inf), and what it connects through.
        list of tuples:
            [(tref, {score: float,
                    sources: [str, ...]})]
    '''
    liste = recommend_simple(tref, top * 5)
    ref_list, other_item_list = [], []
    oref = Ref(tref)
    for temp_tref, score, sources in liste:
        try:
            temp_oref = Ref(temp_tref)
        except InputError:
            continue
        if temp_oref.index.title == oref.index.title:
            continue
        ref_list += [temp_oref]
        other_item_list += [{"score": score, "sources": sources}]

    clusters = cluster_close_refs(ref_list, other_item_list, threshold)

    liste_final = []
    for elem in clusters:
        if len(elem) == 1:
            liste_final.append((elem[0]["ref"], elem[0]["data"]["score"], elem[0]["data"]["sources"]))
        else:
            scores = [pos["data"]["score"] for pos in elem]
            sources = reduce(lambda a, b: a + b["data"]["sources"], elem, [])
            if elem[0]["ref"].primary_category in ("Tanakh", "Talmud"):
                # only combine clusters for Tanakh and Talmud
                liste_final.append(((elem[0]["ref"].to(elem[-1]["ref"])), max(scores), sources))
            else:
                argmax = max(range(len(scores)), key=lambda i: scores[i])  # see here for this semi-readable hack for argmax() https://towardsdatascience.com/there-is-no-argmax-function-for-python-list-cd0659b05e49
                liste_final.append((elem[argmax]["ref"], elem[argmax]["data"]["score"], elem[argmax]["data"]["sources"]))
    return sorted(liste_final, key=lambda x: x[1], reverse=True)[:top]
