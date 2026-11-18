"""Server rendering of an endpoint page around the prerendered article (PLAN.md §2.5; devportal/page_endpoint.html).

The Vite build prerenders each operation's article and playground from the spec alone
(`{% devportal_prerendered "endpoint" operationId %}`). `{{ html|endpoint_page:payload }}` fits that file to the
page's payload, so the page reads right without JavaScript:

- the title (`data-dp-slot="title"`) and the description (`data-dp-slot="description"`) become the overlay's;
- the overlay's free Markdown (`page.bodyHtml`) follows the headline;
- the page footer ("Updated", prev/next, the feedback slot; devportal/endpoint_footer.html) ends the article,
  where the client's `EndpointArticle` puts it.

React replaces all of this on mount (createRoot), from the same payload.
"""

import re

from django import template
from django.template.loader import render_to_string
from django.utils.html import escape
from django.utils.safestring import mark_safe

register = template.Library()

FALLBACK_CLASS = "dp-endpoint-fallback"
TITLE_SLOT = re.compile(r'(<span data-dp-slot="title">)(.*?)(</span>)', re.S)
# The description is the headline's last element: its markdown wrapper closes right before </header>.
DESCRIPTION_SLOT = re.compile(r'(data-dp-slot="description"><div class="[^"]*">)(.*?)(</div></div></header>)', re.S)
HEADLINE = 'data-visual-region="headline"'


@register.filter
def is_prerendered_endpoint(html):
    """False when the prerender tag fell back to its empty placeholder (no build, or no file for the operation)."""
    return bool(html) and FALLBACK_CLASS not in str(html)


@register.filter
def endpoint_page(html, payload):
    html = str(html)
    page = payload["page"]
    html = TITLE_SLOT.sub(lambda m: m[1] + escape(page["title"]) + m[3], html, count=1)
    if page.get("descriptionHtml"):
        # Rendered and sanitized by devportal.markdown (contract C4).
        html = DESCRIPTION_SLOT.sub(lambda m: m[1] + page["descriptionHtml"] + m[3], html, count=1)
    if page.get("bodyHtml"):
        start = html.find(HEADLINE)
        end = html.find("</header>", start) if start >= 0 else -1
        if end >= 0:
            end += len("</header>")
            body = f'<div class="dp-article dp-endpoint-body">{page["bodyHtml"]}</div>'
            html = html[:end] + body + html[end:]
    close = html.find("</article>")
    if close >= 0:
        footer = render_to_string("devportal/endpoint_footer.html", {"payload": payload})
        html = html[:close] + footer + html[close:]
    return mark_safe(html)  # noqa: S308 - our own build output and server-sanitized HTML
