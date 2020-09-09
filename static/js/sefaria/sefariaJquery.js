var $;
if (typeof document !== 'undefined' ) {
      $ = require("jquery");
          require('jquery.cookie');  //NOTE: these require statements are adding props to the $ obj. The order actually doesn't matter b/c it seems webpack deals with it
          require('jquery-ui');  // Using autocomplete, what else?
          require('jquery.scrollto');
      window.$ = $;
      window.jquery = $;
} else {
	  const emptyPromise = () => {
      	return {"always": ()=>new Promise(()=>{},()=>{})};
      };
      $         = require("cheerio");
      $.ajax    = emptyPromise; // fail silently if server-side code every hits one of these functions
      $.getJSON = emptyPromise; // ditto
      $.cookie  = function() {};
}

export default $;
