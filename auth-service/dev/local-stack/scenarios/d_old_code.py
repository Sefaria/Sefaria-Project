"""
D-1..D-3: master's code on the branch's migrated schema. Run by d-old-code.sh through master's `manage.py shell`
with the drill database (the stack's settings wrapper, APIKEYS_STACK_PG_PORT=55439). Prints one
"D11RESULT <status> <id> <text>" line per check, status pass|FAIL|GAP.

Fixtures: a marked project per case and two synthetic users in the e2e id band, created here and removed at the end.
The Mongo profile of the synthetic user being deleted is the only Mongo write.
"""
import hashlib
import hmac
import json
import traceback

from django.conf import settings
from django.contrib.admin.sites import site as admin_site
from django.contrib.auth.models import User
from django.db import connection
from django.test import Client, RequestFactory
from django.test.utils import override_settings

from powered_by.models import Project
from sefaria.system.database import db

assert str(settings.DATABASES["default"]["PORT"]) == "55439", "d_old_code.py runs against the drill database only"

MARK = "E2E api-keys d11 old-code (local only)"
UID_OWNER = 2_098_000_961
UID_ADMIN = 2_098_000_962


def say(status, case, text):
    print("D11RESULT %s %s %s" % (status, case, " ".join(str(text).split())))


def sql(query, args=()):
    with connection.cursor() as cur:
        cur.execute(query, args)
        return cur.fetchall() if cur.description else None


def cleanup():
    sql("DELETE FROM powered_by_apikey WHERE project_id IN (SELECT id FROM powered_by_project WHERE notes = %s)", [MARK])
    sql("DELETE FROM powered_by_project WHERE notes = %s OR owner_id IN (%s, %s)", [MARK, UID_OWNER, UID_ADMIN])
    sql("DELETE FROM auth_user WHERE id IN (%s, %s)", [UID_OWNER, UID_ADMIN])
    db.profiles.delete_many({"id": {"$in": [UID_OWNER, UID_ADMIN]}})


def project_row(name, owner=None, source="developer_settings"):
    """A branch-shaped project, written with SQL because master's model has no owner, tier or deleted_at."""
    return sql("""
        INSERT INTO powered_by_project (created_at, updated_at, submission_source, creator, creator_email, submitter,
          is_developer, job_title, found_sefaria, sefaria_tools_used, tech_used_raw, technical_experience, vibe_coded,
          project_why, project_name, project_link, project_reach, project_desc, project_category, has_pbs_logo, tags,
          status, is_buggy, consent_to_display, is_published, featured, notes, owner_id)
        VALUES (now(), now(), %s, 'D11', 'apikeys-e2e-d11-old@example.com', '', true, '', '', '[]', '', '', false, '',
          %s, '', '', '', '', false, '[]', 'unknown', false, false, false, false, %s, %s)
        RETURNING id""", [source, name, MARK, owner])[0][0]


def key_row(project_id, label):
    sql("""INSERT INTO powered_by_apikey (id, key, label, allowed_origins, created_at, project_id)
           VALUES (gen_random_uuid(), 'sfr_d11old' || md5(random()::text), %s, '[]', now(), %s)""", [label, project_id])


def synthetic_user(uid, email, staff=False):
    user = User(id=uid, email=email, username="d11-%d" % uid, first_name="D11", last_name="Old")
    user.set_unusable_password()
    user.is_staff = user.is_superuser = staff
    user.save()
    return user


cleanup()

# D-1: master's Powered by POST (the Formstack webhook path) inserts into the migrated table.
secret = "d11-local-secret"
body = json.dumps({"project_name": "D11 master form", "project_link": "https://d11-master-form.example",
                   "consent_to_display": False, "creator_email": "apikeys-e2e-d11-form@example.com", "notes": MARK})
signature = "sha256=" + hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
with override_settings(POWERED_BY_FORMSTACK_HMAC_SECRET=secret, ALLOWED_HOSTS=["*"]):
    resp = Client(raise_request_exception=False).post("/api/powered-by", data=body, content_type="application/json",
                                                       HTTP_X_FS_SIGNATURE=signature)
row = sql("SELECT organization, tier, deleted_at, owner_id, is_published FROM powered_by_project WHERE notes = %s "
          "AND project_name = 'D11 master form'", [MARK])
if resp.status_code == 201 and row and row[0][:4] == ("", "developer", None, None):
    say("pass", "D-1", "master POST /api/powered-by -> 201; the row got organization='' and tier='developer' from the "
                       "database defaults, owner and deleted_at NULL (is_published=%s)" % row[0][4])
else:
    say("FAIL", "D-1", "master POST /api/powered-by -> %s %s; row %s" % (resp.status_code, resp.content[:200], row))
resp = Client(raise_request_exception=False).get("/api/powered-by", HTTP_HOST="127.0.0.1")
say("pass" if resp.status_code == 200 else "FAIL", "D-1", "master GET /api/powered-by on the migrated table -> %s" % resp.status_code)

# D-2: master deletes a user who owns a developer project with a key.
owner = synthetic_user(UID_OWNER, "apikeys-e2e-d11-owner@example.com")
db.profiles.insert_one({"id": UID_OWNER, "slug": "d11-owner-%d" % UID_OWNER, "settings": {}})
owned = project_row("D11 owned project", owner=UID_OWNER)
key_row(owned, "d11-owned")
from sefaria.utils.user import delete_user_account  # noqa: E402

error = None
try:
    delete_user_account(UID_OWNER, confirm=False)
except Exception as exc:  # the case under test
    error = "%s: %s" % (type(exc).__name__, str(exc).splitlines()[0])
user_left = User.objects.filter(id=UID_OWNER).exists()
profile_left = db.profiles.find_one({"id": UID_OWNER}) is not None
if error is None and not user_left:
    say("pass", "D-2", "master deleted the user; the owned project is %s"
        % sql("SELECT coalesce(owner_id::text, 'NULL') FROM powered_by_project WHERE id = %s", [owned]))
else:
    say("GAP", "D-2", "master delete_user_account -> %s; Django user left=%s, Mongo profile left=%s "
        "(half-deleted when the profile is gone but the user is not)" % (error, user_left, profile_left))

# D-3a: master admin deletes a project that has keys.
admin = synthetic_user(UID_ADMIN, "apikeys-e2e-d11-admin@example.com", staff=True)
keyed = project_row("D11 keyed project")
key_row(keyed, "d11-admin")
client = Client(raise_request_exception=False)
client.force_login(admin)
with override_settings(ALLOWED_HOSTS=["*"]):
    page = client.get("/admin/powered_by/project/%d/delete/" % keyed)
    resp = client.post("/admin/powered_by/project/%d/delete/" % keyed, {"post": "yes"})
still = sql("SELECT count(*) FROM powered_by_project WHERE id = %s", [keyed])[0][0]
keys = sql("SELECT count(*) FROM powered_by_apikey WHERE project_id = %s", [keyed])[0][0]
# Accepted: master's admin may answer 500 here, as long as it changes no rows.
if (still, keys) in ((1, 1), (0, 0)):
    say("pass", "D-3", "master admin delete of a project with keys -> confirm page %s, POST %s; project left=%s, keys left=%s"
        % (page.status_code, resp.status_code, still, keys))
else:
    say("FAIL", "D-3", "master admin delete of a project with keys left a partial delete -> POST %s; project left=%s, keys left=%s"
        % (resp.status_code, still, keys))

# D-3b: master admin edits a developer_settings row (master's choices do not know the source).
dev = project_row("D11 developer row")
request = RequestFactory().post("/admin/powered_by/project/%d/change/" % dev)
request.user = admin
model_admin = admin_site._registry[Project]
obj = Project.objects.get(id=dev)
form_class = model_admin.get_form(request, obj, change=True)
initial = {f: getattr(obj, f) for f in form_class.base_fields}
initial = {k: (json.dumps(v) if isinstance(v, (list, dict)) else v) for k, v in initial.items() if v is not None}
form = form_class(data=initial, instance=obj)
with override_settings(ALLOWED_HOSTS=["*"]):
    change_page = client.get("/admin/powered_by/project/%d/change/" % dev)
if form.is_valid():
    try:
        form.save()
        tier = sql("SELECT tier, owner_id FROM powered_by_project WHERE id = %s", [dev])[0]
        say("pass", "D-3", "master admin saves a developer_settings row unchanged; tier/owner kept %s" % (tier,))
    except Exception as exc:
        say("FAIL", "D-3", "master admin save of a developer_settings row raised %s: %s" % (type(exc).__name__, exc))
else:
    errors = {k: [str(m) for m in v] for k, v in form.errors.items()}
    say("pass", "D-3", "master admin change page %s; saving a developer_settings row is refused with a form error "
                       "(no 500, no write): %s" % (change_page.status_code, json.dumps(errors)[:300]))

try:
    cleanup()
except Exception:
    traceback.print_exc()
left = sql("SELECT count(*) FROM powered_by_project WHERE notes = %s", [MARK])[0][0]
say("pass" if left == 0 else "FAIL", "D-*", "fixture rows left after cleanup: %s" % left)
