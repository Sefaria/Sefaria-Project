from django.contrib.admin.views.decorators import staff_member_required
from functools import wraps

def passcode_or_staff_required(passcode):
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            query_code = request.GET.get('passcode')
            if query_code == passcode:
                return view_func(request, *args, **kwargs)
            return staff_member_required(view_func)(request, *args, **kwargs)
        return _wrapped_view
    return decorator
