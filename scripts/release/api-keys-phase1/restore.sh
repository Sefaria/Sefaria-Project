#!/usr/bin/env bash
# restore.sh: put an environment back to a snapshot taken by snapshot.sh.
#
#   restore.sh chart --snapshot DIR --env E --context C [--repo DIR] [--execute]
#       Normal path. Prints the redeploy of the snapshot's release tag (trigger-infra-deploy.yml) and, with --execute,
#       creates a local branch off origin/<env branch> whose envs/<env>/helmrelease.yaml equals the snapshot's, then
#       prints the push and gh pr commands. Never pushes, never runs gh.
#   restore.sh chart --snapshot DIR --env E --context C --emergency [--execute]
#       Emergency path: suspend the HelmRelease, helm rollback to the snapshot's revision, check every Rollout's images
#       against the snapshot. Runs only with --execute and the env name typed back.
#   restore.sh db --snapshot DIR --env E --context C --scoped [--execute]
#       Puts sefaria_auth's powered_by tables, the phase 1 tables and the powered_by django_migrations rows back to the
#       snapshot, in one transaction, after a fresh dump. Refuses while a pod of any env sharing the database runs an
#       image other than the snapshot's, and unless a maintenance fence is in place (below). Verifies schema and row
#       checksums afterwards.
#       The fence, checked before the dump, again right before the change, and partly inside the transaction: every
#       sharing env's HelmRelease is suspended (Flux cannot re-apply anything), no controller (Rollout, Deployment,
#       StatefulSet, DaemonSet) has a pod template on another web image (it could start such pods at any time, scaled to
#       zero or not), no CronJob that runs the web image is unsuspended, no Job of it is active, no pod runs another web
#       image, and no other session writes the scoped tables (locks held, and no writes in a short window; inside the
#       transaction the tables are locked ACCESS EXCLUSIVE first and queued writers abort it). Refuses with the list
#       of what is still live.
#   restore.sh db --snapshot DIR --env E --full
#       Prints the manual full-database procedure and refuses to run it.
#   restore.sh resume --snapshot DIR --env E --context C
#       Read-only. Prints the `flux resume hr` command only when the env's Flux GitRepository is pinned to the snapshot's
#       release tag and has fetched it (the emergency path ends with the same check); otherwise prints why and exits 1.
#
# Without --execute nothing changes (dry run).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

[[ $# -ge 1 ]] || usage 1
MODE="$1"
shift
[[ "$MODE" == chart || "$MODE" == db || "$MODE" == resume ]] || { [[ "$MODE" == -h || "$MODE" == --help ]] && usage 0; usage 1; }

SNAP="" ENV="" CTX="" REPO="" EXECUTE=0 EMERGENCY=0 SCOPED=0 FULL=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot) SNAP="$2"; shift 2 ;;
    --env) ENV="$2"; shift 2 ;;
    --context) CTX="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --emergency) EMERGENCY=1; shift ;;
    --scoped) SCOPED=1; shift ;;
    --full) FULL=1; shift ;;
    --pg-user) PG_USER="$2"; shift 2 ;;
    --execute) EXECUTE=1; shift ;;
    -h | --help) usage 0 ;;
    *) log "unknown argument: $1"; usage 1 ;;
  esac
done

if [[ "$MODE" == db && "$FULL" == 1 ]]; then
  cat <<'TEXT'
restore.sh db --full is not automated, on purpose.

sefaria_auth is the whole Django database of preprod and prod: users, sessions, allauth and social accounts,
email addresses, admin log, Powered by and everything else. A full restore of the snapshot dump throws away every
account, password change, session and edit written since the snapshot, in both environments. The phase 1 migrations
only add tables and columns, old code runs on the new schema, and `restore.sh db --scoped` puts the powered_by part back
exactly. Use that.

If a full restore is still decided (an incident call with the DB owner, not a script), the procedure is:
  1. Stop writers: scale web, tasks and cron workloads of preprod AND prod to 0 (both use sefaria_auth), or put the
     site in maintenance (localSettings.DOWN_FOR_MAINTENANCE through a promotion).
  2. Take a fresh dump: kubectl exec -n default postgres-18-0 -c postgres-18 -- pg_dump --format=c sefaria_auth > now.dump
  3. Restore into a NEW database next to the old one (never over it):
       createdb sefaria_auth_restore; pg_restore --no-owner? (keep owners) -d sefaria_auth_restore <snapshot>/db/sefaria_auth.dump
  4. Reconcile what was written since the snapshot (auth_user, socialaccount_*, account_emailaddress, ...) from now.dump.
  5. Swap names in one transaction (ALTER DATABASE ... RENAME), restart the workloads, verify, keep the old database
     until the DB owner signs off.
TEXT
  die "refusing to run a full-database restore"
fi

need kubectl git "$PYTHON"
# Dumps and restore SQL hold database content (password hashes, sessions, API keys): private files only.
umask 077
[[ -z "$ENV" ]] || check_context "$ENV" "$CTX"
[[ -n "$SNAP" && -f "$SNAP/manifest.json" ]] || die "--snapshot must be a snapshot directory with manifest.json"
MANIFEST="$SNAP/manifest.json"
mget() { "$PYTHON" "$RELEASE_PY" manifest-get "$MANIFEST" "$1"; }
SNAP_ENV="$(mget env)"
[[ -n "$ENV" ]] || ENV="$SNAP_ENV"
check_context "$ENV" "$CTX"
SHARING="$(env_sharing "$ENV")"
DB="$(env_db "$ENV")"
[[ "$(mget database.name)" == "$DB" ]] || die "the snapshot is of database $(mget database.name), not $DB"
echo " $(mget sharing_envs | tr -d '[]",') " | grep -q " $ENV " || die "the snapshot does not cover $ENV"
PG_NS="$(mget postgres.namespace)" PG_POD="$(mget postgres.pod)" PG_CONTAINER="$(mget postgres.container)"
TAB="$(printf '\t')"
NS="$(env_namespace "$ENV")"
HR="$(env_hr "$ENV")"

# ---------------------------------------------------------------------------------------------------------------
# chart
# ---------------------------------------------------------------------------------------------------------------
chart_normal() {
  REPO="${REPO:-$(git -C "$RELEASE_DIR" rev-parse --show-toplevel)}"
  local tag branch content_file rb
  tag="$(mget "envs.$ENV.release_tag" || true)"
  branch="$(env_branch "$ENV")"
  content_file="$SNAP/envfiles/$ENV.deployed.helmrelease.yaml"
  [[ -f "$content_file" ]] || content_file="$SNAP/envfiles/$ENV.branch.helmrelease.yaml"
  [[ -f "$content_file" ]] || die "the snapshot holds no env file for $ENV"
  rb="rollback/api-keys-phase1-$ENV-$(mget created_at | tr 'A-Z' 'a-z')"

  step "chart rollback of $ENV through the promotion path"
  if [[ -n "$tag" ]]; then
    if git -C "$REPO" rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
      if git -C "$REPO" show "refs/tags/$tag:envs/$ENV/helmrelease.yaml" | cmp -s - "$content_file"; then
        log "  release tag $tag exists and its env file equals the snapshot's"
      else
        log "WARNING: envs/$ENV/helmrelease.yaml at $tag differs from the snapshot's copy"
      fi
    else
      log "WARNING: release tag $tag is not in $REPO (git fetch --tags origin)"
    fi
  fi
  if [[ "$EXECUTE" == 1 ]]; then
    git -C "$REPO" rev-parse -q --verify "refs/remotes/origin/$branch" >/dev/null || die "origin/$branch is not in $REPO"
    git -C "$REPO" rev-parse -q --verify "refs/heads/$rb" >/dev/null && die "branch $rb exists already"
    local wt
    wt="$(mktemp -d)"
    git -C "$REPO" worktree add -q -b "$rb" "$wt" "origin/$branch"
    cp "$content_file" "$wt/envs/$ENV/helmrelease.yaml"
    if git -C "$wt" diff --quiet; then
      log "  origin/$branch already carries the snapshot's env file; branch $rb has no change"
    else
      git -C "$wt" add "envs/$ENV/helmrelease.yaml"
      git -C "$wt" -c core.hooksPath=/dev/null commit -q -m "revert($ENV): env file back to the snapshot of $(mget created_at)

Release tag at the snapshot: ${tag:-unknown}. Prepared by scripts/release/api-keys-phase1/restore.sh chart."
      log "  committed envs/$ENV/helmrelease.yaml on local branch $rb ($(git -C "$wt" rev-parse --short HEAD))"
    fi
    git -C "$REPO" worktree remove --force "$wt"
  else
    log "  would create local branch $rb off origin/$branch with envs/$ENV/helmrelease.yaml = $content_file"
  fi
  cat <<TEXT

Next steps (run by a person; this script pushes nothing):
 1. Redeploy the snapshot's release now. The infrastructure repo's GitRepository for $ENV goes back to the tag and Flux
    applies it within its 5 minute interval:
      gh workflow run trigger-infra-deploy.yml -R Sefaria/Sefaria-Project --ref master -f tag=${tag:-<release tag>}
TEXT
  if [[ "$ENV" == staging ]]; then
    cat <<'TEXT'
    NOTE: trigger-infra-deploy.yml accepts only prod, preprod, qa and dev tag prefixes, so a staging/ tag is rejected.
    For staging, revert on master (step 3) and let deploy-static release it, or have infrastructure edit
    dev/cluster-1/spec/staging/staging-repo.yaml.
TEXT
  fi
  cat <<TEXT
 2. Keep the $branch branch truthful (the env file deployed matches the branch):
      git -C $REPO push origin $rb
      gh pr create -R Sefaria/Sefaria-Project --base $branch --head $rb \\
        --title "revert($ENV): env file back to the API keys phase 1 snapshot" \\
        --body "Rolls envs/$ENV/helmrelease.yaml back to release ${tag:-unknown} (snapshot $(mget created_at))."
    Merging an env-file-only change makes deploy-static.yaml's update-deployment-state step fail (nothing to commit, or
    the release tag already exists), so this PR records state; step 1 is what deploys.
 3. Before the next promotion, revert the promotion's merge on $branch (git revert -m 1 <merge sha>), or the next
    release brings phase 1 back. Merges on origin/$branch since the snapshot:
TEXT
  local since
  since="$(mget "branch_heads.$branch" || true)"
  if [[ -n "$since" ]] && git -C "$REPO" rev-parse -q --verify "$since^{commit}" >/dev/null; then
    git -C "$REPO" log --first-parent --merges --format='      %h %s' "$since..origin/$branch" || true
  else
    echo "      (the snapshot recorded no head for origin/$branch)"
  fi
  echo " 4. Check: kubectl --context $CTX -n $NS get helmrelease $HR; kubectl --context $CTX -n $NS get rollouts"
}

chart_emergency() {
  need helm
  local release revision
  release="$(mget "envs.$ENV.helm_release" || echo "$HR")"
  revision="$(mget "envs.$ENV.helm_revision" || true)"
  [[ -n "$revision" ]] || die "the snapshot recorded no helm revision for $ENV"
  step "EMERGENCY chart rollback of $ENV: suspend HelmRelease $NS/$HR, helm rollback $release to revision $revision"
  local current
  current="$(helm history "$release" -n "$NS" --kube-context "$CTX" --max 1 -o json | "$PYTHON" "$RELEASE_PY" helm-release-revision || true)"
  log "  helm revision now: ${current:-unknown}; snapshot revision: $revision"
  helm history "$release" -n "$NS" --kube-context "$CTX" --max 50 -o json \
    | "$PYTHON" -c 'import json,sys; sys.exit(0 if any(h["revision"]==int(sys.argv[1]) for h in json.load(sys.stdin)) else 1)' "$revision" \
    || die "revision $revision is no longer in helm history (history-max); use the normal path"
  if [[ "$EXECUTE" != 1 ]]; then
    log "  DRY RUN; with --execute this runs:"
    log "+ kubectl --context $CTX -n $NS patch helmreleases.helm.toolkit.fluxcd.io $HR --type merge -p '{\"spec\":{\"suspend\":true}}'   (= flux suspend hr $HR -n $NS)"
    log "+ helm rollback $release $revision -n $NS --kube-context $CTX --timeout 10m"
    log "  then compares every Rollout's images in $NS with the snapshot's"
    return 0
  fi
  confirm_env "$ENV"
  kc -n "$NS" patch helmreleases.helm.toolkit.fluxcd.io "$HR" --type merge -p '{"spec":{"suspend":true}}'
  helm rollback "$release" "$revision" -n "$NS" --kube-context "$CTX" --timeout 10m
  local want got bad=0
  want="$(mget "envs.$ENV.rollouts" | "$PYTHON" -c 'import json,sys; [print(r["name"]+"\t"+r["images"]) for r in json.load(sys.stdin)]')"
  got="$(kc -n "$NS" get rollouts.argoproj.io -o json | "$PYTHON" "$RELEASE_PY" rollout-images | awk -F'\t' '{print $1"\t"$4}')"
  while IFS="$TAB" read -r name images; do
    [[ -n "$name" ]] || continue
    now="$(awk -F'\t' -v n="$name" '$1 == n {print $2}' <<<"$got")"
    if [[ "$now" == "$images" ]]; then
      log "  Rollout $name: $images (matches the snapshot)"
    else
      log "  Rollout $name: now '$now', snapshot '$images'"
      bad=1
    fi
  done <<<"$want"
  if [[ "$bad" == 1 ]]; then
    if kubectl argo rollouts version >/dev/null 2>&1; then
      log "  Rollout images still differ; to go back on the Argo side: kubectl argo rollouts undo <name> -n $NS --context $CTX --to-revision=<snapshot revision>"
    fi
    die "a Rollout does not match the snapshot after helm rollback"
  fi
  cat <<TEXT

HelmRelease $NS/$HR is SUSPENDED, so Flux will not re-apply phase 1 while it stays so. Next:
 1. Point the env back at the snapshot's release in git (restore.sh chart without --emergency, step 1).
 2. When the GitRepository serves the snapshot's tag again, run: restore.sh resume --snapshot $SNAP --env $ENV --context $CTX
    (it prints the flux resume command only once that is true)
TEXT
  resume_hint || true
}

# Prints the resume command only when the env's GitRepository serves the snapshot's release tag (a resume while it serves
# another tag makes Flux re-apply that release over the rollback). Returns 1, printing why, otherwise.
resume_hint() {
  local tag gr json why
  tag="$(mget "envs.$ENV.release_tag" || true)"
  gr="$(env_gitrepo "$ENV")"
  if [[ -z "$tag" ]]; then
    log "NOT printing the resume command: the snapshot records no release tag for $ENV"
    return 1
  fi
  if ! json="$(kubectl --context "$CTX" -n "${gr%/*}" get gitrepositories.source.toolkit.fluxcd.io "${gr#*/}" -o json 2>/dev/null)"; then
    log "NOT printing the resume command: GitRepository $gr could not be read on $CTX"
    return 1
  fi
  if why="$(printf '%s' "$json" | "$PYTHON" "$RELEASE_PY" gitrepo-serves --tag "$tag")"; then
    printf 'GitRepository %s serves the snapshot tag %s. Resume:\n  flux resume hr %s -n %s --context %s\n' "$gr" "$tag" "$HR" "$NS" "$CTX"
    return 0
  fi
  log "NOT printing the resume command: GitRepository $gr does not serve the snapshot tag $tag yet ($why)."
  log "Redeploy the tag (restore.sh chart, step 1), wait for Flux to fetch it, then run: restore.sh resume --snapshot $SNAP --env $ENV --context $CTX"
  return 1
}

# ---------------------------------------------------------------------------------------------------------------
# db --scoped
# ---------------------------------------------------------------------------------------------------------------
# Fails closed: a pod list that cannot be read, or a snapshot without a running web pod for an env, refuses the restore.
# Every web container must run one of the snapshot's web images, and so must every container from the same repository.
image_guard() {
  local e ns bad=0 want pods offenders
  for e in $SHARING; do
    ns="$(env_namespace "$e")"
    want="$(mget "envs.$e.web_pods" | "$PYTHON" -c 'import json,sys; imgs=sorted({p["image"] for p in json.load(sys.stdin) if p["phase"]=="Running"}); print(" ".join(imgs))')" || want=""
    if [[ -z "$want" ]]; then
      log "  $e: the snapshot recorded no running web pod, so there is nothing to compare its pods with"
      bad=1
      continue
    fi
    if ! pods="$(kc -n "$ns" get pods -o json)"; then
      log "  $e: could not list the pods of namespace $ns"
      bad=1
      continue
    fi
    if ! offenders="$("$PYTHON" "$RELEASE_PY" image-guard --allowed "$want" --web-label "web-$(env_hr "$e")" <<<"$pods")"; then
      if [[ -z "$offenders" ]]; then
        log "  $e: could not check the pods of namespace $ns"
      fi
      while IFS="$TAB" read -r pod img; do
        [[ -n "$pod" ]] && log "  $e: pod $pod runs $img; the snapshot ran $want"
      done <<<"$offenders"
      bad=1
    fi
  done
  return "$bad"
}

# The maintenance fence. Prints what is still live (one line each) and returns nonzero when anything is. Fails closed:
# an object that cannot be read counts as live. The snapshot's web images are the only images allowed to exist.
fence_check() {
  local bad=0 e ns hr want suspend lines allowed="" pods
  for e in $SHARING; do
    want="$(mget "envs.$e.web_pods" | "$PYTHON" -c 'import json,sys; print(" ".join(sorted({p["image"] for p in json.load(sys.stdin) if p["phase"]=="Running"})))')" || want=""
    if [[ -z "$want" ]]; then
      echo "$e: the snapshot recorded no running web pod, so there is no web image to compare the controllers with"
      bad=1
    fi
    allowed+=" $want"
  done
  for e in $SHARING; do
    ns="$(env_namespace "$e")"
    hr="$(env_hr "$e")"
    if ! suspend="$(kc -n "$ns" get helmreleases.helm.toolkit.fluxcd.io "$hr" -o jsonpath='{.spec.suspend}' 2>/dev/null)"; then
      echo "$e: HelmRelease $ns/$hr cannot be read, so Flux cannot be shown to be stopped (flux suspend hr $hr -n $ns)"
      bad=1
    elif [[ "$suspend" != true ]]; then
      echo "$e: HelmRelease $ns/$hr is not suspended; Flux can re-apply a phase 1 release at any time (flux suspend hr $hr -n $ns)"
      bad=1
    fi
    if ! lines="$(kc -n "$ns" get rollouts.argoproj.io,deployments.apps,statefulsets.apps,daemonsets.apps,cronjobs.batch,jobs.batch -o json 2>/dev/null \
      | "$PYTHON" "$RELEASE_PY" fence-check --allowed "${allowed# }")"; then
      if [[ -z "$lines" ]]; then
        echo "$e: could not list or read the controllers, CronJobs and Jobs of namespace $ns"
      fi
      while IFS="$TAB" read -r what why; do
        [[ -n "$what" ]] && echo "$e: $what: $why"
      done <<<"$lines"
      bad=1
    fi
  done
  # Pods: the same check as the first guard, listed here too.
  if ! pods="$(image_guard 2>&1)"; then
    echo "$pods" | sed 's/^ *//'
    bad=1
  fi
  fence_writers || bad=1
  return "$bad"
}

# Other sessions writing the scoped tables (FENCE_TABLES): locks that writers hold, and writes within a short window
# (the counters of pg_stat_user_tables; APIKEYS_RESTORE_FENCE_WINDOW seconds, default 3).
fence_writers() {
  local list window="${APIKEYS_RESTORE_FENCE_WINDOW:-3}" held before after
  [[ -n "${FENCE_TABLES// /}" ]] || return 0
  # shellcheck disable=SC2086
  list="$(printf "'%s'," $FENCE_TABLES)"
  list="${list%,}"
  held="$(pg_ro "$DB" -At -F "$TAB" -c "SELECT a.pid, coalesce(nullif(a.application_name, ''), '-'), a.state, c.relname, l.mode
      FROM pg_locks l JOIN pg_class c ON c.oid = l.relation JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE a.datname = current_database() AND l.pid <> pg_backend_pid() AND l.granted AND c.relname IN ($list)
        AND l.mode IN ('RowExclusiveLock', 'ShareUpdateExclusiveLock', 'ShareLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock')" 2>&1)" || {
    echo "db: could not read pg_locks, so writers on the scoped tables cannot be excluded: $held"
    return 1
  }
  if [[ -n "$held" ]]; then
    while IFS="$TAB" read -r pid app state rel mode; do
      echo "db: session $pid (app $app, $state) holds $mode on $rel: a writer"
    done <<<"$held"
    return 1
  fi
  before="$(pg_ro "$DB" -At -F "$TAB" -c "SELECT relname, n_tup_ins + n_tup_upd + n_tup_del FROM pg_stat_user_tables WHERE relname IN ($list) ORDER BY 1" 2>&1)" || {
    echo "db: could not read pg_stat_user_tables: $before"
    return 1
  }
  sleep "$window"
  after="$(pg_ro "$DB" -At -F "$TAB" -c "SELECT relname, n_tup_ins + n_tup_upd + n_tup_del FROM pg_stat_user_tables WHERE relname IN ($list) ORDER BY 1" 2>&1)" || {
    echo "db: could not read pg_stat_user_tables: $after"
    return 1
  }
  if [[ "$before" != "$after" ]]; then
    echo "db: rows of the scoped tables were written within ${window}s (write counters before: $(tr '\t\n' '= ' <<<"$before"); after: $(tr '\t\n' '= ' <<<"$after")): a live writer"
    return 1
  fi
  return 0
}

# Runs the fence; prints everything still live and dies when there is anything. $1 names the moment.
require_fence() {
  local when="$1" out
  if ! out="$(fence_check)"; then
    log "  still live ($when):"
    sed 's/^/    - /' <<<"$out" >&2
    die "refusing: the maintenance fence is not in place ($when); nothing was changed. Suspend the HelmReleases, suspend the CronJobs that run the web image, roll the chart back, stop the writers, then run this again."
  fi
  log "  fence in place ($when): HelmReleases suspended, no web image but the snapshot's in any controller, CronJob, Job or pod, no writer on the scoped tables"
}

# The snapshot's apikeys_notify() state: md5 of its definition, or "absent".
# The function's state as the snapshot recorded it. snapshot.sh always writes apikeys_notify.state; a snapshot without it
# cannot be verified after a restore, so db_scoped refuses it before changing anything.
snapshot_fn_state() {
  cat "$SNAP/db/apikeys_notify.state"
}

db_scoped() {
  local work stamp snap_fn
  [[ -s "$SNAP/db/apikeys_notify.state" ]] \
    || die "the snapshot has no db/apikeys_notify.state, so a restore could not be verified; take a new snapshot with snapshot.sh"
  snap_fn="$(snapshot_fn_state)"
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  work="$SNAP/restore-$stamp"
  step "scoped restore of $DB (powered_by and phase 1 tables) to the snapshot of $(mget created_at)"
  [[ -f "$SNAP/db/scoped.dump" ]] || die "the snapshot has no db/scoped.dump"
  [[ "$(sha256_of "$SNAP/db/scoped.dump")" == "$(cut -d' ' -f1 <"$SNAP/db/scoped.dump.sha256")" ]] || die "db/scoped.dump does not match its sha256"

  step "guard: every pod of ${SHARING// / and } runs the snapshot's image"
  image_guard || die "refusing: a pod sharing $DB runs an image other than the snapshot's, or the pods could not be compared. Roll the chart back first (restore.sh chart)."
  log "  ok"

  local snap_tables current_tables
  snap_tables="$(tr '\n' ' ' <"$SNAP/db/scoped-tables.txt")"
  current_tables="$(scoped_tables_sql | pg_ro "$DB" -At | tr '\n' ' ')"
  log "  snapshot tables: $snap_tables"
  log "  current tables:  $current_tables"
  # shellcheck disable=SC2086
  if [[ "$snap_tables" == "$current_tables" ]] && [[ "$(notify_fn_sql | pg_ro "$DB" -At)" == "$snap_fn" ]] && checksums_sql $current_tables | pg_ro "$DB" -At -F "$TAB" | cmp -s - "$SNAP/db/scoped-checksums.tsv" \
    && scoped_schema "$DB" $current_tables >"${TMPDIR:-/tmp}/apikeys-schema.$$" && schema_matches "$SNAP" "${TMPDIR:-/tmp}/apikeys-schema.$$" 2>/dev/null; then
    rm -f "${TMPDIR:-/tmp}/apikeys-schema.$$"
    log "  the database already matches the snapshot; nothing to do"
    return 0
  fi
  rm -f "${TMPDIR:-/tmp}/apikeys-schema.$$"

  step "maintenance fence"
  FENCE_TABLES="$current_tables"
  require_fence "before the dump"

  # A foreign key from a table outside the scope into it would be dropped or broken; refuse instead.
  local outside
  # shellcheck disable=SC2086
  outside="$(pg_ro "$DB" -At -c "SELECT conrelid::regclass || ' -> ' || confrelid::regclass FROM pg_constraint
      WHERE contype = 'f' AND confrelid::regclass::text = ANY (string_to_array('$(echo $current_tables | tr ' ' ',')', ','))
        AND NOT conrelid::regclass::text = ANY (string_to_array('$(echo $current_tables | tr ' ' ',')', ','))")"
  [[ -z "$outside" ]] || die "refusing: foreign keys from outside the scope: $outside"

  step "rows written since the snapshot (kept in the fresh dump, not restored)"
  if [[ -f "$SNAP/db/powered_by_project-rows.tsv" ]]; then
    pg_ro "$DB" -At -F "$TAB" -c 'SELECT id, md5(p::text) FROM public.powered_by_project p ORDER BY id' >"${TMPDIR:-/tmp}/apikeys-rows.$$" || true
    "$PYTHON" - "$SNAP/db/powered_by_project-rows.tsv" "${TMPDIR:-/tmp}/apikeys-rows.$$" <<'PY' >&2
import sys
def load(p):
    return dict(l.split("\t") for l in open(p).read().splitlines() if l.strip())
snap, now = load(sys.argv[1]), load(sys.argv[2])
added = sorted(set(now) - set(snap), key=int)
gone = sorted(set(snap) - set(now), key=int)
changed = sorted((k for k in set(now) & set(snap) if now[k] != snap[k]), key=int)
print(f"  powered_by_project: {len(added)} added, {len(changed)} changed, {len(gone)} removed since the snapshot")
for label, ids in (("added", added), ("changed", changed), ("removed", gone)):
    if ids:
        print(f"    {label}: ids {', '.join(ids[:50])}{' ...' if len(ids) > 50 else ''}")
PY
    rm -f "${TMPDIR:-/tmp}/apikeys-rows.$$"
  fi

  mkdir -p "$work"
  local sql="$work/restore.sql"
  {
    # An explicit transaction: psql's -1 does not apply to a script read from stdin.
    echo "BEGIN;"
    echo "SET LOCAL lock_timeout = '15s';"
    echo "SET LOCAL statement_timeout = '10min';"
    # The fence, inside the transaction: take the scoped tables ACCESS EXCLUSIVE first (writers that hold or queue for
    # them make this wait at most lock_timeout and abort), then abort if any session is queued behind that lock: a
    # writer that arrived after the checks above.
    if [[ -n "${current_tables// /}" ]]; then
      # shellcheck disable=SC2086
      echo "LOCK TABLE $(printf 'public."%s", ' $current_tables | sed 's/, $//') IN ACCESS EXCLUSIVE MODE;"
      # shellcheck disable=SC2086
      cat <<SQLFENCE
DO \$fence\$
DECLARE who text;
BEGIN
  SELECT string_agg(DISTINCT a.pid::text, ',') INTO who FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
    JOIN pg_stat_activity a ON a.pid = l.pid
   WHERE NOT l.granted AND l.pid <> pg_backend_pid() AND c.relname IN ($(printf "'%s'," $current_tables | sed 's/,$//'));
  IF who IS NOT NULL THEN
    RAISE EXCEPTION 'restore fence: sessions % are queued on locks of the scoped tables (a live writer); nothing was changed', who;
  END IF;
END \$fence\$;
SQLFENCE
    fi
    # One DROP for every scoped table: references between them are fine, a dependent outside the scope fails it.
    # shellcheck disable=SC2086
    [[ -n "${current_tables// /}" ]] && echo "DROP TABLE $(printf 'public."%s", ' $current_tables | sed 's/, $//');"
    if [[ -f "$SNAP/db/apikeys_notify.sql" ]]; then
      cat "$SNAP/db/apikeys_notify.sql"
    else
      echo "DROP FUNCTION IF EXISTS public.apikeys_notify();"
    fi
    # pg_restore's SQL starts with SET statement_timeout = 0 and SET lock_timeout = 0, which would switch the bounds above
    # off for everything after it. Those lines (and the other timeout settings) are dropped, and the bounds are set again
    # after the dump's statements as well.
    pg_restore_local "$SNAP/db/scoped.dump" --file=- | grep -vE '^SET (statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout) = '
    echo "SET LOCAL lock_timeout = '15s';"
    echo "SET LOCAL statement_timeout = '10min';"
    echo "SET search_path = public;"
    "$PYTHON" "$RELEASE_PY" migrations-insert-sql "$MANIFEST"
    echo "COMMIT;"
  } >"$sql"
  if grep -qE '^SET (statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout) = ' "$sql"; then
    die "the restore SQL still sets a timeout of its own; refusing (it would lift the lock and statement bounds)"
  fi
  log "  restore SQL: $sql ($(wc -l <"$sql" | tr -d ' ') lines)"

  if [[ "$EXECUTE" != 1 ]]; then
    log "  DRY RUN; with --execute this would:"
    log "    1. pg_dump --format=c $DB > $work/pre-restore.dump (and a scoped dump), with sha256"
    log "    2. check the pods again, then run $sql (BEGIN ... COMMIT) on $PG_NS/$PG_POD"
    log "    3. compare the scoped schema, row checksums and powered_by migrations with the snapshot"
    return 0
  fi

  confirm_env "$ENV"
  step "fresh dump before any change"
  pg_dump_pod "$DB" --format=c >"$work/pre-restore.dump"
  sha256_of "$work/pre-restore.dump" >"$work/pre-restore.dump.sha256"
  pg_restore_local "$work/pre-restore.dump" --file=/dev/null || die "the fresh dump is unreadable; nothing was changed"
  local targs=() t
  for t in $current_tables; do targs+=(-t "public.\"$t\""); done
  [[ ${#targs[@]} -gt 0 ]] && pg_dump_pod "$DB" --format=c "${targs[@]}" >"$work/pre-restore-scoped.dump"
  log "  $work/pre-restore.dump ($(wc -c <"$work/pre-restore.dump" | tr -d ' ') bytes)"

  step "guard again, right before the change"
  image_guard || die "refusing: a pod sharing $DB now runs an image other than the snapshot's; nothing was changed"
  require_fence "right before the change"
  step "restore (one transaction)"
  pg_rw "$DB" -f - <"$sql" >"$work/restore.log" 2>&1 || { cat "$work/restore.log" >&2; die "the restore failed and was rolled back"; }

  step "verify against the snapshot"
  local now_tables ok=1
  now_tables="$(scoped_tables_sql | pg_ro "$DB" -At | tr '\n' ' ')"
  [[ "$now_tables" == "$snap_tables" ]] || { log "  tables differ: now '$now_tables'"; ok=0; }
  # shellcheck disable=SC2086
  scoped_schema "$DB" $now_tables >"$work/schema-after.sql"
  schema_matches "$SNAP" "$work/schema-after.sql" || { log "  schema differs"; ok=0; }
  # shellcheck disable=SC2086
  checksums_sql $now_tables | pg_ro "$DB" -At -F "$TAB" >"$work/checksums-after.tsv"
  diff -u "$SNAP/db/scoped-checksums.tsv" "$work/checksums-after.tsv" >&2 || { log "  row checksums differ"; ok=0; }
  local fn_now
  fn_now="$(notify_fn_sql | pg_ro "$DB" -At)"
  [[ "$fn_now" == "$snap_fn" ]] || { log "  apikeys_notify(): now '$fn_now', snapshot '$snap_fn'"; ok=0; }
  [[ "$ok" == 1 ]] || die "the database does not match the snapshot after the restore (see above; fresh dump in $work)"
  log "  schema, row checksums, powered_by migrations and apikeys_notify() equal the snapshot"
}

case "$MODE" in
  resume)
    [[ -n "$ENV" ]] || die "resume needs --env"
    resume_hint
    ;;
  chart)
    if [[ "$EMERGENCY" == 1 ]]; then chart_emergency; else chart_normal; fi
    ;;
  db)
    [[ "$SCOPED" == 1 ]] || die "db needs --scoped (or --full, which only prints the manual procedure)"
    db_scoped
    ;;
esac
