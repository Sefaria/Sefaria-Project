import sys
import tempfile
import hotshot
import hotshot.stats
from cStringIO import StringIO

from django.conf import settings
from django.utils import translation

from sefaria.settings import *
from sefaria.model.user_profile import UserProfile
from sefaria.utils.util import short_to_long_lang_code


class LanguageSettingsMiddleware(object):
    """
    Determines Interface and Content Language settings for each request.
    """
    def process_request(self, request):
        excluded = ('/data.js', '/linker.js')
        if request.path.startswith("/api/") or request.path in excluded:
            return # Save potentially looking up a UserProfile when not needed

        # INTERFACE
        interface = None
        domain = request.get_host()
        try:
            if domain in DOMAIN_LANGUAGES:
                interface = DOMAIN_LANGUAGES[domain]
        except:
            pass
        if request.user.is_authenticated() and not interface:
            profile = UserProfile(id=request.user.id)
            interface = profile.settings["interface_language"] if "interface_language" in profile.settings else interface 
        if not interface: 
            # Pull language setting from cookie, location (set by Cloudflare) or Accept-Lanugage header or default to english
            interface = request.COOKIES.get('interfaceLang') or request.META.get("HTTP_CF_IPCOUNTRY") or request.LANGUAGE_CODE or 'english'
            interface = 'hebrew' if interface in ('IL', 'he', 'he-il') else interface
            # Don't allow languages other than what we currently handle
            interface = 'english' if interface not in ('english', 'hebrew') else interface

        # CONTENT
        default_content_lang = 'hebrew' if interface == 'hebrew' else 'bilingual'
        # Pull language setting from cookie or Accept-Lanugage header or default to english
        content = request.COOKIES.get('contentLang') or default_content_lang
        content = short_to_long_lang_code(content)
        # Don't allow languages other than what we currently handle
        content = default_content_lang if content not in ('english', 'hebrew', 'bilingual') else content
        # Note: URL parameters may override values set her, handled in reader view.

        request.LANGUAGE_CODE = interface[0:2]
        request.interfaceLang = interface
        request.contentLang   = content

        translation.activate(request.LANGUAGE_CODE)

 
class ProfileMiddleware(object):
    """
    Displays hotshot profiling for any view.
    http://yoursite.com/yourview/?prof

    Add the "prof" key to query string by appending ?prof (or &prof=)
    and you'll see the profiling results in your browser.
    It's set up to only be available in django's debug mode,
    but you really shouldn't add this middleware to any production configuration.
    * Only tested on Linux
    """
    def process_request(self, request):
        if settings.DEBUG and request.GET.has_key('prof'):
            self.tmpfile = tempfile.NamedTemporaryFile()
            self.prof = hotshot.Profile(self.tmpfile.name)

    def process_view(self, request, callback, callback_args, callback_kwargs):
        if settings.DEBUG and request.GET.has_key('prof'):
            return self.prof.runcall(callback, request, *callback_args, **callback_kwargs)

    def process_response(self, request, response):
        if settings.DEBUG and request.GET.has_key('prof'):
            self.prof.close()

            out = StringIO()
            old_stdout = sys.stdout
            sys.stdout = out

            stats = hotshot.stats.load(self.tmpfile.name)
            stats.strip_dirs().sort_stats("cumulative")
            stats.print_stats()

            sys.stdout = old_stdout
            stats_str = out.getvalue()

            if response and response.content and stats_str:
                response.content = "<pre>" + stats_str + "</pre>"

        return response