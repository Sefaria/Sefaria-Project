"""
Endpoints for the AI chatbot's admin MCP endpoint (chat.sefaria.org/mcp/admin). See
docs/arch_docs/topic_prompts_admin_mcp.md.

Requests authenticate with a staff session, or with an MCP token in the X-Session-ID header for a
staff member who signed in through /api/mcp/authorize (see SessionIDAuthMiddleware).
"""
from django.views import View

from sefaria.client.util import jsonResponse
from sefaria.helper import topic_links_admin, topic_prompts_admin
from sefaria.system.exceptions import InputError
from .views import _load_json_body


def _base_url(request):
    return request.build_absolute_uri("/").rstrip("/")


def _via(request):
    """How the editor authenticated, for audit records: "mcp" (a token from the admin MCP) or "session"."""
    return getattr(request, "auth_via", None) or "session"


class AdminMCPAPIView(View):
    """Rejects non-staff with JSON 401/403 instead of redirecting to a login page."""

    def dispatch(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return jsonResponse({"error": "Authentication required. Sign in to Sefaria as a staff member."},
                                status=401)
        if not request.user.is_staff:
            return jsonResponse({"error": "Staff only."}, status=403)
        return super().dispatch(request, *args, **kwargs)


class TopicPromptsView(AdminMCPAPIView):

    def get(self, request):
        params = request.GET
        try:
            return jsonResponse(topic_prompts_admin.list_prompts(
                lang=params.get("lang", "en"),
                link_id=params.get("id"),
                topics=params.getlist("topic"),
                review_state=params.get("review_state"),
                published=params.get("published"),
                ai_generated=params.get("ai_generated"),
                ref=params.get("ref"),
                q=params.get("q"),
                limit=params.get("limit"),
                cursor=params.get("cursor"),
                base_url=_base_url(request),
            ))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class TopicPromptView(AdminMCPAPIView):

    def patch(self, request, link_id):
        body, err = _load_json_body(request)
        if err:
            return err
        fields = {k: body[k] for k in topic_prompts_admin.EDITABLE_FIELDS + ("review_state",) if k in body}
        try:
            return jsonResponse(topic_prompts_admin.update_prompt(
                link_id,
                body.get("lang", "en"),
                fields,
                body.get("base_version"),
                request.user.id,
                dry_run=bool(body.get("dry_run", False)),
                base_url=_base_url(request),
                via=_via(request),
            ))
        except topic_prompts_admin.TopicPromptNotFound as e:
            return jsonResponse({"error": str(e)}, status=404)
        except topic_prompts_admin.TopicPromptConflict as e:
            return jsonResponse({"error": str(e), "current": e.current}, status=409)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class TopicPromptsPublishView(AdminMCPAPIView):
    """POST {"items": [{"id", "base_version"}], "lang", "published": true|false, "dry_run"}."""

    def post(self, request):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            return jsonResponse(topic_prompts_admin.set_published(
                body.get("items"), body.get("lang", "en"), body.get("published", True), request.user.id,
                dry_run=bool(body.get("dry_run", False)), base_url=_base_url(request), via=_via(request),
            ))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class TopicPromptsGenerateView(AdminMCPAPIView):
    """POST {"topic", "lang", "ids"?}: queue AI prompts for sources with ai_context and no prompt."""

    def post(self, request):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            return jsonResponse(topic_prompts_admin.generate_prompts(body.get("topic"), body.get("ids") or [], body.get("lang", "en")), status=202)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class AdminTaskView(AdminMCPAPIView):
    """GET a background task's state (the staff-only view of /api/async/<id>)."""

    def get(self, request, task_id):
        from celery.result import AsyncResult
        result = AsyncResult(task_id)
        payload = {"task_id": task_id, "state": result.state, "ready": result.ready()}
        if result.ready():
            payload["successful"] = result.successful()
            if not result.successful():
                payload["error"] = str(result.result)
        return jsonResponse(payload)


class RefTopicLinksView(AdminMCPAPIView):
    """POST {"ref", "topic", "lang", "dry_run"} tags a passage; DELETE with the same query parameters untags it."""

    def post(self, request):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            return jsonResponse(topic_links_admin.tag_ref(body.get("ref") or "", body.get("topic") or "", body.get("lang", "en"), dry_run=bool(body.get("dry_run", False))))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)

    def delete(self, request):
        params = request.GET
        try:
            return jsonResponse(topic_links_admin.untag_ref(params.get("ref") or "", params.get("topic") or "", params.get("lang", "en"),
                                                            dry_run=params.get("dry_run") in ("1", "true")))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


def _entry_version(contents):
    return topic_prompts_admin.description_version(contents)


class AdminLexiconEntryView(AdminMCPAPIView):
    """
    A dictionary entry for staff tools: GET reads it with a `version`; PATCH {"content", "base_version", "dry_run"}
    changes only the fields given and keeps the rest (lexicon_admin_views.merge_entry_content: one code path for the
    preview and the save, a write filtered on the entry as read, history and the cached ref as in the moderators'
    editor, #3730). An entry changed since it was read answers 409 with the current entry.
    """

    def get(self, request, lexicon, headword):
        from .lexicon_admin_views import AmbiguousLexiconEntry, _load_lexicon_entry
        try:
            entry = _load_lexicon_entry(lexicon, headword)
        except AmbiguousLexiconEntry:
            return jsonResponse({"error": "More than one entry currently matches this headword."}, status=409)
        if not entry:
            return jsonResponse({"error": "Entry not found."}, status=404)
        contents = entry.contents()
        return jsonResponse({"entry": contents, "content_attr_names": sorted(entry.content_attr_names()), "version": _entry_version(contents)})

    def patch(self, request, lexicon, headword):
        from .lexicon_admin_views import AmbiguousLexiconEntry, LexiconEntryConflict, _load_lexicon_entry, merge_entry_content
        body, err = _load_json_body(request)
        if err:
            return err
        if not body.get("base_version"):
            return jsonResponse({"error": "base_version is required. Read the entry first and pass its version."}, status=400)
        if not isinstance(body.get("content"), dict) or not body["content"]:
            return jsonResponse({"error": "'content' must be an object of the fields to replace."}, status=400)
        try:
            entry = _load_lexicon_entry(lexicon, headword)
        except AmbiguousLexiconEntry:
            return jsonResponse({"error": "More than one entry currently matches this headword."}, status=409)
        if not entry:
            return jsonResponse({"error": "Entry not found."}, status=404)
        dry_run = bool(body.get("dry_run"))
        try:
            result = merge_entry_content(request.user.id, lexicon, entry, body["content"], body["base_version"], _entry_version, dry_run=dry_run)
        except LexiconEntryConflict as e:
            current = {"entry": e.current, "version": _entry_version(e.current)} if e.current else None
            return jsonResponse({"error": str(e), "current": current}, status=409)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
        if dry_run:
            return jsonResponse({"dry_run": True, **result})
        return jsonResponse({"status": "ok", "entry": result["after"], "version": _entry_version(result["after"]), "via": _via(request)})


class AdminLexiconHeadwordView(AdminMCPAPIView):
    """PATCH {"new_headword", "dry_run"}: rename a headword through the moderators' tool (LexiconEntryHeadwordView, #3730)."""

    def patch(self, request, lexicon, headword):
        from sefaria.helper.schema import get_available_lexicon_headword
        from .lexicon_admin_views import AmbiguousLexiconEntry, LexiconEntryHeadwordView, _load_lexicon_entry
        body, err = _load_json_body(request)
        if err:
            return err
        if body.get("dry_run"):
            try:
                entry = _load_lexicon_entry(lexicon, headword)
            except AmbiguousLexiconEntry:
                return jsonResponse({"error": "More than one entry currently matches this headword."}, status=409)
            if not entry:
                return jsonResponse({"error": "Entry not found."}, status=404)
            new_headword = body.get("new_headword")
            if not isinstance(new_headword, str):
                return jsonResponse({"error": "'new_headword' is required and must be a string."}, status=400)
            try:
                resolved = get_available_lexicon_headword(lexicon, new_headword, exclude_headword=entry.headword)
            except ValueError as e:
                return jsonResponse({"error": str(e)}, status=400)
            return jsonResponse({"dry_run": True, "headword": entry.headword, "new_headword": resolved})
        # the moderators' view checks is_staff itself (StaffRequiredMixin); dispatch keeps that check
        return LexiconEntryHeadwordView.as_view()(request, lexicon=lexicon, headword=headword)


class AdminVersionView(AdminMCPAPIView):
    """GET a version's metadata with its `version`; PATCH {"fields", "base_version", "dry_run"} edits it (§3.7)."""

    def get(self, request, title, lang, version_title):
        from sefaria.helper import versions_admin
        try:
            return jsonResponse(versions_admin.get_version(title, lang, version_title))
        except versions_admin.VersionNotFound as e:
            return jsonResponse({"error": str(e)}, status=404)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)

    def patch(self, request, title, lang, version_title):
        from sefaria.helper import versions_admin
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            return jsonResponse(versions_admin.update_version(title, lang, version_title, body.get("fields") or {}, body.get("base_version"),
                                                              request.user.id, dry_run=bool(body.get("dry_run", False))))
        except versions_admin.VersionNotFound as e:
            return jsonResponse({"error": str(e)}, status=404)
        except versions_admin.VersionConflict as e:
            return jsonResponse({"error": str(e), "current": e.current}, status=409)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class AdminVersionSearchView(AdminMCPAPIView):
    """GET ?versionTitle&language: the books that have a version of this title."""

    def get(self, request):
        from sefaria.helper.versions_admin import find_versions
        try:
            return jsonResponse(find_versions(request.GET.get("versionTitle"), request.GET.get("language")))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class AdminIndexDependenciesView(AdminMCPAPIView):
    """GET what depends on a book (commentaries, versions, links) before changing it."""

    def get(self, request, title):
        from sefaria.helper.versions_admin import index_dependencies
        if not _index_exists(title):
            return jsonResponse({"error": f"No book titled {title}"}, status=404)
        return jsonResponse(index_dependencies(title))


class AdminCachePurgeView(AdminMCPAPIView):
    """POST {"ref"}: refresh caches for a book or purge a ref from Varnish (the /admin/reset/<ref> tool)."""

    def post(self, request):
        from sefaria.helper.versions_admin import purge_cache
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            return jsonResponse(purge_cache(body.get("ref") or ""))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


def _index_exists(title):
    from sefaria.model import library
    from sefaria.system.exceptions import BookNameError
    try:
        return library.get_index(title) is not None
    except BookNameError:
        return False

