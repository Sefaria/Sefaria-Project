#!/usr/bin/env bash
# scripts/drill-postgres-down.sh — builtin POC Postgres has an emptyDir: restart wipes it. This is the empty-reload test.
set -uo pipefail; source scripts/lib-drill.sh
H=www.authpoc.cauldron.sefaria.org; A=(-H 'x-api-key: sfr_alpha000000000000000000000000001')
echo BEFORE; sample $H "${A[@]}"
$K scale deploy/auth-service-postgres-authpoc --replicas=0; $K wait --for=delete pod -l app=auth-service-postgres-authpoc --timeout=60s
echo DURING; watch_for 130 $H "${A[@]}"        # spans two 60 s reload attempts
$K logs -l app=auth-service-authpoc --since=3m --prefix | grep -c 'reload skipped'
$K scale deploy/auth-service-postgres-authpoc --replicas=1; $K rollout status deploy/auth-service-postgres-authpoc
echo "EMPTY-DB WINDOW (no re-seed yet): the next reload returns zero rows and must be REJECTED"; sleep 70; sample $H "${A[@]}"
$K logs -l app=auth-service-authpoc --since=90s --prefix | grep -c 'refusing to replace'
bash scripts/keyadmin-run.sh >/dev/null 2>&1 || true; source scripts/keyadmin-run.sh; keyadmin_run init-schema --schema /schema.sql >/dev/null; keyadmin_run --push redis create --project proj_alpha --tier developer --key sfr_alpha000000000000000000000000001 >/dev/null
echo AFTER; sample $H "${A[@]}"
