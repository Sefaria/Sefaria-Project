from django.urls import path

from . import views

urlpatterns = [
    # Google One Tap redirect mode: Google POSTs credential + g_csrf_token here
    path("api/auth/google/redirect", views.google_redirect),
    # Mobile Google Sign In: RN app POSTs a native ID token here, returns JWT
    path("api/auth/google/mobile", views.google_mobile),
    # Apple Sign In popup mode: ChooseView.jsx POSTs id_token + name here
    path("api/auth/apple/callback", views.apple_callback),
    # Mobile Apple Sign In: RN app POSTs a native ID token here, returns JWT
    path("api/auth/apple/mobile", views.apple_mobile),
    # JSON email login for the SSO auth page (existing /login form is untouched)
    path("api/auth/login", views.email_login),
    path("api/auth/password/reset", views.password_reset_api),
]
