from contextvars import ContextVar

_progress_reporter: ContextVar = ContextVar('_progress_reporter', default=None)


def set_progress_reporter(fn):
    """Register fn(step: str) as the progress reporter for the current context. Returns a token for reset."""
    return _progress_reporter.set(fn)


def reset_progress_reporter(token):
    """Reset the reporter to its previous value using the token from set_progress_reporter."""
    _progress_reporter.reset(token)


def report_progress(step: str):
    """Call the registered progress reporter with step, if one is set. No-op otherwise."""
    fn = _progress_reporter.get()
    if fn:
        fn(step)
