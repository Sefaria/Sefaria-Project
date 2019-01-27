var d3 = require('d3');
var Sefaria = require('sefaria');
var SefariaD3 = require("./sefaria-d3/sefaria-d3");
var $ = require("./sefaria/sefariaJquery");

/*****          Layout              *****/
var margin = [30, 40, 20, 40];
var w; // value determined in buildScreen()
var h = 730 - margin[0] - margin[2];

var tanakhOffsetY = 80;
var bavliOffsetY = 580;

var bookSpacer = 3;
var bookHeight = 10;

var focusedCurtainWidth = 100;

var svg;
var links; //the book links svg group
var plinks; //the precise links svg group
var tooltip;
var bookTooltip;
var brushes = {};


/*****    Book Collection Data      *****/

var booksJson;  // Initial setup book link info
var booksFocused = 0; //State of number of books opened

var twelve = ["Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi"];
function isTwelve(el) { return twelve.indexOf(el["title"]) > -1; }
function isNotTwelve(el) { return !isTwelve(el); }

var pLinkCache = {}; //Cache for precise link queries



/*****          Colors              *****/

var colors = d3.scale.category10()
	.domain(["Torah","Prophets","Writings","Seder-Zeraim","Seder-Moed","Seder-Nashim","Seder-Nezikin","Seder-Kodashim","Seder-Tahorot"]);

var currentScheme = "Tanakh";
var toggleColor = (function(){
    return function(d){
        var switchedTo = d.collection;
        if (switchedTo == currentScheme)
            return;
        currentScheme = currentScheme == "Tanakh" ? "Bavli" : "Tanakh";
        svg.selectAll(".link") //.transition().duration(250)
        	.attr("stroke", function(d) { return currentScheme == "Bavli" ? colors(svg.select("#" + d["book2"]).attr("section")) : colors(svg.select("#" + d["book1"]).attr("section"))  });
		svg.select("#switch1-1").transition().duration(1000).style("text-decoration", currentScheme == "Tanakh" ? "underline" : null);
		svg.select("#switch1-2").transition().duration(1000).style("text-decoration", currentScheme == "Tanakh" ? null : "underline");
    }
})();

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

var tanakh = [];
var bavli = [];

var b = Sefaria.shape("Talmud/Bavli", d => bavli = d);
var t = Sefaria.shape("Tanakh", d => tanakh = d);

$.when(b, t).then(function() {
    buildScreen(GLOBALS.books, "Tanakh");
    replaceHistory();
});


/*****         Methods used in screen construction      *****/

function buildScreen(openBooks, colorScheme) {
    buildFrame();
    buildBookCollection(tanakh, "tanakh", "top", tanakhOffsetY, 10);
    buildBookCollection(bavli, "bavli", "bottom", bavliOffsetY, 0);
    buildBookLinks();

    if(colorScheme == "Bavli") {
        currentScheme = "Tanakh";
        toggleColor({"collection": "Bavli"});
    }

    if (openBooks.length == 0) {
        svg.selectAll("#toggle").attr("display", "inline");
        showBookCollections();
        showBookLinks();
    }
    else {
        for (var i = 0; i < openBooks.length; i++) {
            openBook(svg.select("#" + openBooks[i]).datum());
        }
        showBookCollections();
    }
}


//Build objects that are present for any starting state - 0, 1, or 2 books
function buildFrame() {
    w = window.innerWidth ?  window.innerWidth - margin[1] - margin[3] : 1000 - margin[1] - margin[3];
    svg = d3.select("#content").append("svg")
        .attr("width", w + margin[1] + margin[3] - 16)
        .attr("height", h + margin[0] + margin[2])
      .append("g")
        .attr("transform", "translate(" + margin[3] + "," + margin[0] + ")");

    svg.append("svg:desc").text("This SVG displays visually the connections between Talmud and Tanakh that can be found throughout our site");
    links = svg.append("g").attr("id","links").attr("display","none");
    plinks = svg.append("g").attr("id","plinks");

        // Titles and labels
    var TopTitle = isEnglish() ? "Connections between Talmud and Tanakh" : 'חיבורים בין התלמוד והתנ"ך';
    svg.append("a")
        .attr("xlink:href", "/explore")
      .append("text")
        .attr("id","page-title")
        .attr("x", w/2)
        .attr("y", 16)
        .style("text-anchor", "middle")
        .text(TopTitle);

    var tLabel = isEnglish() ? '(View all Tanakh)' : '(חזרה למבט על כל התנ״ך)';
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
        .datum({"collection": "tanakh"})
        .on("click", recordCloseBook);

    var bLabel = isEnglish() ? '(View all Talmud)' : '(חזרה למבט על כל התלמוד)';
    var bottomLabel = svg.append("g")
        .attr("id", "bottom-label")
        .style("display", "none");
    bottomLabel.append("text")
        .attr("class", "label")
        .attr("x", w/2)
        .style("text-anchor", "middle")
        .attr("y", bavliOffsetY + 50);
    bottomLabel.append("text")
        .attr("class","back-up")
        .attr("x", 0)
        .attr("y", bavliOffsetY + 50)
        .text(bLabel)
        .datum({"collection": "bavli"})
        .on("click", recordCloseBook);

    // Tanakh / Talmud color switch
    var toggle = svg.append("g")
        .attr("id","toggle")
        .attr("display", "none")
        .append("text");

    if (isEnglish()) {
        toggle.attr("transform", "translate(" + 0 + "," + (bavliOffsetY + 85) + ")");
    } else {
        toggle
            .style("text-anchor","end")
            .attr("transform", "translate(" + w + "," + (bavliOffsetY + 85) + ")");
    }

    var tanakhSwitchLabel = isEnglish() ? "Tanakh" : 'תנ"ך';
    var talmudSwitchLabel = isEnglish() ? "Talmud" : 'תלמוד';
    toggle.append("tspan").text(isEnglish() ? "Color by: " : ' צבע לפי ');
    toggle.append("tspan")
            .classed("switch", true)
            .attr("id","switch1-1")
            .style("fill", colors("Torah"))
            .style("text-decoration", "underline")
            .datum({"collection": "Tanakh"})
            .on("click",toggleColor)
            .text(tanakhSwitchLabel);
    toggle.append("tspan").text(" / ");
    toggle.append("tspan")
            .classed("switch", true)
            .attr("id","switch1-2")
            .style("fill", colors("Seder-Zeraim"))
            .datum({"collection": "Bavli"})
            .on("click",toggleColor)
            .text(talmudSwitchLabel);

	svg.append("g").attr("class", "tanakh").attr("id", "tanakh").classed("collection",true).attr("display","none");
    svg.append("g").attr("class", "bavli").attr("id", "bavli").classed("collection",true).attr("display","none");

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

    bookTooltip = svg.append("g")
      .attr("class", "ex-tooltip")
      .attr("id", "book-toolip")
      .style("display", "none");
    bookTooltip.append("rect")
      .attr("width", 70)
      .attr("height", 20)
      .attr("rx", 15)
      .attr("ry", 15)
      .attr("fill", "white")
      .style("opacity", 1)
      .style("stroke", "#17becf");
    bookTooltip.append("text")
      .attr("x", 35)
      .attr("dy", 14)
      .style("text-anchor", "middle")
      .attr("font-size", "12px");

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

	svg.select("#" + klass).selectAll("rect.book").data(books).enter()
			.append("rect")
                .attr("id", function (d)  { d.id = toId(d.title); return d.id; })
                .each(function (d) { d["collection"]  = klass; })
                .attr("class", function(d) { return klass + " book " + replaceAll(d["section"]," ","-") + " " + d.id } )
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
                .attr("section", function(d) { return replaceAll(d["section"]," ","-") })
                .each(addAxis)
                .on("mouseover", mouseover_book)
                .on("mouseout", mouseout_book)
                .on("click", recordOpenBook);

    svg.selectAll("#" + klass + " .book")
            .filter(isTwelve)
            .on("mouseover.tooltip", function() { bookTooltip.style("display", null); })
            .on("mouseout.tooltip", function() { bookTooltip.style("display", "none"); })
            .on("mousemove.tooltip", function(d) {
              var xPosition = d3.mouse(this)[0];
              var yPosition = d3.mouse(this)[1] - 25;
              bookTooltip.attr("transform", "translate(" + xPosition + "," + yPosition + ")");
              bookTooltip.select("text").text(isEnglish() ? d.title : d.heTitle);
            });

    buildBookLabels(books, klass, position);
}

function buildBookLabels(bks, klass, position) {

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

    if (klass == "tanakh") {
        bks = bks.filter(isNotTwelve);
    }

    svg.select("#" + klass)
        .selectAll("text.title").data(bks).enter()
            .append("text")
                .attr("class", function(d) { d.id = toId(d.title); return "title " + replaceAll(d["section"]," ","-") + " " + d["id"] } )
                .text(function(d) {
                        return isEnglish() ? d["title"] : d["heTitle"];
                    })
                .style("text-anchor", anchor)
                .attr("x", function(d) {
                    return Number(svg.select("#" + d["id"]).attr("cx"))
                })
                .attr("y", function(d) {
                    return Number(svg.select("#" + d["id"]).attr("y")) + offset
                })
                .attr("dx", dx)
                .attr("dy", dy)
                .attr("transform", function(d) {
                    return "rotate(-35, " + this.getAttribute("x") + "," + this.getAttribute("y") + ")";
                })
                .on("mouseover", mouseover_book)
                .on("mouseout", mouseout_book)
                .on("click", recordOpenBook);

    if (klass == "tanakh") {
        var twelveText = isEnglish() ? "The Twelve Prophets" : "תרי עשר";
        var twelveNode = svg.select("#" + klass).append("text").attr("class", "title twelve Prophets").text(twelveText)
        if(isEnglish()) {
            twelveNode.attr("x", Number(svg.select("#Hosea").attr("cx"))).attr("y", Number(svg.select("#Hosea").attr("y")) - 12)
        } else {
            twelveNode.attr("x", Number(svg.select("#Habakkuk").attr("cx"))).attr("y", Number(svg.select("#Habakkuk").attr("y")) - 12)
        }
    }
}

function addAxis(d) {
    var type = d.collection;
    var orient, ticks, y;

    if(type == "tanakh") {
        orient = "top";
        y = tanakhOffsetY + 5;
        ticks = SefariaD3.integerRefTicks(d.chapters);
        d.scale = SefariaD3.integerScale(isEnglish()?"ltr":"rtl", d.base_x, d.base_x + d.base_width, d.chapters);
    } else {
        orient = "bottom";
        y = bavliOffsetY + 5;
        ticks = SefariaD3.talmudRefTicks(d.chapters);
        d.scale = SefariaD3.talmudScale(isEnglish()?"ltr":"rtl", d.base_x, d.base_x + d.base_width, d.chapters);
    }

    d.s = SefariaD3.scaleNormalizationFunction(d.scale);

    d.axis = d3.svg.axis()
        .orient(orient)
        .scale(d.scale)
        .tickValues(ticks);

    d.axis_group = svg.select("#" + type).append("g")
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
    svg.select("#" + d.collection)
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
    svg.select("#" + d.collection + " .brush").remove();
    brushes[d.collection] = null;
}

function brushstart() {
  d3.event.target["b_active"] = true
  svg.classed("selecting", true);
  Sefaria.track.exploreBrush(d3.event.target.book)
}

function brushmove() {
  //We are assuming that source is Bavli and target is Tanakh
  svg.selectAll(".preciseLink")
    .classed("selected", function(d) {

              if ((!brushes.hasOwnProperty("tanakh") || brushes.tanakh == null )) {
                  return (brushes["bavli"].extent()[0] <= d.sourcex && d.sourcex <= brushes["bavli"].extent()[1])
              } else if (!brushes.hasOwnProperty("bavli") || brushes.bavli == null ) {
                return (brushes["tanakh"].extent()[0] <= d.targetx && d.targetx <= brushes["tanakh"].extent()[1])
              } else { // 2 brushes
                return  ((brushes["bavli"].empty() && !brushes["bavli"]["b_active"]) || (brushes["bavli"].extent()[0] <= d.sourcex && d.sourcex <= brushes["bavli"].extent()[1]))
                  && ((brushes["tanakh"].empty() && !brushes["tanakh"]["b_active"]) || (brushes["tanakh"].extent()[0] <= d.targetx && d.targetx <= brushes["tanakh"].extent()[1]))
              }
          });
}

function brushend() {
  d3.event.target["b_active"] = false
  svg.classed("selecting",
      (
        (brushes.hasOwnProperty("tanakh") && brushes.tanakh != null && !brushes["tanakh"].empty()) ||
        (brushes.hasOwnProperty("bavli") && brushes.bavli != null && !brushes["bavli"].empty())
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
            .filter(function (p) { return d.id ==  p["book1"] || d.id ==  p["book2"] })
            .classed("active", true)
            .each(moveToFront);
    svg.selectAll(".preciseLink")
            .filter(function (p) { return d.id ==  p["r1"]["title"] || d.id ==  p["r2"]["title"] })
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
          .attr("stroke-width", function(d) { return d["count"]/10 + "px"})
          .attr("stroke", function(d) { return colors(svg.select("#" + d["book1"]).attr("section")) })
          .attr("d", d3.svg.diagonal()
                .source(function(d) { return {"x":Number(svg.select("#" + d["book1"]).datum().base_cx), "y": Number(svg.select("#" + d["book1"]).attr("cy"))}; })
                .target(function(d) { return {"x":Number(svg.select("#" + d["book2"]).datum().base_cx), "y": Number(svg.select("#" + d["book2"]).attr("cy"))}; })
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
                tooltip.select("#text1").text(replaceAll(d["book1"],"-"," ") + " - " + replaceAll(d["book2"],"-"," "));
                tooltip.select("#text2").text(d["count"] + " connections");
                xPosition = d3.mouse(this)[0];
                yPosition = d3.mouse(this)[1] - 65;
              } else {
                tooltip.select("#text1").text(svg.select("#" + d["book1"]).datum().heTitle + " - " + svg.select("#" + d["book2"]).datum().heTitle);
                tooltip.select("#text2").text(d["count"] + " :קשרים");
                xPosition = d3.mouse(this)[0] - 170;
                yPosition = d3.mouse(this)[1] - 65;
              }
              tooltip.attr("transform", "translate(" + xPosition + "," + yPosition + ")");
          });
    }

    if (booksJson) {
        renderBookLinks(null, booksJson);
    } else {
        d3.json('/api/counts/links/Tanakh/Bavli', renderBookLinks);
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
    var b1 = svg.select("#" + d["book1"]).datum();
    var b2 = svg.select("#" + d["book2"]).datum();
    openBook(b1);
    openBook(b2);
    pushHistory();
}

function openBook(dFocused) {
    //This may be invoked from a title or link, so get the book element explicitly.  Don't rely on 'this'.
    var book = svg.select(".book." + dFocused.id);
    var dBook = book.datum();

    var originalCurtainWidth = w - (dBook.base_width + (bookSpacer * 2));
    var focusedBookWidth = w - focusedCurtainWidth - bookSpacer * 2;
    var shrinkRatio = focusedCurtainWidth / originalCurtainWidth;
    var shrunkBookSpacer = bookSpacer * shrinkRatio;
	var previousLeft = w + shrunkBookSpacer; // For RTL
	var currentLeft = 0;  // For LTR

    var labelId = dBook.collection == "tanakh" ? "top-label" : "bottom-label";
    booksFocused++;

    book
        .classed("open", true)
        .on("click", null)
        .on("mouseover", null);

    //Reregister events
    svg.selectAll("#" + dBook.collection + " .book")
        .filter(function(d) { return d !== dBook; })
            .on("mouseover", null)
            .on("mouseout", null)
            .on("click", recordCloseBook)
            .on("mouseover.tooltip", null)
            .on("mouseout.tooltip",null);

    // Resize book rectangles
    svg.selectAll("#" + dBook.collection + " .book")
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
    svg.selectAll("#" + dBook.collection + " .title")
        .transition().duration(1000)
            .style("display","none");

    //Add title for focused book
    svg.select("#" + labelId).transition().duration(1000)
            .style("display","block")
        .select(".label")
            .attr("class","label " + replaceAll(dBook.section," ","-"))
            .text(isEnglish() ? dBook.title : dBook.heTitle);
    svg.selectAll("#toggle").attr("display", "none");
}

function closeBook(dCloser) {

    booksFocused--;

    var collectionId = dCloser.collection;
    var closing = svg.select("#" + collectionId + " .open").classed("open", false).on("mouseover", mouseover_book);

    var labelId = collectionId == "tanakh" ? "top-label" : "bottom-label";

    //Resize books
    svg.selectAll("#" + collectionId + " .book")
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
    svg.selectAll("#" + collectionId + " .book")
            .on("mouseover", mouseover_book)
            .on("mouseout", mouseout_book)
            .on("click", recordOpenBook);

    svg.selectAll("#" + collectionId + " .book")
        .filter(isTwelve)
        .on("mouseover.tooltip", function() { bookTooltip.style("display", null); })
        .on("mouseout.tooltip", function() { bookTooltip.style("display", "none"); });

    //Remove focused book title and show small titles
    svg.select("#" + labelId).transition().duration(1000)
            .style("display","none")
        .select(".label")
            .text("")
            .attr("class","label");

    svg.selectAll("#" + collectionId + " .title")
        .transition().duration(1000)
            .style("display","block");
}

function processPreciseLinks(dBook) {

    function preciseLinkCallback (error, json) {
        if (!(dBook.title in pLinkCache)) {
            pLinkCache[dBook.title] = json;
        }

        //We are assuming that r1 is Bavli and r2 is Tanakh
        var otherBookRef = dBook.collection == "tanakh" ? "r1" : "r2";
        var otherBook = null;
        svg.selectAll(".open.book").each(function(d) { if (d !== dBook) { otherBook = d; }});

        //Todo: avoid the server call, and just get the intersection from the existing cached json of the other book
        if(otherBook) {
            var otherTitle = otherBook.id;
            function isInIntersection(el) {
                return (el[otherBookRef]["title"] == otherTitle);
            }
            json = json.filter(isInIntersection);
        }

        var preciseLinks = plinks.selectAll("a.preciseLinkA")
            .data(json, function(d) { return d["r1"]["title"] + "-" + d["r1"]["loc"] + "-" + d["r2"]["title"] + "-" + d["r2"]["loc"]; });

        //enter
        preciseLinks.enter()
            .append("a")
                .attr("xlink:href", function(d) { return "/" + toLink(d["r1"]["title"]) + "." + d["r1"]["loc"]})
                .attr("target","_blank")
                .classed("preciseLinkA", true)
            .append("path")
                .attr("class", function(d) { return "preciseLink " + d["r1"]["title"] + " " + d["r2"]["title"]; })
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
                        tooltip.select("#text1").text(replaceAll(d["r1"]["title"],"-"," ") + " " + d["r1"]["loc"]);
                        tooltip.select("#text2").text(replaceAll(d["r2"]["title"],"-"," ") + " " + d["r2"]["loc"]);
                    } else {
                        xPosition = d3.mouse(this)[0] - 130;
                        yPosition = d3.mouse(this)[1] - 65;
                        tooltip.select("#text1").text(d["r1"]["loc"] + " " + svg.select("#" + d["r1"]["title"]).datum().heTitle);
                        tooltip.select("#text2").text(svg.select("#" + d["r2"]["title"]).datum().heTitle + " " + d["r2"]["loc"]);
                    }
                    tooltip.attr("transform", "translate(" + xPosition + "," + yPosition + ")");
                });

        //update
        preciseLinks.attr("display", "inline")
            .select("path.preciseLink")
                .attr("stroke", function (d) {
                      if(otherBook && this.getAttribute("stroke")) { // link was already shown, leave it.  Second condition is needed for when two books open before first callback is called.
                          return this.getAttribute("stroke");
                      } else { // Color by opposing scheme
                          return colors(svg.select("#" + d[otherBookRef]["title"]).attr("section"))
                      }
                })
                .attr("d", d3.svg.diagonal()
                    .source(function (d) {
                      d.sourcex = Number(svg.select("#" + d["r1"]["title"]).datum().s(d["r1"]["loc"]));
                      d.sourcey = Number(svg.select("#" + d["r1"]["title"]).attr("cy"));
                      return {
                          "x": d.sourcex,
                          "y": d.sourcey
                      };
                    })
                    .target(function (d) {
                      d.targetx = Number(svg.select("#" + d["r2"]["title"]).datum().s(d["r2"]["loc"]));
                      d.targety = Number(svg.select("#" + d["r2"]["title"]).attr("cy"));
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

    var linkCat = dBook.collection == "tanakh" ? "Bavli" : "Tanakh";

    if (dBook.title in pLinkCache) {
        preciseLinkCallback(null, pLinkCache[dBook.title]);
    } else {
        d3.json('/api/links/bare/' + dBook.title + '/' + linkCat, preciseLinkCallback);
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

function moveToFront() {
	this.parentNode.appendChild(this);
}

//These next three, and how they're used with the various data ins and outs, are a bit of a mess.
function replaceAll(str, ol, nw) {
    return str.split(ol).join(nw)
}
function toId(title) {
    return replaceAll(title," ","-");
}
function toLink(title) {
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
    var url = "/explore";
    var title = isEnglish()?"Explore":'מצא חיבורים בין';
    var openIds = [];
    var talmudOpen = false;
    var tanakhOpen = false;

    svg.select("#tanakh .open.book").each(function(d) {
        tanakhOpen = true;
        openIds.push(d.id);
        url += "/" + d.id;
        title += " ";
        title += isEnglish() ? d.title : d.heTitle;
    });

    svg.select("#bavli .open.book").each(function(d) {
        talmudOpen = true;
        openIds.push(d.id);
        url += "/" + d.id;
        title += tanakhOpen ? isEnglish() ? " & " : " ו" : " ";
        title += isEnglish() ? d.title : d.heTitle;
    });
    if (isHebrew()) {
        if(talmudOpen && !tanakhOpen) {
            title += " והתנ״ך ";
        }
        if(tanakhOpen && !talmudOpen) {
            title += " והתלמוד ";
        }
    }


    if(isHebrew()) {
        url += "/he";
        if(title == 'מצא חיבורים בין') {
            title = "מצא חיבורים בספריא";
        }
    } else {
        if(title == "Explore") {
            title += " Sefaria";
        } else {
            title += " Connections";
        }
    }

    return {
        "object" : {"openIds": openIds, "title": title, "lang": lang},
        "argtitle" : title,
        "url" : url,
        "books" : openIds
    };
}
