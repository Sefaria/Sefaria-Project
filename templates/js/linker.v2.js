{% autoescape off %}
//call with sefaria.link();

(function(ns){

    //Test browser support
    var supports = !!document.querySelectorAll && !!window.addEventListener && !!Object.getOwnPropertyNames && !!document.body.textContent;
    if ( !supports ) return;

    //Libraries
    //XRegExp 2.0.0 <xregexp.com> MIT License
    var XRegExp;XRegExp=XRegExp||function(n){"use strict";function v(n,i,r){var u;for(u in t.prototype)t.prototype.hasOwnProperty(u)&&(n[u]=t.prototype[u]);return n.xregexp={captureNames:i,isNative:!!r},n}function g(n){return(n.global?"g":"")+(n.ignoreCase?"i":"")+(n.multiline?"m":"")+(n.extended?"x":"")+(n.sticky?"y":"")}function o(n,r,u){if(!t.isRegExp(n))throw new TypeError("type RegExp expected");var f=i.replace.call(g(n)+(r||""),h,"");return u&&(f=i.replace.call(f,new RegExp("["+u+"]+","g"),"")),n=n.xregexp&&!n.xregexp.isNative?v(t(n.source,f),n.xregexp.captureNames?n.xregexp.captureNames.slice(0):null):v(new RegExp(n.source,f),null,!0)}function a(n,t){var i=n.length;if(Array.prototype.lastIndexOf)return n.lastIndexOf(t);while(i--)if(n[i]===t)return i;return-1}function s(n,t){return Object.prototype.toString.call(n).toLowerCase()==="[object "+t+"]"}function d(n){return n=n||{},n==="all"||n.all?n={natives:!0,extensibility:!0}:s(n,"string")&&(n=t.forEach(n,/[^\s,]+/,function(n){this[n]=!0},{})),n}function ut(n,t,i,u){var o=p.length,s=null,e,f;y=!0;try{while(o--)if(f=p[o],(f.scope==="all"||f.scope===i)&&(!f.trigger||f.trigger.call(u))&&(f.pattern.lastIndex=t,e=r.exec.call(f.pattern,n),e&&e.index===t)){s={output:f.handler.call(u,e,i),match:e};break}}catch(h){throw h;}finally{y=!1}return s}function b(n){t.addToken=c[n?"on":"off"],f.extensibility=n}function tt(n){RegExp.prototype.exec=(n?r:i).exec,RegExp.prototype.test=(n?r:i).test,String.prototype.match=(n?r:i).match,String.prototype.replace=(n?r:i).replace,String.prototype.split=(n?r:i).split,f.natives=n}var t,c,u,f={natives:!1,extensibility:!1},i={exec:RegExp.prototype.exec,test:RegExp.prototype.test,match:String.prototype.match,replace:String.prototype.replace,split:String.prototype.split},r={},k={},p=[],e="default",rt="class",it={"default":/^(?:\\(?:0(?:[0-3][0-7]{0,2}|[4-7][0-7]?)?|[1-9]\d*|x[\dA-Fa-f]{2}|u[\dA-Fa-f]{4}|c[A-Za-z]|[\s\S])|\(\?[:=!]|[?*+]\?|{\d+(?:,\d*)?}\??)/,"class":/^(?:\\(?:[0-3][0-7]{0,2}|[4-7][0-7]?|x[\dA-Fa-f]{2}|u[\dA-Fa-f]{4}|c[A-Za-z]|[\s\S]))/},et=/\$(?:{([\w$]+)}|(\d\d?|[\s\S]))/g,h=/([\s\S])(?=[\s\S]*\1)/g,nt=/^(?:[?*+]|{\d+(?:,\d*)?})\??/,ft=i.exec.call(/()??/,"")[1]===n,l=RegExp.prototype.sticky!==n,y=!1,w="gim"+(l?"y":"");return t=function(r,u){if(t.isRegExp(r)){if(u!==n)throw new TypeError("can't supply flags when constructing one RegExp from another");return o(r)}if(y)throw new Error("can't call the XRegExp constructor within token definition functions");var l=[],a=e,b={hasNamedCapture:!1,captureNames:[],hasFlag:function(n){return u.indexOf(n)>-1}},f=0,c,s,p;if(r=r===n?"":String(r),u=u===n?"":String(u),i.match.call(u,h))throw new SyntaxError("invalid duplicate regular expression flag");for(r=i.replace.call(r,/^\(\?([\w$]+)\)/,function(n,t){if(i.test.call(/[gy]/,t))throw new SyntaxError("can't use flag g or y in mode modifier");return u=i.replace.call(u+t,h,""),""}),t.forEach(u,/[\s\S]/,function(n){if(w.indexOf(n[0])<0)throw new SyntaxError("invalid regular expression flag "+n[0]);});f<r.length;)c=ut(r,f,a,b),c?(l.push(c.output),f+=c.match[0].length||1):(s=i.exec.call(it[a],r.slice(f)),s?(l.push(s[0]),f+=s[0].length):(p=r.charAt(f),p==="["?a=rt:p==="]"&&(a=e),l.push(p),++f));return v(new RegExp(l.join(""),i.replace.call(u,/[^gimy]+/g,"")),b.hasNamedCapture?b.captureNames:null)},c={on:function(n,t,r){r=r||{},n&&p.push({pattern:o(n,"g"+(l?"y":"")),handler:t,scope:r.scope||e,trigger:r.trigger||null}),r.customFlags&&(w=i.replace.call(w+r.customFlags,h,""))},off:function(){throw new Error("extensibility must be installed before using addToken");}},t.addToken=c.off,t.cache=function(n,i){var r=n+"/"+(i||"");return k[r]||(k[r]=t(n,i))},t.escape=function(n){return i.replace.call(n,/[-[\]{}()*+?.,\\^$|#\s]/g,"\\$&")},t.exec=function(n,t,i,u){var e=o(t,"g"+(u&&l?"y":""),u===!1?"y":""),f;return e.lastIndex=i=i||0,f=r.exec.call(e,n),u&&f&&f.index!==i&&(f=null),t.global&&(t.lastIndex=f?e.lastIndex:0),f},t.forEach=function(n,i,r,u){for(var e=0,o=-1,f;f=t.exec(n,i,e);)r.call(u,f,++o,n,i),e=f.index+(f[0].length||1);return u},t.globalize=function(n){return o(n,"g")},t.install=function(n){n=d(n),!f.natives&&n.natives&&tt(!0),!f.extensibility&&n.extensibility&&b(!0)},t.isInstalled=function(n){return!!f[n]},t.isRegExp=function(n){return s(n,"regexp")},t.matchChain=function(n,i){return function r(n,u){for(var o=i[u].regex?i[u]:{regex:i[u]},f=[],s=function(n){f.push(o.backref?n[o.backref]||"":n[0])},e=0;e<n.length;++e)t.forEach(n[e],o.regex,s);return u===i.length-1||!f.length?f:r(f,u+1)}([n],0)},t.replace=function(i,u,f,e){var c=t.isRegExp(u),s=u,h;return c?(e===n&&u.global&&(e="all"),s=o(u,e==="all"?"g":"",e==="all"?"":"g")):e==="all"&&(s=new RegExp(t.escape(String(u)),"g")),h=r.replace.call(String(i),s,f),c&&u.global&&(u.lastIndex=0),h},t.split=function(n,t,i){return r.split.call(n,t,i)},t.test=function(n,i,r,u){return!!t.exec(n,i,r,u)},t.uninstall=function(n){n=d(n),f.natives&&n.natives&&tt(!1),f.extensibility&&n.extensibility&&b(!1)},t.union=function(n,i){var l=/(\()(?!\?)|\\([1-9]\d*)|\\[\s\S]|\[(?:[^\\\]]|\\[\s\S])*]/g,o=0,f,h,c=function(n,t,i){var r=h[o-f];if(t){if(++o,r)return"(?<"+r+">"}else if(i)return"\\"+(+i+f);return n},e=[],r,u;if(!(s(n,"array")&&n.length))throw new TypeError("patterns must be a nonempty array");for(u=0;u<n.length;++u)r=n[u],t.isRegExp(r)?(f=o,h=r.xregexp&&r.xregexp.captureNames||[],e.push(t(r.source).source.replace(l,c))):e.push(t.escape(r));return t(e.join("|"),i)},t.version="2.0.0",r.exec=function(t){var r,f,e,o,u;if(this.global||(o=this.lastIndex),r=i.exec.apply(this,arguments),r){if(!ft&&r.length>1&&a(r,"")>-1&&(e=new RegExp(this.source,i.replace.call(g(this),"g","")),i.replace.call(String(t).slice(r.index),e,function(){for(var t=1;t<arguments.length-2;++t)arguments[t]===n&&(r[t]=n)})),this.xregexp&&this.xregexp.captureNames)for(u=1;u<r.length;++u)f=this.xregexp.captureNames[u-1],f&&(r[f]=r[u]);this.global&&!r[0].length&&this.lastIndex>r.index&&(this.lastIndex=r.index)}return this.global||(this.lastIndex=o),r},r.test=function(n){return!!r.exec.call(this,n)},r.match=function(n){if(t.isRegExp(n)){if(n.global){var u=i.match.apply(this,arguments);return n.lastIndex=0,u}}else n=new RegExp(n);return r.exec.call(n,this)},r.replace=function(n,r){var e=t.isRegExp(n),u,f,h,o;return e?(n.xregexp&&(u=n.xregexp.captureNames),n.global||(o=n.lastIndex)):n+="",s(r,"function")?f=i.replace.call(String(this),n,function(){var t=arguments,i;if(u)for(t[0]=new String(t[0]),i=0;i<u.length;++i)u[i]&&(t[0][u[i]]=t[i+1]);return e&&n.global&&(n.lastIndex=t[t.length-2]+t[0].length),r.apply(null,t)}):(h=String(this),f=i.replace.call(h,n,function(){var n=arguments;return i.replace.call(String(r),et,function(t,i,r){var f;if(i){if(f=+i,f<=n.length-3)return n[f]||"";if(f=u?a(u,i):-1,f<0)throw new SyntaxError("backreference to undefined group "+t);return n[f+1]||""}if(r==="$")return"$";if(r==="&"||+r==0)return n[0];if(r==="`")return n[n.length-1].slice(0,n[n.length-2]);if(r==="'")return n[n.length-1].slice(n[n.length-2]+n[0].length);if(r=+r,!isNaN(r)){if(r>n.length-3)throw new SyntaxError("backreference to undefined group "+t);return n[r]||""}throw new SyntaxError("invalid token "+t);})})),e&&(n.lastIndex=n.global?0:o),f},r.split=function(r,u){if(!t.isRegExp(r))return i.split.apply(this,arguments);var e=String(this),h=r.lastIndex,f=[],o=0,s;return u=(u===n?-1:u)>>>0,t.forEach(e,r,function(n){n.index+n[0].length>o&&(f.push(e.slice(o,n.index)),n.length>1&&n.index<e.length&&Array.prototype.push.apply(f,n.slice(1)),s=n[0].length,o=n.index+s)}),o===e.length?(!i.test.call(r,"")||s)&&f.push(""):f.push(e.slice(o)),r.lastIndex=h,f.length>u?f.slice(0,u):f},u=c.on,u(/\\([ABCE-RTUVXYZaeg-mopqyz]|c(?![A-Za-z])|u(?![\dA-Fa-f]{4})|x(?![\dA-Fa-f]{2}))/,function(n,t){if(n[1]==="B"&&t===e)return n[0];throw new SyntaxError("invalid escape "+n[0]);},{scope:"all"}),u(/\[(\^?)]/,function(n){return n[1]?"[\\s\\S]":"\\b\\B"}),u(/(?:\(\?#[^)]*\))+/,function(n){return i.test.call(nt,n.input.slice(n.index+n[0].length))?"":"(?:)"}),u(/\\k<([\w$]+)>/,function(n){var t=isNaN(n[1])?a(this.captureNames,n[1])+1:+n[1],i=n.index+n[0].length;if(!t||t>this.captureNames.length)throw new SyntaxError("backreference to undefined group "+n[0]);return"\\"+t+(i===n.input.length||isNaN(n.input.charAt(i))?"":"(?:)")}),u(/(?:\s+|#.*)+/,function(n){return i.test.call(nt,n.input.slice(n.index+n[0].length))?"":"(?:)"},{trigger:function(){return this.hasFlag("x")},customFlags:"x"}),u(/\./,function(){return"[\\s\\S]"},{trigger:function(){return this.hasFlag("s")},customFlags:"s"}),u(/\(\?P?<([\w$]+)>/,function(n){if(!isNaN(n[1]))throw new SyntaxError("can't use integer as capture name "+n[0]);return this.captureNames.push(n[1]),this.hasNamedCapture=!0,"("}),u(/\\(\d+)/,function(n,t){if(!(t===e&&/^[1-9]/.test(n[1])&&+n[1]<=this.captureNames.length)&&n[1]!=="0")throw new SyntaxError("can't use octal escape or backreference to undefined group "+n[0]);return n[0]},{scope:"all"}),u(/\((?!\?)/,function(){return this.hasFlag("n")?"(?:":(this.captureNames.push(null),"(")},{customFlags:"n"}),typeof exports!="undefined"&&(exports.XRegExp=t),t}()
    /*! atomic v1.0.0 | (c) 2014 @toddmotto | github.com/toddmotto/atomic */
    !function(a,b){"function"==typeof define&&define.amd?define(b):"object"==typeof module&&module.exports?module.exports=b:a.atomic=b(a)}(this,function(a){"use strict";var b={},c=function(a){var b;try{b=JSON.parse(a.responseText)}catch(c){b=a.responseText}return[b,a]},d=function(b,d,e){var f={success:function(){},error:function(){}},g=a.XMLHttpRequest||ActiveXObject,h=new g("MSXML2.XMLHTTP.3.0");return h.open(b,d,!0),h.setRequestHeader("Content-type","application/x-www-form-urlencoded"),h.onreadystatechange=function(){4===h.readyState&&(200===h.status?f.success.apply(f,c(h)):f.error.apply(f,c(h)))},h.send(e),{success:function(a){return f.success=a,f},error:function(a){return f.error=a,f}}};return b.get=function(a){return d("GET",a)},b.put=function(a,b){return d("PUT",a,b)},b.post=function(a,b){return d("POST",a,b)},b["delete"]=function(a){return d("DELETE",a)},b});
    /* findAndReplaceDOMText v 0.4.3 | https://github.com/padolsey/findAndReplaceDOMText */
    !function(e,t){"object"==typeof module&&module.exports?module.exports=t():"function"==typeof define&&define.amd?define(t):e.findAndReplaceDOMText=t()}(this,function(){function e(e){return String(e).replace(/([.*+?^=!:${}()|[\]\/\\])/g,"\\$1")}function t(){return n.apply(null,arguments)||r.apply(null,arguments)}function n(e,n,i,o,d){if(n&&!n.nodeType&&arguments.length<=2)return!1;var a="function"==typeof i;a&&(i=function(e){return function(t,n){return e(t.text,n.startIndex)}}(i));var s=r(n,{find:e,wrap:a?null:i,replace:a?i:"$"+(o||"&"),prepMatch:function(e,t){if(!e[0])throw"findAndReplaceDOMText cannot handle zero-length matches";if(o>0){var n=e[o];e.index+=e[0].indexOf(n),e[0]=n}return e.endIndex=e.index+e[0].length,e.startIndex=e.index,e.index=t,e},filterElements:d});return t.revert=function(){return s.revert()},!0}function r(e,t){return new i(e,t)}function i(e,n){var r=n.preset&&t.PRESETS[n.preset];if(n.portionMode=n.portionMode||o,r)for(var i in r)s.call(r,i)&&!s.call(n,i)&&(n[i]=r[i]);this.node=e,this.options=n,this.prepMatch=n.prepMatch||this.prepMatch,this.reverts=[],this.matches=this.search(),this.matches.length&&this.processMatches()}var o="retain",d="first",a=document,s=({}.toString,{}.hasOwnProperty);return t.NON_PROSE_ELEMENTS={br:1,hr:1,script:1,style:1,img:1,video:1,audio:1,canvas:1,svg:1,map:1,object:1,input:1,textarea:1,select:1,option:1,optgroup:1,button:1},t.NON_CONTIGUOUS_PROSE_ELEMENTS={address:1,article:1,aside:1,blockquote:1,dd:1,div:1,dl:1,fieldset:1,figcaption:1,figure:1,footer:1,form:1,h1:1,h2:1,h3:1,h4:1,h5:1,h6:1,header:1,hgroup:1,hr:1,main:1,nav:1,noscript:1,ol:1,output:1,p:1,pre:1,section:1,ul:1,br:1,li:1,summary:1,dt:1,details:1,rp:1,rt:1,rtc:1,script:1,style:1,img:1,video:1,audio:1,canvas:1,svg:1,map:1,object:1,input:1,textarea:1,select:1,option:1,optgroup:1,button:1,table:1,tbody:1,thead:1,th:1,tr:1,td:1,caption:1,col:1,tfoot:1,colgroup:1},t.NON_INLINE_PROSE=function(e){return s.call(t.NON_CONTIGUOUS_PROSE_ELEMENTS,e.nodeName.toLowerCase())},t.PRESETS={prose:{forceContext:t.NON_INLINE_PROSE,filterElements:function(e){return!s.call(t.NON_PROSE_ELEMENTS,e.nodeName.toLowerCase())}}},t.Finder=i,i.prototype={search:function(){function t(e){for(var d=0,p=e.length;p>d;++d){var h=e[d];if("string"==typeof h){if(o.global)for(;n=o.exec(h);)a.push(s.prepMatch(n,r++,i));else(n=h.match(o))&&a.push(s.prepMatch(n,0,i));i+=h.length}else t(h)}}var n,r=0,i=0,o=this.options.find,d=this.getAggregateText(),a=[],s=this;return o="string"==typeof o?RegExp(e(o),"g"):o,t(d),a},prepMatch:function(e,t,n){if(!e[0])throw new Error("findAndReplaceDOMText cannot handle zero-length matches");return e.endIndex=n+e.index+e[0].length,e.startIndex=n+e.index,e.index=t,e},getAggregateText:function(){function e(r,i){if(3===r.nodeType)return[r.data];if(t&&!t(r))return[];var i=[""],o=0;if(r=r.firstChild)do if(3!==r.nodeType){var d=e(r);n&&1===r.nodeType&&(n===!0||n(r))?(i[++o]=d,i[++o]=""):("string"==typeof d[0]&&(i[o]+=d.shift()),d.length&&(i[++o]=d,i[++o]=""))}else i[o]+=r.data;while(r=r.nextSibling);return i}var t=this.options.filterElements,n=this.options.forceContext;return e(this.node)},processMatches:function(){var e,t,n,r=this.matches,i=this.node,o=this.options.filterElements,d=[],a=i,s=r.shift(),p=0,h=0,l=0,c=[i];e:for(;;){if(3===a.nodeType&&(!t&&a.length+p>=s.endIndex?t={node:a,index:l++,text:a.data.substring(s.startIndex-p,s.endIndex-p),indexInMatch:p-s.startIndex,indexInNode:s.startIndex-p,endIndexInNode:s.endIndex-p,isEnd:!0}:e&&d.push({node:a,index:l++,text:a.data,indexInMatch:p-s.startIndex,indexInNode:0}),!e&&a.length+p>s.startIndex&&(e={node:a,index:l++,indexInMatch:0,indexInNode:s.startIndex-p,endIndexInNode:s.endIndex-p,text:a.data.substring(s.startIndex-p,s.endIndex-p)}),p+=a.data.length),n=1===a.nodeType&&o&&!o(a),e&&t){if(a=this.replaceMatch(s,e,d,t),p-=t.node.data.length-t.endIndexInNode,e=null,t=null,d=[],s=r.shift(),l=0,h++,!s)break}else if(!n&&(a.firstChild||a.nextSibling)){a.firstChild?(c.push(a),a=a.firstChild):a=a.nextSibling;continue}for(;;){if(a.nextSibling){a=a.nextSibling;break}if(a=c.pop(),a===i)break e}}},revert:function(){for(var e=this.reverts.length;e--;)this.reverts[e]();this.reverts=[]},prepareReplacementString:function(e,t,n){var r=this.options.portionMode;return r===d&&t.indexInMatch>0?"":(e=e.replace(/\$(\d+|&|`|')/g,function(e,t){var r;switch(t){case"&":r=n[0];break;case"`":r=n.input.substring(0,n.startIndex);break;case"'":r=n.input.substring(n.endIndex);break;default:r=n[+t]}return r}),r===d?e:t.isEnd?e.substring(t.indexInMatch):e.substring(t.indexInMatch,t.indexInMatch+t.text.length))},getPortionReplacementNode:function(e,t,n){var r=this.options.replace||"$&",i=this.options.wrap;if(i&&i.nodeType){var o=a.createElement("div");o.innerHTML=i.outerHTML||(new XMLSerializer).serializeToString(i),i=o.firstChild}if("function"==typeof r)return r=r(e,t,n),r&&r.nodeType?r:a.createTextNode(String(r));var d="string"==typeof i?a.createElement(i):i;return r=a.createTextNode(this.prepareReplacementString(r,e,t,n)),r.data&&d?(d.appendChild(r),d):r},replaceMatch:function(e,t,n,r){var i,o,d=t.node,s=r.node;if(d===s){var p=d;t.indexInNode>0&&(i=a.createTextNode(p.data.substring(0,t.indexInNode)),p.parentNode.insertBefore(i,p));var h=this.getPortionReplacementNode(r,e);return p.parentNode.insertBefore(h,p),r.endIndexInNode<p.length&&(o=a.createTextNode(p.data.substring(r.endIndexInNode)),p.parentNode.insertBefore(o,p)),p.parentNode.removeChild(p),this.reverts.push(function(){i===h.previousSibling&&i.parentNode.removeChild(i),o===h.nextSibling&&o.parentNode.removeChild(o),h.parentNode.replaceChild(p,h)}),h}i=a.createTextNode(d.data.substring(0,t.indexInNode)),o=a.createTextNode(s.data.substring(r.endIndexInNode));for(var l=this.getPortionReplacementNode(t,e),c=[],u=0,f=n.length;f>u;++u){var x=n[u],g=this.getPortionReplacementNode(x,e);x.node.parentNode.replaceChild(g,x.node),this.reverts.push(function(e,t){return function(){t.parentNode.replaceChild(e.node,t)}}(x,g)),c.push(g)}var N=this.getPortionReplacementNode(r,e);return d.parentNode.insertBefore(i,d),d.parentNode.insertBefore(l,d),d.parentNode.removeChild(d),s.parentNode.insertBefore(N,s),s.parentNode.insertBefore(o,s),s.parentNode.removeChild(s),this.reverts.push(function(){i.parentNode.removeChild(i),l.parentNode.replaceChild(d,l),o.parentNode.removeChild(o),N.parentNode.replaceChild(s,N)}),N}},t});
    var hasOwn = {}.hasOwnProperty; // Used with findAndReplaceDOMText
    /* Adapted from: https://plainjs.com/javascript/manipulation/unwrap-a-dom-element-35/ */
    function unwrap(el) { var parent = el.parentNode; while (el.firstChild) parent.insertBefore(el.firstChild, el); parent.removeChild(el);}
    /* Draggabilly PACKAGED v2.2.0 Make that shiz draggable MIT license */
    !function(i,e){"function"==typeof define&&define.amd?define("jquery-bridget/jquery-bridget",["jquery"],function(t){return e(i,t)}):"object"==typeof module&&module.exports?module.exports=e(i,require("jquery")):i.jQueryBridget=e(i,i.jQuery)}(window,function(t,i){"use strict";var c=Array.prototype.slice,e=t.console,p=void 0===e?function(){}:function(t){e.error(t)};function n(d,o,u){(u=u||i||t.jQuery)&&(o.prototype.option||(o.prototype.option=function(t){u.isPlainObject(t)&&(this.options=u.extend(!0,this.options,t))}),u.fn[d]=function(t){if("string"==typeof t){var i=c.call(arguments,1);return s=i,a="$()."+d+'("'+(r=t)+'")',(e=this).each(function(t,i){var e=u.data(i,d);if(e){var n=e[r];if(n&&"_"!=r.charAt(0)){var o=n.apply(e,s);h=void 0===h?o:h}else p(a+" is not a valid method")}else p(d+" not initialized. Cannot call methods, i.e. "+a)}),void 0!==h?h:e}var e,r,s,h,a,n;return n=t,this.each(function(t,i){var e=u.data(i,d);e?(e.option(n),e._init()):(e=new o(i,n),u.data(i,d,e))}),this},r(u))}function r(t){!t||t&&t.bridget||(t.bridget=n)}return r(i||t.jQuery),n}),function(t,i){"use strict";"function"==typeof define&&define.amd?define("get-size/get-size",[],function(){return i()}):"object"==typeof module&&module.exports?module.exports=i():t.getSize=i()}(window,function(){"use strict";function m(t){var i=parseFloat(t);return-1==t.indexOf("%")&&!isNaN(i)&&i}var e="undefined"==typeof console?function(){}:function(t){console.error(t)},y=["paddingLeft","paddingRight","paddingTop","paddingBottom","marginLeft","marginRight","marginTop","marginBottom","borderLeftWidth","borderRightWidth","borderTopWidth","borderBottomWidth"],b=y.length;function E(t){var i=getComputedStyle(t);return i||e("Style returned "+i+". Are you running this code in a hidden iframe on Firefox? See http://bit.ly/getsizebug1"),i}var _,x=!1;function P(t){if(function(){if(!x){x=!0;var t=document.createElement("div");t.style.width="200px",t.style.padding="1px 2px 3px 4px",t.style.borderStyle="solid",t.style.borderWidth="1px 2px 3px 4px",t.style.boxSizing="border-box";var i=document.body||document.documentElement;i.appendChild(t);var e=E(t);P.isBoxSizeOuter=_=200==m(e.width),i.removeChild(t)}}(),"string"==typeof t&&(t=document.querySelector(t)),t&&"object"==typeof t&&t.nodeType){var i=E(t);if("none"==i.display)return function(){for(var t={width:0,height:0,innerWidth:0,innerHeight:0,outerWidth:0,outerHeight:0},i=0;i<b;i++)t[y[i]]=0;return t}();var e={};e.width=t.offsetWidth,e.height=t.offsetHeight;for(var n=e.isBorderBox="border-box"==i.boxSizing,o=0;o<b;o++){var r=y[o],s=i[r],h=parseFloat(s);e[r]=isNaN(h)?0:h}var a=e.paddingLeft+e.paddingRight,d=e.paddingTop+e.paddingBottom,u=e.marginLeft+e.marginRight,c=e.marginTop+e.marginBottom,p=e.borderLeftWidth+e.borderRightWidth,f=e.borderTopWidth+e.borderBottomWidth,g=n&&_,l=m(i.width);!1!==l&&(e.width=l+(g?0:a+p));var v=m(i.height);return!1!==v&&(e.height=v+(g?0:d+f)),e.innerWidth=e.width-(a+p),e.innerHeight=e.height-(d+f),e.outerWidth=e.width+u,e.outerHeight=e.height+c,e}}return P}),function(t,i){"function"==typeof define&&define.amd?define("ev-emitter/ev-emitter",i):"object"==typeof module&&module.exports?module.exports=i():t.EvEmitter=i()}("undefined"!=typeof window?window:this,function(){function t(){}var i=t.prototype;return i.on=function(t,i){if(t&&i){var e=this._events=this._events||{},n=e[t]=e[t]||[];return-1==n.indexOf(i)&&n.push(i),this}},i.once=function(t,i){if(t&&i){this.on(t,i);var e=this._onceEvents=this._onceEvents||{};return(e[t]=e[t]||{})[i]=!0,this}},i.off=function(t,i){var e=this._events&&this._events[t];if(e&&e.length){var n=e.indexOf(i);return-1!=n&&e.splice(n,1),this}},i.emitEvent=function(t,i){var e=this._events&&this._events[t];if(e&&e.length){e=e.slice(0),i=i||[];for(var n=this._onceEvents&&this._onceEvents[t],o=0;o<e.length;o++){var r=e[o];n&&n[r]&&(this.off(t,r),delete n[r]),r.apply(this,i)}return this}},i.allOff=function(){delete this._events,delete this._onceEvents},t}),function(i,e){"function"==typeof define&&define.amd?define("unipointer/unipointer",["ev-emitter/ev-emitter"],function(t){return e(i,t)}):"object"==typeof module&&module.exports?module.exports=e(i,require("ev-emitter")):i.Unipointer=e(i,i.EvEmitter)}(window,function(o,t){function i(){}var e=i.prototype=Object.create(t.prototype);e.bindStartEvent=function(t){this._bindStartEvent(t,!0)},e.unbindStartEvent=function(t){this._bindStartEvent(t,!1)},e._bindStartEvent=function(t,i){var e=(i=void 0===i||i)?"addEventListener":"removeEventListener",n="mousedown";o.PointerEvent?n="pointerdown":"ontouchstart"in o&&(n="touchstart"),t[e](n,this)},e.handleEvent=function(t){var i="on"+t.type;this[i]&&this[i](t)},e.getTouch=function(t){for(var i=0;i<t.length;i++){var e=t[i];if(e.identifier==this.pointerIdentifier)return e}},e.onmousedown=function(t){var i=t.button;i&&0!==i&&1!==i||this._pointerDown(t,t)},e.ontouchstart=function(t){this._pointerDown(t,t.changedTouches[0])},e.onpointerdown=function(t){this._pointerDown(t,t)},e._pointerDown=function(t,i){t.button||this.isPointerDown||(this.isPointerDown=!0,this.pointerIdentifier=void 0!==i.pointerId?i.pointerId:i.identifier,this.pointerDown(t,i))},e.pointerDown=function(t,i){this._bindPostStartEvents(t),this.emitEvent("pointerDown",[t,i])};var n={mousedown:["mousemove","mouseup"],touchstart:["touchmove","touchend","touchcancel"],pointerdown:["pointermove","pointerup","pointercancel"]};return e._bindPostStartEvents=function(t){if(t){var i=n[t.type];i.forEach(function(t){o.addEventListener(t,this)},this),this._boundPointerEvents=i}},e._unbindPostStartEvents=function(){this._boundPointerEvents&&(this._boundPointerEvents.forEach(function(t){o.removeEventListener(t,this)},this),delete this._boundPointerEvents)},e.onmousemove=function(t){this._pointerMove(t,t)},e.onpointermove=function(t){t.pointerId==this.pointerIdentifier&&this._pointerMove(t,t)},e.ontouchmove=function(t){var i=this.getTouch(t.changedTouches);i&&this._pointerMove(t,i)},e._pointerMove=function(t,i){this.pointerMove(t,i)},e.pointerMove=function(t,i){this.emitEvent("pointerMove",[t,i])},e.onmouseup=function(t){this._pointerUp(t,t)},e.onpointerup=function(t){t.pointerId==this.pointerIdentifier&&this._pointerUp(t,t)},e.ontouchend=function(t){var i=this.getTouch(t.changedTouches);i&&this._pointerUp(t,i)},e._pointerUp=function(t,i){this._pointerDone(),this.pointerUp(t,i)},e.pointerUp=function(t,i){this.emitEvent("pointerUp",[t,i])},e._pointerDone=function(){this._pointerReset(),this._unbindPostStartEvents(),this.pointerDone()},e._pointerReset=function(){this.isPointerDown=!1,delete this.pointerIdentifier},e.pointerDone=function(){},e.onpointercancel=function(t){t.pointerId==this.pointerIdentifier&&this._pointerCancel(t,t)},e.ontouchcancel=function(t){var i=this.getTouch(t.changedTouches);i&&this._pointerCancel(t,i)},e._pointerCancel=function(t,i){this._pointerDone(),this.pointerCancel(t,i)},e.pointerCancel=function(t,i){this.emitEvent("pointerCancel",[t,i])},i.getPointerPoint=function(t){return{x:t.pageX,y:t.pageY}},i}),function(i,e){"function"==typeof define&&define.amd?define("unidragger/unidragger",["unipointer/unipointer"],function(t){return e(i,t)}):"object"==typeof module&&module.exports?module.exports=e(i,require("unipointer")):i.Unidragger=e(i,i.Unipointer)}(window,function(r,t){function i(){}var e=i.prototype=Object.create(t.prototype);e.bindHandles=function(){this._bindHandles(!0)},e.unbindHandles=function(){this._bindHandles(!1)},e._bindHandles=function(t){for(var i=(t=void 0===t||t)?"addEventListener":"removeEventListener",e=t?this._touchActionValue:"",n=0;n<this.handles.length;n++){var o=this.handles[n];this._bindStartEvent(o,t),o[i]("click",this),r.PointerEvent&&(o.style.touchAction=e)}},e._touchActionValue="none",e.pointerDown=function(t,i){this.okayPointerDown(t)&&(this.pointerDownPointer=i,t.preventDefault(),this.pointerDownBlur(),this._bindPostStartEvents(t),this.emitEvent("pointerDown",[t,i]))};var o={TEXTAREA:!0,INPUT:!0,SELECT:!0,OPTION:!0},s={radio:!0,checkbox:!0,button:!0,submit:!0,image:!0,file:!0};return e.okayPointerDown=function(t){var i=o[t.target.nodeName],e=s[t.target.type],n=!i||e;return n||this._pointerReset(),n},e.pointerDownBlur=function(){var t=document.activeElement;t&&t.blur&&t!=document.body&&t.blur()},e.pointerMove=function(t,i){var e=this._dragPointerMove(t,i);this.emitEvent("pointerMove",[t,i,e]),this._dragMove(t,i,e)},e._dragPointerMove=function(t,i){var e={x:i.pageX-this.pointerDownPointer.pageX,y:i.pageY-this.pointerDownPointer.pageY};return!this.isDragging&&this.hasDragStarted(e)&&this._dragStart(t,i),e},e.hasDragStarted=function(t){return 3<Math.abs(t.x)||3<Math.abs(t.y)},e.pointerUp=function(t,i){this.emitEvent("pointerUp",[t,i]),this._dragPointerUp(t,i)},e._dragPointerUp=function(t,i){this.isDragging?this._dragEnd(t,i):this._staticClick(t,i)},e._dragStart=function(t,i){this.isDragging=!0,this.isPreventingClicks=!0,this.dragStart(t,i)},e.dragStart=function(t,i){this.emitEvent("dragStart",[t,i])},e._dragMove=function(t,i,e){this.isDragging&&this.dragMove(t,i,e)},e.dragMove=function(t,i,e){t.preventDefault(),this.emitEvent("dragMove",[t,i,e])},e._dragEnd=function(t,i){this.isDragging=!1,setTimeout(function(){delete this.isPreventingClicks}.bind(this)),this.dragEnd(t,i)},e.dragEnd=function(t,i){this.emitEvent("dragEnd",[t,i])},e.onclick=function(t){this.isPreventingClicks&&t.preventDefault()},e._staticClick=function(t,i){this.isIgnoringMouseUp&&"mouseup"==t.type||(this.staticClick(t,i),"mouseup"!=t.type&&(this.isIgnoringMouseUp=!0,setTimeout(function(){delete this.isIgnoringMouseUp}.bind(this),400)))},e.staticClick=function(t,i){this.emitEvent("staticClick",[t,i])},i.getPointerPoint=t.getPointerPoint,i}),function(e,n){"function"==typeof define&&define.amd?define(["get-size/get-size","unidragger/unidragger"],function(t,i){return n(e,t,i)}):"object"==typeof module&&module.exports?module.exports=n(e,require("get-size"),require("unidragger")):e.Draggabilly=n(e,e.getSize,e.Unidragger)}(window,function(r,a,t){function e(t,i){for(var e in i)t[e]=i[e];return t}var n=r.jQuery;function i(t,i){this.element="string"==typeof t?document.querySelector(t):t,n&&(this.$element=n(this.element)),this.options=e({},this.constructor.defaults),this.option(i),this._create()}var o=i.prototype=Object.create(t.prototype);i.defaults={},o.option=function(t){e(this.options,t)};var s={relative:!0,absolute:!0,fixed:!0};function d(t,i,e){return e=e||"round",i?Math[e](t/i)*i:t}return o._create=function(){this.position={},this._getPosition(),this.startPoint={x:0,y:0},this.dragPoint={x:0,y:0},this.startPosition=e({},this.position);var t=getComputedStyle(this.element);s[t.position]||(this.element.style.position="relative"),this.on("pointerDown",this.onPointerDown),this.on("pointerMove",this.onPointerMove),this.on("pointerUp",this.onPointerUp),this.enable(),this.setHandles()},o.setHandles=function(){this.handles=this.options.handle?this.element.querySelectorAll(this.options.handle):[this.element],this.bindHandles()},o.dispatchEvent=function(t,i,e){var n=[i].concat(e);this.emitEvent(t,n),this.dispatchJQueryEvent(t,i,e)},o.dispatchJQueryEvent=function(t,i,e){var n=r.jQuery;if(n&&this.$element){var o=n.Event(i);o.type=t,this.$element.trigger(o,e)}},o._getPosition=function(){var t=getComputedStyle(this.element),i=this._getPositionCoord(t.left,"width"),e=this._getPositionCoord(t.top,"height");this.position.x=isNaN(i)?0:i,this.position.y=isNaN(e)?0:e,this._addTransformPosition(t)},o._getPositionCoord=function(t,i){if(-1!=t.indexOf("%")){var e=a(this.element.parentNode);return e?parseFloat(t)/100*e[i]:0}return parseInt(t,10)},o._addTransformPosition=function(t){var i=t.transform;if(0===i.indexOf("matrix")){var e=i.split(","),n=0===i.indexOf("matrix3d")?12:4,o=parseInt(e[n],10),r=parseInt(e[n+1],10);this.position.x+=o,this.position.y+=r}},o.onPointerDown=function(t,i){this.element.classList.add("is-pointer-down"),this.dispatchJQueryEvent("pointerDown",t,[i])},o.dragStart=function(t,i){this.isEnabled&&(this._getPosition(),this.measureContainment(),this.startPosition.x=this.position.x,this.startPosition.y=this.position.y,this.setLeftTop(),this.dragPoint.x=0,this.dragPoint.y=0,this.element.classList.add("is-dragging"),this.dispatchEvent("dragStart",t,[i]),this.animate())},o.measureContainment=function(){var t=this.getContainer();if(t){var i=a(this.element),e=a(t),n=this.element.getBoundingClientRect(),o=t.getBoundingClientRect(),r=e.borderLeftWidth+e.borderRightWidth,s=e.borderTopWidth+e.borderBottomWidth,h=this.relativeStartPosition={x:n.left-(o.left+e.borderLeftWidth),y:n.top-(o.top+e.borderTopWidth)};this.containSize={width:e.width-r-h.x-i.width,height:e.height-s-h.y-i.height}}},o.getContainer=function(){var t=this.options.containment;if(t)return t instanceof HTMLElement?t:"string"==typeof t?document.querySelector(t):this.element.parentNode},o.onPointerMove=function(t,i,e){this.dispatchJQueryEvent("pointerMove",t,[i,e])},o.dragMove=function(t,i,e){if(this.isEnabled){var n=e.x,o=e.y,r=this.options.grid,s=r&&r[0],h=r&&r[1];n=d(n,s),o=d(o,h),n=this.containDrag("x",n,s),o=this.containDrag("y",o,h),n="y"==this.options.axis?0:n,o="x"==this.options.axis?0:o,this.position.x=this.startPosition.x+n,this.position.y=this.startPosition.y+o,this.dragPoint.x=n,this.dragPoint.y=o,this.dispatchEvent("dragMove",t,[i,e])}},o.containDrag=function(t,i,e){if(!this.options.containment)return i;var n="x"==t?"width":"height",o=d(-this.relativeStartPosition[t],e,"ceil"),r=this.containSize[n];return r=d(r,e,"floor"),Math.max(o,Math.min(r,i))},o.onPointerUp=function(t,i){this.element.classList.remove("is-pointer-down"),this.dispatchJQueryEvent("pointerUp",t,[i])},o.dragEnd=function(t,i){this.isEnabled&&(this.element.style.transform="",this.setLeftTop(),this.element.classList.remove("is-dragging"),this.dispatchEvent("dragEnd",t,[i]))},o.animate=function(){if(this.isDragging){this.positionDrag();var t=this;requestAnimationFrame(function(){t.animate()})}},o.setLeftTop=function(){this.element.style.left=this.position.x+"px",this.element.style.top=this.position.y+"px"},o.positionDrag=function(){this.element.style.transform="translate3d( "+this.dragPoint.x+"px, "+this.dragPoint.y+"px, 0)"},o.staticClick=function(t,i){this.dispatchEvent("staticClick",t,[i])},o.setPosition=function(t,i){this.position.x=t,this.position.y=i,this.setLeftTop()},o.enable=function(){this.isEnabled=!0},o.disable=function(){this.isEnabled=!1,this.isDragging&&this.dragEnd()},o.destroy=function(){this.disable(),this.element.style.transform="",this.element.style.left="",this.element.style.top="",this.element.style.position="",this.unbindHandles(),this.$element&&this.$element.removeData("draggabilly")},o._init=function(){},n&&n.bridget&&n.bridget("draggabilly",i),i});


    /* filter array to distinct values */
    function distinct(value, index, self) {return self.indexOf(value) === index;}
    /* see https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript/3561711#3561711 */
    function escapeRegex(string) {return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');}

    var base_url = '{% if DEBUG %}http://localhost:8000/{% else %}https://www.sefaria.org/{% endif %}';
    var bookTitles = {{ book_titles }};
    var popUpElem;
    var heBox;
    var enBox;
    var heTitle;
    var enTitle;
    var heElems;
    var enElems;
    var triggerLink;

    var setupPopup = function(options, mode) {
        category_colors = {
          "Commentary":         "#4871bf",
          "Tanakh":             "#004e5f",
          "Midrash":            "#5d956f",
          "Mishnah":            "#5a99b7",
          "Talmud":             "#ccb479",
          "Halakhah":           "#802f3e",
          "Kabbalah":           "#594176",
          "Philosophy":         "#7f85a9",   // to delete
          "Jewish Thought":     "#7f85a9",
          "Liturgy":            "#ab4e66",
          "Tanaitic":           "#00827f",   // to delete
          "Tosefta":            "#00827f",
          "Parshanut":          "#9ab8cb",
          "Chasidut":           "#97b386",
          "Musar":              "#7c406f",
          "Responsa":           "#cb6158",
          "Apocrypha":          "#c7a7b4",   // to delete
          "Second Temple":      "#c7a7b4",
          "Other":              "#073570",   // to delete
          "Quoting Commentary": "#cb6158",
          "Sheets":             "#7c406f",
          "Community":          "#7c406f",
          "Targum":             "#7f85a9",
          "Modern Works":       "#7c406f",   // to delete
          "Modern Commentary":  "#7c406f",
        };
        popUpElem = document.createElement("div");
        popUpElem.id = "sefaria-popup";
        popUpElem.classList.add("interface-" + options.interfaceLang);
        popUpElem.classList.add("content-" + options.contentLang);

        var html = "";
        // Set default content for the popup
        html += '<style scoped>' +
            '@import url("https://fonts.googleapis.com/css?family=Crimson+Text:ital,wght@0,400;0,700;1,400;1,700|Frank+Ruhl+Libre|Heebo");' +
            '#sefaria-popup {'+
                'width: 400px;'+
                'max-width: 90%;'+
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
                'font-weight: normal' +
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
                'font-size: 18px;'+
                'text-align: center;' +
                'text-decoration: none;' +
                'margin: 12px 0;' +
                'padding: 0;' +
            '}' +
            '#sefaria-title .en {' +
                'text-align: center;' +
            '}' +
            '#sefaria-title .he {' +
                'text-align: center;' +
            '}' +
            '#sefaria-popup .en, #sefaria-popup .en * {' +
                'font-family: "Crimson Text";' +
                'font-size: 18px;' +
                'line-height: 1.2;' +
            '}' +
            '#sefaria-popup .he, #sefaria-popup .he * {' +
                'font-family: "Frank Ruhl Libre";' +
                'font-size: 21px;' +
                'line-height: 1.5;' +
            '}' +
            '.content-hebrew .sefaria-text .en {' +
                'display: none;' +
            '}' +
            '.content-english .sefaria-text .he {' +
                'display: none' +
            '}' +
            '.content-hebrew .sefaria-text .en.enOnly {' +
                'display: block;' +
            '}' +
            '.content-english .sefaria-text .he.heOnly {' +
                'display: block' +
            '}' +
            '#sefaria-logo {' +
                "background: url(\"data:image/svg+xml,%3Csvg id='Layer_1' data-name='Layer 1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 340.96 93.15'%3E%3Cdefs%3E%3Cstyle%3E.cls-1%7Bfill:none;%7D.cls-2%7Bclip-path:url(%23clip-path);%7D.cls-3%7Bfill:%23231f20;%7D%3C/style%3E%3CclipPath id='clip-path' transform='translate(-389 -337.85)'%3E%3Crect class='cls-1' x='389' y='337.85' width='340.96' height='93.15'/%3E%3C/clipPath%3E%3C/defs%3E%3Ctitle%3Esefarialogo%3C/title%3E%3Cg class='cls-2'%3E%3Cpath class='cls-3' d='M454,397.67c-2.41,11.31-10.59,16.11-28.82,16.11-44.79,0-28.92-36-22.66-43.42,2.63-3.29,4.47-6,11.15-6h12.71c17.72,0,21.1.84,25.54,9.9,2.4,4.88,3.79,15.41,2.08,23.43m4.81-22.48c-1.5-9.67-3.45-20.19-11.85-26-5.09-3.54-10.34-3.8-16.21-3.8-4,0-18.11-.17-24.29-.17-6,0-10-4.94-10-7.34-3.91,4.79-6.9,10.08-5.85,16.48.94,5.76,4.89,9.44,10.67,10.17-6.55,9.25-12.47,19.9-12.18,31.18.18,7.11,1.81,35.32,33.71,35.32h5.81c13.62,0,21.87-10.11,24.27-14,7.05-11.5,8.23-29.29,6-41.78' transform='translate(-389 -337.85)'/%3E%3Cpath class='cls-3' d='M722.79,402.89a12.32,12.32,0,0,1-9.74,5.06,11.59,11.59,0,0,1-11.78-11.7c0-6.19,4.53-11.7,11.4-11.7a12.78,12.78,0,0,1,10.12,5.06ZM723,414H730V378.51H723v3.24a16.65,16.65,0,0,0-11.1-4,16.87,16.87,0,0,0-8.69,2.27,19,19,0,0,0-.07,32.39,18.26,18.26,0,0,0,8.91,2.34,16.31,16.31,0,0,0,10.95-4ZM676,365.9a4.61,4.61,0,0,0,4.68,4.68,4.68,4.68,0,0,0,4.76-4.68,4.75,4.75,0,0,0-4.76-4.76A4.68,4.68,0,0,0,676,365.9M677.11,414h7.17V378.51h-7.17Zm-8.68-36a18.29,18.29,0,0,0-2.79-.23c-5.21,0-8.91,2.42-10.65,4.83v-4.07h-7V414h7.18V390.51c2-3.4,5.89-6,9.59-6a10.06,10.06,0,0,1,2.79.3ZM628,402.89A12.32,12.32,0,0,1,618.3,408a11.59,11.59,0,0,1-11.78-11.7c0-6.19,4.53-11.7,11.4-11.7A12.8,12.8,0,0,1,628,389.61Zm.22,11.1h7V378.51h-7v3.24a16.62,16.62,0,0,0-11.1-4,16.83,16.83,0,0,0-8.68,2.27,19,19,0,0,0-.07,32.39,18.2,18.2,0,0,0,8.91,2.34,16.3,16.3,0,0,0,10.94-4Zm-33.07-53.83a16.61,16.61,0,0,0-4.23-.53,13.88,13.88,0,0,0-11.62,5.89c-1.59,2.27-2.27,5.21-2.27,10v3h-8.3v6.41h8.3V414h7.18V384.92h10.94v-6.41H584.25v-3.25c0-3.25.37-5.06,1.35-6.34a7,7,0,0,1,5.44-2.49,11.64,11.64,0,0,1,2.64.3ZM546.65,384a9.92,9.92,0,0,1,9.36,7.7H536.68a10.31,10.31,0,0,1,10-7.7m16.76,13.74a14,14,0,0,0,.07-1.51c0-10.5-7.17-18.5-17.06-18.5s-17.29,7.85-17.29,18.5a18,18,0,0,0,18.35,18.5c7.24,0,12.3-3.25,14.95-6.65l-4.69-4.45a12.78,12.78,0,0,1-10.19,4.83,11.43,11.43,0,0,1-11.47-10.72Zm-75.58,8.15a23.68,23.68,0,0,0,18.5,8.84c9.21,0,16.38-6,16.38-15.33,0-6-3.32-9.74-6.87-12.08-6.79-4.53-18-6-18-12.68,0-4.61,4.38-7.1,8.75-7.1a14.55,14.55,0,0,1,9.44,3.62l4.46-5.51a21.76,21.76,0,0,0-14.2-5.28c-9.21,0-16,6.34-16,14,0,5.51,2.94,9.14,6.72,11.63,7,4.6,18.19,5.51,18.19,13.59,0,4.75-4.3,7.92-9.21,7.92-5.44,0-9.81-3-12.91-6.79Z' transform='translate(-389 -337.85)'/%3E%3C/g%3E%3C/svg%3E\") no-repeat;" +
                'width: 70px;' +
                'display: inline-block;'+
                'margin-left: 3px;' +
                'height: 18px;' +
                'line-height: 18px;' +
                'opacity: 0.6' +
            '}' +
            '.sefaria-footer {' +
                'color: #999;' +
                'padding:20px 20px 20px 20px;' +
                'border-top: 1px solid #ddd;' +
                'background-color: #FBFBFA;' +
                'font-size: 12px;' +
                'display: flex;' +
                'justify-content: space-between;' +
                'align-items: center;' +
                'font-family: "Helvetica Neue", "Helvetica", sans-serif;' +
            '}'+
            '.sefaria-read-more-button {' +
                'background-color: #fff;' +
                'padding: 5px 10px;'+
                'margin-top: -3px;' +
                'border: 1px solid #ddd;' +
                'border-radius: 5px;' +
            '}' +
            '.interface-hebrew .sefaria-powered-by-box {' +
                'margin-top: -6px' +
            '}'+
            '.sefaria-read-more-button a {' +
                'text-decoration: none;' +
                'color: #666;' +
            '}'+
            '#sefaria-linker-header {' +
                'border-top: 4px solid #ddd;' +
                'border-bottom: 1px solid #ddd;' +
                'background-color: #FBFBFA;' +
                'text-align: center;' +
                'padding-bottom: 3px;' +
            '}'+
            '.interface-hebrew .sefaria-footer {' +
                'direction: ltr;' +
                'font-family: "Heebo", sans-serif' +
            '}'+
            '#sefaria-popup.short-screen .sefaria-text{'+
                'overflow-y: scroll;' +
                'max-height: calc(100% - 117px);' +
            '}'+
            'span.sefaria-ref-wrapper{'+
                'display: inline !important;' +
            '}';

        if (mode == "popup-click") {
            html += '#sefaria-close {' +
                '    font-family: "Crimson Text";' +
                '    font-size: 36px;' +
                '    height: 48px;' +
                '    line-height: 48px;' +
                '    position: absolute;' +
                '    top: 0px;' +
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
        var readMoreText = {
            "english": "Read More ›",
            "hebrew": "קרא עוד ›"
        }[options.interfaceLang];
        var poweredByText = {
            "english": "Powered by",
            "hebrew": '<center>מונע ע"י<br></center>'
        }[options.interfaceLang];

        html += '<div id="sefaria-linker-header">' +
                '<div id="sefaria-title"><span class="he" dir="rtl"></span><span class="en"></span></div>' +
            '</div>' +
            '<div class="sefaria-text" id="sefaria-linker-text" tabindex="0"></div>' +

            '<div class="sefaria-footer">' +
                '<div class="sefaria-powered-by-box">' + poweredByText + ' <div id="sefaria-logo">&nbsp;</div></div>' +
                (mode == "popup-click" ?
                '<span class="sefaria-read-more-button">' +
                    '<a class = "sefaria-popup-ref" target="_blank" href = "">' + readMoreText + '</a>' +
                '</span>' : "") +
            '</div>';

        popUpElem.innerHTML = html;

        // Apply any override styles
        for (var n in options.popupStyles) {
            if (options.popupStyles.hasOwnProperty(n)) {
                popUpElem.style[n] = options.popupStyles[n];
            }
        }

        // Apply function-critical styles
        popUpElem.style.position = "fixed";
        popUpElem.style.overflow = "hidden";
        popUpElem.style.display = "none";
        popUpElem.style.zIndex = 999999;

        // Accessibility Whatnot
        popUpElem.setAttribute('role', 'dialog');
        popUpElem.tabIndex = "0";
        popUpElem.style.outline = "none";

        popUpElem = document.body.appendChild(popUpElem);

        var draggie = new Draggabilly(popUpElem, {handle: "#sefaria-linker-header"});

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

    const showPopup = function(e, mode) {
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

        for (i = 0; i < Math.max(source.en.length, source.he.length); i++) {
            var enBox = document.createElement('div');
            var heBox = document.createElement('div');
            enBox.innerHTML = source.en[i] || "";
            heBox.innerHTML = (source.he[i] || "").replace(/[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5]/g, "");
            enBox.className = "en" + (!heBox.innerHTML ? " enOnly" : "");
            heBox.className = "he" + (!enBox.innerHTML ? " heOnly" : "");
            heBox.setAttribute("dir", "rtl");
            if (heBox.innerHTML) { textBox.appendChild(heBox); }
            if (enBox.innerHTML) { textBox.appendChild(enBox);}
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
        if (popUpRect.height > window.innerHeight) {
            // if the popup is too long for window height, shrink it
            popUpElem.classList.add("short-screen");
            popUpElem.style.height = (window.innerHeight * 0.9) + "px";
        }
        if (window.innerHeight < popUpRect.bottom) {
            // if popup drops off bottom screen, pull up
            var pos = ((window.innerHeight - popUpRect.height) - 10);
            popUpElem.style.top = (pos > 0) ? pos + "px" : "10px";
        }
        if (window.innerWidth < popUpRect.right || popUpRect.left < 0) {
            // popup drops off the side screen, center it
            var pos = ((window.innerWidth - popUpRect.width) / 2);
            popUpElem.style.left = pos + "px";
            popUpElem.style.right = "auto";
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

    const hidePopup = function() {
        if (popUpElem.style.display === "block") {
                triggerLink.focus();
        }
        popUpElem.style.display = "none";
        popUpElem.classList.remove("short-screen");
        popUpElem.style.height = "auto";
    };

    // Public API
    ns.matches = [];
    ns.sources = {};

    ns.link = function(options) {
        options = options || {};
        var defaultOptions = {
            mode: "popup-click",
            selector: "body",           // CSS Selector
            excludeFromLinking: null,   // CSS Selector
            excludeFromTracking: null,  // CSS Selector
            popupStyles: {},
            interfaceLang: "english",
            contentLang: "bilingual",
            parenthesesOnly: false,
            quotationOnly: false,
            dynamic: false,
            hidePopupsOnMobile: true
        };
        Object.assign(defaultOptions, options);
        Object.assign(ns, defaultOptions);

        if (window.innerWidth < 700 && ns.hidePopupsOnMobile) {
            // If the screen is small, defautlt to link mode, unless override set
            ns.mode = "link";
        }
        setupPopup(ns, ns.mode);

        ns.matches = [];   // Matches that will be linked
        ns.trackedMatches =[]; // Matches that will be tracked
        ns.elems = document.querySelectorAll(ns.selector);
        // Find text titles in the document
        // todo: hold locations of title matches?
        const full_text = [].reduce.call(ns.elems, (prev, current) => prev + current.textContent, "");
        ns.matchedTitles = bookTitles.filter(title => full_text.indexOf(title) > -1).filter(distinct);

         if (ns.matchedTitles.length === 0) {
            //console.log("No book titles found to link to Sefaria.");
            ns._trackPage();
        }
        else {
            ns._getRegexesThenTexts(ns.mode);
        }
    };


    // Private API
    ns._getRegexesThenTexts = function(mode) {
        // Get regexes for each of the titles
        atomic.get(base_url + "api/linker-data/" + ns.matchedTitles.join("|") + '?' + 'parentheses='+(0+ns.parenthesesOnly) + '&url='+document.location.href)
            .success(function (data, xhr) {
                if ("error" in data) {
                    console.log(data["error"]);
                    delete data.error;
                }
                ns.regexes = data["regexes"];
                if (ns.excludeFromTracking && ns.excludeFromTracking.length > 0 && data["exclude_from_tracking"].length > 0) {
                    // append our exclusions to site's own exclusions
                    ns.excludeFromTracking = data["exclude_from_tracking"] + ", " + ns.excludeFromTracking;
                }
                else if (data["exclude_from_tracking"].length > 0) {
                    ns.excludeFromTracking = data["exclude_from_tracking"];
                }
                ns._wrapMatches();
                ns._trackPage();

                if (ns.matches.length == 0) {
                    //console.log("No references found to link to Sefaria.");
                    return;
                }
                if (mode != 'link') {
                    // no need to get texts if mode is link
                    ns._getTexts(mode);
                }
            })
            .error(function (data, xhr) { });
    };

    ns._wrapMatches = function() {
        const books = Object.getOwnPropertyNames(ns.regexes).sort(function(a, b) {
          return b.length - a.length; // ASC -> a - b; DESC -> b - a
        });
        for (let k = 0; k < books.length; k++) {
            const book = books[k];
            // Run each regex over the document, and wrap results
            const r = XRegExp(ns.regexes[book],"xgm");
            // find the references and push them into ns.matches
            for (let i = 0; i < ns.elems.length; i++) {
                // portions are tricky. they represent portions of a regex match. it can happen that certain criteria match only the first portion and not later portions. these objects keep track of earlier portion data.
                const portionHasMatched = {};
                const portionExcludedFromLinking = {};
                const portionExcludedFromTracking = {};
                findAndReplaceDOMText(ns.elems[i], {
                    preset: 'prose',
                    find: r,
                    replace: (function(book, portion, match) {
                        // each match for a given book is uniquely identified by start and end index
                        // this this id to see if this is the first portion to match the `match`
                        const matchKey = match.startIndex + "|" + match.endIndex;
                        let isFirstPortionInMatch = !portionHasMatched[matchKey];
                        portionHasMatched[matchKey] = true;

                        const matched_ref = match[1]
                            .replace(/[\r\n\t ]+/g, " ") // Filter out multiple spaces
                            .replace(/[(){}[\]]+/g, ""); // Filter out internal parenthesis todo: Don't break on parens in books names
                        //  the following regex recognizes 'quotationOnly' citations. by reading the book name and then allowing a single Hebrew letter or numbers or multiple Hebrew letters with the different quotations (gershayim) options somewhere in them
                        const quotation_reg = new RegExp(`${book}\\s+(\u05d3\u05e3\\s+)?(([\u05d0-\u05ea]+?['\u05f3"\u05f4”’][\u05d0-\u05ea]*?|[\u05d0-\u05ea](\\.|:)?|\\d+(a|b|:|\\.)?)\\s*(\\s|$|:|\\.|,|[-\u2010-\u2015\u05be])\\s*)+`, 'g');
                        // this line tests if the match of the full Ref found is a quotaionOnly and should/n't be wrapped
                        if (ns.quotationOnly && (matched_ref.match(quotation_reg) == null || matched_ref.match(quotation_reg)[0]!==matched_ref)) {
                           return portion.text;
                        }
                        else {
                            // Walk up node tree to see if this context should be excluded from linking or tracking
                            let p = portion.node;
                            // it is possible this node doesn't fit criteria to be excluded, but an earlier portion did.
                            let excludeFromLinking = portionExcludedFromLinking[matchKey];
                            let excludeFromTracking = portionExcludedFromTracking[matchKey];
                            while (p) {
                                if (p.nodeName === 'A' || (ns.excludeFromLinking && p.matches && p.matches(ns.excludeFromLinking))) {
                                    excludeFromLinking = true;
                                    portionExcludedFromLinking[matchKey] = true;
                                }
                                if (ns.excludeFromTracking && p.matches && p.matches(ns.excludeFromTracking)) {
                                    excludeFromTracking = true;
                                    portionExcludedFromTracking[matchKey] = true;
                                }
                                if (excludeFromTracking && excludeFromLinking) {
                                    return portion.text;
                                }
                                p = p.parentNode;
                            }

                            if (!excludeFromTracking) { ns.trackedMatches.push(matched_ref); }

                            if (excludeFromLinking) { return portion.text; }

                            ns.matches.push(matched_ref);
                            const atag = document.createElement("a");
                            atag.target = "_blank";
                            atag.className = "sefaria-ref";
                            atag.href = base_url + matched_ref;
                            atag.setAttribute('data-ref', matched_ref);
                            atag.setAttribute('aria-controls', 'sefaria-popup');
                            atag.textContent = portion.text;
                            const preText = match[0].substr(0, match[0].indexOf(match[1]));
                            if (!isFirstPortionInMatch || preText.length === 0) { return atag; }

                            // remove prefix from portionText
                            atag.textContent = portion.text.replace(new RegExp("^" + escapeRegex(preText)), '');

                            // due to the fact that safari doesn't support lookbehinds, we need to include prefix group in match
                            // however, we don't want the prefix group to end up in the final a-tag
                            const node = document.createElement("span");
                            node.className="sefaria-ref-wrapper";
                            node.textContent = preText;
                            node.appendChild(atag);
                            return node;
                        }
                    }).bind(null, book)
                });
            }
        }
        ns.matches = ns.matches.filter(distinct);
        ns.trackedMatches = ns.trackedMatches.filter(distinct);
    };

    ns._getTexts = function(mode) {
        const MAX_URL_LENGTH = 3800;
        const hostStr = base_url + 'api/bulktext/';
        var paramStr = '?useTextFamily=1';

        if (typeof Promise == "undefined" || Promise.toString().indexOf("[native code]") == -1) {
            //promises not defined. fallback to one request
            atomic.get(base_url + "api/bulktext/" + ns.matches.join("|")+"?useTextFamily=1")
            .success(function (data, xhr) {
                ns._getTextsSuccess(mode, data);
            })
            .error(function (data, xhr) { });
        }

        // Split into multipe requests if URL length goes above limit
        var refStrs = [""];
        ns.matches.map(function (ref) {
          var last = refStrs[refStrs.length-1];
          if (encodeURI(hostStr + last + '|' + ref + paramStr).length > MAX_URL_LENGTH) {
            refStrs.push(ref)
          } else {
            refStrs[refStrs.length-1] += last.length ? ('|' + ref) : ref;
          }
        });

        var promises = refStrs.map(function (refStr) {
            return new Promise(function (resolve, reject) {
                atomic.get(hostStr + refStr + paramStr)
                .success(function (data, xhr) {
                    resolve(data);
                })
                .error(function (data, xhr) { });
            });
        });

        return Promise.all(promises).then(function (results) {
            var mergedResults = Object.assign.apply(null, results);
            ns._getTextsSuccess(mode, mergedResults);
        });
    };

    ns._getTextsSuccess = function(mode, data) {
        //Put text data into sefaria.sources
        ns.sources = data;

        // Bind a click event and a mouseover event to each link
        [].forEach.call(document.querySelectorAll('.sefaria-ref'),function(e) {
            if ("error" in ns.sources[e.getAttribute('data-ref')]) {
                unwrap(e);
                return;
            }
            var source = ns.sources[e.getAttribute('data-ref')];
            var utm_source = window.location.hostname ? window.location.hostname.replace(/^www\./, "") : "(not%20set)";
            e.setAttribute('href', base_url + source.url + "?lang=" + (source.lang == "en"?"he-en":"he") + "&utm_source=" + utm_source + "&utm_medium=sefaria_linker");
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
    };

    ns._trackPage = function() {
        var robots = document.head.querySelector("meta[name~=robots]");
        if (robots && robots.content.includes("noindex")) { return; }

        var canonical = document.head.querySelector("link[rel~=canonical]");
        var url = (canonical && !ns.dynamic) ? canonical.href : window.location.href;  // don't use canonical url if dynamic site b/c canonical urls tend to only be correct on initial load
        var meta = document.head.querySelector("meta[name~=description]")
                   || document.head.querySelector("meta[property~=description]")
                   || document.head.querySelector("meta[name~='og:description']")
                   || document.head.querySelector("meta[property~='og:description']")
                   || document.head.querySelector("meta[name~='twitter:description']")
                   || document.head.querySelector("meta[property~='twitter:description']");
        var description = meta ? meta.content : "";
        var data = {
            "url": url,
            "title": document.title,
            "description": description,
            "refs": ns.trackedMatches,
        };
        if (ns.dynamic) {
            // don't send description because we can't be sure if the description is still correct after navigating on the dynamic site
            delete data.description;
        }
        //console.log("TRACK");
        //console.log(data);
        var json = JSON.stringify(data);
        var postData = encodeURIComponent("json") + '=' + encodeURIComponent(json);
        atomic.post(base_url + "api/linker-track", postData)
            .success(function (data, xhr) {
                //console.log(data);
            });
    }

}(this.sefaria = this.sefaria || {}));

{% endautoescape %}