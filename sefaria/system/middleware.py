import sys 
import tempfile
import cProfile
import pstats
from io import StringIO

from django.conf import settings
from django.utils import translation
from django.shortcuts import redirect
from django.http import HttpResponse
from django.urls import resolve

from sefaria.settings import *
from sefaria.site.site_settings import SITE_SETTINGS
from sefaria.model.user_profile import UserProfile
from sefaria.utils.util import short_to_long_lang_code, get_lang_codes_for_territory
from sefaria.system.cache import get_shared_cache_elem, set_shared_cache_elem
from django.utils.deprecation import MiddlewareMixin
from urllib.parse import quote
import structlog
import json
logger = structlog.get_logger(__name__)



class MiddlewareURLMixin:
    excluded_url_names = set()  # Set of URL names to exclude
    excluded_url_prefixes = set()  # Set of URL path prefixes to exclude

    def should_process_request(self, request):
        # Check URL name
        try:
            url_name = resolve(request.path_info).url_name
            if url_name in self.excluded_url_names:
                return False
        except:
            pass

        # Check path prefixes
        if any(request.path.startswith(prefix) for prefix in self.excluded_url_prefixes):
            return False

        return True


class SharedCacheMiddleware(MiddlewareMixin):
    def process_request(self, request):
        last_cached = get_shared_cache_elem("last_cached")
        if not last_cached:
            regen_in_progress = get_shared_cache_elem("regenerating")
            if not regen_in_progress:
                set_shared_cache_elem("regenerating", True)
                request.init_shared_cache = True


class LocationSettingsMiddleware(MiddlewareMixin):
    """
        Determines if the user should see diaspora content or Israeli.
    """
    def process_request(self, request):
        loc = request.META.get("HTTP_CF_IPCOUNTRY", None)
        if not loc:
            try:
                from sefaria.settings import PINNED_IPCOUNTRY
                loc = PINNED_IPCOUNTRY
            except:
                loc = "us"
        request.diaspora = False if loc in ("il", "IL", "Il") else True


class LanguageSettingsMiddleware(MiddlewareMixin):
    """
    Determines Interface and Content Language settings for each request.
    """
    def process_request(self, request):
        excluded = ('/linker.js', '/linker.v2.js', '/linker.v3.js', "/api/", "/interface/", "/apple-app-site-association", STATIC_URL)
        if any([request.path.startswith(start) for start in excluded]):
            request.interfaceLang = "english"
            request.contentLang = "bilingual"
            request.translation_language_preference = None
            request.version_preferences_by_corpus = {}
            request.translation_language_preference_suggestion = None
            return # Save looking up a UserProfile, or redirecting when not needed

        profile = UserProfile(id=request.user.id) if request.user.is_authenticated else None
        # INTERFACE 
        # Our logic for setting interface lang checks (1) User profile, (2) cookie, (3) geolocation, (4) HTTP language code
        interface = None
        if request.user.is_authenticated and not interface:
            interface = profile.settings["interface_language"] if "interface_language" in profile.settings else interface 
        if not interface: 
            # Pull language setting from cookie, location (set by Cloudflare) or Accept-Lanugage header or default to english
            interface = request.COOKIES.get('interfaceLang') or request.META.get("HTTP_CF_IPCOUNTRY") or request.LANGUAGE_CODE or 'english'
            interface = 'hebrew' if interface in ('IL', 'he', 'he-il') else interface
            # Don't allow languages other than what we currently handle
            interface = 'english' if interface not in ('english', 'hebrew') else interface

        # Check if the current domain is pinned to  particular language in settings
        domain_lang = current_domain_lang(request)

        if domain_lang and domain_lang != interface:
            # For crawlers, don't redirect -- just return the pinned language
            no_direct = ("Googlebot", "Bingbot", "Slurp", "DuckDuckBot", "Baiduspider", 
                            "YandexBot", "Facebot", "facebookexternalhit", "ia_archiver", "Sogou",
                            "python-request", "curl", "Wget", "sefaria-node")
            if any([bot in request.META.get('HTTP_USER_AGENT', '') for bot in no_direct]):
                interface = domain_lang
            else:
                redirect_domain = None
                for domain in DOMAIN_LANGUAGES:
                    if DOMAIN_LANGUAGES[domain] == interface:
                        redirect_domain = domain
                if redirect_domain:
                    # When detected language doesn't match current domain langauge, redirect
                    path = request.get_full_path()
                    path = path + ("&" if "?" in path else "?") + "set-language-cookie"
                    return redirect(redirect_domain + path)
                    # If no pinned domain exists for the language the user wants,
                    # the user will stay on this domain with the detected language

        # CONTENT
        default_content_lang = 'hebrew' if interface == 'hebrew' else 'bilingual'
        # Pull language setting from cookie or Accept-Lanugage header or default to english
        content = request.GET.get('lang') or request.COOKIES.get('contentLang') or default_content_lang
        content = short_to_long_lang_code(content)
        # Don't allow languages other than what we currently handle
        content = default_content_lang if content not in ('english', 'hebrew', 'bilingual') else content
        # Note: URL parameters may override values set here, handled in reader view.

        if not SITE_SETTINGS["TORAH_SPECIFIC"]:
            content = "english"
            interface = "english"

        # TRANSLATION LANGUAGE PREFERENCE
        translation_language_preference = (profile is not None and profile.settings.get("translation_language_preference", None)) or request.COOKIES.get("translation_language_preference", None)
        langs_in_country = get_lang_codes_for_territory(request.META.get("HTTP_CF_IPCOUNTRY", None))
        translation_language_preference_suggestion = None
        trans_lang_pref_suggested = (profile is not None and profile.settings.get("translation_language_preference_suggested", False)) or request.COOKIES.get("translation_language_preference_suggested", False)
        if translation_language_preference is None and not trans_lang_pref_suggested:
            supported_translation_langs = set(SITE_SETTINGS['SUPPORTED_TRANSLATION_LANGUAGES'])
            for lang in langs_in_country:
                if lang in supported_translation_langs:
                    translation_language_preference_suggestion = lang
                    break             
        if translation_language_preference_suggestion == "en":
            # dont ever suggest English to our users
            translation_language_preference_suggestion = None

        # VERSION PREFERENCE
        from urllib.parse import unquote
        version_preferences_by_corpus_cookie = json.loads(unquote(request.COOKIES.get("version_preferences_by_corpus", "null")))
        request.version_preferences_by_corpus = (profile is not None and getattr(profile, "version_preferences_by_corpus", None)) or version_preferences_by_corpus_cookie or {}
        request.LANGUAGE_CODE = interface[0:2]
        request.interfaceLang = interface
        request.contentLang   = content
        request.translation_language_preference = translation_language_preference
        request.translation_language_preference_suggestion = translation_language_preference_suggestion

        translation.activate(request.LANGUAGE_CODE)


class LanguageCookieMiddleware(MiddlewareMixin):
    """
    If `set-language-cookie` param is set, set a cookie the interfaceLange of current domain, 
    then redirect to a URL without the param (so the urls with the param don't get loose in wild).
    Allows one domain to set a cookie on another. 
    """
    def process_request(self, request):
        lang = current_domain_lang(request)
        if "set-language-cookie" in request.GET and lang:
            domain = [d for d in DOMAIN_LANGUAGES if DOMAIN_LANGUAGES[d] == lang][0]
            path = quote(request.path, safe='/')
            params = request.GET.copy()
            params.pop("set-language-cookie")
            params_string = params.urlencode()
            params_string = "?" + params_string if params_string else ""
            response = redirect(domain + path + params_string)
            response.set_cookie("interfaceLang", lang)
            if request.user.is_authenticated:
                p = UserProfile(id=request.user.id)
                p.settings["interface_language"] = lang
                p.save()
            return response


def current_domain_lang(request):
    """
    Returns the pinned language for the current domain, or None if current domain is not pinned.
    """
    current_domain = request.get_host()
    domain_lang = None
    for protocol in ("https://", "http://"):
        full_domain = protocol + current_domain
        if full_domain in DOMAIN_LANGUAGES:
            domain_lang = DOMAIN_LANGUAGES[full_domain]
    return domain_lang


class CORSDebugMiddleware(MiddlewareMixin):
    def process_response(self, request, response):
        """
        CORS headers are normally added in nginx response.
        However, nginx isn't normally running when debugging with localhost
        """
        origin = request.get_host()
        if ('localhost' in origin or '127.0.0.1' in origin) and DEBUG:
            response["Access-Control-Allow-Origin"] = "*"
            response["Access-Control-Allow-Methods"] = "POST, GET"
            response["Access-Control-Allow-Headers"] = "*"
        return response


class ProfileMiddleware(MiddlewareMixin):
    """
    Displays profiling for any view.
    http://yoursite.com/yourview/?prof

    Add the "prof" key to query string by appending ?prof (or &prof=)
    and you'll see the profiling results in your browser.
    It's set up to only be available in django's debug mode,
    but you really shouldn't add this middleware to any production configuration.
    * Only tested on Linux
    """
    def process_request(self, request):
        if settings.DEBUG and 'prof' in request.GET:
            self.prof = cProfile.Profile()

    def process_view(self, request, callback, callback_args, callback_kwargs):
        if settings.DEBUG and 'prof' in request.GET:
            return self.prof.runcall(callback, request, *callback_args, **callback_kwargs)

    def process_response(self, request, response):
        if settings.DEBUG and 'prof' in request.GET:
            self.prof.create_stats()

            io = StringIO()
            stats = pstats.Stats(self.prof, stream=io)

            stats.strip_dirs().sort_stats(request.GET.get('sort', "cumulative"))
            stats.print_stats()

            response = HttpResponse('<pre>%s</pre>' % io.getvalue())
        return response


class ModuleMiddleware(MiddlewareURLMixin):
    excluded_url_prefixes = {
        '/linker.js',
        '/interface/',
        '/apple-app-site-association',
        '/static/',
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def _get_module_from_host(self, request):
        """
        Determine the active module based on the request host using DOMAIN_MODULES.
        Returns the module name if found, None otherwise.
        """
        try:
            from urllib.parse import urlparse
            
            current_host = request.get_host()
            parsed_current = urlparse(f"http://{current_host}")
            current_hostname = parsed_current.hostname
            
            for lang, module in DOMAIN_MODULES.items():
                for module_name, module_domain in module.items():
                    parsed_domain = urlparse(module_domain)
                    domain_to_check = parsed_domain.hostname

                    if current_hostname == domain_to_check:
                        return module_name            
            return None
            
        except Exception as e:
            logger.error(f"Error determining module from host: {e}")
            return None

    def _set_active_module(self, request):
        """
        Determine and set the active module for the request.
        First checks host-based module, then falls back to route-based detection.
        """
        # First, try to determine module based on host/subdomain from DOMAIN_MODULES
        host_based_module = self._get_module_from_host(request)
        if host_based_module:
            active_module = host_based_module
        else:
            # Check each module route to see if path matches
            for module_name, route_prefix in MODULE_ROUTES.items():
                if request.path.startswith(route_prefix):
                    active_module = module_name
                    break
        
        return active_module

    def __call__(self, request):
        if not self.should_process_request(request):
            request.active_module = 'library'
            return self.get_response(request)

        request.active_module = self._set_active_module(request)
        return self.get_response(request)

    #TODO: Maybe during Django upgrade, investigate why this doesnt get called and try to recall why we arent using
    # a TemplateResponse in our reader.views.render
    def process_template_response(self, request, response):
        # For template responses, add active_module to context
        if hasattr(response, 'context_data'):
            response.context_data['active_module'] = request.active_module
        return response
