const $         = require('./sefariaJquery');
const extend    = require('extend');
const striptags = require('striptags');


var INBROWSER = (typeof document !== 'undefined');

class Util {
    static clone(obj) {
        // Handle the 3 simple types, and null or undefined
        if (null == obj || "object" != typeof obj) return obj;

        // Handle Date
        if (obj instanceof Date) {
            var copy = new Date();
            copy.setTime(obj.getTime());
            return copy;
        }

        // Handle Array
        if (obj instanceof Array) {
            var copy = [];
            var len = obj.length;
            for (var i = 0; i < len; ++i) {
                copy[i] = this.clone(obj[i]);
            }
            return copy;
        }

        // Handle Object
        if (obj instanceof Object) {
            var copy = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr)) copy[attr] = this.clone(obj[attr]);
            }
            return copy;
        }

        throw new Error("Unable to copy obj! Its type isn't supported.");
    }
    static throttle(func, limit) {
      // Returns a functions which throttle `func`
        var wait = false;                 // Initially, we're not waiting
        return function () {              // We return a throttled function
            if (!wait) {                  // If we're not waiting
                func.call();              // Execute users function
                wait = true;              // Prevent future invocations
                setTimeout(function () {  // After a period of time
                    wait = false;         // And allow future invocations
                }, limit);
            }
        }
    }
    static debounce(func, wait, immediate) {
      // Returns a function which debounces `func`
        var timeout;
        return function() {
            var context = this, args = arguments;
            var later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    }
    static inArray(needle, haystack) {
      if (!haystack) { return -1 } //For parity of behavior w/ JQuery inArray
      var index = -1;
      for (var i = 0; i < haystack.length; i++) {
        if ((needle.compare && needle.compare(haystack[i])) || haystack[i] === needle) {
          index = i;
          break;
        }
      }
      return index;
    }
    static currentPath() {
      // Returns the current path plus search string if a browser context
      // or "/" in a browser-less context.
      return (typeof window === "undefined" ) ? this._initialPath :
                window.location.pathname + window.location.search;
    }
    static parseURL(url) {
      var a =  document.createElement('a');
      a.href = url;
      return {
        source: url,
        protocol: a.protocol.replace(':',''),
        host: a.hostname,
        port: a.port,
        query: a.search,
        params: (function(){
          var ret = {},
            seg = a.search.replace(/^\?/,'').split('&'),
            len = seg.length, i = 0, s;
          for (;i<len;i++) {
            if (!seg[i]) { continue; }
            s = seg[i].split('=');
            ret[s[0]] = s[1];
          }
          return ret;
        })(),
        file: (a.pathname.match(/\/([^\/?#]+)$/i) || [,''])[1],
        hash: a.hash.replace('#',''),
        path: a.pathname.replace(/^([^\/])/,'/$1'),
        relative: (a.href.match(/tps?:\/\/[^\/]+(.+)/) || [,''])[1],
        segments: a.pathname.replace(/^\//,'').split('/')
      };
    }
    static isValidEmailAddress(emailAddress) {
      var pattern = new RegExp(/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?$/i);
      return pattern.test(emailAddress);
    }
    static cookie(key, value) {
     // Mock cookie function to mirror $.cookie for use Server Side
     if (typeof value === "undefined") {
      return Util._cookies[key];
     }
     Util._cookies[key] = value;
    }
    static openInNewTab(url) {
      var win = window.open(url, '_blank');
      win.focus();
    }
    static setupPrototypes() {

        String.prototype.toProperCase = function() {
          // Treat anything after ", " as a new clause
          // so that titles like "Orot, The Ideals of Israel" keep a capital The
          var clauses = this.split(", ");

          for (var n = 0; n < clauses.length; n++) {
              var i, j, str, lowers, uppers;
              str = clauses[n].replace(/([^\W_]+[^\s-]*) */g, function(txt) {
                // We're not lowercasing the end of the string because of cases like "HaRambam"
                return txt.charAt(0).toUpperCase() + txt.substr(1);
              });

              // Certain minor words should be left lowercase unless
              // they are the first or last words in the string
              lowers = ['A', 'An', 'The', 'And', 'But', 'Or', 'For', 'Nor', 'As', 'At',
              'By', 'For', 'From', 'Is', 'In', 'Into', 'Near', 'Of', 'On', 'Onto', 'To', 'With'];
              for (i = 0, j = lowers.length; i < j; i++) {
                str = str.replace(new RegExp('\\s' + lowers[i] + '\\s', 'g'),
                  function(txt) {
                    return txt.toLowerCase();
                  });
               }

              // Certain words such as initialisms or acronyms should be left uppercase
              uppers = ['Id', 'Tv', 'Ii', 'Iii', "Iv"];
              for (i = 0, j = uppers.length; i < j; i++) {
                str = str.replace(new RegExp('\\b' + uppers[i] + '\\b', 'g'),
                  uppers[i].toUpperCase());
              }

              clauses[n] = str;
          }

          return clauses.join(", ");
        };

        String.prototype.toFirstCapital = function() {
            return this.charAt(0).toUpperCase() + this.substr(1);
        };

        String.prototype.stripHtml = function() {
           /*if (INBROWSER) {
             var tmp = document.createElement("div");
             tmp.innerHTML = this;
             return tmp.textContent|| "";
           } else {*/
            return striptags(this.replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' '));
           //}
        };

        String.prototype.stripHtmlKeepLineBreaks = function() {
            return striptags(this.replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ').replace(/<p>/g, ' <p>'),['br']);
        };


        String.prototype.escapeHtml = function() {
            return this.replace(/&/g,'&amp;')
                        .replace(/</g,'&lt;')
                        .replace(/>/g,'&gt;')
                        .replace(/'/g,'&apos;')
                        .replace(/"/g,'&quot;')
                        .replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br />$2');
        };

        if (!String.prototype.startsWith) {
            String.prototype.startsWith = function(searchString, position){
              position = position || 0;
              return this.substr(position, searchString.length) === searchString;
          };
        }

        Array.prototype.compare = function(testArr) {
            if (this.length != testArr.length) return false;
            for (var i = 0; i < testArr.length; i++) {
                if (this[i].compare) {
                    if (!this[i].compare(testArr[i])) return false;
                }
                if (this[i] !== testArr[i]) return false;
            }
            return true;
        };

        Array.prototype.pad = function(s,v) {
            var l = Math.abs(s) - this.length;
            var a = [].concat(this);
            if (l <= 0)
              return a;
            for(var i=0; i<l; i++)
              s < 0 ? a.unshift(v) : a.push(v);
            return a;
        };

        Array.prototype.unique = function() {
            var a = [];
            var l = this.length;
            for(var i=0; i<l; i++) {
              for(var j=i+1; j<l; j++) {
                // If this[i] is found later in the array
                if (this[i] === this[j])
                  j = ++i;
              }
              a.push(this[i]);
            }
            return a;
        };

        Array.prototype.toggle = function(value) {
            var index = this.indexOf(value);

            if (index === -1) {
                this.push(value);
            } else {
                this.splice(index, 1);
            }
            return this;
        };

        Array.prototype.move = function (old_index, new_index) {
            if (new_index >= this.length) {
                var k = new_index - this.length;
                while ((k--) + 1) {
                    this.push(undefined);
                }
            }
            this.splice(new_index, 0, this.splice(old_index, 1)[0]);
            return this; // for testing purposes
        };

        Array.prototype.insertInOrder = function(element, comparer) {
          // see https://stackoverflow.com/questions/1344500/efficient-way-to-insert-a-number-into-a-sorted-array-of-numbers
          // insert `element` into array so that the array remains sorted, assuming it was sorted to begin with
          this.splice(this.locationOfSorted(element, comparer) + 1, 0, element);
          return this;
        };

        Array.prototype.locationOfSorted = function(element, comparer, start, end) {
          // https://stackoverflow.com/questions/1344500/efficient-way-to-insert-a-number-into-a-sorted-array-of-numbers
          // get index to insert `element` into array so that array remains sorted, assuming it was sorted to begin with
          if (this.length === 0)
            return -1;

          start = start || 0;
          end = end || this.length;
          const pivot = (start + end) >> 1;  // should be faster than dividing by 2

          const c = comparer(element, this[pivot]);
          if (end - start <= 1) return c == -1 ? pivot - 1 : pivot;

          switch (c) {
            case -1: return this.locationOfSorted(element, comparer, start, pivot);
            case 0: return pivot;
            case 1: return this.locationOfSorted(element, comparer, pivot, end);
          };
        };

        if (!Array.prototype.fill) {
          Object.defineProperty(Array.prototype, 'fill', {
            value: function(value) {

              if (this == null) {
                throw new TypeError('this is null or not defined');
              }

              var O = Object(this);
              var len = O.length >>> 0;

              var start = arguments[1];
              var relativeStart = start >> 0;
              var k = relativeStart < 0 ?
                Math.max(len + relativeStart, 0) :
                Math.min(relativeStart, len);
              var end = arguments[2];
              var relativeEnd = end === undefined ?
                len : end >> 0;
              var final = relativeEnd < 0 ?
                Math.max(len + relativeEnd, 0) :
                Math.min(relativeEnd, len);
              while (k < final) {
                O[k] = value;
                k++;
              }
              return O;
            }
          });
        }

        // https://tc39.github.io/ecma262/#sec-array.prototype.find
        if (!Array.prototype.find) {
          Object.defineProperty(Array.prototype, 'find', {
            value: function(predicate) {
             // 1. Let O be ? ToObject(this value).
              if (this == null) {
                throw new TypeError('"this" is null or not defined');
              }

              var o = Object(this);

              // 2. Let len be ? ToLength(? Get(O, "length")).
              var len = o.length >>> 0;

              // 3. If IsCallable(predicate) is false, throw a TypeError exception.
              if (typeof predicate !== 'function') {
                throw new TypeError('predicate must be a function');
              }

              // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
              var thisArg = arguments[1];

              // 5. Let k be 0.
              var k = 0;

              // 6. Repeat, while k < len
              while (k < len) {
                // a. Let Pk be ! ToString(k).
                // b. Let kValue be ? Get(O, Pk).
                // c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
                // d. If testResult is true, return kValue.
                var kValue = o[k];
                if (predicate.call(thisArg, kValue, k, o)) {
                  return kValue;
                }
                // e. Increase k by 1.
                k++;
              }

              // 7. Return undefined.
              return undefined;
            }
          });
        }

        RegExp.escape = function(s) {
            return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        };
    }
    static setupMisc() {
        /*
          classnames
          Copyright (c) 2015 Jed Watson.
          Licensed under the MIT License (MIT), see
          http://jedwatson.github.io/classnames
        */
        (function () {
            'use strict';

            function classNames () {

                var classes = '';

                for (var i = 0; i < arguments.length; i++) {
                    var arg = arguments[i];
                    if (!arg) continue;

                    var argType = typeof arg;

                    if ('string' === argType || 'number' === argType) {
                        classes += ' ' + arg;

                    } else if (Array.isArray(arg)) {
                        classes += ' ' + classNames.apply(null, arg);

                    } else if ('object' === argType) {
                        for (var key in arg) {
                            if (arg.hasOwnProperty(key) && arg[key]) {
                                classes += ' ' + key;
                            }
                        }
                    }
                }

                return classes.substr(1);
            }

            if (typeof module !== 'undefined' && module.exports) {
                module.exports = classNames;
            } else if (typeof define === 'function' && typeof define.amd === 'object' && define.amd){
                // AMD. Register as an anonymous module.
                define(function () {
                    return classNames;
                });
            } else {
                window.classNames = classNames;
            }

        }());

        // Protect against browsers without consoles and forgotten console statements
        if(typeof(console) === 'undefined') {
            var console = {};
            console.log = function() {};
        }
    }
    static handleUserCookie(loggedIn, uid, partner_group, partner_role) {
        var cookie = INBROWSER ? $.cookie : this.cookie;

        if (loggedIn) {
            // If logged in, replace cookie with current system details

            var expires = new Date(); // starts with current time
            expires.setTime(expires.getTime() + 2 * 365 * 24 * 3600 * 1000);  // milliseconds

            cookie("_user", JSON.stringify({
               _uid: uid,
               _partner_group: partner_group,
               _partner_role: partner_role
            }), { path: "/", expires: expires });
        } else {
            // If not logged in, get details from cookie
            var c = cookie("_user");
            if (c) {
              c = JSON.parse(c);
              return c;
            }
        }
    }
    static getSelectionBoundaryElement(isStart) {
        // http://stackoverflow.com/questions/1335252/how-can-i-get-the-dom-element-which-contains-the-current-selection
        var range, sel, container;
        if (document.selection) {
            range = document.selection.createRange();
            range.collapse(isStart);
            return range.parentElement();
        } else {
            sel = window.getSelection();
            if (sel.getRangeAt) {
                if (sel.rangeCount > 0) {
                    range = sel.getRangeAt(0);
                }
            } else {
                // Old WebKit
                range = document.createRange();
                range.setStart(sel.anchorNode, sel.anchorOffset);
                range.setEnd(sel.focusNode, sel.focusOffset);

                // Handle the case when the selection was selected backwards (from the end to the start in the document)
                if (range.collapsed !== sel.isCollapsed) {
                    range.setStart(sel.focusNode, sel.focusOffset);
                    range.setEnd(sel.anchorNode, sel.anchorOffset);
                }
           }

            if (range) {
               container = range[isStart ? "startContainer" : "endContainer"];

               // Check if the container is a text node and return its parent if so
               return container.nodeType === 3 ? container.parentNode : container;
            }
        }
    }
    static getUrlVars() {
      var vars = {};
      var url = INBROWSER ? window.location.href : this._initialPath;
      var parts = url.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
          vars[key] = decodeURIComponent(value);
      });
      return vars;
    }
    static replaceUrlParam(paramName, paramValue){
      var url = INBROWSER ? window.location.href : this._initialPath;
      if(paramValue == null)
          paramValue = '';
      var pattern = new RegExp('\\b('+paramName+'=).*?(&|$)')
      if(url.search(pattern)>=0){
          return url.replace(pattern,'$1' + paramValue + '$2');
      }
      return url + (url.indexOf('?')>0 ? '&' : '?') + paramName + '=' + paramValue
    }
    static removeUrlParam(paramName){
      var url = INBROWSER ? window.location.href : this._initialPath;
      var pattern = new RegExp('\\b(&|\\?)('+paramName+'=).*?(&|$)');
      return url.replace(pattern, '$1');
    }
    static linkify(str) {
      return str.replace(/(?:(https?\:\/\/[^\s]+))/m, '<a target="_blank" href="$1">$1</a>');
    }
    static getScrollbarWidth() {
      // Returns the size of the browser scrollbars in pixels
      // May be 0 for browsers that hide scrollbars when not in use
      if (Util._scrollbarWidth !== null) {
        return Util._scrollbarWidth;
      }
      $("body").append(
        '<div id="scrollbarTestA" style="display:none;overflow:scroll">' +
          '<div id="scrollbarTestB"></div>' +
        '</div>');
        Util._scrollbarWidth = $("#scrollbarTestA").width() - $("#scrollbarTestB").width();
        $("#scrollbarTestA").remove();
        return Util._scrollbarWidth;
    }
    static subscribeToAnnouncementsList(email) {

    }

    static RefValidator($input, $msg, $ok, $preview, options = {}) {
        /** Replacement for utils.js:sjs.checkref that uses only new tools.
         * Instantiated as an object, and then invoked with `check` method
         * $input - input element
         * $msg - status message element
         * $ok - Ok button element
         * $preview - Text preview box (optional)
         * config - a dictionary, with named arguments:
             * disallow_segments - if true, only allows book and section level refs.
                                By default, allows section and segment level references.
             * allow_new_titles = if true, allows names not recognized by the system.
                                  By default, does not allow unrecognized names.

         * example usage:

         new Sefaria.util.RefValidator($("#inlineAdd"), $("#inlineAddDialogTitle"), $("#inlineAddSourceOK"), $("#preview"));

         The object is instantiated, and sets up its own events.
         It doesn't need to be interacted with from the outside.
         */

        this.$input = $input;
        this.$msg = $msg;
        this.$ok = $ok;
        this.$preview = $preview;
        this.options = options;

        // We want completion messages to be somewhat sticky.
        // This records the string used to build the current message.
        this.completion_message_base = undefined;
        // And the current message
        this.completion_message = "";

        this.current_lookup_ajax = null;

        this.$input
            .on("input", this.check.bind(this))
            .keyup(function(e) {
                  if (e.keyCode == 13) {
                      if (!this.$ok.hasClass('disabled')) { this.$ok.trigger("click"); }
                  }
                }.bind(this))
            .autocomplete({
                source: function(request, response) {
                  Sefaria.lookupRef(
                      request.term,
                      function (d) { response(d["completions"]); }
                  );
                },
                select: function(event, ui) {
                  this._lookupAndRoute(ui.item.value);
                }.bind(this),
                minLength: 3
            });
    };
}

Util.RefValidator.prototype = {
  _sectionListString: function(arr, lang) {
      //Put together an "A, B, and C" type string from [A,B,C]
      //arr - array of strings
      if (arr.length == 1) return arr[0];                            // One alone
      var lastTwo = arr.slice(-2).join((lang=="en")?" and ":" ו");   // and together last two:
      return arr.slice(0,-2).concat(lastTwo).join(", ");            // join the rest with a ,
  },
  //Too simple to merit a function, but function calls are cheap!
  _addressListString: function(arr, lang) {
      //Put together an "A:B:C" type string from [A,B,C]
      //arr - array of strings
      return arr.join((lang=="en")?":":" ");
  },
  _getCompletionMessage: function(inString, data, depthUp) {
    // instring - the originally entered string
    // data - data returned from api/names
    // depthUp: 0 for segment.  1 for section.
    if (!data["sectionNames"] || data["sectionNames"].length == 0) return;

    var lang = data["lang"];
    var sectionNames = (lang=="en")?data["sectionNames"]:data["heSectionNames"];
    var addressExamples = (lang=="en")?data["addressExamples"]:data["heAddressExamples"];
    var current = data["sections"].length;
    var sectionListString = this._sectionListString(sectionNames.slice(current, depthUp?-depthUp:undefined), lang);
    var addressListString = this._addressListString(addressExamples.slice(current, depthUp?-depthUp:undefined), lang);
    var separator = (lang == "en" && !data["is_node"])?":":" ";
    var exampleRef = inString + separator + addressListString;
    return ((lang=="en")?
    "Enter a " + sectionListString + ". E.g: '<b>" + exampleRef +"</b>'":
    "הקלידו " + sectionListString + ". לדוגמא " + exampleRef)
  },
  _getSegmentCompletionMessage: function(inString, data) {
      return this._getCompletionMessage(inString, data, 0);
  },
  _getSectionCompletionMessage: function(inString, data) {
      return this._getCompletionMessage(inString, data, 1);
  },
  _getMessage: function(inString, data) {
      // If current string contains string used for last message, and itself isn't a new state, use current message.
      if (inString.indexOf(this.completion_message_base) == 0 && !data["is_ref"]) {
          return this.completion_message;
      }

      var return_message = "";
      var prompt_message = (data["lang"]=="en")?"Select a text":"נא בחרו טקסט";
      var create_new_message = (data["lang"]=="en")?"Create a new Index record":"צור טקסט חדש";
      var success_message = (data["lang"]=="en")?"OK. Click <b>add</b> to continue":("לחצו " + "<b>הוסף</b>" + " בכדי להמשיך");
      var no_segment_message = "Segment Level References Not Allowed Here.";
      var or_phrase = (data["lang"]=="en")?" or ":" או ";
      var range_phrase = (data["lang"] == "en")?"enter a range.  E.g. ":"הוסיפו טווח. לדוגמא ";

      if (!data["is_ref"] && this.options.allow_new_titles) {
          return_message = create_new_message + or_phrase + prompt_message;
      } else if ((data["is_node"]) ||
          (data["is_ref"] && (!(data["is_segment"] || data["is_section"])))
      ) {
          return_message = this._getSectionCompletionMessage(inString, data) || prompt_message;
      } else if (data["is_section"]) {
          if (this.options.disallow_segments) {
              return_message = success_message;
          } else {
              return_message = success_message + or_phrase + this._getSegmentCompletionMessage(inString, data);
          }
      } else if (data["is_segment"] && this.options.disallow_segments) {
          return_message = no_segment_message;
      } else if (data["is_segment"] && !data["is_range"] &&  +(data["sections"].slice(-1)) > 0) {  // check that it's an int
          var range_end = +(data["sections"].slice(-1)) + 1;
          return_message = success_message + or_phrase + range_phrase + "<b>" + inString + "-" + range_end + "</b>";
      } else if (data["is_segment"]) {
          return_message = success_message + ".";
      } else {
          return_message = prompt_message;
      }

      this.completion_message_base = inString;
      this.completion_message = return_message;
      return return_message;
  },
  _lookupAndRoute: function(inString) {
      if (this.current_lookup_ajax) {this.current_lookup_ajax.abort();}
      this.current_lookup_ajax = Sefaria.lookupRef(
        inString,
        function(data) {
          // If this query has been outpaced by typing, just return.
          if (this.$input.val() != inString) { return; }

          // If the query isn't recognized as a ref, but only for reasons of capitalization. Resubmit with recognizable caps.
          if (Sefaria.isACaseVariant(inString, data)) {
            this._lookupAndRoute(Sefaria.repairCaseVariant(inString, data));
            return;
          }

          this.$msg.css("direction", (data["lang"]=="he"?"rtl":"ltr"))
              .html(this._getMessage(inString, data));
          if (!data.is_ref && this.options.allow_new_titles) {
              this._allow(inString);
              return;
          }
          if (data.is_ref && (data.is_section || (data.is_segment && !this.options.disallow_segments))) {
            this._allow(inString, data["ref"]);  //pass normalized ref
            return;
          }
          this._disallow();
        }.bind(this)
      );
  },
  _allow: function(inString, ref) {
    if (inString != this.$input.val()) {
      // Ref was corrected (likely for capitalization)
      this.$input.val(inString);
    }
    this.$ok.removeClass("inactive").removeClass("disabled");
    if (ref) {
        this.$input.autocomplete("disable");
        this._inlineAddSourcePreview(inString, ref);
    }
  },
  _disallow: function() {
    this.$ok.addClass("inactive").addClass("disabled");
  },
  _preview_segment_mapper: function(lang, s) {
    return (s[lang])?
        ("<div class='previewLine'><span class='previewNumber'>(" + (s.number) + ")</span> " + s[lang] + "</div> "):
        "";
  },
  _inlineAddSourcePreview: function(inString, ref) {
    Sefaria.text(ref, {}, function (data) {
        if (this.$input.val() != inString) { return; }
        if (!this.$preview) { return; }

        var segments = Sefaria.makeSegments(data);
        var en = segments.map(this._preview_segment_mapper.bind(this, "en")).filter(Boolean);
        var he = segments.map(this._preview_segment_mapper.bind(this, "he")).filter(Boolean);

        // Handle missing text cases
        var path = parseURL(document.URL).path;
        if (!en.length) { en.push("<div class='previewNoText'><a href='/add/" + normRef(ref) + "?after=" + path + "' class='btn'>Add English for " + ref + "</a></div>"); }
        if (!he.length) { he.push("<div class='previewNoText'><a href='/add/" + normRef(ref) + "?after=" + path + "' class='btn'>Add Hebrew for " + ref + "</a></div>"); }
        if (!en.length && !he.length) {this.$msg.html("<i>No text available. Click below to add this text.</i>");}

        // Set it on the DOM
        this.$input.autocomplete("disable");
        this.$preview.show();
        this.$preview.html("<div class='en'>" + en.join("") + "</div>" + "<div class='he'>" + he.join("") + "</div>");
        this.$preview.position({my: "left top", at: "left bottom", of: this.$input, collision: "none" }).width('691px').css('margin-top','20px');
    }.bind(this));
  },
  check: function() {
      if (this.$preview) {
          this.$preview.html("");
          this.$preview.hide();
      }
      this.$input.autocomplete("enable");
      var inString = this.$input.val();
      if (inString.length < 3) {
          this._disallow();
          return;
      }
      this._lookupAndRoute(inString);
  }
};

Util._cookies = {};
Util._scrollbarWidth = null;

module.exports = Util;
