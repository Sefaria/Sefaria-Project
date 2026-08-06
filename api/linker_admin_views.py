from django.views import View

from sefaria.client.util import jsonResponse
from sefaria.system.exceptions import InputError
from sefaria.helper import linker_editor
from sefaria.helper import linker_admin
from .views import _load_json_body


class StaffRequiredMixin:
    """Mixin for CBVs that must reject non-staff users with a JSON 403."""

    def dispatch(self, request, *args, **kwargs):
        if not request.user.is_staff:
            return jsonResponse({"error": "Staff only."}, status=403)
        return super().dispatch(request, *args, **kwargs)


class LinkerAdminAPIView(StaffRequiredMixin, View):

    def _handle(self, request, handler, status=200):
        body, err = _load_json_body(request, empty_as_object=True)
        if err:
            return err
        try:
            return jsonResponse(handler(body), status=status)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class LinkerAdminDeleteCitationView(LinkerAdminAPIView):

    def post(self, request):
        return self._handle(
            request,
            lambda body: linker_admin.set_linker_citation_deleted(body, request.user.id, True)
        )


class LinkerAdminRecreateCitationView(LinkerAdminAPIView):

    def post(self, request):
        return self._handle(
            request,
            lambda body: linker_admin.set_linker_citation_deleted(body, request.user.id, False)
        )


class LinkerAdminParseCitationView(LinkerAdminAPIView):

    def post(self, request):
        return self._handle(request, linker_admin.parse_linker_citation)


class LinkerAdminRerunSegmentView(LinkerAdminAPIView):

    def post(self, request):
        return self._handle(
            request,
            lambda body: linker_admin.rerun_linker_for_segment(body, request.user.id),
            status=202,
        )


class LinkerAdminAddRefDatasetView(LinkerAdminAPIView):

    def post(self, request):
        return self._handle(
            request,
            lambda body: linker_admin.add_ref_dataset_example(body, request.user.id),
            status=201,
        )


class LinkerAdminAddRefPartDatasetView(LinkerAdminAPIView):

    def post(self, request):
        return self._handle(
            request,
            lambda body: linker_admin.add_ref_part_dataset_example(body, request.user.id),
            status=201,
        )


class LinkerEditorMatchTemplateView(StaffRequiredMixin, View):
    """Create, replace, or remove a MatchTemplate on a schema node."""

    def post(self, request, title, node_key_path):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            serialized = linker_editor.add_match_template(
                title, node_key_path, body.get("term_slugs", []), body.get("scope", "combined"), request.user.id)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
        return jsonResponse({"status": "ok", "match_template": serialized})

    def put(self, request, title, node_key_path):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            serialized = linker_editor.replace_match_template(
                title,
                node_key_path,
                body.get("old", {}),
                body.get("new", {}),
                request.user.id,
            )
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
        return jsonResponse({"status": "ok", "match_template": serialized})

    def delete(self, request, title, node_key_path):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            linker_editor.remove_match_template(title, node_key_path, body, request.user.id)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
        return jsonResponse({"status": "ok"})


class LinkerEditorAddressTypeView(StaffRequiredMixin, View):
    """Overwrite a schema node's addressTypes (PUT)."""

    def put(self, request, title, node_key_path):
        body, err = _load_json_body(request)
        if err:
            return err
        address_types = body.get("address_types")
        if not isinstance(address_types, list):
            return jsonResponse({"error": "'address_types' must be a list."}, status=400)
        try:
            result = linker_editor.set_address_types(title, node_key_path, address_types, request.user.id)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
        return jsonResponse({"status": "ok", "address_types": result})


class LinkerEditorNodePropertiesView(StaffRequiredMixin, View):
    """Update linker-relevant node properties (referenceable, numeric_equivalent, ...) (PUT)."""

    def put(self, request, title, node_key_path):
        body, err = _load_json_body(request)
        if err:
            return err
        properties = body.get("properties")
        if not isinstance(properties, dict):
            return jsonResponse({"error": "'properties' must be an object."}, status=400)
        try:
            result = linker_editor.set_node_properties(title, node_key_path, properties, request.user.id)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
        return jsonResponse({"status": "ok", "properties": result})


class LinkerEditorAddressTypesListView(StaffRequiredMixin, View):
    """List all valid addressType names for the editor dropdown (GET)."""

    def get(self, request):
        return jsonResponse({"address_types": linker_editor.all_address_type_names()})


class LinkerEditorRebuildDiburHamatchilView(StaffRequiredMixin, View):
    """Enqueue an async rebuild of one index's dibur_hamatchils (POST). Poll via /api/async/<task_id>."""

    def post(self, request, title):
        try:
            task_id = linker_editor.enqueue_rebuild_dibur_hamatchils(title, request.user.id)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
        return jsonResponse({"task_id": task_id}, status=202)


class LinkerEditorNonUniqueTermView(StaffRequiredMixin, View):
    """Term titles + cross-usages for a single NonUniqueTerm (GET); add alternate titles (POST); delete unused term (DELETE)."""

    def get(self, request, slug):
        try:
            return jsonResponse(linker_editor.get_non_unique_term_detail(slug))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=404)

    def post(self, request, slug):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            return jsonResponse(linker_editor.add_non_unique_term_titles(slug, body.get("titles", []), request.user.id))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)

    def delete(self, request, slug):
        try:
            linker_editor.delete_non_unique_term(slug, request.user.id)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)
        return jsonResponse({"status": "ok"})


class LinkerEditorNonUniqueTermSwapView(StaffRequiredMixin, View):
    """Swap every MatchTemplate usage of one NonUniqueTerm slug to another slug (POST)."""

    def post(self, request, slug):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            return jsonResponse(linker_editor.swap_non_unique_term_usages(slug, body.get("new_slug"), request.user.id))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class LinkerEditorNonUniqueTermCreateView(StaffRequiredMixin, View):
    """Create a new NonUniqueTerm from a list of titles (POST)."""

    def post(self, request):
        body, err = _load_json_body(request)
        if err:
            return err
        try:
            return jsonResponse(linker_editor.create_non_unique_term(body.get("titles", []), request.user.id))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class LinkerEditorNonUniqueTermTitlesView(StaffRequiredMixin, View):
    """Bulk map of slug -> primary en/he titles for MatchTemplate badges (GET ?slugs=a,b,c)."""

    def get(self, request):
        raw = request.GET.get("slugs", "")
        slugs = [s for s in raw.split(",") if s]
        return jsonResponse({"titles": linker_editor.get_non_unique_term_titles(slugs)})


class LinkerEditorNonUniqueTermSearchView(StaffRequiredMixin, View):
    """Autocomplete search over NonUniqueTerms (GET ?q=...)."""

    def get(self, request):
        q = request.GET.get("q", "")
        try:
            limit = int(request.GET.get("limit", 20))
        except (TypeError, ValueError):
            limit = 20
        return jsonResponse({"terms": linker_editor.search_non_unique_terms(q, limit)})
