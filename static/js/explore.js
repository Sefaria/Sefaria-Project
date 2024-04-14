import "core-js/stable";
import "regenerator-runtime/runtime";
import d3  from 'd3';
import Sefaria  from 'sefaria';
import SefariaD3  from "./sefaria-d3/sefaria-d3";
import $  from "./sefaria/sefariaJquery";

/*****          Layout              *****/
const margin = [30, 40, 20, 40];
let w; // value determined in buildScreen()
let h = 730 - margin[0] - margin[2];

const topOffsetY = 80;
const bottomOffsetY = 580;

const bookSpacer = 3;
const bookHeight = 10;

const focusedCurtainWidth = 100;

let svg, links, plinks, tooltip, bookTooltip;
const brushes = {};


/*****    Book Collection Data      *****/

let booksJson;  // Initial setup book link info
let booksFocused = 0; //State of number of books opened

const categories = GLOBALS.categories;

const twelve = ["Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi"];
function isTwelve(el) { return twelve.indexOf(el["book"]) > -1; }
function isNotTwelve(el) { return !isTwelve(el); }

const pLinkCache = {}; //Cache for precise link queries

/*****          Colors              *****/

const colors = d3.scale.category10()
	.domain(["Torah","Prophets","Writings","Seder-Zeraim","Seder-Moed","Seder-Nashim","Seder-Nezikin","Seder-Kodashim","Seder-Tahorot"]);

let currentScheme = "Top";
const toggleColor = (function(){
    return function(d){
        var switchedTo = d.collection === topCat ? "Top" : "Bottom";
        if (switchedTo === currentScheme)
            return;
        currentScheme = currentScheme === "Top" ? "Bottom" : "Top";
        svg.selectAll(".link") //.transition().duration(250)
        	.attr("stroke", function(d) { return currentScheme === "Bottom" ? selectBook(d.book2).attr("color") : selectBook(d.book1).attr("color")  });
		svg.select("#switch1-1").transition().duration(1000).style("text-decoration", currentScheme === "Top" ? "underline" : null);
		svg.select("#switch1-2").transition().duration(1000).style("text-decoration", currentScheme === "Top" ? null : "underline");
    }
})();

/*****          Hebrew / English Handling              *****/
let lang;

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

let topBooks = [];
let bottomBooks = [];

const topCat = GLOBALS.topCat;
const bottomCat = GLOBALS.bottomCat;

const t = Sefaria.getShape(categories[topCat].shapeParam).then(d => topBooks = d);
const b = Sefaria.getShape(categories[bottomCat].shapeParam).then(d => bottomBooks = d);

$.when(b, t).then(function() {
    buildScreen(GLOBALS.books, "Top");
    replaceHistory();
});

/*****         Methods used in screen construction      *****/

function buildScreen(openBooks, colorScheme) {

    buildFrame();
    buildBookCollection(topBooks, topCat, "top", topOffsetY, 10);
    buildBookCollection(bottomBooks, bottomCat, "bottom", bottomOffsetY, 0);
    buildBookLinks();

    if(colorScheme == "Bottom") {
        currentScheme = "Top";
        toggleColor({"collection": bottomCat});
    }

    if (openBooks.length == 0) {
        svg.selectAll("#toggle").attr("display", "inline");
        showBookCollections();
        showBookLinks();
    }
    else {
        for (var i = 0; i < openBooks.length; i++) {
            openBook(selectBook(openBooks[i]).datum());
        }
        showBookCollections();
    }
}


//Build objects that are present for any starting state - 0, 1, or 2 books
function buildFrame() {
    w = window.innerWidth ?  window.innerWidth - margin[1] - margin[3] : 1000 - margin[1] - margin[3];
    svg = d3.select("#linkExplorerPage").insert("svg", "#svgBefore")
        .attr("width", w + margin[1] + margin[3] - 16)
        .attr("height", h + margin[0] + margin[2])
      .append("g")
        .attr("transform", "translate(" + margin[3] + "," + margin[0] + ")");

    svg.append("svg:desc").text("This SVG displays visually the connections between " + categories[bottomCat].title + " and " + categories[topCat].title + " that can be found throughout our site");
    links = svg.append("g").attr("id","links").attr("display","none");
    plinks = svg.append("g").attr("id","plinks");

        // Titles and labels
    var TopTitle = isEnglish() ? "Connections between " + categories[bottomCat].title + " and " + categories[topCat].title  : 'חיבורים בין ' + categories[bottomCat].heTitle + ' ו' + categories[topCat].heTitle ;
    svg.append("a")
        .attr("xlink:href", GLOBALS.urlRoot)
      .append("text")
        .attr("id","page-title")
        .attr("x", w/2)
        .attr("y", 16)
        .style("text-anchor", "middle")
        .text(TopTitle);

    var tLabel = isEnglish() ? '(View all ' + categories[topCat].title + ')' : '(חזרה למבט על כל ' + categories[topCat].heTitle + ')';
    var topLabel = svg.append("g")
        .attr("id", "top-label")
        .style("display", "none");
    topLabel.append("text")
        .attr("class", "label")
        .attr("x", w/2)
        .style("text-anchor", "middle")
        .attr("y", 55);
    topLabel.append("text")
        .attr("class","back-up")
        .attr("x", 0)
        .attr("y", 55)
        .text(tLabel)
        .datum({"collection": topCat})
        .on("click", recordCloseBook);

    var bLabel = isEnglish() ? '(View all ' + categories[bottomCat].title + ')' : '(חזרה למבט על כל ' + categories[bottomCat].heTitle + ')';
    var bottomLabel = svg.append("g")
        .attr("id", "bottom-label")
        .style("display", "none");
    bottomLabel.append("text")
        .attr("class", "label")
        .attr("x", w/2)
        .style("text-anchor", "middle")
        .attr("y", bottomOffsetY + 50);
    bottomLabel.append("text")
        .attr("class","back-up")
        .attr("x", 0)
        .attr("y", bottomOffsetY + 50)
        .text(bLabel)
        .datum({"collection": bottomCat})
        .on("click", recordCloseBook);

    // Top / Bottom color switch
    var toggle = svg.append("g")
        .attr("id","toggle")
        .attr("display", "none")
        .append("text");

    if (isEnglish()) {
        toggle.attr("transform", "translate(" + 0 + "," + (bottomOffsetY + 85) + ")");
    } else {
        toggle
            .style("text-anchor","end")
            .attr("transform", "translate(" + w + "," + (bottomOffsetY + 85) + ")");
    }

    var topSwitchLabel = isEnglish() ? categories[topCat].title : categories[topCat].heTitle;
    var bottomSwitchLabel = isEnglish() ? categories[bottomCat].title : categories[bottomCat].heTitle;
    toggle.append("tspan").text(isEnglish() ? "Color by: " : ' צבע לפי ');
    toggle.append("tspan")
            .classed("switch", true)
            .attr("id","switch1-1")
            .style("fill", colors("Torah"))
            .style("text-decoration", "underline")
            .datum({"collection": topCat})
            .on("click",toggleColor)
            .text(topSwitchLabel);
    toggle.append("tspan").text(" / ");
    toggle.append("tspan")
            .classed("switch", true)
            .attr("id","switch1-2")
            .style("fill", colors("Seder-Zeraim"))
            .datum({"collection": bottomCat})
            .on("click",toggleColor)
            .text(bottomSwitchLabel);

	svg.append("g").attr("class", topCat).attr("id", topCat + "-collection").classed("collection",true).attr("display","none");
    svg.append("g").attr("class", bottomCat).attr("id", bottomCat+ "-collection").classed("collection",true).attr("display","none");

    // Tooltips
    tooltip = svg.append("g")
      .attr("class", "ex-tooltip")
      .attr("id", "main-toolip")
      .style("display", "none");
    tooltip.append("rect")
      .attr("width", 170)
      .attr("height", 54)
      .attr("rx", 15)
      .attr("ry", 15)
      .attr("fill", "white")
      .style("opacity", 1)
      .style("stroke", "#17becf");
    tooltip.append("text")
      .attr("id", "text1")
      .attr("x", isEnglish() ? 15 : 160)
      .attr("dy", 17)
      .style("text-anchor", isEnglish() ? "start" : "end")
      .attr("font-size", "12px");
    tooltip.append("text")
      .attr("id", "text2")
      .attr("x", isEnglish() ? 15 : 160)
      .attr("dy", 32)
      .style("text-anchor", isEnglish() ? "start" : "end")
      .attr("font-size", "12px");
    tooltip.append("text")
      .attr("id", "note")
      .attr("x", isEnglish() ? 15 : 160)
      .attr("dy", 47)
      .style("text-anchor", isEnglish() ? "start" : "end")
      .text(isEnglish() ? "Click to explore" : "לחץ להרחבה")
      .attr("font-size", "8px");

      window.tooltip = tooltip;

    bookTooltip = svg.append("g")
      .attr("class", "ex-tooltip")
      .attr("id", "book-toolip")
      .style("display", "none");
    bookTooltip.append("rect")
      .attr("width", 70)
      .attr("height", 30)
      .attr("rx", 14)
      .attr("ry", 14)
      .attr("fill", "white")
      .style("opacity", 1)
      .style("stroke", "#17becf");
    bookTooltip.append("text")
      .attr("x", 15)
      .attr("dy", 20)
      .attr("font-size", "16px");

      d3.selectAll(".showAfterLoad").style("visibility", "visible");

      d3.selectAll("#explorerNav a").classed("active", function(d) {
        return this.getAttribute("href") == GLOBALS.urlRoot;
      });

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

    var poppedOpenIds = event.state.openIds;

    //Close currently open books not in popped state
    var toBeClosed = svg.selectAll(".open.book")
            .filter(function(d) { return poppedOpenIds.indexOf(d.id) == -1; });

    //Open popped books not in currently open books
    var toBeOpened = svg.selectAll(":not(.open).book")
            .filter(function(d) { return poppedOpenIds.indexOf(d.id) > -1 });

    //console.log("handleStateChange", poppedOpenIds, toBeClosed, toBeOpened);

    toBeClosed.each(closeBook);
    toBeOpened.each(openBook);

    changePageTitle(event.state.title);
}

//Rebuild screen geometry, without state change
function rebuildScreen() {
    var openBooks = [];
    svg.selectAll(".open.book").each(function(d) { openBooks.push(d.id); });

    d3.selectAll("svg").remove();

    booksFocused = 0;

    buildScreen(openBooks, currentScheme);
}


/*****          Book Collections            *****/

function buildBookCollection(books, klass, position, offset, cnxOffset) {
	//Lays out and labels book collection

	var q = books.length;
	var totalSpacer = bookSpacer * (q - 1);
	var effectiveWidth = w - totalSpacer;
	var currentLeft = 0; //used for LTR
	var previousLeft = w + bookSpacer; //used for RTL
	var totalBookLength = totalBookLengths(books);
	svg.select("#" + klass + "-collection").selectAll("rect.book").data(books).enter()
			.append("rect")
                .attr("id", function (d)  { d.id = toId(d.book); return d.id; })
                .each(function (d) { d["collection"] = klass; d["position"] = position; })
                .attr("class", function(d) { return klass + " book " + toId(d["section"]) + " " + d.id } )
                .attr("y", function(d) { d["y"] = offset; return d["y"]; })
                .attr("width", function(d) { d["base_width"] = (d["length"] / totalBookLength) * effectiveWidth; return d["base_width"]; })
                .attr("height", bookHeight)
                .attr("x", function(d) {
                    if(isEnglish()) {
                        d["base_x"] = currentLeft;
                        currentLeft += (bookSpacer + ((d["length"] / totalBookLength) * effectiveWidth));

                    } else {
                        d["base_x"] = previousLeft - d["base_width"] - bookSpacer;
                        previousLeft = d["base_x"];
                    }
                    return d["base_x"]; })
                .attr("cx", function(d) { d["base_cx"] = Number(this.getAttribute("x")) + Number(this.getAttribute("width")) / 2; return d["base_cx"]; })
                .attr("cy", function(d) {  return Number(this.getAttribute("y")) + cnxOffset; })
                .attr("section", function(d) { return toId(d["section"]) })
                .attr("color", function(d) {
                    var cat = position == "top" ? topCat : bottomCat;
                    if (categories[cat].colorByBook) {
                        return colors(d.id);
                    } else {
                        return colors(selectBook(d.id).attr("section"));
                    } })
                .attr("fill", function(d) { return selectBook(d.id).attr("color"); })
                .each(addAxis)
                .on("mouseover", mouseover_book)
                .on("mouseout", mouseout_book)
                .on("click", recordOpenBook);

    svg.selectAll("#" + klass + "-collection .book")
            .on("mouseover.tooltip", function() {
                bookTooltip.style("display", null); })
            .on("mouseout.tooltip", function() { bookTooltip.style("display", "none"); })
            .on("mousemove.tooltip", function(d) {
              var xPosition = d3.mouse(this)[0];
              var yPosition = d3.mouse(this)[1] - 35;
              bookTooltip.select("text").text(isEnglish() ? d.book : d.heBook);
              var bbox = bookTooltip.select("text").node().getBBox();
              bookTooltip.select("rect").attr("width", bbox.width + 30);
              bookTooltip.attr("transform", "translate(" + xPosition + "," + yPosition + ")");
            });

    buildBookLabels(books, klass, position);
}

function buildBookLabels(bks, klass, position) {

    var cat = position == "top" ? topCat : bottomCat;

    if (categories[cat].labelBySection) {
        buildBookLabelsBySection(bks, klass, position);
        return;
    }

    var anchor = "start";
    var offset = 0;
    var dx = "-.8em";
    var dy = "-.8em";

    if (position == "bottom") {
        anchor = "end";
        offset = bookHeight * 2;
        dx = "0";
        dy = "0";
    }

    if (klass == "Tanakh") {
        bks = bks.filter(isNotTwelve);
    }

    svg.select("#" + klass + "-collection")
        .selectAll("text.title").data(bks).enter()
            .append("text")
                .attr("class", function(d) { d.id = toId(d.book); return "title " + toId(d["section"]) + " " + d["id"] } )
                .text(bookLabel)
                .style("text-anchor", anchor)
                .attr("fill", function(d) { return selectBook(d.id).attr("color"); })
                .attr("x", function(d) {
                    return Number(selectBook(d.id).attr("cx"))
                })
                .attr("y", function(d) {
                    return Number(selectBook(d.id).attr("y")) + offset
                })
                .attr("dx", dx)
                .attr("dy", dy)
                .attr("transform", function(d) {
                    return "rotate(-35, " + this.getAttribute("x") + "," + this.getAttribute("y") + ")";
                })
                .on("mouseover", mouseover_book)
                .on("mouseout", mouseout_book)
                .on("click", recordOpenBook);

    if (klass == "Tanakh") {
        var twelveText = isEnglish() ? "The Twelve Prophets" : "תרי עשר";
        var twelveNode = svg.select("#Tanakh-collection").append("text")
            .attr("class", "title twelve Prophets")
            .attr("fill", function(d) { return colors("Prophets"); })
            .text(twelveText)
        if(isEnglish()) {
            twelveNode.attr("x", Number(svg.select("#Hosea").attr("cx"))).attr("y", Number(svg.select("#Hosea").attr("y")) - 12)
        } else {
            twelveNode.attr("x", Number(svg.select("#Habakkuk").attr("cx"))).attr("y", Number(svg.select("#Habakkuk").attr("y")) - 12)
        }
    }


    function bookLabel (d) {
        var label = isEnglish() ? d["book"] : d["heBook"];
        label = label.replace("Mishneh Torah, ", "")
                    .replace("Shulchan Arukh, ", "")
                    .replace("Jerusalem Talmud ", "")
                    .replace("משנה תורה, ", "")
                    .replace("שולחן ערוך, ", "")
                    .replace("תלמוד ירושלמי ", "");
        return label;
    }

}

function buildBookLabelsBySection(bks, klass, position) {

    var anchor = "start";
    var offset = 0;
    var dx = "-.8em";
    var dy = "-.8em";

    if (position == "bottom") {
        anchor = "end";
        offset = bookHeight * 2;
        dx = "0";
        dy = "0";
    }

    var prevSection = null;
    var sections = [];
    for (var i = 0; i < bks.length; i++) {
        if (prevSection != bks[i].section) {
            sections.push({section: bks[i].section, firstId: toId(bks[i].book)});
        }
        sections[sections.length-1].lastId = toId(bks[i].book);
        prevSection = bks[i].section;
    }

    svg.select("#" + klass + "-collection")
        .selectAll("text.title").data(sections).enter()
            .append("text")
                .attr("class", function(d) { return "title " + toId(d["section"])} )
                .text(function(d) {
                        return isEnglish() ? d["section"] : Sefaria.terms[d["section"]].he;
                    })
                .style("text-anchor", anchor)
                .attr("fill", function(d) { return colors(toId(d["section"])); })
                .attr("x", function(d) {
                    var firstX = Number(selectBook(d.firstId).attr("cx"));
                    var lastX = Number(selectBook(d.lastId).attr("cx"));
                    return isEnglish() ? firstX + (lastX-firstX)/2 :
                        lastX + (firstX-lastX)/2;
                })
                .attr("y", function(d) {
                    return Number(selectBook(d.firstId).attr("y")) + offset
                })
                .attr("dx", dx)
                .attr("dy", dy)
                .attr("transform", function(d) {
                    return "rotate(-35, " + this.getAttribute("x") + "," + this.getAttribute("y") + ")";
                });
}



function addAxis(d) {
    var orient = d.position;
    var ticks, y;

    var y = orient == "top" ? topOffsetY + 5 : bottomOffsetY + 5;

    if(categories[d.collection].talmudAddressed) {
        ticks = SefariaD3.talmudRefTicks(d);
        d.scale = SefariaD3.textScale(isEnglish()?"ltr":"ltr", d.base_x, d.base_x + d.base_width, d, "talmud");
    } else {
        ticks = SefariaD3.integerRefTicks(d);
        d.scale = SefariaD3.textScale(isEnglish()?"ltr":"ltr", d.base_x, d.base_x + d.base_width, d, "integer");
    }

    d.s = SefariaD3.scaleNormalizationFunction(d.scale);

    d.axis = d3.svg.axis()
        .orient(orient)
        .scale(d.scale)
        .tickValues(ticks)
        .tickFormat(ref => ref.split(/(\d.*)/)[1]); // Only show numerical portion of ref in ticks

    d.axis_group = svg.select("#" + d.collection + "-collection").append("g")
		.attr("class", "axis " + d.id )
		.attr("transform","translate(0," + y + ")")
        .style("display", "none")
		.call(d.axis);
}

function updateAxis(d) {
    var x = ("new_x" in d) ? d.new_x : d.base_x;
    var width = ("new_width" in d) ? d.new_width : d.base_width;

    d.scale.rangePoints(isEnglish() ? [x, x + width] : [x + width, x]);
    d.axis_group.call(d.axis);
}


/*****       Axis Brushing Selection         *****/

function activateBrush(d) {
    svg.select("#" + d.collection + "-collection")
      .append("g")
      .attr("class", "brush")
      .each(function() {
            d3.select(this)
           .call(
                brushes[d.collection] = d3.svg.brush()
                    .x(d.scale)
                    .on("brushstart", brushstart)
                    .on("brush", brushmove)
                    .on("brushend", brushend)
                );
            }
      )
    .selectAll("rect")
      .attr("y", d.y)
      .attr("height", bookHeight);
    brushes[d.collection]["book"] = d.id
}

function removeBrush(d) {
    brushes[d.collection].clear();
    brushmove();
    svg.select("#" + d.collection + "-collection .brush").remove();
    brushes[d.collection] = null;
}

function brushstart() {
  d3.event.target["b_active"] = true
  svg.classed("selecting", true);
  Sefaria.track.exploreBrush(d3.event.target.book)
}

function brushmove() {
  //We are assuming that source is bottom and target is top
  svg.selectAll(".preciseLink")
    .classed("selected", function(d) {

              if ((!brushes.hasOwnProperty(topCat) || brushes[topCat] == null )) {
                  return (brushes[bottomCat].extent()[0] <= d.sourcex && d.sourcex <= brushes[bottomCat].extent()[1])
              } else if (!brushes.hasOwnProperty(bottomCat) || brushes[bottomCat] == null ) {
                return (brushes[topCat].extent()[0] <= d.targetx && d.targetx <= brushes[topCat].extent()[1])
              } else { // 2 brushes
                return  ((brushes[bottomCat].empty() && !brushes[bottomCat]["b_active"]) || (brushes[bottomCat].extent()[0] <= d.sourcex && d.sourcex <= brushes[bottomCat].extent()[1]))
                  && ((brushes[topCat].empty() && !brushes[topCat]["b_active"]) || (brushes[topCat].extent()[0] <= d.targetx && d.targetx <= brushes[topCat].extent()[1]))
              }
          });
}

function brushend() {
  d3.event.target["b_active"] = false;
  svg.classed("selecting",
      (
        (brushes.hasOwnProperty(topCat) && brushes[topCat] != null && !brushes[topCat].empty()) ||
        (brushes.hasOwnProperty(bottomCat) && brushes[bottomCat] != null && !brushes[bottomCat].empty())
      )
  );
}


/*****          Book Event Handlers              ******/

function showBookCollections() {
    svg.selectAll(".collection")
            .attr("display","inline");
}

function mouseover_book(d) {
    svg.select(".book." + d.id)
            .classed("active",true);
    svg.select(".title." + d.id)
            .classed("active",true);
    svg.selectAll(".link")
            .filter(function (p) { return d.book ==  p["book1"] || d.book ==  p["book2"] })
            .classed("active", true)
            .each(moveToFront);
    svg.selectAll(".preciseLink")
            .filter(function (p) { return d.book ==  p["r1"]["title"] || d.book ==  p["r2"]["title"] })
            .classed("active", true)
            .each(moveToFront);
}

function mouseout_book(d) {
    svg.select(".book." + d.id)
            .classed("active",false);
    svg.select(".title." + d.id)
            .classed("active",false);
    svg.selectAll(".link")
            .classed("active", false);
    svg.selectAll(".preciseLink")
            .classed("active", false);
}


/*****         Book Level Links             *****/

function buildBookLinks() {

    function renderBookLinks(error, json) {

       if (!booksJson) {
           booksJson = json;
       }

       var link = links.selectAll(".link")
          .data(json, function(d) { return d["book1"] + "-" + d["book2"];})
        .enter().append("path")
           //.each(function(d) { if (!(d.book1 && d.book2 && svg.select("#" + d["book1"]).datum().base_cx && svg.select("#" + d["book2"]).datum().base_cx && svg.select("#" + d["book1"]).attr("cy") && svg.select("#" + d["book2"]).attr("cy") )) {console.log(d);}})
          .attr("class", "link")
          .attr("stroke-width", function(d) { return linkCountWidth(d["count"]) + "px"})
          .attr("stroke", function(d) { return selectBook(d.book1).attr("color"); })
          .attr("d", d3.svg.diagonal()
                .source(function(d) { return {"x":Number(selectBook(d.book1).datum().base_cx), "y": Number(selectBook(d.book1).attr("cy"))}; })
                .target(function(d) { return {"x":Number(selectBook(d.book2).datum().base_cx), "y": Number(selectBook(d.book2).attr("cy"))}; })
            )
          .on("mouseover", mouseover_link)
          .on("mouseout", mouseout_link)
          .on("click", recordOpenBookLink)
          .on("mouseover.tooltip", function() { tooltip.style("display", null); })
          .on("mouseout.tooltip", function() { tooltip.style("display", "none"); })
          .on("mousemove.tooltip", function(d) {
              var xPosition = d3.mouse(this)[0];
              var yPosition = d3.mouse(this)[1] - 65;
              if(isEnglish()) {
                tooltip.select("#text1").text(fromId(d["book1"]) + " - " + fromId(d["book2"]));
                tooltip.select("#text2").text(d["count"] + " connections");
                xPosition = d3.mouse(this)[0];
                yPosition = d3.mouse(this)[1] - 65;
              } else {
                tooltip.select("#text1").text(selectBook(d.book1).datum().heBook + " - " + selectBook(d.book2).datum().heBook);
                tooltip.select("#text2").text(d["count"] + " :קשרים");
                xPosition = d3.mouse(this)[0];
                yPosition = d3.mouse(this)[1] - 65;
              }
              var bbox1 = tooltip.select("#text1").node().getBBox();
              var bbox2 = tooltip.select("#text2").node().getBBox();
              var width = bbox1.width > bbox2.width ? bbox1.width : bbox2.width;
              if (isHebrew()) {
                tooltip.selectAll("text").attr("x", width + 15);
                xPosition -= width;
              }
              tooltip.select("rect").attr("width", width + 30);
              tooltip.attr("transform", "translate(" + xPosition + "," + yPosition + ")");
          });
    }

    if (booksJson) {
        renderBookLinks(null, booksJson);
    } else {
        var linkCountUrl = '/api/counts/links/' + categories[topCat].linkCountParam + "/" + categories[bottomCat].linkCountParam;
        d3.json(linkCountUrl, renderBookLinks);
    }
}


/*****    Link Events      *****/

function mouseover_link(d) {
    d3.select(this)
            .classed("active", true).each(moveToFront);
}

function mouseout_link(d) {
    d3.select(this)
            .classed("active", false);
}


function showBookLinks() {
    svg.select("#links")
        .transition().duration(1000)
        .attr("display", "inline");
}

function hideBookLinks() {
    svg.select("#links")
        .transition().duration(1000)
        .attr("display", "none");
}


/*****          Book Exploration     *****/

//These two functions are used for UI navigation - they record browser history
function recordOpenBook(dFocused) {
    mouseout_book(dFocused);
    openBook(dFocused);
    pushHistory();
}
function recordCloseBook(dCloser) {
    closeBook(dCloser);
    pushHistory();
}

function recordOpenBookLink(d) {
    var b1 = selectBook(d.book1).datum();
    var b2 = selectBook(d.book2).datum();
    openBook(b1);
    openBook(b2);
    pushHistory();
}

function openBook(dFocused) {
    //This may be invoked from a title or link, so get the book element explicity.  Don't rely on 'this'.
    var book = svg.select(".book." + dFocused.id);
    var dBook = book.datum();

    var originalCurtainWidth = w - (dBook.base_width + (bookSpacer * 2));
    var focusedBookWidth = w - focusedCurtainWidth - bookSpacer * 2;
    var shrinkRatio = focusedCurtainWidth / originalCurtainWidth;
    var shrunkBookSpacer = bookSpacer * shrinkRatio;
	var previousLeft = w + shrunkBookSpacer; // For RTL
	var currentLeft = 0;  // For LTR

    var labelId = dBook.collection == topCat ? "top-label" : "bottom-label";
    booksFocused++;

    book
        .classed("open", true)
        .on("click", null)
        .on("mouseover", null);

    //Reregister events
    svg.selectAll("#" + dBook.collection + "-collection .book")
        .filter(function(d) { return d !== dBook; })
            .on("mouseover", null)
            .on("mouseout", null)
            .on("click", recordCloseBook)
            .on("mouseover.tooltip", null)
            .on("mouseout.tooltip",null);

    // Resize book rectangles
    svg.selectAll("#" + dBook.collection + "-collection .book")
        .transition()
            .attr("width", function(d) {
                    if (d === dBook) {
                        d["new_width"] = focusedBookWidth;
                    } else {
                        d["new_width"] = d["base_width"] * shrinkRatio;
                    }
                    return d["new_width"];
                })
            .attr("x", function(d) {
                    if(isEnglish()) {
                        if (d === dBook) {
                            currentLeft += (bookSpacer - shrunkBookSpacer);
                            d["new_x"] = currentLeft;
                            currentLeft += bookSpacer + focusedBookWidth;
                        } else {
                            d["new_x"] = currentLeft;
                            currentLeft += shrunkBookSpacer + d["new_width"];
                        }
                    } else {
                         if (d === dBook) {
                            d["new_x"] = previousLeft + shrunkBookSpacer - bookSpacer - d["new_width"];
                            previousLeft = d["new_x"] - bookSpacer;
                        } else {
                            d["new_x"] = previousLeft - shrunkBookSpacer - d["new_width"];
                            previousLeft = d["new_x"];
                        }
                    }
                    return d["new_x"];
                })
            .attr("cx", function(d) {
                    d["new_cx"] = d["new_x"] + d["new_width"] / 2;
                    return d["new_cx"];
                })
            .each(updateAxis)
            .style("fill-opacity", function(d) {
                     if (d !== dBook) {
                        return ".5";
                     }
                return null;
            });

    // Get the precise links
    processPreciseLinks(dBook);

    //display axis
    svg.select(".axis." + dBook.id)
           .transition().delay(500).style("display","inline");

    activateBrush(dBook);

    hideBookLinks();

    //hide other books titles
    svg.selectAll("#" + dBook.collection + "-collection .title")
        .transition().duration(1000)
            .style("display","none");

    //Add title for focused book
    svg.select("#" + labelId).transition().duration(1000)
            .style("display","block")
        .select(".label")
            .attr("class","label " + toId(dBook.section))
            .attr("fill", function(d) { return selectBook(dBook.id).attr("color"); })
            .text(isEnglish() ? dBook.book : dBook.heBook);
    svg.selectAll("#toggle").attr("display", "none");
}

function closeBook(dCloser) {

    booksFocused--;

    var collectionId = dCloser.collection;
    var closing = svg.select("#" + collectionId + "-collection .open").classed("open", false).on("mouseover", mouseover_book);

    var labelId = collectionId == topCat ? "top-label" : "bottom-label";

    //Resize books
    svg.selectAll("#" + collectionId + "-collection .book")
        .transition()
            .attr("width", function(d) { delete d["new_width"]; return d["base_width"]; })
            .attr("x", function(d) { delete d["new_x"]; return d["base_x"]; })
            .attr("cx", function(d) { delete d["new_cx"]; return d["base_cx"]; })
            .style("fill-opacity", null)
            .each(updateAxis);

    //Hide axis
    svg.select(".axis." + closing.datum().id).transition()
            .style("display","none");

    removeBrush(closing.datum());

    //If all books closed, show book links
    if (booksFocused == 0) {
        showBookLinks();
    }

    //Process precise links
    if(booksFocused == 0) {
        svg.selectAll(".preciseLinkA").attr("display", "none");
        svg.selectAll("#toggle").attr("display", "inline");
    } else if (booksFocused == 1) {
        var dRemains = svg.select(".open").datum();
        processPreciseLinks(dRemains);
        brushmove()
    }

    //Reset events
    svg.selectAll("#" + collectionId + "-collection .book")
            .on("mouseover", mouseover_book)
            .on("mouseout", mouseout_book)
            .on("click", recordOpenBook);

    svg.selectAll("#" + collectionId + "-collection .book")
        .on("mouseover.tooltip", function() { bookTooltip.style("display", null); })
        .on("mouseout.tooltip", function() { bookTooltip.style("display", "none"); });

    //Remove focused book title and show small titles
    svg.select("#" + labelId).transition().duration(1000)
            .style("display","none")
        .select(".label")
            .text("")
            .attr("class","label");

    svg.selectAll("#" + collectionId + "-collection .title")
        .transition().duration(1000)
            .style("display","block");
}

function processPreciseLinks(dBook) {

    function preciseLinkCallback (error, json) {
        if (!(dBook.book in pLinkCache)) {
            json.map(d => {
                // Annotate data with book name,
                // which may be different than title for complex texts
                d["r1"]["book"] = Sefaria.parseRef(d["r1"]["title"]).index;
                d["r2"]["book"] = Sefaria.parseRef(d["r2"]["title"]).index;
                d["topRef"] = isBookOnTop(d["r1"]["book"]) ? d["r1"] : d["r2"];
                d["bottomRef"] = isBookOnTop(d["r1"]["book"]) ? d["r2"] : d["r1"];
            });
            pLinkCache[dBook.book] = json;
        }

        var otherBook = null;
        svg.selectAll(".open.book").each(function(d) { if (d !== dBook) { otherBook = d; }});

        //console.log("dBook.book", dBook.book);

        //Todo: avoid the server call, and just get the intersection from the existing cached json of the other book
        if(otherBook) {
            function isInIntersection(el) {
                //console.log("otherBook", otherBook.book);
                return (el["r1"]["book"] == otherBook.book || el["r2"]["book"] == otherBook.book);
            }
            json = json.filter(isInIntersection);
        }

        var preciseLinks = plinks.selectAll("a.preciseLinkA")
            .data(json, function(d) {
                return d["r1"]["title"] + "-" + d["r1"]["loc"] + "-" + d["r2"]["title"] + "-" + d["r2"]["loc"];
            });

        //enter
        preciseLinks.enter()
            .append("a")
                .attr("xlink:href", function(d) { return "/" + toLink(d["bottomRef"]["title"]) + "." + d["bottomRef"]["loc"]})
                .attr("target","_blank")
                .classed("preciseLinkA", true)
            .append("path")
                .attr("class", function(d) { return "preciseLink " + toId(d["r1"]["title"]) + " " + toId(d["r2"]["title"]); })
                .on("mouseover", mouseover_plink)
                .on("mouseout", mouseout_plink)
                .on("mouseover.tooltip", function() { tooltip.style("display", null); })
                .on("mouseout.tooltip", function() { tooltip.style("display", "none"); })
                .on("mousemove.tooltip", function(d) {
                    var xPosition;
                    var yPosition;
                    if(isEnglish()) {
                        xPosition = d3.mouse(this)[0];
                        yPosition = d3.mouse(this)[1] - 65;
                        tooltip.select("#text1").text(d["r1"]["title"] + " " + d["r1"]["loc"]);
                        tooltip.select("#text2").text(d["r2"]["title"] + " " + d["r2"]["loc"]);
                    } else {
                        xPosition = d3.mouse(this)[0] - 130;
                        yPosition = d3.mouse(this)[1] - 65;
                        tooltip.select("#text1").text(d["r1"]["loc"] + " " + selectBook(d["r1"]["book"]).datum().heBook);
                        tooltip.select("#text2").text(selectBook(d["r2"]["book"]).datum().heBook + " " + d["r2"]["loc"]);
                    }
                    var bbox1 = tooltip.select("#text1").node().getBBox();
                    var bbox2 = tooltip.select("#text2").node().getBBox();
                    var width = bbox1.width > bbox2.width ? bbox1.width : bbox2.width;
                    tooltip.select("rect").attr("width", width + 30);
                    if (isHebrew()) {
                        tooltip.selectAll("text").attr("x", width + 15);
                        xPosition -= width;
                    }
                    tooltip.attr("transform", "translate(" + xPosition + "," + yPosition + ")");
                });

        //update
        preciseLinks.attr("display", "inline")
            .select("path.preciseLink")
                .attr("stroke", function (d) {
                      //console.log(d);
                      if(otherBook && this.getAttribute("stroke")) { // link was already shown, leave it.  Second condition is needed for when two books open before first callback is called.
                          return this.getAttribute("stroke");
                      } else { // Color by opposing scheme
                          var opposingBookRef = d["r1"]["book"] == dBook.book ? "r2" : "r1";
                          return selectBook(d[opposingBookRef]["book"]).attr("color");
                      }
                })
                .attr("d", d3.svg.diagonal()
                    .source(function (d) {
                      d.sourcex = Number(selectBook(d["bottomRef"]["book"]).datum().s(d["bottomRef"]["title"] + " " + d["bottomRef"]["loc"]));
                      d.sourcey = Number(selectBook(d["bottomRef"]["book"]).attr("cy"));
                      return {
                          "x": d.sourcex,
                          "y": d.sourcey
                      };
                    })
                    .target(function (d) {
                      d.targetx = Number(selectBook(d["topRef"]["book"]).datum().s(d["topRef"]["title"] + " " + d["topRef"]["loc"]));
                      d.targety = Number(selectBook(d["topRef"]["book"]).attr("cy"));
                      return {
                          "x": d.targetx,
                          "y": d.targety
                      };
                    })
                );

        //exit
        preciseLinks.exit()
            .attr("display", "none");
    }

    var linkCat = dBook.collection == topCat ?
        categories[bottomCat].linkCountParam :
        categories[topCat].linkCountParam;

    if (dBook.book in pLinkCache) {
        preciseLinkCallback(null, pLinkCache[dBook.book]);
    } else {
        d3.json('/api/links/bare/' + dBook.book + '/' + linkCat, preciseLinkCallback);
    }
}

function mouseover_plink(d) {
    d3.select(this)
            .classed("active", true).each(moveToFront);
}

function mouseout_plink(d) {
    d3.select(this)
            .classed("active", false);
}


/*****          Utils                *****/

function selectBook(book) {
    // selects a book by ID, accounting for encoding CSS friendly characters
    return svg.select("#" + toId(book));
}

function isBookOnTop(book) {
    // returns true if `book` belongs to the collection of books on top
    return topBooks.some(b => b.book == book);
}

function linkCountWidth(count) {

    // originally: count / 10;

    const MAX_WIDTH = 70;
    const MIN_WIDTH = 1;
    const coeffecient = 1 - (1 / (1+ .00003 * (count * count)));
    const width = MAX_WIDTH * coeffecient;
    return width > MIN_WIDTH ? width : MIN_WIDTH;
}

function moveToFront() {
	this.parentNode.appendChild(this);
}

//These next five, and how they're used with the various data ins and outs, are a bit of a mess.

function replaceAll(str, ol, nw) {
    return str.split(ol).join(nw)
}
function toId(title) {
    if (!title) { debugger; }
    title = replaceAll(title, "'", "-aa-");
    title = replaceAll(title, ",", "-c-");
    return replaceAll(title, " ","-");
}
function fromId(title) {
    title = replaceAll(title, "-aa-", "'");
    title = replaceAll(title, "-c-", ",");
    return replaceAll(title, "-", " ");
}
function fromIdtoUrl(title) {
    title = fromId(title);
    return replaceAll(title, " ", "-")
}
function toLink(title) {
    title = fromId(title);
    return title.split("-").join("_").split(" ").join("_");
}

function totalBookLengths(books) {
    return books.reduce(function(prev, cur) { return prev + cur["length"]; }, 0);
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
    args.books.forEach(function (e,a,i) { Sefaria.track.exploreBook(e) });

}

function pushHistory() {
    var args = _getHistory();

    //console.log("pushHistory",args.object, args.title, args.url);
    Sefaria.track.exploreUrl(args.url);
    changePageTitle(args.object.title);
    history.pushState(args.object, args.argtitle, args.url);
    args.books.forEach(function (e,a,i) { Sefaria.track.exploreBook(e) });
}

function _getHistory() {
    var url = GLOBALS.urlRoot;
    var title = isEnglish() ? "Explore Connections Between " : 'מצא חיבורים בין ';
    var openIds = [];
    var topOpen = null;
    var bottomOpen = null;
    var topCatTitle = isEnglish() ? categories[topCat].title : categories[topCat].heTitle;
    var bottomCatTitle = isEnglish() ? categories[bottomCat].title : categories[bottomCat].heTitle;

    svg.select("#" + topCat + "-collection .open.book").each(function(d) {
        topOpen = isEnglish() ? d.book : d.heBook;;
        openIds.push(d.id);
        url += "/" + fromIdtoUrl(d.id);
    });

    svg.select("#" + bottomCat + "-collection .open.book").each(function(d) {
        bottomOpen = isEnglish() ? d.book : d.heBook;
        openIds.push(d.id);
        url += "/" + fromIdtoUrl(d.id);
    });

    var conjunction = isHebrew() ? " ו" : " & ";
    if (topOpen && bottomOpen) {
        title += topOpen + conjunction  + bottomOpen;
    } else if (topOpen && !bottomOpen) {
        title += topOpen + conjunction + bottomCatTitle;
    } else if (!topOpen && bottomOpen) {
        title += bottomOpen + conjunction + topCatTitle;
    } else if (!topOpen && !bottomOpen) {
        title += topCatTitle + conjunction + bottomCatTitle;
    }

    return {
        "object" : {"openIds": openIds, "title": title, "lang": lang},
        "argtitle" : title,
        "url" : url,
        "books" : openIds
    };
}
