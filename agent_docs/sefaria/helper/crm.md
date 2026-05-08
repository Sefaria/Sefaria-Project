# CRM Integration
> Sources: `sefaria/helper/crm/crm_mediator.py`, `salesforce.py`, `nationbuilder.py`, `crm_connection_manager.py`, `crm_info_store.py`, `crm_factory.py`, `dummy_crm.py`, `tasks.py`

## Purpose
Pluggable CRM layer that syncs Sefaria app users, newsletter subscriptions, and sustainer status with an external CRM. Salesforce is the live backend; NationBuilder is deprecated; `DummyConnectionManager` is used in dev and for unconfigured deployments. A separate Celery task handles chatbot-experiment opt-in webhooks that bypass the mediator and post directly to a Salesforce Apex webhook URL.

## Key Components

- **`CrmMediator`** (`crm_mediator.py`) — Public facade. Callers never touch a connection manager directly. Holds one `_crm_connection` via `CrmFactory`, and pairs every remote mutation with a local `CrmInfoStore` update. Swallows exceptions broadly in `create_crm_user` and returns `False` on failure.
- **`CrmFactory`** (`crm_factory.py`) — Reads `settings.CRM_TYPE` and returns the matching connection manager. `NATIONBUILDER`, `NONE`, and any unknown value all collapse to `DummyConnectionManager`; only `SALESFORCE` returns the real client.
- **`CrmConnectionManager`** (`crm_connection_manager.py`) — Abstract base. Defines the API (`add_user_to_crm`, `change_user_email`, `mark_as_spam_in_crm`, `mark_for_review_in_crm`, `subscribe_to_lists`, `find_crm_id`) and provides shared `validate_email` / `validate_name` regex validators. Subclasses call `CrmConnectionManager.method(self, ...)` as a validation preflight.
- **`SalesforceConnectionManager`** (`salesforce.py`) — Authenticates via OAuth2 client-credentials flow against `services/oauth2/token`, then targets custom Salesforce objects `Sefaria_App_User__c` (users), `Sefaria_App_Data__c` (subscription events, posted as a JSON-encoded `JSON_STRING__c` payload), and metadata object `AC_to_SF_List_Mapping__mdt` (available newsletter lists). Raises `SalesforceNewsletterListRetrievalError` for list retrieval errors; elsewhere swallows and returns `False`.
- **`NationbuilderConnectionManager`** (`nationbuilder.py`) — Deprecated. Emits `DeprecationWarning` on import. Uses `rauth` OAuth2 against `{SLUG}.nationbuilder.com`. Kept for reference but never instantiated by the factory.
- **`DummyConnectionManager`** (`dummy_crm.py`) — No-op returning `True` for every mutation. Returns two hardcoded fake lists from `get_available_lists`.
- **`CrmInfoStore`** (`crm_info_store.py`) — Static methods that read/write CRM IDs on `UserProfile` (field name depends on CRM type: `nationbuilder_id` vs `sf_app_user_id`) and manage the `is_sustainer` flag in the `profiles` collection.
- **`tasks.py`** — Celery task `crm.send_chatbot_opt_in_webhook`. Separate path from the mediator: posts `{id, data: {email, optIn}}` to a hardcoded Salesforce Apex webhook URL with one retry.

## Non-Obvious Patterns

- **Broad `except:` blocks everywhere.** `CrmMediator.create_crm_user`, every Salesforce mutation, and the Salesforce `find_crm_id` catch bare exceptions and return `False`. This means silent failures; callers cannot distinguish network errors from config errors.
- **Base class methods as validators, not as super calls.** Subclasses invoke `CrmConnectionManager.subscribe_to_lists(self, ...)` purely to trigger `validate_email`/`validate_name`; the base itself has no functional behavior to inherit. Breaking this pattern skips validation.
- **`CrmInfoStore.save_crm_id` creates a profile.** If no profile is passed, it calls `UserProfile(email=email, user_registration=True)` — which can register a new user as a side effect of saving a CRM ID.
- **`sync_sustainers` diff-by-deletion.** Starts with all current sustainers from Mongo, removes each one returned by the CRM, and demotes everyone remaining. Any transient CRM read failure would demote sustainers en masse.
- **Salesforce `find_crm_id` URL is malformed.** The endpoint uses `query?=SELECT...` (no parameter name). This path currently does not work; it swallows the error and returns `False`.
- **Two code paths to Salesforce.** The mediator writes via custom objects; `tasks.py` bypasses it entirely and hits an Apex webhook endpoint (`/services/apexrest/Streams/webhookflow`) with no auth, retry=1, guarded by `CELERY_ENABLED` (runs inline if Celery is off).
- **Factory treats unknown CRM_TYPE as Dummy silently.** Typos in settings degrade to no-op without warning.
- **`SalesforceConnectionManager.make_request` is defined but unused** — real requests go through `self.session.{get,post,patch}` directly.

## Relationships

- `CrmMediator` is the single entry point from Django views/signals. Callers include the user registration flow and profile email update flow.
- `CrmInfoStore` is coupled to `sefaria.model.user_profile.UserProfile` and directly queries `db.profiles`.
- `tasks.py` is invoked via `dispatch_chatbot_opt_in_webhook(email, opt_in)` from chatbot opt-in toggle views; it does not go through `CrmMediator`.
- `CrmFactory` reads `django.conf.settings.CRM_TYPE`. Salesforce auth additionally needs `SALESFORCE_BASE_URL`, `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`.

## Common Tasks

- **Add a new CRM backend:** subclass `CrmConnectionManager`, implement `_get_connection` and the mutation methods, add a branch in `CrmFactory.get_connection_manager`, extend `CrmInfoStore.save_crm_id`/`get_crm_id` with a new field on `UserProfile`.
- **Debug why a user isn't in Salesforce:** check `settings.CRM_TYPE == "SALESFORCE"`; check OAuth creds; remember exceptions are swallowed — enable logging before the `except` in `SalesforceConnectionManager.add_user_to_crm`.
- **Add a new mailing list:** managed in Salesforce metadata (`AC_to_SF_List_Mapping__mdt`). No code change needed; `get_available_lists` picks them up.
- **Test locally:** set `CRM_TYPE = "NONE"` (or leave unset) — everything becomes a no-op via `DummyConnectionManager`.
- **Fire a chatbot opt-in event:** call `dispatch_chatbot_opt_in_webhook(email, opt_in)` from `sefaria.helper.crm.tasks`.
