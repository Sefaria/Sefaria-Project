from django.urls import re_path

from webhooks import views

# Included at api/webhooks/ by sefaria/urls_shared.py. The optional trailing slash matches the
# codebase's other API routes, so a sender configured either way works.
urlpatterns = [
    re_path(r"^classy/?$", views.receive_classy_webhook),
    re_path(r"^salesforce/?$", views.receive_salesforce_webhook),
]
