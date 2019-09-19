let d3 = require("d3");
let Sefaria = require('sefaria');
let SefariaD3 = require("./sefaria-d3/sefaria-d3");
let $ = require("./sefaria/sefariaJquery");

/*****          Layout              *****/
let margin = [60, 40, 20, 40];
let w = 920; // real value determined in buildScreen()
let h = 730 - margin[0] - margin[2];
//let textBox_height = 150;
let graphBox_height = h;

let svg, timeScale, s, textBox, graphBox;
let links, nodes, link, node, simulation;

let popUpElem;
let heBox;
let enBox;
let heTitle;
let enTitle;
let heElems;
let enElems;
let linkerHeader, linkerFooter;

/* Draggabilly PACKAGED v2.2.0 Make that shiz draggable MIT license */
!function(i,e){"function"==typeof define&&define.amd?define("jquery-bridget/jquery-bridget",["jquery"],function(t){return e(i,t)}):"object"==typeof module&&module.exports?module.exports=e(i,require("jquery")):i.jQueryBridget=e(i,i.jQuery)}(window,function(t,i){"use strict";var c=Array.prototype.slice,e=t.console,p=void 0===e?function(){}:function(t){e.error(t)};function n(d,o,u){(u=u||i||t.jQuery)&&(o.prototype.option||(o.prototype.option=function(t){u.isPlainObject(t)&&(this.options=u.extend(!0,this.options,t))}),u.fn[d]=function(t){if("string"==typeof t){var i=c.call(arguments,1);return s=i,a="$()."+d+'("'+(r=t)+'")',(e=this).each(function(t,i){var e=u.data(i,d);if(e){var n=e[r];if(n&&"_"!=r.charAt(0)){var o=n.apply(e,s);h=void 0===h?o:h}else p(a+" is not a valid method")}else p(d+" not initialized. Cannot call methods, i.e. "+a)}),void 0!==h?h:e}var e,r,s,h,a,n;return n=t,this.each(function(t,i){var e=u.data(i,d);e?(e.option(n),e._init()):(e=new o(i,n),u.data(i,d,e))}),this},r(u))}function r(t){!t||t&&t.bridget||(t.bridget=n)}return r(i||t.jQuery),n}),function(t,i){"use strict";"function"==typeof define&&define.amd?define("get-size/get-size",[],function(){return i()}):"object"==typeof module&&module.exports?module.exports=i():t.getSize=i()}(window,function(){"use strict";function m(t){var i=parseFloat(t);return-1==t.indexOf("%")&&!isNaN(i)&&i}var e="undefined"==typeof console?function(){}:function(t){console.error(t)},y=["paddingLeft","paddingRight","paddingTop","paddingBottom","marginLeft","marginRight","marginTop","marginBottom","borderLeftWidth","borderRightWidth","borderTopWidth","borderBottomWidth"],b=y.length;function E(t){var i=getComputedStyle(t);return i||e("Style returned "+i+". Are you running this code in a hidden iframe on Firefox? See http://bit.ly/getsizebug1"),i}var _,x=!1;function P(t){if(function(){if(!x){x=!0;var t=document.createElement("div");t.style.width="200px",t.style.padding="1px 2px 3px 4px",t.style.borderStyle="solid",t.style.borderWidth="1px 2px 3px 4px",t.style.boxSizing="border-box";var i=document.body||document.documentElement;i.appendChild(t);var e=E(t);P.isBoxSizeOuter=_=200==m(e.width),i.removeChild(t)}}(),"string"==typeof t&&(t=document.querySelector(t)),t&&"object"==typeof t&&t.nodeType){var i=E(t);if("none"==i.display)return function(){for(var t={width:0,height:0,innerWidth:0,innerHeight:0,outerWidth:0,outerHeight:0},i=0;i<b;i++)t[y[i]]=0;return t}();var e={};e.width=t.offsetWidth,e.height=t.offsetHeight;for(var n=e.isBorderBox="border-box"==i.boxSizing,o=0;o<b;o++){var r=y[o],s=i[r],h=parseFloat(s);e[r]=isNaN(h)?0:h}var a=e.paddingLeft+e.paddingRight,d=e.paddingTop+e.paddingBottom,u=e.marginLeft+e.marginRight,c=e.marginTop+e.marginBottom,p=e.borderLeftWidth+e.borderRightWidth,f=e.borderTopWidth+e.borderBottomWidth,g=n&&_,l=m(i.width);!1!==l&&(e.width=l+(g?0:a+p));var v=m(i.height);return!1!==v&&(e.height=v+(g?0:d+f)),e.innerWidth=e.width-(a+p),e.innerHeight=e.height-(d+f),e.outerWidth=e.width+u,e.outerHeight=e.height+c,e}}return P}),function(t,i){"function"==typeof define&&define.amd?define("ev-emitter/ev-emitter",i):"object"==typeof module&&module.exports?module.exports=i():t.EvEmitter=i()}("undefined"!=typeof window?window:this,function(){function t(){}var i=t.prototype;return i.on=function(t,i){if(t&&i){var e=this._events=this._events||{},n=e[t]=e[t]||[];return-1==n.indexOf(i)&&n.push(i),this}},i.once=function(t,i){if(t&&i){this.on(t,i);var e=this._onceEvents=this._onceEvents||{};return(e[t]=e[t]||{})[i]=!0,this}},i.off=function(t,i){var e=this._events&&this._events[t];if(e&&e.length){var n=e.indexOf(i);return-1!=n&&e.splice(n,1),this}},i.emitEvent=function(t,i){var e=this._events&&this._events[t];if(e&&e.length){e=e.slice(0),i=i||[];for(var n=this._onceEvents&&this._onceEvents[t],o=0;o<e.length;o++){var r=e[o];n&&n[r]&&(this.off(t,r),delete n[r]),r.apply(this,i)}return this}},i.allOff=function(){delete this._events,delete this._onceEvents},t}),function(i,e){"function"==typeof define&&define.amd?define("unipointer/unipointer",["ev-emitter/ev-emitter"],function(t){return e(i,t)}):"object"==typeof module&&module.exports?module.exports=e(i,require("ev-emitter")):i.Unipointer=e(i,i.EvEmitter)}(window,function(o,t){function i(){}var e=i.prototype=Object.create(t.prototype);e.bindStartEvent=function(t){this._bindStartEvent(t,!0)},e.unbindStartEvent=function(t){this._bindStartEvent(t,!1)},e._bindStartEvent=function(t,i){var e=(i=void 0===i||i)?"addEventListener":"removeEventListener",n="mousedown";o.PointerEvent?n="pointerdown":"ontouchstart"in o&&(n="touchstart"),t[e](n,this)},e.handleEvent=function(t){var i="on"+t.type;this[i]&&this[i](t)},e.getTouch=function(t){for(var i=0;i<t.length;i++){var e=t[i];if(e.identifier==this.pointerIdentifier)return e}},e.onmousedown=function(t){var i=t.button;i&&0!==i&&1!==i||this._pointerDown(t,t)},e.ontouchstart=function(t){this._pointerDown(t,t.changedTouches[0])},e.onpointerdown=function(t){this._pointerDown(t,t)},e._pointerDown=function(t,i){t.button||this.isPointerDown||(this.isPointerDown=!0,this.pointerIdentifier=void 0!==i.pointerId?i.pointerId:i.identifier,this.pointerDown(t,i))},e.pointerDown=function(t,i){this._bindPostStartEvents(t),this.emitEvent("pointerDown",[t,i])};var n={mousedown:["mousemove","mouseup"],touchstart:["touchmove","touchend","touchcancel"],pointerdown:["pointermove","pointerup","pointercancel"]};return e._bindPostStartEvents=function(t){if(t){var i=n[t.type];i.forEach(function(t){o.addEventListener(t,this)},this),this._boundPointerEvents=i}},e._unbindPostStartEvents=function(){this._boundPointerEvents&&(this._boundPointerEvents.forEach(function(t){o.removeEventListener(t,this)},this),delete this._boundPointerEvents)},e.onmousemove=function(t){this._pointerMove(t,t)},e.onpointermove=function(t){t.pointerId==this.pointerIdentifier&&this._pointerMove(t,t)},e.ontouchmove=function(t){var i=this.getTouch(t.changedTouches);i&&this._pointerMove(t,i)},e._pointerMove=function(t,i){this.pointerMove(t,i)},e.pointerMove=function(t,i){this.emitEvent("pointerMove",[t,i])},e.onmouseup=function(t){this._pointerUp(t,t)},e.onpointerup=function(t){t.pointerId==this.pointerIdentifier&&this._pointerUp(t,t)},e.ontouchend=function(t){var i=this.getTouch(t.changedTouches);i&&this._pointerUp(t,i)},e._pointerUp=function(t,i){this._pointerDone(),this.pointerUp(t,i)},e.pointerUp=function(t,i){this.emitEvent("pointerUp",[t,i])},e._pointerDone=function(){this._pointerReset(),this._unbindPostStartEvents(),this.pointerDone()},e._pointerReset=function(){this.isPointerDown=!1,delete this.pointerIdentifier},e.pointerDone=function(){},e.onpointercancel=function(t){t.pointerId==this.pointerIdentifier&&this._pointerCancel(t,t)},e.ontouchcancel=function(t){var i=this.getTouch(t.changedTouches);i&&this._pointerCancel(t,i)},e._pointerCancel=function(t,i){this._pointerDone(),this.pointerCancel(t,i)},e.pointerCancel=function(t,i){this.emitEvent("pointerCancel",[t,i])},i.getPointerPoint=function(t){return{x:t.pageX,y:t.pageY}},i}),function(i,e){"function"==typeof define&&define.amd?define("unidragger/unidragger",["unipointer/unipointer"],function(t){return e(i,t)}):"object"==typeof module&&module.exports?module.exports=e(i,require("unipointer")):i.Unidragger=e(i,i.Unipointer)}(window,function(r,t){function i(){}var e=i.prototype=Object.create(t.prototype);e.bindHandles=function(){this._bindHandles(!0)},e.unbindHandles=function(){this._bindHandles(!1)},e._bindHandles=function(t){for(var i=(t=void 0===t||t)?"addEventListener":"removeEventListener",e=t?this._touchActionValue:"",n=0;n<this.handles.length;n++){var o=this.handles[n];this._bindStartEvent(o,t),o[i]("click",this),r.PointerEvent&&(o.style.touchAction=e)}},e._touchActionValue="none",e.pointerDown=function(t,i){this.okayPointerDown(t)&&(this.pointerDownPointer=i,t.preventDefault(),this.pointerDownBlur(),this._bindPostStartEvents(t),this.emitEvent("pointerDown",[t,i]))};var o={TEXTAREA:!0,INPUT:!0,SELECT:!0,OPTION:!0},s={radio:!0,checkbox:!0,button:!0,submit:!0,image:!0,file:!0};return e.okayPointerDown=function(t){var i=o[t.target.nodeName],e=s[t.target.type],n=!i||e;return n||this._pointerReset(),n},e.pointerDownBlur=function(){var t=document.activeElement;t&&t.blur&&t!=document.body&&t.blur()},e.pointerMove=function(t,i){var e=this._dragPointerMove(t,i);this.emitEvent("pointerMove",[t,i,e]),this._dragMove(t,i,e)},e._dragPointerMove=function(t,i){var e={x:i.pageX-this.pointerDownPointer.pageX,y:i.pageY-this.pointerDownPointer.pageY};return!this.isDragging&&this.hasDragStarted(e)&&this._dragStart(t,i),e},e.hasDragStarted=function(t){return 3<Math.abs(t.x)||3<Math.abs(t.y)},e.pointerUp=function(t,i){this.emitEvent("pointerUp",[t,i]),this._dragPointerUp(t,i)},e._dragPointerUp=function(t,i){this.isDragging?this._dragEnd(t,i):this._staticClick(t,i)},e._dragStart=function(t,i){this.isDragging=!0,this.isPreventingClicks=!0,this.dragStart(t,i)},e.dragStart=function(t,i){this.emitEvent("dragStart",[t,i])},e._dragMove=function(t,i,e){this.isDragging&&this.dragMove(t,i,e)},e.dragMove=function(t,i,e){t.preventDefault(),this.emitEvent("dragMove",[t,i,e])},e._dragEnd=function(t,i){this.isDragging=!1,setTimeout(function(){delete this.isPreventingClicks}.bind(this)),this.dragEnd(t,i)},e.dragEnd=function(t,i){this.emitEvent("dragEnd",[t,i])},e.onclick=function(t){this.isPreventingClicks&&t.preventDefault()},e._staticClick=function(t,i){this.isIgnoringMouseUp&&"mouseup"==t.type||(this.staticClick(t,i),"mouseup"!=t.type&&(this.isIgnoringMouseUp=!0,setTimeout(function(){delete this.isIgnoringMouseUp}.bind(this),400)))},e.staticClick=function(t,i){this.emitEvent("staticClick",[t,i])},i.getPointerPoint=t.getPointerPoint,i}),function(e,n){"function"==typeof define&&define.amd?define(["get-size/get-size","unidragger/unidragger"],function(t,i){return n(e,t,i)}):"object"==typeof module&&module.exports?module.exports=n(e,require("get-size"),require("unidragger")):e.Draggabilly=n(e,e.getSize,e.Unidragger)}(window,function(r,a,t){function e(t,i){for(var e in i)t[e]=i[e];return t}var n=r.jQuery;function i(t,i){this.element="string"==typeof t?document.querySelector(t):t,n&&(this.$element=n(this.element)),this.options=e({},this.constructor.defaults),this.option(i),this._create()}var o=i.prototype=Object.create(t.prototype);i.defaults={},o.option=function(t){e(this.options,t)};var s={relative:!0,absolute:!0,fixed:!0};function d(t,i,e){return e=e||"round",i?Math[e](t/i)*i:t}return o._create=function(){this.position={},this._getPosition(),this.startPoint={x:0,y:0},this.dragPoint={x:0,y:0},this.startPosition=e({},this.position);var t=getComputedStyle(this.element);s[t.position]||(this.element.style.position="relative"),this.on("pointerDown",this.onPointerDown),this.on("pointerMove",this.onPointerMove),this.on("pointerUp",this.onPointerUp),this.enable(),this.setHandles()},o.setHandles=function(){this.handles=this.options.handle?this.element.querySelectorAll(this.options.handle):[this.element],this.bindHandles()},o.dispatchEvent=function(t,i,e){var n=[i].concat(e);this.emitEvent(t,n),this.dispatchJQueryEvent(t,i,e)},o.dispatchJQueryEvent=function(t,i,e){var n=r.jQuery;if(n&&this.$element){var o=n.Event(i);o.type=t,this.$element.trigger(o,e)}},o._getPosition=function(){var t=getComputedStyle(this.element),i=this._getPositionCoord(t.left,"width"),e=this._getPositionCoord(t.top,"height");this.position.x=isNaN(i)?0:i,this.position.y=isNaN(e)?0:e,this._addTransformPosition(t)},o._getPositionCoord=function(t,i){if(-1!=t.indexOf("%")){var e=a(this.element.parentNode);return e?parseFloat(t)/100*e[i]:0}return parseInt(t,10)},o._addTransformPosition=function(t){var i=t.transform;if(0===i.indexOf("matrix")){var e=i.split(","),n=0===i.indexOf("matrix3d")?12:4,o=parseInt(e[n],10),r=parseInt(e[n+1],10);this.position.x+=o,this.position.y+=r}},o.onPointerDown=function(t,i){this.element.classList.add("is-pointer-down"),this.dispatchJQueryEvent("pointerDown",t,[i])},o.dragStart=function(t,i){this.isEnabled&&(this._getPosition(),this.measureContainment(),this.startPosition.x=this.position.x,this.startPosition.y=this.position.y,this.setLeftTop(),this.dragPoint.x=0,this.dragPoint.y=0,this.element.classList.add("is-dragging"),this.dispatchEvent("dragStart",t,[i]),this.animate())},o.measureContainment=function(){var t=this.getContainer();if(t){var i=a(this.element),e=a(t),n=this.element.getBoundingClientRect(),o=t.getBoundingClientRect(),r=e.borderLeftWidth+e.borderRightWidth,s=e.borderTopWidth+e.borderBottomWidth,h=this.relativeStartPosition={x:n.left-(o.left+e.borderLeftWidth),y:n.top-(o.top+e.borderTopWidth)};this.containSize={width:e.width-r-h.x-i.width,height:e.height-s-h.y-i.height}}},o.getContainer=function(){var t=this.options.containment;if(t)return t instanceof HTMLElement?t:"string"==typeof t?document.querySelector(t):this.element.parentNode},o.onPointerMove=function(t,i,e){this.dispatchJQueryEvent("pointerMove",t,[i,e])},o.dragMove=function(t,i,e){if(this.isEnabled){var n=e.x,o=e.y,r=this.options.grid,s=r&&r[0],h=r&&r[1];n=d(n,s),o=d(o,h),n=this.containDrag("x",n,s),o=this.containDrag("y",o,h),n="y"==this.options.axis?0:n,o="x"==this.options.axis?0:o,this.position.x=this.startPosition.x+n,this.position.y=this.startPosition.y+o,this.dragPoint.x=n,this.dragPoint.y=o,this.dispatchEvent("dragMove",t,[i,e])}},o.containDrag=function(t,i,e){if(!this.options.containment)return i;var n="x"==t?"width":"height",o=d(-this.relativeStartPosition[t],e,"ceil"),r=this.containSize[n];return r=d(r,e,"floor"),Math.max(o,Math.min(r,i))},o.onPointerUp=function(t,i){this.element.classList.remove("is-pointer-down"),this.dispatchJQueryEvent("pointerUp",t,[i])},o.dragEnd=function(t,i){this.isEnabled&&(this.element.style.transform="",this.setLeftTop(),this.element.classList.remove("is-dragging"),this.dispatchEvent("dragEnd",t,[i]))},o.animate=function(){if(this.isDragging){this.positionDrag();var t=this;requestAnimationFrame(function(){t.animate()})}},o.setLeftTop=function(){this.element.style.left=this.position.x+"px",this.element.style.top=this.position.y+"px"},o.positionDrag=function(){this.element.style.transform="translate3d( "+this.dragPoint.x+"px, "+this.dragPoint.y+"px, 0)"},o.staticClick=function(t,i){this.dispatchEvent("staticClick",t,[i])},o.setPosition=function(t,i){this.position.x=t,this.position.y=i,this.setLeftTop()},o.enable=function(){this.isEnabled=!0},o.disable=function(){this.isEnabled=!1,this.isDragging&&this.dragEnd()},o.destroy=function(){this.disable(),this.element.style.transform="",this.element.style.left="",this.element.style.top="",this.element.style.position="",this.unbindHandles(),this.$element&&this.$element.removeData("draggabilly")},o._init=function(){},n&&n.bridget&&n.bridget("draggabilly",i),i});



const setupPopup = function(options) {
    popUpElem = document.createElement("div");
    popUpElem.id = "sefaria-popup";
    popUpElem.classList.add("interface-" + options.interfaceLang);
    popUpElem.classList.add("content-" + options.contentLang);

    var html = `<style scoped> 
        @import url("https://fonts.googleapis.com/css?family=Crimson+Text|Frank+Ruhl+Libre|Heebo"); 
        #sefaria-popup {
            width: 400px;
            max-height: 560px; 
            font-size: 16px; 
            border-left: 1px #ddd solid;
            border-right: 1px #ddd solid;
            border-bottom: 1px #ddd solid;
            background-color: #fff;
            color: #222222;
        }
        .sefaria-text .en, .sefaria-text .he { 
            padding: 10px 20px;
            text-align: justify;
        } 
        .sefaria-text { 
            max-height: 430px;
            overflow-y: auto; 
            overflow-x: hidden; 
        } 
        .sefaria-text:focus { 
            outline: none;
        } 
        #sefaria-title { 
            font-weight: bold; 
            font-size: 16px;
            text-align: center; 
            text-decoration: none; 
        } 
        .en { 
            font-family: "Crimson Text"; 
        } 
        .he { 
            font-family: "Frank Ruhl Libre"; 
        } 
        .content-hebrew .sefaria-text .en { 
            display: none; 
        } 
        .content-english .sefaria-text .he { 
            display: none 
        } 
        .content-hebrew .sefaria-text .en.enOnly { 
            display: block; 
        } 
        .content-english .sefaria-text .he.heOnly { 
            display: block 
        } 
        #sefaria-logo { 
            background: url(\"data:image/svg+xml,%3Csvg id='Layer_1' data-name='Layer 1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 340.96 93.15'%3E%3Cdefs%3E%3Cstyle%3E.cls-1%7Bfill:none;%7D.cls-2%7Bclip-path:url(%23clip-path);%7D.cls-3%7Bfill:%23231f20;%7D%3C/style%3E%3CclipPath id='clip-path' transform='translate(-389 -337.85)'%3E%3Crect class='cls-1' x='389' y='337.85' width='340.96' height='93.15'/%3E%3C/clipPath%3E%3C/defs%3E%3Ctitle%3Esefarialogo%3C/title%3E%3Cg class='cls-2'%3E%3Cpath class='cls-3' d='M454,397.67c-2.41,11.31-10.59,16.11-28.82,16.11-44.79,0-28.92-36-22.66-43.42,2.63-3.29,4.47-6,11.15-6h12.71c17.72,0,21.1.84,25.54,9.9,2.4,4.88,3.79,15.41,2.08,23.43m4.81-22.48c-1.5-9.67-3.45-20.19-11.85-26-5.09-3.54-10.34-3.8-16.21-3.8-4,0-18.11-.17-24.29-.17-6,0-10-4.94-10-7.34-3.91,4.79-6.9,10.08-5.85,16.48.94,5.76,4.89,9.44,10.67,10.17-6.55,9.25-12.47,19.9-12.18,31.18.18,7.11,1.81,35.32,33.71,35.32h5.81c13.62,0,21.87-10.11,24.27-14,7.05-11.5,8.23-29.29,6-41.78' transform='translate(-389 -337.85)'/%3E%3Cpath class='cls-3' d='M722.79,402.89a12.32,12.32,0,0,1-9.74,5.06,11.59,11.59,0,0,1-11.78-11.7c0-6.19,4.53-11.7,11.4-11.7a12.78,12.78,0,0,1,10.12,5.06ZM723,414H730V378.51H723v3.24a16.65,16.65,0,0,0-11.1-4,16.87,16.87,0,0,0-8.69,2.27,19,19,0,0,0-.07,32.39,18.26,18.26,0,0,0,8.91,2.34,16.31,16.31,0,0,0,10.95-4ZM676,365.9a4.61,4.61,0,0,0,4.68,4.68,4.68,4.68,0,0,0,4.76-4.68,4.75,4.75,0,0,0-4.76-4.76A4.68,4.68,0,0,0,676,365.9M677.11,414h7.17V378.51h-7.17Zm-8.68-36a18.29,18.29,0,0,0-2.79-.23c-5.21,0-8.91,2.42-10.65,4.83v-4.07h-7V414h7.18V390.51c2-3.4,5.89-6,9.59-6a10.06,10.06,0,0,1,2.79.3ZM628,402.89A12.32,12.32,0,0,1,618.3,408a11.59,11.59,0,0,1-11.78-11.7c0-6.19,4.53-11.7,11.4-11.7A12.8,12.8,0,0,1,628,389.61Zm.22,11.1h7V378.51h-7v3.24a16.62,16.62,0,0,0-11.1-4,16.83,16.83,0,0,0-8.68,2.27,19,19,0,0,0-.07,32.39,18.2,18.2,0,0,0,8.91,2.34,16.3,16.3,0,0,0,10.94-4Zm-33.07-53.83a16.61,16.61,0,0,0-4.23-.53,13.88,13.88,0,0,0-11.62,5.89c-1.59,2.27-2.27,5.21-2.27,10v3h-8.3v6.41h8.3V414h7.18V384.92h10.94v-6.41H584.25v-3.25c0-3.25.37-5.06,1.35-6.34a7,7,0,0,1,5.44-2.49,11.64,11.64,0,0,1,2.64.3ZM546.65,384a9.92,9.92,0,0,1,9.36,7.7H536.68a10.31,10.31,0,0,1,10-7.7m16.76,13.74a14,14,0,0,0,.07-1.51c0-10.5-7.17-18.5-17.06-18.5s-17.29,7.85-17.29,18.5a18,18,0,0,0,18.35,18.5c7.24,0,12.3-3.25,14.95-6.65l-4.69-4.45a12.78,12.78,0,0,1-10.19,4.83,11.43,11.43,0,0,1-11.47-10.72Zm-75.58,8.15a23.68,23.68,0,0,0,18.5,8.84c9.21,0,16.38-6,16.38-15.33,0-6-3.32-9.74-6.87-12.08-6.79-4.53-18-6-18-12.68,0-4.61,4.38-7.1,8.75-7.1a14.55,14.55,0,0,1,9.44,3.62l4.46-5.51a21.76,21.76,0,0,0-14.2-5.28c-9.21,0-16,6.34-16,14,0,5.51,2.94,9.14,6.72,11.63,7,4.6,18.19,5.51,18.19,13.59,0,4.75-4.3,7.92-9.21,7.92-5.44,0-9.81-3-12.91-6.79Z' transform='translate(-389 -337.85)'/%3E%3C/g%3E%3C/svg%3E\") no-repeat;
            width: 70px; 
            display: inline-block;
            margin-left: 3px; 
            height: 18px; 
            line-height: 18px; 
            opacity: 0.6 
        } 
        .sefaria-footer { 
            color: #999; 
            padding:20px 20px 20px 20px; 
            border-top: 1px solid #ddd; 
            background-color: #FBFBFA; 
            font-size: 12px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            font-family: "Helvetica Neue", "Helvetica", sans-serif; 
        }
        .sefaria-read-more-button { 
            background-color: #fff; 
            padding: 5px 10px;
            margin-top: -3px; 
            border: 1px solid #ddd; 
            border-radius: 5px; 
        } 
        .interface-hebrew .sefaria-powered-by-box { 
            margin-top: -6px 
        }
        .sefaria-read-more-button a { 
            text-decoration: none; 
            color: #666; 
        }
        #sefaria-linker-header { 
            border-top: 4px solid #ddd; 
            border-bottom: 1px solid #ddd; 
            background-color: #FBFBFA; 
            text-align: center; 
            padding-bottom: 3px; 
        }
        .interface-hebrew .sefaria-footer { 
            direction: rtl; 
            font-family: "Heebo", sans-serif 
        };

        #sefaria-close { 
                font-family: "Crimson Text"; 
                font-size: 36px; 
                height: 48px; 
                line-height: 48px; 
                position: absolute; 
                top: -5px; 
                left: 20px; 
                cursor: pointer; 
                color: #999; 
                border: 0; 
                outline: none; 
            } 
        </style> 
        <div id="sefaria-close">×</div>`;

    const readMoreText = {
        "english": "Read More ›",
        "hebrew": "קרא עוד ›"
    }[options.interfaceLang];
    const poweredByText = {
        "english": "Powered by",
        "hebrew": '<center>מונע ע"י<br></center>'
    }[options.interfaceLang];

    html += `<div id="sefaria-linker-header"> 
            <h1 id="sefaria-title"><span class="he" dir="rtl"></span><span class="en"></span></h1> 
        </div> 
        <div class="sefaria-text" id="sefaria-linker-text" tabindex="0"></div> 

        <div class="sefaria-footer"> 
            <div class="sefaria-powered-by-box">${poweredByText}<div id="sefaria-logo">&nbsp;</div></div> 
            <span class="sefaria-read-more-button"> 
                <a class = "sefaria-popup-ref" href = "">${readMoreText}</a> 
            </span> 
        </div>`;

    popUpElem.innerHTML = html;

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

    //var draggie = new Draggabilly(popUpElem, {handle: "#sefaria-linker-header"});

    heBox = popUpElem.querySelector(".sefaria-text.he");
    enBox = popUpElem.querySelector(".sefaria-text.en");
    linkerHeader = popUpElem.querySelector("#sefaria-linker-header");
    linkerFooter = popUpElem.querySelector(".sefaria-footer");
    textBox = popUpElem.querySelector(".sefaria-text");
    heTitle = popUpElem.querySelector("#sefaria-title .he");
    enTitle = popUpElem.querySelector("#sefaria-title .en");
    heElems = popUpElem.querySelectorAll(".he");
    enElems = popUpElem.querySelectorAll(".en");

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
};

const fetchAndShow = function(ref) {
    Sefaria.getText(ref).then(showPopup.bind(this));
};
const showPopup = function(source) {
    while (textBox.firstChild) {
        textBox.removeChild(textBox.firstChild);
    }

    linkerHeader.style["border-top-color"] = Sefaria.palette.categoryColor(source["primary_category"]);

    if (lang === "en") {
        heTitle.style.display = "None";
        [].forEach.call(enElems, function(e) {e.style.display = "Block"});
    } else if (lang === "he") {
        [].forEach.call(heElems, function(e) {e.style.display = "Block"});
        [].forEach.call(enElems, function(e) {e.style.display = "None"});
    }

    if(typeof(source.text) === "string") {
        source.text = [source.text];
        source.he = [source.he];
    }
    if(typeof(source.text) === "object") {
        source.text = [].concat.apply([], source.text);
        source.he = [].concat.apply([], source.he);
    }

    for (let i = 0; i < source.text.length; i++) {
        enBox = document.createElement('div');
        heBox = document.createElement('div');
        enBox.innerHTML = source.text[i];
        heBox.innerHTML = source.he[i].replace(/[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5]/g, "");
        enBox.className = "en" + (!heBox.innerHTML ? " enOnly" : "");
        heBox.className = "he" + (!enBox.innerHTML ? " heOnly" : "");
        heBox.setAttribute("dir", "rtl");
        textBox.appendChild(heBox);
        textBox.appendChild(enBox);
    }

    enTitle.textContent = source.ref;
    heTitle.textContent = source.heRef;

    const rect = this.getBoundingClientRect();
    popUpElem.style.top = (rect.top > 100)?rect.top - 50 + "px":rect.top + 30 + "px";
    if (rect.left < window.innerWidth / 2) {
        popUpElem.style.left = rect.right + 10 + "px";
        popUpElem.style.right = "auto";
    } else {
        popUpElem.style.left = "auto";
        popUpElem.style.right = window.innerWidth - rect.left + "px";
    }

    popUpElem.style.display = "block";

    const popUpRect = popUpElem.getBoundingClientRect();
    if (window.innerHeight < popUpRect.bottom) { // popup drops off the screen
        const pos = ((window.innerHeight - popUpRect.height) - 10);
        popUpElem.style.top = (pos > 0)?pos + "px":"10px";
    }

    [].forEach.call(popUpElem.querySelectorAll(".sefaria-popup-ref"), function(link) {link.setAttribute('href', "/" + Sefaria.normRef(source.ref));});
    document.addEventListener("click", function (e) {
      let level = 0;
      for (let element = e.target; element; element = element.parentNode) {
        if (element.id === popUpElem.id) {
          return;
        }
        level++;
      }
      hidePopup();
    });

    const scrollbarOffset = popUpElem.clientWidth - textBox.clientWidth;
    if (scrollbarOffset > 0) {
        const nodes = textBox.childNodes;
        for(let i=0; i<nodes.length; i++) {
            nodes[i].style.marginRight = -scrollbarOffset+"px";
        }
    }

};

const hidePopup = function() {
    popUpElem.style.display = "none";
};

setupPopup({interfaceLang: "english", contentLang: "bilingual"});


const urlParams = new URLSearchParams(window.location.search);
const startingRef = urlParams.get('ref');
let currentRef = startingRef || "Shabbat 32a:4";
console.log(currentRef);

/*****          Hebrew / English Handling              *****/
let lang;
const isHebrew = () => lang === "he";
const isEnglish = () => lang === "en";
const switchToEnglish = () => lang = "en";
const switchToHebrew = () => lang = "he";


/*****          Initial screen construction            *****/
/*  GLOBALS Defined in template, with attributes:
        interfaceLang
*/
(GLOBALS.interfaceLang === "hebrew") ? switchToHebrew() : switchToEnglish();


/*****                   Currying Data                  *****/

const getDate = l => l.compDate && l.compDate - l.errorMargin;  // Returns undefined if attrs not available.
const linkKey = l => l.source.title + "-" + l.target.title;
const nodeKey = d => d.title;

async function fetchNetwork(ref) {
    let response = await fetch('/api/linknetwork/' + Sefaria.humanRef(ref));
    return await response.json();
}

const categoryY = n => {
        const c = n.category;
        return (
        c === "Tanakh"      ? h/3       :
        c === "Apocrypha"   ? h/5       :

        c === "Mishnah"     ? h/3       :
        c === "Tanaitic"    ? 2 * h/3   :
        c === "Midrash"     ? 5 * h/6   :

        c === "Talmud"      ? 2 * h/3   :

        c === "Halakhah"    ? 4 * h/5   :
        c === "Kabbalah"    ? h/4       :
        c === "Liturgy"     ? h/3       :
        c === "Philosophy"  ? h/4       :

        c === "Chasidut"    ? h/5       :
        c === "Musar"       ? h/3       :
        c === "Responsa"    ? 4 * h/5   :

        c === "Modern Works"? h/2       :
        h/2);
    };

function centroid(nodes) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const d of nodes) {
    let k = d.r ** 2;
    x += d.x * k;
    y += d.y * k;
    z += k;
  }
  return {x: x / z, y: y / z};
}

function forceBox() {
    let nodes;
    const buffer = 20;

    function force() {
        nodes.forEach(n => {n.y = Math.max(buffer, Math.min(h - buffer, n.y))});
    }
    force.initialize = _ => nodes = _;
    return force;
}

function forceCluster() {
//https://observablehq.com/@mbostock/clustered-bubbles-2

  const strength = 0.2;
  let nodes;

  function force(alpha) {
    const centroids = d3.rollup(nodes, centroid, d => d.category);
    const l = alpha * strength;
    for (const d of nodes) {
      const {x: cx, y: cy} = centroids.get(d.category);
      d.vx -= (d.x - cx) * l;
      d.vy -= (d.y - cy) * l;
    }
  }

  force.initialize = _ => nodes = _;

  return force;
}

function getLinkPath(n) {
        // Follow along links, in both directions, collecting nodes and links along the way.  Short circuit at root.

        function s2t(n) {
            let ls = links.filter(l => l.source === n);
            let ns = ls.map(l => l.target);
            return ns.map(n.root ? _ => null : s2t)
                .filter(_ => _)
                .reduce((a,c) => ({ns: a.ns.concat(c.ns), ls: a.ls.concat(c.ls)}), {ns, ls});
        }

        function t2s(n) {
            let ls = links.filter(l => l.target === n);
            let ns = ls.map(l => l.source);
            return ns.map(n.root ? _ => null : t2s)
                .filter(_ => _)
                .reduce((a,c) => ({ns: a.ns.concat(c.ns), ls: a.ls.concat(c.ls)}), {ns, ls});
        }

        const a = s2t(n);
        const b = t2s(n);
        return {
            ns: a.ns.concat(b.ns),
            ls: a.ls.concat(b.ls),
        }
    }

function renderText(ref) {
    Sefaria.getText(ref).then(text => {
        d3.select("#textTitle").html(text.ref);
        d3.select("#textInner").html(text.he);
    });
}

/*
function prepSimulation() {
    simulation
          .force("link", d3.forceLink(links).id(d => d.title))
          .force("cluster", forceCluster)
          .force("category", d3.forceY().y(categoryY).strength(.5))
          .force("box", forceBox)
          .force("collide", d3.forceCollide(d => d.expanded ? 120 : 30));

    simulation.on("tick", () => {
        link.attr("d", d3.linkHorizontal()
              .x(d => d.x)
              .y(d => d.y));

        node.attr("transform", d => `translate(${d.x},${d.y})`)
    });

    return simulation;
}
*/

function prepLinksAndNodes(treesObj) {
    links = treesObj.indexLinks.map(([source,target]) => ({source, target}));
    nodes = Object.entries(treesObj.indexNodes).map(([k,d]) => Object.assign(d));
    links.forEach(l => {l.highlighted = false});
    nodes.forEach(n => {
        n.fx = s(n);
        n.y = categoryY(n) + Math.random();
        // n.expanded = false;
        n.highlighted = false;
    });
    nodes.filter(d => d.root).forEach(n => {n.fy = h/2});
}

function renderNetwork() {
    link = graphBox
        .selectAll("path.link")
        .data(links, linkKey)
        .join("path")
          .attr("class", "link")
          .attr("stroke", d => Sefaria.palette.categoryColor(d.target.category))
          .attr("stroke-width", d => d.highlighted ? 3 : 1)
          .style("fill-opacity", 1);

    node = graphBox
        .selectAll("g.node")
        .data(nodes, nodeKey)
        .join(
            enter => {
                node = enter.append("g").attr("class", "node");
                node.append("rect")
                    .attr("x", -50)
                    .attr("y", -10)
                    .attr("width", 100)
                    .attr("height", 20)
                    .attr("stroke-width", d => d.highlighted ? 3 : 1)
                    .attr("stroke-linejoin", "round")
                    .attr("fill", d => d.root ? "#add8e6" :"#fff")
                    .attr("stroke", d => Sefaria.palette.categoryColor(d.category))
                    .attr("rx", 10);
                node.append("text")
                    .attr("x", 0)
                    .attr("y", 0)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "central")
                    .text(d => d.title.slice(0,20))
                    .attr("stroke-width", 1)
                    .attr("stroke", "black")
                  .clone(true).lower()
                    .attr("stroke", "white");
                return node;
            },
            update => {
                update.select("rect")
                    .attr("stroke-width", d => d.highlighted ? 3 : 1)
                    .attr("fill", d => d.root ? "#add8e6" :"#fff");
                return update;
            },
            exit => exit.remove()

        );
/*

    node.append("rect")
            .attr("x", -50)
            .attr("y", -10)
            .attr("width", 100)
            .attr("height", 20)
            .attr("stroke-width", d => d.highlighted ? 3 : 1)
            .attr("stroke-linejoin", "round")
            .attr("fill", "#fff")
            .attr("stroke", d => Sefaria.palette.categoryColor(d.category))
            .attr("rx", 10);

    node.append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .text(d => d.title.slice(0,20))
        .attr("stroke-width", 1)
        .attr("stroke", "black")
      .clone(true).lower()
        .attr("stroke", "white");
*/
    node.on("click", d => {
        const {ns, ls} = getLinkPath(d);
        nodes.forEach(n => {n.highlighted = false});
        ns.forEach(n => {n.highlighted = true});
        links.forEach(n => {n.highlighted = false});
        ls.forEach(n => {n.highlighted = true});
        d.highlighted = true;

        node.selectAll("rect")
            .attr("stroke-width", d => d.highlighted ? 3 : 1);
        link.attr("stroke-width", d => d.highlighted ? 3 : 1);
    });

    node.on("dblclick", function(d) {
        if (d.expanded) return;
        d.expanded = true;

        const ref_regex = new RegExp(d.title +",?\\s*", 'g');

        const g = d3.select(this);

        const rect = g.select("rect");
        rect.attr("height", 20 + 15 * d.refs.length);

        const refs =  g.selectAll("text.ref")
            .data(d.refs)
            .join("text");

        refs.attr("class", "ref")
            .text(r => r.replace(ref_regex, ""))
            .attr("x", -45)
            .attr("y", (r,i) => 15 + i * 15)
            .attr("text-anchor", "start")
            //.attr("dominant-baseline", "central")
            .attr("stroke-width", 1)
            .attr("stroke", "black")
            //.on("click", renderText)
            .on("click", fetchAndShow)
            .on("dblclick", refocusNetwork);

        simulation.force("collide", d3.forceCollide(d => d.expanded ? 30 + 15 * d.refs.length : 30))
            .alpha(.1)
            .restart();

    });
}

function renderIndexNetworkSimulation() {
    simulation = d3.forceSimulation(nodes);
    simulation
        .force("link", d3.forceLink(links).id(d => d.title))
        .force("cluster", forceCluster)
        .force("category", d3.forceY().y(categoryY).strength(.5))
        .force("box", forceBox)
        .force("collide", d3.forceCollide(d => d.expanded ? 120 : 30))
        .on("tick", () => {
            link.attr("d", d3.linkHorizontal()
              .x(d => d.x)
              .y(d => d.y));
            node.attr("transform", d => `translate(${d.x},${d.y})`)
            })
        .tick(200);

    renderNetwork();
}

function updateIndexNetworkSimulation() {
    simulation
        .nodes(nodes)
        .force("link", d3.forceLink(links).id(d => d.title))
        .alpha(1)
        .restart();

    renderNetwork();
}
/*****         Draw Tree                                *****/

buildScreen();

/*****         Methods used in screen construction      *****/

function buildScreen() {
    buildFrame();
    fetchNetwork(currentRef)
        .then(prepLinksAndNodes)
        .then(renderIndexNetworkSimulation);
}


function refocusNetwork(ref) {
    fetchNetwork(ref)
        .then(prepLinksAndNodes)
        .then(updateIndexNetworkSimulation)
}



//Build objects that are present for any starting state
function buildFrame() {
    w = window.innerWidth ?  window.innerWidth - margin[1] - margin[3] : 1000 - margin[1] - margin[3];

    svg = d3.select("#content").append("svg")
        .attr("width", w + margin[1] + margin[3] - 16)
        .attr("height", graphBox_height + 150);  // todo: 150 is slop because I'm too lazy to sit and do arithmetic
    svg.append("svg:desc").text("This SVG displays visually ...");
    graphBox = svg.append("g")
        //.attr("height", graphBox_height)
        .attr("transform", "translate(" + margin[3] + ", 10)")
        .attr("font-family", "sans-serif")
        .attr("font-size", 10)
        .attr("fill", "none")
        .attr("stroke-opacity", 0.4)
        .attr("stroke-width", 1.5);

    timeScale = d3.scaleLinear()
        .domain([-1500, 400, 2050])
        .range([0, w/5, w]);
    s = n => timeScale(getDate(n));

    let axis = d3.axisTop(timeScale)
        .tickValues([-1500,400,1100,1800]);

    graphBox.append("g")
        .attr("transform", "translate(0,10)")
        .call(axis);
}

/*****     Listeners to handle popstate and to rebuild on screen resize     *****/

window.addEventListener('resize', rebuildScreen);
window.addEventListener('popstate', handleStateChange);

function handleStateChange(event) {
    var poppedLang = event.state.lang;

    if(poppedLang !== lang) {  //Language change - no book change
        lang = poppedLang;
        if(lang === "he") {
            switchToHebrew();
        }
        else if(lang === "en" ) {
            switchToEnglish();
        }
        rebuildScreen();
        changePageTitle(event.state.title);
        return;
    }

    changePageTitle(event.state.title);
}

//Rebuild screen geometry, without state change
function rebuildScreen() {
    d3.selectAll("svg").remove();
    d3.selectAll("#textBox").remove();
    buildScreen();
}

/*****        History                *****/

function changePageTitle(title) {
     d3.select("title").text(title);
}

function replaceHistory() {
    var args = _getHistory();

    //console.log("replaceHistory",args.object, args.title, args.url);

    changePageTitle(args.object.title);
    history.replaceState(args.object, args.argtitle, args.url);
    //args.books.forEach(function (e,a,i) { Sefaria.track.exploreBook(e) });

}

function pushHistory() {
    var args = _getHistory();

    //console.log("pushHistory",args.object, args.title, args.url);
    Sefaria.track.exploreUrl(args.url);
    changePageTitle(args.object.title);
    history.pushState(args.object, args.argtitle, args.url);
    //args.books.forEach(function (e,a,i) { Sefaria.track.exploreBook(e) });
}

function _getHistory() {
    var url = "...";
    var title = isEnglish() ? "" : '';
}