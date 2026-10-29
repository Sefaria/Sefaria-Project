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
    edits its content through the moderators' lexicon editor (api/lexicon_admin_views.LexiconEntryView, #3730),
    which validates, saves, logs history and refreshes the cached ref. The version check makes the edit
    read-before-write: an entry changed since it was read answers 409 with the current entry.
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
        from .lexicon_admin_views import AmbiguousLexiconEntry, LexiconEntryView, _load_lexicon_entry
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
        current = entry.contents()
        if _entry_version(current) != body["base_version"]:
            return jsonResponse({"error": "This entry was changed since you read it.", "current": {"entry": current, "version": _entry_version(current)}}, status=409)
        unknown = set(body["content"]) - set(entry.content_attr_names())
        if unknown:
            return jsonResponse({"error": f"Unknown content fields: {sorted(unknown)}. Editable: {sorted(entry.content_attr_names())}"}, status=400)
        if body.get("dry_run"):
            preview = {**current, **body["content"]}
            return jsonResponse({"dry_run": True, "before": current, "after": preview})
        response = LexiconEntryView().patch(request, lexicon, headword)
        if response.status_code == 200:
            saved = _load_lexicon_entry(lexicon, headword)
            if saved:
                return jsonResponse({"status": "ok", "entry": saved.contents(), "version": _entry_version(saved.contents()), "via": _via(request)})
        return response


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

