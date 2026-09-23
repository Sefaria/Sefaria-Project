# Trend
> Source: `sefaria/model/trend.py`

## Purpose
Computes and stores per-user and site-wide behavioral traits (language preference, category reading counts, sheet usage, schedule adherence) derived from `user_history` aggregation pipelines. These traits power the story/notification targeting system by providing session-level trait checks (e.g. "readsHebrew", "usesSheets") and the user-stats / site-stats API responses.

## Key Classes

### DateRange
- **Inherits**: `object`
- **Collection**: N/A (pure helper)
- **Role**: Represents a time window used to scope MongoDB aggregation queries. Provides factory methods for common periods and generates `$gte`/`$lte` clauses.
- **Key fields**: `start` (datetime|None), `end` (datetime|None), `key` (string identifier like `"alltime"`, `"currently"`, `"this_hebrew_year"`)
- **Key methods**:
  - `update_match(match_clause, field="datetime")` -- mutates a mongo query dict in-place to add the time constraint; returns the dict for chaining
  - `alltime()` / `currently()` -- class-level factories; `currently` means trailing 365 days
  - `this_hebrew_year()` / `previous_hebrew_year()` -- use a hardcoded Rosh Hashana lookup table (`new_years_dict`); will KeyError if the current year is outside the table range (currently covers 2020-2028)

### Trend
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `trend`
- **Role**: Single computed trait value for a user or for the whole site, within a given period.
- **Key fields**: `name` (trait name string), `value` (numeric or bool), `datatype` (`"int"`, `"float"`, `"bool"`), `period` (DateRange key), `scope` (`"user"` | `"site"`), `uid` (required when scope != `"site"`)
- **Key methods**:
  - `get_user_trend_value(uid, name, period="alltime", default=0)` -- classmethod; loads a single trend or returns default

### TrendSet
- **Inherits**: `AbstractMongoSet`
- **Collection**: `trend`
- **Role**: Query wrapper over multiple `Trend` records. Heavily used with `.delete()` to clear stale trends before recomputation.

### TrendFactory / EnglishToleranceFactory / HebrewAbilityFactory
- **Inherits**: `object`
- **Collection**: N/A
- **Role**: Stub/skeleton for a planned factory pattern. Currently unused -- actual trait computation lives in the module-level `set*Traits()` functions. Marked with "Needs thought / refactor" comment.

### DateRefRange
- **Inherits**: `object`
- **Collection**: N/A
- **Role**: Pairs a `Ref` range with a `DateRange` to check whether a user's reading history entry falls within a schedule window (e.g. weekly parasha).

### ScheduleManager / ParashaScheduleManager
- **Inherits**: `object` / `ScheduleManager`
- **Collection**: N/A
- **Role**: Determines if a user is following a learning schedule (currently only Parasha) by checking whether enough of their `user_history` entries land in the correct ref+date buckets. Saves a boolean `Trend` when a match is found.
- **Key methods**:
  - `getUsersWhoAreLearningSchedule()` -- iterates user histories, walks through `dateRefRanges` in order, saves a `Trend` with `value=True` for qualifying users
  - `ParashaScheduleManager.createDateRefRanges()` -- queries `db.parshiot` for recent parasha dates and builds ref+date buckets with configurable variance windows

## Non-Obvious Patterns

- **Delete-then-reinsert pattern**: Every `set*Traits()` function deletes all existing trends of its type via `TrendSet(...).delete()` before recomputing and saving. This is a full replace, not an upsert.
- **`update_match` mutates its argument**: `DateRange.update_match()` both mutates the dict passed in AND returns it, so it can be used inline inside pipeline stages. This is the standard call pattern throughout the file.
- **`read_in_category_key` / `reverse_read_in_category_key`**: Trait names for category reading are prefixed with `"ReadInCategory"` (e.g. `"ReadInCategoryTalmud"`). The reverse function strips the first 14 chars. These are used as keys in both the `trend` collection and in API responses.
- **HebrewAbility formula**: Uses a saturating function `1.1 * (het / (0.1 + het))` where `het` is the fraction of Hebrew-only page views. This asymptotically approaches 1.1 (capped implicitly) and rises steeply for small Hebrew usage fractions.
- **`active_dateranges`**: Module-level list `[DateRange.alltime(), DateRange.currently()]` controls which periods get computed. Hebrew-year ranges are defined but not included in this list.
- **Hardcoded Rosh Hashana dates**: `DateRange.new_years_dict` must be manually extended; currently covers through 2028.

## Relationships

- **`user_history` collection**: All aggregation pipelines read from `db.user_history`. This is populated by `UserHistory` / `UserHistorySet` in `user_profile.py`.
- **`db.sheets`**: `getAllUsersSheetCreation` aggregates from the sheets collection.
- **`db.parshiot`**: `ParashaScheduleManager` reads parasha schedule data.
- **`user_profile.py`**: `get_session_traits()` is called with request context to produce trait keys for story targeting. `user_stats_data()` calls `public_user_data()` and `UserHistorySet`.
- **`story.py`**: `user_stats_data()` imports `Story` for sheet/publisher metadata.
- **`text.py` / `library`**: Used for `get_top_categories()` and `Ref` operations.

## Common Tasks

- **Recompute all trends**: Call `setAllTrends()`. Pass `skip=["schedule"]` etc. to skip slow steps.
- **Get a user's trait value**: `Trend.get_user_trend_value(uid, "HebrewAbility")` -- returns float, default 0.
- **Get session traits for story targeting**: `get_session_traits(request, uid=uid)` -- returns list of trait key strings.
- **Get user stats for the stats API**: `user_stats_data(uid)` -- returns dict with per-period reading stats, popular sheets, most-viewed refs.
- **Get site-wide category reading stats**: `site_stats_data()` -- returns dict keyed by period with category read counts.
- **Add a new trait**: Write a `set*Traits()` function that aggregates from `user_history`, deletes old trends, and saves new `Trend` records. Add its name to `setAllTrends()`.
