var d3 = require('d3');
var Sefaria = require('sefaria');
var SefariaD3 = require("./sefaria-d3/sefaria-d3");
var $ = require("./sefaria/sefariaJquery");

/*****          Layout              *****/
var margin = [30, 40, 20, 40];
var w; // value determined in buildScreen()
var h = 730 - margin[0] - margin[2];

var svg;



/*****          Hebrew / English Handling              *****/
var lang;

function isHebrew() { return lang == "he"; }
function isEnglish() { return lang == "en"; }

function switchToEnglish() { lang = "en"; }
function switchToHebrew() { lang = "he"; }


/*****          Initial screen construction            *****/
/*  GLOBALS Defined in template, with attributes:
        books: List of books loaded initially
        interfaceLang
*/

(GLOBALS.interfaceLang == "hebrew") ? switchToHebrew() : switchToEnglish();


/*****         Methods used in screen construction      *****/

function buildScreen() {
    buildFrame();
}


//Build objects that are present for any starting state - 0, 1, or 2 books
function buildFrame() {
    w = window.innerWidth ?  window.innerWidth - margin[1] - margin[3] : 1000 - margin[1] - margin[3];
    svg = d3.select("#content").append("svg")
        .attr("width", w + margin[1] + margin[3] - 16)
        .attr("height", h + margin[0] + margin[2])
      .append("g")
        .attr("transform", "translate(" + margin[3] + "," + margin[0] + ")");

    svg.append("svg:desc").text("This SVG displays visually ...");

        // Titles and labels
    var TopTitle = isEnglish() ? "Connections ..." : 'חיבורים ...';
    svg.append("a")
        .attr("xlink:href", "/visualize/timeline")
      .append("text")
        .attr("id","page-title")
        .attr("x", w/2)
        .attr("y", 16)
        .style("text-anchor", "middle")
        .text(TopTitle);
}


/*****     Listeners to handle popstate and to rebuild on screen resize     *****/

window.addEventListener('resize', rebuildScreen);
window.addEventListener('popstate', handleStateChange);

function handleStateChange(event) {
    var poppedLang = event.state.lang;

    if(poppedLang != lang) {  //Language change - no book change
        lang = poppedLang;
        if(lang == "he") {
            switchToHebrew();
        }
        else if(lang == "en" ) {
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
    var title = isEnglish()?"":'';

