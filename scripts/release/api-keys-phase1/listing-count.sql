-- listing-count.sql: Powered by projects listed publicly today, and how many the phase 1 listing filter hides.
--
-- Read-only. Run through listing-count.sh (it sets :refusals), or by hand:
--   psql -X -At -F $'\t' -v refusals="('name', 'link'), ..." -f listing-count.sql <database>
--
-- What changes at the merge (powered_by/views.py, powered_by_api GET for a non-staff caller):
--   before: is_published
--   after:  is_published AND NOT request_not_to_publish AND deleted_at IS NULL, no live internal/mcp API project, and a
--           developer-settings profile only while it has a live API project.
-- Before the phase 1 migrations no row has deleted_at, an API project or a developer_settings source, so only
-- request_not_to_publish can hide a listed row. On a database where master's 0003_request_not_to_publish has not run
-- yet (consent_to_display still exists), that migration marks the explicit refusals passed in :refusals.
--
-- Output lines: summary<TAB>mode<TAB>listed_now<TAB>hidden_after_merge<TAB>listed_after_merge
--               hidden<TAB>id<TAB>project_name   (one per row the merge hides)
SELECT
    EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'powered_by_project'
            AND column_name = 'request_not_to_publish') AS has_rntp,
    to_regclass('public.api_project') IS NOT NULL AS has_phase1
\gset

\if :has_phase1
-- Phase 1 already migrated: today's listing is the phase 1 filter, and the merge hides nothing more.
WITH listed AS (
    SELECT p.id FROM public.powered_by_project p
    WHERE p.is_published AND NOT p.request_not_to_publish AND p.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.api_project a
                      WHERE a.profile_id = p.id AND a.deleted_at IS NULL AND a.tier_id IN ('internal', 'mcp'))
      AND (p.submission_source <> 'developer_settings'
           OR EXISTS (SELECT 1 FROM public.api_project a WHERE a.profile_id = p.id AND a.deleted_at IS NULL))
)
SELECT 'summary', 'phase1', count(*), 0, count(*) FROM listed;
\elif :has_rntp
-- master's schema: listed = is_published; the merge hides the published rows that asked not to be published.
SELECT 'summary', 'request_not_to_publish',
       count(*) FILTER (WHERE is_published),
       count(*) FILTER (WHERE is_published AND request_not_to_publish),
       count(*) FILTER (WHERE is_published) - count(*) FILTER (WHERE is_published AND request_not_to_publish)
FROM public.powered_by_project;
SELECT 'hidden', id, project_name FROM public.powered_by_project
WHERE is_published AND request_not_to_publish ORDER BY id;
\else
-- Before master's 0003: listed = is_published; 0003 unpublishes the explicit refusals.
SELECT 'summary', 'consent_to_display',
       count(*) FILTER (WHERE is_published),
       count(*) FILTER (WHERE is_published AND (project_name, project_link) IN (:refusals)),
       count(*) FILTER (WHERE is_published)
         - count(*) FILTER (WHERE is_published AND (project_name, project_link) IN (:refusals))
FROM public.powered_by_project;
SELECT 'hidden', id, project_name FROM public.powered_by_project
WHERE is_published AND (project_name, project_link) IN (:refusals) ORDER BY id;
\endif
