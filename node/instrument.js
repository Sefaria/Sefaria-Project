const Sentry = require("@sentry/node");
const settings = require('./local_settings.js');

Sentry.init({
  dsn: settings.SENTRY_DSN,
});