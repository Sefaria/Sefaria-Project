# Collection
> Source: `sefaria/model/collection.py`

## Purpose
A Collection is a user-curated group of source sheets. Collections have members (admins and regular members), can be public ("listed") or private, and appear at `/collections/{slug}`. Despite the class name `Collection`, the underlying MongoDB collection is called `groups` (a legacy naming artifact).

## Key Classes

### Collection
- **Inherits**: `AbstractMongoRecord`
- **MongoDB Collection**: `groups`
- **Role**: Represents a single collection of sheets with membership, slug-based URLs, and optional TOC integration.
- **Key fields**: `name`, `slug`, `sheets` (list of sheet IDs), `admins` (list of UIDs), `members` (list of UIDs), `listed` (bool for public visibility), `toc` (optional object for library TOC inclusion), `pinned_sheets`, `invitations`
- **Key methods**:
  - `assign_slug()` -- Public collections get a name-derived slug; private ones get a random token. On publish, the old private slug is saved as `privateSlug` for link stability; on unpublish, it is restored.
  - `contents(with_content, authenticated)` -- Returns dict. When `with_content=True`, hydrates sheets, member profiles, and invitations (invitations only if `authenticated`).
  - `listing_contents(uid)` -- Lightweight summary dict for collection listings. Includes `membership` role if `uid` is provided.
  - `add_member(uid, role)` -- Calls `remove_member` first (to handle role changes), then appends and saves.
  - `pin_sheet(sheet_id)` -- Toggles: adds if not pinned, removes if already pinned.
  - `_pre_save()` -- Enforces publishing rules: unique name, image required, minimum 3 public sheets. Also detects image field changes and deletes old images from Google Cloud Storage.

### CollectionSet
- **Inherits**: `AbstractMongoSet`
- **Role**: Query helper for sets of collections.
- **Key methods**:
  - `for_user(uid, private=True)` -- Re-initializes the set with collections where the user is admin or member (optionally filtered to listed only).
  - `get_collection_listing(userid)` -- Returns `{"private": [...], "public": [...]}` dict of listing contents.

## Non-Obvious Patterns
- **MongoDB collection is `groups`**, not `collections`. Queries hit `db.groups`.
- **`track_pkeys = True`**: The record tracks previous values of `name`, `slug`, `listed`, `headerUrl`, `imageUrl`, `coverUrl` via `pkeys_orig_values`. This powers slug-change subscriptions and image cleanup.
- **Slug lifecycle on publish/unpublish**: Publishing assigns a new name-based slug and stashes the old random slug in `privateSlug`. Unpublishing restores `privateSlug`. This preserves private share links.
- **Publishing validation is only checked at the moment of transition** (`listed` changing from falsy to truthy), not on every save. This prevents a listed collection from becoming un-saveable if it temporarily dips below 3 public sheets.
- **`add_member` and `remove_member` both call `save()`**, so calling `add_member` triggers two saves (one from the internal `remove_member`, one from itself).
- **`process_sheet_deletion_in_collections`** is NOT wired through `dependencies.py` because sheets don't use the standard Mongo model. It is called directly from `sourcesheets/views.py`.

## Relationships
- **Sheets** (`db.sheets`): `Collection.sheets` stores sheet IDs. Sheets reference collections via `displayedCollection` (slug).
- **Notifications** (`NotificationSet`): Cascade-deleted by `content.collection_slug` matching `slug` on collection delete.
- **Dependency subscriptions** (in `dependencies.py`):
  - `Collection` slug change -> `process_collection_slug_change_in_sheets`: updates `displayedCollection` in all affected sheets.
  - `Collection` delete -> `process_collection_delete_in_sheets`: clears `displayedCollection` on affected sheets.
  - `Collection` delete -> `cascade_delete(NotificationSet, "content.collection_slug", "slug")`: removes related notifications.
- **Google Cloud Storage**: Image changes trigger deletion of old images via `GoogleStorageManager`.
- **UserProfile**: Member data is hydrated via `public_user_data()` in `contents()`.

## Common Tasks

**Add a sheet to a collection:**
```python
collection = Collection().load({"slug": "my-collection"})
collection.sheets.append(sheet_id)
collection.save()
```

**Find all collections for a user:**
```python
collections = CollectionSet().for_user(uid)
```

**Publish a collection** (must have unique name, image, and 3+ public sheets):
```python
collection.listed = True
collection.save()  # raises InputError if requirements not met
```

**Remove a sheet from all collections** (called from views, not via dependencies):
```python
from sefaria.model.collection import process_sheet_deletion_in_collections
process_sheet_deletion_in_collections(sheet_id)
```
