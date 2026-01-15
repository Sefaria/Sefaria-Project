import sys, socket, argparse
from sefaria.celery_setup.app import app as celery_app
from kombu.exceptions import OperationalError


def check_broker(app, timeout=5):
    # Ensure we can connect to the broker quickly
    try:
        with app.connection() as conn:
            conn.ensure_connection(max_retries=1, interval_start=0, interval_step=0, interval_max=0)
        return True
    except OperationalError:
        return False
    except Exception:
        return False


def check_worker_ping(app, timeout=5):
    # Ask workers to reply 'pong'
    try:
        i = app.control.inspect(timeout=timeout)
        res = i.ping()
        if not res:
            return False
        # If you want to ensure *this* pod is registered:
        this_host = socket.gethostname()
        # Celery default name is "celery@<hostname>" unless overridden with -n
        return any(this_host in k for k in res.keys())
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["liveness","readiness"], required=True)
    ap.add_argument("--timeout", type=int, default=5)
    args = ap.parse_args()

    if args.mode == "liveness":
        ok = check_broker(celery_app, args.timeout)
    else:  # readiness
        ok = check_broker(celery_app, args.timeout) and check_worker_ping(celery_app, args.timeout)

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
