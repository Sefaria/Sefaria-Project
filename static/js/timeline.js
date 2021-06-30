import "core-js/stable";
import "regenerator-runtime/runtime";
import * as d3 from './lib/d3.v5.min';
import Sefaria from 'sefaria';
import SefariaD3  from "./sefaria-d3/sefaria-d3";
import $  from "./sefaria/sefariaJquery";

/*****          Layout              *****/
let margin = [60, 40, 20, 40];
let w = 920; // real value determined in buildScreen()
let h = 730 - margin[0] - margin[2];
let textBox_height = 150;
let graphBox_height = h - textBox_height;

let svg, timeScale, s, t, textBox, graphBox;

const urlParams = new URLSearchParams(window.location.search);
let startingRef = urlParams.get('ref');
let currentRef = startingRef || "Shabbat 32a:4";
console.log(currentRef);

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



const getDate = l => l.compDate && l.compDate - l.errorMargin;  // Returns undefined if attrs not available.
const linkKey = l => l.source.data.ref + "-" + l.target.data.ref;
const nodeKey = n => n.data.ref;

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

    // Set up all the recursive calls first, then await them, so they execute in parallel.
    let promises = obj.future.map(buildFutureTree);
    await Promise.all(promises);
    // Remove dangling commentary branches
    // If an link has category "Commentary" and no future oriented links leave it off the chart.
    // (we don't know how it contributes to anything downstream)

    obj.future = obj.future.filter(l => (l.future && l.future.length) || (l.category !== "Commentary"));
    return obj;
}

async function buildPastTree(obj) {
    obj.past = await getPastLinks(obj.ref, getDate(obj));
    const f = getFutureLinks(obj.ref, getDate(obj));           // For secondary links
    let promises = obj.past.map(buildPastTree);

    await Promise.all(promises);
    obj.future = await f;

    obj.future = obj.future.filter(l => (l.future && l.future.length) || (l.category !== "Commentary"));
    return obj;
}

async function buildConcurrentTree(obj) {
    obj.concurrent = await getConcurrentLinks(obj.ref, getDate(obj));

    // This one falls into loops, of course.
    // for (link of obj.concurrent) {
    //    await buildConcurrentTree(link);
    //}
    return obj;
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

    const i = await Sefaria.getIndexDetails(Sefaria.parseRef(ref).index);
    const obj = {
        ref: ref,
        compDate: i.compDate,
        errorMargin: i.errorMargin,
        category: i.category
    };

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

function buildNetwork(treesObj) {
    // Do we end up with a pile of future data on the past tree, and vice versa?

    treesObj.additionalLinks = [];  // List of pairs: [early ref, later ref]
    treesObj.refLookup = {};
    treesObj.refLookup[treesObj.ref] = treesObj;

    // Walk the past tree
    //   Build up a dict of nodes in the space
    //   Remove any duplicate nodes, and add that connection to additionalLinks
    function trimPast(node) {
        if (!node.past) return;
        node.past.forEach((e,i,a) => {
            if (e.ref in treesObj.refLookup) {
                treesObj.additionalLinks.push([e.ref, node.ref]);
                delete a[i];
            } else {
                treesObj.refLookup[e.ref] = e;
            }
        });
        node.past = node.past.filter(a => a);
        node.past.forEach(trimPast);
    }
    // As above, with future tree
    function trimFuture(node) {
        if (!node.future) return;
        node.future.forEach((e,i,a) => {
            if (e.ref in treesObj.refLookup) {
                treesObj.additionalLinks.push([node.ref, e.ref]);
                delete a[i];
            } else {
                treesObj.refLookup[e.ref] = e;
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
            if (!e.future) return;
            e.future.forEach(f => {
                if (f.ref in treesObj.refLookup) {
                    treesObj.additionalLinks.push([e.ref, f.ref]);
                }
            });
        });
        node.past.forEach(addAdditionalLinks);
    }

    trimPast(treesObj);
    trimFuture(treesObj);
    addAdditionalLinks(treesObj);

    treesObj.pastHierarchy = d3.hierarchy(treesObj, d => d["past"]).sort(sortLinks);
    treesObj.futureHierarchy = d3.hierarchy(treesObj, d => d["future"]).sort(sortLinks);

    return treesObj;
}

function layoutTrees(treesObj) {
    let pt = d3.tree().size([w/2, graphBox_height])(treesObj.pastHierarchy);
    let ft = d3.tree().size([w/2, graphBox_height])(treesObj.futureHierarchy);

    // Reset x according to date
    // Reset root y to center;
    [pt, ft].forEach(t => {
        t.each(n => {n.y = s(n.data); n.color = Sefaria.palette.categoryColor(n.data.category); treesObj.refLookup[n.data.ref] = n; });
        t.y = s(t.data);
        t.x = graphBox_height/2;
        t.color = Sefaria.palette.categoryColor(t.data.category);
    });

    treesObj.refLookup[pt.ref] = pt;

    treesObj.pastTree = pt;
    treesObj.futureTree = ft;
    treesObj.placedLinks = treesObj.additionalLinks.map(ls => ({
            source: treesObj.refLookup[ls[0]],
            target: treesObj.refLookup[ls[1]]
        }));

    return treesObj;
}

function cleanObject(treesObj) {
    delete treesObj.past;
    delete treesObj.future;
    delete treesObj.concurrent;
    delete treesObj.pastHierarchy;
    delete treesObj.futureHierarchy;

    return treesObj;
}

function updateTrees(treesObj) {
    const components = {
        past: {
            links: treesObj.pastTree.links(),
            nodes: treesObj.pastTree.descendants().reverse(),
            coloring: "source"
        },
        future: {
            links: treesObj.futureTree.links(),
            nodes: treesObj.futureTree.descendants().reverse(),
            coloring: "target"
        },
        additional: {
            links: treesObj.placedLinks,
            coloring: "target"
        }
    };

  let t0 = d3.transition("0")
      .delay(200).duration(750);
  let t1 = t0.transition("1")
      .delay(200).duration(750);
  let t2 = t1.transition("2")
      .delay(200).duration(750);


  for (let klass in components) {
      let selection = graphBox.selectAll("path." + klass)
          .data(components[klass].links, linkKey);

      selection.exit()
          .transition(t0)
            .style("stroke-opacity", 1e-6)
            .remove();


      //update
      selection.transition(t1)
          .attr("d", d3.linkHorizontal()
              .x(d => d.y)
              .y(d => d.x));

      selection.enter().append("path")
          .attr("class", klass)
          .attr("stroke", d => d[components[klass].coloring].color)
          .attr("d", d3.linkHorizontal()
              .x(d => d.y)
              .y(d => d.x))
          .style("stroke-opacity", 1e-6)
        .transition(t2)
          .style("stroke-opacity", 1);
  }



  ["future","past"].forEach(klass => {
      const nodes = graphBox.selectAll("g." + klass)
          .data(components[klass].nodes, nodeKey);

      nodes.exit()
        .transition(t0)
          .style("fill-opacity", 1e-6)
          .remove();

      //update
      nodes.transition(t1)
          .attr("transform", d => `translate(${d.y},${d.x})`);

      const nodes_g = nodes.enter().append("g")
          .attr("class", klass)
          .attr("transform", d => `translate(${d.y},${d.x})`)
          .on("click", update)
          .on("mouseover", renderText);

      nodes_g.append("circle")
          .attr("stroke-width", 3)
          .attr("stroke-linejoin", "round")
          .attr("fill", d => d.children ? "#555" : "#999")
          .attr("r", 2.5)
          .style("fill-opacity", 1e-6)
        .transition(t2)
          .style("fill-opacity", 1);

      nodes_g.append("text")
          .attr("dy", "0.31em")
          .attr("x", d => d.children ? -6 : 6)
          .attr("text-anchor", d => d.children ? "end" : "start")
          .text(d => d.data.ref)
          .attr("stroke-width", 1)
          .attr("stroke", "black")
        .clone(true).lower()
          .attr("stroke", "white")
          .style("fill-opacity", 1e-6)
        .transition(t2)
          .style("fill-opacity", 1);
  });

}



function renderTrees(treesObj) {
    const components = {
        past: {
            links: treesObj.pastTree.links(),
            nodes: treesObj.pastTree.descendants().reverse(),
            coloring: "source"
        },
        future: {
            links: treesObj.futureTree.links(),
            nodes: treesObj.futureTree.descendants().reverse(),
            coloring: "target"
        },
        additional: {
            links: treesObj.placedLinks,
            coloring: "target"
        }
    };

    // debugger;

    for (let klass in components) {
        graphBox.selectAll("path." + klass)
          .data(components[klass].links, linkKey)
          .enter().append("path")
            .attr("class", klass)
            .attr("stroke", d => d[components[klass].coloring].color)
            .style("fill-opacity", 1)
            .attr("d", d3.linkHorizontal()
              .x(d => d.y)
              .y(d => d.x));
    }
    ["future","past"].forEach(klass => {
      const nodes = graphBox.selectAll("g." + klass)
        .data(components[klass].nodes, nodeKey)
        .enter().append("g")
          .attr("class", klass)
          .attr("transform", d => `translate(${d.y},${d.x})`)
          .on("click", update)
          .on("mouseover", renderText);

        nodes.append("circle")
          .attr("stroke-width", 3)
          .attr("stroke-linejoin", "round")
          .attr("fill", d => d.children ? "#555" : "#999")
          .attr("r", 2.5);

        nodes.append("text")
          .attr("dy", "0.31em")
          .attr("x", d => d.children ? -6 : 6)
          .attr("text-anchor", d => d.children ? "end" : "start")
          .text(d => d.data.ref)
          .attr("stroke-width", 1)
          .attr("stroke", "black")
        .clone(true).lower()
          .attr("stroke", "white");
    });

  return treesObj;
}

function renderText(node) {
    Sefaria.getText(node.data.ref).then(text => {
        d3.select("#textTitle").html(text.ref);
        d3.select("#textInner").html(text.he);
    });

}


/*****         Draw Tree                                *****/

buildScreen();

/*****         Methods used in screen construction      *****/

function buildScreen() {
    buildFrame();
    curryAndRenderData();
}

function curryAndRenderData() {
    getPassage(currentRef)
        .then(buildRawTrees)
        .then(buildNetwork)
        .then(layoutTrees)
        .then(cleanObject)
        .then(renderTrees)
        .then(console.log);
}

function update(node) {
    // We can do a better job of sharing cache between treeObjs
    currentRef = node.data.ref;
    getPassage(currentRef)
        .then(buildRawTrees)
        .then(buildNetwork)
        .then(layoutTrees)
        .then(cleanObject)
        .then(updateTrees)
        .then(console.log);
}

//Build objects that are present for any starting state
function buildFrame() {
    w = window.innerWidth ?  window.innerWidth - margin[1] - margin[3] : 1000 - margin[1] - margin[3];
    textBox = d3.select("#content").append("div")
        .attr("id", "textBox")
        .style("height", textBox_height + "px")
        .style("width", w - 400 + "px");
    textBox.append("div")
        .attr("id", 'textTitle');
    textBox.append("div")
        .attr("id", 'textInner')
        .style("direction", "rtl");
    svg = d3.select("#content").append("svg")
        .attr("width", w + margin[1] + margin[3] - 16)
        .attr("height", graphBox_height + 150);  // todo: 150 is slop becuase I'm too lazy to sit and do arithmetic
    svg.append("svg:desc").text("This SVG displays visually ...");
    graphBox = svg.append("g")
        // .attr("height", graphBox_height)
        .attr("transform", "translate(" + margin[3] + ", 10)")
        .attr("font-family", "sans-serif")
        .attr("font-size", 10)
        .attr("fill", "none")
        .attr("stroke-opacity", 0.4)
        .attr("stroke-width", 1.5);

    timeScale = d3.scaleLinear()
    .domain([-1500, 2050])
    .range([0, w]);
    s = n => timeScale(getDate(n));

    let axis = d3.axisTop(timeScale);
    graphBox.append("g")
        .attr("transform", "translate(0,50)")
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
