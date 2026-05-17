# Social Relationships
> Sources: `sefaria/model/following.py`, `sefaria/model/blocking.py`

## Purpose
These modules manage directional user-to-user relationships: following (opt-in content subscription) and blocking (opt-in content/interaction exclusion). Both write directly to MongoDB via `sefaria.system.database.db` rather than using the `abst.py` abstract model layer.

## following.py

### FollowRelationship
- **Inherits:** `object`
- **Collection:** `following`
- **Role:** Represents a single directed follow edge between two users.
- **Key fields:** `follower` (uid), `followee` (uid), `follow_date` (datetime, set at init)
- **Key methods:**
  - `exists()` -- checks if the relationship already exists in the DB.
  - `follow()` -- inserts the relationship and creates a `Notification` for the followee.
  - `unfollow()` -- deletes the relationship document.

### FollowSet
- **Inherits:** `object`
- **Role:** Base class providing a `uids` list and a `count` property.

### FollowersSet(FollowSet)
- **Role:** Given a uid, queries `following` for all distinct `follower` uids where the user is the followee. Provides the list of users who follow a given user.

### FolloweesSet(FollowSet)
- **Role:** Given a uid, queries `following` for all distinct `followee` uids where the user is the follower. Provides the list of users a given user follows.

### Module-level functions
- `aggregate_profiles(lang, limit)` -- Aggregation pipeline on `sheets` that joins with `profiles` to find prolific public-sheet authors. Cached for 24 hours via `@django_cache`.
- `general_follow_recommendations(lang, n)` -- Returns `n` random users from the top 1300 sheet creators. Uses a module-level `creators` global that is lazily populated once and then reused for the process lifetime.

## blocking.py

### BlockRelationship
- **Inherits:** `object`
- **Collection:** `blocking`
- **Role:** Represents a single directed block edge between two users.
- **Key fields:** `blocker` (uid), `blockee` (uid), `block_date` (datetime, set at init)
- **Key methods:**
  - `exists()` -- checks if the relationship already exists in the DB.
  - `block()` -- upserts the relationship (uses `replace_one` with `upsert=True`, so re-blocking is idempotent).
  - `unblock()` -- deletes the relationship document.

### BlockSet
- **Inherits:** `object`
- **Role:** Base class providing a `uids` list and a `count` property. Mirrors `FollowSet`.

### BlockersSet(BlockSet)
- **Role:** Given a uid, returns all distinct `blocker` uids -- i.e., users who have blocked this user.

### BlockeesSet(BlockSet)
- **Role:** Given a uid, returns all distinct `blockee` uids -- i.e., users this user has blocked.

## Non-Obvious Patterns
- **No `abst.py` inheritance.** Both modules bypass the project's standard `AbstractMongoRecord`/`AbstractMongoSet` pattern. They use raw `db` calls, so there are no `_saveable_attrs`, no `load()`/`save()` lifecycle, and no change tracking.
- **Follow creates a notification; block does not.** `FollowRelationship.follow()` imports and fires a `Notification` inline. `BlockRelationship.block()` has no side effects beyond the DB write.
- **Block is idempotent; follow is not.** `block()` uses `replace_one(..., upsert=True)`, so calling it twice is safe. `follow()` uses `insert_one`, so duplicate follows will create duplicate documents unless guarded by a caller check on `exists()`.
- **`aggregate_profiles` is cached but `creators` is also cached in a global.** The Django cache covers `aggregate_profiles`, but `general_follow_recommendations` additionally holds results in a module-level global that persists for the entire process lifetime (never invalidated).
- **`FollowSet.__init__` returns `self`.** This is a no-op (constructors implicitly return the instance), but it would raise a `TypeError` if `FollowSet()` were ever instantiated directly because `__init__` must return `None`. The same applies to `BlockSet`. In practice only the subclasses are used, and they override `__init__` without calling `super()`.

## Relationships
- `FollowRelationship.follow()` creates a `sefaria.model.notification.Notification`.
- `general_follow_recommendations` queries `django.contrib.auth.models.User` to build display data.
- `aggregate_profiles` joins the `sheets` and `profiles` MongoDB collections.
- Blocking/following are consumed by profile and feed views (e.g., filtering sheets, controlling visibility).

## Common Tasks
- **Follow a user:** `FollowRelationship(follower=uid_a, followee=uid_b).follow()` (check `.exists()` first to avoid duplicates).
- **Unfollow:** `FollowRelationship(follower=uid_a, followee=uid_b).unfollow()`.
- **Get a user's followers:** `FollowersSet(uid).uids`.
- **Get who a user follows:** `FolloweesSet(uid).uids`.
- **Block a user:** `BlockRelationship(blocker=uid_a, blockee=uid_b).block()`.
- **Unblock:** `BlockRelationship(blocker=uid_a, blockee=uid_b).unblock()`.
- **Get users blocked by a user:** `BlockeesSet(uid).uids`.
- **Get users who blocked a user:** `BlockersSet(uid).uids`.
