from django.views import View

from sefaria.client.util import jsonResponse
from sefaria.helper import release, release_qa
from sefaria.system.exceptions import InputError

from .views import StaffRequiredMixin, _load_json_body


class ReleaseAPIView(StaffRequiredMixin, View):
    """Inspecting and releasing unreleased (`unreleased`) records. Every POST accepts `dry_run: true`."""

    def _handle(self, request, handler):
        body, err = _load_json_body(request, empty_as_object=True)
        if err:
            return err
        try:
            return jsonResponse(handler(request.user.id, body))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class ReleaseStatusView(StaffRequiredMixin, View):
    def get(self, request):
        title = request.GET.get("index")
        if not title:
            return jsonResponse({"error": "Missing required parameter: index."}, status=400)
        try:
            return jsonResponse(release.status(title))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class ReleaseCategoryView(ReleaseAPIView):
    def post(self, request):
        return self._handle(request, release.release_category)


class ReleaseIndexView(ReleaseAPIView):
    def post(self, request):
        return self._handle(request, release.release_index)


class ReleaseVersionView(ReleaseAPIView):
    def post(self, request):
        return self._handle(request, release.release_version)


class ReleaseLinksView(ReleaseAPIView):
    def post(self, request):
        return self._handle(request, release.release_links)


# TEMPORARY (PR #3838 QA): copy existing records as unreleased. Remove before merging, with sefaria/helper/release_qa.py.


class ReleaseQACopyCategoryView(ReleaseAPIView):
    def post(self, request):
        return self._handle(request, release_qa.copy_category)


class ReleaseQACopyIndexView(ReleaseAPIView):
    def post(self, request):
        return self._handle(request, release_qa.start_copy_index)


class ReleaseQACopyVersionView(ReleaseAPIView):
    def post(self, request):
        return self._handle(request, release_qa.copy_version)
