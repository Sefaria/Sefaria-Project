from django.views import View

from sefaria.client.util import jsonResponse
from sefaria.helper import linker_bulk_corrector
from sefaria.system.exceptions import InputError
from .views import _load_json_body, StaffRequiredMixin


class LinkerBulkCorrectorAPIView(StaffRequiredMixin, View):

    def _handle(self, request, handler, status=200):
        body, err = _load_json_body(request, empty_as_object=True)
        if err:
            return err
        try:
            return jsonResponse(handler(body), status=status)
        except InputError as e:
            return jsonResponse({"error": str(e)}, status=400)


class LinkerBulkCorrectorSearchView(LinkerBulkCorrectorAPIView):

    def post(self, request):
        return self._handle(request, linker_bulk_corrector.search_citations)


class LinkerBulkCorrectorNavigateView(LinkerBulkCorrectorAPIView):

    def post(self, request):
        return self._handle(request, linker_bulk_corrector.navigate_dataset)


class LinkerBulkCorrectorReparseCitationView(LinkerBulkCorrectorAPIView):

    def post(self, request):
        return self._handle(request, linker_bulk_corrector.reparse_citation)


class LinkerBulkCorrectorReparseDatasetView(LinkerBulkCorrectorAPIView):

    def post(self, request):
        return self._handle(
            request,
            lambda body: linker_bulk_corrector.enqueue_bulk_reparse_dataset(body, request.user.id),
            status=202,
        )
