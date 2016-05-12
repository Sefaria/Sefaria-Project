var Sefaria = {};

if (typeof sjs !== 'undefined') {
    // TODO get these values without sjs and headers.js
    Sefaria._email            =  sjs._email;
    Sefaria._uid              =  sjs._uid;
    Sefaria.books             =  sjs.books;
    Sefaria.booksDict         =  sjs.booksDict;
    Sefaria.toc               =  sjs.toc;
    Sefaria.calendar          =  sjs.calendar;
    Sefaria.searchBaseUrl     =  sjs.searchBaseUrl;
    Sefaria.searchIndex       =  sjs.searchIndex;
    Sefaria.loggedIn          =  sjs.loggedIn;    
    Sefaria.is_moderator      =  sjs.is_moderator;
    Sefaria.notificationCount =  sjs.notificationCount;
    Sefaria.notifications     =  sjs.notifications;
} else {
    Sefaria.books             = [];
    Sefaria.booksDict         = {};
    Sefaria.notifications     = [];
    Sefaria.notificationCount = 0;
}

Sefaria.util = {
    _parseRef: {},
    parseRef: function(q) {
        q = q || "";
        q = decodeURIComponent(q);
        q = q.replace(/_/g, " ").replace(/[.:]/g, " ").replace(/ +/, " ");
        q = q.trim().toFirstCapital();
        if (q in Sefaria.util._parseRef) { return Sefaria.util._parseRef[q]; }
        
        var response = {book: false, 
                        sections: [],
                        toSections: [],
                        ref: ""};               
        if (!q) { 
            Sefaria.util._parseRef[q] = response;
            return response;
        }

        var toSplit = q.split("-");
        var first   = toSplit[0];
        
        for (var i = first.length; i >= 0; i--) {
            var book   = first.slice(0, i);
            var bookOn = book.split(" on ");
            if (book in Sefaria.booksDict || 
                (bookOn.length == 2 && bookOn[0] in Sefaria.booksDict && bookOn[1] in Sefaria.booksDict)) { 
                var nums = first.slice(i+1);
                break;
            }
        }
        if (!book) { 
            Sefaria.util._parseRef[q] = {"error": "Unknown book."};
            return Sefaria.util._parseRef[q];
        }

        if (nums && !nums.match(/\d+[ab]?( \d+)*/)) {
            Sefaria.util._parseRef[q] = {"error": "Bad section string."};
            return Sefaria.util._parseRef[q];
        }

        response.book       = book;
        response.sections   = nums ? nums.split(" ") : [];
        response.toSections = nums ? nums.split(" ") : [];
        response.ref        = q;
        
        // Parse range end (if any)
        if (toSplit.length == 2) {
            var toSections = toSplit[1].replace(/[.:]/g, " ").split(" ");
            
            var diff = response.sections.length - toSections.length;
            
            for (var i = diff; i < toSections.length + diff; i++) {
                response.toSections[i] = toSections[i-diff];
            }
        }

        Sefaria.util._parseRef[q] = response;    
        return response;
    },
    makeRef: function(q) {
        if (!(q.book && q.sections && q.toSections)) {
            return {"error": "Bad input."};
        }
        var ref = q.book.replace(/ /g, "_");

        if (q.sections.length)
            ref += "." + q.sections.join(".");
        
        if (!q.sections.compare(q.toSections)) {
            for (var i = 0; i < q.toSections.length; i ++)
                if (q.sections[i] != q.toSections[i]) break;
            ref += "-" + q.toSections.slice(i).join(".");
        }

        return ref;
    },
    normRef: function(ref) {
        var norm = Sefaria.util.makeRef(Sefaria.util.parseRef(ref));
        if (typeof norm == "object" && "error" in norm) {
            // Return the original string if the ref doesn't parse
            return ref;
        }
        return norm;
    },
    humanRef: function(ref) {
        var pRef = Sefaria.util.parseRef(ref);
        if (pRef.sections.length == 0) { return pRef.book; }
        var book = pRef.book + " ";
        var nRef = pRef.ref;
        var hRef = nRef.replace(/ /g, ":");
        return book + hRef.slice(book.length);
    },
    isRef: function(ref) {
        // Returns true if ref appears to be a ref 
        // relative to known books in Sefaria.books
        q = Sefaria.util.parseRef(ref);
        return ("book" in q && q.book);
    },
    titlesInText: function(text) {
        // Returns an array of the known book titles that appear in text.
        return Sefaria.books.filter(function(title) {
            return (text.indexOf(title) > -1);
        });
    },
    makeRefRe: function(titles) {
        // Construct and store a Regular Expression for matching citations
        // based on known books, or a list of titles explicitly passed
        titles = titles || Sefaria.books;
        var books = "(" + titles.map(RegExp.escape).join("|")+ ")";
        var refReStr = books + " (\\d+[ab]?)(?:[:., ]+)?(\\d+)?(?:(?:[\\-–])?(\\d+[ab]?)?(?:[:., ]+)?(\\d+)?)?";
        return new RegExp(refReStr, "gi");  
    },
    wrapRefLinks: function(text) {
        if (typeof text !== "string") { 
            return text;
        }
        var titles = Sefaria.util.titlesInText(text);
        if (titles.length == 0) {
            return text;
        }
        var refRe    = Sefaria.util.makeRefRe(titles);
        var replacer = function(match, p1, p2, p3, p4, p5, offset, string) {
            // p1: Book
            // p2: From section
            // p3: From segment
            // p4: To section
            // p5: To segment
            var uref;
            var nref;
            var r;
            uref = p1 + "." + p2;
            nref = p1 + " " + p2;
            if (p3) {
                uref += "." + p3;
                nref += ":" + p3;
            }
            if (p4) {
                uref += "-" + p4;
                nref += "-" + p4;
            }
            if (p5) {
                uref += "." + p5;
                nref += ":" + p5;
            }
            r = '<span class="refLink" data-ref="' + uref + '">' + nref + '</span>';
            if (match.slice(-1)[0] === " ") { 
                r = r + " ";
            }
            return r;
        };
        return text.replace(refRe, replacer);
    },
    clone: function clone(obj) {
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
                copy[i] = clone(obj[i]);
            }
            return copy;
        }

        // Handle Object
        if (obj instanceof Object) {
            var copy = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
            }
            return copy;
        }

        throw new Error("Unable to copy obj! Its type isn't supported.");
    },
    throttle: function(callback, limit) {
        var wait = false;                 // Initially, we're not waiting
        return function () {              // We return a throttled function
            if (!wait) {                  // If we're not waiting
                callback.call();          // Execute users function
                wait = true;              // Prevent future invocations
                setTimeout(function () {  // After a period of time
                    wait = false;         // And allow future invocations
                }, limit);
            }
        }
    },
    debounce: function(func, wait, immediate) {
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
    },
    setup: function() {

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
           var tmp = document.createElement("div");
           tmp.innerHTML = this;
           return tmp.textContent|| "";
        };

        String.prototype.escapeHtml = function() {
            return this.replace(/&/g,'&amp;')
                        .replace(/</g,'&lt;')
                        .replace(/>/g,'&gt;')
                        .replace(/'/g,'&apos;')
                        .replace(/"/g,'&quot;')
                        .replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br />$2');
        };

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

        RegExp.escape = function(s) {
            return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        };

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
                    options = $.extend({}, config.defaults, options);

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

        // Protect against browsers without consoles and forgotten console statements
        if(typeof(console) === 'undefined') {
            var console = {}
            console.log = function() {};
        }
    }
}

Sefaria.util.setup();

if (typeof module !== 'undefined') {
  module.exports = Sefaria;
}