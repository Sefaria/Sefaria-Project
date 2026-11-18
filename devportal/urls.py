"""URLconf of the developer portal, included by sefaria/urls_developers.py and by the standalone
dev server (devportal/dev/urls_standalone.py).

The full URL map is contract C9 (devportal/contracts/C9_urls.json). Workstreams add their routes
above the fallback, which must stay last: it answers every other path with the page resolver
(home, docs and custom pages, the built-in redirects, the Redirect table, then the 404 page).
"""

from django.urls import path, re_path

from devportal.mcp.django_view import mcp_view

from .views import api, editor_api, gallery, home, machine, pages, reference
from .views.htmlblock import htmlblock_frame

app_name = "devportal"

urlpatterns = [
    # Site files.
    path("robots.txt", pages.robots_txt, name="robots"),
    path("favicon.ico", pages.site_file, {"name": "favicon.ico"}, name="favicon"),
    path("apple-touch-icon.png", pages.site_file, {"name": "apple-touch-icon.png"}, name="apple_touch_icon"),
    path("icon-192.png", pages.site_file, {"name": "icon-192.png"}, name="icon_192"),
    path("icon-512.png", pages.site_file, {"name": "icon-512.png"}, name="icon_512"),
    path("site.webmanifest", pages.web_manifest, name="web_manifest"),
    path("login", pages.login_redirect, name="login"),
    # The MCP server (PLAN.md §2.10): the app's only csrf_exempt view.
    path("mcp", mcp_view, name="mcp"),
    # Agent surface (PLAN.md §2.10): llms files, page Markdown, sitemap, spec, discovery files. Ahead of
    # every page route (C9: page-markdown before docs-page).
    *machine.url_patterns(),
    # Internal endpoints.
    path("_portal/page.json", api.page_json, name="page_json"),
    path("_portal/csrf", api.csrf_token, name="csrf"),
    path("_portal/feedback", api.feedback, name="feedback"),
    re_path(r"^_portal/nav/(?P<section>[a-z]+)\.json$", api.portal_nav, name="portal_nav"),
    re_path(r"^_portal/search-docs\.(?P<sha>[0-9a-f]{7,64})\.json$", api.search_docs, name="search_docs"),
    path("_portal/htmlblock/<str:revision>/<str:n>", htmlblock_frame, name="htmlblock"),
    # The staff editor (PLAN.md §2.11): its _portal/editor/ API and the /editor shell.
    *editor_api.urlpatterns,
    re_path(r"^_portal/", api.portal_not_found, name="portal_not_found"),
    # The homepage (Phase 5).
    path("", machine.negotiate_markdown(home.home_page), name="home"),
    # API reference (C9): /reference redirects; tag groups redirect to their first child; endpoints and
    # hand-written reference pages render here. reference/llms.txt and .md routes must come before these.
    path("reference", reference.reference_root, name="reference_root"),
    path("reference/<str:slug>", machine.negotiate_markdown(reference.reference_page), name="reference_page"),
    # The Powered by Sefaria gallery (PLAN.md §2.14).
    path("powered-by", gallery.gallery_index, name="gallery"),
    path("powered-by/charts", gallery.gallery_charts, name="gallery_charts"),
    path("powered-by/projects/<str:slug>", gallery.gallery_project, name="gallery_project"),
    path("powered-by/<path:rest>", gallery.gallery_unknown, name="gallery_unknown"),
    # Fallback: must stay last.
    re_path(r"^.*$", machine.negotiate_markdown(pages.portal_page), name="page"),
]
