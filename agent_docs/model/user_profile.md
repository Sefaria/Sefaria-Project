# User Profile
> Source: `sefaria/model/user_profile.py`

## Purpose
Manages user identity (profile data, social links, settings) and reading history (what a user has read, saved, or bookmarked). UserProfile is a hybrid object that bridges Django's `auth.User` (Postgres) with a MongoDB `profiles` document, while UserHistory is a pure Mongo record tracking individual page-view and save events.

## Key Classes

### UserHistory
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `user_history`
- **Role**: Tracks each ref a user views or saves. One record per (uid, ref, versions, secondary) tuple. Also tracks "last place" per book and saved/bookmarked items.
- **Key fields**: `uid`, `ref`, `he_ref`, `versions` (dict), `time_stamp` (epoch), `server_time_stamp`, `last_place` (bool), `book` (index title), `saved` (bool), `secondary` (bool, sidebar views), `is_sheet`, `sheet_id`, `language`, `context_refs`, `categories`, `authors`
- **Key methods**:
  - `save_history_item(uid, hist, action, time_stamp)` -- Static. The main entry point for creating/updating history. When `action` is None it is a normal page view and updates `last_place`; when `action` is `"add_saved"` or `"delete_saved"` it toggles the saved flag via `load_existing=True` to avoid duplicates.
  - `get_user_history(...)` -- Static. Flexible query builder; supports filtering by uid, oref, saved, secondary, last_place, sheets_only. Returns `UserHistorySet` or serialized list.
  - `delete_user_history(uid, ...)` -- Static. Bulk deletes history, optionally excluding saved items and last-place markers.
  - `contents(for_api, annotate)` -- When `for_api=True`, returns a whitelisted subset of fields. When `annotate=True`, fetches text snippets or sheet listing data.
  - `_normalize()` -- Derives `context_refs`, `categories`, `authors`, `is_sheet` from the ref at save time. Also auto-corrects `language` to `"hebrew"` if the English text is empty.
  - `_validate()` -- Enforces that `secondary` and `saved` cannot both be True.

### UserHistorySet
- **Inherits**: `AbstractMongoSet`
- **Collection**: `user_history`
- **Role**: Set class for UserHistory.
- **Key methods**: `hits()` -- Sums `num_times_read` across the set (used in legacy migration).

### UserWrapper
- **Inherits**: `object`
- **Collection**: N/A (Django ORM only)
- **Role**: Thin wrapper around Django User for changing a user's primary email address safely. Validates uniqueness and format before saving.

### UserProfile
- **Inherits**: `object` (NOT AbstractMongoRecord)
- **Collection**: `profiles` (direct pymongo, not via abstract framework)
- **Role**: The main user identity object. Combines Django User fields (first_name, last_name, email) with MongoDB profile fields (slug, bio, settings, social links, version preferences). Manages followers/followees, notifications, and delegates to UserHistory for reading history.
- **Key fields**: `id` (Django user ID), `slug`, `settings` (dict with `email_notifications`, `interface_language`, `textual_custom`, `reading_history`, `translation_language_preference`), `version_preferences_by_corpus`, `attr_time_stamps`, `profile_pic_url`, `gauth_token`, `nationbuilder_id`, `sf_app_user_id`, `is_sustainer`
- **Key methods**:
  - `__init__(user_obj, id, slug, email, user_registration)` -- Can load by any of id/slug/email/user_obj. Side effect: if a Django user exists but has no profile doc, one is auto-created on init (unless `user_registration=True`).
  - `save()` -- Writes to MongoDB `profiles` collection. If name changed, also updates Django User. If `reading_history` was toggled off, cascades a history delete.
  - `update(obj, ignore_flags_on_init)` -- Merges dict into profile. `settings` and `version_preferences_by_corpus` are deep-merged, not replaced.
  - `process_history_item(hist, time_stamp)` -- Routes history events: respects the `reading_history` setting; if history is disabled, only saved items are persisted.
  - `get_history(...)` -- Returns empty if `reading_history` is disabled (unless querying saved items).
  - `to_mongo_dict()` / `to_api_dict(basic)` -- Serialization. `to_mongo_dict` is for DB persistence; `to_api_dict` is for API responses (basic=True returns minimal listing data).
  - `assign_slug()` -- Auto-generates slug from name; appends incrementing number on collision.
  - `follow_recommendations(lang, n)` -- Returns random sample from general recommendations, filtered to exclude existing followees.

## Non-Obvious Patterns

- **UserProfile is NOT an AbstractMongoRecord.** It uses raw pymongo (`db.profiles`) for all DB operations rather than the abstract ORM framework. This means it lacks `load()`, `_saveable_attrs()`, etc. -- it manages its own `_id` tracking and upsert logic in `save()`.
- **Dual data store.** User identity lives in two places: Django `auth_user` (Postgres) holds name/email/auth; MongoDB `profiles` holds everything else. Name changes in the profile cascade back to Django User on save.
- **Auto-profile creation.** Constructing a `UserProfile(id=X)` will auto-create a Mongo profile doc as a side effect of `__init__`, but **only if** (a) the Django `auth.User` record exists (`self.exists()` returns True) AND (b) `user_registration` is not True. If neither condition is met, no profile is created. Pass `user_registration=True` to suppress this even when the Django user exists.
- **History gating.** When `settings.reading_history` is False, `process_history_item` silently drops non-save history events, and `get_history` returns empty. Toggling it from True to False triggers bulk deletion of existing history (excluding saved items).
- **last_place tracking.** Each new (non-secondary) history save marks the item as `last_place=True` and clears the previous `last_place` for that book. This is done in `__init__` of UserHistory via `update_last_place`.
- **load_existing dedup.** When `load_existing=True`, UserHistory's `__init__` queries Mongo for an existing record matching (uid, ref, versions, secondary) and merges `field_updates` into it, preventing duplicate records for save/unsave toggling.
- **_normalize derives fields at write time.** `context_refs`, `categories`, `authors`, and `is_sheet` are computed from the ref during `_normalize()` and stored denormalized for fast downstream queries.
- **Module-level cache.** `public_user_data_cache` is a module-level dict (not TTL-managed) that caches basic profile info by uid. It persists for the lifetime of the process.
- **settings deep merge.** `update()` deep-merges `settings` and `version_preferences_by_corpus` rather than replacing them, so partial updates are safe.

## Relationships
- **Depends on**: `abstract` (AbstractMongoRecord/Set), `text` (Ref, TextChunk), `following` (FollowersSet, FolloweesSet), `blocking` (BlockersSet, BlockeesSet), `notification` (NotificationSet), `sefaria.sheets` (get_sheet_listing_data), `sefaria.system.database` (db), Django `auth.User`
- **Depended on by**: `reader/views.py`, `sefaria/views.py`, `sefaria/model/notification.py`, `sefaria/model/trend.py`, `sefaria/model/story.py`, `sefaria/model/garden.py`, `sefaria/sheets.py`, `sefaria/search.py`, `sefaria/client/wrapper.py`, `sefaria/system/middleware.py`, `sefaria/system/context_processors.py`, `sourcesheets/views.py`
- **Dependency subscriptions**: `Index` title change -> `process_index_title_change_in_user_history` (updates `ref` field in all matching UserHistory records)

## Common Tasks

- **Record a page view**: Call `profile.process_history_item(hist_dict, time_stamp)` where `hist_dict` contains `ref`, `he_ref`, `versions`, `book`, `time_stamp`. Omit `action` for a normal view.
- **Save/unsave a bookmark**: Same as above but include `"action": "add_saved"` or `"action": "delete_saved"` in `hist_dict`.
- **Get user's reading history**: `profile.get_history(saved=True, serialized=True, limit=20)` for saved items; omit `saved` for all history.
- **Get last place per book**: `UserHistory.get_user_history(uid=uid, last_place=True)`
- **Check if a user has read a ref**: `UserHistory.get_user_history(uid=uid, oref=oref)`
- **Change user email**: Use `UserWrapper(email=old).set_email(new_email)` then `.save()`.
- **Look up a profile by slug**: `UserProfile(slug="lev-israel")`
