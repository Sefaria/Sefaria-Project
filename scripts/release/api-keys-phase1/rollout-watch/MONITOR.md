# Monitor brief: preprod auth service observe (promotion #4142), 2026-11-24

Goal: watch preprod, prod and staging while #4142 (master -> preprod) turns the auth service on in preprod in observe mode,
and tell the lead at once when anything alarms. You are READ-ONLY: never merge, restart, roll back, scale, suspend,
exec into a pod, edit tick.sh or expect.env, or write to any database or repo. The only files you write are in this folder:
TIMELINE.md, ALERTS.md, SUMMARY.md.

Every tick:
1. Run `~/sefaria/deploy-runs/phase1-prod-2026-11-23/tick.sh`. It is the judge: exit 0 OK, 2 ALARM, 1 INVALID.
   Do not judge anything yourself; only the exit code and its ALARM/INVALID lines count.
2. Append ONE line to `TIMELINE.md`: `<UTC time> <OK|ALARM|INVALID> preprod: <web ready, tag> <auth line> | prod: <web ready, tag> <auth want> | <preprod 5xx %> <prod 5xx %>`.
3. Phases. Write a `PHASE` line in TIMELINE.md the first tick each becomes true, with the evidence line:
   - M1 preprod HelmRelease chart changed from 0.95.1-preprod.2
   - M2 `auth preprod want=observe` appears
   - M3 `ok auth preprod want=observe` (auth pod ready, SecurityPolicy present, unknown key still served 200)
   - M4 preprod web pods all on the new tag and Ready
   Prod promotion (#4143, merged 11:37 UTC): same idea for prod, each written once:
   - P1 prod HelmRelease chart changed from 0.95.1-prod.1
   - P2 `auth default want=observe` appears
   - P3 `ok auth default want=observe` (2 auth pods ready, SecurityPolicy present, unknown key served 200)
   - P4 prod web pods all on the new tag (not v7.17.4-prod.1) and Ready
   After P4, keep ticking for 60 minutes; prod web pods OOMKilled now and then is the known baseline.
4. On exit 2, or two INVALID in a row: wait 60 seconds and run tick.sh once more. If it still is not exit 0, append the
   ALARM/INVALID lines verbatim to `ALERTS.md` with the UTC time (the lead watches that file), then run
   `herdr notification create --title "preprod auth monitor ALARM" --body "<first ALARM line>"` (ignore it if that fails).
   Do not interpret, do not suggest fixes.
5. Known, NOT alarms (tick.sh already ignores them): a `info auth ... rollout in progress?` line; about one minute of 503s
   while a single web pod restarts (the retry in step 4 covers it); prod web pods OOMKilled about once a day; `/` answers
   302 from Israel. Baseline 5xx 2026-11-24 07:39 UTC: prod 0.09%, preprod 0%.
6. Interval: the lead starts you with `/loop 5m`. Keep going until the lead says stop, or 60 minutes after M4 with no
   ALERTS entry since M4. Then write SUMMARY.md (ticks run, alarms, phase times) and stop the loop.
