var ga;
let tracker, trackerName;
if (typeof window !== 'undefined' && typeof window.ga === "function" && typeof window.ga.getAll == "function" && window.ga.getAll().length > 0) {
  ga = window.ga;
  tracker = ga.getAll()[0];
  trackerName = tracker.get("name"); // Google Tag Manager assigns a Tracker Name
  window.onerror = function(msg, url, lineNumber) {
      ga(trackerName + ".send", 'event', 'Javascript Errors',  msg, url + ':' + lineNumber);
  };
  ga(trackerName + '.require', 'ec');
} else {
  ga = function() {}; // Fail gracefully if we reach one of these methods server side or when GA doesn't load properly
  ga._mock = true;
  trackerName = "mock";
}
var SET = trackerName + ".set";
var SEND = trackerName + ".send";


class Track {
    // Helper functions for event tracking (with Google Analytics and Mixpanel)
    static event(category, action, label, value, options) {
        // https://developers.google.com/analytics/devguides/collection/analyticsjs/command-queue-reference#send
        ga(SEND, 'event', category, action, label, value, options);
        console.log(SEND, 'event', category, action, label, value, options);
        if (ga._mock && value && value.hitCallback) {
          // When Google Analytics isn't being used, trigger hitCallback immediately.
          value.hitCallback();
          // Unsure why we have param mismatch... what we call value here is treated as options.
          // A previous attempt to insert `null` for value to put `options` in the right place broke tracking.
        }
        else if (value && value.hitCallback) {
            // Creates a timeout to call `hitCallback` after one second (in case of no return from ga).
            setTimeout(value.hitCallback, 1000)
        }
    }
    static promoView(id, position) {
        // Promo details provided in a promoFieldObject. Can add name, and creative if we desire.
        ga(trackerName + '.ec:addPromo', {
          'id': id,
          'name': id,
          'position': position
        });
        ga(SEND, 'event', 'Internal Promotions', 'view', id, { nonInteraction: true });
    }

    static promoClick(id, position) {
        // Identify the promotion that was clicked.
        ga(trackerName + '.ec:addPromo', {
          'id': id,
          'name': id,
          'position': position
        });

        // Send the promo_click action with an event.
        ga(trackerName + '.ec:setAction', 'promo_click');
        ga(SEND, 'event', 'Internal Promotions', 'click', id);
    }

    static pageview(url) {
        ga(SET, 'page', url);
        ga(SEND, 'pageview');
    }
    static setPrimaryCategory(category_name) {
        ga(SET, 'contentGroup1', category_name);
    }
    static setSecondaryCategory(category_name) {
        ga(SET, 'contentGroup2', category_name);
    }
    static setContentLanguage(language) {
        ga(SET, 'contentGroup5', language);
    }
    static setNumberOfPanels(val) {
        ga(SET, 'dimension1', val);
    }
    static setBookName(val) {
        ga(SET, 'dimension2', val);
        ga(SET, 'contentGroup3', val);
    }
    static setRef(val) {
        ga(SET, 'dimension3', val);
    }
    static setVersionTitle(val) {
        ga(SET, 'dimension4', val);
    }
    static setPageType(val) {
        ga(SET, 'dimension5', val);
    }
    static setSidebars(val) {
        ga(SET, 'dimension6', val);
    }
    static setUserLoggedIn(bool) {
        ga(SET, 'dimension7', bool? "Logged In": "Logged Out");
    }
    static setUserID(val) {
        var sval = String(val);
        ga(SET, 'userId', sval);
        ga(SET, 'dimension10', sval);
    }
    static setUserData(loggedIn, analytics_uid) {
        this.setUserLoggedIn(loggedIn);
        if (analytics_uid) this.setUserID(analytics_uid);
    }
    static sheets(action, label) {
        this.event("Sheets", action, label);
    }
    static uiFeedback(component, likeStatus) {
        this.event("UI", component, likeStatus);
    }
    static exploreUrl(url) {
        this.event("Explorer", "Open", url);
        this.pageview(url);
    }
    static exploreBook(book) {
        this.event("Explorer", "Book", book);
    }
    static exploreBrush(book) {
        this.event("Explorer", "Brush", book);
    }
    static setInterfaceLanguage(origin, language){
        // Tracks a user setting their interface langauge, which can be done either account settings or footer
        this.event("Settings", origin, language);
    }
}

export default Track;
