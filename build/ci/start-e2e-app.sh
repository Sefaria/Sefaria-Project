#!/usr/bin/env bash
# Run Sefaria on a GitHub-hosted runner for the Playwright e2e job, with no cluster and no sandbox.
#
# The same idea as build/ci/restore-test-mongo.sh for pytest: everything the tests need runs on the
# runner, so each run gets its own fresh database and nothing waits on a cauldron deploy.
#
#   https://www.sefaria.test     Library    \  nginx (TLS + /static) -> gunicorn on 127.0.0.1:8000
#   https://voices.sefaria.test  Voices     /  hosts mapped to 127.0.0.1 in /etc/hosts
#
# Why HTTPS: production is HTTPS, the session cookie is Secure, and the e2e setup writes Secure
# cookies, which a browser never sends over plain http to a non-localhost host. The certificate is
# self-signed, generated per run, and trusted by Chromium through the user's NSS database.
# Why three-label hosts: the tests derive the shared cookie domain (.sefaria.test) from a host like
# www.sefaria.test, exactly as they do for www.sefaria.org, so login carries over to Voices.
#
# Also starts Redis (the generation cache) and nginx in Docker.
# Expects: MongoDB already restored on 127.0.0.1:27017 (build/ci/restore-test-mongo.sh), Python
# requirements installed, `npm ci` done. Builds the production webpack bundles itself.
#
# Creates the Playwright accounts from PLAYWRIGHT_USER_EMAIL/PASSWORD and
# PLAYWRIGHT_SUPERUSER_EMAIL/PASSWORD. Any values work: the database is throwaway.
#
# As in production: gunicorn with the library cache built before the workers fork, Redis caches,
# and the node server rendering pages (server-side rendering), with nginx serving /static.
#
# Differences from production, on purpose:
#   - no Elasticsearch: search results are empty (autocomplete works; it is built in memory)
#   - no Strapi: banners and modals from the CMS don't appear
#   - SQLite for Django's own tables (users, sessions, topic pools) instead of Postgres
#   - the public dump has no sheets and no user profiles
# e2e-tests/Sanity/README.md §6a lists what that means for which tests may run here (@pr).
#
# To run it on your own machine: Docker, sudo (for /etc/hosts and the certificate tools), Python
# with requirements.txt, `npm ci`, then build/ci/restore-test-mongo.sh and this script.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
WORK=${WORK:-/mnt/e2e-app}
HOSTS=(www.sefaria.test voices.sefaria.test)
PYTHON=${PYTHON:-python}
GUNICORN_WORKERS=${GUNICORN_WORKERS:-3}
NGINX_IMAGE=${NGINX_IMAGE:-nginx:1.27-alpine}
REDIS_IMAGE=${REDIS_IMAGE:-redis:7-alpine}

phase() { echo "::group::$1"; PHASE_START=$(date +%s); }
done_phase() { echo "$1 took $(( $(date +%s) - PHASE_START ))s"; echo "::endgroup::"; }
as_root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi; }

if ! mkdir -p "$WORK" 2>/dev/null; then
  as_root mkdir -p "$WORK"
  as_root chown -R "$(id -u):$(id -g)" "$WORK"
fi

phase "Write sefaria/local_settings.py"
cp sefaria/local_settings_example.py sefaria/local_settings.py
cat >> sefaria/local_settings.py <<PY

# ---- e2e runner overrides (build/ci/start-e2e-app.sh) ----
DEBUG = False
SECRET_KEY = "$(head -c 32 /dev/urandom | base64)"
DATABASES["default"]["NAME"] = "$WORK/db.sqlite"
DOMAIN_MODULES = {
    "en": {"library": "https://www.sefaria.test", "voices": "https://voices.sefaria.test"},
    "he": {"library": "https://www.sefaria.test", "voices": "https://voices.sefaria.test"},
}
ALLOWED_HOSTS = [".sefaria.test", "localhost", "127.0.0.1"]
CSRF_TRUSTED_ORIGINS = ["https://*.sefaria.test"]
SESSION_COOKIE_DOMAIN = ".sefaria.test"
FRONT_END_URL = "https://www.sefaria.test"
STATIC_ROOT = "$WORK/static-collected"
# Server-side rendering by the node server, as in production. Fail instead of silently falling
# back to browser rendering, so a broken SSR shows up as failing pages, not as flaky tests.
USE_NODE = True
NODE_HOST = "http://127.0.0.1:3000"
FAIL_IF_NODE_SSR_UNAVAILABLE = True
# Pinned so a runner's geo-IP never flips the site to the Hebrew domain mid-test.
PINNED_IPCOUNTRY = "US"
# Redis caches, as in production. The example settings use a dummy cache, which makes every page
# rebuild the whole table of contents from Mongo (about 16 s a request).
CACHES = {
    "shared": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://127.0.0.1:6379/1",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "SERIALIZER": "sefaria.system.serializers.JSONSerializer",
        },
        "TIMEOUT": None,
    },
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://127.0.0.1:6379/0",
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
        "TIMEOUT": 60 * 60 * 24 * 30,
    },
}
# Google's reCAPTCHA test keys (from the example settings) fail a system check when DEBUG is off.
SILENCED_SYSTEM_CHECKS = ["django_recaptcha.recaptcha_test_key_error"]
PY
done_phase "settings"

phase "Build production webpack bundles"
if [ "${SKIP_WEBPACK:-}" = 1 ]; then
  echo "SKIP_WEBPACK=1: using the bundles already in static/bundles"
else
  npm run build-prod --silent > "$WORK/webpack.log" 2>&1 || { tail -50 "$WORK/webpack.log"; exit 1; }
fi
done_phase "webpack"

phase "Start Redis"
# The generation cache (sefaria/system/cache.py) reads Redis at REDIS_URL:REDIS_PORT, 127.0.0.1:6379.
docker rm -f e2e-redis >/dev/null 2>&1 || true
docker run -d --name e2e-redis --network host "$REDIS_IMAGE" >/dev/null
done_phase "redis"

phase "Django: migrate, collectstatic, test accounts"
"$PYTHON" manage.py migrate --noinput -v 0
"$PYTHON" manage.py collectstatic --noinput -v 0
# Topic pages 404 unless their topic is in a pool, and pools live in Django's database.
"$PYTHON" build/ci/seed-e2e-topic-pools.py
"$PYTHON" manage.py shell <<'PY'
import os
from django.contrib.auth.models import User
from emailusernames.utils import create_user, create_superuser
from sefaria.model.user_profile import UserProfile

# User ids far above anything in dump_small's profiles collection, so a test account never
# inherits a real person's Mongo profile.
accounts = [
    ("PLAYWRIGHT_USER", False, 900000001),
    ("PLAYWRIGHT_SUPERUSER", True, 900000002),
]
for prefix, is_super, uid in accounts:
    email, password = os.getenv(prefix + "_EMAIL"), os.getenv(prefix + "_PASSWORD")
    if not email or not password:
        print(f"{prefix}: no credentials in the environment, not created")
        continue
    if User.objects.filter(email__iexact=email).exists():
        print(f"{prefix}: {email} already exists")
        continue
    user = (create_superuser if is_super else create_user)(email, password)
    # Named like the staging accounts the tests were written against (user-menu.spec.ts checks it).
    User.objects.filter(pk=user.pk).update(id=uid, first_name="QA", last_name="Automation")
    profile = UserProfile(id=uid)
    profile.save()
    print(f"{prefix}: created {email} (id {uid})")
PY
done_phase "django"

phase "Hosts, TLS certificate and nginx"
for h in "${HOSTS[@]}"; do
  grep -q " $h\$" /etc/hosts || echo "127.0.0.1 $h" | as_root tee -a /etc/hosts >/dev/null
done
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=sefaria.test" \
  -addext "subjectAltName=DNS:sefaria.test,DNS:*.sefaria.test" \
  -keyout "$WORK/tls.key" -out "$WORK/tls.crt" 2>/dev/null
# Trust it in Chromium (NSS) so the tests need no ignore-HTTPS-errors switch.
if ! command -v certutil >/dev/null; then
  as_root apt-get install -y -qq libnss3-tools >/dev/null 2>&1 \
    || { as_root apt-get update -qq && as_root apt-get install -y -qq libnss3-tools >/dev/null; }
fi
mkdir -p "$HOME/.pki/nssdb"
[ -f "$HOME/.pki/nssdb/cert9.db" ] || certutil -d "sql:$HOME/.pki/nssdb" -N --empty-password
certutil -d "sql:$HOME/.pki/nssdb" -D -n sefaria-e2e 2>/dev/null || true
certutil -d "sql:$HOME/.pki/nssdb" -A -t "CP,," -n sefaria-e2e -i "$WORK/tls.crt"
# Node (Playwright's request fixture) reads this one.
echo "NODE_EXTRA_CA_CERTS=$WORK/tls.crt" >> "${GITHUB_ENV:-/dev/null}"

cat > "$WORK/nginx.conf" <<'NGINX'
events {}
http {
  include /etc/nginx/mime.types;
  client_max_body_size 50m;
  proxy_read_timeout 420s;
  server {
    listen 127.0.0.1:443 ssl;
    server_name .sefaria.test;
    ssl_certificate /etc/e2e/tls.crt;
    ssl_certificate_key /etc/e2e/tls.key;
    location /static/ { alias /srv/static/; access_log off; }
    location / {
      proxy_pass http://127.0.0.1:8000;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-For $remote_addr;
    }
  }
  server {
    listen 127.0.0.1:80;
    server_name .sefaria.test;
    return 301 https://$host$request_uri;
  }
}
NGINX
docker rm -f e2e-nginx >/dev/null 2>&1 || true
docker run -d --name e2e-nginx --network host \
  -v "$WORK/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$WORK/tls.crt:/etc/e2e/tls.crt:ro" -v "$WORK/tls.key:/etc/e2e/tls.key:ro" \
  -v "$WORK/static-collected:/srv/static:ro" "$NGINX_IMAGE" >/dev/null
done_phase "nginx"

phase "Start gunicorn"
[ -f "$WORK/gunicorn.pid" ] && kill "$(cat "$WORK/gunicorn.pid")" 2>/dev/null && sleep 2 || true
# The same server and startup as production (helm-chart/sefaria/templates/rollout/web.yaml and
# configmap/gunicorn.yaml): preload the app and build the library cache once, before the workers
# fork. Without init_library_cache a worker serves requests before its TOC tree exists, and
# /api/related fails with "'NoneType' object has no attribute 'get_collections_in_library'".
cat > "$WORK/gunicorn.conf.py" <<'GUNICORN'
preload_app = True


def on_starting(server):
    from reader.startup import init_library_cache
    init_library_cache()
GUNICORN
nohup "$PYTHON" -m gunicorn sefaria.wsgi -c "$WORK/gunicorn.conf.py" -b 127.0.0.1:8000 \
  --workers "$GUNICORN_WORKERS" --threads 4 --timeout 420 \
  --access-logfile "$WORK/gunicorn-access.log" --error-logfile "$WORK/gunicorn.log" \
  > "$WORK/gunicorn.out" 2>&1 &
echo $! > "$WORK/gunicorn.pid"
# gunicorn listens only after init_library_cache has filled the Redis cache the node server reads.
for i in $(seq 1 150); do
  curl -s -o /dev/null --max-time 5 http://127.0.0.1:8000/ && break
  kill -0 "$(cat "$WORK/gunicorn.pid")" 2>/dev/null || { echo "::error::gunicorn exited"; tail -80 "$WORK/gunicorn.log" "$WORK/gunicorn.out"; exit 1; }
  sleep 2
done
done_phase "gunicorn"

phase "Start the node server (server-side rendering)"
[ -f "$WORK/node.pid" ] && kill "$(cat "$WORK/node.pid")" 2>/dev/null && sleep 1 || true
NODEJS_PORT=3000 nohup node static/bundles/server/server-bundle.js > "$WORK/node.log" 2>&1 &
echo $! > "$WORK/node.pid"
for i in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/healthz)" = 200 ] && break
  kill -0 "$(cat "$WORK/node.pid")" 2>/dev/null || { echo "::error::node server exited"; tail -50 "$WORK/node.log"; exit 1; }
  sleep 1
done
done_phase "node"

phase "Wait for pages"
# Startup builds the library cache before gunicorn listens, so wait for real pages, not the port.
for url in https://www.sefaria.test/texts https://voices.sefaria.test/; do
  for i in $(seq 1 150); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --cacert "$WORK/tls.crt" --max-time 120 "$url" || true)
    [ "$code" = 200 ] && break
    if ! kill -0 "$(cat "$WORK/gunicorn.pid")" 2>/dev/null; then
      echo "::error::gunicorn exited"; tail -80 "$WORK/gunicorn.log"; exit 1
    fi
    sleep 2
  done
  echo "$url -> $code"
  [ "$code" = 200 ] || { echo "::error::$url never returned 200"; tail -80 "$WORK/gunicorn.log" "$WORK/node.log"; exit 1; }
done
# Server-side rendered pages arrive with the reader app already in the HTML.
curl -s --cacert "$WORK/tls.crt" https://www.sefaria.test/texts | grep -q 'class="readerApp' \
  || { echo "::error::/texts was not server-side rendered"; tail -50 "$WORK/node.log"; exit 1; }
echo "server-side rendering: ok"
done_phase "pages"
