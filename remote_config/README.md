# Remote Config

This Django app centralizes runtime configuration (feature flags, percentage rollouts, kill‑switches, etc.) so that behavior can be changed without a code deploy. Values live in the `RemoteConfigEntry` model and are cached inside each web/worker process for fast lookups.

## Data Model

Each entry represents a single key/value pair:

| Field | Purpose |
| --- | --- |
| `key` | Unique identifier, e.g., `features.reader.new_nav`. |
| `raw_value` | Text value stored in the DB; parsed based on `value_type`. |
| `value_type` | One of `string`, `int`, `bool`, `json`. Determines how `raw_value` is converted when read. |
| `description` | (Optional) Human-readable context for admins. |
| `is_active` | Soft toggle. Inactive entries remain in the DB but are removed from the cache. |

Parsing is implemented in `remote_config.models.RemoteConfigEntry.parse_value`. Invalid values raise a validation error when saving through the admin or ORM.

## Cache Lifecycle

- The cache is process-local and lives in `remote_config.cache`.
- `remote_config.apps.RemoteConfigConfig.ready()` eagerly loads the cache on startup. If that fails, the cache is rebuilt lazily on first access.
- Saving or deleting a `RemoteConfigEntry` automatically calls `remoteConfigCache.reload()`, so new values propagate without a restart.
- You can call `remote_config.remoteConfigCache.reload()` manually (e.g., in a management command) after bulk updates.

## Reading Config Values

```python
from remote_config import remoteConfigCache

if remoteConfigCache.get("features.reader.new_nav", default=False):
    enable_new_nav()

timeout_seconds = remoteConfigCache.get("search.timeout", default=5)
all_settings = remoteConfigCache.get_all()  # returns a shallow copy of the cached dict
```

Guidelines:

- Always provide a `default` so the code path is deterministic in fresh environments.
- Treat the returned objects as read-only; call `get_all()` if you need to inspect multiple values without risking cache mutation.
- For JSON entries, `get()` returns the parsed Python object (`dict`/`list`).

## Managing Entries

### Through Django admin

1. Visit `/admin/remote_config/remoteconfigentry/`.
2. Create or edit an entry. Validation ensures the value matches the selected `value_type`.
3. Toggle `is_active` to disable a key without deleting it.

### Through the Django shell

```python
from remote_config.models import RemoteConfigEntry, ValueType

RemoteConfigEntry.objects.update_or_create(
    key="features.reader.new_nav",
    defaults={
        "raw_value": "true",
        "value_type": ValueType.BOOL,
        "description": "Rollout flag for the redesigned reader navigation.",
        "is_active": True,
    },
)
```

Bulk scripts should call `remote_config.remoteConfigCache.reload()` after all mutations so that other processes pick up the changes immediately.

## Testing & Local Development

- Tests that rely on specific config values should create the needed entries in the database and then call `remoteConfigCache.reload()` in `setUp()`. See `remote_config/tests/remote_config_test.py` for examples.
- When running locally, you can seed defaults via fixtures or a migration that inserts `RemoteConfigEntry` rows.
- Remember that the cache is process-local: if you change values in one Django shell, you must reload (or restart) other long-running processes (e.g., Celery workers) to see the update.

## Best Practices

- Namespace keys by feature area (`features.reader.*`, `search.*`, `experiments.*`) so they stay organized.
- Store keys in the keys.py file
- Document intent in `description` and in code comments when behavior meaningfully changes.
- Prefer remote config for short-lived toggles or operational switches. Long-term static settings should live in `local_settings.py` or environment variables.
