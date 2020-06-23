let d3 = require("d3");
let Sefaria = require('sefaria');
let SefariaD3 = require("./sefaria-d3/sefaria-d3");
let $ = require("./sefaria/sefariaJquery");
const { getMatchingOption } = require("react-jsonschema-form/lib/utils");
const { getSupportedLanguages } = require("humanize-duration");

/*****          Layout              *****/
let margin = [60, 40, 20, 40];
let w = 920; // real value determined in buildScreen()
let h = 730 - margin[0] - margin[2];
let textBox_height = 150;
let graphBox_height = h - textBox_height;

let svg, timeScale, s, t, textBox, graphBox;
let sefariaBlue = '#18345D';
const urlParams = new URLSearchParams(window.location.search);
let startingTopic = urlParams.get('topic');
let currentTopic = startingTopic || "entity";
console.log(currentTopic);

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

async function layoutTree(data) {
  const root = d3.hierarchy(data);
  const dy = 200;
  const dx = 20;
  const width = w;
  const height = h;

  // const radius = 477;
  // const tree = d3.tree()
  //   .size([2 * Math.PI, radius])
  //   .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth)
  const tree = d3.tree().nodeSize([dx, dy]);
  const diagonal = d3.linkHorizontal().x(d => d.y).y(d => d.x);
  const margin = ({top: 10, right: 120, bottom: 10, left: 40});
  root.x0 = dy / 2;
  root.y0 = 0;
  root.descendants().forEach((d, i) => {
    d.id = i;
    d._children = d.children;
    if (d.depth && d.children && d.children.length > 4) d.children = null;
  });

  svg.attr("viewBox", [-margin.left, -margin.top, width, dx])
      .style("font", "10px sans-serif")
      .style("user-select", "none");

  const gLink = svg.append("g")
      .attr("fill", "none")
      .attr("stroke", sefariaBlue)
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", 3);

  const gNode = svg.append("g")
      .attr("cursor", "pointer")
      .attr("pointer-events", "all");
  function zoomed() {
    gNode.attr("transform", d3.event.transform);
    gLink.attr("transform", d3.event.transform);
  }
  svg.call(d3.zoom()
    .extent([[0, 0], [w, h]])
    .scaleExtent([0.3, 3])
    .on("zoom", zoomed));
  function update(source) {
    const duration = d3.event && d3.event.altKey ? 2500 : 250;
    const nodes = root.descendants().reverse();
    const links = root.links();

    // Compute the new tree layout.
    tree(root);

    let left = root;
    let right = root;
    root.eachBefore(node => {
      if (node.x < left.x) left = node;
      if (node.x > right.x) right = node;
    });

    const height = right.x - left.x + margin.top + margin.bottom;

    const transition = svg.transition()
        //.duration(duration)
        //.attr("viewBox", [-margin.left, left.x - margin.top, width, height])
        // .tween("resize", window.ResizeObserver ? null : () => () => svg.dispatch("toggle"));

    // Update the nodes…
    const node = gNode.selectAll("g")
      .data(nodes, d => d.id);

    // Enter any new nodes at the parent's previous position.
    const nodeEnter = node.enter().append("g")
        .attr("transform", d => `translate(${source.y0},${source.x0})`)
        .attr("fill-opacity", 0)
        .attr("stroke-opacity", 0)
        .on("click", d => {
          d.children = d.children ? null : d._children;
          update(d);
        });

    nodeEnter.append("circle")
        .attr("r", 7.5)
        .attr("fill", d => d._children ? "rgb(171, 78, 102)" : "#999")
        .attr("stroke-width", 10);

    nodeEnter.append("text")
        .attr("dy", "0.31em")
        .attr("x", d => d._children ? -10 : 10)
        .attr("text-anchor", d => d._children ? "end" : "start")
        .text(d => d.data.name)
      .clone(true).lower()
        .attr("stroke-linejoin", "round")
        .attr("stroke-width", 3)
        .attr("stroke", "white");

    // Transition nodes to their new position.
    const nodeUpdate = node.merge(nodeEnter).transition(transition)
        .attr("transform", d => `translate(${d.y},${d.x})`)
        .attr("fill-opacity", 1)
        .attr("stroke-opacity", 1);

    // Transition exiting nodes to the parent's new position.
    const nodeExit = node.exit().transition(transition).remove()
        .attr("transform", d => `translate(${source.y},${source.x})`)
        .attr("fill-opacity", 0)
        .attr("stroke-opacity", 0);

    // Update the links…
    const link = gLink.selectAll("path")
      .data(links, d => d.target.id);

    // Enter any new links at the parent's previous position.
    const linkEnter = link.enter().append("path")
        .attr("d", d => {
          const o = {x: source.x0, y: source.y0};
          return diagonal({source: o, target: o});
        });

    // Transition links to their new position.
    link.merge(linkEnter).transition(transition)
        .attr("d", diagonal);

    // Transition exiting nodes to the parent's new position.
    link.exit().transition(transition).remove()
        .attr("d", d => {
          const o = {x: source.x, y: source.y};
          return diagonal({source: o, target: o});
        });

    // Stash the old positions for transition.
    root.eachBefore(d => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  }

  update(root);

  return svg.node();
}

async function layoutGraph(topic_data) {
  const drag = simulation => {

    function dragstarted(d) {
      if (!d3.event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(d) {
      d.fx = d3.event.x;
      d.fy = d3.event.y;
    }

    function dragended(d) {
      if (!d3.event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
  }
  const color = "#ff0000";
  const slugSet = new Set();
  const nodes = [{id: topic_data.slug, title: topic_data.primaryTitle}];
  const links = [];
  for (let [linkType, tempLinks] of Object.entries(topic_data.links)) {
    //if (linkType === 'has-sheets-related-to') { continue; }
    //if (linkType === 'sheets-related-to') { continue; }
    if (linkType !== 'is-a' && linkType !== 'is-category-of') { continue; }
    for (let tempLink of tempLinks.links) {
      if (!slugSet.has(tempLink.topic)) {
        slugSet.add(tempLink.topic);
        nodes.push({id: tempLink.topic, title: tempLink.title});
      }
      links.push({
        source: topic_data.slug,
        target: tempLink.topic,
        type: linkType
      });
    }
  }

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(d => 100))
    .force("charge", d3.forceManyBody().strength(x=> -5000))
    .force('x', d3.forceX(w / 2).strength(1))
    .force('y', d3.forceY(h / 2).strength(1))
    .force("center", d3.forceCenter(w / 2, h / 2));

  const link = svg.selectAll('.fdf')
  .data(links).enter().append('g')

  const ltext = link.append('text').text(d => d.type).style("fill", "#666").style('user-select', 'none')
  const line = link.append("line").attr("stroke", "#999")
  .attr("stroke-opacity", 0.6)
  

      const node = svg.selectAll(".ddfadsfd")
			.data(nodes)
			.enter().append("g")
	const circle = node.append("circle")
      .attr("r", 15)
      .attr("fill", color)
      .on('click', d => { window.location.href = `/visualize/topics?topic=${d.id}`})
      .call(drag(simulation));

const text = node.append("text")	
		  .text(d => d.title.en)
      .style("fill", "black")
      .style("user-select", "none");
 node.append("title")
     .text(d => d.title.en);

  simulation.on("tick", () => {
    line
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
        ltext
        .attr("dx", d => {
          const {x: x1, y: y1} = d.source;
          const {x: x2, y: y2} = d.target;
          const dy = y2-y1;
          const dx = x2-x1;
          const len = Math.sqrt(Math.pow(dy, 2) + Math.pow(dx, 2));
          let angle = Math.atan2(dy, dx);
          return x1 + (0.9*len)*Math.cos(angle);
        })
        .attr("dy", d => {
          const {x: x1, y: y1} = d.source;
          const {x: x2, y: y2} = d.target;
          const dy = y2-y1;
          const dx = x2-x1;
          const len = Math.sqrt(Math.pow(dy, 2) + Math.pow(dx, 2));
          let angle = Math.atan2(dy, dx);
          return y1 + (0.9*len)*Math.sin(angle);
        })
    circle
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

        text
        .attr("dx", d => d.x + 12)
        .attr("dy", d => d.y - 12);

  });

  return svg.node();
}

async function getTopic(topic) {
    let url = Sefaria.apiHost + "/api/topics/" + topic + "?with_links=1&annotate_links=1";
    let res = await Sefaria._ApiPromise(url);
    return res;
}

function createHierarchy(root) {
  const hierarchy = {name: allTopics[root] ? allTopics[root].primaryTitle.en : root};
  const children = allLinks[root];
  if (!!children && children.length) {
    hierarchy.children = [];
    for (let child of children) {
      const tempHierarchy = createHierarchy(child);
      hierarchy.children.push(tempHierarchy);
    }
  } else {
    return hierarchy;
  }
  return hierarchy;
}
let allTopics, allLinks;
async function getTree(topic) {
  let url = `${Sefaria.apiHost}/api/topics-graph/${topic}?min-sources=10`;
  let res = await Sefaria._ApiPromise(url).then(data => {
    allLinks = {};
    for (let link of data.links) {
      let tempLinks = allLinks[link.toTopic];
      if (!tempLinks) {
        tempLinks = [];
        allLinks[link.toTopic] = tempLinks;
      }
      tempLinks.push(link.fromTopic);
    }
    allTopics = {};
    for (let tempTopic of data.topics) {
      allTopics[tempTopic.slug] = tempTopic;
    }
    
    return createHierarchy(topic);
  });
  return res;
}

/*****         Draw Tree                                *****/

buildScreen();

/*****         Methods used in screen construction      *****/

function buildScreen() {
    buildFrame();
    curryAndRenderData();
}

function curryAndRenderData() {
    //getTopic(currentTopic)
    getTree(currentTopic)  
    .then(layoutTree)
        //.then(layoutGraph);
    // getPassage(currentRef)
    //     .then(buildRawTrees)
    //     .then(buildNetwork)
    //     .then(layoutTrees)
    //     .then(cleanObject)
    //     .then(renderTrees)
    //     .then(console.log);
}

function update(node) {
    return 0;
    // We can do a better job of sharing cache between treeObjs
    // currentRef = node.data.ref;
    // getPassage(currentRef)
    //     .then(buildRawTrees)
    //     .then(buildNetwork)
    //     .then(layoutTrees)
    //     .then(cleanObject)
    //     .then(updateTrees)
    //     .then(console.log);
}

//Build objects that are present for any starting state
function buildFrame() {
    w = window.innerWidth ?  window.innerWidth - margin[1] - margin[3] : 1000 - margin[1] - margin[3];
    // textBox = d3.select("#content").append("div")
    //     .attr("id", "textBox")
    //     .style("height", textBox_height + "px")
    //     .style("width", w - 400 + "px");
    // textBox.append("div")
    //     .attr("id", 'textTitle');
    // textBox.append("div")
    //     .attr("id", 'textInner')
    //     .style("direction", "rtl");
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

    graphBox.append("g")
        .attr("transform", "translate(0,50)");

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
