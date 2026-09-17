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
