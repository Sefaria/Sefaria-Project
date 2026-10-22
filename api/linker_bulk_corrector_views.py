from sefaria.helper import linker_bulk_corrector
from .linker_admin_views import LinkerAdminAPIView


class LinkerBulkCorrectorSearchView(LinkerAdminAPIView):

    def post(self, request):
        return self._handle(request, linker_bulk_corrector.search_citations)


class LinkerBulkCorrectorNavigateView(LinkerAdminAPIView):

    def post(self, request):
        return self._handle(request, linker_bulk_corrector.navigate_dataset)


class LinkerBulkCorrectorReparseCitationView(LinkerAdminAPIView):

    def post(self, request):
        return self._handle(
            request,
            lambda body: linker_bulk_corrector.reparse_citation(body, request.user.id),
        )


class LinkerBulkCorrectorReparseDatasetView(LinkerAdminAPIView):

    def post(self, request):
        return self._handle(
            request,
            lambda body: linker_bulk_corrector.enqueue_bulk_reparse_dataset(body, request.user.id),
            status=202,
        )
