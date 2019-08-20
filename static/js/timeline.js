let d3 = require("d3");
let Sefaria = require('sefaria');
let SefariaD3 = require("./sefaria-d3/sefaria-d3");
let $ = require("./sefaria/sefariaJquery");

/*****          Layout              *****/
let margin = [60, 40, 20, 40];
let w = 920; // real value determined in buildScreen()
let h = 730 - margin[0] - margin[2];
let textBox_height = 150;
let graphBox_height = h - textBox_height;

let svg, timeScale, s, textBox, graphBox;
let links, nodes, link, node, simulation;

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

function prepSimulation() {
    simulation
          .force("link", d3.forceLink(links).id(d => d.title))
          .force("cluster", forceCluster)
          .force("category", d3.forceY().y(categoryY).strength(.5))
          .force("box", forceBox)
          .force("collide", d3.forceCollide(d => d.expanded ? 120 : 30));
    return simulation;
}

function prepLinksAndNodes(treesObj) {
    links = treesObj.indexLinks.map(([source,target]) => ({source, target}));
    nodes = Object.entries(treesObj.indexNodes).map(([k,d]) => Object.assign(d));
    nodes.forEach(n => {
        n.fx = s(n);
        n.y = categoryY(n) + Math.random();
        n.expanded = false;
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
        .join("g")
          .attr("class", "node");

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

    simulation.on("tick", () => {
        link.attr("d", d3.linkHorizontal()
              .x(d => d.x)
              .y(d => d.y));

        node.attr("transform", d => `translate(${d.x},${d.y})`)
    });

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
        const ref_regex = new RegExp(d.title +",?\\s*", 'g');

        d.expanded = true;

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
            .on("click", renderText)
            .on("dblclick", refocusNetwork);

        simulation.force("collide", d3.forceCollide(d => d.expanded ? 30 + 15 * d.refs.length : 30))
            .alpha(.1)
            .restart();

    });
}

function renderIndexNetworkSimulation() {
    simulation = d3.forceSimulation(nodes);
    prepSimulation().tick(200);
    renderNetwork();
}

function updateIndexNetworkSimulation() {
    simulation.nodes(nodes);
    prepSimulation();
    simulation.alpha(1).restart();
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

/*
function update(node) {
    // We can do a better job of sharing cache between treeObjs
    currentRef = node.data.ref;
    fetchNetwork(currentRef)
        .then(layoutTrees)
        .then(cleanObject)
        .then(updateTrees)
        .then(console.log);
}
*/

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
        .attr("height", graphBox_height + 150);  // todo: 150 is slop because I'm too lazy to sit and do arithmetic
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