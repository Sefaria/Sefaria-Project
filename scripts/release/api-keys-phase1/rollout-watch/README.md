# Rollout watch: tick.sh, verify.sh and the monitor brief

Used for the API keys phase 1 rollout to preprod and prod (2026-11-23/24). The run record and the criteria are in the
Sefaria wiki: projects/api-key-program/run-2026-11-24-phase1-preprod-prod-deploy and
projects/api-key-program/auth-service-behaviour-criteria.

- `tick.sh`: one read-only health tick of prod and preprod (HelmReleases, web pods, auth state against the live
  HelmRelease spec, staging auth, page probes, gateway 5xx from Envoy's counters in Prometheus). Exit 0 OK, 2 ALARM,
  1 INVALID. Writes ticks/<utc>.json next to itself.
- `verify.sh <stage|Vnn>`: the verification items, one function each, PASS/FAIL/INVALID with evidence. Stages: pre,
  post, soak, prod-pre, prod-post; `TARGET=prod` points post/soak items at prod. Reads ALERTS.md, ACKED.md and
  TIMELINE.md from its own folder.
- `MONITOR.md`: the brief a Haiku session follows on `/loop 5m` in a herdr pane (read-only; writes TIMELINE.md and
  ALERTS.md; the lead watches ALERTS.md).

Copy the three files into a fresh run folder; paths assume the dev server (`~/sefaria/...`) and the cluster contexts
gke_production-deployment_us-east1-b_cluster-1 and gke_development-205018_us-east1-b_cluster-1.
