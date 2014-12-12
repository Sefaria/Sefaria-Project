from urlparse import urlparse

from django.utils.translation import ugettext as _
from django.conf import settings
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import render_to_response
from django.template import RequestContext
from django.template.response import TemplateResponse
from django.utils.http import is_safe_url
from django.contrib.auth import authenticate
from django.contrib.auth import REDIRECT_FIELD_NAME, login as auth_login, logout as auth_logout
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.sites.models import get_current_site
from django.contrib.admin.views.decorators import staff_member_required
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect

import sefaria.model as model
from sefaria.client.util import jsonResponse, subscribe_to_announce
from helper.link import add_commentary_links
from sefaria.summaries import update_summaries, save_toc_to_db
from sefaria.counts import update_counts
from sefaria.forms import NewUserForm
from sefaria.settings import MAINTENANCE_MESSAGE
from sefaria.model.user_profile import UserProfile
import sefaria.system.cache as scache

# noinspection PyUnresolvedReferences
from sefaria.utils.users import user_links


def register(request):
    if request.user.is_authenticated():
        return HttpResponseRedirect("/login")

    next = request.REQUEST.get('next', '')

    if request.method == 'POST':
        form = NewUserForm(request.POST)
        if form.is_valid():
            new_user = form.save()
            user = authenticate(email=form.cleaned_data['email'],
                                password=form.cleaned_data['password1'])
            auth_login(request, user)
            UserProfile(id=user.id).assign_slug().save()
            if "noredirect" in request.POST:
                return HttpResponse("ok")
            else:
                next = request.POST.get("next", "/") + "?welcome=to-sefaria"
                return HttpResponseRedirect(next)
    else:
        form = NewUserForm()

    return render_to_response("registration/register.html", 
                                {'form' : form, 'next': next}, 
                                RequestContext(request))


@sensitive_post_parameters()
@csrf_protect
@never_cache
def login(request, template_name='registration/login.html',
          redirect_field_name=REDIRECT_FIELD_NAME,
          authentication_form=AuthenticationForm,
          current_app=None, extra_context=None):
    """
    Displays the login form and handles the login action.
    """
    redirect_to = request.REQUEST.get(redirect_field_name, '')

    if request.method == "POST":
        form = authentication_form(data=request.POST)
        if form.is_valid():
            # Ensure the user-originating redirection url is safe.
            if not is_safe_url(url=redirect_to, host=request.get_host()):
                redirect_to = settings.LOGIN_REDIRECT_URL

            # Okay, security check complete. Log the user in.
            auth_login(request, form.get_user())

            if request.session.test_cookie_worked():
                request.session.delete_test_cookie()

            return HttpResponseRedirect(redirect_to)
    else:
        form = authentication_form(request)

    request.session.set_test_cookie()

    current_site = get_current_site(request)

    context = {
        'form': form,
        redirect_field_name: redirect_to,
        'site': current_site,
        'site_name': current_site.name,
    }
    if extra_context is not None:
        context.update(extra_context)
    return TemplateResponse(request, template_name, context,
                            current_app=current_app)


def logout(request, next_page=None,
           template_name='registration/logged_out.html',
           redirect_field_name='next',
           current_app=None, extra_context=None):
    """
    Logs out the user and displays 'You are logged out' message.
    """
    auth_logout(request)
    redirect_to = request.REQUEST.get(redirect_field_name, '')
    if redirect_to:
        netloc = urlparse(redirect_to)[1]
        # Security check -- don't allow redirection to a different host.
        if not (netloc and netloc != request.get_host()):
            return HttpResponseRedirect(redirect_to)

    if next_page is None:
        current_site = get_current_site(request)
        context = {
            'site': current_site,
            'site_name': current_site.name,
            'title': _('Logged out')
        }
        if extra_context is not None:
            context.update(extra_context)
        return TemplateResponse(request, template_name, context,
                                current_app=current_app)
    else:
        # Redirect to this page until the session has been cleared.
        return HttpResponseRedirect(next_page or request.path)


def maintenance_message(request):
    return render_to_response("static/maintenance.html",
                                {"message": MAINTENANCE_MESSAGE},
                                RequestContext(request))


def accounts(request):
    return render_to_response("registration/accounts.html", 
                                {"createForm": UserCreationForm(),
                                "loginForm": AuthenticationForm() }, 
                                RequestContext(request))


def subscribe(request, email):
    if subscribe_to_announce(email):
        return jsonResponse({"status": "ok"})
    else:
        return jsonResponse({"error": "Something went wrong."})


@staff_member_required
def reset_cache(request):
    scache.reset_texts_cache()
    global user_links
    user_links = {}
    return HttpResponseRedirect("/?m=Cache-Reset")

"""@staff_member_required
def view_cached_elem(request, title):
    return HttpResponse(get_template_cache('texts_list'), status=200)

@staff_member_required
def del_cached_elem(request, title):
    delete_template_cache('texts_list')
    toc_html = get_template_cache('texts_list')
    return HttpResponse(toc_html, status=200)"""


@staff_member_required
def reset_counts(request):
    update_counts()
    return HttpResponseRedirect("/?m=Counts-Rebuilt")


@staff_member_required
def rebuild_toc(request):
    update_summaries()
    return HttpResponseRedirect("/?m=TOC-Rebuilt")


@staff_member_required
def rebuild_counts_and_toc(request):
    update_counts()
    update_summaries()
    return HttpResponseRedirect("/?m=Counts-&-TOC-Rebuilt")

@staff_member_required
def save_toc(request):
    save_toc_to_db()
    return HttpResponseRedirect("/?m=TOC-Saved")


@staff_member_required
def rebuild_commentary_links(request, title):
    texts = model.library.get_commentary_version_titles(title)
    for i,t in enumerate(texts,1):
       add_commentary_links(t, request.user.id)
    return HttpResponseRedirect("/?m=Links-%s-Rebuilt" % title)

@staff_member_required
def cache_stats(request):
    resp = {
        'ref_cache_size': model.Ref.cache_size()
    }
    return jsonResponse(resp)

@staff_member_required
def cache_dump(request):
    resp = {
        'ref_cache_dump': model.Ref.cache_dump()
    }
    return jsonResponse(resp)
