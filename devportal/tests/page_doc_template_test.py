"""page_doc.html: the server-rendered docs page (PLAN.md §2.5, §6.2 G; SITE_ATLAS §4).

Rendered from the C3 doc payload fixtures, it must give the DOM devportal-ui/src/docs/DocPage.tsx gives
(same classes and landmarks), carry no inline style (CSP), and place the slots for W2's feedback widget
and W11's Discord button (D-7).
"""

import copy
import json
import re
from pathlib import Path

import lxml.html
import pytest
from django.template.loader import render_to_string

REPO = Path(__file__).resolve().parents[2]
FIXTURES = REPO / "devportal/contracts/fixtures/shapes/page-payload"


def payload(name):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def render(data):
    html = render_to_string("devportal/page_doc.html", {"payload": data})
    return html, lxml.html.fromstring(f"<div>{html}</div>")


@pytest.fixture
def doc():
    data = payload("doc")
    data["path"] = "/docs/linker-v3"
    data["pager"] = {
        "prev": {"title": "Embed Linker v2 In Your Site", "path": "/docs/linker-v2"},
        "next": {
            "title": "How to Format Citations for the Linker",
            "path": "/docs/how-to-format-citations-for-the-linker",
        },
    }
    data["page"]["toc"] = [*data["page"]["toc"], {"id": "", "text": "", "level": 3}]
    return data


def test_three_columns_and_landmarks(doc):
    html, tree = render(doc)
    # The shell's sidebar markup (Sidebar.tsx) in the column the client draws (slots.tsx renderDocPage).
    assert tree.xpath(
        '//div[@class="dp-docs-frame"]/div[@id="dp-sidebar"]'
        '/nav[@aria-label="Secondary navigation"][contains(@class, "dp-sidebar--app")]'
    )
    assert tree.xpath('//div[@class="dp-docs-frame"]/div[contains(@class, "dp-docs--standard")]/article')
    assert len(tree.xpath("//article[@id='content']")) == 1
    assert [h.text_content() for h in tree.xpath("//h1")] == [doc["page"]["title"]]
    assert tree.xpath('//*[@class="dp-docs__rail"]/nav[@aria-label="Table of Contents"]')
    body = tree.xpath('//div[@id="dp-article-body"]')[0]
    assert body.get("class") == "dp-markdown"
    assert "What is Sefaria?" in body.text_content()


def test_no_inline_styles_or_scripts(doc):
    html, _ = render(doc)
    assert not re.search(r"\sstyle=", html)
    assert "<script" not in html


def test_sidebar_marks_the_current_page_and_opens_its_group(doc):
    _, tree = render(doc)
    current = tree.xpath('//a[@aria-current="page"]')
    assert [a.text_content() for a in current] == ["Embed Linker v3 on Your Site"]
    assert current[0].get("class") == "dp-sidebar-link dp-active dp-sidebar-link--sub"
    assert current[0].get("data-visual") == "sbActive"
    # The toggles are drawn as the client draws them; the current page's group is open, others closed.
    toggle = tree.xpath('//button[@aria-label="Hide subpages for The Sefaria Linker"]')[0]
    assert toggle.get("aria-expanded") == "true"
    assert tree.xpath('//div[@class="dp-sidebar-row dp-sidebar-row--parent"]/a[@href="/docs/linker"]')
    assert tree.xpath('//button[@aria-label="Deprecated Doc"]')


def test_sidebar_closed_groups_stay_laid_out_but_inert():
    data = payload("doc")
    data["path"] = "/docs/welcome"
    _, tree = render(data)
    closed = tree.xpath('//ul[contains(@class, "dp-sidebar-list--collapsed")]')[0]
    assert closed.get("aria-hidden") == "true" and "inert" in closed.attrib
    assert tree.xpath('//button[@aria-label="Show subpages for The Sefaria Linker"][@aria-expanded="false"]')


def test_sidebar_opens_a_group_that_is_the_current_page():
    data = payload("doc")
    data["path"] = "/docs/linker"
    _, tree = render(data)
    assert tree.xpath('//button[@aria-label="Hide subpages for The Sefaria Linker"][@aria-expanded="true"]')
    assert not tree.xpath('//ul[contains(@class, "dp-sidebar-list--collapsed")]')


def test_sidebar_footer_has_the_discord_button(doc):
    _, tree = render(doc)
    link = tree.xpath('//div[@data-visual-deviation="D-2"]//a[@data-discord-cta="sidebar_footer"]')[0]
    assert link.get("class") == "dp-discord-button dp-discord-button--primary"
    assert link.get("target") == "_blank" and link.text_content() == "Join our Discord"


def test_link_items_open_in_a_new_tab_with_the_external_arrow(doc):
    _, tree = render(doc)
    link = tree.xpath('//a[@href="https://github.com/Sefaria/Sefaria-Project"]')[0]
    assert link.get("target") == "_blank"
    assert link.get("rel") == "noopener noreferrer"
    assert link.xpath('./svg[@class="dp-sidebar-external"][@aria-hidden="true"]')


def test_footer_updated_pagination_feedback_then_discord(doc):
    _, tree = render(doc)
    footer = tree.xpath('//footer[@class="dp-docs-footer"]')[0]
    children = [c.get("class") for c in footer]
    assert children == [
        "dp-updated-row",
        "dp-docs-footer__divider",
        "dp-pagination",
        "dp-docs-footer__feedback",
        "dp-docs-footer__discord",
    ]
    assert footer[0].text_content() == "Updated 2026-05-12"
    assert footer[0].xpath(".//time/@datetime") == ["2026-05-12T14:03:22Z"]
    assert footer[0].xpath('.//p[@data-visual="updated"]/@data-visual-mask') == ["updatedAgo"]
    nav = footer.xpath('./nav[@aria-label="Pagination Controls"]')[0]
    assert nav.xpath("./a/@aria-label") == [
        "Previous Page: Embed Linker v2 In Your Site",
        "Next Page: How to Format Citations for the Linker",
    ]
    assert nav.get("data-visual") == "pagination" and nav.xpath("./a[1]/@data-visual") == ["pageLink"]
    assert footer[4].get("data-discord-placement") == "docs_page_end"
    # The button itself, as the client renders it, so the page does not grow when React takes over.
    assert footer[4].xpath('./a[@data-discord-cta="docs_page_end"]')


def test_reference_guide_layout_has_copy_page_in_the_header_and_the_toc_at_the_edge():
    data = payload("doc-reference-guide")
    _, tree = render(data)
    guide = tree.xpath('//div[contains(@class, "dp-docs--guide")]/div[@class="dp-docs__guide"]')[0]
    assert guide.xpath('./article/header/div[@class="dp-docs-header__top"]/div[@data-slot="copy-page"]')
    assert guide.xpath('./div[@class="dp-docs__rail"]')
    assert not tree.xpath('//div[@class="dp-docs__copy-page"]')


def test_first_toc_entry_is_current_as_the_scroll_spy_marks_it(doc):
    _, tree = render(doc)
    links = tree.xpath('//nav[@aria-label="Table of Contents"]//a')
    assert links[0].get("aria-current") == "location" and "dp-active" in links[0].get("class")
    assert all(a.get("aria-current") is None for a in links[1:])


def test_toc_keeps_live_empty_entries_without_links(doc):
    _, tree = render(doc)
    items = tree.xpath('//nav[@aria-label="Table of Contents"]//li')
    assert [li.get("class") for li in items] == ["dp-toc-item dp-toc-item--h2", "dp-toc-item dp-toc-item--h3"] + [
        "dp-toc-item dp-toc-item--h3"
    ]
    assert items[-1].xpath("./a") == []


def test_no_pagination_without_links(doc):
    data = copy.deepcopy(doc)
    data["pager"] = {"prev": None, "next": None}
    _, tree = render(data)
    assert not tree.xpath('//nav[@aria-label="Pagination Controls"]')


def test_custom_page_has_no_sidebar_rail_or_updated():
    data = payload("doc-custom-page")
    _, tree = render(data)
    assert tree.xpath('//div[contains(@class, "dp-docs--custom")]')
    assert not tree.xpath('//nav[@aria-label="Secondary navigation"]')
    assert not tree.xpath('//*[@class="dp-docs__rail"]')
    assert not tree.xpath('//*[@class="dp-updated"]')
    assert tree.xpath('//*[@data-slot="feedback"]')


def test_contact_page_form_survives_without_its_inline_style():
    from devportal.markdown import render as render_md

    source = (REPO / "devportal/migration_source/custom_pages/contact-us.html").read_text(encoding="utf-8")
    assert "style=" in source
    data = payload("doc-custom-page")
    data["page"]["bodyHtml"] = render_md(source).html
    html, tree = render(data)
    frame = tree.xpath('//div[@id="dp-article-body"]//iframe')[0]
    assert frame.get("src") == "https://sefaria.formstack.com/forms/developer_contact"
    assert frame.get("height") == "1000"
    assert not re.search(r"\sstyle=", html)
