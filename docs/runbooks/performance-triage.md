# Performance triage: sefaria.org is slow

How to work out why production is slow, and what to do about it. It's written for whoever is on call and for the
triage agent. Most of it comes from how Lev triaged slowness (2026-10-21) and from the related/Varnish investigation
in November 2026.

Every query below was run against production Datadog when this was written. Field names drift, so if a query
returns nothing, open one matching log or span and check its fields before deciding nothing happened.

## 1. Is it actually slow?

**Thresholds:** API p95 above **1 s** means users feel it. Around **0.2 s** is healthy. Short spikes happen every
day; what matters is a p95 that stays high for several minutes. If a Datadog alert brought you here, §7 says what
it measures.

**Where to look:**

- [GCP "Application health" dashboard](https://console.cloud.google.com/monitoring/dashboards/builder/13696499968715596401?project=production-deployment).
  Main chart: _API Response Time p95 (nginx)_.
  - The y axis is **log scale**, so a small visual jump is a big change.
- Datadog [Application Health Overview](https://us5.datadoghq.com/dashboard/9pv-g5r-6ay). Its p95 comes from
  Django traces (`p95:trace.django.request{service:web}`), not nginx, so it leaves out time spent in nginx and
  Varnish. **Set the `env` variable to `prod`**; it defaults to staging.

**Reading the charts:**

- **Stress often shows as a _drop_ in request count**, not a rise: the servers respond to fewer requests.
- **Web pods are capped at 2 CPU.** A pod at 2 is pinned.
- **Mongo is stressed at about 5 CPU.**
- **Mongo long-running query charts are plotted when a query _finishes_,** so they lag behind the stress.

## 2. Where is the time going?

The request path is **Cloudflare → Envoy → nginx → Varnish → gunicorn (Django, service `web`) → Mongo, Redis,
Postgres**. Find the first layer that's slow.

### Slow endpoints (APM)

In APM Trace Explorer, or with `aggregate_spans`:

```
service:web operation_name:django.request env:production
```

- **Which endpoints cost the most:** group by `resource_name`, sort by **sum of duration**, not count. Sum shows
  what is actually eating the workers.
- **Who is calling one endpoint:** group by `@http.useragent`, then by `@http.client_ip` and
  `@http.referrer_hostname`.
- **The slowest individual requests:** add a duration filter (`@duration:>3s`), sort by duration, and read
  `@http.url`.

### What one slow request did

Open the trace, or group its spans:

```
trace_id:<id>
```

Group by `operation_name` and `@db.mongodb.collection`, and compute count and sum of duration. Hundreds of
`pymongo.cmd` spans in one request means queries inside a loop (see N+1 under §5).

### Mongo slow queries (logs)

```
container_name:mongo "Slow query" @attr.durationMillis:>1000
```

[Open in Log Explorer](https://us5.datadoghq.com/logs?query=container_name%3Amongo%20%22Slow%20query%22%20%40attr.durationMillis%3A%3E1000&cols=host%2C%40attr.durationMillis%2C%40attr.ns%2C%40attr.planSummary%2C%40attr.keysExamined%2C%40attr.docsExamined%2C%40attr.nreturned&viz=stream&stream_sort=desc)
with the columns below. The link carries the query and columns itself, so it doesn't depend on a saved view.

Add these columns: `@attr.durationMillis`, `@attr.ns` (the collection), `@attr.planSummary`,
`@attr.keysExamined`, `@attr.docsExamined`, `@attr.nreturned`, `@attr.numYields`. Open an entry to see the full
command and filter. To read them:

| What you see                                                | What it means                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `planSummary: COLLSCAN`                                     | No index is used: a missing index.                                                              |
| `docsExamined` much larger than `nreturned`                 | The index doesn't match the filter well.                                                        |
| `docsExamined` ≈ `nreturned`, both huge (tens of thousands) | The query is fine; the request asks for too much (e.g. links for a huge range). Fix the caller. |
| A filter with an `$in` of hundreds of values                | Usually a ref expanded to all its segments (e.g. a whole chapter of Psalms).                    |
| High `numYields`                                            | The query is long and keeps yielding to other operations; often a sign of load, not the cause.  |

Group by `@attr.ns` to see which collection is hurting. On 2026-11-16, most queries over 1 s were on
`sefaria.links`.

### Large responses (nginx)

```
service:production-nginx "upstream response is buffered" "/api/"
```

nginx writes a response to disk when it's too big for its buffers. Big API responses (whole books, long ranges)
show up here with the full request URL. Leave out `"/api/"` to also see big static files.

### Varnish

Production Varnish runs a single pod, and every restart empties the cache. Cloudflare doesn't cache `/api/`, so
until the cache refills, all API traffic goes to Django. Background, measurements and the sizing plan are on the
wiki page `areas/engineering/repos/sefaria-project/varnish-oom-sizing-and-gzip`.

**In Datadog.** Varnish metrics come from the `metrics-exporter` sidecar under the `varnish.` prefix (added in
#4018). The list is `varnish.monitoring.datadog.metrics` in `helm-chart/sefaria/values.yaml`. The names below come
from that list; counters may appear in Datadog with a `.count` suffix. If a name doesn't match, search `varnish.`
in Metrics Explorer and fix it here.

| Question                           | Metric                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Did it just restart (cache wiped)? | `varnish.main.uptime` drops; `varnish.mgt.child_died`, `varnish.mgt.child_panic`                                                                                                           |
| Is it about to be OOM-killed?      | `kubernetes.memory.working_set` for the varnish container against its limit. It sat at 94–99% of the limit before each kill in November 2026.                                              |
| Hit rate                           | `varnish.main.cache_hit` / (`cache_hit` + `cache_miss`); also `cache_hitmiss`, `cache_hitpass`, `s_pass`                                                                                   |
| Is storage full?                   | `varnish.sma.g_bytes` and `varnish.sma.g_space` (tag `type:s0` for main storage, `type:transient` for Transient); rising `varnish.main.n_lru_nuked` means objects are evicted to make room |
| Can't make room?                   | `varnish.main.n_lru_limited`, `varnish.sma.c_fail`                                                                                                                                         |
| Backend trouble?                   | `varnish.backend.fail`; `varnish.main.req_dropped`, `varnish.main.threads_limited`                                                                                                         |

The settings that affect memory are in the Helm values: `varnish.gzipJson` (store JSON gzipped) and
`varnish.tuning.transient` (cap Transient storage). Both are off by default. Production values are a devops
change.

**From inside the pod.** Use this when you need something the metrics don't have, such as which URLs miss the
cache (namespace `default`):

```bash
kubectl get pods -n default | grep varnish
kubectl describe pod <varnish-pod> -n default | grep -A8 -E "Last State|Limits|Requests|Restart Count"
kubectl exec -it <varnish-pod> -n default -- bash
```

Inside the pod, `varnishstat -1 -f <field>` shows any of the counters above. To see what's missing the cache,
log misses for a while. Use `nohup` and `timeout`, because an `exec` session can drop and leave the logger
running:

```bash
nohup timeout 1800 varnishncsa -q 'VCL_call eq "MISS"' -F '%b|%U%q|%{User-agent}i' > /tmp/miss.log 2>/dev/null &
pgrep -a varnishncsa      # still running?
wc -l /tmp/miss.log
```

Then sum bytes by URL prefix and by user agent with `awk`. To follow a single URL:

```bash
varnishlog -g request -q 'ReqURL ~ "^/api/related/Genesis"'   # runs until Ctrl-C
```

### Traffic history

`kubectl logs` on the nginx pods only covers seconds at production volume. For hours or days of traffic, use the
BigQuery sink `production-deployment.NginxRequestLogs.stdout_YYYYMMDD` (fields under `httpRequest.*`: `remoteIp`,
`userAgent`, `requestUrl`, `status`, `referer`).

## 3. Profiling a slow path locally

Slow code paths usually come from the code, not the data, so profile them locally. This often gives 10–20×
wins.

1. Run a clean local server with `DEBUG = True`. The profiler only runs in debug mode.
2. Make the first request cold: restart the server and clear the Django cache (the local Redis, if your
   settings use it).
3. Request the endpoint with `?prof=1` (or `&prof=1`) **twice**. The first request is the cold run and the
   second the warm one. `ProfileMiddleware` (`sefaria/system/middleware.py`) returns `cProfile` output instead of
   the page.
4. Read where the time goes. A big gap between cold and warm means the cost is in building caches. Many calls to
   `pymongo` or `Ref` construction usually point to a loop.

## 4. Bot and crawler spikes

1. Ask Datadog Bits AI "what changed between T1 and T2" for the spike window. Bits is good at finding a new user
   agent or IP range. **It tends to report secondary effects as root causes** (e.g. Mongo connections), so check
   whatever it says against the APM queries above.
2. Find the spiking user agent: group `django.request` spans by `@http.useragent`, then by `@http.client_ip` and
   `@http.referrer_hostname`. A spoofed browser user agent shows up as one ordinary Chrome or Firefox string with
   very many IPs, few requests per IP, and almost no static assets.
3. **Check the referer before blocking.** A crawler hitting our API with our own page as referer is our frontend
   rendering for it. Blocking that breaks the page. Only requests with an outside or missing referer are
   candidates.
4. Block or challenge it in Cloudflare (WAF custom rule, **managed challenge**). Trade-off: a challenge also stops
   legitimate API clients (scripts, partner integrations, the mobile apps if the rule is too broad), so scope it
   by path and user agent, and watch for complaints.

## 5. Known failure modes

Check each one; most incidents are one of these.

| Failure mode                                                                          | How to confirm                                                                                                                                               | How to rule out                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Missing Mongo index** (often a new feature's query)                                 | Slow-query log: `COLLSCAN`, or `docsExamined` far above `nreturned`, on one `ns`                                                                             | Slow queries use `IXSCAN` with examined ≈ returned                                                 |
| **Poorly designed query**                                                             | Slow-query log: huge `$in` lists, huge `nreturned`, regex filters, sorts without an index                                                                    | Slow queries are small and selective                                                               |
| **Mongo queries inside a (nested) loop (N+1)**                                        | One trace has hundreds of `pymongo.cmd` spans for the same collection; profiling locally shows many `pymongo` calls                                          | Few Mongo spans per request                                                                        |
| **Heavy requests** (whole books, long ranges, junk refs that resolve to a whole book) | Top endpoints by sum of duration; nginx "upstream response is buffered" warnings with `/api/` URLs                                                           | Slow requests are ordinary sizes                                                                   |
| **Varnish full, OOM-killed or restarted**                                             | `varnish.main.uptime` drops; working set near the limit; `varnish.main.n_lru_nuked` rising; hit rate low. `kubectl describe` shows `OOMKilled` in Last State | Uptime of days, working set well below the limit, hit rate normal                                  |
| **Mongo connection exhaustion** (usually a _symptom_, e.g. of a slow `/api/related`)  | `container_name:mongo "Connection accepted"` and chart `@attr.connectionCount` (a quiet sample on 2026-11-16: 422)                                           | Connection count flat. If it's high, look for the slow endpoint holding connections, not at Mongo. |
| **Django ↔ Node round trips** (server-side rendering)                                 | Slow outgoing HTTP spans from `web` to the Node SSR service in the traces of page requests (not yet checked against a real trace)                            | Page traces spend their time in Django or Mongo                                                    |
| **`user_history` collection**                                                         | Slow-query log grouped by `@attr.ns` shows `sefaria.user_history`; `pymongo.cmd` spans with `user_history` in the resource                                   | Not in the slow-query list                                                                         |
| **Bot spike**                                                                         | §4: one user agent or IP range jumps in request count                                                                                                        | Traffic mix unchanged                                                                              |
| **Web pods CPU-throttled** (a heavy client or a pod restart, §7)                      | Throttled / all CFS periods for `production-web` near 100%; every endpoint slows alike (the 2026-11-18 incident)                                             | Throttling under ~50%, slowness limited to a few endpoints                                         |

## 6. After the incident

- Write down what happened, how you found it, and what fixed it (Shortcut story or incident page).
- If you found a new failure mode, or a step here was wrong, update this runbook.

## 7. Alerts

Two Datadog monitors watch production web. Monitors aren't kept in code, so the definitions below are the source:
create or update them in Datadog from here, and change this section when you change them.

**Routing.** The monitors don't name a person or a channel. They carry the tag `team:platform-perf`, and a Datadog
[monitor notification rule](https://docs.datadoghq.com/monitors/notify/notification_rules/) for that tag decides
who is notified. To change the recipient, edit the rule, not the monitors. The Datadog Slack app isn't installed, so
the rule sends email; to get alerts in Slack, use a Slack email-forwarding address (a personal one lands as a
Slackbot DM, or a channel's address). Each message also notifies `@webhook-polylane`, like the other monitors, so
the triage agent gets every alert.

### Django p95 latency

The p95 here is Django's (`trace.django.request`), not nginx's. It only counts requests that missed Varnish, so it
runs higher than the 1 s threshold in §1: Django p95 is above 1 s at most daily peaks. Back-test over 30 days to
2026-11-19 (5-minute p95, condition held for the whole window):

| p95 above | 5 min | 15 min | 30 min |
| --------- | ----- | ------ | ------ |
| 1 s       | 496   | 145    | 63     |
| 2 s       | 62    | 15     | 5      |
| 3 s       | 22    | 2      | 0      |

Warning at 2 s, critical at 3 s, over 15 minutes: roughly every three days, and twice a month.

```json
{
  "name": "[prod web] Django p95 latency high",
  "type": "query alert",
  "query": "percentile(last_15m):p95:trace.django.request{env:production,service:web} > 3",
  "message": "Django p95 latency on prod web has been above {{threshold}}s for 15 minutes (now {{value}}s).\n\nTriage: https://github.com/Sefaria/Sefaria-Project/blob/master/docs/runbooks/performance-triage.md\nDashboard: https://us5.datadoghq.com/dashboard/9pv-g5r-6ay\n\n@webhook-polylane",
  "tags": ["team:platform-perf", "service:web", "env:production", "alert:latency"],
  "priority": 2,
  "options": {
    "thresholds": { "critical": 3, "warning": 2, "critical_recovery": 2.5, "warning_recovery": 1.5 },
    "notify_no_data": false,
    "require_full_window": false,
    "renotify_interval": 60,
    "include_tags": true
  }
}
```

### Web CPU throttling

The web pods run 3 gunicorn workers under a 2-core limit, so they hit the limit at daily peaks. Near 100%
throttling slows every request (§5). This alert gives warning before latency does. Back-test over the same 30 days:

| Throttled above | 15 min | 30 min |
| --------------- | ------ | ------ |
| 70%             | 39     | 10     |
| 80%             | 19     | 3      |
| 90%             | 5      | 2      |

At 90% for 15 minutes it fired on 3 days, one of them the 2026-11-18 incident.

```json
{
  "name": "[prod web] CPU throttling high",
  "type": "query alert",
  "query": "min(last_15m):sum:kubernetes.cpu.cfs.throttled.periods{kube_deployment:production-web,kube_container_name:web}.as_rate() / sum:kubernetes.cpu.cfs.periods{kube_deployment:production-web,kube_container_name:web}.as_rate() > 0.9",
  "message": "Prod web pods have been CPU-throttled in more than 90% of CFS periods for 15 minutes. Requests slow down across all endpoints. Look for a heavy client (Cloudflare analytics by user agent / ASN) or a pod restart.\n\nTriage: https://github.com/Sefaria/Sefaria-Project/blob/master/docs/runbooks/performance-triage.md\n\n@webhook-polylane",
  "tags": ["team:platform-perf", "service:web", "env:production", "alert:capacity"],
  "priority": 3,
  "options": {
    "thresholds": { "critical": 0.9, "critical_recovery": 0.7 },
    "notify_no_data": false,
    "require_full_window": true,
    "renotify_interval": 60,
    "include_tags": true
  }
}
```

Both definitions pass Datadog's monitor validation. Tune the thresholds after two weeks of real alerts.
