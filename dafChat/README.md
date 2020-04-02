# DafChat README

# To Install:
- `git clone`
- `npm install`
- `sudo apt-get install coturn`
- `sudo turnserver -a -o -v -n  --no-dtls --no-tls -u test:test -r "someRealm"`
- edit `TURN_SERVER` at top of `main.js` to match data from previous step
- `npm start`


## DNS
The DNS names for `rtc.<SEFARIA HOST>` and `coturn.<SEFARIA HOST>` must be set manually, in GCP DNS if SEFARIA_HOST is a sandbox, and CloudFlare if it is our root domain