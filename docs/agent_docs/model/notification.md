# Notification
> Source: `sefaria/model/notification.py`

## Purpose
Manages user-facing notifications for events like sheet likes, follows, collection additions, and sheet publishes, as well as site-wide "global" notifications (new indexes, versions, general announcements). Per-user `Notification` records can be standalone or linked to a `GlobalNotification` via `global_id`, in which case the global record's content/type is loaded at read time.

## Key Classes

### GlobalNotification
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `global_notification`
- **Role**: Site-wide announcements. Three types: `"index"` (new index), `"version"` (new version), `"general"` (free-text he/en).
- **Key fields**: `type`, `content` (dict with type-specific keys), `date`
- **Key methods**:
  - `make_index(index)` / `make_version(version)` -- builder pattern, returns `self`
  - `set_en(msg)` / `set_he(msg)` / `set_date(date)` -- builder pattern
  - `latest_id()` -- static; returns `_id` of most recent global notification (used to sync per-user copies)
  - `_validate()` -- asserts the referenced Index or Version actually exists in the library

### GlobalNotificationSet
- **Inherits**: `AbstractMongoSet`
- **Role**: Query wrapper; importantly has `register_for_user(uid)` which creates per-user `Notification` records for each global notification in the set.

### Notification
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `notifications`
- **Role**: Per-user notification record. Either standalone (sheet like, follow, etc.) or a user-specific reference to a GlobalNotification.
- **Key fields**: `type`, `date`, `uid` (int user id), `content` (dict), `read` (bool), `is_global` (bool), `global_id` (ObjectId, optional), `suspected_spam` (optional)
- **Notification types** (in `type` field): `"sheet like"`, `"sheet publish"`, `"follow"`, `"collection add"`, `"discuss"`, plus any GlobalNotification type (`"index"`, `"version"`, `"general"`)
- **Key methods**:
  - `make_sheet_like(liker_id, sheet_id)` / `make_follow(follower_id)` / etc. -- builder pattern, returns `self`
  - `register_global_notification(global_note, user_id)` -- links this notification to a GlobalNotification
  - `_set_derived_attributes()` -- if `is_global`, loads the GlobalNotification and copies its `content`/`type` onto `self`. This means global notification content is always read fresh.
  - `client_contents()` -- enriches the raw record with profile data, sheet metadata, collection names, and follow status for client consumption
  - `actor_id` -- property; extracts the acting user's id from `content` based on `type`
- **`sheets_notification_types`** -- class-level list used to split notifications into "library" vs "voices" scopes

### NotificationSet
- **Inherits**: `AbstractMongoSet`
- **Role**: Query/batch operations on per-user notifications.
- **Key methods**:
  - `unread_for_user(uid, scope)` / `recent_for_user(uid, page, limit, scope)` -- re-initializes self with filtered query; calls `_add_global_messages` first to sync any new globals
  - `_add_global_messages(uid)` -- compares user's latest global notification id against the actual latest; creates missing per-user copies (up to 10)
  - `mark_read(via)` -- marks all notifications in the set as read
  - `actors_list()` / `actors_string()` -- for email digest: unique actor ids and a formatted "A, B, and 3 others" string (excludes likes)
  - `_build_query_with_scope(uid, ...)` -- splits notification types into `library` or `VOICES_MODULE` scope using `$in`/`$nin` on `sheets_notification_types`

## Non-Obvious Patterns
- **Builder pattern everywhere**: `make_*`, `set_*`, and `mark_read` all return `self`, enabling chaining like `Notification().make_follow(uid).save()`.
- **Lazy global sync**: Global notifications are not pushed to users on creation. Instead, `_add_global_messages` is called lazily when a user fetches their notifications, creating up to 10 missing per-user copies at that time.
- **Derived attributes on global notifications**: `_set_derived_attributes` overwrites `content` and `type` from the linked GlobalNotification on every load, so edits to the global propagate automatically.
- **Scope filtering**: The `scope` parameter (`'library'` or VOICES_MODULE constant) flips the query between `$nin` and `$in` on `sheets_notification_types`, partitioning notification types into two UI modules.
- **Sheet deletion is not wired through dependencies.py**: `process_sheet_deletion_in_notifications(sheet_id)` is called directly from `sourcesheets/views.py`, not via the dependency subscription system.

## Relationships
- **GlobalNotification -> Notification**: One-to-many via `global_id`. When a GlobalNotification is deleted, `NotificationSet` records referencing it via `global_id` are cascade-deleted (via `dependencies.py`).
- **Index title changes**: Cascade to `GlobalNotificationSet` updating `content.index`.
- **Version title changes**: Cascade to `GlobalNotificationSet` updating `content.version`.
- **Index/Version deletion**: Cascade-deletes matching `GlobalNotificationSet` records.
- **Collection deletion**: Cascade-deletes `NotificationSet` records matching `content.collection_slug`.
- **user_profile**: `client_contents()` calls `public_user_data()` and `user_name()` to annotate notifications with display names/images.
- **FollowRelationship**: Used inside `client_contents()` to annotate follow notifications with `is_already_following`.
- **Sheets**: `get_sheet_metadata()` used in `client_contents()`; `process_sheet_deletion_in_notifications` deletes notifications when a sheet is removed.

## Common Tasks

**Create a notification for a user:**
```python
Notification(uid=user_id).make_sheet_like(liker_id=actor_id, sheet_id=sid).save()
Notification(uid=user_id).make_follow(follower_id=actor_id).save()
Notification(uid=user_id).make_collection_add(adder_id=actor_id, collection_slug=slug).save()
```

**Create a global notification:**
```python
GlobalNotification().make_version(version_obj).set_en("New translation").set_he("...").save()
```

**Fetch recent notifications for a user (with global sync):**
```python
ns = NotificationSet().recent_for_user(uid, page=0, limit=10, scope='library')
client_data = ns.client_contents()
```

**Mark notifications as read:**
```python
NotificationSet().unread_for_user(uid).mark_read(via="site")
```

**Delete notifications when a sheet is removed:**
```python
process_sheet_deletion_in_notifications(sheet_id)
```
