var d3 = require('d3');
var Sefaria = require('sefaria');
var SefariaD3 = require("./sefaria-d3/sefaria-d3");
var $ = require("./sefaria/sefariaJquery");

/*****          Layout              *****/
var margin = [30, 40, 20, 40];
var w; // value determined in buildScreen()
var h = 730 - margin[0] - margin[2];

var svg;
var startingRef = "Shabbat 32a:4";


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

/*****                   Currying Data                  *****/



let getDate = l => l.compDate && l.compDate - l.errorMargin;  // Returns undefined if attrs not available.

let _partitionedLinks = {}; // ref: [past, future, concurrent]
async function getPartitionedLinks(ref, year) {
    // ref: String (required)
    // year: Integer (optional.  derived from ref if not provided.)
    // Returns three arrays: [past, future, concurrent]

    if (ref in _partitionedLinks) return _partitionedLinks[ref];

    let refYear = (year != null) ? year : await Sefaria.getIndexDetails(Sefaria.parseRef(ref).index).then(getDate);
    if ((!refYear) && (refYear !== 0)) throw "No date for " + ref; 

    let links = await Sefaria.getLinks(ref);

    let partionedLinks = partitionLinks(links, refYear);
    _partitionedLinks[ref] = partionedLinks;
    return partionedLinks;
}

function partitionLinks(links, year) {
  // Split array of links into three arrays, based on year
  // Returns three arrays: [past, future, concurrent]

  let past = [], future = [], concurrent=[];
  links.forEach(l => {
      if (!l.compDate) return;
      let lyear = getDate(l);
      ((lyear > year) ? future : (lyear < year) ? past : concurrent).push(l);
  });
  return [past, future, concurrent];
}

async function getPastLinks(ref, year) {
    let [past, future, concurrent] = await getPartitionedLinks(ref, year);
    return past;
}

async function getFutureLinks(ref, year) {
    let [past, future, concurrent] = await getPartitionedLinks(ref, year);
    return future;
}

async function getConcurrentLinks(ref, year) {
    let [past, future, concurrent] = await getPartitionedLinks(ref, year);
    return concurrent;
}

// Tree Builders
// These assume any given object has a ref attribute
// And are called initially with {ref: ref}

async function buildFutureTree(obj) {
    obj.future = await getFutureLinks(obj.ref, getDate(obj));
    for (link of obj.future) {
        await buildFutureTree(link);
    }
}

async function buildPastTree(obj) {
    obj.past = await getPastLinks(obj.ref, getDate(obj));
    for (link of obj.past) {
        await buildPastTree(link);
    }
}

async function buildConcurrentTree(obj) {
    obj.concurrent = await getConcurrentLinks(obj.ref, getDate(obj));

    // This one falls into loops, of course.
    // for (link of obj.concurrent) {
    //    await buildConcurrentTree(link);
    //}
}

async function buildAllTrees(ref) {
    let obj = {ref: ref};
    let a = buildFutureTree(obj);
    let b = buildPastTree(obj);
    let c = buildConcurrentTree(obj);
    await a;
    await b;
    await c;
    return obj;
}


/*****         Methods used in screen construction      *****/

function buildScreen() {
    buildFrame();
}


//Build objects that are present for any starting state
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
    var title = isEnglish() ? "" : '';
}