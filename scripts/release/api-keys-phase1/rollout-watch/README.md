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

R4 and R5 checks (ported 2026-11-26 from the 2026-11-18 staging rehearsal; each takes the environment):

- `r4-replay.py [--env staging|preprod|prod] [--django bearer|open] observe|enforce`: the Library Assistant's
  knn-search request with and without the Bearer and the keys, plus ungated controls; says whether the gateway or
  Django answered. `--django open` once #4160 ships. Keys in `~/.config/sefaria-<env>/r4-keys.env` (`LA_KEY`,
  `MCP_KEY`, `KNN_BEARER` while Django checks it). Reports `/api/%6bnn-search` without judging it.
- `ENV=<env> enforce-watch-tick.sh [minutes]`: one read-only tick after enforce: auth service in enforce and ready,
  gateway denials (staging: Envoy access logs by user agent; preprod and prod, where Envoy access logs are off: the
  auth service's denial count in Prometheus, `ALLOW_DENIALS` for your probes), site flows, the gate itself.
- `r5-check.py`: on a web pod, `R5_HOST=... R5_STAFF_EMAIL=... R5_OTHER_EMAIL=... python manage.py shell < r5-check.py`.
  Staff see Developer Settings, a non-staff account gets 404. Prod has no test accounts: name an existing non-staff
  account, or the non-staff checks are INVALID.
- `r5-lifecycle.py [--env ...] [--domains]`: create, use, website-restrict, revoke and delete a key through the real
  site and gateway, from a session cookie in `~/.config/sefaria-<env>/`. `--domains` once #3942 is live.

Copy the files into a fresh run folder; paths assume the dev server (`~/sefaria/...`) and the cluster contexts
gke_production-deployment_us-east1-b_cluster-1 and gke_development-205018_us-east1-b_cluster-1.
