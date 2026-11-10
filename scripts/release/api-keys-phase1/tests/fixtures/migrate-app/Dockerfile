# A stand-in web image for the premigrate tests: the same Django (6.0.4) and PostgreSQL driver (psycopg2-binary 2.9.9) as
# requirements.txt, a manage.py, and a fixture app whose migrations alter a table the test holds a lock on. The settings
# come from /app/sefaria/local_settings.py, which the stand-in Rollout mounts from a ConfigMap, like the real chart.
FROM python:3.12-slim-bookworm
RUN pip install --no-cache-dir "Django==6.0.4" "psycopg2-binary==2.9.9"
WORKDIR /app
COPY manage.py fixture_settings.py ./
COPY sefaria/ sefaria/
COPY fixtureapp/ fixtureapp/
