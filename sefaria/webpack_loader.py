from webpack_loader.loader import WebpackLoader
from django.conf import settings

class FullURLWebpackLoader(WebpackLoader):
    def get_chunk_url(self, chunk_file):
        url = super().get_chunk_url(chunk_file)
        return settings.FRONT_END_URL + url