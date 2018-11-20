let d3 = require("d3");
let Sefaria = require('sefaria');
let SefariaD3 = require("./sefaria-d3/sefaria-d3");
let $ = require("./sefaria/sefariaJquery");

/*****          Layout              *****/
let margin = [30, 40, 20, 40];
let w = 920; // real value determined in buildScreen()
let h = 730 - margin[0] - margin[2];

let svg;
let startingRef = "Shabbat 32a:4";


/*****          Hebrew / English Handling              *****/
let lang;

function isHebrew() { return lang == "he"; }
function isEnglish() { return lang == "en"; }

function switchToEnglish() { lang = "en"; }
function switchToHebrew() { lang = "he"; }


/*****          Initial screen construction            *****/
/*  GLOBALS Defined in template, with attributes:
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
    obj.past = await getPastLinks(obj.ref, getDate(obj)); // For secondary links
    for (let link of obj.future) {
        await buildFutureTree(link);
    }
}

async function buildPastTree(obj) {
    obj.past = await getPastLinks(obj.ref, getDate(obj));
    obj.future = await getFutureLinks(obj.ref, getDate(obj));  // For secondary links
    for (let link of obj.past) {
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

async function buildRawTrees(ref) {
    // Returns an object:
    // {
    //    ref: ref,
    //    past: [],
    //    future: [],
    //    concurrent: []
    // }
    // With each list being a list of ref objects.
    // "past" refs may have a "past" attributes with a list of refs, and recursing
    // "future" refs may have a "future" attribute with a list of refs, and recursing

    let obj = {ref: ref};
    let a = buildFutureTree(obj);
    let b = buildPastTree(obj);
    let c = buildConcurrentTree(obj);
    await a;
    await b;
    await c;
    return obj;
}

function buildNetwork(trees) {
    // Do we end up with a pile of future data on the past tree, and vice versa?

    trees.additionalLinks = [];  // List of pairs: [early ref, later ref]
    trees.refLookup = {};
    trees.refLookup[trees.ref] = trees;

    // Walk the past tree
    //   Build up a dict of nodes in the space
    //   Remove any duplicate nodes, and add that connection to additionalLinks
    function trimPast(node) {
        if (!node.past) return;
        node.past.forEach((e,i,a) => {
            if (e.ref in trees.refLookup) {
                trees.additionalLinks.push([e.ref, node.ref]);
                delete a[i];
            } else {
                trees.refLookup[e.ref] = e;
            }
        });
        node.past = node.past.filter(a => a);
        node.past.forEach(trimPast);
    }
    // As above, with future tree
    function trimFuture(node) {
        if (!node.future) return;
        node.future.forEach((e,i,a) => {
            if (e.ref in trees.refLookup) {
                trees.additionalLinks.push([node.ref, e.ref]);
                delete a[i];
            } else {
                trees.refLookup[e.ref] = e;
            }
        });
        node.future = node.future.filter(a => a);
        node.future.forEach(trimFuture);
    }

    // Walk the past tree, looking at future pointing links.
    //   Add any connection to additionalLinks
    //   (Shouldn't need to do this in both directions)
    function addAdditionalLinks(node)  {
        if (!node.past) return;
        node.past.forEach((e,i,a) => {
            e.future.forEach(f => {
                if (f.ref in trees.refLookup) {
                    trees.additionalLinks.push([e.ref, f.ref]);
                }
            });
        });
        node.past.forEach(addAdditionalLinks);
    }

    trimPast(trees);
    trimFuture(trees);
    addAdditionalLinks(trees);


    trees.pastHierarchy = d3.hierarchy(trees, d => d["past"]);
    trees.futureHierarchy = d3.hierarchy(trees, d => d["future"]);


    return trees;


}



/*****         Draw Tree                                *****/

buildScreen();
buildAxis();
buildRawTrees(startingRef)
    .then(buildNetwork)
    .then(console.log);






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
    let TopTitle = isEnglish() ? "Influence over Time" : 'השפעה לאורך זמן';
    svg.append("a")
        .attr("xlink:href", "/visualize/timeline")
      .append("text")
        .attr("id","page-title")
        .attr("x", w/2)
        .attr("y", 46)
        .style("text-anchor", "middle")
        .text(TopTitle);
}

function buildAxis(trees) {
    // Set up the timescale
    let timeScale = d3.scaleLinear()
        .domain([-1500, 2050])
        .range([0, w]);

    let axis = d3.axisTop(timeScale);
    svg.append("g")
        .attr("transform", "translate(0,80)")
        .call(axis);
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