-- Local stand-in for auth-service/scripts/provision-cluster-registry.sh: the same role, read-only sessions and
-- column-level grants, so a load-query column without a GRANT fails here as it would on the cluster.
-- Idempotent. Run in sefaria_auth as a superuser, after the Django migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'auth_service_reader') THEN
    CREATE ROLE auth_service_reader LOGIN PASSWORD 'reader';
  END IF;
END
$$;
ALTER ROLE auth_service_reader SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE sefaria_auth TO auth_service_reader;
GRANT USAGE ON SCHEMA public TO auth_service_reader;
GRANT SELECT (id, tier, deleted_at) ON powered_by_project TO auth_service_reader;
GRANT SELECT (id, key, project_id, label, allowed_origins, revoked_at) ON powered_by_apikey TO auth_service_reader;
GRANT SELECT (id, tier_id, deleted_at) ON api_project TO auth_service_reader;
GRANT SELECT (id, per_minute_per_project) ON api_tier TO auth_service_reader;
GRANT SELECT (tier_id, meter, monthly_per_project) ON api_tier_meter_limit TO auth_service_reader;

-- Accounts created through the UI start above the real Mongo profiles and the fixture band.
DO $$
BEGIN
  IF (SELECT last_value FROM auth_user_id_seq) < 2100000000 THEN
    ALTER SEQUENCE auth_user_id_seq RESTART WITH 2100000000;
  END IF;
END
$$;
