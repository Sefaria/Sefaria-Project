// In the browser, use real jQuery + plugins; on the server, use cheerio:
let $;
if (typeof document !== "undefined") {
  // load core
  $ = require("jquery");
  // wire it up globally so the UMD wrappers pick it up
  window.jQuery = $;
  window.$       = $;
  // now load plugins synchronously
  require("jquery.cookie");
  require("jquery-ui");
  require("jquery.scrollto");
} else {
  // SSR fallback
  $ = require("cheerio");
  const emptyPromise = () => ({ always: () => new Promise(() => {}) });
  $.ajax    = emptyPromise;
  $.getJSON = emptyPromise;
  $.cookie  = () => {};
}

module.exports = $;
