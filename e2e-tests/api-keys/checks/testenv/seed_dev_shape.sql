-- Dev-shape fixture for the API-key migration round trip (run-checks.sh migrations --seed).
-- Load on a database migrated to powered_by 0005 (the key table has no tier column yet).
-- Plain SQL with explicit ids; never run against the shared dev database.
--
-- Shape: one owner account; ownerless formstack listings; an owner with keys; an owner without keys;
-- a partner project with two keys (one revoked); a soft-deleted project with a revoked key; a private
-- developer_settings project; a claimed legacy listing; a mock row; and a project whose legacy tier is
-- 'gold', which the backfill must normalise to developer without aborting.

BEGIN;

INSERT INTO auth_user (id, password, last_login, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined)
VALUES (9001, '!seed', now(), false, 'seed-owner', 'Seed', 'Owner', 'seed-owner@example.invalid', false, true, now());

INSERT INTO powered_by_project (
  id, submission_source, creator, creator_email, submitter, is_developer, job_title, found_sefaria,
  sefaria_tools_used, tech_used_raw, technical_experience, vibe_coded, project_why, project_name,
  project_link, project_reach, project_desc, project_category, has_pbs_logo, tags, status, is_buggy,
  consent_to_display, is_published, featured, created_at, updated_at, organization, tier, owner_id,
  consent_withdrawn_at, deleted_at, notes
) VALUES
  (9101, 'formstack', '', '', '', false, '', '', '[]', '', '', false, '', 'Ownerless listing A',
   '', '', '', '', false, '[]', 'unknown', false, true, true, false, now(), now(), '', 'developer', NULL, NULL, NULL, NULL),
  (9102, 'formstack', '', '', '', false, '', '', '[]', '', '', false, '', 'Ownerless listing B',
   '', '', '', '', false, '[]', 'unknown', false, true, true, false, now(), now(), '', 'developer', NULL, NULL, NULL, NULL),
  (9103, 'formstack', '', '', '', false, '', '', '[]', '', '', false, '', 'Ownerless listing C',
   '', '', '', '', false, '[]', 'unknown', false, true, true, false, now(), now(), '', 'developer', NULL, NULL, NULL, NULL),
  (9104, 'developer_settings', '', '', '', false, '', '', '[]', '', '', false, '', 'Owner with keys',
   '', '', '', '', false, '[]', 'unknown', false, false, true, false, now(), now(), '', 'developer', 9001, NULL, NULL, NULL),
  (9105, 'developer_settings', '', '', '', false, '', '', '[]', '', '', false, '', 'Owner without keys',
   '', '', '', '', false, '[]', 'unknown', false, false, true, false, now(), now(), '', 'developer', 9001, NULL, NULL, NULL),
  (9106, 'developer_settings', '', '', '', false, '', '', '[]', '', '', false, '', 'Partner project',
   '', '', '', '', false, '[]', 'unknown', false, false, true, false, now(), now(), '', 'partner', 9001, NULL, NULL, NULL),
  (9107, 'developer_settings', '', '', '', false, '', '', '[]', '', '', false, '', 'Soft-deleted project',
   '', '', '', '', false, '[]', 'unknown', false, false, true, false, now(), now(), '', 'developer', 9001, NULL, now(), NULL),
  (9108, 'developer_settings', '', '', '', false, '', '', '[]', '', '', false, '', 'Private developer settings project',
   '', '', '', '', false, '[]', 'unknown', false, false, false, false, now(), now(), '', 'developer', 9001, NULL, NULL, NULL),
  (9109, 'formstack', '', '', '', false, '', '', '[]', '', '', false, '', 'Claimed legacy listing',
   '', '', '', '', false, '[]', 'unknown', false, true, true, false, now(), now(), '', 'developer', 9001, NULL, NULL, NULL),
  (9110, 'manual', '', '', '', false, '', '', '[]', '', '', false, '', 'Mock row',
   '', '', '', '', false, '[]', 'unknown', false, false, false, false, now(), now(), '', 'developer', NULL, NULL, NULL,
   'Created by the developer settings test controls.'),
  (9111, 'developer_settings', '', '', '', false, '', '', '[]', '', '', false, '', 'Legacy gold tier project',
   '', '', '', '', false, '[]', 'unknown', false, false, true, false, now(), now(), '', 'gold', NULL, NULL, NULL, NULL);

INSERT INTO powered_by_apikey (id, key, label, allowed_origins, created_at, revoked_at, last_used_at, project_id) VALUES
  ('00000000-0000-4000-8000-000000009104', 'sfr_seed_owner_live', 'Owner key', '[]', now(), NULL, NULL, 9104),
  ('00000000-0000-4000-8000-000000009114', 'sfr_seed_owner_second', 'Owner second key', '[]', now(), NULL, NULL, 9104),
  ('00000000-0000-4000-8000-000000009106', 'sfr_seed_partner_live', 'Partner live key', '[]', now(), NULL, NULL, 9106),
  ('00000000-0000-4000-8000-000000009116', 'sfr_seed_partner_revoked', 'Partner revoked key', '[]', now(), now(), NULL, 9106),
  ('00000000-0000-4000-8000-000000009107', 'sfr_seed_deleted_revoked', 'Deleted project key', '[]', now(), now(), NULL, 9107),
  ('00000000-0000-4000-8000-000000009109', 'sfr_seed_legacy_live', 'Legacy claimed key', '[]', now(), NULL, NULL, 9109),
  ('00000000-0000-4000-8000-000000009110', 'sfr_seed_mock_live', 'Mock key', '[]', now(), NULL, NULL, 9110),
  ('00000000-0000-4000-8000-000000009111', 'sfr_seed_gold_live', 'Gold tier key', '[]', now(), NULL, NULL, 9111);

-- Keep the identity sequences ahead of the explicit ids, so later inserts in this database do not collide.
SELECT setval(pg_get_serial_sequence('auth_user', 'id'), (SELECT max(id) FROM auth_user));
SELECT setval(pg_get_serial_sequence('powered_by_project', 'id'), (SELECT max(id) FROM powered_by_project));

COMMIT;
