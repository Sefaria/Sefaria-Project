CREATE TABLE IF NOT EXISTS projects (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  tier            text NOT NULL DEFAULT 'developer',
  allowed_origins text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,
  project_id   text NOT NULL REFERENCES projects(id),
  label        text NOT NULL DEFAULT 'Default key',
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS api_keys_project_idx ON api_keys(project_id);

-- Change broadcast: every committed change to key identity, revocation, tier or origins sends one NOTIFY on
-- 'sefaria_apikeys', whoever the writer is. Auth services LISTEN and reload the full set. The payload is table + op +
-- time only, never a key. A NOTIFY takes a cluster-wide lock at commit on this shared server, so the triggers are
-- statement-level and never fire on bookkeeping columns such as last_used_at.
CREATE OR REPLACE FUNCTION apikeys_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('sefaria_apikeys', json_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'ts', clock_timestamp())::text);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS apikeys_notify_keys ON api_keys;
CREATE TRIGGER apikeys_notify_keys AFTER INSERT OR DELETE OR UPDATE OF key, project_id, label, revoked_at ON api_keys
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
DROP TRIGGER IF EXISTS apikeys_notify_projects ON projects;
CREATE TRIGGER apikeys_notify_projects AFTER DELETE OR UPDATE OF tier, allowed_origins ON projects
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
