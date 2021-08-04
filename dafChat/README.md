# DafChat README

## How to update the RTC & Coturn Server
- Run the deploy script for the new server:
   - Sandbox: `./deploy/deploy.bash -n test -c cluster-1 -s default -r us-east1-b -p development-205018 -d "cauldron.sefaria.org"`
   - Prod: `./deploy/deploy.bash -n prod -c cluster-1 -s dafchat -r us-east1-b -p production-deployment  -d "sefaria.org"`

## How to Install the RTC & Coturn server from scratch  
1. Remove existing server if it exists `helm uninstall RELEASE_NAME` (probably `dafchat-prod` on Prod and `dafchat-test` on Sandbox) -- `helm list -A` is helpful here
2. - Run the deploy script for the new server:
   - Sandbox: `./deploy/deploy.bash -n test -c cluster-1 -s default -r us-east1-b -p development-205018 -d "cauldron.sefaria.org"`
   - Prod: `./deploy/deploy.bash -n prod -c cluster-1 -s dafchat -r us-east1-b -p production-deployment  -d "sefaria.org"`
3. Edit the DNS names for for `rtc.<SEFARIA HOST>` and `coturn.<SEFARIA HOST>` in GCP DNS if SEFARIA_HOST is a sandbox, and CloudFlare if it is our root domain. The IP can be grabbed from the pods themselves.

