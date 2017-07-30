const $      = require('./sefariaJquery');
const extend = require('extend');
const striptags = require('striptags');

if (typeof document !== 'undefined') {
  var INBROWSER = true;
} else {
  var INBROWSER = false;
}

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
        if (haystack[i] === needle) {
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
      return this._cookies[key];
     }
     this._cookies[key] = value;
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
            return striptags(this);
           //}
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

        RegExp.escape = function(s) {
            return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        };
    }
    static setupJQuery() {
        if (!$.hasOwnProperty("fn")) { return; }
        $.fn.serializeObject = function() {
            var o = {};
            var a = this.serializeArray();
            $.each(a, function() {
                if (o[this.name] !== undefined) {
                    if (!o[this.name].push) {
                        o[this.name] = [o[this.name]];
                    }
                    o[this.name].push(this.value || '');
                } else {
                    o[this.name] = this.value || '';
                }
            });
            return o;
        };
    /*!
         * jQuery Cookie Plugin v1.3
         * https://github.com/carhartl/jquery-cookie
         *
         * Copyright 2011, Klaus Hartl
         * Dual licensed under the MIT or GPL Version 2 licenses.
         * http://www.opensource.org/licenses/mit-license.php
         * http://www.opensource.org/licenses/GPL-2.0
         */
        (function ($, document, undefined) {

            var pluses = /\+/g;

            function raw(s) {
                return s;
            }

            function decoded(s) {
                return decodeURIComponent(s.replace(pluses, ' '));
            }

            var config = $.cookie = function (key, value, options) {

                // write
                if (value !== undefined) {
                    options = extend({}, config.defaults, options);

                    if (value === null) {
                        options.expires = -1;
                    }

                    if (typeof options.expires === 'number') {
                        var days = options.expires, t = options.expires = new Date();
                        t.setDate(t.getDate() + days);
                    }

                    value = config.json ? JSON.stringify(value) : String(value);

                    return (document.cookie = [
                        encodeURIComponent(key), '=', config.raw ? value : encodeURIComponent(value),
                        options.expires ? '; expires=' + options.expires.toUTCString() : '', // use expires attribute, max-age is not supported by IE
                        options.path    ? '; path=' + options.path : '',
                        options.domain  ? '; domain=' + options.domain : '',
                        options.secure  ? '; secure' : ''
                    ].join(''));
                }

                // read
                var decode = config.raw ? raw : decoded;
                var cookies = document.cookie.split('; ');
                for (var i = 0, l = cookies.length; i < l; i++) {
                    var parts = cookies[i].split('=');
                    if (decode(parts.shift()) === key) {
                        var cookie = decode(parts.join('='));
                        return config.json ? JSON.parse(cookie) : cookie;
                    }
                }

                return null;
            };

            config.defaults = {};

            $.removeCookie = function (key, options) {
                if ($.cookie(key) !== null) {
                    $.cookie(key, null, options);
                    return true;
                }
                return false;
            };

        })($, document);

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
      if (this._scrollbarWidth !== null) {
        return this._scrollbarWidth;
      }
      $("body").append(
        '<div id="scrollbarTestA" style="display:none;overflow:scroll">' +
          '<div id="scrollbarTestB"></div>' +
        '</div>');
        this._scrollbarWidth = $("#scrollbarTestA").width() - $("#scrollbarTestB").width();
        $("#scrollbarTestA").remove();
        return this._scrollbarWidth;
    }
}

Util._cookies = {};
Util._scrollbarWidth = null;

module.exports = Util;
