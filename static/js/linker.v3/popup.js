import Draggabilly from 'draggabilly';

export class PopupManager {
    constructor({ mode, interfaceLang, contentLang, popupStyles, debug, reportCitation }) {
        this.mode = mode;
        this.interfaceLang = interfaceLang;
        this.contentLang = contentLang;
        this.popupStyles = popupStyles;
        this.debug = debug;
        this.reportCitation = reportCitation;
        // no need to declare these but declaring so API is clear
        this.popUpElem = null;
        this.heTitle = null;
        this.enTitle = null;
        this.heElems = null;
        this.enElems = null;
        this.triggerLink = null;
        this.hidePopup = this.hidePopup.bind(this);
    }

    setupPopup() {
        this.category_colors = {
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
        this.popUpElem = document.createElement("div");
        this.popUpElem.id = "sefaria-popup";
        this.popUpElem.classList.add("interface-" + this.interfaceLang);
        this.popUpElem.classList.add("content-" + this.contentLang);

        let html = "";
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
                'direction: ltr;' +
            '}' +
            '#sefaria-popup .he, #sefaria-popup .he * {' +
                'font-family: "Frank Ruhl Libre";' +
                'font-size: 21px;' +
                'line-height: 1.5;' +
                'direction: ltr;' +
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
            '.truncatedMessage {' +
                'direction: ltr;' +
                'margin-top: 10px;' +
                'padding: 20px;' +
                'color: #666;' +
                'font-size: 14px;' +
                'font-family: "Helvetica Neue", "Helvetica", sans-serif;' +
            '}' +
            '.interface-hebrew .truncatedMessage {' +
                'direction: ltr;' +
                'font-family: "Heebo", sans-serif;' +
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
            '}'+
            'a.sefaria-ref-debug{'+
                'border: 3px solid green;' +
            '}'+
            'a.sefaria-ref-debug.sefaria-link-failed{'+
                'border: 3px solid red' +
            '}'+
            'a.sefaria-ref-debug.sefaria-link-ambiguous{'+
                'border: 3px solid orange;' +
            '}';

        if (this.mode === "popup-click") {
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
        let readMoreText = {
            "english": "Read More ›",
            "hebrew": "קרא עוד ›"
        }[this.interfaceLang];
        let poweredByText = {
            "english": "Powered by",
            "hebrew": '<center>מונע ע"י<br></center>'
        }[this.interfaceLang];

        html += '<div id="sefaria-linker-header">' +
                '<div id="sefaria-title"><span class="he" dir="ltr"></span><span class="en"></span></div>' +
            '</div>' +
            '<div class="sefaria-text" id="sefaria-linker-text" tabindex="0"></div>' +

            '<div class="sefaria-footer">' +
                '<div class="sefaria-powered-by-box">' + poweredByText + ' <div id="sefaria-logo">&nbsp;</div></div>' +
                (this.mode === "popup-click" ?
                '<span class="sefaria-read-more-button">' +
                    '<a class = "sefaria-popup-ref" target="_blank" href = "">' + readMoreText + '</a>' +
                '</span>' : "") +
                (this.debug ?
                    '<span class="sefaria-read-more-button" id="sefaria-report-btn"><a>Report</a></span>'
                    : ''
                ) +
            '</div>';

        this.popUpElem.innerHTML = html;

        // Apply any override styles
        for (let n in this.popupStyles) {
            if (this.popupStyles.hasOwnProperty(n)) {
                this.popUpElem.style[n] = this.popupStyles[n];
            }
        }

        // Apply function-critical styles
        this.popUpElem.style.position = "fixed";
        this.popUpElem.style.overflow = "hidden";
        this.popUpElem.style.display = "none";
        this.popUpElem.style.zIndex = 999999;

        // Accessibility Whatnot
        this.popUpElem.setAttribute('role', 'dialog');
        this.popUpElem.tabIndex = "0";
        this.popUpElem.style.outline = "none";

        this.popUpElem = document.body.appendChild(this.popUpElem);

        let draggie = new Draggabilly(this.popUpElem, {handle: "#sefaria-linker-header"});

        this.linkerHeader = this.popUpElem.querySelector("#sefaria-linker-header");
        this.linkerFooter = this.popUpElem.querySelector(".sefaria-footer");
        this.textBox = this.popUpElem.querySelector(".sefaria-text");
        this.heTitle = this.popUpElem.querySelector("#sefaria-title .he");
        this.enTitle = this.popUpElem.querySelector("#sefaria-title .en");
        this.heElems = this.popUpElem.querySelectorAll(".he");
        this.enElems = this.popUpElem.querySelectorAll(".en");

        if (this.mode === "popup-click") {
            this.popUpElem.querySelector('#sefaria-close').addEventListener('click', this.hidePopup, false);
            this.popUpElem.addEventListener('keydown', (e) => {
                let key = e.which || e.keyCode;
                if (key === 27) { // 27 is escape
                  this.hidePopup();
                }
                else if (key === 9) { // 9 is tab
                  e.preventDefault(); // this traps user in the dialog via tab
                }
            });
        }
    };

    showPopup(elem, {ref, heRef, en=[], he=[], primaryCategory, isTruncated=false}) {
        while (this.textBox.firstChild) {
            this.textBox.removeChild(this.textBox.firstChild);
        }
        this.triggerLink = elem;
        this.linkerHeader.style["border-top-color"] = this.category_colors[primaryCategory];

        // TODO is this right?
        if (this.contentLang !== "he") {
            // [].forEach.call(heElems, function(e) {e.style.display = "None"});
            this.heTitle.style.display = "None";
            [].forEach.call(this.enElems, function(e) {e.style.display = "Block"});
        } else {
            [].forEach.call(this.heElems, function(e) {e.style.display = "Block"});
            [].forEach.call(this.enElems, function(e) {e.style.display = "None"});
        }

        if (typeof(en) === "string") {
            en = [en]
            he = [he]
        }
        if (typeof(en) === "object") {
            en = [].concat.apply([], en);
            he = [].concat.apply([], he);
        }

        for (let i = 0; i < Math.max(en.length, he.length); i++) {
            let enBox = document.createElement('div');
            let heBox = document.createElement('div');
            enBox.innerHTML = en[i] || "";
            heBox.innerHTML = (he[i] || "").replace(/[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5]/g, "");
            enBox.className = "en" + (!heBox.innerHTML ? " enOnly" : "");
            heBox.className = "he" + (!enBox.innerHTML ? " heOnly" : "");
            heBox.setAttribute("dir", "ltr");
            if (heBox.innerHTML) { this.textBox.appendChild(heBox); }
            if (enBox.innerHTML) { this.textBox.appendChild(enBox);}
        }

        if (isTruncated) {
            const truncated = document.createElement('div');
            truncated.innerHTML = this.interfaceLang === "english" ? "Read the complete text on Sefaria" : "לקריאת הטקסט המלא בספריא";
            truncated.className = "truncatedMessage";
            this.textBox.appendChild(truncated);
        }

        this.enTitle.textContent = ref;
        this.heTitle.textContent = heRef;

        let rect = elem.getBoundingClientRect();
        this.popUpElem.style.top = (rect.top > 100)?rect.top - 50 + "px":rect.top + 30 + "px";
        if (rect.left < window.innerWidth / 2) {
            this.popUpElem.style.left = rect.right + 10 + "px";
            this.popUpElem.style.right = "auto";
        } else {
            this.popUpElem.style.left = "auto";
            this.popUpElem.style.right = window.innerWidth - rect.left + "px";
        }

        this.popUpElem.style.display = "block";

        let popUpRect = this.popUpElem.getBoundingClientRect();
        if (popUpRect.height > window.innerHeight) {
            // if the popup is too long for window height, shrink it
            this.popUpElem.classList.add("short-screen");
            this.popUpElem.style.height = (window.innerHeight * 0.9) + "px";
        }
        if (window.innerHeight < popUpRect.bottom) {
            // if popup drops off bottom screen, pull up
            let pos = ((window.innerHeight - popUpRect.height) - 10);
            this.popUpElem.style.top = (pos > 0) ? pos + "px" : "10px";
        }
        if (window.innerWidth < popUpRect.right || popUpRect.left < 0) {
            // popup drops off the side screen, center it
            let pos = ((window.innerWidth - popUpRect.width) / 2);
            this.popUpElem.style.left = pos + "px";
            this.popUpElem.style.right = "auto";
        }


        if (this.mode === "popup-click") {
            [].forEach.call(this.popUpElem.querySelectorAll(".sefaria-popup-ref"), function(link) {link.setAttribute('href', elem.href);});
            document.addEventListener("click", function (e) {
              let level = 0;
              for (let element = e.target; element; element = element.parentNode) {
                if (element.id === this.popUpElem.id) {
                  return;
                }
                level++;
              }
              this.hidePopup();
            }.bind(this));
        }

        if (this.debug) {
            const reportBtn = document.querySelector('#sefaria-report-btn');

            // remove old event listener
            reportBtn.removeEventListener('click', this.currReportCitation, false);

            this.currReportCitation = this.reportCitation.bind(null, elem);
            reportBtn.addEventListener('click', this.currReportCitation, false);
        }

        let scrollbarOffset = this.popUpElem.clientWidth - this.textBox.clientWidth;
        if (scrollbarOffset > 0) {
            let nodes = this.textBox.childNodes;
            for(let i=0; i<nodes.length; i++) {
                nodes[i].style.marginRight = -scrollbarOffset+"px";
            }
        }

    }

    hidePopup() {
        if (this.popUpElem.style.display === "block") {
            this.triggerLink.focus();
        }
        this.popUpElem.style.display = "none";
        this.popUpElem.classList.remove("short-screen");
        this.popUpElem.style.height = "auto";
    }

    bindEventHandler(elem, baseUrl, source) {
        const utmSource = window.location.hostname ? window.location.hostname.replace(/^www\./, "") : "(not%20set)";
        const urlLang = this.contentLang.substring(0, 2);
        const url = `${baseUrl}/${source.url}?lang=${urlLang}&utm_source=${utmSource}&utm_medium=sefaria_linker`;
        elem.setAttribute('href', url);
        if (this.mode === "popup-hover") {
            elem.addEventListener('mouseover', (event) => { this.showPopup(elem, source); }, false);
            elem.addEventListener('mouseout', this.hidePopup, false);
        } else if (this.mode === "popup-click") {
            elem.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.showPopup(elem, source);
                document.getElementById("sefaria-linker-text").focus();
            }, false);
        }
    }
}