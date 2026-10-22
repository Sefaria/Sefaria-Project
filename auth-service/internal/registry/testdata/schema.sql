-- Test fixture only. Mirrors the tables and NOTIFY triggers that the Django models and migrations in powered_by/
-- create in sefaria_auth; Django owns the real schema. powered_by_project is reduced to the columns the auth service
-- reads plus a name. Keep powered_by_apikey and the triggers identical to the Django migration.
CREATE TABLE powered_by_project (
  id           serial PRIMARY KEY,
  project_name varchar(255) NOT NULL DEFAULT '',
  tier         varchar(20) NOT NULL DEFAULT 'developer',
  deleted_at   timestamptz
);
CREATE TABLE powered_by_apikey (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key             varchar(100) NOT NULL UNIQUE,
  project_id      integer NOT NULL REFERENCES powered_by_project(id),
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
