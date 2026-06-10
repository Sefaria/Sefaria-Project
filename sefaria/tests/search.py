import pytest
import re
from sefaria.search import TextIndexer as TI
from sefaria.model import *
from sefaria.utils.hebrew import strip_cantillation

def test_make_text_index_document():
    oref = Ref('Genesis 1')
    tref = oref.normal()
    he_ref = oref.he_normal()
    vtitle = "Tanach with Ta'amei Hamikra"
    version = [v for v in oref.versionset() if v.versionTitle == vtitle][0]
    lang = version.language
    priority = version.priority
    content = TextChunk(oref, lang, vtitle=vtitle).ja().flatten_to_string()
    index = TI.curr_index = oref.index
    categories = index.categories
    heVtitle = version.versionTitleInHebrew

    TI.best_time_period = index.best_time_period()
    comp_date = int(TI.best_time_period.start)

    doc = TI.make_text_index_document(tref, he_ref, vtitle, lang, priority, content, categories, heVtitle)

    ref_data = RefData().load({"ref": tref})
    pagesheetrank = ref_data.pagesheetrank if ref_data is not None else RefData.DEFAULT_PAGESHEETRANK
    content = TI.modify_text_in_doc(content)
    assert doc == {
        "ref": tref,
        "heRef": he_ref,
        "version": vtitle,
        "lang": lang,
        "version_priority": priority,
        "titleVariants": oref.index_node.all_tree_titles("en"),
        "categories": categories,
        "order": oref.order_id(),
        "path": "/".join(categories + [index.title]),
        "pagesheetrank": pagesheetrank,
        "comp_date": comp_date,
        "exact": content,
        "naive_lemmatizer": content,
        'hebrew_version_title': heVtitle,

    }


