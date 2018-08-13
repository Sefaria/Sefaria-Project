{% autoescape off %}
//called as sefaria.tag("#element-id");

(function(ns){

    //Test browser support
    var supports = !!document.querySelectorAll && !!window.addEventListener && !!Object.getOwnPropertyNames && !!document.body.textContent;
    if ( !supports ) return;

    //Libraries
    //XRegExp 2.0.0 <xregexp.com> MIT License
    var XRegExp;XRegExp=XRegExp||function(n){"use strict";function v(n,i,r){var u;for(u in t.prototype)t.prototype.hasOwnProperty(u)&&(n[u]=t.prototype[u]);return n.xregexp={captureNames:i,isNative:!!r},n}function g(n){return(n.global?"g":"")+(n.ignoreCase?"i":"")+(n.multiline?"m":"")+(n.extended?"x":"")+(n.sticky?"y":"")}function o(n,r,u){if(!t.isRegExp(n))throw new TypeError("type RegExp expected");var f=i.replace.call(g(n)+(r||""),h,"");return u&&(f=i.replace.call(f,new RegExp("["+u+"]+","g"),"")),n=n.xregexp&&!n.xregexp.isNative?v(t(n.source,f),n.xregexp.captureNames?n.xregexp.captureNames.slice(0):null):v(new RegExp(n.source,f),null,!0)}function a(n,t){var i=n.length;if(Array.prototype.lastIndexOf)return n.lastIndexOf(t);while(i--)if(n[i]===t)return i;return-1}function s(n,t){return Object.prototype.toString.call(n).toLowerCase()==="[object "+t+"]"}function d(n){return n=n||{},n==="all"||n.all?n={natives:!0,extensibility:!0}:s(n,"string")&&(n=t.forEach(n,/[^\s,]+/,function(n){this[n]=!0},{})),n}function ut(n,t,i,u){var o=p.length,s=null,e,f;y=!0;try{while(o--)if(f=p[o],(f.scope==="all"||f.scope===i)&&(!f.trigger||f.trigger.call(u))&&(f.pattern.lastIndex=t,e=r.exec.call(f.pattern,n),e&&e.index===t)){s={output:f.handler.call(u,e,i),match:e};break}}catch(h){throw h;}finally{y=!1}return s}function b(n){t.addToken=c[n?"on":"off"],f.extensibility=n}function tt(n){RegExp.prototype.exec=(n?r:i).exec,RegExp.prototype.test=(n?r:i).test,String.prototype.match=(n?r:i).match,String.prototype.replace=(n?r:i).replace,String.prototype.split=(n?r:i).split,f.natives=n}var t,c,u,f={natives:!1,extensibility:!1},i={exec:RegExp.prototype.exec,test:RegExp.prototype.test,match:String.prototype.match,replace:String.prototype.replace,split:String.prototype.split},r={},k={},p=[],e="default",rt="class",it={"default":/^(?:\\(?:0(?:[0-3][0-7]{0,2}|[4-7][0-7]?)?|[1-9]\d*|x[\dA-Fa-f]{2}|u[\dA-Fa-f]{4}|c[A-Za-z]|[\s\S])|\(\?[:=!]|[?*+]\?|{\d+(?:,\d*)?}\??)/,"class":/^(?:\\(?:[0-3][0-7]{0,2}|[4-7][0-7]?|x[\dA-Fa-f]{2}|u[\dA-Fa-f]{4}|c[A-Za-z]|[\s\S]))/},et=/\$(?:{([\w$]+)}|(\d\d?|[\s\S]))/g,h=/([\s\S])(?=[\s\S]*\1)/g,nt=/^(?:[?*+]|{\d+(?:,\d*)?})\??/,ft=i.exec.call(/()??/,"")[1]===n,l=RegExp.prototype.sticky!==n,y=!1,w="gim"+(l?"y":"");return t=function(r,u){if(t.isRegExp(r)){if(u!==n)throw new TypeError("can't supply flags when constructing one RegExp from another");return o(r)}if(y)throw new Error("can't call the XRegExp constructor within token definition functions");var l=[],a=e,b={hasNamedCapture:!1,captureNames:[],hasFlag:function(n){return u.indexOf(n)>-1}},f=0,c,s,p;if(r=r===n?"":String(r),u=u===n?"":String(u),i.match.call(u,h))throw new SyntaxError("invalid duplicate regular expression flag");for(r=i.replace.call(r,/^\(\?([\w$]+)\)/,function(n,t){if(i.test.call(/[gy]/,t))throw new SyntaxError("can't use flag g or y in mode modifier");return u=i.replace.call(u+t,h,""),""}),t.forEach(u,/[\s\S]/,function(n){if(w.indexOf(n[0])<0)throw new SyntaxError("invalid regular expression flag "+n[0]);});f<r.length;)c=ut(r,f,a,b),c?(l.push(c.output),f+=c.match[0].length||1):(s=i.exec.call(it[a],r.slice(f)),s?(l.push(s[0]),f+=s[0].length):(p=r.charAt(f),p==="["?a=rt:p==="]"&&(a=e),l.push(p),++f));return v(new RegExp(l.join(""),i.replace.call(u,/[^gimy]+/g,"")),b.hasNamedCapture?b.captureNames:null)},c={on:function(n,t,r){r=r||{},n&&p.push({pattern:o(n,"g"+(l?"y":"")),handler:t,scope:r.scope||e,trigger:r.trigger||null}),r.customFlags&&(w=i.replace.call(w+r.customFlags,h,""))},off:function(){throw new Error("extensibility must be installed before using addToken");}},t.addToken=c.off,t.cache=function(n,i){var r=n+"/"+(i||"");return k[r]||(k[r]=t(n,i))},t.escape=function(n){return i.replace.call(n,/[-[\]{}()*+?.,\\^$|#\s]/g,"\\$&")},t.exec=function(n,t,i,u){var e=o(t,"g"+(u&&l?"y":""),u===!1?"y":""),f;return e.lastIndex=i=i||0,f=r.exec.call(e,n),u&&f&&f.index!==i&&(f=null),t.global&&(t.lastIndex=f?e.lastIndex:0),f},t.forEach=function(n,i,r,u){for(var e=0,o=-1,f;f=t.exec(n,i,e);)r.call(u,f,++o,n,i),e=f.index+(f[0].length||1);return u},t.globalize=function(n){return o(n,"g")},t.install=function(n){n=d(n),!f.natives&&n.natives&&tt(!0),!f.extensibility&&n.extensibility&&b(!0)},t.isInstalled=function(n){return!!f[n]},t.isRegExp=function(n){return s(n,"regexp")},t.matchChain=function(n,i){return function r(n,u){for(var o=i[u].regex?i[u]:{regex:i[u]},f=[],s=function(n){f.push(o.backref?n[o.backref]||"":n[0])},e=0;e<n.length;++e)t.forEach(n[e],o.regex,s);return u===i.length-1||!f.length?f:r(f,u+1)}([n],0)},t.replace=function(i,u,f,e){var c=t.isRegExp(u),s=u,h;return c?(e===n&&u.global&&(e="all"),s=o(u,e==="all"?"g":"",e==="all"?"":"g")):e==="all"&&(s=new RegExp(t.escape(String(u)),"g")),h=r.replace.call(String(i),s,f),c&&u.global&&(u.lastIndex=0),h},t.split=function(n,t,i){return r.split.call(n,t,i)},t.test=function(n,i,r,u){return!!t.exec(n,i,r,u)},t.uninstall=function(n){n=d(n),f.natives&&n.natives&&tt(!1),f.extensibility&&n.extensibility&&b(!1)},t.union=function(n,i){var l=/(\()(?!\?)|\\([1-9]\d*)|\\[\s\S]|\[(?:[^\\\]]|\\[\s\S])*]/g,o=0,f,h,c=function(n,t,i){var r=h[o-f];if(t){if(++o,r)return"(?<"+r+">"}else if(i)return"\\"+(+i+f);return n},e=[],r,u;if(!(s(n,"array")&&n.length))throw new TypeError("patterns must be a nonempty array");for(u=0;u<n.length;++u)r=n[u],t.isRegExp(r)?(f=o,h=r.xregexp&&r.xregexp.captureNames||[],e.push(t(r.source).source.replace(l,c))):e.push(t.escape(r));return t(e.join("|"),i)},t.version="2.0.0",r.exec=function(t){var r,f,e,o,u;if(this.global||(o=this.lastIndex),r=i.exec.apply(this,arguments),r){if(!ft&&r.length>1&&a(r,"")>-1&&(e=new RegExp(this.source,i.replace.call(g(this),"g","")),i.replace.call(String(t).slice(r.index),e,function(){for(var t=1;t<arguments.length-2;++t)arguments[t]===n&&(r[t]=n)})),this.xregexp&&this.xregexp.captureNames)for(u=1;u<r.length;++u)f=this.xregexp.captureNames[u-1],f&&(r[f]=r[u]);this.global&&!r[0].length&&this.lastIndex>r.index&&(this.lastIndex=r.index)}return this.global||(this.lastIndex=o),r},r.test=function(n){return!!r.exec.call(this,n)},r.match=function(n){if(t.isRegExp(n)){if(n.global){var u=i.match.apply(this,arguments);return n.lastIndex=0,u}}else n=new RegExp(n);return r.exec.call(n,this)},r.replace=function(n,r){var e=t.isRegExp(n),u,f,h,o;return e?(n.xregexp&&(u=n.xregexp.captureNames),n.global||(o=n.lastIndex)):n+="",s(r,"function")?f=i.replace.call(String(this),n,function(){var t=arguments,i;if(u)for(t[0]=new String(t[0]),i=0;i<u.length;++i)u[i]&&(t[0][u[i]]=t[i+1]);return e&&n.global&&(n.lastIndex=t[t.length-2]+t[0].length),r.apply(null,t)}):(h=String(this),f=i.replace.call(h,n,function(){var n=arguments;return i.replace.call(String(r),et,function(t,i,r){var f;if(i){if(f=+i,f<=n.length-3)return n[f]||"";if(f=u?a(u,i):-1,f<0)throw new SyntaxError("backreference to undefined group "+t);return n[f+1]||""}if(r==="$")return"$";if(r==="&"||+r==0)return n[0];if(r==="`")return n[n.length-1].slice(0,n[n.length-2]);if(r==="'")return n[n.length-1].slice(n[n.length-2]+n[0].length);if(r=+r,!isNaN(r)){if(r>n.length-3)throw new SyntaxError("backreference to undefined group "+t);return n[r]||""}throw new SyntaxError("invalid token "+t);})})),e&&(n.lastIndex=n.global?0:o),f},r.split=function(r,u){if(!t.isRegExp(r))return i.split.apply(this,arguments);var e=String(this),h=r.lastIndex,f=[],o=0,s;return u=(u===n?-1:u)>>>0,t.forEach(e,r,function(n){n.index+n[0].length>o&&(f.push(e.slice(o,n.index)),n.length>1&&n.index<e.length&&Array.prototype.push.apply(f,n.slice(1)),s=n[0].length,o=n.index+s)}),o===e.length?(!i.test.call(r,"")||s)&&f.push(""):f.push(e.slice(o)),r.lastIndex=h,f.length>u?f.slice(0,u):f},u=c.on,u(/\\([ABCE-RTUVXYZaeg-mopqyz]|c(?![A-Za-z])|u(?![\dA-Fa-f]{4})|x(?![\dA-Fa-f]{2}))/,function(n,t){if(n[1]==="B"&&t===e)return n[0];throw new SyntaxError("invalid escape "+n[0]);},{scope:"all"}),u(/\[(\^?)]/,function(n){return n[1]?"[\\s\\S]":"\\b\\B"}),u(/(?:\(\?#[^)]*\))+/,function(n){return i.test.call(nt,n.input.slice(n.index+n[0].length))?"":"(?:)"}),u(/\\k<([\w$]+)>/,function(n){var t=isNaN(n[1])?a(this.captureNames,n[1])+1:+n[1],i=n.index+n[0].length;if(!t||t>this.captureNames.length)throw new SyntaxError("backreference to undefined group "+n[0]);return"\\"+t+(i===n.input.length||isNaN(n.input.charAt(i))?"":"(?:)")}),u(/(?:\s+|#.*)+/,function(n){return i.test.call(nt,n.input.slice(n.index+n[0].length))?"":"(?:)"},{trigger:function(){return this.hasFlag("x")},customFlags:"x"}),u(/\./,function(){return"[\\s\\S]"},{trigger:function(){return this.hasFlag("s")},customFlags:"s"}),u(/\(\?P?<([\w$]+)>/,function(n){if(!isNaN(n[1]))throw new SyntaxError("can't use integer as capture name "+n[0]);return this.captureNames.push(n[1]),this.hasNamedCapture=!0,"("}),u(/\\(\d+)/,function(n,t){if(!(t===e&&/^[1-9]/.test(n[1])&&+n[1]<=this.captureNames.length)&&n[1]!=="0")throw new SyntaxError("can't use octal escape or backreference to undefined group "+n[0]);return n[0]},{scope:"all"}),u(/\((?!\?)/,function(){return this.hasFlag("n")?"(?:":(this.captureNames.push(null),"(")},{customFlags:"n"}),typeof exports!="undefined"&&(exports.XRegExp=t),t}()
    /*! atomic v1.0.0 | (c) 2014 @toddmotto | github.com/toddmotto/atomic */
    !function(a,b){"function"==typeof define&&define.amd?define(b):"object"==typeof exports?module.exports=b:a.atomic=b(a)}(this,function(a){"use strict";var b={},c=function(a){var b;try{b=JSON.parse(a.responseText)}catch(c){b=a.responseText}return[b,a]},d=function(b,d,e){var f={success:function(){},error:function(){}},g=a.XMLHttpRequest||ActiveXObject,h=new g("MSXML2.XMLHTTP.3.0");return h.open(b,d,!0),h.setRequestHeader("Content-type","application/x-www-form-urlencoded"),h.onreadystatechange=function(){4===h.readyState&&(200===h.status?f.success.apply(f,c(h)):f.error.apply(f,c(h)))},h.send(e),{success:function(a){return f.success=a,f},error:function(a){return f.error=a,f}}};return b.get=function(a){return d("GET",a)},b.put=function(a,b){return d("PUT",a,b)},b.post=function(a,b){return d("POST",a,b)},b["delete"]=function(a){return d("DELETE",a)},b});
    /* findAndReplaceDOMText v 0.4.3 | https://github.com/padolsey/findAndReplaceDOMText */
    !function(e,t){"object"==typeof module&&module.exports?module.exports=t():"function"==typeof define&&define.amd?define(t):e.findAndReplaceDOMText=t()}(this,function(){function e(e){return String(e).replace(/([.*+?^=!:${}()|[\]\/\\])/g,"\\$1")}function t(){return n.apply(null,arguments)||r.apply(null,arguments)}function n(e,n,i,o,d){if(n&&!n.nodeType&&arguments.length<=2)return!1;var a="function"==typeof i;a&&(i=function(e){return function(t,n){return e(t.text,n.startIndex)}}(i));var s=r(n,{find:e,wrap:a?null:i,replace:a?i:"$"+(o||"&"),prepMatch:function(e,t){if(!e[0])throw"findAndReplaceDOMText cannot handle zero-length matches";if(o>0){var n=e[o];e.index+=e[0].indexOf(n),e[0]=n}return e.endIndex=e.index+e[0].length,e.startIndex=e.index,e.index=t,e},filterElements:d});return t.revert=function(){return s.revert()},!0}function r(e,t){return new i(e,t)}function i(e,n){var r=n.preset&&t.PRESETS[n.preset];if(n.portionMode=n.portionMode||o,r)for(var i in r)s.call(r,i)&&!s.call(n,i)&&(n[i]=r[i]);this.node=e,this.options=n,this.prepMatch=n.prepMatch||this.prepMatch,this.reverts=[],this.matches=this.search(),this.matches.length&&this.processMatches()}var o="retain",d="first",a=document,s=({}.toString,{}.hasOwnProperty);return t.NON_PROSE_ELEMENTS={br:1,hr:1,script:1,style:1,img:1,video:1,audio:1,canvas:1,svg:1,map:1,object:1,input:1,textarea:1,select:1,option:1,optgroup:1,button:1},t.NON_CONTIGUOUS_PROSE_ELEMENTS={address:1,article:1,aside:1,blockquote:1,dd:1,div:1,dl:1,fieldset:1,figcaption:1,figure:1,footer:1,form:1,h1:1,h2:1,h3:1,h4:1,h5:1,h6:1,header:1,hgroup:1,hr:1,main:1,nav:1,noscript:1,ol:1,output:1,p:1,pre:1,section:1,ul:1,br:1,li:1,summary:1,dt:1,details:1,rp:1,rt:1,rtc:1,script:1,style:1,img:1,video:1,audio:1,canvas:1,svg:1,map:1,object:1,input:1,textarea:1,select:1,option:1,optgroup:1,button:1,table:1,tbody:1,thead:1,th:1,tr:1,td:1,caption:1,col:1,tfoot:1,colgroup:1},t.NON_INLINE_PROSE=function(e){return s.call(t.NON_CONTIGUOUS_PROSE_ELEMENTS,e.nodeName.toLowerCase())},t.PRESETS={prose:{forceContext:t.NON_INLINE_PROSE,filterElements:function(e){return!s.call(t.NON_PROSE_ELEMENTS,e.nodeName.toLowerCase())}}},t.Finder=i,i.prototype={search:function(){function t(e){for(var d=0,p=e.length;p>d;++d){var h=e[d];if("string"==typeof h){if(o.global)for(;n=o.exec(h);)a.push(s.prepMatch(n,r++,i));else(n=h.match(o))&&a.push(s.prepMatch(n,0,i));i+=h.length}else t(h)}}var n,r=0,i=0,o=this.options.find,d=this.getAggregateText(),a=[],s=this;return o="string"==typeof o?RegExp(e(o),"g"):o,t(d),a},prepMatch:function(e,t,n){if(!e[0])throw new Error("findAndReplaceDOMText cannot handle zero-length matches");return e.endIndex=n+e.index+e[0].length,e.startIndex=n+e.index,e.index=t,e},getAggregateText:function(){function e(r,i){if(3===r.nodeType)return[r.data];if(t&&!t(r))return[];var i=[""],o=0;if(r=r.firstChild)do if(3!==r.nodeType){var d=e(r);n&&1===r.nodeType&&(n===!0||n(r))?(i[++o]=d,i[++o]=""):("string"==typeof d[0]&&(i[o]+=d.shift()),d.length&&(i[++o]=d,i[++o]=""))}else i[o]+=r.data;while(r=r.nextSibling);return i}var t=this.options.filterElements,n=this.options.forceContext;return e(this.node)},processMatches:function(){var e,t,n,r=this.matches,i=this.node,o=this.options.filterElements,d=[],a=i,s=r.shift(),p=0,h=0,l=0,c=[i];e:for(;;){if(3===a.nodeType&&(!t&&a.length+p>=s.endIndex?t={node:a,index:l++,text:a.data.substring(s.startIndex-p,s.endIndex-p),indexInMatch:p-s.startIndex,indexInNode:s.startIndex-p,endIndexInNode:s.endIndex-p,isEnd:!0}:e&&d.push({node:a,index:l++,text:a.data,indexInMatch:p-s.startIndex,indexInNode:0}),!e&&a.length+p>s.startIndex&&(e={node:a,index:l++,indexInMatch:0,indexInNode:s.startIndex-p,endIndexInNode:s.endIndex-p,text:a.data.substring(s.startIndex-p,s.endIndex-p)}),p+=a.data.length),n=1===a.nodeType&&o&&!o(a),e&&t){if(a=this.replaceMatch(s,e,d,t),p-=t.node.data.length-t.endIndexInNode,e=null,t=null,d=[],s=r.shift(),l=0,h++,!s)break}else if(!n&&(a.firstChild||a.nextSibling)){a.firstChild?(c.push(a),a=a.firstChild):a=a.nextSibling;continue}for(;;){if(a.nextSibling){a=a.nextSibling;break}if(a=c.pop(),a===i)break e}}},revert:function(){for(var e=this.reverts.length;e--;)this.reverts[e]();this.reverts=[]},prepareReplacementString:function(e,t,n){var r=this.options.portionMode;return r===d&&t.indexInMatch>0?"":(e=e.replace(/\$(\d+|&|`|')/g,function(e,t){var r;switch(t){case"&":r=n[0];break;case"`":r=n.input.substring(0,n.startIndex);break;case"'":r=n.input.substring(n.endIndex);break;default:r=n[+t]}return r}),r===d?e:t.isEnd?e.substring(t.indexInMatch):e.substring(t.indexInMatch,t.indexInMatch+t.text.length))},getPortionReplacementNode:function(e,t,n){var r=this.options.replace||"$&",i=this.options.wrap;if(i&&i.nodeType){var o=a.createElement("div");o.innerHTML=i.outerHTML||(new XMLSerializer).serializeToString(i),i=o.firstChild}if("function"==typeof r)return r=r(e,t,n),r&&r.nodeType?r:a.createTextNode(String(r));var d="string"==typeof i?a.createElement(i):i;return r=a.createTextNode(this.prepareReplacementString(r,e,t,n)),r.data&&d?(d.appendChild(r),d):r},replaceMatch:function(e,t,n,r){var i,o,d=t.node,s=r.node;if(d===s){var p=d;t.indexInNode>0&&(i=a.createTextNode(p.data.substring(0,t.indexInNode)),p.parentNode.insertBefore(i,p));var h=this.getPortionReplacementNode(r,e);return p.parentNode.insertBefore(h,p),r.endIndexInNode<p.length&&(o=a.createTextNode(p.data.substring(r.endIndexInNode)),p.parentNode.insertBefore(o,p)),p.parentNode.removeChild(p),this.reverts.push(function(){i===h.previousSibling&&i.parentNode.removeChild(i),o===h.nextSibling&&o.parentNode.removeChild(o),h.parentNode.replaceChild(p,h)}),h}i=a.createTextNode(d.data.substring(0,t.indexInNode)),o=a.createTextNode(s.data.substring(r.endIndexInNode));for(var l=this.getPortionReplacementNode(t,e),c=[],u=0,f=n.length;f>u;++u){var x=n[u],g=this.getPortionReplacementNode(x,e);x.node.parentNode.replaceChild(g,x.node),this.reverts.push(function(e,t){return function(){t.parentNode.replaceChild(e.node,t)}}(x,g)),c.push(g)}var N=this.getPortionReplacementNode(r,e);return d.parentNode.insertBefore(i,d),d.parentNode.insertBefore(l,d),d.parentNode.removeChild(d),s.parentNode.insertBefore(N,s),s.parentNode.insertBefore(o,s),s.parentNode.removeChild(s),this.reverts.push(function(){i.parentNode.removeChild(i),l.parentNode.replaceChild(d,l),o.parentNode.removeChild(o),N.parentNode.replaceChild(s,N)}),N}},t});
	var hasOwn = {}.hasOwnProperty; // Used with findAndReplaceDOMText
    /* Adapted from: https://plainjs.com/javascript/manipulation/unwrap-a-dom-element-35/ */
    function unwrap(el) { var parent = el.parentNode; while (el.firstChild) parent.insertBefore(el.firstChild, el); parent.removeChild(el);}

    var base_url = 'https://www.sefaria.org/';
    var bookTitles = {{ book_titles }};
    var popUpElem;
    var heBox;
    var enBox;
    var heTitle;
    var enTitle;
    var heElems;
    var enElems;
    var triggerLink;

    var setupPopup = function(styles, mode) {
        category_colors = {
          "Commentary":         "#4871bf",
          "Tanakh":             "#004e5f",
          "Midrash":            "#5d956f",
          "Mishnah":            "#5a99b7",
          "Talmud":             "#ccb479",
          "Halakhah":           "#802f3e",
          "Kabbalah":           "#594176",
          "Philosophy":         "#7f85a9",
          "Liturgy":            "#ab4e66",
          "Tanaitic":           "#00827f",
          "Parshanut":          "#9ab8cb",
          "Chasidut":           "#97b386",
          "Musar":              "#7c406f",
          "Responsa":           "#cb6158",
          "Apocrypha":          "#c7a7b4",
          "Other":              "#073570",
          "Quoting Commentary": "#cb6158",
          "Sheets":             "#7c406f",
          "Community":          "#7c406f",
          "Targum":             "#7f85a9",
          "Modern Works":       "#7c406f",
          "Modern Commentary":  "#7c406f",
        }
        popUpElem = document.createElement("div");
        popUpElem.id = "sefaria-popup";

        var html = "";
        // Set default content for the popup
        html += '<style scoped>' +
                '@import url("https://fonts.googleapis.com/css?family=Crimson+Text|Frank+Ruhl+Libre");' +
                '#sefaria-popup {'+
                    'width: 400px;'+
                    'max-height: 560px;' +
                    'font-size: 16px;' +
                    'border-left: 1px #ddd solid;'+
                    'border-right: 1px #ddd solid;'+
                    'border-bottom: 1px #ddd solid;'+
                    'background-color: #fff;'+
                    'color: #222222;'+
                '}'+
            '.sefaria-text .en, .sefaria-text .he {' +
                'padding: 10px 20px;'+
                'text-align: justify;'+
            '}' +
            '.sefaria-text {' +
                'max-height: 430px;'+
                'overflow-y: auto;' +
                'overflow-x: hidden;' +
            '}' +
            '.sefaria-text:focus {' +
                'outline: none;'+
            '}' +
            '#sefaria-title {' +
                'font-weight: bold;' +
                'font-size: 16px;'+
                'text-align: center;' +
                'text-decoration: none;' +
            '}' +
            '.en {' +
                'font-family: "Crimson Text";' +
            '}' +
            '.he {' +
                'font-family: "Frank Ruhl Libre";' +
            '}' +
            '#sefaria-logo {' +
            'background: url(\'data:image/svg+xml;utf8,<svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 337.28 72.42"><title>LOGO2</title><path d="M80.7,52.71L84.85,47a18.38,18.38,0,0,0,13.48,5.88c6.13,0,8.56-3,8.56-5.81,0-3.83-4.54-5-9.71-6.33C90.22,39,82,36.93,82,27.92c0-7,6.2-12.46,15.52-12.46,6.64,0,12,2.11,16,5.94L109.26,27a17.32,17.32,0,0,0-12.33-4.86c-4.41,0-7.22,2.11-7.22,5.3s4.34,4.41,9.39,5.69c7,1.79,15.4,4,15.4,13.22,0,7.09-5,13.16-16.48,13.16C90.16,59.48,84.47,56.74,80.7,52.71Z" fill="#999"/><path d="M122.68,58.72V16.1h29.2v6.58H130.15V33.74h21.27v6.58H130.15V52.14h21.72v6.58h-29.2Z" fill="#999"/><path d="M160.82,58.72V16.1H190v6.58H168.29V33.74h21.27v6.58H168.29v18.4h-7.48Z" fill="#999"/><path d="M225.28,58.72l-3.13-8.18H202.6l-3.13,8.18H191L207.71,16.1H217l16.74,42.61h-8.5ZM212.38,23.64L204.71,44H220Z" fill="#999"/><path d="M264.07,58.72l-9.46-15.91H247.2V58.72h-7.48V16.1h18.72c8.43,0,13.93,5.49,13.93,13.35,0,7.6-5,11.69-10.09,12.52l10.41,16.74h-8.62Zm0.64-29.26c0-4.09-3.07-6.77-7.28-6.77H247.2V36.23h10.22C261.64,36.23,264.7,33.54,264.7,29.46Z" fill="#999"/><path d="M281.12,58.72V16.1h7.48V58.72h-7.48Z" fill="#999"/><path d="M328.79,58.72l-3.13-8.18H306.11L303,58.72h-8.5L311.22,16.1h9.33l16.74,42.61h-8.5ZM315.88,23.64L308.21,44h15.33Z" fill="#999"/><path d="M27.87,20.68H18.6c-0.63,0-1.26.05-1.89,0.09-0.84.05-1.68,0.15-2.52,0.17a1.76,1.76,0,0,0-1.23.48A30.86,30.86,0,0,0,6.7,29a26.46,26.46,0,0,0-3.17,8.74,29.41,29.41,0,0,0-.4,3.89,22.13,22.13,0,0,0,.5,6,12.29,12.29,0,0,0,5.46,7.78,18.71,18.71,0,0,0,4.62,2.09,34.76,34.76,0,0,0,7.24,1.33q2.52,0.22,5.06.21,2.14,0,4.29,0,2.43,0,4.84-.25a40.7,40.7,0,0,0,4.64-.66,22.4,22.4,0,0,0,4.47-1.39,12.64,12.64,0,0,0,7.09-7.44,21.07,21.07,0,0,0,1.18-6.34,47.77,47.77,0,0,0-.09-5.38,36.19,36.19,0,0,0-.6-4.67,21.13,21.13,0,0,0-1.39-4.5,12.6,12.6,0,0,0-3-4.24,12.22,12.22,0,0,0-4.95-2.67,21.84,21.84,0,0,0-5.84-.79c-2.93,0-5.87,0-8.8,0M5.76,0C5.82,0.2,5.86.33,5.9,0.47A5.8,5.8,0,0,0,7.58,3,9.9,9.9,0,0,0,11.15,5a14.19,14.19,0,0,0,3.69.76c0.83,0.06,1.67.1,2.5,0.1,5.9,0,11.8,0,17.7,0A15.14,15.14,0,0,1,42.74,8a18.77,18.77,0,0,1,6,5.51,27.86,27.86,0,0,1,3.4,6.46,42.49,42.49,0,0,1,1.93,6.89,54.79,54.79,0,0,1,.83,5.77c0.13,1.52.24,3,.29,4.57s0.07,3.27,0,4.9a44,44,0,0,1-.46,5.62,38.93,38.93,0,0,1-2.24,8.75,29.14,29.14,0,0,1-4.7,8.1,22.79,22.79,0,0,1-7.54,6A18.05,18.05,0,0,1,35,72.26a14.45,14.45,0,0,1-2.15.15c-3.27,0-6.54,0-9.81,0a22.87,22.87,0,0,1-10.82-2.7,20.39,20.39,0,0,1-8.11-8A27.73,27.73,0,0,1,1.23,54.6a39.48,39.48,0,0,1-.92-5.13A49.56,49.56,0,0,1,0,43.3,18.74,18.74,0,0,1,.62,39a41.13,41.13,0,0,1,2.72-7.44,74.43,74.43,0,0,1,6-10.47l0.19-.28L9,20.73a11.8,11.8,0,0,1-2.93-.88A8.06,8.06,0,0,1,1.72,15a12.75,12.75,0,0,1-.65-3.23c0-.35,0-0.69-0.06-1a10.51,10.51,0,0,1,.84-4.55A21.06,21.06,0,0,1,4.91,1C5.17,0.7,5.45.38,5.76,0" fill="#999"/></svg>\') no-repeat;' +
            'width: 100px;' +
            'display: inline-block;'+
            'margin-left: 3px;' +
            'height: 15px;' +
            'line-height: 16px;' +
            '}' +
            '.sefaria-footer {' +
            'color: #999;' +
            'padding:20px 20px 20px 20px;' +
            'border-top: 1px solid #ddd;' +
            'background-color: #F9F9F7;' +
            'font-size: 12px;' +
            'display: block;' +
            'font-family: "Helvetica Neue", "Helvetica", sans-serif;' +
            '}'+
            '.sefaria-read-more-button {' +
            'float: right;' +
            'background-color: #fff;' +
            'padding: 5px 10px;'+
            'margin-top: -3px;' +
            'border: 1px solid #ddd;' +
            'border-radius: 5px;' +
            '}' +

            '.sefaria-read-more-button a {' +
            'text-decoration: none;' +
            'color: #666;' +
            '}'+



            '#sefaria-linker-header {' +
                'border-top: 4px solid #ddd;' +
                'border-bottom: 1px solid #ddd;' +
                'background-color: #F9F9F7;' +
                'text-align: center;' +
                'padding-bottom: 3px;' +
            '}';

        if (mode == "popup-click") {
            html += '#sefaria-close {' +
                '    font-family: "Crimson Text";' +
                '    font-size: 36px;' +
                '    height: 48px;' +
                '    line-height: 48px;' +
                '    position: absolute;' +
                '    top: -5px;' +
                '    left: 20px;' +
                '    cursor: pointer;' +
                '    color: #999;' +
                '    border: 0;' +
                '    outline: none;' +
                '}' +
            '</style>' +
            '<div id="sefaria-close">×</div>';
        } else {
            html += '</style>'
        }

        html += '<div id="sefaria-linker-header">' +
            '<h1 id="sefaria-title"><span class="he" dir="rtl"></span><span class="en"></span></h1>' +
            '</div>' +
            '<div class="sefaria-text" id="sefaria-linker-text" tabindex="0"></div>' +

            '<div class="sefaria-footer">Powered by <div id="sefaria-logo">&nbsp;</div> <span class="sefaria-read-more-button">';

             if (mode == "popup-click") {
             html += '<a class = "sefaria-popup-ref" href = "">Read More ›</a></span></div>'
             }

        popUpElem.innerHTML = html;
        // Apply any override styles
        if (styles) {
            for (var n in styles) {
                if (styles.hasOwnProperty(n)) {
                    popUpElem.style[n] = styles[n];
                }
            }
        }

        // Apply function-critical styles
        popUpElem.style.position = "fixed";
        popUpElem.style.overflow = "hidden";
        popUpElem.style.display = "none";
        popUpElem.style.zIndex = 1000;

        // Accessibility Whatnot
        popUpElem.setAttribute('role', 'dialog');
        popUpElem.tabIndex = "0";
        popUpElem.style.outline = "none";

        popUpElem = document.body.appendChild(popUpElem);

        heBox = popUpElem.querySelector(".sefaria-text.he");
        enBox = popUpElem.querySelector(".sefaria-text.en");
        linkerHeader = popUpElem.querySelector("#sefaria-linker-header");
        linkerFooter = popUpElem.querySelector(".sefaria-footer");
        textBox = popUpElem.querySelector(".sefaria-text");
        heTitle = popUpElem.querySelector("#sefaria-title .he");
        enTitle = popUpElem.querySelector("#sefaria-title .en");
        heElems = popUpElem.querySelectorAll(".he");
        enElems = popUpElem.querySelectorAll(".en");

        if (mode == "popup-click") {
            popUpElem.querySelector('#sefaria-close').addEventListener('click', hidePopup, false);
            popUpElem.addEventListener('keydown', function (e) {
                var key = e.which || e.keyCode;
                if (key === 27) { // 27 is escape
                  hidePopup();
                }
                else if (key === 9) { // 9 is tab
                  e.preventDefault(); // this traps user in the dialog via tab
                }
            });
        }
    };

    var showPopup = function(e, mode) {
        while (textBox.firstChild) {
            textBox.removeChild(textBox.firstChild);
        }
        triggerLink = e;
        var source = ns.sources[e.getAttribute('data-ref')];

        linkerHeader.style["border-top-color"] = category_colors[source["primary_category"]];

        if (source.lang === "en") {
            // [].forEach.call(heElems, function(e) {e.style.display = "None"});
            heTitle.style.display = "None";
            [].forEach.call(enElems, function(e) {e.style.display = "Block"});
        } else if (source.lang === "he") {
            [].forEach.call(heElems, function(e) {e.style.display = "Block"});
            [].forEach.call(enElems, function(e) {e.style.display = "None"});
        }


        if(typeof(source.en) === "string") {
            source.en = [source.en]
            source.he = [source.he]
        }
        if(typeof(source.en) === "object") {
            source.en = [].concat.apply([], source.en);
            source.he = [].concat.apply([], source.he);
        }


        for (i = 0; i < source.en.length; i++) {
            var enBox = document.createElement('div');
            var heBox = document.createElement('div');
            enBox.className = "en";
            heBox.className = "he";
            heBox.setAttribute("dir", "rtl");
            enBox.innerHTML = source.en[i];
            heBox.innerHTML = source.he[i].replace(/[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5]/g, "");
            textBox.appendChild(heBox);
            textBox.appendChild(enBox);
        }





        enTitle.textContent = source.ref;
        heTitle.textContent = source.heRef;

        var rect = e.getBoundingClientRect();
        popUpElem.style.top = (rect.top > 100)?rect.top - 50 + "px":rect.top + 30 + "px";
        if (rect.left < window.innerWidth / 2) {
            popUpElem.style.left = rect.right + 10 + "px";
            popUpElem.style.right = "auto";
        } else {
            popUpElem.style.left = "auto";
            popUpElem.style.right = window.innerWidth - rect.left + "px";
        }

        popUpElem.style.display = "block";

        var popUpRect = popUpElem.getBoundingClientRect();
        if (window.innerHeight < popUpRect.bottom) { // popup drops off the screen
            var pos = ((window.innerHeight - popUpRect.height) - 10);
            popUpElem.style.top = (pos > 0)?pos + "px":"10px";

           // if (popUpRect.height > (window.innerHeight - 10)) {
           //     popUpElem.style.top = "10px";
           // } else {
           //     popUpElem.style.top = ((window.innerHeight - popUpRect.height) - 10) + "px";
           // }
        }

        if (mode == "popup-click") {
            [].forEach.call(popUpElem.querySelectorAll(".sefaria-popup-ref"), function(link) {link.setAttribute('href', e.href);});
            document.addEventListener("click", function (e) {
              var level = 0;
              for (var element = e.target; element; element = element.parentNode) {
                if (element.id === popUpElem.id) {
                  return;
                }
                level++;
              }
              hidePopup();
            });
        }

        var scrollbarOffset = popUpElem.clientWidth - textBox.clientWidth;
        if (scrollbarOffset > 0) {
            var nodes = textBox.childNodes;
            for(var i=0; i<nodes.length; i++) {
                nodes[i].style.marginRight = -scrollbarOffset+"px";
            }



        }



    };
    var hidePopup = function() {
        if (popUpElem.style.display == "block") {
                triggerLink.focus();
        }
        popUpElem.style.display = "none";
    };



    // Public API
    ns.matches = [];
    ns.sources = {};

    ns.link = function(options) {
        options = options || {};
        var popupStyles = options.popupStyles || {};
        var selector = options.selector || "body";
        if (window.screen.width < 820 || options.mode == "link") { mode = "link"; }  // If the screen is small, fallback to link mode
        else { mode = "popup-click"; }

        setupPopup(popupStyles, mode);

        var elems = document.querySelectorAll(selector);

        // Find text titles in the document
        // todo: hold locations of title matches?
        var full_text = [].reduce.call(elems, function(prev, current) { return prev + current.textContent; }, "");
        var matchedTitles = bookTitles.filter(function(title) {
                return (full_text.indexOf(title) > -1);
            });

        if (matchedTitles.length == 0) {
            console.log("No book titles found to link to Sefaria.");
            return;
        }

        // Get regexes for each of the titles
        atomic.get(base_url + "api/regexs/" + matchedTitles.join("|"))
            .success(function (data, xhr) {
                if ("error" in data) {
                    console.log(data["error"]);
                    delete data.error;
                }
                var books = Object.getOwnPropertyNames(data).sort(function(a, b) {
                  return b.length - a.length; // ASC -> a - b; DESC -> b - a
                });
                for (var k = 0; k < books.length; k++) {
                    var book = books[k];
                    // Run each regex over the document, and wrap results
                    var r = XRegExp(data[book],"xgm");
                    for (var i = 0; i < elems.length; i++) {
                        findAndReplaceDOMText(elems[i], {
                            preset: 'prose',
                            find: r,
                            replace: function(portion, match) {
                                var matched_ref = match[0]
                                    .replace(/[\r\n\t ]+/g, " ") // Filter out multiple spaces
                                    .replace(/[(){}[\]]+/g, ""); // Filter out internal parenthesis todo: Don't break on parens in books names
                                ns.matches.push(matched_ref);

                                var node = document.createElement("a");
                                node.target = "_blank";
                                node.className = "sefaria-ref";
                                node.href = base_url + matched_ref;
                                node.setAttribute('data-ref', matched_ref);
                                node.setAttribute('aria-controls', 'sefaria-popup');
                                node.textContent = portion.text;

                                return node;
                            },
                            filterElements: function(el) {
                                return !(
                                    hasOwn.call(findAndReplaceDOMText.NON_PROSE_ELEMENTS, el.nodeName.toLowerCase())
                                    || (el.tagName == "A")
                                    // The below test is subsumed in the more simple test above
                                    //|| (el.className && el.className.split(' ').indexOf("sefaria-ref")>=0)
                                );
                            }
                        });
                    }
                }
                if (ns.matches.length == 0) {
                    console.log("No references found to link to Sefaria.");
                    return;
                }
                atomic.get(base_url + "api/bulktext/" + ns.matches.join("|")+"?useTextFamily=1")
                    .success(function (data, xhr) {
                        //Put text data into sefaria.sources
                        ns.sources = data;

                        // Bind a click event and a mouseover event to each link
                        [].forEach.call(document.querySelectorAll('.sefaria-ref'),function(e) {
                            if ("error" in ns.sources[e.getAttribute('data-ref')]) {
                                unwrap(e);
                                return;
                            }
                            var source = ns.sources[e.getAttribute('data-ref')];
                            e.setAttribute('href', base_url + source.url + "?lang=" + (source.lang == "en"?"he-en":"he"));
                            if (mode == "popup-hover") {
                                e.addEventListener('mouseover', function(event) {
                                    showPopup(this, mode);
                                }, false);
                                e.addEventListener('mouseout', hidePopup, false);
                            } else if (mode == "popup-click") {
                                e.addEventListener('click', function(event) {
                                    showPopup(this, mode);
                                    event.preventDefault();
                                    event.stopPropagation();
                                    document.getElementById("sefaria-linker-text").focus();
                                }, false);
                            }
                        });
                    })
                    .error(function (data, xhr) { });  // api/bulktext
            })
            .error(function (data, xhr) { });  // api/regexs
    };

}(this.sefaria = this.sefaria || {}));

{% endautoescape %}
