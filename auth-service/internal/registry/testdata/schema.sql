-- Test fixture only. Mirrors the tables and NOTIFY triggers that the Django models and migrations in powered_by/
-- create in sefaria_auth; Django owns the real schema. powered_by_project is reduced to the columns the auth service
-- reads (id, name, the legacy tier column it must ignore, deleted_at). Keep these tables and the triggers identical
-- to the Django migration.
CREATE TABLE powered_by_project (
  id           serial PRIMARY KEY,
  project_name varchar(255) NOT NULL DEFAULT '',
  tier         varchar(20) NOT NULL DEFAULT 'developer',
  deleted_at   timestamptz
);
CREATE TABLE api_tier (
  id                     text PRIMARY KEY,
  name                   text NOT NULL DEFAULT '',
  per_minute_per_project int NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO api_tier (id, name, per_minute_per_project) VALUES
  ('developer', 'Developer', 60),
  ('partner', 'Partner', 300),
  ('internal', 'Internal', 6000);
CREATE TABLE api_tier_meter_limit (
  id                  bigserial PRIMARY KEY,
  tier_id             text NOT NULL REFERENCES api_tier(id),
  meter               text NOT NULL,
  monthly_per_project bigint NOT NULL,
  UNIQUE (tier_id, meter)
);
CREATE TABLE api_project (
  id            bigserial PRIMARY KEY,
  profile_id    bigint NOT NULL REFERENCES powered_by_project(id),
  owner_id      int,
  contact_email text,
  tier_id       text NOT NULL DEFAULT 'developer' REFERENCES api_tier(id),
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX api_project_profile_live ON api_project (profile_id) WHERE deleted_at IS NULL;
CREATE TABLE powered_by_apikey (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key             varchar(100) NOT NULL UNIQUE,
  project_id      bigint NOT NULL REFERENCES api_project(id),
  label           varchar(100) NOT NULL,
  allowed_origins jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  last_used_at    timestamptz
);

CREATE OR REPLACE FUNCTION apikeys_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('sefaria_apikeys', json_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'ts', clock_timestamp())::text);
  RETURN NULL;
END $$;
CREATE TRIGGER apikeys_notify_keys_write AFTER INSERT OR DELETE ON powered_by_apikey
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
CREATE TRIGGER apikeys_notify_keys_update AFTER UPDATE ON powered_by_apikey FOR EACH ROW
  WHEN (OLD.key IS DISTINCT FROM NEW.key OR OLD.project_id IS DISTINCT FROM NEW.project_id OR OLD.label IS DISTINCT FROM NEW.label
        OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at OR OLD.allowed_origins IS DISTINCT FROM NEW.allowed_origins)
  EXECUTE FUNCTION apikeys_notify();
CREATE TRIGGER apikeys_notify_projects_update AFTER UPDATE ON powered_by_project FOR EACH ROW
  WHEN (OLD.tier IS DISTINCT FROM NEW.tier OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION apikeys_notify();
CREATE TRIGGER apikeys_notify_projects_delete AFTER DELETE ON powered_by_project
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
-- Added with the API-project tables: the loader reads tier and soft-delete from api_project, and the tier limits
-- from api_tier and api_tier_meter_limit, so changes to those must reach the registry at once too.
CREATE TRIGGER apikeys_notify_api_project_update AFTER UPDATE ON api_project FOR EACH ROW
  WHEN (OLD.tier_id IS DISTINCT FROM NEW.tier_id OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION apikeys_notify();
CREATE TRIGGER apikeys_notify_api_project_delete AFTER DELETE ON api_project
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
CREATE TRIGGER apikeys_notify_api_tier_update AFTER UPDATE ON api_tier FOR EACH ROW
  WHEN (OLD.per_minute_per_project IS DISTINCT FROM NEW.per_minute_per_project)
  EXECUTE FUNCTION apikeys_notify();
CREATE TRIGGER apikeys_notify_tier_limit_write AFTER INSERT OR UPDATE OR DELETE ON api_tier_meter_limit
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
