from gunicorn.glogging import Logger

from sefaria.system.logging import scrub_api_key_query


class ScrubbingLogger(Logger):
    """Gunicorn logger that redacts API key query parameters from every access-log atom that can carry the
    query string or the referer, so the access log format can stay the stock one."""

    def atoms(self, resp, req, environ, request_time):
        atoms = super().atoms(resp, req, environ, request_time)
        if "RAW_URI" in environ:
            atoms["r"] = "%s %s %s" % (environ["REQUEST_METHOD"], scrub_api_key_query(environ["RAW_URI"]),
                                       environ["SERVER_PROTOCOL"])
        for key in ("f", "{referer}i", "{raw_uri}e", "{http_referer}e"):  # full URLs
            if isinstance(atoms.get(key), str):
                atoms[key] = scrub_api_key_query(atoms[key])
        for key in ("q", "{query_string}e"):  # bare query strings, no leading "?"
            if isinstance(atoms.get(key), str):
                atoms[key] = scrub_api_key_query("?" + atoms[key])[1:]
        return atoms
