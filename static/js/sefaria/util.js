import $ from './sefariaJquery';
import extend from 'extend';
import striptags from 'striptags';
import humanizeDuration from 'humanize-duration';
import sanitizeHtml from 'sanitize-html';
import Sefaria  from './sefaria';
import {HDate, months} from '@hebcal/core';

var INBROWSER = (typeof document !== 'undefined');

class Util {

    /**
     * Method to scroll into view port, if it's outside the viewport
     * From: https://medium.com/@makk.bit/scroll-into-view-if-needed-10a96e0bdb61
     * @param {Object} target - DOM Element
     * @returns {undefined}
     * See also: https://www.javascripttutorial.net/dom/css/check-if-an-element-is-visible-in-the-viewport/
     *
     */
    static scrollIntoViewIfNeeded(target, scrollIntoViewOptions) {
        // Target is outside the viewport from the bottom
        if (target.getBoundingClientRect().bottom > window.innerHeight) {
            //  The bottom of the target will be aligned to the bottom of the visible area of the scrollable ancestor.
            target.scrollIntoView(scrollIntoViewOptions);
        }

        // Target is outside the view from the top
        if (target.getBoundingClientRect().top < 0) {
            // The top of the target will be aligned to the top of the visible area of the scrollable ancestor
            target.scrollIntoView(scrollIntoViewOptions);
        }
    }
    static selectElementContents(el) {
      //source: https://stackoverflow.com/questions/4183401/can-you-set-and-or-change-the-user-s-text-selection-in-javascript
      if (window.getSelection && document.createRange) {
        var sel = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      } else if (document.selection && document.body.createTextRange) {
        var textRange = document.body.createTextRange();
        textRange.moveToElementText(el);
        textRange.select();
      }
    }
    static encodeVtitle(vtitle) {
      return vtitle.replace(/\s/g, '_').replace(/;/g, '%3B');
    }
    static _getVersionParams(version) {
      return `${version.languageFamilyName}|${this.encodeVtitle(version.versionTitle)}`;
    }
    static getUrlVersionsParams(currVersions, i=0) {
      if (currVersions) {
        return Object.entries(currVersions)
          .filter(([vlang, version]) => !!version?.versionTitle)
          .map(([vlang, version]) =>`&v${vlang}${i > 1 ? i : ""}=${this._getVersionParams(version)}`)
          .join("");
      } else {
        return "";
      }
    }
    static getObjectFromUrlParam(param) {
      const params = (params) ? param.split('|') : '';
      return {languageFamilyName: params[0], versionTitle: params[1]};
    }
    static decodeVtitle(vtitle) {
      return vtitle.replace(/_/g, ' ').replace(/%3B/g, ';');
    }
    static localeDate(dateString) {
        // takes dateString (usually generated from Python datetime object) and returns a human readable string depending on interfaceLang
        const locale = Sefaria.interfaceLang === 'english' ? 'en-US' : 'he-Hebr-IL';
        const dateOptions = {year: 'numeric', month: 'long', day: 'numeric'};
        return (new Date(dateString)).toLocaleDateString(locale, dateOptions);  // remove comma from english date
    }
    static createTimeZoneAgnosticDate = (dateString)=>{
      if (!dateString) return null;
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day, 12)); // Use noon UTC to avoid time shifts (most time zones are 12 hours off from UTC)
}
    static hebrewCalendarDateStr(dateObjStr){
        //returns a fully qualified Hebrew calendar date from a Gregorian input. Can output in English or Hebrew
        const hd = new HDate(new Date(dateObjStr));
        //Up to this we could have gotten away with built in international date objects in js:
        // By specifying dateOptions['calendar'] = 'hebrew'; as in the function above.
        //That would result in a hybrid hebrew date though, that still uses English numerals for day and year.
        //So we use Hebcal's renderGematriya()
        return Sefaria.interfaceLang === 'english' ? hd.render() : hd.renderGematriya();
    }
    static sign_up_user_testing() {
      // temporary function to be used in template 'user_testing_israel.html'
        const validateEmail = function(email) {
          const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
          return re.test(email);
        };
        const email = $('#email-input').val();
        if (!validateEmail(email)) {
            alert(email + ' is not a valid email');
            return;
        }
        console.log('Email valid', email);
        const feedback = {
          refs: null,
          type: 'user_testing',
          url: null,
          currVersions: null,
          email: email
        };
        const postData = {json: JSON.stringify(feedback)};
        $.post('/api/send_feedback', postData);
    }
    static naturalTimePlural(n, singular, plural) {
      return n <= 1 ? singular : plural;
    }
    static naturalTime(timeStamp, {lang, short}={}) {
      // given epoch time stamp, return string of time delta between `timeStamp` and now
      const now = Util.epoch_time();
      let language = lang ? lang : (Sefaria._getShortInterfaceLang());
      let spacer = " ";
      if(short){
          language = language == "en" ? "shortEn" : "shortHe";
          spacer = language == "shortEn" ? "" : " ";
      }
      return Util.sefariaHumanizeDuration(now - timeStamp, { "language": language, "spacer": spacer });
    }
    static object_equals(a, b) {
        // simple object equality assuming values are primitive. see here
        // http://adripofjavascript.com/blog/drips/object-equality-in-javascript.html
        if ((typeof a) !== (typeof b))      { return false; }
        if ((a === null && b !== null) || (a !== null && b === null))
                                            { return false; }
        const aProps = Object.getOwnPropertyNames(a);
        const bProps = Object.getOwnPropertyNames(b);
        if (aProps.length != bProps.length) { return false; }
        for (let propName of aProps) {
          if (a[propName] !== b[propName])  { return false; }
        }
        return true;
    }
    static epoch_time() {
      // get current epoch time in UTC
      // silly but thus is JS
      // see: https://stackoverflow.com/a/6777470/4246723
      const now = new Date();
      const nowUTC =  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
                               now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
      return Math.round(nowUTC/1000);
    }
    static stripImgs(s) {
      return !s ? "" : sanitizeHtml(s, {
          allowedTags: sanitizeHtml.defaults.allowedTags.filter(tag => tag !== 'img'),
          allowedAttributes: sanitizeHtml.defaults.allowedAttributes
      });
    }
    static zip(...rows) {
      // rows is an array
      // corrolary to zip in python
      return rows[0].map((_,c)=>rows.map(row=>row[c]));
    }
    static clone(obj, prepareForSerialization) {
        // Handle the 3 simple types, and null or undefined
        if (null == obj || "object" != typeof obj) {
            return obj;
        }

        if (typeof obj.clone === 'function') {
          // this handles any object with a clone function which currently
          // includes SearchState and FilterNode
          return obj.clone(prepareForSerialization);
        }

        // Handle Date
        if (obj instanceof Date) {
            const copy = new Date();
            copy.setTime(obj.getTime());
            return copy;
        }

        // Handle Array
        if (obj instanceof Array) {
            return obj.map(item => this.clone(item, prepareForSerialization));
        }

        // Handle Object
        if (obj instanceof Object) {
            const copy = {};
            for (const [attr, value] of Object.entries(obj)) {
                copy[attr] = this.clone(value, prepareForSerialization);
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

    static htmlToText(html){
        //remove code brakes and tabs
        html = html.replace(/\n/g, "");
        html = html.replace(/\t/g, "");

        //keep html brakes and tabs
        html = html.replace(/<\/td>/g, "\t");
        html = html.replace(/<\/table>/g, "\n");
        html = html.replace(/<\/tr>/g, "\n");
        html = html.replace(/<\/p>/g, "\n");
        html = html.replace(/<\/div>/g, "\n");
        html = html.replace(/<br>/g, "\n");
        html = html.replace(/<br( )*\/>/g, "\n");


        //parse html into text
        const dom = (new DOMParser()).parseFromString('<!doctype html><body>' + html, 'text/html');
        //remove duplicate line breaks
        const text = dom.body.textContent.replace(/\n\s*\n/g, "\n");

        return text
      }



    static cleanHTML(html) {
        html = html.replace(/\u00a0/g, ' ').replace(/&nbsp;/g, ' ').replace(new RegExp ("(\\n)+$", 'gm'), '');
        var clean = sanitizeHtml(html, {
            allowedTags: ['blockquote', 'p', 'a', 'ul', 'ol',
                'nl', 'li', 'b', 'i', 'strong', 'em', 'small', 'big', 'span', 'strike', 'hr', 'br', 'div',
                'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'sup','u', 'h1'],
            allowedAttributes: {
                a: ['href', 'name', 'target', 'class', 'data-ref'],
                img: ['src'],
                p: ['style'],
                span: ['style'],
                div: ['style'],
                td: ['colspan'],
            },
            allowedStyles: {
                '*': {
                    'color': [/^\#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
                    'background-color': [/^\#(0x)?[0-9a-f]+$/i, /^rgb(?!\(\s*255\s*,\s*255\s*,\s*255\s*\))\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
                    'text-align': [/^left$/, /^right$/, /^center$/],
                },
            },
            exclusiveFilter: function (frame) {
                return frame.tag === 'p' && !frame.text.trim();
            } //removes empty p tags  generated by ckeditor...

        });
        return clean;
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
    static modifyRelativePathbasedOnModule(path) {
      const sheetsPrefix = Sefaria.moduleRoutes[Sefaria.SHEETS_MODULE].slice(0, -1); // remove the last / from the sheets prefix
      if (Sefaria.activeModule === Sefaria.SHEETS_MODULE && (!path.startsWith(sheetsPrefix))) {
        // For modularization QA, we want to make sure /sheets is at the beginning of URL if and only if we are in the sheets module.
        return sheetsPrefix + path;
      }
      else if (Sefaria.activeModule !== Sefaria.SHEETS_MODULE && path.startsWith(sheetsPrefix)) {
        // If we are not in the sheets module, remove /sheets from the beginning of the URL
        return path.replace(sheetsPrefix, "");
      }
      return path;
    }
    static fullURL(relativePath, moduleTarget) {
      if (relativePath.startsWith("/")) { // if the path is relative, prepend the module URL
        const moduleURL = Sefaria.getModuleURL(moduleTarget); // derive the host URL from the module target (e.g. 'https://sheets.sefaria.org' or 'https://www.sefaria.org')
        return moduleURL.origin + relativePath;
      }
      // If it's already a full URL or not a relative path, return as is
      return relativePath;
    }
    static isUrl(string) {
      var res = string.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g);
      return (res !== null)
    }

    static parseUrl(url) {
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

    static parseHash(urlHash) {
      let sections = urlHash.split("&");
      let hashDict = {}
      sections.forEach(x => {
        const i = x.indexOf("=");
        if (i !== -1) {
          hashDict[x.slice(0,i)] = x.slice(i+1);
        } else {
          hashDict[x] = x;
        }
      })
      return hashDict;
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
    static commonSubstring(str1, str2){
        const length = Math.min(str1.length, str2.length);
        let index = 0;
        while(index<length && str1[index] === str2[index])
            index++;
        return str1.substring(0, index);
    }

    // ========== Keyboard & Accessibility Utilities ==========

    /**
     * Makes clickable elements keyboard accessible with Enter and Space keys.
     * Use this for divs, spans, or other non-button elements that need to be clickable.
     * 
     * @param {Event} e - Keyboard event
     * @param {Function} [onClick] - Custom click handler. If not provided, triggers element.click()
     * 
     * @example
     * // For elements that should trigger their own click behavior:
     * <a href="/path" onKeyDown={(e) => Util.handleKeyboardClick(e)}>Link</a>
     * 
     * @example
     * // For elements with custom click handlers:
     * <div onKeyDown={(e) => Util.handleKeyboardClick(e, myHandler)}>Clickable div</div>
     */
    static handleKeyboardClick(e, onClick) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (onClick) {
          onClick(e);
        } else {
          e.currentTarget.click();
        }
      }
    }

    /**
     * Makes links keyboard accessible with Space key.
     * For <a> elements: Enter is handled by default browser behavior, we only need Space.
     * 
     * @param {Event} e - Keyboard event
     * @param {Function} [onClick] - Optional click handler. If not provided, navigates to href.
     * 
     * @example
     * // For simple navigation links:
     * <a href="/path" onKeyDown={(e) => Util.handleLinkSpaceKey(e)}>Link</a>
     * 
     * @example
     * // For links with custom click handlers:
     * <a href="/path" onClick={myHandler} onKeyDown={(e) => Util.handleLinkSpaceKey(e, myHandler)}>Link</a>
     */
    static handleLinkSpaceKey(e, onClick) {
      if (e.key === ' ') {
        e.preventDefault();
        if (onClick) {
          onClick(e);
        } else {
          // For links without onClick, trigger default navigation
          e.target.click();
        }
      }
    }

    /**
     * Handles Enter key for form submissions and searches.
     * Commonly used for input fields to trigger search/submit on Enter.
     * 
     * @param {Event} e - Keyboard event
     * @param {Function} onEnter - Function to call when Enter is pressed
     * 
     * @example
     * <input onKeyUp={(e) => Util.handleEnterKey(e, submitForm)} />
     */
    static handleEnterKey(e, onEnter) {
      if (e.key === 'Enter') {
        onEnter(e);
      }
    }

    /**
     * Keyboard handler for dropdown/listbox trigger buttons.
     * Handles Enter, Space, and ArrowDown keys according to ARIA best practices.
     * 
     * @param {Event} e - Keyboard event
     * @param {Object} options - Configuration object
     * @param {Function} options.onToggle - Called when Enter or Space is pressed
     * @param {boolean} options.isOpen - Whether the dropdown is currently open
     * @param {HTMLElement} options.listboxRef - Reference to the listbox element (for focus management)
     * 
     * @example
     * <button onKeyDown={(e) => Util.handleDropdownTriggerKeyDown(e, {
     *   onToggle: () => this.toggleMenu(),
     *   isOpen: this.state.menuOpen,
     *   listboxRef: this.listboxRef
     * })}>Menu</button>
     */
    static handleDropdownTriggerKeyDown(e, { onToggle, isOpen, listboxRef }) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggle && onToggle();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) {
          onToggle && onToggle();
        } else if (listboxRef) {
          listboxRef.focus();
        }
      }
    }

    /**
     * Keyboard handler for dropdown/listbox content.
     * Handles arrow keys, Home, End, Enter, Space, and Escape according to ARIA best practices.
     * 
     * @param {Event} e - Keyboard event
     * @param {Object} options - Configuration object
     * @param {number} options.currentIndex - Current focused item index
     * @param {number} options.maxIndex - Maximum index (array.length - 1)
     * @param {Function} options.onNavigate - Called with new index when navigation occurs
     * @param {Function} options.onSelect - Called when Enter or Space is pressed
     * @param {Function} options.onClose - Called when Escape is pressed
     * @param {Function} [options.onScroll] - Optional callback to scroll focused item into view
     * @param {HTMLElement} [options.triggerRef] - Optional reference to trigger button (for focus return on close)
     * 
     * @example
     * <div role="listbox" onKeyDown={(e) => Util.handleListboxKeyDown(e, {
     *   currentIndex: this.state.focusedIndex,
     *   maxIndex: options.length - 1,
     *   onNavigate: (newIndex) => this.setState({ focusedIndex: newIndex }),
     *   onSelect: () => this.selectItem(this.state.focusedIndex),
     *   onClose: () => this.setState({ isOpen: false }),
     *   onScroll: () => this.activeOptionRef?.scrollIntoView({ block: 'nearest' }),
     *   triggerRef: this.triggerRef
     * })}>...</div>
     */
    static handleListboxKeyDown(e, { currentIndex, maxIndex, onNavigate, onSelect, onClose, onScroll, triggerRef }) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose && onClose();
        if (triggerRef) {
          triggerRef.focus();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = Math.min(currentIndex + 1, maxIndex);
        onNavigate && onNavigate(newIndex);
        onScroll && onScroll();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = Math.max(currentIndex - 1, 0);
        onNavigate && onNavigate(newIndex);
        onScroll && onScroll();
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        onNavigate && onNavigate(0);
        onScroll && onScroll();
        return;
      }

      if (e.key === 'End') {
        e.preventDefault();
        onNavigate && onNavigate(maxIndex);
        onScroll && onScroll();
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect && onSelect();
        return;
      }
    }

    /**
     * Standard selector for focusable elements used throughout the application.
     * Use this constant to ensure consistency in focus management.
     */
    static FOCUSABLE_SELECTOR = '[tabindex="0"], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="radio"]:not([disabled])';

    /**
     * Gets all focusable elements within a container.
     * 
     * @param {HTMLElement} container - The container element to search within
     * @param {string} [selector] - Optional custom selector. Defaults to FOCUSABLE_SELECTOR
     * @returns {NodeList} - Collection of focusable elements
     * 
     * @example
     * const focusable = Util.getFocusableElements(menuRef.current);
     */
    static getFocusableElements(container, selector = null) {
      if (!container) return [];
      return container.querySelectorAll(selector || this.FOCUSABLE_SELECTOR);
    }

    /**
     * Focuses the first focusable element within a container.
     * Commonly used when opening menus or dialogs.
     * 
     * @param {HTMLElement} container - The container element to search within
     * @param {string} [selector] - Optional custom selector. Defaults to FOCUSABLE_SELECTOR
     * @returns {boolean} - True if an element was focused, false otherwise
     * 
     * @example
     * useEffect(() => {
     *   if (isOpen && menuRef.current) {
     *     Util.focusFirstElement(menuRef.current);
     *   }
     * }, [isOpen]);
     */
    static focusFirstElement(container, selector = null) {
      if (!container) return false;
      const firstFocusable = container.querySelector(selector || this.FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
        return true;
      }
      return false;
    }

    /**
     * Handles Tab key focus trapping and Escape key for dropdown menus.
     * Traps focus within the container when Tab is pressed, and closes menu on Escape.
     * 
     * @param {Event} e - Keyboard event
     * @param {Object} options - Configuration object
     * @param {HTMLElement} options.container - The container to trap focus within
     * @param {Function} options.onClose - Called when Escape is pressed
     * @param {HTMLElement} [options.returnFocusRef] - Element to return focus to on Escape
     * @param {string} [options.selector] - Optional custom selector for focusable elements
     * 
     * @example
     * const handleMenuKeyDown = (e) => {
     *   Util.trapFocusWithTab(e, {
     *     container: menuRef.current,
     *     onClose: () => setIsOpen(false),
     *     returnFocusRef: buttonRef.current
     *   });
     * };
     */
    static trapFocusWithTab(e, { container, onClose, returnFocusRef, selector = null }) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose && onClose();
        if (returnFocusRef) {
          returnFocusRef.focus();
        }
        return;
      }

      if (e.key === 'Tab' && container) {
        const focusableElements = this.getFocusableElements(container, selector);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }

    // ========== End Keyboard & Accessibility Utilities ==========
    
    /**
     * Finds the longest common suffix among an array of strings
     * 
     * This function is similar to commonSubstring but works from the end (suffix)
     * instead of the beginning (prefix), and works with an array of strings instead
     * of just two strings.
     * 
     * @param {string[]} strings - Array of strings to analyze
     * @returns {string} - The longest common suffix
     * 
     * @example
     * findLongestCommonSuffix(["hello world", "goodbye world"]) // returns " world"
     * findLongestCommonSuffix(["abc", "def"]) // returns ""
     * findLongestCommonSuffix(["www.sefaria.org", "sheets.sefaria.org"]) // returns ".sefaria.org"
     */
    static findLongestCommonSuffix(strings) {
        if (strings.length === 0) return '';
        if (strings.length === 1) return strings[0];
        
        // Start with the first string as the potential common suffix
        let commonSuffix = strings[0];
        
        // Check each subsequent string to see if it ends with the current common suffix
        for (let i = 1; i < strings.length; i++) {
            const str = strings[i];
            
            // Keep removing characters from the beginning until we find a match
            while (commonSuffix && !str.endsWith(commonSuffix)) {
                commonSuffix = commonSuffix.slice(1);
            }
            
            // If no common suffix found, return empty string
            if (!commonSuffix) {
                return '';
            }
        }
        
        return commonSuffix;
    }
    
    /**
     * Checks if a hostname is an IP address (IPv4).
     * 
     * @param {string} hostname - The hostname to check
     * @returns {boolean} - True if the hostname is an IPv4 address
     */
    static isIPAddress(hostname) {
        return /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    }
    
    /**
     * Determines the appropriate cookie domain for cross-subdomain cookie sharing.
     * 
     * This function analyzes Sefaria.domainModules to find the common parent domain
     * that all configured modules share, then uses that as the cookie domain.
     * 
     * Why this approach is better:
     * - Uses the actual configured domains rather than guessing from current hostname
     * - Automatically adapts to any domain configuration without hardcoded logic
     * - Leverages the existing domain module system that's already working
     * 
     * How it works:
     * 1. Extract hostnames from all domain modules (e.g., "www.sefaria.org", "sheets.sefaria.org")
     * 2. Use Sefaria.util.findLongestCommonSuffix() to find the longest common suffix that all hostnames share
     * 3. Use that as the cookie domain (e.g., ".sefaria.org")
     * 
     * Examples:
     * - Production: ["www.sefaria.org", "sheets.sefaria.org"] → ".sefaria.org"
     * - Cauldron: ["modularization.cauldron.sefaria.org", "sheets.modularization.cauldron.sefaria.org"] → ".modularization.cauldron.sefaria.org"
     * - Development: ["localhost:8000", "localhost:8000"] → null (no domain set)
     * 
     * @returns {string|null} - The cookie domain (e.g., ".sefaria.org") or null if no domain should be set
     */
    static getCookieDomain() {
        // Check if Sefaria.domainModules is available
        if (!Sefaria.domainModules || typeof Sefaria.domainModules !== 'object') {
            return null;
        }
        
        // Extract hostnames from all domain modules
        const hostnames = [];
        for (const [_, moduleUrl] of Object.entries(Sefaria.domainModules)) {
            try {
                const url = new URL(moduleUrl);
                hostnames.push(url.hostname);
            } catch (e) {
                // Invalid URL - skip this module
            }
        }
        
        // Skip domain setting for empty hostnames and local development.
        // IP addresses don't have subdomain support.
        // Browsers don't allow setting cookies with domain ".localhost"
        // For localhost development, we need to dismiss the cookie banner on each module if we are using sheets.localhost
        if (!hostnames.length || hostnames.some(hostname => Util.isIPAddress(hostname) || hostname.includes('localhost'))) {
            return null;
        }
        
        // Find the longest common suffix
        const commonSuffix = Util.findLongestCommonSuffix(hostnames);
        
        if (commonSuffix && commonSuffix.length > 0) {
            // Special handling for domain suffixes that don't start with "."
            // This happens when we have a mix of bare domains and subdomains:
            // - ["sefaria.org", "sheets.sefaria.org"] → commonSuffix = "sefaria.org" (should be ".sefaria.org")
            let domainSuffix = commonSuffix;
            if (!domainSuffix.startsWith('.')) {
                domainSuffix = '.' + domainSuffix;
            }
            
            return domainSuffix;
        }
        
        // No common suffix found - fallback to original simple logic (no domain set)
        return null;
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
          return striptags(this.replace(/\u00a0/g, ' ').decodeHtmlEntities());
        };

        String.prototype.stripNikkud = function() {
          return this.replace(/[\u0591-\u05C7]/g,"");
        }

        String.prototype.stripHtmlConvertLineBreaks = function() {
          // Converts line breaks to spaces
          return striptags(this.replace(/\u00a0/g, ' ').decodeHtmlEntities().replace(/<p>/g, ' <p>').replace(/(<br>|\n)+/g,' '));
        };

        String.prototype.stripPunctuation = function() {
          const regex = /[!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/g;
          return this.replace(regex, '');
        };

        String.prototype.escapeHtml = function() {
          return this.replace(/&/g,'&amp;')
                      .replace(/</g,'&lt;')
                      .replace(/>/g,'&gt;')
                      .replace(/'/g,'&apos;')
                      .replace(/"/g,'&quot;')
                      .replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br />$2');
        };

        String.prototype.decodeHtmlEntities = function() {
          return this.replace(/&nbsp;/gi, " ")
                      .replace(/&amp;/gi, "&")
                      .replace(/&quot;/gi, `"`)
                      .replace(/&lt;/gi, "<")
                      .replace(/&gt;/gi, ">");
        };

        if (!String.prototype.startsWith) {
            String.prototype.startsWith = function(searchString, position){
              position = position || 0;
              return this.substr(position, searchString.length) === searchString;
          };
        }

        String.prototype.splitCamelCase = function() {
              return this.replace(/([A-Z])/g, ' $1')
                          .trim()
                          .replace(/^./, str => str.toUpperCase())
        };

        String.prototype.camelize = function() {
          return this.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
            if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
            return index === 0 ? match.toLowerCase() : match.toUpperCase();
          });
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

        Array.prototype.elementsAreEqual = function (testArr) {
          // uses Object.is() to determine is elements point to same objects even if outer array is different
          if (!testArr || (this.length != testArr.length)) return false;
          for (var i = 0; i < testArr.length; i++) {
              if (!Object.is(this[i], testArr[i])) return false;
          }
          return true;
        }

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
        /*  I highly suspect that these functions work properly. Not worth the slight performance gain. Commenting out for now in case we want to revisit later.
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
        */

        Number.prototype.addCommas = function() {
          return this.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
        // Protect against browsers without consoles and forgotten console statements
        if(typeof(console) === 'undefined') {
            var console = {};
            console.log = function() {};
        }
    }
    static handleUserCookie(uid) {
        var cookie = INBROWSER ? $.cookie : this.cookie;

        if (uid) {
            // If logged in, replace cookie with current system details

            var expires = new Date(); // starts with current time
            expires.setTime(expires.getTime() + 2 * 365 * 24 * 3600 * 1000);  // milliseconds

            cookie("_user", JSON.stringify({
               _uid: uid,
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
    static getNormalizedSelectionString(){
          const selection = window.getSelection()
          if (selection.rangeCount) {
              let container = document.createElement("div");
              for (let i = 0, len = selection.rangeCount; i < len; ++i) {
                  container.appendChild(selection.getRangeAt(i).cloneContents());
              }
                //remove line numbers
              let lineNumbers = container.getElementsByClassName('segmentNumber');
              while(lineNumbers.length > 0){
                  lineNumbers[0].parentNode.removeChild(lineNumbers[0]);
              }
              let titleBoxes = container.getElementsByClassName('titleBox');
              while(titleBoxes.length > 0){
                  titleBoxes[0].parentNode.removeChild(titleBoxes[0]);
              }
              //remove other language. will need to be generalized for
              var curReaderPanel = (selection.getRangeAt(0).commonAncestorContainer.parentNode.closest('.readerPanel'))
              if (curReaderPanel && curReaderPanel.classList.contains('hebrew')) {
                  var elsToRemove = container.getElementsByClassName('en')
                  while(elsToRemove.length > 0){
                      elsToRemove[0].parentNode.removeChild(elsToRemove[0]);
                  }
              }
              else if (curReaderPanel && curReaderPanel.classList.contains('english')) {
                  var elsToRemove = container.getElementsByClassName('he')
                  while(elsToRemove.length > 0){
                      elsToRemove[0].parentNode.removeChild(elsToRemove[0]);
                  }
              }
              return container.innerText;
          }
          else {
              return selection.toString();
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
      //TODO: This does not create the correct urls for multipanel views. It ends up just tacking on an extra "with" param on the end
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

        this.dropdownAnchorSide = this.options.interfaceLang == "he" ? "right" : "left";

        this.$input
            .on("input", this.check.bind(this))
            .keyup(function(e) {
                  if (e.keyCode == 13) {
                      if (!this.$ok.hasClass('disabled')) { this.$ok.trigger("click"); }
                  }
                }.bind(this))
            .autocomplete({
                source: function(request, response) {
                  Sefaria.getName(request.term, undefined, 'ref')
                         .then(d => d.completions)
                         .then(response);
                },
                position: {my: this.dropdownAnchorSide + " top", at: this.dropdownAnchorSide + " bottom"},
                select: (event, ui) => this._lookupAndRoute(ui.item.value),
                minLength: 3,
                focus: ( event, ui ) => {
                  $(".ui-menu-item.ui-state-focus").removeClass("ui-state-focus");
                  $("a.ui-state-focus").parent().addClass("ui-state-focus");
                }
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
      if (this.current_lookup_ajax) {this.current_lookup_ajax.cancel();}
      this.current_lookup_ajax = Sefaria.makeCancelable(Sefaria.getName(inString, undefined, 'ref'));
      this.current_lookup_ajax.promise.then(data => {
              // If this query has been outpaced by typing, just return.
              if (this.$input.val() != inString) { this.current_lookup_ajax = null; return; }

              // If the query isn't recognized as a ref, but only for reasons of capitalization. Resubmit with recognizable caps.
              if (Sefaria.isACaseVariant(inString, data)) {
                this._lookupAndRoute(Sefaria.repairCaseVariant(inString, data));
                this.current_lookup_ajax = null;
                return;
              }

              this.$msg.css("direction", (data["lang"]=="he"?"rtl":"ltr"))
                  .html(this._getMessage(inString, data));
              if (!data.is_ref && this.options.allow_new_titles) {
                  this._allow(inString);
                  this.current_lookup_ajax = null;
                  return;
              }
              if (data.is_ref && (data.is_section || (data.is_segment && !this.options.disallow_segments))) {
                this._allow(inString, data["ref"]);  //pass normalized ref
                this.current_lookup_ajax = null;
                return;
              }
              this._disallow();
              this.current_lookup_ajax = null;
          });
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
        segments = Sefaria.stripImagesFromSegments(segments);
        var en = segments.map(this._preview_segment_mapper.bind(this, "en")).filter(Boolean);
        var he = segments.map(this._preview_segment_mapper.bind(this, "he")).filter(Boolean);

        // Handle missing text cases
        var path = parseURL(document.URL).path;
        if (!en.length && !he.length) {this.$msg.html("<i>No text available. Click below to add this text.</i>");}

        // Set it on the DOM
        this.$input.autocomplete("disable");
        this.$preview.show();
        this.$preview.html("<div class='en'>" + en.join("") + "</div>" + "<div class='he'>" + he.join("") + "</div>");
        this.$preview.position({my: this.dropdownAnchorSide + " top", at: this.dropdownAnchorSide + " bottom", of: this.$input, collision: "none" }).width('691px');
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
const secsInDay = 24 * 60 * 60;
Util._cookies = {};
Util._scrollbarWidth = null;
Util.sefariaHumanizeDuration = humanizeDuration.humanizer({
  units: ['y', 'mo', 'w', 'd', 'h', 'm', 's'],
  largest: 1,
  round: true,
  unitMeasures: {
    y: 365 * secsInDay,
    mo: 30 * secsInDay,
    w: 7 * secsInDay,
    d: secsInDay,
    h: 60 * 60,
    m: 60,
    s: 1,
  },
  languages: {
    shortEn: {
      y: () => "y",
      mo: () => "mo",
      w: () => "w",
      d: () => "d",
      h: () => "h",
      m: () => "m",
      s: () => "s",
      ms: () => "ms",
    },
    shortHe: {
      y: () => "ש'",
      mo: () => "ח'",
      w: () => "שב'",
      d: () => "י'",
      h: () => "שע'",
      m: () => "דק'",
      s: () => "שנ'",
      ms: () => "מלש'",
    },
  },
});


export default Util;
