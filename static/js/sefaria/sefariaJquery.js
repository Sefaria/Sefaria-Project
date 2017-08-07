var $;
if (typeof document !== 'undefined' ) {
      $ = require("jquery");
          require('jquery.cookie');  //NOTE: these require statements are adding props to the $ obj. The order actually doesn't matter b/c it seems webpack deals with it
          require('jquery-ui');
          require('jquery.scrollto');
          require('../lib/headroom');
} else {
      $         = require("cheerio");
      $.ajax    = function() {}; // ditto
      $.getJSON = function() {}; // ditto
}

module.exports = $;
