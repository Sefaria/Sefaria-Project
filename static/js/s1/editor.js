// NOTE this file is the legacy reader.js code, but is currently only used for the Editor
// It ought to be rewritten entirely, short of that the reader related code out to be stripped
// so that only editing code remains.

import Sefaria from "../sefaria/sefaria";

var sjs = sjs || {};

$.extend(sjs,  {
	Init: {},       // functions for initializing a page
	bind: {},       // functons for binding event handlers
	depth: 0,       // how deep the many steps in the current thread
	thread: [],     // a list of refs describing the path taken through texts
	view: {},       // cached values related to current view
	editing: {},    // data related to current editing
	ref: {},        // data relate to selecting a valid ref (e.g., in add source)
	reviews: {      // data of text reviews
		inProgress: {}
	},
	visible: {
		first: 1,
		last: 1
	},
	flags: {
		loading: false,        // are we currently loading a view? 
		verseSelecting: false, // are we currently selecting a verse?
		saving: false,         // are we currently saving text?
	},
	add: {
		source: null
	},
	timers: {
		hideMenu: null,
		panelPreivew: null,
	},
	palette: ["#5B1094", "#00681C", "#790619", "#CC0060", "#008391", "#001866", "#C88900", "#009486", "#935A10", "#9D2E2C"],
	sourcesFilter: "all",
	previousFilter: "all",
	_direction: 0,      // direction of text load animaition: -1 left, 0 no animation, 1 right
	_verseHeights: [],  // stored list of the top positon of each verse
	_scrollMap: []      // stored list of the window top position that should correspond to highlighting each verse
});

sjs.cache.params({notes: 1, sheets: 1}); // Default parameters to getting texts.

sjs.ratySettings = { // for text review ratings
	path: "/static/img/raty/",
	hints: ["Major problems", "Some problems", "Seems good", "Good", "Definately good"]
};


//  Initialize everything
sjs.Init.all = function() {
	
	// Init caches of jquery elements
	sjs.Init._$();

	// Bind functions to dom elements
	sjs.Init.handlers();

	sjs.view.width = $(window).width();

	if ("error" in sjs.current) {
		sjs.alert.message(sjs.current.error);
		sjs._$basetext.html("<center>Open another text with the Sefaria menu above</center>");
		sjs._$aboutBar.hide();
		return;
	}

	if (sjs.current.sections && sjs.current.sections.length === sjs.current.textDepth) {
		sjs.setSelected(sjs.current.sections[sjs.current.textDepth-1],
						sjs.current.toSections[sjs.current.textDepth-1]);
	}

	var mode = sjs.current.mode || "view";
	switch (mode) {
		case "view":
			sjs.Init.loadView();
			break;
		case "add new":
			sjs.newText();
			if (sjs.current.newTitle) {
				$("#newTextName").val(sjs.current.newTitle).trigger("textchange");
			}
			break;
		case "add":
			sjs.editing = clone(sjs.current);
			sjs.editing.versionTitle  = "";
			sjs.editing.versionSource = "";
			sjs.showNewText();	
			break;
		case "edit":
			if(!sjs.langMode){
				sjs.langMode = sjs.current.text.length ? 'en' : 'he';
			}
			sjs.editText(sjs.current);
			break;
		case "translate":
			sjs.translateText(sjs.current);
			break;
		case "review":
			sjs.reviewText(sjs.current);
	}
};


sjs.Init._$ = function() {
	// ----------- Init Stored Elements ---------------
	sjs._$screen             = $(".screen").eq(0);
	sjs._$basetext           = $(".basetext").eq(0);
	sjs._$aboutBar           = $(".aboutBar").eq(0);
	sjs._$commentaryViewPort = $(".commentaryViewPort").eq(0);
	sjs._$commentaryBox      = $(".commentaryBox").eq(0);
	sjs._$sourcesBox         = $(".sourcesBox").eq(0);
	sjs._$sourcesCount       = $(".sourcesCount").eq(0);
	sjs._$sourcesList        = $(".sourcesList").eq(0);
	sjs._$sourcesHeader      = $(".sourcesHeader").eq(0);
	sjs._$sourcesWrapper     = $(".sourcesWrapper").eq(0);
	sjs._$newVersion         = $("#newVersion");
};


sjs.Init.loadView = function () {
	sjs.cache.save(sjs.current);
	History.replaceState(parseRef(sjs.current.ref), sjs.current.ref + " | Sefaria.org", null);

	var params = getUrlVars();
	if ("with" in params) {
		sjs.sourcesFilter = params["with"].replace(/_/g, " ");
	}
	if ("layer" in params) {
		sjs.sourcesFilter = "Layer";
		sjs.cache.params({commentary: 0, notes: 0, sheets: 0, layer: params["layer"]});
		$(".sidebarMode").removeClass("active");
	}
	if ("layout" in params) {
		// Should already be handled server side
	}
	if ("sidebarLang" in params) {
		var sidebarLang = params["sidebarLang"];
		sidebarLang     = {he: "sidebarHebrew", en: "sidebarEnglish", all: "sidebarAll"}[sidebarLang];
		$("body").removeClass("sidebarAll sidebarEnglish sidebarHebrew").addClass(sidebarLang);
	}

    if ("qh" in params) {
        sjs.current.query_highlight = params["qh"];
    }
	buildView(sjs.current);
	
	if (sjs.langMode == "bi") { 
		$("#biLayoutToggle").show();
	}
	
	sjs.thread = [sjs.current.ref];
	sjs.track.open(sjs.current.ref);
};


sjs.Init.handlers = function() {

	// ------------- Hide Modals on outside Click -----------
	
	$(window).click(function() {
		$(".zipOpen").removeClass("zipOpen");
		$(".zipBox").hide();
		$(".navBack").hide();
		$(".navBox").show();
		sjs.lexicon.reset();

		lowlightOff();
		$(".expanded").each(function(){ sjs.expandSource($(this)); });
		sjs.hideSources();
		if (sjs.current.mode == "view") {
			sjs.updateUrlParams();
		}

	});
	
	// --------- Don't let clicks on Modals trigger the above --------

	$(document).on('click touch', '.sModal, .open', function(e) { e.stopPropagation(); });

	// -------- Cache window width on window resize ------

	$(window).resize(function() {
		sjs.view.width = $(window).width();
	});

	
	// ------- Cache Scroll Position ---------------

	var currentScrollPositionX = $(document).scrollTop();
	var currentScrollPositionY = $(document).scrollLeft();
	$(document).scroll(function(){
	    currentScrollPositionX = $(this).scrollTop();
	    currentScrollPositionY = $(this).scrollLeft();
	});


	// ------------ Show / Hide Commentary Panel ----------------
	sjs.hideCommentary = function(e) {
		sjs._$basetext.addClass("noCommentary");
		sjs._$commentaryBox.addClass("noCommentary");
		$("body").addClass("noCommentary");
		sjs._$commentaryViewPort.hide();
		sjs.track.ui("Hide Commentary")
		e.stopPropagation();
	};
	$(document).on("click", ".hideCommentary", sjs.hideCommentary);
	
	sjs.showCommentary = function(e) {
		sjs._$basetext.removeClass("noCommentary");
		sjs._$commentaryBox.removeClass("noCommentary");
		$("body").removeClass("noCommentary");
		sjs._$commentaryViewPort.fadeIn();
		$(this).addClass("hideCommentary")
			.removeClass("showCommentary");
		e.stopPropagation();
	};
	$(document).on("click", ".showCommentary", sjs.showCommentary);


	// ---------------- Sources Panel ---------------

	// Prevent any click on sourcesList from hiding itself (bound on window)
	$(document).on("click", ".sourcesList", function(e) { e.stopPropagation(); });

	sjs.showSources = function(e) {
		if (sjs._$commentaryBox.hasClass("noCommentary")) {		  
			// Opening a hidden Commentary box
	  		sjs._$basetext.removeClass("noCommentary");
			sjs._$commentaryBox.removeClass("noCommentary");
			$("body").removeClass("noCommentary");
			sjs._$commentaryViewPort.fadeIn();
			$(".hideCommentary").show();
	
		} else {
			// Opening the Sources Panel
			if (sjs.current.connectionsLoadNeeded) { return; }
			sjs._$sourcesList.addClass("opened");
			sjs.track.ui("Show Source Filters");
		}
		if (e) { e.stopPropagation(); }
	};

	sjs.hideSources = function(e) {
		sjs._$sourcesList.removeClass("opened");
	};
	$(document).on("click touch", ".hideSources", sjs.hideSources);
	$(document).on("click touch", ".sidebarButton", sjs.showSources);

	sjs.loadSources = function(callback) {
		// Load sources, notes, sheets from API
		// Stores merged content in cache
		// call callback with data
		sjs.alert.loadingSidebar();
		sjs.cache.params({commentary: 1, notes: 1, sheets: 1});
		var layer = sjs.current.layer;
		sjs.cache.kill(sjs.current.ref);
		sjs.cache.get(sjs.current.ref, function(data){
			if ("error" in data) {
				sjs.alert.message(data);
				return;
			}
			sjs.current.commentary = data.commentary;
			sjs.current.sheets     = data.sheets;

			data["layer"] = sjs.current.layer;
			sjs.cache.save(data);

			if (callback) {
				callback(data);
			}
			sjs.setSourcesCount();
			sjs.setSourcesPanel();
		});
		sjs.cache.params({commentary: 0, notes: 0, sheets: 0, layer: sjs.current.layer_name})
		sjs.current._loadSourcesFromDiscussion = false;
	};

	// Commentary filtering by clicking on source category
	$(document).on("click", ".source", function() {
		if (sjs.sourcesFilter === "Notes" || sjs.sourcesFilter === "Sheets" || sjs.sourcesFilter === "Layer") {
			// We're not in Sourcss mode, need to build commentary first
			$(".showSources").trigger("click");
		}
		$(".source").removeClass("active");
		$(this).addClass("active");

		if (!($(this).hasClass("sub"))) {
			$(".source .sub").hide();
			$(this).find(".sub").show();	
		}

		var category = $(this).attr("data-category");
		sjs.sourcesFilter = category;
		sjs.filterSources(category);

		return false;
	});
	
	// Load the initial page notes, which were not included in initial pageview
	// Subsequent notes calls are bundled with texts in sjs.cache
	if(sjs.current.ref){
		$.getJSON("/api/notes/" + sjs.current.ref, function(data){
			if ("error" in data) {
				sjs.alert.message(data);
				return;
			}
			sjs.current.notes = data.notes;
    	});
	}
	sjs.filterSources = function(cat) {
		// Filter sources for category 'cat'
		// 'kind' maybe either 'category' (text filter) or 'type' (connection filter)
		sjs.sourcesFilter = cat;

		cat = cat.replace(/ /g, "-");

		if (cat === "all") {
			sjs._$commentaryViewPort.find(".commentary").removeClass("hidden");
			// Special treatment for Modern Works -- don't show by default
			$(".commentary[data-category~='Modern-Works']").addClass("hidden");
		} else if (cat === "Layer") {
			// pass
		} else {
		// Hide everything, then show this
			cats = cat.split("+");
			sjs._$commentaryViewPort.find(".commentary").addClass("hidden");
			for (var i=0; i < cats.length; i++) {
				$(".commentary[data-category~='" + cats[i] + "']").removeClass("hidden");
			}
     	}

     	if (cat != "Notes" && cat != "Sheets" && cat != "Layer") {
     		sjs.setSourcesCount();	
     	}
     	if (sjs._$verses) {
			// create a new scroll map, but only if the basetext
			// has been loaded already
			setScrollMap();
		}
		
		sjs.updateUrlParams();
	}; 


	sjs.setSourcesCount = function() {
		// Set the count of visible / highlighted sources
		var $c   = sjs._$commentaryBox;
		
		if (sjs.current._loadSourcesFromDiscussion) {
			// Sources haven't been loaded, we don't know how many there are
			text = "<i class='fa fa-link'></i> Sources";
		} else if (sjs.sourcesFilter === 'all') {
			// Don't check visible here, as there is a bit of lag in
			// actually showing the commentaries with the removeClass
			// above. We know that all commentaries are visible now.
			text = "<i class='fa fa-link'></i> " + $c.find(".commentary").not(".lowlight").length + " Sources";

		} else if (sjs.sourcesFilter !== "Notes" && sjs.sourcesFilter !== "Sheets" && sjs.sourcesFilter !== "Layer") {
			// We're in Sources mode
			// Again, use not(.hidden) instead of :visible to avoid
			// the visibility race condition
			text = "<i class='fa fa-link'></i> " + 
					$c.find(".commentary").not(".hidden").not(".lowlight").length + " " + 
					sjs.sourcesFilter.replace(/\%252B/g, "+").split("+").join(", ").toProperCase();
		} else {
			text =  "<i class='fa fa-link'></i> " + sjs.current.commentary.length + " Sources";
		}

		sjs._$sourcesCount.html(text);
		$c = null;
	}

	sjs.setSidebarLang = function() {
		var lang = "sidebarAll";
		lang     = $(this).hasClass("sidebarHebrew")  ? "sidebarHebrew"  : lang;
		lang     = $(this).hasClass("sidebarEnglish") ? "sidebarEnglish" : lang;
		$("body").removeClass("sidebarAll sidebarHebrew sidebarEnglish").addClass(lang);
		$.cookie("sidebarLang", lang);
		setScrollMap();
		//sjs.setSourcesCount(); // Doesn't currently check visibility
		sjs.updateUrlParams();
	};
	$(document).on("click", ".sidebarLanguageOption", sjs.setSidebarLang);


	sjs.setSourcesPanel = function(start, end) {
		// Set the HTML of the sources panel for the range start - end
		// or reset if no range preset.
		sjs._$sourcesWrapper.html(sourcesHtml(sjs.current.commentary, start, end));
	}


	// --------- Switching Sidebar views (Sheet / Notes / Layers) ---------------
	sjs.switchSidebarMode = function(e) {
		// Switches the content of the sidebar, according to the present targets
		// data-sidebar attribute
		console.log("ssm")
		if (sjs.current._loadSourcesFromDiscussion) {
			sjs.alert.loadingSidebar();
			$(".sidebarMode").removeClass("active");
			$(e.target).addClass("active");
			sjs.loadSources(function(data) {
				sjs.alert.clear();
				sjs.switchSidebarMode(e);
			});
			return;
		} else if (sjs.current.connectionsLoadNeeded) { return; }
		var mode            = $(e.target).attr("data-sidebar");
		if (!mode) { return; }
		var data            = sjs.current[mode];
		var newFilter       = mode === "commentary" ? "all" : mode.toProperCase();
		var fromSourcesMode = !($.inArray(sjs.sourcesFilter, ["Notes", "Sheets", "Layer"]) > -1);

		if (fromSourcesMode) {
			// Store this so we can switch back to previous filter
			sjs.previousFilter = sjs.sourcesFilter;
		}
		if (newFilter === 'all' && sjs.previousFilter !== 'all') {
			// Restore a previous filter
			sjs.sourcesFilter = sjs.previousFilter;
		} else {
			sjs.sourcesFilter = newFilter;
		}
		buildCommentaryContent(data);
		sjs.filterSources(sjs.sourcesFilter);
		$(".sidebarMode").removeClass("active");
		$(e.target).addClass("active");
		sjs.updateUrlParams();
		e.stopPropagation();
	}
	$(document).on("click touch", ".sidebarMode", sjs.switchSidebarMode);


	// --------------- About Panel ------------------

	sjs.showAbout = function() { 
		sjs.loadReviews(); // Load textual reviews from API
		sjs.loadAboutHistory(); // Load text history info from API
		$("#overlay").show();
		$("#about").show().position({of: window});
	};
	sjs.hideAbout = function() { 
		$("#overlay").hide();
		$("#about").hide();
	};
	sjs.toggleAbout = function() {
		if ($("#about").is(":visible")) {
			sjs.hideAbout();
		} else {
			sjs.showAbout();
		}
	};
	$(document).on("click", ".aboutText", sjs.toggleAbout);
	$(document).on("click", "#hideAbout", sjs.hideAbout);

	sjs.loadAboutHistory = function() {
		// Load text attribution list only when #about is opened
		for (var lang in { "en": 1, "he": 1 }) {
			if (!lang) { continue; }
			if (!$(this).find("."+lang+" .credits").children().length) {
				var version = (lang === "en" ? sjs.current.versionTitle : sjs.current.heVersionTitle);
				if (!version) { continue; }
				var url = "/api/history/" + sjs.current.sectionRef.replace(" ", "_") + "/" +
											lang + "/" +
											version.replace(" ", "_");
				
				var getLink = function(obj) { return obj["link"] };
				var setCredits = function(data, lang) {
					var credits = [];
					if (data.translators.length) { credits.push("<div class='credit'>Translated by " + data["translators"].map(getLink).join(", ") + "</div>") }
					if (data.copiers.length)    { credits.push("<div class='credit'>Copied by "     + data["copiers"].map(getLink).join(", ")     + "</div>") }
					if (data.editors.length)    { credits.push("<div class='credit'>Edited by "     + data["editors"].map(getLink).join(", ")     + "</div>") }
					if (data.reviewers.length)  { credits.push("<div class='credit'>Reviewed by "   + data["reviewers"].map(getLink).join(", ")   + "</div>") }

					var html = credits.join(" ⋄ ");

					$("#about").find("." + lang + " .credits").html(html);
				}
				var setCreditsWrp = (function(lang) { 
					return function(data) { setCredits(data, lang); };
				})(lang);

				$.get(url, setCreditsWrp);
			}
		}
	};

	// --------------- Ref Links -------------------
	
	$(document).on("click", ".refLink", sjs.bind.refLinkClick);


	// ------------- Next Link Url -----------------
		
	var event = isTouchDevice() ? 'touchstart' : 'click';
	$("#next, #prev").on(event, function() {
		sjs._direction = (this.id == "prev" ? -1 : 1);
		var ref = $(this).attr("data-ref");
		if (ref) {
			get(parseRef(ref));
			sjs.track.ui("Nav Button #" + this.id);
		}
	});

	
	// ---------------- Layout Options ------------------
				
	$("#block").click(function(){
		$("#layoutToggle .toggleOption").removeClass("active");
		$(this).addClass("active");
		sjs._$basetext.addClass("lines").removeClass("block");
		setVerseHeights();
		updateVisible();
	});
	
	$("#inline").click(function(){
		$("#layoutToggle .toggleOption").removeClass("active");
		$(this).addClass("active");
		sjs._$basetext.removeClass("lines").addClass("block");
		setVerseHeights();
		updateVisible();
	});
	
	// ------------------ Language Options ---------------
	
	sjs.changeReaderContentLang = function() {
		// Reader Specific updates when changing content lang mode
		// General behavior covered in sjs.changeContentLang in headers.js
		var mode      = this.id;
		var shortMode = this.id.substring(0,2);
		sjs.langMode  = shortMode;

		sjs._$basetext.removeClass("english bilingual hebrew").addClass(mode);
		
		if (mode === "bilingual") {
			$("#layoutToggle").hide();
			$("#biLayoutToggle").show();
		} else {
			$("#layoutToggle").show();
			$("#biLayoutToggle").hide();			
		}

		sjs.updateReviewsModal(shortMode);
		sjs.updateUrlParams();
		setVerseHeights();
		updateVisible();
		return false;
	};
	$("#hebrew, #english, #bilingual").click(sjs.changeReaderContentLang);
	
	
	// ------------ Bilingual Layout Options ----------------

	$("#heLeft").click(function() {
		$("#biLayoutToggle .toggleOption").removeClass("active");
		$(this).addClass("active");
		sjs._$basetext.removeClass("heRight lines block").addClass("heLeft");
		$("body").removeClass("heRight lines block").addClass("heLeft");
		sjs.updateUrlParams();
		return false;
	});

	$("#heRight").click(function() {
		$("#biLayoutToggle .toggleOption").removeClass("active");
		$(this).addClass("active");
		sjs._$basetext.removeClass("heLeft lines block").addClass("heRight");
		$("body").removeClass("heLeft lines block").removeClass("heLeft");
		sjs.updateUrlParams();
		return false;
	});


}; // --------- End sjs.Init.handlers -------------


// -------------- DOM Ready ------------------------	
$(function() {
	sjs.Init.all();

	// TODO pull much of the code below into sjs.Init
	
	// ------------- History ---------------------

	$(window).bind("statechange", function(e) {
		var State = History.getState();
		if('skipHandler' in State.data || sjs.flags.localUrlChange) {
			return;
		}
		actuallyGet(State.data);
	});

	// ------------iPad Fixes ---------------------
		
	if (isTouchDevice()) {
		$(window).bind('touchmove', updateVisible);
	}

	// -------------- Edit Text -------------------

	$(document).on("click", ".editText", sjs.addThis);
	$(document).on("click", ".addThis",  sjs.addThis);

	// ---------------- Edit Text Info ----------------------------

	$("#editTextInfo").click(function() {

        if (sjs.current.isComplex) {
            sjs.hideAbout();
            sjs.alert.message("This text is not user editable - please email dev@sefaria.org");
            return;
        }
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}

		var title = (sjs.current.commentator || sjs.current.book);

		window.location = ("/edit/textinfo/" + title + "?after=/" + sjs.current.sectionRef).replace(/ /g, "_");
	});


// ------------- New Text --------------------------

	$("#addText").click(sjs.newText);


	$("#newTextCancel").click(function() {
		$("#overlay").hide();
		$("#newTextMsg").text("Text or commentator name:");
		$("#newTextName").val("");
		$("#newTextModal").hide();
	});
	

	$("#newTextOK").click(function(){
        var ref = $("#newTextName").val();
		Sefaria.getName(ref, true)
			   .then(function(q) {
					if(!q.is_ref) {
						// This is an unknown text
						var title = $("#newTextName").val().replace(/ /g, "_");
						var after = "?after=/add/" + title;
						window.location = "/add/textinfo/" + title + after;
					} else {
						$.extend(sjs.editing, {
							index: Sefaria.index(q.index),
							indexTitle: q.index,
							sectionNames: q.sectionNames,
							textDepth: q.sectionNames.length,
							text: [""],
							book: q.book,
							sections: q.sections,
							toSections: q.toSections,
							ref: q.ref
						});
						sjs.current.sectionRef = sjs.editing.ref;
						sjs.showNewText();
					}
					$("#newTextCancel").trigger("click");
        });

	});
	
// --------------- Add Translation // Version  ------------------
	
	$("#addTranslation").click(function(e) {
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}
		sjs.translateText(sjs.current);
		e.stopPropagation();
	});

	$("#addVersion").click(function(e) {
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}
		$("#hebrew").trigger("click");
		sjs.editing               = clone(sjs.current);
		sjs.editing.versionTitle  = "";
		sjs.editing.versionSource = "";
		sjs.showNewText();
		$("#copyRadio").trigger("click");
		e.stopPropagation();
	});
	
	
	$("#addVersionCancel").click(function() { 
		var params = getUrlVars();
		
		if ("after" in params) {
			window.location = params["after"];
		}else if ("next" in params) {
			window.location = decodeURIComponent(params["next"]);
		}else if($.cookie('s2') == "true") {
			if (window.location.href.includes("edit/")) {
				window.location = window.location.href.replace("edit/", "");
			} else {
				window.location = "/" + sjs.editing.indexTitle;
			}
		} else {
			sjs.clearNewText();
			sjs._direction = 0;
			buildView(sjs.current);
		}
	});
	
	$("#addVersionSave").click(function() {
		var version = readNewVersion();
		if (validateText(version)) {
			saveText(version);
		}
	});

	$("#showOriginal").click(sjs.toggleShowOriginal);



// --------------------- Commentary Expansion ---------------

	sjs.handleCommentaryClick = function(e) {
		if ($(this).hasClass("lowlight")) {
			lowlightOff();
		}
		if (e.target.tagName !== "A" && // Allow links to be linky,
			!$(this).hasClass("noteMessage") &&  // Don't expand noteMessage
			!$(this).hasClass("sheet") ) // Don't expand sheet listings
		{ 
			// otherwise expand the source
			sjs.expandSource($(e.currentTarget));
		}	

		e.stopPropagation();
	};
	$(document).on("click", ".commentary", sjs.handleCommentaryClick);
	

// ----------------------- Commentary Edit --------------------

	sjs.editSource = function () {
		// Open the currently expanded source for editing.
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}
		var $o = $(this).parents(".expanded");
		var source = {};
		
		source.id = parseInt($o.attr("data-id"));
		if (sjs.sourcesFilter === "Layer") {
			source.ref =  sjs.current.layer[source.id].anchorRef;
		} else if ($o.hasClass("note")) {
			source.ref =  sjs.current.notes[source.id].anchorRef;
		} else {
			source.ref =  sjs.current.commentary[source.id].anchorRef;
		}
		sjs.add.source = source;
		
		buildOpen(true);
	};
	$(document).on("click", ".editLink", sjs.editSource);

	
// ----------------------- Translate Links --------------------
	
	sjs.translateThis = function () {
		// Open a view for translating of the ref stored in 
		// this's data-ref attribute. 
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}
		
		var ref = $(this).attr("data-ref");
		var data = sjs.cache.get(ref);
		
		if (data) {
			sjs.translateText(data);
		} else {
			sjs.alert.saving("Looking up text...");
			$.getJSON("/api/texts/" + makeRef(parseRef(ref)), sjs.translateText);
		}
	};
	$(document).on("click", ".translateThis", sjs.translateThis);

	
// ------------------- Reviews ------------------------

	sjs.openReviews = function () {
		var lang = ($(this).hasClass("en") ? "en" : "he");
		sjs.updateReviewsModal(lang);
		$("#reviewsModal").show().position({of: window}).draggable();
		$("#overlay, #about").hide();
		sjs.track.event("Reviews", "Open Reviews Modal", "");
	};
	$(document).on("click", ".reviewsButton", sjs.openReviews);

	sjs.closeReviews = function() {
		$("#reviewsModal").hide();
		$("#reviewsText").text("");
	};

	$(document).on("click", "#reviewsModal .cancel", sjs.closeReviews);	
	$(document).on("click", "#reviewsModal .save", sjs.saveReview);
	$(document).on("click", ".reviewDelete", sjs.deleteReview);

	$("#reviewText").change(sjs.storeReviewInProgress);

	$("#reviewHelpLink").click(function(e){ 
		e.preventDefault();
		$("#reviewsModal").addClass("reviewHelp").position({of: window});
	});
	$("#reviewHelpOK").click(function(){
		$("#reviewsModal").removeClass("reviewHelp");
	});

	$("#raty").raty(sjs.ratySettings);

// -------------- Highlight Commentary on Verse Click -------------- 

	sjs.hoverHighlight = function(e) {
		var n;
		$this = $(this);
		if ($this.hasClass("verse")) {
			n = $this.attr("data-num");
			$('[data-vref="'+n+'"]').addClass("highlight");
		} else if ($this.hasClass("commentary"))  {
			n = $this.attr("data-vref");
			$(this).addClass("highlight");
		}
		$('[data-num="'+n+'"]').addClass("highlight");
	};
	$(document).on("mouseenter", ".verse, .commentary", sjs.hoverHighlight );

	sjs.hoverHighlightOff = function(e) {
		$(".highlight").removeClass("highlight");
	};
	$(document).on("mouseleave", ".verse, .commentary", sjs.hoverHighlightOff );


	sjs.handleVerseClick = function(e) {
		if ($("body").hasClass("editMode")){ return false; } //if we're editing a text, clicking on a verse span should do nothing
		
		// Figure out which segment or range of segments is selected
		if (sjs._$verses.filter(".lowlight").length) {
			// Is something already selected?
			var $highlight = sjs._$verses.not(".lowlight");
			if ($highlight.is($(this)) && $highlight.length == 1) {
				// Did the click just happen on the only selected line? Then unselect it.
				$(window).trigger("click");
				return;
			}
			if ($highlight.length > 1 || $highlight.is($(this))) {
				// Is there already a range selected? reset if so
				var v = [$(this).attr("data-num"), $(this).attr("data-num")];		
			} else if ($highlight.length == 1) {
				var v = [$(this).attr("data-num"), $highlight.attr("data-num")].sort();
			}  
		} else {
			var v = [$(this).attr("data-num"), $(this).attr("data-num")];		
		}

		lowlightOn(v[0], v[1]);
		$("#noteAnchor").html("Note on " + sjs.selected);
		sjs.selected_verses = v;
	
		// Selecting a verse for add source
		if (sjs.flags.verseSelecting) {			
			sjs.add.source = {ref: selected};
			$("#selectedVerse").text(selected);
			$("#selectConfirm").show();
			$("#selectInstructions").hide();
		} 

		// add Verse Controls menu
		if ($(window).width() > 669) {
			$(".verseControls").remove();
			var offset = $(this).offset();
			var left = sjs._$basetext.offset().left + sjs._$basetext.outerWidth();
			var top = e.pageY; // offset.top;
			var verseControls = '<div class="verseControls btn" ' +
				'style="left:'+ left +'px;top:'+top+'px">+' +
				'<div class="verseControlsList">' +
					(sjs.sourcesFilter === "Layer" ? '<span class="addToDiscussion">Add to Discussion</span>' : "") +
					'<span class="shareText"><i class="fa fa-share-alt"></i> Share Text</span>' +
					'<span class="addToSheet"><i class="fa fa-file-text-o"></i> Add to Source Sheet</span>' +
					'<span class="copyToClipboard"><i class="fa fa-clipboard"></i> Copy to Clipboard</span>' + 
					'<span class="addNote"><i class="fa fa-comment-o"></i> Add Note</span>' + 
					'<span class="addSource"><i class="fa fa-link"></i> Add Source</span>' + 
					'<span class="editVerse"><i class="fa fa-pencil"></i> Edit Text</span>' +
					'<span class="translateVerse"><i class="fa fa-language"></i> Add Translation</span>' +
				'</div>' +
				'</div>';
			$("body").append(verseControls);
			$(".verseControls").click(function(e){ return false; });
			$(".verseControls span").click(function() { $(".verseControls").remove(); });
			$(".verseControls .shareText").click(sjs.showShareModal);
			$(".verseControls .addSource").click(addToSelected);
			$(".verseControls .addNote").click(addNoteToSelected);
			$(".verseControls .addToDiscussion").click(addNoteToSelectedOnLayer);
			$(".verseControls .addToSheet").click(addSelectedToSheet);
			$(".verseControls .copyToClipboard").click(copySelected);
			$(".verseControls .editVerse").click(editSelected);
			$(".verseControls .translateVerse").click(translateSelected);
		}
	
		// Scroll commentary view port
		var $comments = $();
		for (var i = v[0]; i <= v[1]; i++ ) {
			$more = sjs._$commentaryBox.find(".commentary[data-vref=" + i + "]").not(".hidden");
			$comments = $comments.add($more);
		} 

		var $fc = $comments.eq(0);
		if ($fc.length == 1) {	
			var top = $(window).scrollTop() - $(this).offset().top + 120 ;					
			sjs._$commentaryViewPort.clearQueue().scrollTo($fc, {duration: 600, offset: top, easing: "easeOutExpo"})
		
		}
		sjs.setSourcesPanel(v[0], v[1]);
		sjs.setSourcesCount();
		sjs.updateUrlParams();
		return false;
	}
	$(document).on("click", ".verse", sjs.handleVerseClick );


	function addToSelected() {
		// Create a modal for adding a source to the segments selected in the UI
		// as represented by sjs.selected
		if (!sjs._uid) { return sjs.loginPrompt(); }

		$("#overlay").show();
		sjs.flags.verseSelecting = false;
		sjs.add.source = {ref: sjs.selected};
		buildOpen();

		return false;
	}


	function addNoteToSelected() {
		// Create a modal for adding a note to the segments selected in the UI
		// as represented by sjs.selected
		if (!sjs._uid) { return sjs.loginPrompt(); }

		addToSelected();
		$(".open").addClass("noteMode").position({of: $(window)});
		$("#addNoteTextarea").focus();

		return false;
	}


	function addNoteToSelectedOnLayer(e) {
		// Start flow for adding a notem but save it to a layer.
		sjs.selectType = "noteForLayer";
		sjs.writeNote();
		e.stopPropagation();
	}


	function copySelected(e) {
		// Open a modal for copy-and-pasting containing the text of the currently
		// Selected segments, as represented by sjs.selected
		e.stopPropagation();
		var pRef = parseRef(sjs.selected);
		var start = parseInt(pRef.sections[pRef.sections.length-1])-1;
		var end = parseInt(pRef.toSections[pRef.toSections.length-1]);
		 
		var en = sjs.current.text.slice(start, end).join(" ");
		var he = sjs.current.he.slice(start, end).join(" ");

		var copyText = sjs.selected + ":\n\n" + he + "\n\n" + en;
		
		sjs.alert.copy(copyText);
	}
	

	function editSelected(e){
		// Open the selected segments for editing
		if (!sjs._uid) { return sjs.loginPrompt(); }

		sjs.editCurrent(e);

		var n = sjs.selected_verses[0];
		var top = $(".segmentLabel").eq(n-1).position().top - 100;
		$("html, body").animate({scrollTop: top, duation: 200});
	}
	

	function translateSelected(e){
		// Open a view to add a translation to the currently selected segments
		if (!sjs._uid) { return sjs.loginPrompt(); }

		sjs.translateText(sjs.current); // resets .pad per current.sections
		sjs.editing.pad = sjs.selected_verses[0];
	}


// --------------- Add to Sheet ----------------

	function addSelectedToSheet(e) {
		if (!sjs._uid) { return sjs.loginPrompt(); }

		// Get sheet list if necessary
		if (!$("#sheets .sheet").length) {
			$("#sheets").html("Loading...");
			$.getJSON("/api/sheets/user/" + sjs._uid, function(data) {
				$("#sheets").empty();
				var sheets = "";
				sheets += '<li class="sheet new"><i>'+Sefaria._("sheet.start_new_source_sheet")+'</i></li>';
				for (i = 0; i < data.sheets.length; i++) {
					sheets += '<li class="sheet" data-id="'+data.sheets[i].id+'">'+
						$("<div/>").html(data.sheets[i].title).text() + "</li>";
				}
				$("#sheets").html(sheets);
				$("#addToSheetModal").position({of:$(window)});
				$(".sheet").click(function(){
					$(".sheet").removeClass("selected");
					$(this).addClass("selected");
					return false;
				})
			})			
		}

		$("#addToSheetModal .sourceName").text(sjs.selected);

		$("#overlay").show();
		$("#addToSheetModal").show().position({
			my: "center center",
			at: "center center",
			of: $(window)
		});
		
		e.stopPropagation();
	}

	$("#addToSheetModal .cancel").click(function() {
		$("#overlay, #addToSheetModal").hide();
	})

	$("#addToSheetModal .ok").click(function(){
		// Protection against request getting sent multiple times (don't know why)
		if (sjs.flags.saving === true) { return false; }
		var selectedRef = sjs.selected;
		var selected = $(".sheet.selected");
		if (!selected.length) {
			sjs.alert.message("sheet.select_source");
			return false;
		}

		if (selected.hasClass("new")) {
			var title = prompt("sheet.new_source_sheet_name", "");
			var sheet = {
				title: title,
				options: {numbered: 0},
				sources: [{ref: selectedRef}]
			};
			var postJSON = JSON.stringify(sheet);
			sjs.flags.saving = true;
			$.post("/api/sheets/", {"json": postJSON}, addToSheetCallback);	
		} else {
			var title = selected.html();
			var url = "/api/sheets/" + selected.attr("data-id") + "/add_ref";
			sjs.flags.saving = true;
			$.post(url, {ref: sjs.selected}, addToSheetCallback);	
		}

		function addToSheetCallback(data) {
			if(data["views"]){ //this is only passed on "new source sheet"
				//add the new sheet to the list
				$( "#sheets .new" ).after( '<li class="sheet" data-id="'+data.id+'">'+data.title.stripHtml() + "</li>" );
				$(".sheet").click(function(){
					$(".sheet").removeClass("selected");
					$(this).addClass("selected");
					return false;
				})
			}
			sjs.flags.saving = false;
			$("#addToSheetModal").hide();
			if ("error" in data) {
				sjs.alert.message(data.error);
			} else {
				sjs.alert.message(selectedRef + ' was added to "'+title+'".<br><br><a target="_blank" href="/sheets/'+data.id+'">View sheet.</a>');
			}
		}

	});


	// --------------- Add Source / Note through Select Modal ------------------------

	sjs.selectVerse = function(){
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}
		sjs._$commentaryBox.hide();
		sjs._$sourcesList.removeClass("opened");
		$(".smallSectionName").text(sjs.current.sectionNames[sjs.current.textDepth-1]);
		$("#verseSelectModal").show();
		$("#selectConfirm").hide();
		$("#selectInstructions").show();
		sjs.flags.verseSelecting = true;
		sjs.ref.tests = null;
		
		if ($(".lowlight").length) {
			$(".verse").not($(".lowlight")).trigger("click");
		}
		sjs.track.ui("Add Source Button Click");
		return false;
	};

	$(document).on("click", ".addSource", function() {
		sjs.selectType = "source";
		$(".sourceOrNote").text("Source");
		sjs.selectVerse();
		sjs.track.ui("Add Source Button Click");
	});

	$(document).on("click", ".addNote", function() {
		sjs.selectType = "note";
		$(".sourceOrNote").text("Note");
		sjs.selectVerse();
		sjs.track.ui("Add Note Button Click");
	});

	$(document).on("click", ".addNoteToLayer", function(e) {
		sjs.selectType = "noteForLayer";
		sjs.writeNote();
		sjs.track.ui("Add to Discussion Button Click");
		e.stopPropagation();
	});

	$(document).on("click", "#addSourceCancel", function(e) {
		$(".open").remove();
		$("#overlay") .hide();
		sjs.ref.tests = null;
	});
	
	$("#addModal").click(function() {
		return false;
	});
	
	// --------------- Verse Selecting ----------------
	
	$("#selectVerse").click(function() {
		$("#addModal, #overlay").hide();
		sjs._$commentaryBox.hide();
		sjs._$sourcesBox.hide();
		$("#verseSelectModal").show();
		sjs.flags.verseSelecting = true;
		
	});
	
	$("#verseSelectModal #selectOk").click(function() {
		if (sjs.selectType === "note" || sjs.selectType === "noteForLayer") {
			addNoteToSelected();
		} else if (sjs.selectType == "source") {
			buildOpen();
		}

		sjs._$commentaryBox.show();
		sjs._$sourcesBox.show();
		$("#verseSelectModal").hide();
		sjs.flags.verseSelecting = false;

		return false;
		
	});
	
	$("#selectReset").click(function() {
		lowlightOff();
		$("#selectInstructions").show();
		$("#selectConfirm").hide();
	});
	
	$("#verseSelectModal .cancel").click(function() {
		$("#verseSelectModal").hide();
		if (sjs.current.commentary) sjs._$commentaryBox.show();
		sjs.flags.verseSelecting = false;
	});

	// ------------- Nav Queries -----------------
	
	function navQueryOrSearch(query) {
		if (query in sjs.booksDict) {
			window.location = "/" + query + "?nav_query=" + query;
		} else if (isRef(query)) {
			sjs._direction = 1;
			get(parseRef(query));
			sjs.track.ui("Nav Query");
			sjs.searchInsteadOfNav(query);
		} else {
			window.location = "/search?q=" + query;
		}
	}

	$("#goto").unbind("keypress").keypress(function(e) {
		var query = $("#goto").val();
		if (e.keyCode == 13 && query) {
			navQueryOrSearch(query);
			$(this).blur();
		}
	});
	$("#openText").unbind("mousedown").mousedown(function(){
		var query = $("#goto").val();
		if (query) {
			navQueryOrSearch(query);
			$(this).blur();
		}
	});


	// --------------- Locking Texts --------------------

	sjs.lockTextButtonHandler = function(e) {
		// handle a click to a lockTextButton by either locking or unlocking
		// the current text.
		if ($(this).hasClass("enVersion")) {
			var lang = "en";
			var version = sjs.current.versionTitle;
		} else if ($(this).hasClass("heVersion")) {
			var lang = "he";
			var version = sjs.current.heVersionTitle;
		} else {
			return;
		}

		var url = "/api/locktext/" + sjs.current.indexTitle + "/" + lang + "/" + version;
		var unlocking = $(this).hasClass("unlock");
		if (unlocking) {
			url += "?action=unlock";
		}

		$.post(url, {}, function(data) {
			if ("error" in data) {
				sjs.alert.message(data.error)
			} else {
				sjs.alert.message(unlocking ? "Text Unlocked" : "Text Locked");
				location.reload();
			}
		}).fail(function() {
			sjs.alert.message(Sefaria._("topic.admin.something_wrong"));
		});

	};
	$(document).on("click", ".lockTextButton", sjs.lockTextButtonHandler);

	// --------------- Deleting Texts --------------------
	// Delete a Version
	sjs.deleteVersionButtonHandler = function(e) {
		// handle a click to a deleteVersionButton

		var confirm = prompt("Are you sure you want to delete this text version? Doing so will delete the text of the entire version, which may include more than what you see on this page. This action CANNOT be undone. Type DELETE to confirm.", "");
		if (confirm !== "DELETE") {
			alert("Delete canceled.")
			return;
		}

		if ($(this).hasClass("enVersion")) {
			var lang = "en";
			var version = sjs.current.versionTitle;
		} else if ($(this).hasClass("heVersion")) {
			var lang = "he";
			var version = sjs.current.heVersionTitle;
		} else {
			return;
		}

		var url = "/api/texts/" + sjs.current.indexTitle + "/" + lang + "/" + version;

		$.ajax({
			url: url,
			type: "DELETE",
			success: function(data) {
				if ("error" in data) {
					sjs.alert.message(data.error)
				} else {
					sjs.alert.message("Text Version Deleted.");
					window.location = "/" + normRef(sjs.current.sectionRef);
				}
			}
		}).fail(function() {
			sjs.alert.message(Sefaria._("topic.admin.something_wrong"));
		});

	};
	$(document).on("click", ".deleteVersionButton", sjs.deleteVersionButtonHandler);

	// Delete an Index
	$(document).on("click", "#deleteText", sjs.deleteTextButtonHandler);		
	sjs.lexicon.init();

}); // ---------------- End DOM Ready --------------------------


/************************ LEXICON **********************************************/
sjs.lexicon = {

	enabledCategories : {
		'en' :  ['Mishnah'],
		'he' : ['Tanakh']
	},


	enabledTexts : {}, //TODO: if we want a more specific activation mechanism, we might need to store info server side.

	//----------------------- INIT --------------------------------

	init: function(){
		sjs.lexicon.reset();
		$(document).on("dblclick", ".lexicon-link", sjs.lexicon.getLexiconLookup);
		$(document).on("click", ".lexicon-close", sjs.lexicon.reset);
	},

	reset: function(){
		$("#lexicon-modal").remove();
	},

	/*on: function(target){
		return;
	},*/

	// ---------------------preparation functions--------------------------
	isLexiconEnabled: function (currentText, lang, params){
		//console.log(currentText);
		/*if (params['url_enabled']){*/
		switch (lang){
			case 'he':
				if(currentText.categories[0] == 'Tanakh' &&
					!(currentText.categories[1] == 'Targum' || currentText.categories[1] == 'Commentary')){
					return true;
				}
				break;
			case 'en':
				if(currentText.categories[0] == 'Mishnah' &&
					!(currentText.categories[1] == 'Commentary')){
					return true;
				}
				break;
		}
		/*if(sjs.lexicon.enabledCategories[lang].indexOf(currentText.categories[0]) > -1) {
			return true;
		}else if('commentator' in currentText && currentText['commentator'] == 'Rashi' && lang == 'he'){//hack. find better way
			return true;
		}
		}*/
		return false;
	},


	wrapHebArcLexiconLookups : function (text) {
		// Wraps words in text with a tags
		// to online Aramaic dictionary
		if (typeof text !== "string") {
			return text;
		}
		wrapped = "";
		//words = text.split(/[ ]+/);
		//regex to match hebrew, but not spaces, colons, maqqaf or parshiya indicator (פ) or (ס)
		//TODO: this regex had \'\" after \u05f3 to help with laaz rashi wrapping. it was casuing issues with search highlights. Find another way
		var regexs = /([\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05f4]+)(?!\))/g;
		wrapped = text.replace(regexs, "<span class='lexicon-link'>$1</span>")
		/*for (var i = 0; i < words.length; i++ ) {
			wrapped += "<span class='lexiconLink'>" + words[i] + "</span> ";
		}*/
		return wrapped;
	},


	wrapEngLexiconLookups : function (text) {
		// Wraps words in text with a tags
		// to lexicon links
		if (typeof text !== "string") {
			return text;
		}
		var parsedText = $("<p>").html(text);
		parsedText.find('i').wrap("<span class='lexicon-link'></span>");
		return parsedText.html();
	},

	// ----------------- Lexicon lookup--------------------------
	getLexiconLookup : function(e){
		e.stopPropagation();
		//console.log($(this).text())
		var word = $(this).text();
		var current_ref = sjs.selected ? sjs.selected : sjs.current.sectionRef;
		var $anchor = $(this);
		$.getJSON("/api/words/" + encodeURIComponent(word), {"lookup_ref": current_ref}).done(function(data){
			//console.log(data);
			$html = sjs.lexicon.renderLexiconLookup(data, word);
			var $modal = $('<div id="lexicon-modal">').append($html).appendTo("body");
			$modal.on("click", ".lexicon-close", sjs.lexicon.reset);
			$modal.position({my: "center top", at: "center bottom", of: $anchor, collision: 'flipfit flipfit'})
				.click(function(e){ e.stopPropagation(); });

		});

	},

	//--------------------- formatting ----------------------------

	renderLexiconLookup: function(data, word){
		sjs.lexicon.reset();
		var $html = $('<div class="lexicon-content">');
		var $headerhtml = $('<div class="lexicon-header"><i class="fa fa-times lexicon-close"></i><h4>'+word+'</h4></div>').appendTo($html);
		var ga_data = sjs.current.categories.join("/") + "/" + sjs.current.book;
		if("error" in data){
			sjs.track.event("Lexicon", "Open No Result / " + ga_data + " / " + getUrlVars()['lang'], word);
			return $html.append('<span>'+ data.error + '</span>')
		}
		sjs.track.event("Lexicon", "Open / " + ga_data + " / " + getUrlVars()['lang'], word);
		var $contenthtml = $('<div class="lexicon-results">');
		for(var i=0; i<data.length; i++) {
			$entry = $('<div class="entry">');
			entryHeadStr =  '<span class="headword">'+data[i]['headword']+'</span>';
			if('morphology' in data[i]['content']){
				entryHeadStr += '<span class="morphology"><em> ('+ data[i]['content']['morphology'] + ') </em></span>'
			}
			$entry.append('<div class="headword">' + entryHeadStr + '</div>');
			$entry.append('<ol class="definition">' + sjs.lexicon.renderLexiconEntrySenses(data[i]['content']) + '</ol>');
			$entry.append(sjs.lexicon.renderLexiconAttribution(data[i]));
			$entry.appendTo($contenthtml);
		}
		$contenthtml.appendTo($html);
		return $html;
	},

	renderLexiconEntrySenses: function(content){
		var html = ''
		html += '<li class="sense">';
		if('grammar' in content){
			 html += '('+ content['grammar']['verbal_stem'] + ') '
		}
		if('definition' in content){
			 html += content['definition']
		}
		if('notes' in content){
			html+='<span class="notes">' + content['notes'] + '</span>';
		}
		if('senses' in content){
			html += '<ol class="senses">';
			for(var i= 0; i< content['senses'].length; i++) { //recursion
				html += sjs.lexicon.renderLexiconEntrySenses(content['senses'][i]);
			}
			html += '</ol>'
		}
		html += '</li>';
		return html;
	},

	renderLexiconAttribution: function(entry){
		//console.log(entry);
		var lexicon_dtls = entry['parent_lexicon_details'];
		var sourceLink = '', attributionLink = '';
		if('source_url' in lexicon_dtls){
			var sourceLink = $('<a>',{
				target: "nw",
				text: 'Definitions from: ' + ('source' in lexicon_dtls ? lexicon_dtls['source'] : lexicon_dtls['source_url']),
				href: lexicon_dtls['source_url']
			});
		}else if ('source' in lexicon_dtls){
			var sourceLink = lexicon_dtls['source'];
		}
		if('attribution_url' in lexicon_dtls){
			var attributionLink = $('<a>',{
				target: "nw",
				text: 'Created by: ' + ('attribution' in lexicon_dtls ? lexicon_dtls['attribution'] : lexicon_dtls['attribution_url']),
				href: lexicon_dtls['attribution_url']
			});
		}else if ('attribution' in lexicon_dtls){
			var attributionLink = lexicon_dtls['attribution'];
		}
		return $('<small class="attribution">').append(sourceLink).append('</br>').append(attributionLink);
	},

	//TODO: complete this
	expandMorphCodes: function(code){
		var code_map = {
			"n-m":'Noun m.',
			"n-pr-m": 'Noun, Private m.',
			"v": 'verb',
			"n-f": 'Noun f.',
			"n-pr-loc": 'Noun, Private, location',
			"inj": '',
			"n-pr-f": 'Noun, Private f.',
			"a-m": '',
			"a": '',
			"adv": '',
			"n": '',
			"conj": '',
			"prt": '',
			"n-pr": '',
			"np": '',
			"d": '',
			"prep": '',
			"p":'' ,
			"n-pr-loc n-pr-m": '',
			"n-pr-m n-m": '',
			"n-pr-m n-pr-loc": '',
			"a n-pr-m": '',
			"r": '',
			"n-pr-m a": '',
			"n-m n-pr-m": '',
			"n-pr-m n-pr-f": '',
			"dp": '',
			"n-m-loc":'',
			"n-pr-f n-pr-m":'',
			"a-f":'',
			"n-pr-m n-pr loc":'',
			"n-pr-m n-pr-loc n-m":'',
			"i":'',
			"x":'',
			"pron":'',
			"n-pr-m m-pr-f" :''
		}
	},

	/*makeLexicon : function(e) {
		e.stopPropagation();
		$("#lexiconModal").remove();
		var word = $(this).text();
		var $anchor = $(this);
		$.getJSON("/api/words/" + word, function(data) {
			var html = "<div id='lexiconModal'>";
			if (data.length == 0) {
				html += "<i>?</i>";
				setTimeout(function() {
					$("#lexiconModal").remove();
				}, 400);
			}
			for (var i = 0; i < data.length; i++) {
				var entry = data[i];
				html += "<div class='entry'>" +
						"<div class='word'>" + entry.term + "</div>";
				for (var j = 0; j < entry.senses.length; j++) {
					var sense = entry.senses[j];
					html += "<div class='sense'>" +
						"<div class='definition'><span class='pos'>[" + sense.pos + "]</span> "
							 + sense.definition + "</div>" +
						(sense.source === "CAL Lexicon" ? "<a href='http://www.dukhrana.com/lexicon/Jastrow/page.php?p=" + sense.jastrow_page + "' target='_blank'>" +
							"Jastrow<span class='ui-icon ui-icon-extlink'></span></a>" : "") +
						"</div>";
				}
				html += (sense.source === "CAL Lexicon" ? "<i class='definitionSource'>Definitions courtesry of <a href='http://cal1.cn.huc.edu/browseheaders.php?first3=" + entry.term + "' target='_blank'>" +
							"CAL Project</a></i>" : "" );
				html += "</div>";
			}
			html += "</div>";
			console.log(html);
			$(html).appendTo("body");
			$("#lexiconModal").position({my: "center top", at: "center bottom", of: $anchor})
				.click(function(e){ e.stopPropagation(); });
		});
	},*/
}

/*************************************** end lexicon **********************************************/

sjs.bind = {
	// Beginning to pull all event bindings into one place here
	windowScroll: function() {
		$(window).unbind("scroll.update").bind("scroll.update", updateVisible);
	}, 
	gotoAutocomplete: function() {
		$("input.searchInput").autocomplete({ source: function( request, response ) {
				var matches = $.map( sjs.books, function(tag) {
						if ( tag.toUpperCase().indexOf(request.term.toUpperCase()) === 0 ) {
							return tag;
						}
					});
				response(matches);
			}, 
			focus: function(){} });
	},
	refLinkClick: function (e) {
		var ref =  $(this).attr("data-ref") || $(this).text();
		if (!ref) { return };
		sjs._direction = $(this).parent().attr("id") == "breadcrumbs" ? -1 : 1;
		
		get(parseRef(ref));

		e.stopPropagation();
	}	
}


function get(q) {
	// Get the text represented by the query q
	// by way of pushing to the History API,
	// which in turn calls actuallyGet
	var params   = getUrlVars();
	var paramStr = ""
	for (key in params) {
		if (key === "nav_query") { continue; } // Don't persist this param
		paramStr += "&" + key + "=" + params[key];
	}
	if (paramStr) {
		paramStr = "?" + paramStr.substring(1);
	}
	var versionInfo = sjs.cache.getPreferredTextVersion(q['book']);
	var versionPath = versionInfo ? "/"+versionInfo['lang']+"/"+versionInfo['version'].replace(/ +/g, "_") : '';
	var url    = "/" + makeRef(q) + versionPath + paramStr;
	History.pushState(q, q.ref + " | Sefaria.org", url);
	sjs.track.open(q.ref);
}


function actuallyGet(q) {
	// take an object representing a query
	// get data from api or cache
	// prepare a new screen for the text to live in
	// callback on buildView
	sjs.alert.loading();

	var direction = (sjs._direction === null ? -1 : sjs._direction);
	sjs.depth += direction;
	sjs._direction = null;

	var ref = humanRef(makeRef(q));
	var sliced = false;
	for (var i = 0; i < sjs.thread.length; i++) {
		if (sjs.thread[i] === ref) {
			sjs.thread = sjs.thread.slice(0, i+1);
			sliced = true;
		} 
	}
	
	if (!sliced) sjs.thread.push(ref);
	
	sjs.updateBreadcrumbs();

	sjs.flags.loading = true;

	$("#layoutToggle, #languageToggle, #overlay").hide();
	$("#goto").val("");
	sjs._$sourcesList.hide();
	$(".screen").addClass("goodbye");
	
	
	// Add a new screen for the new text to fill
	var screen = '<div class="screen">' +
						'<div class="basetext english"></div>' +
						'<div class="aboutBar">' +
							'<div class="aboutBarBox">' +
								'<div class="btn aboutText">About Text</div>' +
							'</div>' +
						'</div>' +
						'<div class="commentaryBox">' +
							'<div class="hideCommentary"><div class="hideTab gradient">▸</div></div>' +
							'<div class="commentaryViewPort"></div>'+
							'<div class="sourcesBox">'+
								'<div class="sourcesHeader">' +
									'<span class="btn showSources sourcesCount sidebarMode" data-sidebar="commentary"> Sources</span>' +
									'<span class="btn showNotes sidebarMode" data-sidebar="notes">' +
										'<span class="notesCount"></span> Notes</span>' +
										'<span class="btn sidebarButton">' +
											'<i class="fa fa-bars"></i></span>' +
									'<div class="clear"></div>' +
								'</div>' +	
							'</div>' +
						'</div>' +
						'<div class="sourcesList sidePanel"><div class="sourcesWrapper"></div></div>' +
				'</div>';
	
	$(".screen-container").append(screen);
	
	var $screen = $(".screen").last();
	
	// Copy old basetext classes (display, lang settings) to new basetext
	$screen.find(".basetext").attr("class", $(".goodbye").find(".basetext").attr("class")).removeClass("goodbye");
	$screen.attr("class", $(".goodbye").attr("class")).removeClass("goodbye");

	// Set screens far to the left to allow many backwards transitions
	$screen.css("left", 5000 + (sjs.depth * 100) + "%");
	
	// Give commentary box absolute positioning for duration of animation
	var top = $(window).scrollTop() + ($(window).height() * .09);
	var height = $(window).height() * .91;
	sjs._$commentaryBox.css({"position": "absolute", "top": top + "px", "height": height + "px", "bottom": "auto"})
		.addClass("animating");
	var aTop = $(window).scrollTop() + $(window).height() - 42;
	sjs._$aboutBar.css({"position": "absolute", "top": aTop, "bottom": "auto"})

	// Stored $elements now refer to the new screen
	sjs._$screen             = $screen;
	sjs._$basetext           = $(".basetext").last();
	sjs._$aboutBar           = $(".aboutBar").last();
	sjs._$commentaryBox      = $(".commentaryBox").last();
	sjs._$commentaryViewPort = $(".commentaryViewPort").last();
	sjs._$sourcesBox         = $(".sourcesBox").last();
	sjs._$sourcesWrapper     = $(".sourcesWrapper").last();
	sjs._$sourcesCount       = $(".sourcesCount").last();
	sjs._$sourcesList        = $(".sourcesList").last();
	sjs._$sourcesHeader      = $(".sourcesHeader").last();

	// Temporary CSS for duration of Animation
	sjs._$commentaryBox.css({"position": "absolute", "top": top + "px", "bottom": "auto"})
			.addClass("animating"); 
	sjs._$aboutBar.css({"position": "absolute", "top": aTop})

	// If we're moving across texts, reset the sources filter	
	if (q.book.replace(/_/g, " ") !== sjs.current.book &&
		!(sjs.sourcesFilter in {"Notes": 1, "Sheets": 1, "Layer": 1}) ) {
		sjs.sourcesFilter = "all";
	}

	// If we have a Layer, reset to it
	if (sjs.current.layer_name) {
		sjs.sourcesFilter = "Layer";
	}

	// Build the View from cache or from API
	var ref = makeRef(q);
	sjs.cache.get(ref, buildView);

	$screen = null;
}


function buildView(data) {
	//hack to delete version from url if the requested text version is empty
	var versionInfo;
	if(!'error' in data && 'book' in data){
		versionInfo = sjs.cache.getPreferredTextVersion(data['book']);
	}
	if(versionInfo){
		var version_title_attr = versionInfo['lang'] == 'he' ? 'heVersionTitle' : 'versionTitle';
		//we are comapring the preferred version to what we actually got
		if(versionInfo['version'] != data[version_title_attr]){
			//if there is a mismatch, remove the version from the url with replaceState.
			var q = {book: data['book'],	sections: data['sections'],	toSections: data['toSections'],	ref: data['ref']};
			q['skipHandler'] = true;
			var versionPath = "/"+versionInfo['lang']+"/"+versionInfo['version'].replace(/ +/g, "_");
			var url = window.location.pathname.replace(versionPath, '') + window.location.search;
			History.replaceState(q, data['ref'] + " | Sefaria.org", url);
		}
	}
	// take data returned from api and build it into the DOM
	if (data.error) {
		sjs.alert.message(data.error);
		return;
	}

	if (sjs._direction == 0) { $(".goodbye").hide() }

	var $basetext           = sjs._$basetext;
	var $commentaryBox      = sjs._$commentaryBox;
	var $commentaryViewPort = sjs._$commentaryViewPort;
	var $sourcesWrapper     = sjs._$sourcesWrapper;
	var $sourcesCount       = sjs._$sourcesCount;
	var $sourcesBox         = sjs._$sourcesBox;

	// Clear everything out 
	$("#about").appendTo("body").hide(); // Stash, becasue we use as a template
	$basetext.empty().removeClass("noCommentary versionCompare").hide();
	$("body").removeClass("newText");
	$commentaryBox.removeClass("noCommentary").hide(); 
	$commentaryBox.find(".commentary").remove();
	$("#addVersionHeader, #newVersion, #newIndex, #editButtons").hide();
	$("#viewButtons, #sectionNav, #breadcrumbs").show();
	$("#about").removeClass("empty");
	$(".open").remove();	
	sjs.clearNewText();
	sjs.selected = null;

	sjs.cache.save(data);
	sjs.current = data;
	
	// Set Language based on what's available
	if (data.he.length && data.text.length) {
		$("#languageToggle").show();
	} else if (data.text.length && !data.he.length) {
		$("#languageToggle").hide();
		$("#english").trigger("click");
	} else if (data.he.length && !data.text.length) {
		$("#languageToggle").hide();
		$("#hebrew").trigger("click");
	}
	if (!sjs._$basetext.hasClass("bilingual")) $("#layoutToggle").show();
	
	// Texts that default to paragraph view - Tanakh excluding Psalms and Talmud
	if (!(data.type in {Tanakh:1, Talmud:1}) || data.book in {Psalms:1}) {
		$("#layoutToggle .toggleOption").removeClass("active");
		$("#block").addClass("active");
		sjs._$basetext.addClass("lines");
	}
	
	// Update Text TOC link
	$("#textTocLink").attr("href", "/" + data.indexTitle.replace(/ /g, "_"))
		.html("&laquo; " + data.indexTitle);

	// Build basetext
	var emptyView = "<span class='btn addThis empty'>Add this Text</span>"+
		"<i>No text available.</i>";
	var params = getUrlVars();
	var hideNumbers = (data.categories[0] == "Talmud" && data.categories[1] == "Bavli") ||
						data.categories[0] == "Liturgy" ||
						data.title == "Sefer Mitzvot Gadol";
    hideNumbers  = "showNumbers" in params ? false : hideNumbers;
	var basetext = basetextHtml(data.text, data.he, "", data.alts, data.sectionNames[data.sectionNames.length - 1], hideNumbers);
	if (!basetext) {
		basetext = emptyView;
		$("#about").addClass("empty");
		$("#english").trigger("click");
		$("#viewButtons").hide();
	}
	
	// Make a Fancy Title String
	var sectionsString = "";
    var basetextHeTitle;
    var basetextTitle;

	if (data.title) {
        basetextTitle = data.title;
	} else {
		var sectionNames = [];
		for (var i = 0; i < data.sectionNames.length-1; i++) {
			sectionNames.push(data.sectionNames[i] + " " + data.sections[i]);
		}
		sectionsString = sectionNames.join(" : ");
		basetextTitle = data.book.replace(/_/g, " ") + " " + sectionsString;
	}

	if (data.heTitle) {
        if ($.inArray("Talmud", data.addressTypes) > -1) {
            basetextHeTitle = data.heTitle;
        } else {
            var start = data.sectionNames.length > 1 ? 0 : 1;
            var end = data.sectionNames.length - 1;
            basetextHeTitle = data.heTitle + " " + data.sections.slice(start,end).map(tibetanNumeral).join(", ");
        }

	} else {
        basetextHeTitle = basetextTitle;
	}
	
	// Add the fancy titles to the basetext
	basetext = "<div class='sectionTitle'>" + 
					"<span class='en'>" + basetextTitle + "</span>" +
					"<span class='he" + (basetextTitle === basetextHeTitle ? " enOnly" : "") + "'>" + 
						basetextHeTitle + "</span>" +
				"</div>" +
				"<span class='spacer'></span>" +
				basetext +
				"<div class='clear'></div>"; 

	$("#next, #prev").css("visibility", "visible").show();

	// Build About Panel
	$("#aboutTextTitle").html(data.book);
	$("#aboutTextSections").html(sectionsString);
	$("#aboutVersions").html(aboutHtml());	

	// Don't allow editing a merged text
	if ("sources" in data) {
		$("#about").addClass("enMerged");
	} else {
		$("#about").removeClass("enMerged");
	}
	if ("heSources" in data) {
		$("#about").addClass("heMerged");
	} else {
		$("#about").removeClass("heMerged");
	}
	
	// Don't allow editing a locked text
	if (data.versionStatus === "locked" && !sjs.is_moderator) {
		$("#about").addClass("enLocked");
	} else {
		$("#about").removeClass("enLocked");
	}
	if (data.heVersionStatus === "locked" && !sjs.is_moderator) {
		$("#about").addClass("heLocked");
	} else {
		$("#about").removeClass("heLocked");
	}

	// Prefetch Next and Prev buttons
	if (data.next) {
		sjs.cache.prefetch(data.next);
		$("#next").attr("data-ref", data.next)
			.css("display", "inline-block")
			.removeClass("inactive");
	} else {
		$("#next").addClass("inactive");
	}
	if (data.prev) {
		sjs.cache.prefetch(data.prev);
		$("#prev").attr("data-ref", data.prev)
			.css("display", "inline-block")
			.removeClass("inactive");
	} else {
		$("#prev").addClass("inactive");
	}

	/// Add Basetext to DOM
	$basetext.html(basetext);
	sjs._$verses = $basetext.find(".verse");
	sjs._$commentary = $commentaryBox.find(".commentary");

	if (data.connectionsLoadNeeded) {
		var loadingHtml = "<div class='loadingMessage'>" +
							"<span class='en'>Loading...</span>" +
							"<span class='he'></span>" +
						"</div>";
		$commentaryViewPort.html(loadingHtml);
		$commentaryBox.show();
		sjs.cache.kill(data.sectionRef);
		sjs.cache.get(data.sectionRef, buildCommentary);
	} else {
		buildCommentary(data);
	}
	
	$basetext.show();
	$sourcesBox.show();	
	sjs.bind.windowScroll();
	sjs.flags.loading = false;

	// highlight verse (if indicated)
    var verse_highlighted = false;
	if (data.sections.length === data.textDepth) {
        verse_highlighted = true;
		var first = data.sections[data.sections.length-1];
		var last = data.toSections[data.toSections.length-1];
		lowlightOn(first, last);
	} 
	
	// Scroll horizontally to the new Screen
	var scrollXDur = sjs._direction == 0 ? 1 : 600;
	var scrollYDur = 200; // sjs._direction == 0 ? 1 : 200;

	// Animate horizonatally to new screen	
	$('.screen-container').css('position', 'fixed')
		.animate({left: '-' + (5000 + (sjs.depth * 100)) + "%"}, 
		{duration: scrollXDur, complete: function() {
			$('.goodbye').remove();
			$(this).css('position', 'relative');
			sjs._$commentaryBox.css({"position": "fixed", "bottom": "0", "top": "auto"})
				.removeClass("animating");
			sjs._$aboutBar.css({"position": "fixed", "top": "auto", "bottom": 0});
			sjs._verseHeights = [];
			setScrollMap();

			// Scroll vertically to the highlighted verse if any
            var $highlight;
            if (sjs.current.query_highlight && (!(verse_highlighted))) {
                $highlight = sjs._$basetext.find(".verse").has(".query_highlighted");
            } else {
    			$highlight = sjs._$basetext.find(".verse").not(".lowlight").first();
            }
		 	if ($highlight.length) {
		 		var top = $highlight.position().top - 100;
				$("html, body").animate({scrollTop: top}, scrollYDur)
		 	}
		 	
		 	/*
		 	// Show a contribute prompt on third page
			sjs.flags.evenHaEzerPrompt -= 1;
			if (sjs.flags.evenHaEzerPrompt === 0 && !$.cookie("hide_even_haezer_prompt")) {
				$("#contributePrompt, #overlay").show().position({my: "center center", 
														at: "center center",
														of: $(window)});
				$("#contributePrompt .btn.close").click(function(){
					if ($("#contributePrompt input").prop("checked")) {
						$.cookie("hide_even_haezer_prompt", true);
					}
					$("#contributePrompt, #overlay").hide();
				});

			}
			*/
		}
	});
	// clear loading message
	sjs.alert.clear();

	// Clear DOM references
	$basetext = $commentaryBox = $commentaryViewPort = $sourcesWrapper = $sourcesCount = $sourcesBox = null;

} // ------- END Build View---------------


function basetextHtml(en, he, prefix, alts, sectionName, hideNumbers) {
	var basetext = "";
	en = (en || []).slice(0);
	he = (he || []).slice(0);

	// Pad the shorter array to make stepping through them easier.
	var length = Math.max(en.length, he.length);
	en.pad(length, "");
	he.pad(length, "");

    var highlighted = false;
	var lexicon_enabled ={ 'en' : sjs.lexicon.isLexiconEnabled(sjs.current, 'en', {'url_enabled': 'lexicon' in getUrlVars()}),
							'he' : sjs.lexicon.isLexiconEnabled(sjs.current, 'he', {'url_enabled': 'lexicon' in getUrlVars()})};

    if (sjs.current.new_preferred_version && sjs.current.query_highlight) {
        highlighted = true;
        var highlight_lang = sjs.current.new_preferred_version.lang;
        var highlight_words = sjs.current.query_highlight.split(/[\s+]+/);
        var hreg = RegExp('(\b|[^\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05f4]+)(' + highlight_words.join('|') + ')(\b|[^\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05f4]+)','gi');
        var highlight = function(input) {
            return input.replace(hreg, "$1<span class='query_highlighted'>$2</span>$3");
        }
    }
	// Step through both en and he together
	for (var i = 0; i < Math.max(en.length, he.length); i++) {
        if (en[i] instanceof Array || he[i] instanceof Array) {
            basetext += basetextHtml(en[i], he[i], (i+1) + ".", alts[i], hideNumbers);
            continue;
        }
        if(highlighted) {
            if(highlight_lang == "en" && en[i]) {
                en[i] = highlight(en[i]);
            } else if (highlight_lang == "he" && he[i]) {
                he[i] = highlight(he[i]);
            }
        }
        var enButton = "<div class='btn addThis' data-lang='en' data-num='" + (i+1) +"'>" +
			"Add English for " + sectionName +  " " + (i+1) + "</div>";
		var enText = (lexicon_enabled['en'] ? sjs.lexicon.wrapEngLexiconLookups(sjs.wrapRefLinks(en[i])) : sjs.wrapRefLinks(en[i])) || enButton;
		var enClass = en[i] ? "en" : "en empty";

		var heButton = "<div class='btn addThis' data-lang='he' data-num='"+ (i+1) + "'>" +
			"Add Hebrew for " + sectionName + " " + (i+1) + "</div>";
		var heText =  (lexicon_enabled['he'] ? sjs.lexicon.wrapHebArcLexiconLookups(he[i]) : he[i]) || heButton;
		var heClass = he[i] ? "he" : "he empty";

		var n = prefix + (i+1);
		var verseNum = hideNumbers ? "" : n;

        var alts_html = "";
        if(alts && alts.length > i && alts[i]) {
            alts_html += "<div class='alts_group" + (("whole" in alts[i]) ? " whole":"") +"'>";
            for(var k = 0; k < alts[i]["he"].length; k++) {
                alts_html += "<span class='alt_title he'>" + alts[i]["he"][k] + "</span>";
            }
            for(var k = 0; k < alts[i]["en"].length; k++) {
                alts_html += "<span class='alt_title en'>" + alts[i]["en"][k] + "</span>";
            }
            alts_html += "</div> "
        }

		var verse =
			"<div class='verseNum'> <span class='vnum'>" + verseNum + "</span>" + alts_html + " </div>" +
			'<span class="'+enClass+'">' + enText + "</span>" +
			'<span class="'+heClass+'">' + heText + '</span><div class="clear"></div>';

		basetext +=	'<span class="verse" data-num="'+ (prefix+n).split(".")[0] +'">' + verse + '</span>';

	}
	return basetext;
}

function buildCommentary(data) {
	if (data.sectionRef !== sjs.current.sectionRef) { 
		return; // API call returned after navigating away
	} else {
		sjs.current.commentary            = data.commentary;
		sjs.current.notes                 = data.notes;
		sjs.current.sheets                = data.sheets;
		sjs.current.layer                 = data.layer;
		sjs.current.connectionsLoadNeeded = false;
	}
	if ($("body").hasClass("editMode")) { 
		return; // API call returned after switching modes
	}
	var $commentaryBox      = sjs._$commentaryBox;
	var $commentaryViewPort = sjs._$commentaryViewPort;
	var $sourcesWrapper     = sjs._$sourcesWrapper;
	var $sourcesCount       = sjs._$sourcesCount;
	var $sourcesBox         = sjs._$sourcesBox;

	// Build the sidebar content give current data and filters
	var sidebarContent = (sjs.sourcesFilter === "Notes" ? data.notes :
							sjs.sourcesFilter === "Sheets" ? data.sheets : 
								sjs.sourcesFilter === "Layer" ? data.layer : 
																	data.commentary);
	buildCommentaryContent(sidebarContent);
	$("body").removeClass("noCommentary");
	sjs.filterSources(sjs.sourcesFilter);
	sjs.setSourcesPanel();
	sjs.setSourcesCount();
	data.notes = data.notes || [];
	if (!data.commentary.length && !data.notes.length && !data.sheets.length && sjs.sourcesFilter !== "Layer") {
		var emptyHtml ='<div class="sourcesActions">' + 
							'<br /><div>No Sources or Notes have been added for this text yet.</div><br />' +
							'<span class="btn btn-success addSource"><i class="fa fa-link"></i> Add Source</span> ' +
							'<span class="btn btn-success addNote"><i class="fa fa-comment"></i> Add Note</span>' +
						'</div>' +
						'<div class="btn hideSources"><i class="fa fa-caret-right"></i></div>';
		$sourcesCount.text("0 Sources").show();
		$commentaryBox.show();
		$sourcesWrapper.html(emptyHtml);
	}

	if (data.notes) {
		$sourcesBox.find(".notesCount").html("<i class='fa fa-comment'></i> " + data.notes.length);
	}

	// Add Sheets Panels if we have sheets
	if (data.sheets && data.sheets.length) {
		$(".showSheets").remove();
		$sourcesBox.find(".showNotes").before("<div class='btn showSheets sidebarMode' data-sidebar='sheets'><i class='fa fa-file-text-o'></i> " + data.sheets.length + " Sheets</div>");
	}
	// Add Layer Panels if we have a layer
	if (data.layer_name) {
		$(".showLayer").remove();
		$sourcesBox.find(".showSources").before("<div class='btn showLayer sidebarMode' data-sidebar='layer'><i class='fa fa-comment-o'></i> " + data.layer.length + " Discussion</div>");
		if (sjs.sourcesFilter === "Layer") {
			$(".showLayer").addClass("active");
		}
	}

	// Highligh highlighted commentaries
	if (sjs._$verses && sjs._$verses.hasClass("lowlight")) {
		var first = parseInt(sjs._$verses.not(".lowlight").first().attr("data-num"));
		var last  = parseInt(sjs._$verses.not(".lowlight").last().attr("data-num"));
		lowlightOn(first, last);	
		// Scroll to highlighted commentaries, if any
		updateVisible();
	}
}

function buildCommentaryContent(commentary) {
	// Take a list of commentary objects and build them into the DOM
	commentary = commentary || [];

	var $commentaryBox      = sjs._$commentaryBox;
	var $commentaryViewPort = sjs._$commentaryViewPort;
	var $sourcesWrapper     = sjs._$sourcesWrapper;
	var $sourcesCount       = sjs._$sourcesCount;
	var $sourcesBox         = sjs._$sourcesBox;

	var sources           = {};
	var commentaryObjects = []
	var commentaryHtml    = "";
	var n                 = 0; // number of assiged colors in pallette

	if (commentary.length) {
		$(".noCommentary").removeClass("noCommentary");
	}

	for (var i = 0; i < commentary.length; i++) {
		var c = commentary[i];

		if (c.error) { continue; }
		var type = c.type || "unknown type";

		c.commentator = c.collectiveTitle.en;
		c.heCommentator = c.collectiveTitle.he;

		// Give each Commentator a Color
		if (!(c.commentator in sources)) {
			var color = sjs.palette[n];
			var source = {color: color};
			sources[c.commentator] = source;
			n = (n+1) % sjs.palette.length;
		}
						
		sources[c.commentator].count++;
		
		// Make sure missing fields are treated as empty strings
		if (typeof(c.anchorText) == "undefined") c.anchorText = "";
		if (typeof(c.text) == "undefined") c.text = "";
		if (typeof(c.he) == "undefined") c.he = "";
		if (!c.heCommentator) c.heCommentator = c.commentator;

		// Set special classes based on type, language available, ownership
		var classStr = "";	
		if (type === "note") {
			classStr = "note " + 
				(isHebrew(c.text) ? "heNote" : "enNote") +
				(sjs._uid === c.owner ? " myNote" : "");

		} else if  (type === "sheet") {
			classStr = "sheet";

		} else {
			if (!c.text.length && c.he) classStr = "heOnly";
			if (!c.he.length && c.text) classStr = "enOnly";			
		}

		// Set English / Hebrew Text
		if (type === "sheet") {
			var enText = c.text;
			var heText = enText;
		} else if (type === "note") {
			var enText = c.title ? c.title + " - " + c.text : c.text;
			var heText = enText;
		} else {
			// Truncate the text put into te DOM, full txt available on click
			var enText = c.text;
			var heText = c.he;
			enText = sjs.shortCommentaryText(enText, heText);
			heText = sjs.shortCommentaryText(heText, enText);			
		}

		var commentaryObject         = {};
		commentaryObject.vref        = c.anchorVerse;
		commentaryObject.ref         = c.ref;
		commentaryObject.cnum        = c.commentaryNum;
		commentaryObject.commentator = c.commentator;
		commentaryObject.heOnly      = classStr.indexOf("heOnly") == 0;
		commentaryObject.category    = c.category;
		commentaryObject.type        = type;
		commentaryObject.html = 
			'<span class="commentary ' + classStr + 
			    '" data-vref="' + c.anchorVerse + 
				'" data-id="' + i +
				'" data-category="' + c.category.replace(/ /g, "-") + ' ' + c.commentator.replace(/ /g, "-") +
				'" data-type="' + type +
				'" data-ref="' + (c.ref || "") + '">' + 
				'<span class="commentator' + (c.ref ? ' refLink' : '') + '"' + 
					' style="color:' + sources[c.commentator].color + 
					'" data-ref="'+ (c.ref || "") +'">' + 
						'<span class="en">'	+ c.commentator + 
						    (c.category == "Talmud" ? ' ' + parseRef(c.ref).sections[0] : '') + 
							(c.commentator ? ":" : "") +
						'</span>' +
						'<span class="he' + ("heTitle" in c ? '">' + c.heCommentator : ' enOnly">' + c.heCommentator) +
						    (c.category == "Talmud" ? ' <small>' + parseRef(c.ref).sections[0] + "</small>" : '') + 
							(c.heCommentator ? ":" : "") +
						'</span>' +
				'</span>' + 
				'<span class="anchorText">' + c.anchorText + '</span>' + 
				'<span class="text">' + 
					'<span class="en">' + enText + '</span>' + 
					'<span class="he">' + heText + '</span>' +
				'</span>' + 
			'</span>';

		commentaryObjects.push(commentaryObject);
	} 

	// Sort commentary 
	commentaryObjects.sort(sortCommentary);

	for (var i = 0; i < commentaryObjects.length; i++) {
		commentaryHtml += commentaryObjects[i].html;
	}

	if (commentaryHtml === "" && sjs.sourcesFilter !== "Layer" && sjs.sourcesFilter !== "Sheets" && sjs.sourcesFilter !== "Notes" ) {
		commentaryHtml = "<div class='emptySidebarMessage'>No sources known.</div>";
	}

	if (commentaryHtml === "" && sjs.sourcesFilter === "Sheets") {
		commentaryHtml = "<div class='emptySidebarMessage'>No source sheets for this text.</div>";
	}

	if (commentaryHtml === "" && sjs.sourcesFilter === "Layer") {
		commentaryHtml = "<div class='emptySidebarMessage'>Nothing has been added here yet.</div>";
	}

	if (sjs.sourcesFilter === "Notes") {
		// Special messaging for Notes Panel
		commentaryHtml += "<div class='commentary note noteMessage' data-category='Notes'>" +
								"Your notes are private,<br>unless you choose to publish or share them.<br><br>" +
								"<div class='addNote btn btn-success'><i class='fa fa-comment'></i> Add Note</div>" +
							"</div>";
		$sourcesBox.find(".notesCount").html("<i class='fa fa-comment'></i> " + commentary.length);
	}

	if (sjs.sourcesFilter === "Layer") {
		// Special messaging for Layers Panel
		commentaryHtml += "<div class='layerMessage' data-category='Notes'>" +
								"<div class='addNoteToLayer btn btn-large btn-success'><i class='fa fa-comment'></i> Add to this Discussion</div>" +
							"</div>";;
	}

	// To ensure user can scroll to the bottom on the content
	commentaryHtml += "<div class='commentaryBuffer'></div>";
	$commentaryViewPort.html(commentaryHtml)
						.slimscroll({
								height: "100%", 
								color: "#888",
								position: "left",
								distance: "0px",
							}).show();
	$commentaryBox.show();

	sjs._$commentary = $(".commentary");
	// Clear DOM references
	$commentaryBox = $commentaryViewPort = $sourcesWrapper = $sourcesCount = $sourcesBox = null;      
}


function sortCommentary(a,b) {
	// Sort function for ordering commentary

	// First sort accoring to verse position
	// Use parseInt to look at only the first verse in cases where
	// vref is a string like "2 4 6" denoting multiple verses
	if (parseInt(a.vref) != parseInt(b.vref)) {
		return (parseInt(a.vref) > parseInt(b.vref)) ? 1 : -1;
	}

	// Sort commentaries according to their order
	if (a.cnum != 0 && b.cnum != 0) {
		return (a.cnum > b.cnum) ? 1 : -1;
	}

	// Sort connections on the same source according to the order of the source text
	// e.g, Genesis Rabbah 1:2 before Genesis Rabbah 1:5
	if (a.commentator === b.commentator) {
		if (!isRef(a.ref) || !isRef(b.ref)) { return 0; }
		var aRef = parseRef(a.ref);
		var bRef = parseRef(b.ref);
		var length = Math.max(aRef.sections.length, bRef.sections.length)
		for (var i = 0; i < length; i++) {
			try {
				if (aRef.sections[i] != bRef.sections[i]) {
					return (aRef.sections[i] > bRef.sections[i]) ? 1 : -1;
				}
			} catch (e) {
				return (aRef.sections.length > bRef.sections.length) ? 1 : -1;
			}

		}
		return 0;
	}

	// Put bilingual texts first 
	if ((a.heOnly || b.heOnly) && !(a.heOnly && b.heOnly)) {
		return (a.heOnly ? 1 : -1);
	}

	// Put modern texts at the end
	if ((a.category === "Modern" || b.category === "Modern") && a.category != b.category) {
		return (a.category === "Modern" ? 1 : -1);
	}

	// Put notes at the end
	if ((a.type === "note" || b.type === "note") && a.type != b.type) {
		return (a.type === "note" ? 1 : -1);
	}

	// After these rules are applied, go random
	return Math.random() - 0.5;
}


function sourcesHtml(commentary, selected, selectedEnd) {
	// Return HTML for the sources panel built from counting objects in commentary
	// optionally looking only at the range select-selectedEnd of verses

	if (!selected) { var selected = selectedEnd = 0; }

	var sources = {};
	var types = {};
	var sourceTotal = 0;
	var n = m = 0;

	// Walk through and count all commentary objects given, disregard errors or commentaries
	// outside of selected verse (if any)
	for (var i = 0; i < commentary.length; i++) {
		var c = commentary[i];

		if (c.error || // Ignore errors
			(selected && (c.anchorVerse < selected || c.anchorVerse > selectedEnd)) // Ignore source out of range
		   ) {
			 continue;
		}

		// Add category if we haven't seen it already, give it a color
		if (!(c.category in sources)) {
			var color = sjs.palette[n];
			var source = {
					count: 0, 
					color: color, 
					subs: {}, 
					html: ""
				};
			n = (n+1) % sjs.palette.length;
			sources[c.category] = source;
		}
		sources[c.category].count++;
		// Count subcategories
		if (c.commentator in sources[c.category].subs) {
			sources[c.category].subs[c.commentator]++;
		} else {
			sources[c.category].subs[c.commentator] = 1;
		}
		sourceTotal++;

	}

	// -------------- Build Texts Filter -----------------
	var html = "<div class='textsFilter'><div class='source label active' data-category='all'>" +
				"<div class='cName'><span class='count'>("  + sourceTotal + ")</span> All Texts</div></div>";

	// If the current filter has no sources, include it anyway listed as count 0
	if (sjs.sourcesFilter !== "all" && !(sjs.sourcesFilter in sources)) {
		sources[sjs.sourcesFilter] = { count: 0, color: sjs.palette[n], subs:{}, html: "" }
	}

	// Set HTML for each Category
	for (category in sources) {
		sources[category].html += '<div class="source" data-category="' + category +
			'" style="color:'+ sources[category].color +
			'"><div class="cName"><span class="count">('+ sources[category].count+')</span> '+
			category + "</div>";
		
		// Sort subcategories (texts) by count
		var subsort = [];
		for (sub in sources[category].subs) {
			subsort.push([sub, sources[category].subs[sub]]);
			subsort.sort(function(a, b) {return b[1] - a[1]});
		}		
		for (var i = 0; i < subsort.length; i++) {
			sources[category].html += '<div class="source sub" data-category="' + subsort[i][0] +
			'"><div class="cName"><span class="count">('+ subsort[i][1]+')</span> ' + subsort[i][0]  + "</div></div>";
		}
		sources[category].html += '</div>';
	}

	// Sort sources by count
	var sortable = [];
	for (var source in sources) {
			
			sortable.push([source, sources[source].count, sources[source].html])
	}
	sortable.sort(function(a, b) {return b[1] - a[1]});

	// Add the HTML of each source to html
	for (var i = 0; i < sortable.length; i++) {
		html += sortable[i][2];
	}	
	html += 	'<div class="onlyLanguageBox">' +
					'<div><input type="radio" ' + 
						($("body").hasClass("sidebarAll") ? 'checked="checked" ' : "") + 
						'class="sidebarLanguageOption sidebarAll" name="sidebarLanguage">' +
					'All Sources</div>' +
					'<div><input type="radio" ' + 
						($("body").hasClass("sidebarHebrew") ? 'checked="checked"' : "") + 
						'class="sidebarLanguageOption sidebarHebrew" name="sidebarLanguage">' +
					'Hebrew Only</div>' +
					'<div><input type="radio" ' + 
						($("body").hasClass("sidebarEnglish") ? 'checked="checked"' : "") + 
						'class="sidebarLanguageOption sidebarEnglish" name="sidebarLanguage">' +
					'English Only</div>' +
				'</div>'+
			'</div>';

	html += '<div class="sourcesActions">' + 
				'<span class="btn btn-success addSource"><i class="fa fa-link"></i> Add Source</span> ' +
				'<span class="btn btn-success addNote"><i class="fa fa-comment"></i> Add Note</span>' +
			'</div>' + 
			'<div class="btn hideSources"><i class="fa fa-caret-right"></i></div>';
	
	return html;
}



function aboutHtml(data) {
	// Returns HTML for the About Text panel according to data.
	data = data || sjs.current;

	if (!(data.versionTitle || data.heVersionTitle || data.sources || data.heSources)) { 
		// Check if we've got at least something to work worth. Either a single Hebrew or English 
		// version or a merged Hebrew or English version.
		return "<i><center>No text available.</center></i>"; 
	}

	var enVersion = {
		title: data.versionTitle || "<i>Text Source Unknown</i>",
		source: data.versionSource || "",
		lang: "en",
		status: data.versionStatus,
		license: data.license,
		sources: ("sources" in data ? data.sources : null),
		notes: data.versionNotes,
		digitizedBySefaria: data.digitizedBySefaria
	};

	var heVersion = {
		title: data.heVersionTitle || "<i>Text Source Unknown</i>",
		source: data.heVersionSource || "",
		lang: "he",
		status: data.heVersionStatus,
		license: data.heLicense,
		sources: ("heSources" in data ? data.heSources : null),
		notes: data.heVersionNotes,
		digitizedBySefaria: data.heDigitizedBySefaria
	};

	var licenseLinks = {
		"Public Domain": "http://en.wikipedia.org/wiki/Public_domain",
		"CC0":           "http://creativecommons.org/publicdomain/zero/1.0/",
		"CC-BY":         "http://creativecommons.org/licenses/by/3.0/",
		"CC-BY-SA":      "http://creativecommons.org/licenses/by-sa/3.0/"
	};

	var aboutVersionHtml = function(version) {
		// Returns HTML describing a specific text version
		var html = '';
		if (version.sources && version.sources.unique().length > 1) {
		// This text is merged from multiples sources
			uniqueSources = version.sources.unique();
			html += '<div class="version '+version.lang+'"><span id="mergeMessage">This page includes merged sections from multiple text versions:</span>'
			for (i = 0; i < uniqueSources.length; i++ ) {
				html += '<div class="mergeSource">' +
					'<a href="/' + makeRef(data) + '/'+version.lang+'/' + encodeURI(uniqueSources[i].replace(/ /g, "_")) + '">' + 
					uniqueSources[i] + '</a></div>';
			}
			html += "</div>";
		} else {
		// This is a single version	
			var isSct = (version.title === "Sefaria Community Translation");

			var sourceLink = (version.source.indexOf(".") == -1 || version.source.indexOf(" ") != -1 ? 
				version.source.replace("http://", "") : 
				'<a target="_blank" href="' + version.source + '">' + parseURL(version.source).host + '</a>');
			
			var licenseLink = (version.license === "unknown" ? "" : 
				"<a href='" + licenseLinks[version.license] + "' target='_blank'>" + version.license + "</a>");

			html += '<div class="version ' + version.lang + '">' +
						(isSct ? '<div class="aboutTitle">Original Translation</div>' : 
						'<div class="aboutTitle">' + version.title + '</div>' +
						'<div class="aboutSource">Source: ' + sourceLink +'</div> ⋄ ') +
						(version.license === "unknown" ? "" : '<div class="aboutLicense">License: ' + licenseLink + '</div> ⋄ ') +
						'<div class="credits"></div> ⋄ ' +
						'<a class="historyLink" href="/activity/'+data.sectionRef.replace(/ /g, "_")+'/'+version.lang+'/'+version.title.replace(/ /g, "_")+'">Full history &raquo;</a>' + 
						(version.digitizedBySefaria ? "<div class='digitizedBySefaria'>This text was <a href='/digitized-by-sefaria' target='_blank'>"+Sefaria._("text.verion_block.digitized_by_pecha")+"</a>.</div>" : "" ) +
						(version.notes ? "<div class='versionNotes'>" + version.notes + "</div>" : "" ) +
						(version.status === "locked" ? 
							'<div class="lockedMessage"><div class="fa fa-lock"></div> This text is locked. If you believe this text requires further editing, please let us know <a href="https://github.com/Sefaria/Sefaria-Project/wiki/How-to-Report-a-Mistake" target="_blank">here</a>.</div>' : "") +
						'<div>' +
							(version.status === "locked" ? "" :
								"<div class='editText action btn btn-mini btn-info' data-lang='" + version.lang + "'><i class='fa fa-pencil'></i> Edit</div>") +
							(sjs.is_moderator ?
								(version.status === "locked" ? 
									'<div class="btn btn-mini btn-info lockTextButton unlock ' + version.lang + 'Version"><i class="fa fa-unlock"></i> Unlock</div>' :
									'<div class="btn btn-mini btn-info lockTextButton ' + version.lang + 'Version"><i class="fa fa-lock"></i> Lock</div>' + 
									'<div class="btn btn-mini btn-warning deleteVersionButton ' + version.lang + 'Version"><i class="fa fa-trash-o"></i> Delete</div>'
									)
							: "") +
						'</div>' +
					'</div>';
		}
		return html;
	};

	var html = '<h2><center>About This Text</center></h2>' +  aboutVersionHtml(heVersion) + aboutVersionHtml(enVersion);

	// Build a list of alternate versions
	var versionsHtml = {};
	//var versionsLang = {};
	var mergeSources = [];
	if ("sources" in data) { mergeSources = mergeSources.concat(data.sources); }
	if ("heSources" in data) { mergeSources = mergeSources.concat(data.heSources); }
	data.versions = data.versions || [];
	for (i = 0; i < data.versions.length; i++ ) {
		var v = data.versions[i];
		// Don't include versions used as primary en/he
		if ((v.versionTitle === data.versionTitle && v.language == 'en') || (v.versionTitle === data.heVersionTitle && v.language == 'he')) { continue; }
		if ($.inArray(v.versionTitle, mergeSources) > -1 ) { continue; }
        if(!(v.language in versionsHtml)){
            versionsHtml[v.language] = '';
        }
		versionsHtml[v.language] += '<div class="alternateVersion ' + v.language + '">' +
							'<a href="/' + makeRef(data) + '/' + v.language + '/' + encodeURI(v.versionTitle.replace(/ /g, "_")) + '">' +
							v.versionTitle + '</a></div>';
		//versionsLang[v.language] = true;
	}
	if (Object.keys(versionsHtml).length) {
		var langClass = Object.keys(versionsHtml).join(" ");
		html += '<div id="versionsList" class="'+langClass+'"><i>Other versions of this text:</i>';


        for(var i = 0; i < Object.keys(versionsHtml).length; i++){
			var lang = Object.keys(versionsHtml)[i];
            html += '<div class="alternate-versions ' + lang + '">' + versionsHtml[lang] + '</div>';
        }
        html += '</div>';
    }

	return html;
}


//  -------------------- Update Visible (Verse Count, Commentary) --------------------------

function updateVisible() {
	// Update view based on what text is currently visible in the viewport.
	// Currently, this means scrolling the commentary box to sync with content
	// visible in the baesetext.
	// Don't scroll if...
	if (sjs.flags.loading || // we're still loading a view
			!sjs._$verses || // verses aren't loaded yet
			sjs._$commentaryBox.hasClass("noCommentary") || // there's no commentary
			$(".commentary.expanded").length // commentary is expanded
		) {
		return;
	}

	var $v      = sjs._$verses;
	var $com    = sjs._$commentary.not(".hidden");
	var $w      = $(window);
	var nVerses = $v.length;
	var wTop    = $w.scrollTop() + 40;
	var wBottom = $w.scrollTop() + $w.height();
	
	// Look for first visible 
	for (var i = 0; i < sjs._verseHeights.length; i++) {
		if (sjs._verseHeights[i] > wTop) {
			sjs.visible.first = i + 1;
			break;
		}
	}
	
	// look for last visible
	for (var k=i+1; k < sjs._verseHeights.length; k++) {
		if (sjs._verseHeights[k] > wBottom) {
			sjs.visible.last = k - 1;
			break;
		}
	}
	
	// Scroll commentary...

	// If something is highlighted, scroll commentary to track highlight in basetext
	if ($(".lowlight").length) {
		var $first = $v.not(".lowlight").eq(0);
		var top = ($first.length ? $w.scrollTop() - $first.offset().top + 120 : 0);
		var vref = $first.attr("data-num");
		
		var $firstCom = $com.not(".lowlight").not(".hidden").eq(0);

		if ($firstCom.length) {
			sjs._$commentaryViewPort.clearQueue()
				.scrollTo($firstCom, {duration: 0, offset: top, easing: "easeOutExpo"})				
		}

	} else {				
	// There is nothing highlighted, scroll commentary to match basetext according to ScrollMap
		for (var i = 0; i < sjs._scrollMap.length; i++) {
			if (wTop < sjs._scrollMap[i] && $com.eq(i).length) {
				if (isTouchDevice()) {
					sjs._$commentaryViewPort.clearQueue()
						.scrollTop(sjs._$commentaryViewPort.scrollTop() + $com.eq(i).position().top);
				} else {
					var offset = $(window).scrollTop() - $com.eq(i).offset().top + 120 ;					
					sjs._$commentaryViewPort.clearQueue()
						.scrollTo($com.eq(i), {duration: 600, offset: 0, easing: "easeOutExpo"})
				}
				break;
			}
		}
	}

	sjs.updateUrlParams();

	// Clear DOM references
	$v = $com = $w = $first = $firstCom = null;

}

sjs.setSelected = function(a, b) {
	// Sets sjs.selected to be a ref of the text currently highlighted
	var selected = sjs.current.book + " ";
	for (var i = 0; i < sjs.current.sectionNames.length -1 ; i++) {
		selected += sjs.current.sections[i] + ":";
	}
	selected += (a === b ? a : [a, b].join("-"));
	sjs.selected = selected;
	return selected;
};


// ---------------- Breadcrumbs ------------------

sjs.updateBreadcrumbs = function() {
	if (sjs.thread.length === 1) {
		$("#breadcrumbs").hide();
		return;
	}
	
	var html = "";
	for (var i = sjs.thread.length-2; i > -1; i--) {
		html += "<span class='refLink'><span class='ui-icon ui-icon-triangle-1-w'></span>" + 
			sjs.thread[i].replace(/_/g, " ").replace(".", " ").replace(/\./g, ":") + 
			"</span>";
	}

	$("#breadcrumbs").html(html).show();
};


// -------------- URL Params ------------------------

sjs.updateUrlParams = function() {
	// Set the URL Parameters
	// -- Start with any existing parameters
	// -- Add/set parameters to represent the current state of the interface.

	var params = getUrlVars();
	if ("nav_query" in params) {
		delete params["nav_query"];
	}
	if      ($("body").hasClass("english")) { params["lang"] = "en" }
	else if ($("body").hasClass("hebrew"))  { params["lang"] = "he" }
	else                                    { params["lang"] = "he-en" }

	if (sjs.langMode === "bi") {
		if      (sjs._$basetext.hasClass("heRight")) { params["layout"] = "heRight" }
		else										 { params["layout"] = "heLeft" }		
	} else {
		if      (sjs._$basetext.hasClass("lines"))   { params["layout"] = "lines" }
		else                                         { params["layout"] = "block" }
	}
	
	if (sjs.sourcesFilter !== "all") {
		params["with"] = sjs.sourcesFilter.replace(/ /g, "_");
	} else {
		delete params["with"];
	}
	if      ($("body").hasClass("sidebarHebrew"))  { params["sidebarLang"] = "he" }
	else if ($("body").hasClass("sidebarEnglish")) { params["sidebarLang"] = "en" }	
	else    									   { params["sidebarLang"] = "all" }	

	var base        = sjs.selected ? sjs.selected : sjs.current.sectionRef;
	var versionInfo = sjs.cache.getPreferredTextVersion(sjs.current.book);
	var versionPath = versionInfo ? "/" + versionInfo['lang'] + "/" + versionInfo['version'].replace(/ +/g, "_") : '';
	var paramStr    = $.param(params) ? "/" + normRef(base) + versionPath + "?" + $.param(params) : normRef(base);

	var state = History.getState();
	sjs.flags.localUrlChange = true;
	History.replaceState(state.data, state.title, paramStr);
	sjs.flags.localUrlChange = false;
}


function addSourceSuccess() {
	// Function called when a user types a valid ref while adding a source
	// Requests the text of the ref and offers options to add source, edit texts or add texts
	// depending on the state of the text returned.
	// TODO this code should be replaced by a generic reusable widget

	var ref = $("#addSourceCitation").val();
	if (sjs.ref.index.categories[0] == "Commentary") {
		$("#addSourceType select").val("commentary");
	}
	
	ref = normRef(ref);
	
	$("#addSourceText").text("Checking for text…");
	
	$.getJSON("/api/texts/" + ref + "?commentary=0", function(data) {
		if (data.error) {
			$("#addSourceText").html(data.error);
			return;
		}
		
		sjs.ref.bookData = data;			
		var text = en = he = controlsHtml = "";
		
		if (data.sections.length < data.sectionNames.length) {
			data.sections.push(1);
			data.toSections.push(Math.max(data.text.length, data.he.length));
		}
						
		for (var i = data.sections[data.sections.length-1]-1; i < data.toSections[data.toSections.length-1]; i++) {
		
			if (data.text.length > i) {
				en += (i+1) + ". " + data.text[i] + "<br><br>";	
			}
			if (data.he.length > i) {
				he += (i+1) + ". " + data.he[i] + "<br><br>";	
			}
		}
			
		$("#addSourceEdit").removeClass("inactive");
		
		if (en && !he) {
			$("#addSourceHebrew").removeClass("inactive");
			$("#addSourceEnglish, #addSourceThis").addClass("inactive");
			$("#addSourceTextBox").removeClass("he");
			text = "<span class='en'>" + en + "</span>";

		} else if (!en && he) {
			$("#addSourceEnglish").removeClass("inactive");
			$("#addSourceHebrew, #addSourceThis").addClass("inactive");
			text = "<span class='he'>" + he + "</span>";
			$("#addSourceTextBox").addClass("he");

		} else if (he && en) {
			$("#addSourceHebrew, #addSourceEnglish, #addSourceThis").addClass("inactive");
			$("#addSourceTextBox .btn.he, #addSourceTextBox .btn.en").removeClass("inactive");
			$("#addSourceTextBox").removeClass("he");

			text = "<span class='en'>"+en+"</span>"+"<span class='he'>"+he+"</span>"
		} else if (!en && !he) {
			text = "<i>No text available.</i>"
			$("#addSourceTextBox .btn").addClass("inactive");
			$("#addSourceThis").removeClass("inactive");
		}
		

		$("#addSourceText").html(text);
		$(".open").position({of: $(window)});
		
		i++;
		if (data.type == "Commentary" && i > 1) {
			$("#addSourceSave").addClass("inactive");
			
			$("#addSourceComment").removeClass("inactive")
				.attr("data-offset", i)
				.find(".commentCount").html(i + (i == 2 ? "nd" : i == 3 ? "rd" : "th"));
			
		} else { 
			$("#addSourceComment").addClass("inactive");
		}

		$("#addSourceSave").text("Save Source");
		
	});
	
}

sjs.expandSource = function($source) {
	// Animates the expanded version of a source on the source panel.
	// Also called to shrink a currently expanded source
	var id = parseInt($source.attr("data-id"));
	var c  = sjs.sourcesFilter === "Layer" ? sjs.current.layer[id] : 
				$source.hasClass("note") ? sjs.current.notes[id] : 
										sjs.current.commentary[id];
	
	if (c.type === "note") {
		var enText = c.title ? c.title + " - " + c.text : c.text;
		var heText = enText;
	} else {
		var enText = c.text;
		var heText = c.he
	}

	if ($source.hasClass("expanded")) {
		$source.find(".text .en").html(sjs.shortCommentaryText(enText, heText));
		$source.find(".text .he").html(sjs.shortCommentaryText(heText, enText));
		$source.removeClass("expanded");
		$(".commentary").removeClass("lowlight");
		return false;
	}
	// Add full, wrapped text to DOM	//console.log(enText);
	//console.log(heText);
	//console.log(sjs.longCommentaryText(enText, heText));
	//console.log(wrapRefLinks(sjs.longCommentaryText(enText, heText)));
	$source.find(".text .en").html(sjs.wrapRefLinks(sjs.longCommentaryText(enText, heText)));
	$source.find(".text .he").html(sjs.longCommentaryText(heText, enText));

	// highlight and expand
	$(".commentary").addClass("lowlight").removeClass("expanded");
	$source.removeClass("lowlight").addClass("expanded");

	// prefetch sources
	$source.find(".refLink").each(function() {
		sjs.cache.prefetch($(this).attr("data-ref"));
	});

	// scroll position after CSS Transitions are done
	setTimeout(function(){
		var height = $source.height();
		var boxHeight = sjs._$commentaryBox.height();
		var offset = -Math.max( ((boxHeight - height) / 2) - 40 , 0 );
		sjs._$commentaryViewPort.scrollTo($source, {duration: 400, 
													offset: offset,
													easing: "easeOutExpo",
													onAfter: function() { 
														var top = sjs._$commentaryViewPort.scrollTop();
														sjs._$commentaryViewPort.slimscroll({scroll: top});
														}
													});

	}, 160);


	var ref = $source.attr("data-ref");
	
	var editLink = $source.attr("data-type") == 'note' ? 
					(c.owner == sjs._uid ? "<span class='editLink'>Edit Note</span>" : "") :
					"<span class='editLink'>Edit Connection</span>";
	
	var translateLink = $source.hasClass("heOnly") ? 
						"<span class='translateThis' data-ref='" + ref + "'>Add Translation +</span>" :
						"";
	var openLink = $source.attr("data-type") == 'note' ?
					"" :
					"<span class='refLink' data-ref='" + normRef(ref) + "'>Open " + ref + " &raquo;</span>";

	if (!($source.find(".actions").length)) {
		var actionsHtml = "<div class='actions'>" +
							"<span class='connectionType'>[" + $source.attr("data-type").toProperCase() + "]</span>" +
							editLink +
							translateLink +
							openLink + 
						  "</div>";
		$source.append(actionsHtml);		
	}


};


sjs.shortCommentaryText = function (text, backup) {
	// Create a short version of commentary text for collaspsed display
	// Use backup if text is empty.
	var shortText = text.length > 0 ? text : (backup.length > 0 ? backup : "[no text available]");
	shortText = (isArray(shortText) ? shortText.join(" ") : shortText);
	shortText = shortText.stripHtml();
	shortText = shortText.replace(/(\r|\n)/g, " ");
	shortText = shortText.escapeHtml();
	if (shortText.length > 180) {
		shortText = shortText.substring(0,150)+"...";
	}
	return shortText;
};


sjs.longCommentaryText = function(text, backup) {
	var long = text.length ? text : (backup.length ? backup : "[no text available]");
	long = (isArray(long) ? long.join(" ") : long);

	return long;
};


// ---------- Reviews ---------------

sjs.loadReviews = function () {
	// Calls the server to load both english and hebrew revies as needed
	sjs.reviews.en = null;
	sjs.reviews.he = null;
	if (sjs.current.text.length) { sjs.loadReview("en"); }
	if (sjs.current.he.length)   { sjs.loadReview("he"); }
};


sjs.loadReview = function(lang) {
	// Calls the server to load reviews for 'lang'
	// Updates reviewButtson when complete
	// If lang matches the lang of the current reviews modal, upate reviews modal content as well
	var version = (lang == "en" ? sjs.current.versionTitle : sjs.current.heVersionTitle);
	// If this is a merged text, do nothing. 
	if (!version) { return; }
	var url = sjs.current.sectionRef + "/" + lang + "/" + version;

	$.getJSON("/api/reviews/" + url, function(data) {
		if ("error" in data) {
			sjs.alert.message(data.error);
			return;
		}
		sjs.reviews[data.lang] = data;

		sjs.updateReviewButton(data.lang);
		var currentLang = $("#reviewsModal").attr("data-lang") || sjs.langMode;
		if (data.lang == currentLang) {
			sjs.updateReviewsModal(currentLang);
		}

	});	
};


sjs.updateReviewButton = function(lang) {
	// Set the counts and colors for the reviews buttons for lang
	var data = sjs.reviews[lang];
	if (data) {
		$(".reviewsButton." + lang).remove();
		var classStr = sjs.scoreToClass(data.scoreSinceLastEdit) + " " + lang;
		// Call out unreviewed translations
		if (data.version === "Sefaria Community Translation" && data.scoreSinceLastEdit < 0.3) {
			classStr += " badge-error";
		} 
		var buttonHtml = 
			"<div class='reviewsButton "+ classStr + "'>" +
				data.reviewCount + (data.reviewCount == 1 ? " Review" : " Reviews") + 
			"</div>";
		//if (data.version === "Sefaria Community Translation") {
		//	$(".aboutBarBox").last().append(buttonHtml);
		//}
		$(".version." + lang + " .aboutTitle").append(" " + buttonHtml);
	}
}


sjs.updateReviewsModal = function(lang) {
	// Creates content of reviews modal with stored reviews for lang

	// Don't do anything if called with "bi", let modal stay in its current language
	if (lang === "bi") { return; } 

	var data = sjs.reviews[lang];
	if (!data) {
		var version = (lang == "en" ? sjs.current.versionTitle : sjs.current.heVersionTitle);
		if (!version && $("#reviewsModal").is(":visible")) {
			sjs.alert.message("This text contains merged sections from multiple text versions. To review, please first select an individual version at the bottom of the page.");
		}
		return;
	} 

	// Store which language this modal is about, in case user switches to bilingual mode
	$("#reviewsModal").attr("data-lang", lang);

	// Set Title
	var longLang = {en: "English", he: "Hebrew"}[lang];
	var title = "Reviews of " + data.ref + ",  " + data.version + ", " + longLang;
	$("#reviewTitle").html(title);

	// Set About
	var about = "<span class='score raty' data-raty='" + (data.scoreSinceLastEdit || "0") + "'></span>" +
				"<span class='reviewCount'>(" + data.reviewCount + ")</span>";
	$("#reviewAbout").html(about);

	// Set list of past reviews
	var lastEditDateAdded = false; // if a last edited date has been added to its place chronologically
	var currentReview = null; // the already review made by user since last edit
	if (data.reviews.length) {
		var reviewsHtml = "";
		for (var i = 0; i < data.reviews.length; i++) {
			var review = data.reviews[i];
			if (review.user == sjs._uid && !lastEditDateAdded) {
				currentReview = review;
			}
			if (data.lastEdit > review.date && !lastEditDateAdded) {
				reviewsHtml += "<div class='lastEdit'>This text was last edited " + 
									(data.lastEdit !== null ?
										"on " + $.datepicker.formatDate('mm/dd/yy', new Date(data.lastEdit)) : 
										"before 01/05/2012") + " (review scores are reset from here)" +
								"</div>";
				lastEditDateAdded = true;
			}
			reviewsHtml += "<div class='review'>" + 
									(review.user == sjs._uid ? "<span class='reviewDelete' data-id='" + review._id + "'>delete</span>": "") +
									"<span class='reviewer'>" + review.userLink + "</span>" +
									"<span class='reviewDate'>" + $.datepicker.formatDate('mm/dd/yy', new Date(review.date)) + "</span><br>" +
									"<span class='reviewerScore raty' data-raty='" + review.score + "'></span>" +
									"<span class='reviewText'>" + review.comment.replace(/\n/g, "<br>") + "</span>" +
								"</div>";
		}		
	} else {
		var reviewsHtml = "<div class='noReviews'>This text has not yet been reviewed.</div>";
	}
	if (!lastEditDateAdded) {
		reviewsHtml += "<div class='lastEdit'>This text was last edited " + 
							(data.lastEdit !== null ?
								"on " + $.datepicker.formatDate('mm/dd/yy', new Date(data.lastEdit)) : 
								"before 01/05/2012") + 
						"</div>";
	}
	$("#reviews").html(reviewsHtml);

	// Init all rating stars
	$(".raty").each(function() {
		var score = parseFloat($(this).attr("data-raty")) * 5;
		var settings = $.extend({}, sjs.ratySettings, {score: score, readOnly: true, size: 14});
		$(this).raty(settings);
	});

	// Restore a review in progress, if it exists
	if (sjs.reviews.inProgress[sjs.getReviewKey()]) {
		currentReview = sjs.reviews.inProgress[sjs.getReviewKey()];
	}
	if (currentReview) {
		$("#reviewText").val(currentReview.comment);
		$("#raty").raty($.extend({}, sjs.ratySettings, {score: currentReview.score * 5}));
	} else {
		$("#reviewText").val("");
		$("#raty").raty(sjs.ratySettings);
	}

}


sjs.scoreToClass = function(score) {
	// Returns a CSS class for color coding reviews based on score. 

	//if (!score)      return "badge"; // Grey
	//if (score <= .3)  return "badge badge-error"; // Red 
	if (score <= .3)  return "badge";               // Grey 	
	if (score <= .7)  return "badge badge-warning"; // Yellow
	if (score >= .7)  return "badge badge-success"; // Green
};


sjs.saveReview = function() {
	// Validate form
	if (!$("#reviewText").val()) {
		sjs.alert.message("Please write a review message.");
		return;
	} else if (!$("#raty").raty("score")) {
		sjs.alert.message("Please give a review score.");
		return;
	}

	sjs.storeReviewInProgress();

	var url = sjs.getReviewKey();
	var review = sjs.readReview();
	var postJSON = JSON.stringify(review);
	sjs.alert.saving("Saving...");
	$.post("/api/reviews/" + url, {json: postJSON}, function(data){
		if ("error" in data) {
			sjs.alert.message(data.error)
		} else {
			sjs.alert.message("Review Saved.");
			sjs.loadReview(data.language);
			sjs.track.event("Reviews", "Save Review", "");
		}
	}).fail(function() {
		sjs.alert.message("There was an error saving your review. If the problem persists, try reloading the page.");
	});	
};

sjs.readReview = function() {
	var lang = $("#reviewsModal").attr("data-lang");
	var review = {
		comment: $("#reviewText").val(),
		score: $("#raty").raty("score") / 5,
		ref: sjs.current.sectionRef,
		language: lang,
		version: lang == "en" ? sjs.current.versionTitle : sjs.current.heVersionTitle,
	};
	return review;
};


sjs.deleteReview = function(e) {
	if (confirm("Are you sure you want to delete this review?")) {
		var id = $(this).attr("data-id");
		$.ajax({
			type: "delete",
			url:  "/api/reviews/" + id,
			success: function(data) {
				if ("error" in data) {
					sjs.alert.message(data.error);
				} else {
					sjs.alert.message("Review deleted");
					sjs.loadReviews();
				}
			},
			error: function () {
				sjs.alert.message("There was an error deleting this reivew. Please reload the page and try again.");
			}
		});
	}
};


sjs.storeReviewInProgress = function() {
	// Store the text of a review in progress for a particular ref / lang / version
	// so it can be restored as the user change pages / languages modes.
	var key = sjs.getReviewKey();
	sjs.reviews.inProgress[key] = sjs.readReview();

};

sjs.getReviewKey = function() {
	// Returns the URL path for current ref / lang / verion
	var lang = sjs.langMode;
	if (lang == "bi") {
		lang = $("#reviewsModal").attr("data-lang");
	}
	if (lang == "en") {
		var key = sjs.current.sectionRef + "/en/" + sjs.current.versionTitle;
	} else if (lang == "he") {
		var key = sjs.current.sectionRef + "/he/" + sjs.current.heVersionTitle; 
	}

	return key.replace(/ /g, "_");
}

function buildOpen(editMode) {
	// Build modal for adding or editing a source or note
	// Previously, this same code create modals for viewing full text of a source.
	// if editMode, copy expanded source for editing
	// else, build a modal for adding a new source
	// This code is a mess and shoud be rewritten from scratch. 
	
	$(".open").remove();

	if (editMode) {
		// We're editing an existing source; grab data from expanded source
		var id          = parseInt($(".expanded").attr("data-id"));
		var commentator = $(".expanded").attr("data-ref");
		var enText      = $(".expanded .text .en").text();
		var heText      = $(".expanded .text .he").text();
		var anchorText  = $(".expanded .anchorText").text();
		var source      = $(".expanded").attr("data-source");
		var type        = $(".expanded").attr("data-type");
		var item        = sjs.sourcesFilter === "Layer" ? sjs.current.layer : type === "note" ? sjs.current.notes : null;
		var text        = (item ? item[id].text : "");
		var title       = (item ? item.title : "");
		var publicNote  = (item && item[id].public);

		$("#selectedVerse").text($(".open .openVerseTitle").text());
	}
	
	var ref = sjs.add.source.ref;
	var sections = ref.split(":");
	var v = sections[sections.length - 1];
	
	var html = 	'<div class="open gradient edit'+ (editMode && type === "note" ? " noteMode": "") + '">' +
		'<div id="addSourceType" class="formRow">'+
			'<div class="label">Source Type:</div><select>'+
				'<option value="">Select type...</option>'+
				'<option value="commentary">Commentary</option>'+
				'<option value="quotation">Quotation</option>'+
				'<option value="reference">Reference</option>'+
				'<option value="summary">Summary</option>'+
				'<option value="explication">Explication</option>'+
				'<option value="related">Related Passage</option>'+
				'<option value="midrash">Midrash</option>'+
				'<option value="ein mishpat">Ein Mishpat / Ner Mitsvah</option>'+
				'<option value="mesorat hashas">Mesorat HaShas</option>'+
				'<option value="other">Other...</option>'+
			'</select><input id="otherType" placeholder=""></div>' +
		'<div class="formRow" id="anchorForm"><span class="label">Anchor Words:</span>' +
			'<input placeholder="optional"></div>' +
		'<div id="commentatorForm" class="formRow">'+
			'<div class="label">Citation:</div>' +
			'<input id="addSourceCitation" placeholder="e.g., Rashi, Brachot 32a:4-9, Bereshit Rabbah 3:4"></div>'+
		'<div class="formRow">' +
			'<div id="addSourceTextBox">' +
				'<div id="addSourceTextControls">' +
					"<span class='btn en inactive'>Show Hebrew</span>" +
					"<span class='btn he inactive'>Show English</span>" +
					"<span id='addSourceThis' class='btn inactive'>Add this Text</span>" +
					"<span id='addSourceEdit' class='btn inactive'>Edit Text</span>" +
					"<span id='addSourceEnglish' class='btn inactive'>Add Translation</span>" +
					"<span id='addSourceHebrew' class='btn inactive'>Add Hebrew</span>" +
					"<span id='addSourceComment' class='btn inactive'>Add <span class='commentCount'></span> Comment</span>" +
				'</div>' +
				'<div id="addSourceText">…</div></div></div>' +
		'<div id="addNoteTitleForm" class="formRow">'+
			'<div class="label" placeholder="optional">Note Title:</div>' +
			'<input id="addNoteTitle" value="'+(title || "")+'"></div>'+
		'<div class="formRow">' +
			'<textarea id="addNoteTextarea">'+(text || "")+'</textarea></div>' +
		'<div class="formRow" id="notePrivacyRow">' +
			'<input type="radio" name="notePrivacy" checked="checked"><b>Private</b> - only you can see this note&nbsp;&nbsp;&nbsp;' +
			'<input type="radio" name="notePrivacy" id="publicNote"><b>Public</b> - anyone can see this note</div>' +
		'<div id="addSourceControls">' + 
			'<span id="addSourceSave" class="btn btn-large inactive">Save Source</span>'+
			"<span id='addNoteSave' class='btn btn-large'>Save Note</span>" +
			'<span id="addSourceCancel" class="btn btn-large">Cancel</span></div>' +
		'</div>'
		

	$("body").append(html);
	var $o = $(".open");
	$("#addSourceCitation").val("");

	
	if (editMode) {
		// Populate fields for editing view
		$o.css("direction", "ltr").attr("data-id", id);
		
		$("#addSourceCitation").val(commentator);
		$("#anchorForm input").val(anchorText);
		if (anchorText) { 
			$("#anchorForm input").show();
		}
		$("#addSourceText").html("<span class='en'>"+enText+"</span><span class='he'>"+heText+"</span>");
		$("#sourceForm input").val(source);
		$("#addSourceType select").val(type);
		if (type !== "note") {
			$("#addSourceSave").removeClass("inactive"); 
			if (publicNote) { 
				$("#publicNote").attr("checked", "checked"); 
			}
		}

		// Show appropriate buttons related to this text
		$("#addSourceEdit").removeClass("inactive");
		if (sjs.sourcesFilter === "Layer") {
			var comment = sjs.current.layer[parseInt(id)];
		} else if ($o.hasClass("noteMode")) {
			var comment = sjs.current.notes[parseInt(id)];
		} else {
			var comment = sjs.current.commentary[parseInt(id)];			
		}
		if (comment.text && comment.he) {
			$("#addSourceTextBox .btn.he, #addSourceTextBox .btn.en").removeClass("inactive");
			if (sjs.langMode === "he") {
				$("#addSourceTextBox").addClass("he");
			}
		} else if (comment.text) {
			$("#addSourceHebrew").removeClass("inactive");
		} else if (comment.he) {
			$("#addSourceTextBox").addClass("he");
			$("#addSourceEnglish").removeClass("inactive");
		}
	}

	var title = sjs.add.source ? 
				sjs.add.source.ref : 
				sjs.current.book + " " + sjs.current.sections.slice(0, sjs.current.sectionNames.length-1).join(":") + ":" + v;
	// Get at most 810 characters of the top text
	var enText = $(".verse").eq(v-1).find(".en").text().slice(0,810);
	var heText = $(".verse").eq(v-1).find(".he").text().slice(0,810);
	
	var openVerseHtml = "<div class='openVerse'>" +
							"<span class='en'>" + enText + "</span>" +
							"<span class='he'>" + heText + "</span>" +
						"</div>";

	$o.prepend(openVerseHtml);
	if ($o.hasClass("edit") && !editMode) {
		title = "Add a <span class='sourceTypeWord'><span>Source</span></span> to " + title;
		$("#addSourceCitation").focus();
	}
	var titleHtml = "<div class='openVerseTitle'>" + title + "</div>";
	if (editMode) titleHtml = "<div class='delete'>delete</div>" + titleHtml;
	$o.prepend(titleHtml);


	// Create a wrapper on checkRef() with appropriate parameters for this case
	checkSourceRef = function() {
		$("#addSourceText").html("");
		checkRef($("#addSourceCitation"), $("#addSourceText"), $("#addSourceSave"), 0, addSourceSuccess, false);
	}

	// Pull data from server as Citation is typed
	$("#addSourceCitation").autocomplete({ source: sjs.books, 
												select: checkSourceRef,
												focus: function() {},
												minLength: 2})
							.bind("textchange", function(e) {
								if (sjs.timers.checkSourceRef) clearTimeout(sjs.timers.checkSourceRef);
								sjs.timers.checkSourceRef = setTimeout("checkSourceRef();", 250);
							});

	// Bind functions for modal Buttons 
	$("#addSourceSave").click(handleSaveSource);
	$("#addNoteSave").click(handleSaveNote);
	$("#addSourceType select").change(function() {
		if ($(this).val() === "other") {
			$("#otherType").show();
		} else { 
			$("#otherType").hide();
		}
	});


	// Language toggles for addSourceText
	$("#addSourceTextBox .btn.en").click(function() {
		$("#addSourceTextBox").addClass("he")
	});
	$("#addSourceTextBox .btn.he").click(function() {
		$("#addSourceTextBox").removeClass("he")
	});

	// Add buttons 
	sjs.ref.bookData = null; // reset this - set by addSourceSuccess
	$("#addSourceHebrew, #addSourceEnglish, #addSourceThis, #addSourceComment").click(function() {
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}

		var ref = $("#addSourceCitation").val();
		ref = makeRef(parseRef(ref));
		var that = this;
		if (!sjs.ref.bookData) {
			sjs.alert.saving("Looking up text...");
			$.getJSON("/api/texts/" + ref, function(data){
				sjs.alert.clear();
				sjs.ref.bookData = data;
				$(that).trigger("click");
			})
			return;
		}

		var data = sjs.ref.bookData;

		sjs.editing = clone(data);
		sjs.editing.versionSource = '';
		sjs.editing.versionTitle  = '';

		$.extend(sjs.editing, parseRef(ref));
		$("#overlay").hide();
		
		if (this.id in {"addSourceHebrew":1, "addSourceEnglish": 1}) {
			if (this.id == "addSourceHebrew") {
				sjs.langMode = "en"; // so english will show as compare text
				$("#language").val("he");
				$("#newVersion").css("direction", "ltr");
			} else {
				sjs.langMode = "he";
			}
			sjs.showNewTranslation();

		} else {
			sjs.showNewText();
		}

		if (this.id === "addSourceComment") {
			var n = parseInt($(this).attr("data-offset"));
			sjs.padEditorText(n);
		}
	})

	// Edit the text of a Source
	$("#addSourceEdit").click(function() {
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}
		sjs.alert.saving("Looking up text...");
		var text = $("#addSourceCitation").val().replace(/ /g, "_")
		if ($("#addSourceTextBox").hasClass("he")) {
			sjs.langMode = "he";
		} else {
			sjs.langMode = "en";
		}
		$.getJSON("/api/texts/" + text, sjs.editText)
			.error(function(){ sjs.alert.message("Sorry there was an error.")});
	});


	// Deleting a Source
	$(".open .delete").click(handleDeleteSource);

	$("#anchorForm input").focus(function() {
		$(".openVerse").show().position({my: "left top", at: "left+25 bottom", of: $("#anchorForm input")});
	}).blur(function() {
		$(".openVerse").hide();
	});

	$o.show().position({ my: "center center", at: "center center", of: $(window) }).draggable();
	$("#overlay").show();
	return false;

} // --------- End buildOpen Oy ------



sjs.makePlainText = function(text) {
	// Turn text array into a string, separating segments with \n\n
	// Replace empty strings in text with "..."

	// TODO - This currently removes any single line breaks inside text segments.
	// Line breaks inside segments currently screws things up but should be allowed later. 
	var placeholders = function(line) { return line ? line.replace(/\n/g, " ") : "..."; };
	return text.map(placeholders).join('\n\n');
};


sjs.newText = function(e) {
	// Show the dialog for adding a new text
	// This dialog routes either to add a new text section (if the text is known)
	// or adding a new text index (if the text is unknown)
	if (e) {
		e.preventDefault();
		e.stopPropagation();
	}
	if (!sjs._uid) {
		return sjs.loginPrompt();
	}

	$(".menuOpen").removeClass("menuOpen");
	$("#overlay").show();
	$("#newTextModal").show().position({of: $(window)});

    // This object is instantiated and sets up its own events.
    // It doesn't need to be interacted with from the outside.
    var validator = new Sefaria.util.RefValidator($("#newTextName"), $("#newTextMsg"), $("#newTextOK"), undefined, {disallow_segments: true, allow_new_titles: true});
};

	
sjs.showNewText = function () {
	// Show interface for adding a new text
	// assumes sjs.editing is set with: 
	// * book, sections, toSections -- what is being edited
	// * text - the text being edited or "" if new text
	// * versionTitle, versionSource or "" if new text
	sjs.clearNewText();

	$("body").addClass("editMode");

	$(".modal, #overlay").hide();
	$(".open, .verseControls").remove();
	$("#viewButtons, #prev, #next, #breadcrumbs").hide();
	$("#editButton").show();
	$("body").addClass("newText");
	sjs._$commentaryBox.hide();
	sjs._$basetext.hide();
	$("#addVersionHeader").show();

	$(window).scrollLeft(0).unbind("scroll.update");

	// Title
	var title = sjs.editing.book.replace(/_/g, " ");
	for (var i = 0; i < sjs.editing.sectionNames.length-1; i++) {
		title += " : " + sjs.editing.sectionNames[i] + " " + sjs.editing.sections[i];
	}	
	$("#editTitle").text(title);

	// Compare Text
	if (!("compareText" in sjs.editing)) {
		sjs.editing.compareText = sjs.editing.he;
		sjs.editing.compareLang = "he";
		$(".compareTitle").text(sjs.editing.heVersionTitle);
		$(".compareSource").attr("href", sjs.editing.heVersionSource);
	}
	sjs.makeCompareText();

	// Version Title & Source
	$("#versionSource").val(sjs.editing.versionSource);
	$('#versionTitle').val(sjs.editing.versionTitle);

	// Text Area
	$("#newVersion").unbind()
		.show()
		.autosize();
	sjs.textSync.init($("#newVersion"));
	if (!sjs.editing.versionTitle) {
		$("#newVersion").bind("textchange", checkTextDirection);
	}

	// Language Toggle
	$("#language").val(sjs.langMode)
		.unbind()
		.change(updateTextDirection);
	
	// Special handing of Original Translation // Sefara Community Translation
	sjs.editing.sct = (sjs.current.versionTitle === "Sefaria Community Translation" ? sjs.current.text : null);
	$("#textTypeForm input").unbind().click(function() {
		if ($(this).val() === "copy") { 
		// Click on "Copied Text" Radio
			$("#copiedTextForm").show();
			// When swtiching from an original transltion, clear the text area
			if ($("#addVersionHeader").hasClass("original")) {
				sjs._$newVersion.val("").trigger("keyup");
				$("#copiedTextForm").find("input").val("");
			}
			$("#addVersionHeader").removeClass("original");

		} else {
		// Click on "Original Translation" Radio
			$("#addVersionHeader").addClass("original");
			$("#copiedTextForm").hide();
			// Make sure we check if there's an existing SCT 
			if (sjs.editing.sct === null) {
				sjs._$newVersion.val("Loading...");
				$.getJSON("/api/texts/" + sjs.editing.ref + "/en/Sefaria_Community_Translation/?commentary=0", function(data){
					sjs.editing.sct = data.text;
					if (sjs.editing.pad) {
						for (var i = sjs.editing.sct.length; i < sjs.editing.pad; i++) {
							sjs.editing.sct.push("...");
						}
					}
					$("#originalRadio").trigger("click");
				});
				return;
			} else {
				var text = sjs.makePlainText(sjs.editing.sct);
				sjs._$newVersion.val(text);
				sjs.padEditorText(sjs.editing.pad);
				sjs._$newVersion.trigger("keyup");				
			}

		}
	});

	// Autocomplete version title with existing, autofill source for existing versions
	$.getJSON("/api/texts/versions/" + sjs.editing.indexTitle, function(data) {
		if ("error" in data) { return; }
		var map = {};
		var titles = [];
		for (var i = 0; i < data.length; i++) {
			titles.push(data[i].versionTitle);
			map[data[i].versionTitle] = data[i].versionSource;
		}

		$("#versionTitle").autocomplete({source: titles, select: function(e, ui) {
			$("#versionSource").val(map[ui.item.value]);
		}}); 
	});

	// Set radio buttons for original/copy to appropriate state
	if (sjs.editing.versionTitle in {"Sefaria Community Translation":1, "":1}) {
		$("#originalRadio").trigger("click");
	} else {
		$("#copyRadio").trigger("click");
	}
	
	$("#newVersionBox").show();
	$("#newVersion").focus();
};

	
sjs.clearNewText = function() {
	// Reset everything that might impact sjs.showNewText
	sjs.alert.clear();
	$("#newTextCompare").empty();
	sjs._$newVersion.val("").unbind()
		.css({
				"min-height": "none",
				"direction":  "ltr"
			});
	$("#versionTitle, #versionSource").val("");
	$("#textTypeForm input").unbind();
	$("#newVersionBox").hide();
	$("body").removeClass("editMode");
};	


sjs.showNewTranslation = function() {
	sjs.showNewText();
	sjs.toggleShowOriginal();
}

sjs.editText = function(data) {
	if (!sjs._uid) {
		return sjs.loginPrompt();
	}
	if ((sjs.langMode === 'en' && "sources" in data) || 
		(sjs.langMode === 'he' && "heSources" in data)) {
		sjs.alert.message("You are viewing a page that includes mutliple text versions. To edit, please first select a single version in the About Text panel.");
		return;
	}

	sjs.editing = clone(data);

	if (sjs.langMode === 'en') {
		var pad = data.he ? Math.max(data.he.length - data.text.length, 0) : 0;
	} else if (sjs.langMode === 'he') {
		$("body").addClass("hebrew");
		sjs.editing.versionTitle  = data.heVersionTitle;
		sjs.editing.versionSource = data.heVersionSource;
		sjs.editing.text = data.he;
		var pad = data.text ? Math.max(data.text.length - data.he.length, 0) : 0;
	} else if (sjs.langMode === 'bi') {
		sjs.alert.message("Select a language to edit first with the language toggle in the upper right.");
		return;
	} else {
		console.log("sjs.editText called with unknown value for sjs.langMode");
		return;
	}

	// If we know there are missing pieces of the text (compared to other lang)
	// pad with empty lines.
	for (var i = 0; i < pad; i++) {
		sjs.editing.text.push("");
	}

	sjs.showNewText();

	var text = sjs.makePlainText(sjs.editing.text);
	sjs._$newVersion.val(text).trigger("autosize").trigger('keyup');
	if (sjs.langMode === 'he') {
		$("#newVersion").css("direction", "ltr");
	}
};


sjs.editCurrent = function(e) {
	sjs.editText(sjs.current);
	e.stopPropagation();
};


sjs.addThis = function(e) {
	var lang = $(this).attr("data-lang");
	if (lang) {
		sjs.langMode = lang;
	}
	sjs.editCurrent(e);
	var n = parseInt($(this).attr("data-num"));
	if (n) {
		if (lang !== "he" && (sjs.editing.compareText || sjs.editing.compareText.length)) {
			sjs.toggleShowOriginal();
		}
		sjs._$newVersion.trigger("autosize");
		var $top = lang == "he" ? $(".textSyncNumbers .segmentLabel").eq(n-1) : $(".newTextCompare .verse").eq(n-1);
		// TODO this doesn't seem to be working to scroll english text with a compareText
		if ($top.length) {
			//console.log("Scrolling to " + n);
			//console.log($top);
			var top = $top.position().top - 100;
			$("html, body").animate({scrollTop: top, duation: 200});

		}
	}
}

sjs.padEditorText = function(n) {
	// Insert placeholer lines into the new text box
	// so that there are n total lines
	// Scroll to n.
	if (!n) { return }
	sjs.editing.pad = n;
	var text = sjs._$newVersion.val();
	var lines = text.split(/\n\n+/g);
	text = text ? text += "\n\n" : text;

	// Insert empty text (resulting in placeholders "...") up to selected verse
	for (var i = lines.length; i < n; i++) {
		text += "...\n\n";
	}
	sjs._$newVersion.val(text).trigger("keyup");
	sjs._$newVersion.caret({start: sjs._$newVersion.val().length, end: sjs._$newVersion.val().length});

	var $top = $("#newTextCompare .verse").eq(n-1)
	if ($top) {
		var topPos = $top.position().top - 100;
		$("html, body").animate({scrollTop: topPos, duation: 200});
	}
};


sjs.makeCompareText = function() {
	// Create DOM elements for comparison text while editing (usually, original text)
	// Assumes sjs.editing.compareText and sjs.editing.compareLang
	var compareText = sjs.editing.compareText;
	if (!compareText || !compareText.length) { 
		$("#showOriginal").hide();
		return; 
	}
	$("#showOriginal").show();
	var lang = sjs.editing.compareLang;
	var compareHtml = "";
	for (var i = 0; i < compareText.length; i++) {
		compareHtml += '<span class="verse"><span class="verseNum">' + (i+1) + "</span>" +
			compareText[i] + "</span>";
	}
	$("#newTextCompare").html(compareHtml)
		.removeClass("he en")
		.addClass(lang);
}


sjs.toggleShowOriginal = function(){
	if ($("body").hasClass("newText")) {
		$("body").removeClass("newText");
		sjs._$newVersion.attr("data-sync", "#newTextCompare .verse");
	} else {
		$("body").addClass("newText");
		var sync = sjs._$newVersion.attr("data-sync");
		sjs._$newVersion.attr("data-sync", "");
	}
	sjs._$newVersion.trigger("keyup")
		.trigger("autosize")
		.css("min-height", $("#newTextCompare").height());
};


sjs.translateText = function(data) {
	// Transistion to the UI for adding a translation of the text
	// in data.
	if ("error" in data) {
		sjs.alert.message(data.error);
		return;
	} 
	sjs.editing               = clone(data);
	sjs.editing.versionSource = "";
	sjs.editing.versionTitle  = "";
	sjs.langMode              = 'he';
	if (sjs.editing.sections.length === sjs.editing.textDepth) {
		sjs.editing.pad = sjs.editing.sections[sjs.editing.textDepth-1] - 1;
	}
	sjs.showNewTranslation();
};


function validateText(text) {
	if (text.versionTitle === "" || !text.versionTitle) {
		sjs.alert.message("Please give a version title.");
		return false;
	}
	
	if (text.versionSource === "" ) {
	 	sjs.alert.message("Please indicate where this text was copied from.");
	 	return false;
	}

	if (text.language === "he" && text.versionTitle === "Sefaria Community Translation") {
		sjs.alert.message('"Original Translations" should not be Hebrew. Is this actually a copied text?');
	 	return false;
	}

	return true;
}


function validateSource(source) {
	if (!source || source.refs.length != 2) {
		sjs.alert.message("Didn't receive a source or refs.");
		return false;
	}
	return true; 
}


function handleSaveSource(e) {
	if ($("#addSourceSave").text() == "Add Text") {
		// This is a an unknown text, add an index first
		var title = $("#addSourceCitation").val()
		$("#textTitle").val(title);
		$(".textName").text(title);
		$("#newIndexMsg").show();
		sjs.showNewIndex();
		return;
	}
	
	var source = readSource();
	if (validateSource(source)) {
		sjs.sourcesFilter = 'all';
		saveSourceOrNote(source);
		if ("_id" in source) {
			sjs.track.action("Edit Source");
		} else {
			sjs.track.action("New Source");
		}
	}
	e.stopPropagation();
}


function readSource() {
	// Returns an object representing a new Source based on the state
	// of the form in the DOM.
	var source = {}
	var ref1 = sjs.add.source.ref.replace(/:/g, ".") 
	var ref2 = $("#addSourceCitation").val().replace(/:/g, ".");
	ref2 = makeRef(parseRef(ref2));
	
	source["refs"] = [ref1, ref2];
	
	var id = $(".open").attr("data-id");
	if (id) {
		source["_id"] = sjs.current.commentary[id]._id;
	}

	source["anchorText"] = $("#anchorForm input").val();
	source["type"] = $("#addSourceType select").val();
	if (source["type"] === "other") source["type"] = $("#otherType").val();
			
	return source;
	
}


function handleDeleteSource(e) {
	if (!sjs._uid) {
		return sjs.loginPrompt();
	}		
	if (confirm("Are you sure you want to delete this source?")) {
		var link   = {};
		var $modal = $(this).parents(".open");
		var id     = $modal.attr("data-id");
		var data   = sjs.sourcesFilter == "Layer"? sjs.current.layer : 
						$modal.hasClass("noteMode") ? sjs.current.notes : 
														sjs.current.commentary;
		var com    = data[id];
		var url    = ($(this).parents(".open").hasClass("noteMode") ? "/api/notes/" : "/api/links/") + com["_id"];
		$(".open").remove();
		$.ajax({
			type: "delete",
			url: url,
			success: function() { 
				hardRefresh()
				sjs.alert.message("Source deleted.");
			},
			error: function () {
				sjs.alert.message("something_went_wrong");
			}
		});
	}

}


function validateNote(note) {
	if (!note) {
		sjs.alert.message("Didn't receive a note.");
		return false;
	}
	
	if (!note.title) {
	//	sjs.alert.message("Please give this note a title.");
	//	return false; 
	}
	
	if (!note.text) {
		sjs.alert.message("Please enter a note text.");
		return false; 
	}

	return true; 
}


function handleSaveNote(e) {
	var note = readNote();	
	if (validateNote(note)) {
		if (sjs.sourcesFilter != "Notes" && sjs.sourcesFilter != "Layer") {
			// enter Note mode, so saved note is visible once saved
			sjs.previousFilter = sjs.sourcesFilter;
			sjs.sourcesFilter = "Notes";
		}
		saveSourceOrNote(note);
		if ("_id" in note) {
			sjs.track.action("Edit Note");
		} else {
			sjs.track.action("New Note");
		}
	} 
	e.stopPropagation();
}


function readNote() {
	var note = {
		ref: sjs.add.source.ref.replace(/:/g, "."),
		anchorText: $("#anchorForm input").val(),
		type:  "note",
		title: $("#addNoteTitle").val(),
		text: $("#addNoteTextarea").val(),
		public: $("#publicNote").is(":checked")
	};

	var id = $(".open").attr("data-id");
	if (id) {
		var list = sjs.sourcesFilter === "Notes" ? sjs.current.notes : sjs.current.layer
		note["_id"] = list[id]["_id"];
	}

	return note;
}


function saveSourceOrNote(source) {
	if (source.type == "note") {
		var path = "/api/notes/";
		sjs.alert.saving("Saving Note...");
	} else {
		var path = "/api/links/";
		sjs.alert.saving("Saving Source...");
	}
 	var postJSON = JSON.stringify(source);
	$(".open").remove();
	var url = ("_id" in source ? path + source["_id"] : path);
	var postData = {"json": postJSON};
	if (sjs.selectType === "noteForLayer") {
		postData["layer"] = sjs.current.layer_name;
	}
	$.post(url, postData, function(data) {
		sjs.alert.clear();
		if (data.error) {
			sjs.alert.message(data.error);
		} else if (data) {
			updateSources(data);
		} else {
			sjs.alert.message("Sorry, there was a problem saving your source.");
		}
	}).fail( function(xhr, textStatus, errorThrown) {
        sjs.alert.message("Unfortunately, there was an error saving this source. Please try again or try reloading this page.")
    });
}


sjs.writeNote = function(source) {
	if (!sjs._uid) {
		return sjs.loginPrompt();
	}
	var anchor = sjs.selected ? "Note on " + sjs.selected : "Note on " + sjs.current.sectionRef;
	var editor = "<div id='noteEditor'>" +
					"<div id='noteAnchor'>" + anchor+ "</div>" +
					"<textarea id='noteText'></textarea>" + 
					"<span id='saveNote' class='btn btn-primary'>Save</span>" +
					"<span id='cancelNote' class='btn'>Cancel</span>" +
				"</div>";

	$(".layerMessage").html(editor);
	sjs._$commentaryViewPort.scrollTop(1E10);
	$("#noteEditor").unbind().click(function() { return false; });			
	$("#saveNote").unbind().click(sjs.saveNote);			
	$("#cancelNote").unbind().click(sjs.hideNote);			
	$("#noteText").focus();

	if (sjs.sourcesFilter === "Layer") {
		sjs.selectType = "noteForLayer";
	}

	$(".emptySidebarMessage").remove();
	return false;
};


sjs.hideNote = function() {
	$(".layerMessage").html("<div class='addNoteToLayer btn btn-large btn-success'><i class='fa fa-comment'></i> Add to this Discussion</div>");
};


sjs.saveNote = function() {
	if (!$("#noteText").val()) {
		sjs.alert.message("Your note is empty.");
		return;
	}

	var note = {
		text: $("#noteText").val(),
		ref: sjs.selected || sjs.current.sectionRef,
		anchorText: "",
		type:  "note",
		title: "",
		public: false
	};
	var postData = {
		json: JSON.stringify(note)
	};
	if (sjs.selectType === "noteForLayer") {
		postData["layer"] = sjs.current.layer_name;
	}
	var url = ("_id" in note ? "/api/notes/" + note["_id"] : "/api/notes/");
	$.post(url, postData, function(data) {
		sjs.alert.clear();
		if (data.error) {
			sjs.alert.message(data.error);
		} else if (data) {
			updateSources(data);
		} else {
			sjs.alert.message(Sefaria._("note_save_warning"));
		}
	}).fail( function(xhr, textStatus, errorThrown) {
        sjs.alert.message(Sefaria._("note_save_error_try_again"))
    });
	sjs.hideNote();
};

function updateSources(source) {
	// Take a single source object
	// add it to the DOM or update the existing source
	var list = (sjs.sourcesFilter === "Notes" ? sjs.current.notes : 
					(sjs.sourcesFilter === "Layer" ? sjs.current.layer : 
						sjs.current.commentary));

	var id = -1;
	for (var i = 0; i < list.length; i++) {
		if (list[i]._id === source._id) {
			list[i] = source;
			id = i;
			break;
		}
	}
	if (id == -1) {
		id = list.length;
		list.push(source);
	}
	sjs.cache.save(sjs.current);

	buildCommentaryContent(list);
	sjs._$commentary = $(".commentary");
	$(".noCommentary").removeClass("noCommentary");
	$highlight = sjs._$basetext.find(".verse").not(".lowlight").first();
	if ($highlight.length) {
 		var top = $highlight.position().top - 100;
		$("html, body").animate({scrollTop: top}, 1);
	}
	$(".commentary[data-id='" + id + "']").trigger("click");
	sjs.updateSourcesCount();
}

sjs.updateSourcesCount = function() {
	// Updates the counts in the sources buttons for sidebar content
	var cases = [
					[sjs.current.commentary.length, ".sourcesCount", "<i class='fa fa-link'></i> Sources"],
					[sjs.current.sheets.length,     ".sheetCount",   "<i class='fa fa-file-text-o'></i> Sheets"],
					[sjs.current.notes.length,      ".showNotes",    "<i class='fa fa-comment'></i> Notes"],
				];
	if (sjs.current.layer) {
		cases.push([sjs.current.layer.length, ".showLayer", "<i class='fa fa-comment'></i> Discussion"]);
	}
	for (var i=0; i<cases.length; i++) {
		var c = cases[i];
		var html = c[0] == 0 ? c[2] : c[0] + c[2];
 		$(c[1]).html(html);
	}
};


function checkTextDirection() {
	// Check if the text is (mostly) Hebrew, update text direction
	// and language setting accordingly
	var text = $(this).val();
	if (text === "") { return; }
	
	if (isHebrew(text)) {
		$(this).css("direction", "ltr");
		$("#language").val("he");
		$(this).parent().find(".textSyncNumbers").addClass("hebrew");
	} else {	
		$(this).css("direction", "ltr");
		$("#language").val("en");
		$(this).parent().find(".textSyncNumbers").removeClass("hebrew");
	}
}


function updateTextDirection() {
	// Manually update the text direction when a user 
	// manually changes the language dropdown
	var val = $(this).val();

	if (val === "he") {
		$("#newVersion").css("direction", "ltr");
		$("#language").val("he");
		$(".textSyncNumbers").addClass("hebrew");
	} else if (val === "en") {
		$("#newVersion").css("direction", "ltr");
		$("#language").val("en");
		$(".textSyncNumbers").removeClass("hebrew");
	}
}

function readNewVersion() {
	// Returns on object corresponding to a text segment from the text fields
	// in the DOM.
	// Called "new version" by legacy when a text was referred to as a 'version'.
	var version = {};

	version.postUrl = sjs.editing.book.replace(/ /g, "_");
	for (var i= 0 ; i < sjs.editing.sectionNames.length - 1; i++) {
		version.postUrl += "." + sjs.editing.sections[i];
	}
	
	if ($("#originalRadio").prop("checked")) {
		version["versionTitle"] = "Sefaria Community Translation";
		version["versionSource"] = "https://www.sefaria.org";
	} else {
		version["versionTitle"] = $("#versionTitle").val();
		var source = $("#versionSource").val();
		if (source.indexOf(".") > -1 &&
		    source.indexOf(" ") === -1 && 
		    !source.match(/https?:\/\//)) {
			source = source ? "http://" + source : source;
		} 
		version["versionSource"] = source;
	}

	var text = $("#newVersion").val();
	if (text) {
		var verses = text.split(/\n\n+/g);
	} else {
		// Avoid treating an empty textarea as [""] which is interrpreted as
		// 'a first segment exists, but we don't have it'. This should actually
		// be saved as empty.
		var verses = [];
	}
	for (var i=0; i < verses.length; i++) {
		// Treat "..." as empty placeholder ('this segment exists, but we don't have it')
		verses[i] = (verses[i] === "..." ? "" : verses[i]);
	}

	version["text"] = verses;
	version["language"] = $("#language").val();

	return version;
	
}

	
function saveText(text) {
 	// Posts the object 'text' to save via the texts API.
 	var ref = text.postUrl;
 	delete text["postUrl"];
 	
 	postJSON = JSON.stringify(text);
	
	sjs.alert.saving("Saving text...")
	$.post("/api/texts/" + ref, {json: postJSON}, function(data) {
		if ("error" in data) {
		 	sjs.alert.message(data.error);
		} else {
			sjs.clearNewText();
			var params = getUrlVars();
			if ("after" in params) {
				if (params["after"].indexOf("/sheets") == 0) {
					sjs.alert.messageOnly("Text saved.<br><br><a href='" + params["after"] + "'>Back to your source sheet &raquo;</a>");
				} else {
					window.location = params["after"];
				}
			} else if("next" in params){
				window.location = params["next"];
			} else {
				if (window.location.href.includes("edit/")) {
					window.location = window.location.href.replace("edit/", "");
			    } else if (window.location.href.includes("add/")) {
					window.location = window.location.href.replace("add/", "");
				} else {
					window.location = "/" + sjs.editing.indexTitle;
				}
			}

		}
	}).fail( function(xhr, textStatus, errorThrown) {
        sjs.alert.message("Unfortunately, there was an error saving this text. Please try again or try reloading this page.")
    });
}


function lowlightOn(n, m) {
	// Turn on lowlight, leaving verses n-m highlighted
	lowlightOff();
	m = m || n;
	n = parseInt(n);
	m = parseInt(m);
	sjs.setSelected(n, m);
	$c = $();
	for (var i = n; i <= m; i++ ) {
		$c = $c.add(sjs._$commentaryViewPort.find(".commentary[data-vref~="+ i + "]"));
	}
	sjs._$commentaryViewPort.find(".commentary").addClass("lowlight");
	$c.removeClass("lowlight");
	sjs._$verses.addClass("lowlight" );
	sjs._$verses.each(function() {
		if (n <= parseInt($(this).attr("data-num")) && parseInt($(this).attr("data-num"))  <= m) {
			$(this).removeClass("lowlight");
		}
	});
}


function lowlightOff() {
	// Turn off any lowlight effect
	if ($(".lowlight").length == 0) { return; }
	$(".lowlight").removeClass("lowlight");
	$(".verseControls").remove();
	$("#noteAnchor").html("Note on " + sjs.current.sectionRef);
	if ("commentary" in sjs.current) {
		sjs.setSourcesCount();
		sjs.setSourcesPanel();
	}
	sjs.selected = null;
}


function setVerseHeights() {
	// Store a list of the top height of each verse
	sjs._verseHeights = [];
	if (!sjs._$verses) { return; }
	sjs._$verses.each(function() {
		sjs._verseHeights.push($(this).offset().top);
	})	
}


function setScrollMap() {
	// Maps each commentary to a window scrollTop position, based on top positions of verses.
	// scrollMap[i] is the window scrollTop below which commentary i should be displayed at top.
	if(!sjs._verseHeights.length) { setVerseHeights(); }
	sjs._scrollMap = [];
	var nVerses = sjs._$verses.length;

	// walk through all verses, split its space among its commentaries
	for (var i = 0; i < nVerses; i++) {
		
		// The top of the previous verse assigned:
		var prevTop = (i === 0 ?  0 : sjs._verseHeights[i-1]);
		// The number of commentaries this verse has:
		var nCommentaries = sjs._$commentaryViewPort.find(".commentary[data-vref="+ (i+1) + "]").not(".hidden").length;
		// How much vertical space is available before the next verse
		// Special case the last verse which has no boundary after it
		var space = (i === nVerses-1 ? nCommentaries * 10 : sjs._verseHeights[i] - prevTop);

		// walk through each source this verse has
		for (k = 0; k < nCommentaries; k++) {
			sjs._scrollMap.push(prevTop + (k * (space / nCommentaries)));
		}
	}
	
	return sjs._scrollMap;
}


function hardRefresh(ref) {
	// Fully reset page and rebuild view for ref.
	ref = ref || sjs.current.ref;
	sjs._direction = 0;
	sjs.cache.killAll();
	$(".screen").hide();
	actuallyGet(parseRef(ref));	
}

