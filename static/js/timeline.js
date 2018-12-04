let d3 = require("d3");
let Sefaria = require('sefaria');
let SefariaD3 = require("./sefaria-d3/sefaria-d3");
let $ = require("./sefaria/sefariaJquery");

/*****          Layout              *****/
let margin = [60, 40, 20, 40];
let w = 920; // real value determined in buildScreen()
let h = 730 - margin[0] - margin[2];
let textBox_height = 200;
let graphBox_height = h - textBox_height;

let svg, timeScale, s, t, textBox, graphBox;

const urlParams = new URLSearchParams(window.location.search);
let startingRef = urlParams.get('ref');
startingRef = startingRef || "Shabbat 32a:4";
console.log(startingRef);

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

let _partitionedLinks = {}; // cache.  ref: [past, future, concurrent]
async function getPartitionedLinks(ref, year) {
    // ref: String (required)
    // year: Integer (optional.  derived from ref if not provided.)
    // Returns three arrays: [past, future, concurrent]

    if (ref in _partitionedLinks) return _partitionedLinks[ref];

    let refYear = (year != null) ? year : await Sefaria.getIndexDetails(Sefaria.parseRef(ref).index).then(getDate);
    if ((!refYear) && (refYear !== 0)) throw "No date for " + ref; 

    let links = await Sefaria.getLinks(ref).then(refineLinks);

    let partionedLinks = partitionLinks(links, refYear);
    _partitionedLinks[ref] = partionedLinks;
    return partionedLinks;
}

async function refineLinks(alllinks) {
    // Remove items that we never want to show
    const mainlinks = alllinks.filter(l => l.category !== "Reference");

    // Expand links to include full passages
    const refs = mainlinks.filter(l => l.category === "Talmud").map(l => l.ref);
    if (refs.length) {
        const passageRefs = await Sefaria.getPassages(refs);
        mainlinks.forEach(l => {
            l.ref = passageRefs[l.ref] || l.ref
        }); // Most of these will stay the same.
    }
    return mainlinks
}

function sortLinks(a1,b1) {
    const a = a1.data;
    const b = b1.data;
    if (a.index_title == b.index_title) {
        return a.commentaryNum - b.commentaryNum;
    }
    if (isHebrew()) {
        var indexA = Sefaria.index(a.index_title);
        var indexB = Sefaria.index(b.index_title);
        return indexA.heTitle > indexB.heTitle ? 1 : -1;
    }
    else {
        return a.sourceRef > b.sourceRef ? 1 : -1;
    }
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
    for (let link of obj.future) {
        await buildFutureTree(link);
    }

    // Remove dangling commentary branches
    // If an link has category "Commentary" and no future oriented links leave it off the chart.
    // (we don't know how it contributes to anything downstream)
    //debugger;
    obj.future = obj.future.filter(l => (l.future && l.future.length) || (l.category !== "Commentary"));
    //debugger;
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
    let i = await Sefaria.getIndexDetails(Sefaria.parseRef(ref).index);
    obj.compDate = i.compDate;
    obj.errorMargin = i.errorMargin;
    obj.category = i.category;
    let a = buildFutureTree(obj);
    let b = buildPastTree(obj);
    let c = buildConcurrentTree(obj);
    await a;
    await b;
    await c;
    return obj;
}

async function getPassage(ref) {
    let res = await Sefaria.getPassages([ref]);
    return res[ref];
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

    trees.pastHierarchy = d3.hierarchy(trees, d => d["past"]).sort(sortLinks);
    trees.futureHierarchy = d3.hierarchy(trees, d => d["future"]).sort(sortLinks);

    return trees;
}

function layoutTrees(trees) {
    let pt = d3.tree().size([w/2, graphBox_height])(trees.pastHierarchy);
    let ft = d3.tree().size([w/2, graphBox_height])(trees.futureHierarchy);
    // Reset x according to date
    pt.each(n => {n.y = s(n.data); n.color = Sefaria.palette.categoryColor(n.data.category); trees.refLookup[n.data.ref] = n; });
    ft.each(n => {n.y = s(n.data); n.color = Sefaria.palette.categoryColor(n.data.category); trees.refLookup[n.data.ref] = n; });

    // Reset root y to center;
    pt.y = s(pt.data);
    ft.y = s(ft.data);
    pt.x = graphBox_height/2;
    ft.x = graphBox_height/2;
    pt.color = Sefaria.palette.categoryColor(pt.data.category);
    ft.color = Sefaria.palette.categoryColor(ft.data.category);

    trees.refLookup[pt.ref] = pt;

    trees.pastTree = pt;
    trees.futureTree = ft;
    trees.placedLinks = trees.additionalLinks.map(ls => ({
            source: trees.refLookup[ls[0]],
            target: trees.refLookup[ls[1]]
        }));

    return trees;
}

function renderTrees(trees) {
    // debugger;
    const g = graphBox.append("g")
      .attr("font-family", "sans-serif")
      .attr("font-size", 10)
      .attr("transform", `translate(0,10)`);

  const link = g.append("g")
    .attr("fill", "none")
    .attr("stroke-opacity", 0.4)
    .attr("stroke-width", 1.5);

  link.selectAll("path.past")
    .data(trees.pastTree.links())
    .enter().append("path")
      .attr("class", "past")
      .attr("stroke", d => d.source.color)
      .attr("d", d3.linkHorizontal()
          .x(d => d.y)
          .y(d => d.x));

  link.selectAll("path.future")
    .data(trees.futureTree.links())
    .enter().append("path")
      .attr("class", "future")
      .attr("stroke", d => d.target.color)
      .attr("d", d3.linkHorizontal()
          .x(d => d.y)
          .y(d => d.x));

  link.selectAll("path.additional")
    .data(trees.placedLinks)
    .enter().append("path")
      .attr("class", "additional")
      .attr("stroke", d => d.target.color)
      .attr("d", d3.linkHorizontal()
          .x(d => d.y)
          .y(d => d.x));

  const futurenode = g.append("g")
      .attr("stroke-linejoin", "round")
      .attr("stroke-width", 3)
    .selectAll("g.future")
    .data(trees.futureTree.descendants().reverse())
    .enter().append("g")
      .attr("class", "future")
      .attr("transform", d => `translate(${d.y},${d.x})`);

    futurenode.append("circle")
      .attr("fill", d => d.children ? "#555" : "#999")
      .attr("r", 2.5);

    futurenode.append("text")
      .attr("dy", "0.31em")
      .attr("x", d => d.children ? -6 : 6)
      .attr("text-anchor", d => d.children ? "end" : "start")
      .text(d => d.data.ref)
    .clone(true).lower()
      .attr("stroke", "white");

  const pastnode = g.append("g")
      .attr("stroke-linejoin", "round")
      .attr("stroke-width", 3)
    .selectAll("g.future")
    .data(trees.pastTree.descendants().reverse())
    .enter().append("g")
      .attr("class", "past")
      .attr("transform", d => `translate(${d.y},${d.x})`);

    pastnode.append("circle")
      .attr("fill", d => d.children ? "#555" : "#999")
      .attr("r", 2.5);

    pastnode.append("text")
      .attr("dy", "0.31em")
      .attr("x", d => d.children ? -6 : 6)
      .attr("text-anchor", d => d.children ? "end" : "start")
      .text(d => d.data.ref)
    .clone(true).lower()
      .attr("stroke", "white");

  return trees;
}



/*****         Draw Tree                                *****/

buildScreen();



/*****         Methods used in screen construction      *****/

function buildScreen() {
    buildFrame();
    curryAndRenderData();
}


function curryAndRenderData() {
    getPassage(startingRef)
        .then(buildRawTrees)
        .then(buildNetwork)
        .then(layoutTrees)
        .then(renderTrees)
        .then(console.log);
}

//Build objects that are present for any starting state
function buildFrame() {
    w = window.innerWidth ?  window.innerWidth - margin[1] - margin[3] : 1000 - margin[1] - margin[3];
    textBox = d3.select("#content").append("div")
        .attr("id", "textBox")
        .style("height", textBox_height + "px")
        .style("width", w - 400 + "px")
        .style("margin", `${margin[0]}px auto`)
      .append("span")
        .attr("id", 'textSpan');
    svg = d3.select("#content").append("svg")
        .attr("width", w + margin[1] + margin[3] - 16)
        .attr("height", graphBox_height + 150);  // todo: 150 is slop becuase I'm too lazy to sit and do arithmetic
    svg.append("svg:desc").text("This SVG displays visually ...");
    graphBox = svg.append("g")
        // .attr("height", graphBox_height)
        .attr("transform", "translate(" + margin[3] + ", 0)");


    /*
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
    */

    timeScale = d3.scaleLinear()
    .domain([-1500, 2050])
    .range([0, w]);
    s = n => timeScale(getDate(n));

    let axis = d3.axisTop(timeScale);
    graphBox.append("g")
        .attr("transform", "translate(0,50)")
        .call(axis);
}

async function renderText(ref) {

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