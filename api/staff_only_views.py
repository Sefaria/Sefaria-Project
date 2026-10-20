from django.views import View

from sefaria.client.util import jsonResponse
from sefaria.system.exceptions import InputError
from sefaria.helper import staff_only
from sefaria.helper import staff_only_qa
from .views import _load_json_body, StaffRequiredMixin


class StaffOnlyAPIView(StaffRequiredMixin, View):
    """Publishing staff-only (`admin_only`) records. Every POST accepts `dry_run: true`."""

    def _handle(self, request, handler):
        body, err = _load_json_body(request, empty_as_object=True)
        if err:
            return err
        try:
            return jsonResponse(handler(request.user.id, body))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class StaffOnlyStatusView(StaffRequiredMixin, View):

    def get(self, request):
        title = request.GET.get("index")
        if not title:
            return jsonResponse({"error": "Missing required parameter: index."}, status=400)
        try:
            return jsonResponse(staff_only.status(title))
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class StaffOnlyPublishCategoryView(StaffOnlyAPIView):

    def post(self, request):
        return self._handle(request, staff_only.publish_category)


class StaffOnlyPublishIndexView(StaffOnlyAPIView):

    def post(self, request):
        return self._handle(request, staff_only.publish_index)


class StaffOnlyPublishVersionView(StaffOnlyAPIView):

    def post(self, request):
        return self._handle(request, staff_only.publish_version)


class StaffOnlyPublishLinksView(StaffOnlyAPIView):

    def post(self, request):
        return self._handle(request, staff_only.publish_links)


# TEMPORARY (PR #3838 QA): copy existing records as staff-only. Remove before merging, with sefaria/helper/staff_only_qa.py.

class StaffOnlyQACopyCategoryView(StaffOnlyAPIView):

    def post(self, request):
        return self._handle(request, staff_only_qa.copy_category)


class StaffOnlyQACopyIndexView(StaffOnlyAPIView):

    def post(self, request):
        return self._handle(request, staff_only_qa.copy_index)


class StaffOnlyQACopyVersionView(StaffOnlyAPIView):

    def post(self, request):
        return self._handle(request, staff_only_qa.copy_version)
