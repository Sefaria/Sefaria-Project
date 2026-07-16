from django.urls import path

from . import views

urlpatterns = [
    # Google One Tap redirect mode: Google POSTs credential + g_csrf_token here
    path("api/auth/google/redirect", views.google_redirect),
    # Apple Sign In popup mode: ChooseView.jsx POSTs id_token + name here
    path("api/auth/apple/callback", views.apple_callback),
    # JSON email login for the SSO auth page (existing /login form is untouched)
    path("api/auth/login", views.email_login),
]
