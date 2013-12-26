var sjs = sjs || {};

$.extend(sjs,  {
	Init: {},
	bind: {},
	depth: 0,
	thread: [],
	view: {},
	editing: {},
	eventHandlers: {},
	ref: {},
	loading: false,
	visible: {
		first: 1,
		last: 1
	},
	flags: {
		verseSelecting: false,
		saving: false,
		mishnahPrompt: 3
	},
	add: {
		source: null
	},
	timers: {
		hideMenu: null,
		panelPreivew: null,
	},
	palette: ["#5B1094", "#00681C", "#790619", "#CC0060", "#008391", "#001866", "#C88900", "#009486", "#935A10", "#9D2E2C"],
	textFilter: "all",
	typeFilter: "all",
	_direction: 0,
	_verseHeights: [],
	_scrollMap: []
});


//  Initialize everything
sjs.Init.all = function() {
	
	// Init caches of jquery elements
	sjs.Init._$();

	// Bind functions to dom elements
	sjs.Init.handlers();

	sjs.view.width = $(window).width();

	if ("error" in sjs.current) {
		sjs.alert.message(sjs.current.error);
		sjs._$basetext.html("<center>Open another text with the texts menu above</center>")
		sjs._$aboutBar.hide();
		return;
	}

	var mode = sjs.current.mode || "view";
	switch (mode) {
		case "view":
			sjs.Init.loadView();
			break;
		case "add new":
			if (sjs.current.title) {
				$("#textTitle").val(sjs.current.title);
				$(".textName").text(sjs.current.title);
				$("#newIndexMsg").show();
				$("#header").text("Add a New Text");
				sjs.showNewIndex();
			} else {
				sjs.newText();
			}

			break;
		case "add":
			sjs.editing = sjs.current;
			sjs.editing.smallSectionName = sjs.editing.sectionNames[sjs.editing.sectionNames.length-1];
			sjs.editing.bigSectionName = sjs.editing.sectionNames[sjs.editing.sectionNames.length-2];
			sjs.editing.msg = "Add a New Text";
			sjs.showNewText();	
			break;
		case "edit":
			sjs.current.langMode = sjs.current.text.length ? 'en' : 'he';
			sjs.editText(sjs.current);
			break;
		case "translate":
			sjs.translateText(sjs.current);
			break;
	}
};


sjs.Init._$ = function() {
	// ----------- Init Stored Elements ---------------
	sjs._$screen = $(".screen").eq(0);
	sjs._$basetext = $(".basetext").eq(0);
	sjs._$aboutBar = $(".aboutBar").eq(0);
	sjs._$commentaryViewPort = $(".commentaryViewPort").eq(0);
	sjs._$commentaryBox = $(".commentaryBox").eq(0);
	sjs._$sourcesBox = $(".sourcesBox").eq(0);
	sjs._$sourcesCount = $(".sourcesCount").eq(0);
	sjs._$sourcesList = $(".sourcesList").eq(0);
	sjs._$sourcesHeader = $(".sourcesHeader").eq(0);
	sjs._$sourcesWrapper = $(".sourcesWrapper").eq(0);
	sjs._$newVersion = $("#newVersion");
	sjs._$newVersionMirror = $("#newVersionMirror");
};


sjs.Init.loadView = function () {
	sjs.cache.save(sjs.current);
	History.replaceState(parseRef(sjs.current.ref), sjs.current.ref + " | Sefaria.org", null);
	buildView(sjs.current);
	sjs.thread = [sjs.current.ref];
	sjs.track.open(sjs.current.ref);
};


sjs.Init.handlers = function() {

	// ------------- Hide Modals on outside Click -----------
	
	$(window).click(function() {
		$(".boxOpen").removeClass("boxOpen");
		$(".zipOpen").removeClass("zipOpen");
		$(".zipBox").hide();
		$(".navBack").hide();
		$(".navBox").show();
		lowlightOff();
		$(".expanded").removeClass("expanded");
		if (sjs._$sourcesList.is(":visible")) {
			sjs.hideSources();
		} else {
			resetSources();
		}

	});
	
	// ----- Update Cache of window width ------
	$(window).resize(function() {
		sjs.view.width = $(window).width();
	});

	// -------------- Hide Modals on Overlay click ----------
	
	$("#overlay").click(function() {
		if ($(".open").length) {
			$("#overlay").hide();
			$(".open").remove();
		}
	});
	
	
	// ------------- Top Button Handlers -------------

	var currentScrollPositionX = $(document).scrollTop();
	var currentScrollPositionY = $(document).scrollLeft();
	$(document).scroll(function(){
	    currentScrollPositionX = $(this).scrollTop();
	    currentScrollPositionY = $(this).scrollLeft();
	});

	var openBox = function(el, e) {
		clearTimeout(sjs.timers.hideMenu);
		$(".boxOpen").removeClass("boxOpen");
		$(el).addClass("boxOpen")
			.find(".anchoredMenu, .menuConnector").show();
		var $am = $(el).find(".anchoredMenu");
		if ($am.hasClass("center")) {
			$am.position({my: "top", at: "bottom", of: $(el).find(".menuConnector"), collision: "fit"});
		}
		$(el).find("input").focus();
		$(document).scrollTop(currentScrollPositionX);
		$(document).scrollLeft(currentScrollPositionY);
		e.stopPropagation();
		sjs.track.ui("Open #" + el.attr("id"));
	};

	var openBoxWrpr = function (e) {
		openBox($(this), e);
	}

	var closeBox = function(e) {
		var hide = function() {
			$('.boxOpen').find('input').blur();
			$(".boxOpen").removeClass("boxOpen")
				.find(".anchoredMenu, .menuConnector").hide();
		};
		if (isTouchDevice()) {
			hide();
		} else {
			sjs.timers.hideMenu = setTimeout(hide, 300);
		}
	};

	var toggleBox = function (e) {
		el = $(this);
		if (el.hasClass('boxOpen')) { 
			closeBox();
		} else {
			openBox(el, e);
		}
	}
	
	$(document).on('touch', '#open', toggleBox)
				.on('mouseenter', '#open', openBoxWrpr)	
				.on('mouseleave', '#open', closeBox)
				.on('click touch', 'body', closeBox)
				.on("click touch",'#open q', function(e) { e.stopPropagation(); });


	// Hide menus immediately when opening Sefaria menu
	$("#sefaria").click(function() {
		$(".boxOpen").removeClass("boxOpen").find(".anchoredMenu, .menuConnector").hide();
	});


	// ---------------- Sources List ---------------

	// Prevent any click on sourcesList from hiding itself (bound on window)
	$(document).on("click", ".sourcesList", function(e) { e.stopPropagation(); });


	sjs.hideCommentary = function(e) {
		sjs._$basetext.addClass("noCommentary");
		sjs._$commentaryBox.addClass("noCommentary");
		$("body").addClass("noCommentary");
		sjs._$commentaryViewPort.fadeOut();
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
	

	// Commentary filtering by clicking on source category
	$(document).on("click", ".source", function() {
		$(".source").removeClass("active");
		$(this).addClass("active");

		// Reset types filter (two can't currenty interact)
		if (!($(".type.label").hasClass("active"))) {
			$(".type.label").trigger("click");
		}

		if (!($(this).hasClass("sub"))) {
			$(".source .sub").hide();
			$(this).find(".sub").show();	
		}

		var c = $(this).attr("data-category");
		sjs.textFilter = c
		sjs.typeFilter = "all";

		sjs.filterBySource(c);

		return false;
	});


	sjs.filterBySource = function(c) {
		// Filter souce

		// Handle "All"
		if (c === "all") {
			sjs._$commentaryViewPort.find(".commentary").removeClass("hidden");
			sjs._$sourcesCount.text($(".commentary:visible").length + " Sources");
		} else {
		// Hide everything, then show this
			sjs._$commentaryViewPort.find(".commentary").addClass("hidden");
			$(".commentary[data-category*='" + c + "']").removeClass("hidden");
			
			sjs._$sourcesCount.text($(".commentary:visible").length + " Sources (" + c + ")");
		}
		
	};

	// Commentary filtering by clicking on source type
	$(document).on("click", ".type", function() {
		$(".type").removeClass("active");
		$(this).addClass("active");
		 
		// Reset sources filter (two can't currenty interact)
		if (!($(".source.label").hasClass("active"))) {
			$(".source.label").trigger("click");
		}

		var t = $(this).attr("data-type");
		sjs.textFilter = "all";
		sjs.typeFilter = t;

		sjs.filterByType(t);

		return false;
	});
		
	sjs.filterByType = function(t) {
		// Handle "All"
		if (t === "all") {
			sjs._$commentaryViewPort.find(".commentary").removeClass("hidden");
			sjs._$sourcesCount.text($(".commentary:visible").length + " Sources");
		} else {
		// Hide everything, then show this
			sjs._$commentaryViewPort.find(".commentary").addClass("hidden");
			$(".commentary[data-type*='" + t + "']").removeClass("hidden");
			sjs._$sourcesCount.text($(".commentary:visible").length + " Sources (" + t.toProperCase() + ")");
		}
	};


	

	// --------- Open Side Panels (About & Sources) with Mouse Movements --------

	// Preview state for Panels
	var mousePanels = function(e) {
		if (!sjs._$basetext.is(":visible") || e.clientY < 40) { return; }

		var width = sjs.view.width;
		var out = Math.max(width/4.5, 200);

		if (e.clientX < 40 && !$("#about").hasClass("opened")) {
			sjs.timers.previewPanel = setTimeout('$("#about").addClass("opened");', 100);
		} else if (width - e.clientX < 40 && !sjs._$sourcesList.hasClass("opened")) {
			sjs.timers.previewPanel = setTimeout('sjs._$sourcesList.addClass("opened");', 100);
		} 
	}
	$(window).mousemove(mousePanels);


	// About Panel
	sjs.showAbout = function() {
		$("#about").addClass("opened");
		sjs.loadAboutHistory();
		clearTimeout(sjs.timers.previewPanel);
		sjs.track.ui("Show About Panel")
	};
	sjs.hideAbout = function() {
		sjs.timers.hidePanel = setTimeout(function(){
			$("#about").removeClass("opened");
		}, 100);
	};
	sjs.toggleAbout = function() {
		if ($("#about").hasClass("opened")) {
			sjs.hideAbout();
		} else {
			sjs.showAbout();
		}
	}
	$(document).on("mouseenter", "#about", sjs.showAbout);
	$(document).on("mouseleave", "#about", sjs.hideAbout);
	$(document).on("click touch", '.aboutText', sjs.toggleAbout);

	// Sources Panel
	sjs.showSources = function(e) {
		if (sjs._$commentaryBox.hasClass("noCommentary") && sjs.current.commentary.length) {		  
	  		sjs._$basetext.removeClass("noCommentary");
			sjs._$commentaryBox.removeClass("noCommentary");
			$("body").removeClass("noCommentary");
			sjs._$commentaryViewPort.fadeIn();
			$(".hideCommentary").show();
		} else {
			sjs._$sourcesList.addClass("opened")
			clearTimeout(sjs.timers.previewPanel);
			sjs.track.ui("Show Source Filters")
		}
		if (e) { e.stopPropagation(); }
	};
	sjs.hideSources = function(e) {
		sjs.timers.hidePanel = setTimeout(function(){
			sjs._$sourcesList.removeClass("opened");
		}, 100);
	};
	$(document).on("mouseenter", ".sourcesList", sjs.showSources);
	$(document).on("mouseleave", ".sourcesList", sjs.hideSources);
	$(document).on("click touch", ".showSources", sjs.showSources);

	$(document).on("mouseleave", window, function() {
		clearTimeout(sjs.timers.hidePanel);
	});


	// --------------- About Panel ------------------



	sjs.loadAboutHistory = function() {
		// Load text attribution list only when #about is opened
		for (var lang in { "en": 1, "he": 1 }) {
			if (!lang) { continue; }
			if (!$(this).find("."+lang+" .credits").children().length) {
				var version = (lang === "en" ? sjs.current.versionTitle : sjs.current.heVersionTitle);
				if (!version) { continue; }
				var url = "/api/history/" + sjs.current.ref.replace(" ", "_") + "/" +
											lang + "/" +
											version.replace(" ", "_");
				
				var getLink = function(obj) { return obj["link"] };
				var setCredits = function(data, lang) {
					var html =  (data["translators"].length ? "<div class='credit'>Translated by " + data["translators"].map(getLink).join(", ") + "</div>" : "") +
								(data["copiers"].length ? "<div class='credit'>Copied by " + data["copiers"].map(getLink).join(", ") + "</div>" : "") +
								(data["editors"].length ? "<div class='credit'>Edited by " + data["editors"].map(getLink).join(", ") + "</div>" : "");
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
	
	$(document).on("click", ".refLink", sjs.eventHandlers.refLinkClick);


	// ------------- Next Link Url -----------------
		
		var event = isTouchDevice() ? 'touchstart' : 'click';
		$("#next, #prev").on(event, function() {
			if (this.id == "prev") 
				sjs._direction = -1;
			else
				sjs._direction = 1;
				
			var ref = $(this).attr("data-ref");
			if (ref) {
				get(parseRef(ref));
				sjs.track.ui("Nav Button #" + this.id);
			}

		});
	
	
	// ---------------- Layout Options ------------------
		
		// TODO -- Abstract these 6 blocks
		
		$("#block").click(function(){
			$("#layoutToggle .toggleOption").removeClass("active");
			$(this).addClass("active");
			sjs._$basetext.addClass("lines");
			setVerseHeights();
			updateVisible();
		});
		
		$("#inline").click(function(){
			$("#layoutToggle .toggleOption").removeClass("active");
			$(this).addClass("active");
			sjs._$basetext.removeClass("lines");
			setVerseHeights();
			updateVisible();
		});
	
	// ------------------ Language Options ---------------
	
		$("#hebrew").click(function(){
			sjs.current.langMode = 'he';
			$("#languageToggle .toggleOption").removeClass("active");
			$(this).addClass("active");
			sjs._$basetext.removeClass("english bilingual heLeft")
				.addClass("hebrew");
			$("body").removeClass("english bilingual").addClass("hebrew");
			$("#layoutToggle").show();
			$("#biLayoutToggle").hide();
			setVerseHeights();
			updateVisible();
	
			return false;
		});
		
		$("#english").click(function(){
			sjs.current.langMode = 'en';
			$("#languageToggle .toggleOption").removeClass("active");
			$(this).addClass("active");
			sjs._$basetext.removeClass("hebrew bilingual heLeft")
				.addClass("english");
			$("body").removeClass("hebrew bilingual").addClass("english");
			$("#layoutToggle").show();
			$("#biLayoutToggle").hide();
			setVerseHeights();
			updateVisible();
	
			return false;
	
		});
		
		$("#bilingual").click(function() {
			sjs.current.langMode = 'bi';
			$("#languageToggle .toggleOption").removeClass("active");
			$(this).addClass("active");
			sjs._$basetext.removeClass("english hebrew")
				.addClass("bilingual heLeft");
			$("body").removeClass("hebrew english").addClass("bilingual");
			$("#layoutToggle").hide();
			$("#biLayoutToggle").show();
			setVerseHeights();
			updateVisible();
	
			return false;
	
		});
		
		$("#heLeft").click(function() {
			$("#biLayoutToggle .toggleOption").removeClass("active")
			$(this).addClass("active")
			sjs._$basetext.removeClass("english hebrew")
				.addClass("bilingual heLeft");
			setVerseHeights();	
			updateVisible();
	
			return false;
		});
	
		$("#enLeft").click(function() {
			$("#biLayoutToggle .toggleOption").removeClass("active");
			$(this).addClass("active");
			sjs._$basetext.removeClass("english hebrew heLeft")
				.addClass("bilingual");
			setVerseHeights();
			updateVisible();
	
			return false;
		});


};

// -------------- DOM Ready ------------------------	
$(function() {
	sjs.Init.all();

	// TODO pull much of the code below into sjs.Init
	
	// ----- History ------

	$(window).bind("statechange", function(e) {
		var State = History.getState();
		actuallyGet(State.data);
	})


	// ------------iPad Fixes ---------------------
		
	if (isTouchDevice()) {
		$(window).bind('touchmove', updateVisible);
	}

	// -------------- Edit Text -------------------
		

	$("#editText").click(sjs.editCurrent);
	$(document).on("click", ".addThis", sjs.addThis);


	// ---------------- Edit Text Info ----------------------------

	$("#editTextInfo").click(function() {
		sjs.editing.title = sjs.current.book;
		sjs.editTextInfo();
	});


// ------------- New Text --------------------------

	$("#addText").click(sjs.newText);


	$("#showOriginal").click(function(){
		$("body").toggleClass("newText");
		$("#newVersion").trigger("keyup");
		sjs._$newVersion.css("min-height", $("#newTextCompare").height()).trigger("autosize");

	});


	$("#newTextCancel").click(function() {
		$("#overlay").hide();
		$("#newTextMsg").text("Text or commentator name:");
		$("#newTextName").val("");
		$("#newTextModal").hide();
	});
	

	$("#newTextOK").click(function(){
		if (!sjs.editing.index) {
			// This is an unknown text
			var title = $("#newTextName").val()
			$("#textTitle").val(title);
			$(".textName").text(title);
			$("#newIndexMsg").show();
			$("#header").text("Add a New Text");
			sjs.showNewIndex();
		} else {
			// this is a known text
			$.extend(sjs.editing, parseRef($("#newTextName").val()));
			sjs.editing.sectionNames = sjs.editing.index.sectionNames;		
			sjs.editing.smallSectionName = sjs.editing.sectionNames[sjs.editing.sectionNames.length-1];
			sjs.editing.bigSectionName = sjs.editing.sectionNames[sjs.editing.sectionNames.length-2];
			sjs.editing.msg = "Add a New Text";
			sjs.editing.text = [""];
			sjs.showNewText();	
		}
		$("#newTextCancel").trigger("click");	
	});
	
// ------------------- New Index -------------------	
	
	$("#newIndexSave").click(function() {
		var index = sjs.readNewIndex();
		if (sjs.validateIndex(index)) 
			sjs.saveNewIndex(index);
	});
	

	$("#newIndexCancel").click(function() {
		var params = getUrlVars();
		if ("after" in params) {
			window.location = params["after"];
		} else {		
			sjs.clearNewIndex();
			$("#newIndex").hide();
			sjs._direction = 0;
			buildView(sjs.current);
		}
	})

	$("#textTitleVariants").tagit({
		allowSpaces: true
	});
	
// --------------- Add Version  ------------------
	
	$("#addVersion").click(function(e) {
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}

		// Edit the SCT if it exists rather than offering a box to write a new one
		// to avoid unintentionally overwriting 
		if (sjs.current.versionTitle === "Sefaria Community Translation") {
			$("#english").trigger("click");
			sjs.editText(sjs.current);
			$("#showOriginal").trigger("click");
			sjs._$newVersion.css("min-height", $("#newTextCompare").height()).show().focus().autosize()

		} else {
			if (sjs._$basetext.hasClass("bilingual")) {
				$("#hebrew").trigger("click");
			}
			sjs.editing = sjs.current;
			sjs.showNewVersion()
		}
		e.stopPropagation();
	});
	
	$("#addVersionCancel").click(function() { 
		var params = getUrlVars();
		if ("after" in params) {
			window.location = params["after"];
		} else {
			sjs.clearNewVersion()
		}
	});
	
	$("#addVersionSave").click(function() {
		var version = readNewVersion();
		if (validateText(version)) {
			saveText(version);
		}
	})


	// --------------------- Commentary Expansion ---------------

		$(document).on("click", ".commentary", function(e){
			if ($(this).hasClass("lowlight")) {
				lowlightOff();
			}
			sjs.expandSource($(e.currentTarget))
			return false;
		});
	

	// ----------------------- Commentary Edit --------------------
	
		$(document).on("click", ".editLink", function () {
			if (!sjs._uid) {
				return sjs.loginPrompt();
			}
			var $o = $(this).parents(".expanded");
			var source = {};
			
			source["id"] = parseInt($o.attr("data-id"));
			source["ref"] =  sjs.current.commentary[source["id"]].anchorRef
			sjs.add.source = source;
			
			buildOpen(false, true);
		})

		

	
	// -------------------- Open Text Scrolling --------------------
	
		$(document).on("click", ".openScrollCtl .up", function(e) {
			$b = $(".openBottom");
			var h = $b.height();
			var lh = parseInt($b.css("line-height"));
			h -= h % lh;
			$b.scrollTo("-=" + h + "px", 600, {easing: "easeOutExpo"});
			return false;
		});
		$(document).on("click", ".openScrollCtl .down", function(e){
			$b = $(".openBottom");
			var h = $b.height();
			var lh = parseInt($b.css("line-height"));
			h -= h % lh;
			$b.scrollTo("+=" + h + "px", 600, {easing: "easeOutExpo"});
			return false;
		});
	
	
	// ----------------------- Translate Links --------------------
	
		$(document).on("click", ".translateThis", function () {
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

		});

	
	// -------------- Highlight Commentary on Verse Click -------------- 
	
	$(document).on("mouseenter", ".verse, .commentary", hoverHighlight );

	function hoverHighlight(e) {
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
	}
	$(document).on("mouseleave", ".verse, .commentary", hoverHighlightOff );

	function hoverHighlightOff(e) {
		$(".highlight").removeClass("highlight");
	}

	$(document).on("click", ".verse", handleVerseClick );
	
	function handleVerseClick(e) {
		if(sjs.editing.text){return false;} //if we're editing a text, clicking on a verse span should do nothing
		if (sjs._$verses.filter(".lowlight").length) {
			// Is something already selected?
			$highlight = sjs._$verses.not(".lowlight");
			if ($highlight.is($(this)) && $highlight.length == 1) {
				// Did the click just happen on the only selected line?
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

		lowlightOn(v[0], v[1])

		var selected = sjs.current.book + " ";
		for (var i = 0; i < sjs.current.sectionNames.length -1 ; i++) {
			selected += sjs.current.sections[i] + ":";
		}
		selected  += (v[0] === v[1] ? v[0] : v.join("-"));
		sjs.selected = selected;
		sjs.selected_verses = v;

		if (sjs.flags.verseSelecting) {			
			// Selecting a verse for add source
			sjs.add.source = {ref: selected};
			$("#selectedVerse").text(selected);
			$("#selectConfirm").show();
			$("#selectInstructions").hide();
		} else if (!isTouchDevice()) {
			// Add verseControls
			var offset = $(this).offset();
			var left = sjs._$basetext.offset().left + sjs._$basetext.outerWidth();
			var top = offset.top;
			var verseControls = '<div class="verseControls btn" ' +
				'style="left:'+ left +'px;top:'+top+'px">+' +
				'<div class="verseControlsList">' +
					'<span class="addSource">Add Source</span>' + 
					'<span class="addNote">Add Note</span>' + 
					'<span class="addToSheet">Add to Sourcesheet</span>' +
					'<span class="copyToClipboard">Copy to Clipboard</span>' + 
					'<span class="editVerse">Edit Text</span>' +
					'<span class="translateVerse">Add Translation</span>' +
				'</div>' +
				'</div>';
			$("body").append(verseControls);
			$(".verseControls").click(function(e){ return false; });
			$(".verseControls span").click(function() { $(".verseControls").remove(); });
			$(".verseControls .addSource").click(addToSelected);
			$(".verseControls .addNote").click(addNoteToSelected);
			$(".verseControls .addToSheet").click(addSelectedToSheet);
			$(".verseControls .copyToClipboard").click(copySelected);
			$(".verseControls .editVerse").click(editSelected);
			$(".verseControls .translateVerse").click(translateSelected);
			

		}
	
		// Scroll commentary view port
		var $comments = $();
		for (var i = v[0]; i <= v[1]; i++ ) {
			$more = sjs._$commentaryBox.find(".commentary[data-vref=" + i + "]");
			$comments = $comments.add($more);
		} 

		var $fc = $comments.eq(0);
		if ($fc.length == 1) {	
			var top = $(window).scrollTop() - $(this).offset().top + 120 ;					
			sjs._$commentaryViewPort.clearQueue().scrollTo($fc, {duration: 600, offset: top, easing: "easeOutExpo"})
		
		}
		sjs._$sourcesCount.text($comments.length + " Sources");
		sjs._$sourcesWrapper.html(sourcesHtml(sjs.current.commentary, v[0], v[1]));
		setFilters();
		return false;
	}

	function addToSelected() {
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}
		$("#overlay").show();
		sjs.flags.verseSelecting = false;
		sjs.add.source = {ref: sjs.selected};
		buildOpen();

		return false;
	}

	function addNoteToSelected() {
		if (!sjs._uid) { return sjs.loginPrompt(); }

		addToSelected();
		$("#addSourceType select").val("note").trigger("change");
		$(".open").position({of: $(window)});
	}


	function copySelected(e) {
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
		if (!sjs._uid) { return sjs.loginPrompt(); }

		sjs.editCurrent(e);

		var n = sjs.selected_verses[0];
		var top = $("#newTextNumbers .verse").eq(n-1).position().top - 100;
		$("html, body").animate({scrollTop: top, duation: 200});
	}
	
	function translateSelected(e){
		if (!sjs._uid) { return sjs.loginPrompt(); }

		sjs.translateText(sjs.current);

		var n = sjs.selected_verses[0];
		if (sjs._$newVersion.val() === "") {
			// Insert empty text (resulting in placeholders "...") up to selectd verse
			var text = "";
			for (var i = 0; i < n-1; i++) {
				text += "...\n\n";
			}
			sjs._$newVersion.val(text).trigger("keyup");
		}

		var top = $("#newTextCompare .verse").eq(n-1).position().top - 100;
		$("html, body").animate({scrollTop: top, duation: 200});
		
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
				for (i = 0; i < data.sheets.length; i++) {
					sheets += '<li class="sheet" data-id="'+data.sheets[i].id+'">'+
						data.sheets[i].title + "</li>";
				}
				sheets += '<li class="sheet new"><i>Start a New Source Sheet</i></li>'
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
			sjs.alert.message("Please select a source sheet.");
			return false;
		}

		if (selected.hasClass("new")) {
			var title = prompt("New Source Sheet Name:", "");
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
			sjs.flags.saving = false;
			$("#addToSheetModal").hide();
			if ("error" in data) {
				sjs.alert.message(data.error);
			} else {
				sjs.alert.message(selectedRef + ' was added to "'+title+'".<br><br><a target="_blank" href="/sheets/'+data.id+'">View sheet.</a>');
			}
		}

	});



	// --------------- Add Source ------------------------
	
	$(document).on("click", ".addSource", function(){
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}
		sjs._$commentaryBox.hide();
		sjs._$sourcesList.removeClass("opened");
		$(".smallSectionName").text(sjs.current.sectionNames[sjs.current.sectionNames.length-1]);
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
	});
	$(document).on("click", "#addSourceCancel", function() {
		$(".open").remove();
		$("#overlay") .hide();
		sjs.ref.tests = null;
		
	});
	
	$("#addModal").click(function() {
		return false;
	});
	
	// --------------- Verse Select ----------------
	
	$("#selectVerse").click(function() {
		$("#addModal, #overlay").hide();
		sjs._$commentaryBox.hide();
		sjs._$sourcesBox.hide();
		$("#verseSelectModal").show();
		sjs.flags.verseSelecting = true;
		
	});
	
	$("#verseSelectModal #selectOk").click(function() {
		$("#overlay").show();
		buildOpen();
		sjs._$commentaryBox.show();
		sjs._$sourcesBox.show();
		$("#verseSelectModal").hide();
		lowlightOff();
		sjs.flags.verseSelecting = false;
		return false;
		
	});
	
	$("#selectReset").click(function() {
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
		q = parseRef(query);
		if ($.inArray(q.book.replace(/_/g, " "), sjs.books) > 0) {
			sjs._direction = 1;
			get(q);
			sjs.track.ui("Nav Query");
		} else {
			window.location = "/search?q=" + query;
		}
	}

	$("#goto").unbind("keypress").keypress(function(e) {
		var query = $("#goto").val();
		if (e.keyCode == 13 && query) {
			navQueryOrSearch(query)
			$(this).blur();
		}
	});
	$("#openText").unbind("mousedown").mousedown(function(){
		var query = $("#goto").val();
		if (query) {
			navQueryOrSearch(query)
			$(this).blur();
		}
	});
		
				
}); // ---------------- End DOM Ready --------------------------



sjs.bind = {
	// Beginning to pull all event bindings into one place here
	windowScroll: function() {
		$(window).unbind("scroll.update");
		$(window).bind("scroll.update", updateVisible);
	}, 
	gotoAutocomplete: function() {
		$("input#goto").autocomplete({ source: function( request, response ) {
				var matches = $.map( sjs.books, function(tag) {
						if ( tag.toUpperCase().indexOf(request.term.toUpperCase()) === 0 ) {
							return tag;
						}
					});
				response(matches);
			}, 
			focus: function(){} });
	}
}

function get(q) {
	// Get the text represented by the query q
	// by way of pushing to the History API,
	// which in turn calls actuallyGet
	History.pushState(q, q.ref + " | Sefaria.org", "/" + makeRef(q));
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

	sjs.loading = true;
	$("#header").html(q.book.replace(/_/g, " ") + "...");

	$("#open, .boxOpen").removeClass("boxOpen");	
	$("#layoutToggle, #languageToggle, #overlay").hide();
	$("#goto").val("");
	sjs._$sourcesList.hide();
	$(".screen").addClass("goodbye");
	
	
	// Add a new screen for the new text to fill
	var screen = '<div class="screen">' +
						'<div class="basetext english"></div>' +
						'<div class="aboutBar gradient">' +
							'<div class="aboutBarBox">' +
								'<div class="btn aboutText">About Text</div>' +
							'</div>' +
						'</div>' +
						'<div class="commentaryBox">' +
						'<div class="hideCommentary"><div class="hideTab gradient">▸</div></div>'+
							'<div class="commentaryViewPort">' +
							'</div>'+
							'<div class="sourcesBox gradient">'+
								'<div class="sourcesHeader">' +
									'<span class=""><span class="btn showSources sourcesCount"></span></span>' +
									'<div class="clear"></div>' +
								'</div>' +	
								'<div class="sourcesList sidePanel gradient"><div class="sourcesWrapper"></div></div>' +
							'</div>' +
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
	sjs._$screen = $screen;
	sjs._$basetext = $(".basetext").last();
	sjs._$aboutBar = $(".aboutBar").last();
	sjs._$commentaryBox = $(".commentaryBox").last();
	sjs._$commentaryViewPort = $(".commentaryViewPort").last();
	sjs._$sourcesBox = $(".sourcesBox").last();
	sjs._$sourcesWrapper = $(".sourcesWrapper").last();
	sjs._$sourcesCount = $(".sourcesCount").last();
	sjs._$sourcesList = $(".sourcesList").last();
	sjs._$sourcesHeader = $(".sourcesHeader").last();

	sjs._$commentaryBox.css({"position": "absolute", "top": top + "px", "bottom": "auto"})
			.addClass("animating"); 
	sjs._$aboutBar.css({"position": "absolute", "top": aTop})

	var ref = makeRef(q);
	if (sjs.cache.get(ref)) {
		buildView(sjs.cache.get(ref));
	} else {
		$.getJSON("/api/texts/" + ref, buildView)
			.error(function() {
				sjs.alert.message("Sorry, there was an error (that's all I know)");
				$("#header").html(sjs.current ? sjs.current.book : "");
			});
	}
}


function buildView(data) {
	// take data returned from api and build it into the DOM
	// assumes sjs._$basetext and sjs._$commentaryViewPort are set
	
	if (data.error) {
		sjs.alert.message(data.error);
		$("#header").html("");
		return;
	}

	if (sjs._direction == 0) { $(".goodbye").hide() }

	var $basetext = sjs._$basetext;
	var $commentaryBox = sjs._$commentaryBox;
	var $commentaryViewPort = sjs._$commentaryViewPort;
	var $sourcesWrapper = sjs._$sourcesWrapper;
	var $sourcesCount = sjs._$sourcesCount;
	var $sourcesBox = sjs._$sourcesBox;

	// Clear everything out 
	$basetext.empty().removeClass("noCommentary versionCompare").hide();
	$("body").removeClass("newText");
	$commentaryBox.removeClass("noCommentary").hide(); 
	$commentaryBox.find(".commentary").remove();
	$("#addVersionHeader, #newVersion, #newIndex, #editButtons").hide();
	$("#viewButtons, #sectionNav, #breadcrumbs").show();
	$("#about").removeClass("empty");
	$(".open").remove();	
	
	sjs.textFilter = 'all';
	sjs.typeFilter = 'all';

	sjs.cache.save(data);
	var langMode = sjs.current.langMode ? sjs.current.langMode : 'en';
	sjs.current = data;
	sjs.current.langMode = langMode;
	

	// Set Language base on what's available
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
	
	// Texts that default to paragraph view - Tanach excluding Psalms and Talmud
	if (!(data.type in {Tanach:1, Talmud:1}) || data.book in {Psalms:1}) {
		$("#layoutToggle .toggleOption").removeClass("active");
		$("#block").addClass("active");
		sjs._$basetext.addClass("lines");
	}
	
	// Build basetext
	var emptyView = "<span class='btn addThis empty'>Add this Text</span>"+
		"<i>No text available.</i>";
	var basetext = basetextHtml(data.text, data.he, "", data.sectionNames[data.sectionNames.length - 1]);
	if (!basetext) {
		basetext = emptyView;
		$("#about").addClass("empty");
		$("#english").trigger("click");
		$("#viewButtons").hide();
	} 
	
	// Make a Fancy Title String
	var sectionsString = "";
	if (data.title) {
		var basetextTitle = data.title;
	} else {
		var sectionNames = []
		for (var i = 0; i < data.sectionNames.length-1; i++) {
			sectionNames.push(data.sectionNames[i] + " " + data.sections[i]);
		}
		sectionsString = sectionNames.join(" : ");
		var basetextTitle = data.book.replace(/_/g, " ") + " " + sectionsString;
	}
	if (data.heTitle) {
		var start = data.sectionNames.length > 1 ? 0 : 1;
		var end = data.sectionNames.length - 1;
		var basetextHeTitle = data.heTitle + " " + data.sections.slice(start,end).map(encodeHebrewNumeral).join(", ");
	} else {
		var basetextHeTitle = basetextTitle;
	}
	
	// Add the fancy titles to the bastext	
	basetext = "<div class='sectionTitle'><span class='en'>" + basetextTitle + "</span>" +
		"<span class='he" + (basetextTitle === basetextHeTitle ? " enOnly" : "") + "'>" + 
		basetextHeTitle + "</span></div>" + 
		"<span class='spacer'></span>" +
		basetext +
		"<div class='clear'></div>"; 

	$("#next, #prev").css("visibility", "visible").show();

	$("#aboutTextTitle").html(data.book);
	$("#aboutTextSections").html(sectionsString);
	$("#aboutVersions").html(aboutHtml());	
	
	// Add unreviewed noticed if this is a user submitted translation
	if (data.versionTitle === "Sefaria Community Translation") {
		sjs._$aboutBar.prepend("<span class='reviewWarning en'>This translation has not yet been reviewed.");
	}




	// TODO - Can't properly handle editing text info for "Commentator on Book", disallow for now 
	if (data.type == "Commentary") {
		$("#editTextInfo").hide(); 
	} else {
		$("#editTextInfo").show();
	}

	// TODO - Can't handle editing a merged text, disallow for now
	if ("sources" in data) {
		$("#about").addClass("enMerged");
	} else if ("heSources" in data) {
		$("#about").addClass("heMerged");
	} else {
		$("#about").removeClass("heMerged enMerged");
	}
	
	// Prefetch Next and Prev
	if (data.next) {
		prefetch(data.next);
		$("#next").attr("data-ref", data.next)
			.css("display", "inline-block")
			.removeClass("inactive");
	} else {
		$("#next").addClass("inactive");
	}
	if (data.prev) {
		prefetch(data.prev);
		$("#prev").attr("data-ref", data.prev)
			.css("display", "inline-block")
			.removeClass("inactive");
	} else {
		$("#prev").addClass("inactive");
	}
	
	// Build Commentary if any
	if (data.commentary.length) {
		buildCommentary(data.commentary);
		$("body").removeClass("noCommentary");
	} else {
		var emptyHtml = '<div class="sourcesActions">' +
							'<br /><div>No sources for this text yet.</div><br />' +
							'<span class="btn btn-success addSource">Add a New Source</span>' + 
						'</div>';
		$sourcesCount.text("0 Sources").show();
		$basetext.addClass("noCommentary");
		$sourcesBox.addClass("noCommentary");
		$commentaryBox.addClass("noCommentary").show();
		$sourcesWrapper.html(emptyHtml);
		$(".hideCommentary").hide();
		$("body").addClass("noCommentary");
	}

	/// Add Basetext to DOM
	$basetext.html(basetext);
	sjs._$verses = $basetext.find(".verse");
	sjs._$commentary = $commentaryBox.find(".commentary");								

	$basetext.show();
	$sourcesBox.show();	
	sjs.bind.windowScroll();
	sjs.loading = false;
	
	// highlight verse (if indicated)
	if (data.sections.length === data.sectionNames.length) {
		var first = data.sections[data.sections.length-1];
		var last = data.toSections[data.toSections.length-1];
		lowlightOn(first, last);
	} else {
		updateVisible();
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
			$highlight = sjs._$basetext.find(".verse").not(".lowlight").first();
		 	if ($highlight.length) {
		 		var top = $highlight.position().top - 100;
				$("html, body").animate({scrollTop: top}, scrollYDur)
				//$.scrollTo($highlight, {offset: -200, axis: "y", duration: scrollYDur, easing: "easeOutExpo"});
		 	}
		 	var header = sjs.current.book  + " " +
				sjs.current.sections.slice(0, sjs.current.sectionNames.length-1).join(":");
		 	$("#header").html(header);

		 	// Show a contribute prompt on third page
			sjs.flags.mishnahPrompt -= 1;
			if (sjs.flags.mishnahPrompt === 0 && !$.cookie("hide_mishnah_contest_prompt")) {
				$("#contributePrompt, #overlay").show().position({my: "center center", 
														at: "center center",
														of: $(window)});
				$("#contributePrompt .btn.close").click(function(){
					if ($("#contributePrompt input").prop("checked")) {
						$.cookie("hide_mishnah_contest_prompt", true);
					}
					$("#contributePrompt, #overlay").hide();
				});

				$("#contributePrompt #watchEditVideo").click(function(){
					$("#contributePrompt").hide();
					$("#editVideo").position({of: $(window)}).show();
					$("#editVideo .close").click(function(){
						$("#editVideo, #overlay").hide();
					})
				});
			}
		}
	});
	
	// clear loading message
	sjs.alert.clear();

} // ------- END Build View---------------


	function basetextHtml(en, he, prefix, sectionName) {
		var basetext = "";
		en = en || [];
		he = he || [];

		// Pad the shorter array to make stepping through them easier.
		var length = Math.max(en.length, he.length);
		en.pad(length, "");
		he.pad(length, "")

		// Step through both en and he together 
		for (var i = 0; i < Math.max(en.length, he.length); i++) {
            if (en[i] instanceof Array || he[i] instanceof Array) {
                basetext += basetextHtml(en[i], he[i], (i+1) + ".");
                continue;
            }
            var enButton = "<div class='btn addThis' data-lang='en' data-num='" + (i+1) +"'>" +
				"Add English for " + sectionName +  " " + (i+1) + "</div>";
			var enText = wrapRefLinks(en[i]) || enButton;
			var enClass = en[i] ? "en" : "en empty";

			var heButton = "<div class='btn addThis' data-lang='he' data-num='"+ (i+1) + "'>" +
				"Add Hebrew for " + sectionName + " " + (i+1) + "</div>";
			var heText = he[i] || heButton
			var heClass = he[i] ? "he" : "he empty";

			var n = prefix + (i+1);
			var verse =
				"<div class='verseNum'> " + n + " </div>" +
				'<span class="'+enClass+'">' + enText + "</span>" +
				'<span class="'+heClass+'">' + heText + '</span><div class="clear"></div>';

			basetext +=	'<span class="verse" data-num="'+ (prefix+n).split(".")[0] +'">' + verse + '</span>';

		}
	
		return basetext;
	}


	function buildCommentary(commentary) {
	
		var $commentaryBox = sjs._$commentaryBox;
		var $commentaryViewPort = sjs._$commentaryViewPort;
		var $sourcesWrapper = sjs._$sourcesWrapper;
		var $sourcesCount = sjs._$sourcesCount;
		var $sourcesBox = sjs._$sourcesBox;
	
		$sourcesWrapper.empty();
		var sources = {};
		var commentaryObjects = []
		var commentaryHtml = "";
		var n = 0; // number of assiged color in pallette

		for (var i = 0; i < commentary.length; i++) {
			var c = commentary[i];
	
			if (c.error) { continue; }
			var type = c.type || "unknown type";

			// Give each Commentator a Color
			if (!(c.commentator in sources)) {
				var color = sjs.palette[n];
				var source = {color: color};
				sources[c.commentator] = source;
				n = (n+1) % sjs.palette.length;
			}
							
			sources[c.commentator].count++;
			
			if (typeof(c.anchorText) == "undefined") c.anchorText = "";
			if (typeof(c.text) == "undefined") c.text = "";
			if (typeof(c.he) == "undefined") c.he = "";

			var classStr = "";
			if (!c.text.length && c.he) classStr = "heOnly";
			if (!c.he.length && c.text) classStr = "enOnly";
			
			var enText = sjs.shortCommentaryText(c.text, c.he);
			var heText = sjs.shortCommentaryText(c.he, c.text);

			var commentaryObject = {};
			commentaryObject.vref = c.anchorVerse;
			commentaryObject.ref = c.ref;
			commentaryObject.cnum = c.commentaryNum;
			commentaryObject.commentator = c.commentator;
			commentaryObject.heOnly = classStr.indexOf("heOnly") == 0;
			commentaryObject.html = '<span class="commentary ' + classStr + 
			    '" data-vref="' + c.anchorVerse + 
				'" data-id="' + i +
				'" data-category="' + c.category + ' ' + c.commentator +
				'" data-type="' + type +
				'" data-ref="' + (c.ref || "") + '">' + 
				'<span class="commentator' + (c.ref ? ' refLink' : '') + '"' + 
					' style="color:' + sources[c.commentator].color + 
					'" data-ref="'+ (c.ref || "") +'">' + 
						'<span class="en">'	+ c.commentator + 
						    (c.category == "Talmud" ? ' ' + parseRef(c.ref).sections[0] : '') + 
							':</span>' +
						'<span class="he' + ("heTitle" in c ? '">' + c.heCommentator : ' enOnly">' + c.heCommentator) + 
						    (c.category == "Talmud" ? ' ' + parseRef(c.ref).sections[0] : '') + 
							':</span>' +
				'</span><span class="anchorText">' + c.anchorText + 
				'</span><span class="text"><span class="en">' + enText +
				'</span><span class="he">' + heText + '</span></span></span>';
			commentaryObject.category = c.category;
			commentaryObject.type = type;
			commentaryObjects.push(commentaryObject);		
		} 

		// Sort commentary 
		commentaryObjects.sort(function (a,b) {
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
		});
		
		sjs.co = commentaryObjects;

		for (var i = 0; i < commentaryObjects.length; i++) {
			commentaryHtml += commentaryObjects[i].html;
		}

		$commentaryViewPort.append(commentaryHtml)
							.slimscroll({
									height: "100%", 
									color: "#888",
									position: "left",
									distance: "0px",
								});
		$sourcesWrapper.html(sourcesHtml(commentary));
		$sourcesCount.html(commentary.length + " Sources");
		$commentaryBox.show();	
	
	}
	
	function sourcesHtml(commentary, selected, selectedEnd) {
		if (!selected) { var selected = selectedEnd = 0; }

		var sources = {};
		var types = {};
		var sourceTotal = 0;
		var commentaryIndex = {};
		var n = m = 0;

		// Walk through all commentary objects given, disregard errors or commentaries
		// outside of selected verse (if any)
		for (var i = 0; i < commentary.length; i++) {
			var c = commentary[i];
	
			if (c.error) { continue; }

			var key = (c.type === "note" ? i : c.ref);

			if (key in commentaryIndex) {
				//continue;
			} else {
				commentaryIndex[key] = 1;
			}


			if (selected && (c.anchorVerse < selected || c.anchorVerse > selectedEnd)) { continue; }
	
			// Add Comment if we haven't seen it already, give it a color
			if (!(c.category in sources)) {
				var color = sjs.palette[n];
				var source = {count: 0, color: color, subs: {}, html: ""};
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

			var typeName = c.type || "unknown type";
			if (!(typeName in types)) {
				var color = sjs.palette[m];
				var type = {count: 0, color: color, html: ""};
				m = (m+1) % sjs.palette.length;
				types[typeName] = type;
			} 
			types[typeName].count++;
		}

		// -------------- Build Texts Filter -----------------
		var html = "<div class='textsFilter'><div class='source label active' data-category='all'>" +
					"<div class='cName'><span class='count'>("  + sourceTotal + ")</span> All Texts</div></div>";

		// If the current filter has no sources, include it anyway listed as count 0
		if (sjs.textFilter !== "all" && !(sjs.textFilter in sources)) {
			sources[sjs.textFilter] = { count: 0, color: sjs.palette[n], subs:{}, html: "" }
		}

		for (category in sources) {
			sources[category].html += '<div class="source" data-category="' + category +
				'" style="color:'+ sources[category].color +
				'"><div class="cName"><span class="count">('+ sources[category].count+')</span> '+
				category + "</div>";
			for (sub in sources[category].subs) {
				sources[category].html += '<div class="source sub" data-category="' + sub +
				'"><div class="cName"><span class="count">('+ sources[category].subs[sub]+')</span> ' + sub + "</div></div>";
			}
			sources[category].html += '</div>';
		}
		// Sort sources by count
		var sortable = [];
		for (var source in sources) {
				sortable.push([source, sources[source].count, sources[source].html])
		}
		sortable.sort(function(a, b) {return b[1] - a[1]})
		// Add the HTML of each source to html
		for (var i = 0; i < sortable.length; i++) {
			html += sortable[i][2];
		}	
		html += '</div>';


		// --------------- Build Types Filter ---------------------
		html += "<div class='typesFilter'><div class='type label active' data-type='all'>" +
					"<span class='count'>("  + sourceTotal + ")</span> All Connections</div>";

		// If the current filter has no sources, include it anyway listed as count 0
		if (sjs.typeFilter !== "all" && !(sjs.typeFilter in types)) {
			types[sjs.typeFilter] = { count: 0, color: sjs.palette[m], html: "" }
		}

		for (type in types) {
			types[type].html += '<div class="type" data-type="' + type +
				'" style="color:'+ types[type].color +
				'"><span class="cName"><span class="count">('+ types[type].count+')</span> '+
				type.toProperCase() + '</div>';
		}
		// Sort sources by count
		var sortable = [];
		for (var type in types) {
				sortable.push([type, types[type].count, types[type].html])
		}
		sortable.sort(function(a, b) {return b[1] - a[1]})
		// Add the HTML of each type to html
		for (var i = 0; i < sortable.length; i++) {
			html += sortable[i][2];
		}

		html += '</div>';
		html += '<div class="sourcesActions">' + 
					'<span class="btn btn-success addSource">Add a New Source</span>' +
				'</div>';
		return html;
	}


	function resetSources() {
		if (!("commentary" in sjs.current)) { return; }
		sjs._$sourcesWrapper.html(sourcesHtml(sjs.current.commentary));
		setFilters();
		sjs._$sourcesCount.html(sjs._$commentaryBox.find(".commentary:visible").length + " Sources");
		sjs._$commentaryBox.find(".commentary").removeClass("hidden");

	}

	function setFilters() {
		if (sjs.textFilter !== "all") {
			$(".source[data-category=" + sjs.textFilter + "]").trigger("click");
		}
		if (sjs.typeFilter !== "all") {
			$(".type[data-type=" + sjs.typeFilter + "]").trigger("click");
		}
	}


	function aboutHtml(data) {
		data = data || sjs.current;

		if (!(data.versionTitle || data.heVersionTitle)) { 
			return "<i><center>No text available.</center></i>"; 
		}

		var enVersion = {
			title: data.versionTitle || "<i>Text Source Unknown</i>",
			source: data.versionSource || "",
			lang: "en",
			sources: ("sources" in data ? data.sources : null)
		};

		var heVersion = {
			title: data.heVersionTitle || "<i>Text Source Unknown</i>",
			source: data.heVersionSource || "",
			lang: "he",
			sources: ("heSources" in data ? data.heSources : null)
		};

		var aboutVersionHtml = function(version) {
			var html = '';
			if (version.sources && version.sources.unique().length > 1) {
			// This text is merged from multiples sources
				uniqueSources = version.sources.unique()
				html += '<div class="version '+version.lang+'"><span id="mergeMessage">This page includes merged sections from multiple text versions:</span>'
				for (i = 0; i < uniqueSources.length; i++ ) {
					html += '<div class="mergeSource">' +
						'<a href="/' + makeRef(data) + '/'+version.lang+'/' + uniqueSources[i].replace(/ /g, "_") + '">' + 
						uniqueSources[i] + '</a></div>';
				}
				html += "</div>";
			} else {
				var isSct = (version.title === "Sefaria Community Translation");
				html += '<div class="version '+version.lang+'">' +
							(isSct ? "Original Translation" : '<div class="aboutTitle">' + version.title + '</div>' +
							'<div class="aboutSource">Source: <a target="_blank" href="' + version.source + '">' + parseURL(version.source).host + '</a></div>') +
							'<div class="credits"></div>' +
							'<a class="historyLink" href="/activity/'+data.ref+'/'+version.lang+'/'+version.title.replace(/ /g, "_")+'">Full history &raquo;</a>' + 
						'</div>';
			}
			return html;
		};

		var html = '<i>About this version:</i>' +  aboutVersionHtml(heVersion) + aboutVersionHtml(enVersion);

		// Build a list of alternate versions
		var versionsHtml = '';
		var versionsLang = {};
		var mergeSources = [];
		if ("sources" in data) {mergeSources = mergeSources.concat(data.sources)}
		if ("heSources" in data) {mergeSources = mergeSources.concat(data.heSources)}
		for (i = 0; i < data.versions.length; i++ ) {
			var v = data.versions[i];
			// Don't include versions used as primary en/he
			if (v.versionTitle === data.versionTitle || v.versionTitle === data.heVersionTitle) { continue; }
			if ($.inArray(v.versionTitle, mergeSources) > -1 ) { continue; }
			versionsHtml += '<div class="alternateVersion ' + v.language + '">' + 
								'<a href="/' + makeRef(data) + '/' + v.language + '/' + v.versionTitle.replace(/ /g, "_") + '">' +
								v.versionTitle + '</a></div>';
			versionsLang[v.language] = true;
		}

		if (versionsHtml) {
			var langClass = Object.keys(versionsLang).join(" ");
			html += '<div id="versionsList" class="'+langClass+'"><i>Other versions of this text:</i>' + versionsHtml + '</div>';
		}

		return html;

	}


//  -------------------- Update Visible (Verse Count, Commentary) --------------------------

	function updateVisible() {
		if (sjs.loading || !sjs._$verses) {
			return;
		}
		
		var $v = sjs._$verses;
		var $com = sjs._$commentary;
		var $w = $(window);
		var nVerses = $v.length;
		var wTop = $w.scrollTop() + 40;
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
		
					
		// Scroll commentary according to scroll map
		if (!sjs._$commentaryBox.hasClass("noCommentary")) {
			
			// Don't scroll if a commentary is expanded
			if ($(".commentary.expanded").length) {
				return;
			}
			// If something is highlighted, scroll commentary to track highlight in basetext
			if ($(".lowlight").length) {
				var $first = $v.not(".lowlight").eq(0);
				var top = ($first.length ? $w.scrollTop() - $first.offset().top + 120 : 0);
				var vref = $first.attr("data-num");
				
				var $firstCom = $com.not(".lowlight").eq(0);
				if ($firstCom.length) {
					sjs._$commentaryViewPort.clearQueue()
						.scrollTo($firstCom, {duration: 0, offset: top, easing: "easeOutExpo"})				
				}
	
			} else {				
			// There is nothing highlighted, scroll commentary to match basetext
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
		}
	}

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

addSourceSuccess = function() {
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
	
	$.getJSON("/api/texts/" + ref, function(data) {
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
		
		/*				
		if (data.type == "Talmud") {
			var text = "<span id='editDaf' class='btn gradient'>Edit Daf</span><div class='addSourceMsg'>Talmud line numbers may not be correct.<br>Please check the line numbers and edit if necessary before adding a source.</div>" + text;
		}
		*/

		$("#addSourceText").html(text);
		$(".open").position({of: $(window)});
		
		i++;
		if (data.type == "Commentary" && i > 1) {
			$("#addSourceSave").addClass("inactive");
			
			$("#addSourceComment").removeClass("inactive")
				.find(".commentCount").html(i + (i == 2 ? "nd" : i == 3 ? "rd" : "th"));
			
		} else { 
			$("#addSourceComment").addClass("inactive");
		}				

		
		// Edit Daf Link
		$("#editDaf").click(function() {
			sjs.current = sjs.ref.bookData;
			sjs.current.langMode = 'he';
			$("#overlay").hide();
			$("#editText").trigger("click")	
		})
		
		$("#addSourceSave").text("Save Source");
		
	});
	
}

sjs.expandSource = function($source) {
	var id = parseInt($source.attr("data-id"));
	var c = sjs.current.commentary[id];

	if ($source.hasClass("expanded")) {
		$source.find(".text .en").text(sjs.shortCommentaryText(c.text, c.he));
		$source.find(".text .he").text(sjs.shortCommentaryText(c.he, c.text));
		$source.removeClass("expanded");
		$(".commentary").removeClass("lowlight");
		return false;
	}

	// Add full, wrapped text to DOM
	$source.find(".text .en").html(wrapRefLinks(sjs.longCommentaryText(c.text, c.he)));
	$source.find(".text .he").html(sjs.longCommentaryText(c.he, c.text));

	// highlight and expand
	$(".commentary").addClass("lowlight").removeClass("expanded");
	$source.removeClass("lowlight").addClass("expanded");

	// prefetch sources
	$source.find(".refLink").each(function() {
		prefetch($(this).attr("data-ref"))	
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
														sjs._$commentaryViewPort.slimscroll();
														}
													});

	}, 160);


	var ref = $source.attr("data-ref");
	
	var editLink = $source.attr("data-type") == 'note' ? 
					"<span class='editLink'>Edit Note</span>" :
					"<span class='editLink'>Edit Connection</span>";
	
	var translateLink = $source.hasClass("heOnly") ? 
						"<span class='translateThis' data-ref='" + ref + "'>Add Translation +</span>" :
						"";
	var openLink = $source.attr("data-type") == 'note' ?
					"" :
					"<span class='refLink' data-ref='" + normRef(ref) + "'>Open " + ref + " &raquo;</span>";

	if (!($source.find(".actions").length)) {
		var actionsHtml = "<div class='actions'>" +
							"<span class='connectionType'>[" + $source.attr("data-type") + "]</span>" +
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
	var short = text || backup || "[no text available]";
	short = (isArray(short) ? short.join(" ") : short);
	if (short.length > 180) {
		short = short.substring(0,150)+"...";
	}
	short = short.stripHtml().escapeHtml();
	
	return short;
};


sjs.longCommentaryText = function(text, backup) {
	var long = text || backup || "[no text available]";
	long = (isArray(long) ? long.join(" ") : long);

	return long;
};


function buildOpen($c, editMode) {
	// Build modal source view or modal edit view for source
	// if $c is present, create based on a .commentary
	// if editMode, copy existing .open for editing
	// if neither, build a modal for adding a new source
	// This code a mess and shoud be rewritten from scratch. 
	
	
	if (editMode) {
		// We're editing an existing source; grab data from expanded source
		var id = parseInt($(".expanded").attr("data-id"));
		var commentator = $(".expanded").attr("data-ref");
		var enText = $(".expanded .text .en").text();
		var heText = $(".expanded .text .he").text();
		var anchorText = $(".expanded .anchorText").text();
		var source = $(".expanded").attr("data-source");
		var type = $(".expanded").attr("data-type");
		var text = (type === "note" ? enText : "")
		var title = (type === "note" ? sjs.current.commentary[id].commentator : "")

		$("#selectedVerse").text($(".open .openVerseTitle").text());
	}
	
	$(".open").remove();
	
	if ($c) {
		// building a new modal to read based on an existing comment
		$c.clone().hide().appendTo("body")
			.removeClass("commentary").addClass("open");

		var $o	= $(".open");
		var v = parseInt($o.attr("data-vref"));			
		
		// Wrap Ref Links
		$o.find(".text .en").html(wrapRefLinks($o.find(".text .en").text()));

		// prefetch ref links 
		$o.find(".refLink").each(function() {
			prefetch($(this).attr("data-ref"))	
		})
		
	} else {
		// building an editing modal (either new or existing)
		var ref = sjs.add.source.ref;
		var sections = ref.split(":");
		var v = sections[sections.length - 1];
		
		var html = 	'<div class="open gradient edit'+ (editMode && type === "note" ? " noteMode": "") + '">' +
			'<div class="formRow" id="anchorForm"><span class="label">Anchor Words:</span>' +
				'<input><span id="selectAnchor" class="btn">Select</span></div>' +
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
					'<option value="note">Note</option>'+
					'<option value="other">Other...</option>'+
				'</select><input id="otherType" placeholder=""></div>' +
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
				'<div class="label">Note Title:</div>' +
				'<input id="addNoteTitle" value="'+(title || "")+'"></div>'+
			'<div class="formRow">' +
				'<textarea id="addNoteTextarea">'+(text || "")+'</textarea></div>' +
			'<div id="addSourceControls">' + 
				'<span id="addSourceSave" class="btn btn-large inactive">Save Source</span>'+
				"<span id='addNoteSave' class='btn btn-large'>Save Note</span>" +
				'<span id="addSourceCancel" class="btn btn-large">Cancel</span></div>' +
			'</div>'
			

		$("body").append(html);
		var $o = $(".open");
		$("#addSourceCitation").val("");
	
		
		// Create a wrapper on checkRef() with appropriate parameters for this case
		checkSourceRef = function() {
			$("#addSourceText").html("");
			checkRef($("#addSourceCitation"), $("#addSourceText"), $("#addSourceSave"), 0, addSourceSuccess, true);
		}

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
			if ($(this).val() === "note") {
				$(this).parents(".open").addClass("noteMode");
				$("#addNoteTitle").focus();
			} else {
				$(this).parents(".open").removeClass("noteMode");
			}
		})	
		$("#selectAnchor").toggle(function() {
			$o.addClass("selectingAnchor");
			$(this).text("OK");
		}, function() {
			$o.removeClass("selectingAnchor")
			if ($("#anchorForm input").val()) {
				$(this).text("Change");
				$("#anchorForm input").show();
			} else {
				$(this).text("Select");
			}

		})
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

			data = sjs.ref.bookData;

			sjs.editing = data;
			sjs.editing.smallSectionName = data.sectionNames[data.sectionNames.length - 1];
			sjs.editing.bigSectionName = data.sectionNames[data.sectionNames.length - 2];
			sjs.editing.versionSource = '';
			if (data.type === "Commentary") {
				sjs.editing.offset = data.toSections[data.toSections.length-1] + 1;
			} else {
				sjs.editing.offset = data.sections[data.sections.length-1];
			}
			$.extend(sjs.editing, parseRef(ref));
			$("#overlay").hide();
			
			if (this.id in {"addSourceHebrew":1, "addSourceEnglish": 1}) {
				if (this.id == "addSourceHebrew") {
					sjs.current.langMode = "en"; // so english will show as compare text
					$("#language").val("he");
					$("#newVersion").css("direction", "rtl");
				} else {
					sjs.current.langMode = "he";
				}
				sjs.showNewVersion();

			} else {
				sjs.editing.msg = "Add a New Text";
				sjs.showNewText();
			}
			
		})
	
		$("#addSourceEdit").click(function() {
			if (!sjs._uid) {
				return sjs.loginPrompt();
			}
			sjs.alert.saving("Looking up text...");
			var text = $("#addSourceCitation").val().replace(/ /g, "_")
			if ($("#addSourceTextBox").hasClass("he")) {
				sjs.current.langMode = "he";
			} else {
				sjs.current.langMode = "en";
			}
			$.getJSON("/api/texts/" + text, sjs.editText)
				.error(function(){ sjs.alert.message("Sorry there was an error.")});
		});

	}
	
	if (editMode) {
		// Populate fields for editing view
		$o.css("direction", "ltr").attr("data-id", id);
		$("#addSourceCitation").val(commentator);
		$("#anchorForm input").val(anchorText);
		if (anchorText) $("#anchorForm input").show();
		$("#addSourceText").html("<span class='en'>"+enText+"</span><span class='he'>"+heText+"</span>");
		$("#sourceForm input").val(source);
		$("#addSourceType select").val(type);
		if (type !== "note") $("#addSourceSave").removeClass("inactive");

		// Show appropriate buttons related to this text
		$("#addSourceEdit").removeClass("inactive");
		var comment = sjs.current.commentary[parseInt(id)];
		if (comment.text && comment.he) {
			$("#addSourceTextBox .btn.he, #addSourceTextBox .btn.en").removeClass("inactive");
			if (sjs.current.langMode === "he") {
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

	$o.prepend(openVerseHtml + "<br>");
	if ($o.hasClass("edit") && !editMode) {
		title = "Add a source to " + title;
		$("#addSourceCitation").focus();
	}
	var titleHtml = "<div class='openVerseTitle'>" + title + "</div>";
	if (editMode) titleHtml = "<div class='delete'>delete</div>" + titleHtml;
	$o.prepend(titleHtml);

	$(".open .delete").click(handleDeleteSource);

	if ($c) {
		// Add scrolling controls if text is too long
		var h = $o.height();
		var mh = parseInt($o.css("max-height"));
		var p = parseInt($o.css("padding-top"));
		if (h + (2*p) >= mh) {
			$o.wrapInner("<div class='openBottom' />");
			$o.children().eq(0).height(h - p)
			$o.append('<div class="openScrollCtl"> \
				<img src="/static/img/up.png" class="up"/> \
				<img src="/static/img/down.png" class="down"/> \
			</div>');
		} 


		var buttons = "<div class='openButtons'><div class='editLink btn'>Edit Source</div>";
		// Add Translate button if heOnly
		if ($o.hasClass("heOnly")) {
			buttons +="<div class='translateThis btn' data-ref='"+$o.attr("data-ref")+"'>Add Translation</div>";
		}
		// Add an edit button to reading modal
		buttons += "</div>";
		$o.append(buttons);

		var ref = $o.find(".commentator").attr("data-ref").replace(".", " ");
		if (ref) {
			$o.find(".commentator").html(ref+":");	
		}
	} else {
		//select anchor words	
	 	var words = enText.split(" ");
	 	// wrap each word in verse 
	 	var html = "";
	 	for (var i = 0; i < words.length; i++) {
	 		html += '<span class="selectWord">' + words[i] + "</span> ";
	 	}
	 	 
	 	html = $.trim(html)
	 	 
		$(".openVerse").html(html)
		$(".selectWord").click(function() {
		
			if (!$(".selectWord.lowlight").length){
				$(".selectWord").addClass("lowlight")				
			}
			
			if ($(this).hasClass("lowlight")) {
				$(this).removeClass("lowlight")
			} else {
				$(this).addClass("lowlight")
			}
		
			var anchorWords = ""
		
			$(".selectWord").each(function() {
				if (!$(this).hasClass("lowlight")) {
					anchorWords += $(this).text() + " "
				}
			})
			
			$("#anchorForm input").val(anchorWords);
		});
	}

	$o.show().position({ my: "center center", at: "center center", of: $(window) });
	$("#overlay").show();
	return false;
}


sjs.eventHandlers.refLinkClick = function (e) {
	if ($(this).hasClass("commentaryRef")) {
		$("#goto").val($(this).text() + " on ").focus();
		e.stopPropagation();
		return false;
	}

	var ref =  $(this).attr("data-ref") || $(this).text();
	if (!ref) return;
	ref = $(this).hasClass("mishnaRef") ? "Mishna " + ref : ref;
	sjs._direction = $(this).parent().attr("id") == "breadcrumbs" ? -1 : 1;
	
	get(parseRef(ref));

	e.stopPropagation();
}	

sjs.makePlainText = function(text) {
	// Turn text array into a string, separating segments with \n\n
	// Replace empty strings in text with "..."

	// TODO - This currently removes line breaks inside text segments,
	// which screws things up currently but should be allowed later. 
	var placeholders = function(line) { return line ? line.replace(/\n/g, " ") : "..."; };
	var text = sjs.editing.text.map(placeholders).join('\n\n');
	return text
}


sjs.editText = function(data) {
		if (!sjs._uid) {
			return sjs.loginPrompt();
		}
		sjs.editing.book             = data.book;
		sjs.editing.sections         = data.sections;
		sjs.editing.sectionNames     = data.sectionNames;
		sjs.editing.smallSectionName = data.sectionNames[data.sectionNames.length-1];
		sjs.editing.bigSectionName   = data.sectionNames[data.sectionNames.length-2];
		
		if (sjs.current.langMode === 'en') {
			sjs.editing.versionTitle = data.versionTitle;
			sjs.editing.versionSource = data.versionSource;
			sjs.editing.heVersionTitle = data.heVersionTitle;
			sjs.editing.heVersionSource = data.heVersionSource;
			sjs.editing.text = data.text;
			sjs.editing.he = data.he;
			var pad = data.he ? Math.max(data.he.length - data.text.length, 0) : 0;
		} else if (sjs.current.langMode === 'he') {
			$("body").addClass("hebrew");
			sjs.editing.versionTitle = data.heVersionTitle;
			sjs.editing.versionSource = data.heVersionSource;
			sjs.editing.text = data.he;
			var pad = data.text ? Math.max(data.text.length - data.he.length, 0) : 0;
		} else if (sjs.current.langMode === 'bi') {
			sjs.alert.message("Select a language to edit first with the language toggle in the upper right.");
			return;
		} else {
			return;
		}

		// If we know there are missing pieces of the text (compared to other lang)
		// pad with empty lines.
		for (var i = 0; i < pad; i++) {
			sjs.editing.text.push("");
		}
		
		sjs.editing.msg = "Edit Text";
		
		sjs.showNewText();

		// Set radio buttons for original/copy to appropriate state
		$('#versionTitle').val(sjs.editing.versionTitle);
		$('#versionSource').val(sjs.editing.versionSource);
		if ($("#versionTitle").val() in {"Sefaria Community Translation":1, "":1}) {
			$("#textTypeForm input#originalRadio").trigger("click");
		} else {
			$("#textTypeForm input#copyRadio").trigger("click");
		}

		var text = sjs.makePlainText(sjs.editing.text)
		$('#newVersion').val(text).trigger("autosize").trigger('keyup');

	};


sjs.editCurrent = function(e) {
	sjs.editText(sjs.current);
	e.stopPropagation();
};


sjs.addThis = function(e) {
	var lang = $(this).attr("data-lang");
	if (lang) {
		sjs.current.langMode = lang;
	}
	sjs.editCurrent(e);
	var n = parseInt($(this).attr("data-num"))
	if (n) {
		if (!sjs.editing.compareText || !sjs.editing.compareText.length) {
			var top = $("#newTextNumbers .verse").eq(n-1).position().top - 100;
		} else {
			$("#showOriginal").trigger("click");
			var top = $("#newTextCompare .verse").eq(n-1).position().top - 100;
		}
		sjs._$newVersion.trigger("autosize");
		$("html, body").animate({scrollTop: top, duation: 200});
	}
}

sjs.checkNewTextRef = function() {
	// Check ref function for new text UI
	checkRef($("#newTextName"), $("#newTextMsg"), $("#newTextOK"), 1, function(){}, false);
};
	

sjs.newText = function(e) {
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
	$("#newTextName").focus();
	$("#newTextOK").addClass("inactive");
	
	$("input#newTextName").autocomplete({ source: sjs.books, minLength: 2, select: sjs.checkNewTextRef});
	$("#newTextName").blur(sjs.checkNewTextRef);
	$("#newTextName").bind("textchange", function(e) {
		if (sjs.timers.checkNewText) {
			clearTimeout(sjs.timers.checkNewText);
		}
		sjs.timers.checkNewText = setTimeout(sjs.checkNewTextRef, 250);
	});
	sjs.ref.tests = null;
};


sjs.showNewVersion = function() {
	
	sjs.editing.compareText = sjs.current.langMode == "en" ? sjs.editing.text : sjs.editing.he;
	sjs.editing.compareLang = sjs.current.langMode;

	sjs.editing.smallSectionName = sjs.editing.sectionNames[sjs.editing.sectionNames.length-1];
	sjs.editing.bigSectionName = sjs.editing.sectionNames[sjs.editing.sectionNames.length-2];

	sjs.showNewText();
	
	sjs._$newVersion.css("min-height", $("#newTextCompare").height())
		.focus();

	var title = sjs.current.langMode == "en" ? sjs.editing.versionTitle : sjs.editing.heVersionTitle;
	var source = sjs.current.langMode == "en" ? sjs.editing.versionSource : sjs.editing.heVersionSource;
	$(".compareTitle").text(title);
	$(".compareSource").text(source);

	$("#versionSource").val("");
	$("body").removeClass("newText");
	$(".sidePanel").removeClass("opened");

	syncTextGroups($("#newTextCompare .verse"))

}


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
	var start = sjs.editing.offset ? sjs.editing.offset - 1 : 0; 
	for (var i = start; i < compareText.length; i++) {
		compareHtml += '<span class="verse"><span class="verseNum">' + (i+1) + "</span>" +
			compareText[i] + "</span>";
	}
	$("#newTextCompare").html(compareHtml)
		.removeClass("he en")
		.addClass(lang);
}


sjs.clearNewVersion = function() {
	sjs.clearNewText();
	$("#newTextCompare").empty();
	sjs._direction = 0;
	buildView(sjs.current);
	sjs.editing = {};
}

	
sjs.showNewText = function () {
	// Show interface for adding a new text
	// assumes sjs.editing is set with: 
	// * msg -- displayed in header
	// * book, sections, toSections -- what is being edited
	// * smallSectionName, bigSectionName -- used in line numbering and title respectively
	// * text - the text being edited or "" if new text
	
	sjs.clearNewText();

	$("body").addClass("editMode");

	$(".sidePanel").removeClass("opened");
	$(".open, .verseControls").remove();
	$("#viewButtons, #prev, #next, #breadcrumbs").hide();
	$("#editButtons").show();
	$("body").addClass("newText");
	sjs._$commentaryBox.hide();
	sjs._$basetext.hide();
	$("#addVersionHeader").show();

	$(window).scrollLeft(0)
		.unbind("scroll", updateVisible)
		.unbind("resize", updateVisible);

	var title = sjs.editing.book.replace(/_/g, " ");
	for (var i = 0; i < sjs.editing.sectionNames.length-1; i++) {
		title += " : " + sjs.editing.sectionNames[i] + " " + sjs.editing.sections[i];
	}	

	if (!("compareText" in sjs.editing)) {
		sjs.editing.compareText = sjs.editing.he;
		sjs.editing.compareLang = "he";
		$(".compareTitle").text(sjs.editing.heVersionTitle);
		$(".compareSource").text(sjs.editing.heVersionSource);
	}

	sjs.makeCompareText();

	$("#editTitle").text(title);
	$("#versionSource").val(sjs.editing.versionSource);
	
	
	var verse_num = sjs.editing.offset || 1;
	$("#newTextNumbers").append("<div class='verse'>" + 
		sjs.editing.smallSectionName + " " + verse_num + "</div>");

	$("#newVersion").unbind().bind("textchange", checkTextDirection)
		.bind("keyup", handleTextChange)
		.autosize()
		.show();
	

	$("#textTypeForm input").click(function() {
		if ($(this).val() === "copy") {
			$("#copiedTextForm").show();

			// If an SCT was preloaded and the user clicks "Copied Text", reset the text fields 
			if (sjs.current.versionTitle === "Sefaria Community Translation" && sjs._$newVersion.val() === sjs.current.text.join("\n\n")) {
				sjs._$newVersion.val("").trigger("keyup");
				$("#copiedTextForm").find("input").val("");
			}
			$("#textTypeForm").removeClass("original");

		} else {
			$("#copiedTextForm").hide();
			if (sjs.current.versionTitle === "Sefaria Community Translation") {
				var text = sjs.makePlainText(sjs.editing.text)
				sjs._$newVersion.val(text)
					.trigger("keyup");
			}
			$("#textTypeForm").addClass("original");
		}
	});

	// Autocomplete version title with existing, autofill source for existing versions
	$.getJSON("/api/texts/versions/" + sjs.editing.book, function(data) {
		if ("error" in data) { return; }
		map = {};
		titles = [];
		for (var i = 0; i < data.length; i++) {
			titles.push(data[i].title);
			map[data[i].title] = data[i].source;
		}

		$("#versionTitle").autocomplete({source: titles, select: function(e, ui) {
			$("#versionSource").val(map[ui.item.value]);
		}}); 
	});

	$("#newVersionBox").show();

	// Set radio buttons for original/copy to appropriate state
	if ($("#versionTitle").val() in {"Sefaria Community Translation":1, "":1}) {
		$("#textTypeForm input#originalRadio").trigger("click");
	} else {
		$("#textTypeForm input#copyRadio").trigger("click");
	}
	

};

	
sjs.clearNewText = function() {
	sjs.alert.clear();
	sjs._$newVersion.val("").unbind().css("min-height", "none");
	$("#newTextNumbers").empty();
	$("#versionTitle, #versionSource").val("");
	$("#textTypeForm input").unbind();
	$("#newVersionBox").hide();
	$("body").removeClass("editMode");
};	

	
sjs.showNewIndex = function() {
	$("body").addClass("editMode");
	$(".sidePanel").removeClass("opened");
	$("#viewButtons, #prev, #next, #breadcrumbs, #overlay").hide();
	$(".verseControls, .open").remove();
	$(window).unbind("scroll.update resize.scrollLeft");
	sjs._$commentaryBox.hide();
	sjs._$basetext.hide();
	$(window).scrollLeft(0);
			
	$("#textCategory").unbind().change(function() {
		if ($(this).val() === "Other") $("#otherCategory").show();
		else $("#otherCategory").hide();

		if ($(this).val() === "Commentary") $("#textStructureFieldSet, #shorthandsFieldSet").hide();
		else $("#textStructureFieldSet, #shorthandsFieldSet").show();
	});

	$("#addSection").unbind().click(function() {
		$(this).before("<span class='sectionType'> > <input/> <span class='remove'>X</span></span>");
	});

	$("#sectionTypesBox").removeClass("fixedDepth");
	
	$("#addShorthand").unbind().click(function() {
		$(this).before('<div class="shorthand"><input class="shorthandFrom" /> ' + 
			'⇾ <input class="shorthandTo"/> <span class="remove">X</span>');
	});

	$(document).on("click", ".remove", function() {
		$(this).parent().remove();
	});
			
	$("#newIndex").show();
};
	

sjs.editTextInfo = function(){
	if (!sjs._uid) {
		return sjs.loginPrompt();
	}
	$("#newIndexMsg").hide();
	$("#textTitle").val(sjs.current.book);
	sjs.current.titleVariants.forEach(function(variant) {
		$("#textTitleVariants").tagit("createTag", variant);
	});

	sjs.showNewIndex();

	if (sjs.current.heBooks) { 
		$("#heTitle").val(sjs.current.heBook );
	} else if (sjs.current.heTitle) {
		$("#heTitle").val(sjs.current.heTitle );
	}

	// Make list of categories currently in the select
	var cats = {};
	$("#textCategory option").each(function() {
    	cats[$(this).attr("value")] = 1;
	});
	// Set the category if it's in the list, otherwise set it as "Other"
	if (sjs.current.type in cats) {
		$("#textCategory").val(sjs.current.type);
	} else {
		$("#textCategory").val("Other");
		$("#otherCategory").val(sjs.current.type).show();
	}
	
	// Remove section name box if text depth is 1
	if (sjs.current.sectionNames.length == 1) {
		$(".sectionType:gt(0)").remove();
	}

	// Add additional section name boxes if needed
	for (var i = 2; i < sjs.current.sectionNames.length; i++) {
		$("#addSection").trigger("click");
	}
	
	// Populate sections names 
	$(".sectionType").each(function(){
		$(this).find("input").val(sjs.current.sectionNames[$(this).index()]);
	});
	
	// Add Shorthand boxes as needed
	for (var i = 1; i < sjs.current.maps.length; i++) {
		$("#addShorthand").trigger("click");
	}
	
	$(".shorthand").each(function(){
		if (!sjs.current.maps.length) return;
		$(this).find(".shorthandFrom").val(sjs.current.maps[$(this).index()].from);
		$(this).find(".shorthandTo").val(sjs.current.maps[$(this).index()].to);

	});
	
	// Check if texts are already saved with this schema,
	// If so, disallow schema changes
	$.getJSON("/api/counts/" + sjs.current.book, function(data){
		if ("error" in data) {
			return;
		} else {
			var count = 0;
			$.map(data.availableCounts, function(value, key) {
				for (var i=0; i < value.length; i++) {
					count += value[i]
				}
			});
		}
		if (count > 0) {
			$("#sectionTypesBox").addClass("fixedDepth");
		}
	});


};

sjs.clearNewIndex = function() {
		$("#newIndexMsg").show();
		$("#newIndex input, #newIndex select").val("");
		$("#textTitleVariants").tagit("removeAll");
		$(".sectionType:gt(1)").remove();
		$(".shorthand:not(:first)").remove();
		$("#addShorthand").unbind();
		$("#addSection").unbind();
		sjs.editing.title = null;
		$("body").removeClass("editMode");
}	
	
	
sjs.readNewIndex = function() {
		var index = {};
		
		index.title = $("#textTitle").val();
		if (sjs.editing.title && index.title !== sjs.editing.title) {
			// Primary title change
			index.oldTitle = sjs.current.book;
			sjs.cache.killAll()
		}

		var heTitle = $("#heTitle").val();
		if (heTitle) { index["heTitle"] = heTitle; }
		index.titleVariants = $("#textTitleVariants").tagit("assignedTags")
		index.titleVariants.unshift(index.title);
		var cat = $("#textCategory").val();
		// Don't allow category updates to Tanach, Mishna or Talmud
		// HACK to deal with incomplete handling on subcategories 
		if (cat in {"Tanach": 1, "Mishna": 1, "Talmud": 1}) {
			index.categories = sjs.current.categories || "locked";
		} else {
			index.categories = (cat == "Other" ? [$("#otherCategory").val()] : [cat]);
		}
		var sectionNames = [];
		$(".sectionType input").each(function() {
			sectionNames.push($(this).val());
		})
		index.sectionNames = sectionNames;
		var maps = [];
		$(".shorthand").each(function() {
			var from = $(this).find(".shorthandFrom").val()
			var to = $(this).find(".shorthandTo").val()

			if (!from && !to) return;
			
			maps.push({"from": from, "to": to});
		});
		index.maps = maps;
		return index;
}
	

sjs.validateIndex = function(index) {

		if (!index.title) {
			sjs.alert.message("Please give a text title or commentator name.")
			return false;
		}

		if (/[.\-\\\/]/.test(index.title)) {
			sjs.alert.message('Text titles may not contain periods, hyphens or slashes.');
			return false;
		}

		if ("categories" in index && (index.categories.length === 0 || index.categories[0] === "")) {
			sjs.alert.message("Please choose a text category.")
			return false;
		}
		if ("categories" in index && index.categories === "locked") {
			sjs.alert.message("Adding new texts to Tanach, Mishna and Talmud is currently locked. Please post to our Forum if you need to add a text to these categories.")
			return false;
		}
		if (index.sectionNames.length == 0 || index.sectionNames[0] === "") {
			if ( index.categories[0] !== "Commentary" ) {
				sjs.alert.message("Please describe at least one level of text structure.")
				return false;
			}
		}

		if (isHebrew(index.title)) {
			sjs.alert.message("Please enter a primary title in English. Use the Hebrew Title field to specify a title in Hebrew.")
			return false;
		}

		return true;
};


sjs.saveNewIndex = function(index) {

		var postJSON = JSON.stringify(index);
		var title = index["title"].replace(/ /g, "_");

		sjs.alert.saving("Saving text information...")
		$.post("/api/index/" + title,  {"json": postJSON}, function(data) {
			if (data.error) {
				sjs.alert.message(data.error);
			} else if ("oldTitle" in index) {
				// Full reload needed if primary name has changed
				$("#newIndex").hide();
				sjs.clearNewIndex();
				sjs.alert.message("Text information saved.");
				get(parseRef(data.title + " " + sjs.current.sections.join(" ")));
			} else {
				$("#newIndex").hide();
				sjs.books.push.apply(sjs.books, data.titleVariants);
				for (var i = 0; i < data.maps.length; i++)
					sjs.books.push(data.maps[i].from);
				sjs.bind.gotoAutocomplete();
				sjs.alert.clear();
				if (!sjs.editing.title) {
					// Prompt for text to edit if this edit didn't begin
					// as a edit of an existing text.
					$("#addText").trigger("click");
					$("#newTextName").val(data.title).trigger("textchange");
				} else {
					$.extend(sjs.current, index);
					if ("text" in sjs.current) {
						buildView(sjs.current);
					}
					sjs.alert.message("Text information saved.");
				}
				sjs.clearNewIndex();

			}
		});			
		
	};


sjs.translateText = function(data) {
	if ("error" in data) {
		sjs.alert.message(data.error);
		return;
	} 
	sjs.editing = data;
	sjs.current.langMode = 'he';
	if (data.sectionNames.length === data.sections.length) {
		sjs.editing.offset = data.sections[data.sections.length - 1];
	}
	sjs.showNewVersion();
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


function handleSaveSource() {
	if ($("#addSourceSave").text() == "Add Text") {
		// This is a an unknown text, add an index first
		var title = $("#addSourceCitation").val()
		$("#textTitle").val(title);
		$(".textName").text(title);
		$("#newIndexMsg").show();
		$("#header").text("Add a New Text");
		sjs.showNewIndex();
		return;
	}
	
	var source = readSource();
	if (validateSource(source)) {
		saveSource(source);
	} 
}


function readSource() {
	
	var source = {}
	var ref1 = sjs.add.source.ref.replace(/:/g, ".") 
	var ref2 = $("#addSourceCitation").val().replace(/:/g, ".");
	ref2 = makeRef(parseRef(ref2));
	
	source["refs"] = [ref1, ref2]
	delete source.ref
	
	var id = $(".open").attr("data-id");
	if (id) {
		source["_id"] = sjs.current.commentary[id]._id;
	}

	source["anchorText"] = $("#anchorForm input").val()
	source["type"] = $("#addSourceType select").val()
	if (source["type"] === "other") source["type"] = $("#otherType").val()
			
	return source
	
}


function handleDeleteSource(e) {
	if (!sjs._uid) {
		return sjs.loginPrompt();
	}		
	if (confirm("Are you sure you want to delete this source?")) {
		var link = {};
		var id = $(this).parents(".open").attr("data-id");
		var com = sjs.current.commentary[id];
		var url = ($(this).parents(".open").hasClass("noteMode") ? "/api/notes/" : "/api/links/") + com["_id"];
		$(".open").remove();
		$.ajax({
			type: "delete",
			url: url,
			success: function() { 
				hardRefresh()
				sjs.alert.message("Source deleted.");
			},
			error: function () {
				sjs.alert.message("Something went wrong (that's all I know).");
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
		sjs.alert.message("Please give this note a title.");
		return false; 
	}
	
	
	if (!note.text) {
		sjs.alert.message("Please enter a note text.");
		return false; 
	}

	return true; 
}


function handleSaveNote() {
	var note = readNote();	
	if (validateNote(note)) {
		saveSource(note);
	} 
}


function readNote() {
	var note = {
		ref: sjs.add.source.ref.replace(/:/g, "."),
		anchorText: $("#anchorForm input").val(),
		type:  $("#addSourceType select").val(),
		title: $("#addNoteTitle").val(),
		text: $("#addNoteTextarea").val()
	};

	var id = $(".open").attr("data-id");
	if (id) {
		note["_id"] = sjs.current.commentary[id]["_id"];
	}

	return note;
}


function saveSource(source) {
 	var postJSON = JSON.stringify(source);
	sjs.alert.saving("Saving Source…");
	$(".open").remove();
	var url = ("_id" in source ? "/api/links/" + source["_id"] : "/api/links/");
	$.post(url, {"json": postJSON}, function(data) {
		sjs.alert.clear();
		if (data.error) {
			sjs.alert.message(data.error);
		} else if (data) {
			// TODO add new commentary dynamically 
			hardRefresh(data.ref || data.refs[0]);
			sjs.alert.message("Source Saved.");		
		} else {
			sjs.alert.message("Sorry, there was a problem saving your source");
		}
	})
}


// Check if a div is overflowing
// TODO: don't assume $div is absolute

function overflows($div) {
	var h = $div.height();
	var $children = $div.children();
	for ( var i = 0; i < $children.length; i++) {
		var $c = $children.eq(i)
		if ($c.position().top + $c.outerHeight() > h ) {
			return true;
		}
	}
	return false;
}

// Determine is an element is scroll visible
// TODO: don't assume the parent is the scroll window

function isScrollVis($div) {
	var t = $div.offset().top
	var h = $div.parent().outerHeight();
	var pt = $div.parent().offset().top;
	
	if (t < pt) return false;
	if (t > pt + h) return false;
	
	return true;	
}


function checkTextDirection() {
	// Look at first 20 charaters, count Hebrew and English
	// adjust text direction accordingly 
	
	var text = $(this).val();
	if (text == "") return;
	
	var heCount = 0;
	var enCount = 0;
	var punctuationRE = /[0-9 .,'"?!;:\-=@#$%^&*()]/

	for (var i = 0; i < Math.min(40, text.length); i++) {
		if (punctuationRE.test(text[i])) { continue; }
		if ((text.charCodeAt(i) > 0x590) && (text.charCodeAt(i) < 0x5FF)) {
			heCount++;
		} else {
			enCount++;
		}
	}
	
	if (heCount >= enCount) {
		$(this).css("direction", "rtl");
		$("#language").val("he");
		
	} else {	
		$(this).css("direction", "ltr");
		$("#language").val("en");
	}
}


// ------ Text Syncing (matching textarea groups to labels or original text) -----------

htc = 0		
function handleTextChange(e) {
	// Special considerations every time the text area changes

	// Ignore arrow keys, but capture new char before cursor
	if (e.keyCode in {37:1, 38:1, 39:1, 40:1}) { 
		var cursor = sjs._$newVersion.caret().start;
		sjs.charBeforeCursor = sjs._$newVersion.val()[cursor-1];
		return; 
	}

	htc++

	var text = sjs._$newVersion.val();
	var cursor = sjs._$newVersion.caret().start;

	// BACKSPACE
	// Handle deleting border between segments 
	if (e.keyCode == 8 && sjs.charBeforeCursor == '\n') {		
		if (cursor) {
			
			// Advance cursor to end of \n seqeuence
			while (text[cursor] == "\n") cursor++;
			
			// Count back to beginning for total number of new lines
			var newLines = 0;
			while (text[cursor-newLines-1] == "\n") newLines++;
			
			// Remove the new lines
			if (newLines) {
				text = text.substr(0, cursor-newLines) + text.substr(cursor)
				sjs._$newVersion.val(text)
					.caret({start: cursor-newLines, end: cursor-newLines})

			}
		}
	}

	// ENTER
	// Insert placeholder "..." when hitting enter mutliple times to allow
	// skipping ahead to a further segment
	if (e.keyCode === 13 && (sjs.charBeforeCursor === '\n' || sjs.charBeforeCursor === undefined)) {
		text = text.substr(0, cursor-1) + "...\n\n" + text.substr(cursor);
		sjs._$newVersion.val(text);
		cursor += 4;
		sjs._$newVersion.caret({start: cursor, end: cursor});

	}

	// replace any single newlines with a double newline
	var single_newlines = /([^\n])\n([^\n])/g;
	if (single_newlines.test(text)) {
		text = text.replace(single_newlines, "$1\n\n$2");
		sjs._$newVersion.val(text);
		// move the cursor to the position after the second newline
		if (cursor) {
			cursor++;
			sjs._$newVersion.caret({start: cursor, end: cursor});
		}
	}
	

	// Sync Text with Labels	
	if ($("body").hasClass("newText")) {
		var matches = sjs._$newVersion.val().match(/\n+/g)
		var groups = matches ? matches.length + 1 : 1
		numStr = "";
		var offset = sjs.editing.offset || 1;
		for (var i = offset; i < groups + offset; i++) {
			numStr += "<div class='verse'>"+
				sjs.editing.smallSectionName + " " + i + "</div>"
		}
		$("#newTextNumbers").empty().append(numStr)

		sjs._$newNumbers = $("#newTextNumbers .verse")
		syncTextGroups(sjs._$newNumbers)

	} else {
		syncTextGroups($("#newTextCompare .verse"))

	}
	var cursor = sjs._$newVersion.caret().start;
	sjs.charBeforeCursor = sjs._$newVersion.val()[cursor-1];

}
	
gh = 0;
function groupHeights(verses) {
	// Returns an array of the heights (offset top) of text groups in #newVersion
	// where groups are seprated by '\n\n'
	// 'verses' is the maximum number of groups to look at

	gh++;

	var text = sjs._$newVersion.val();
	
	// Split text intro groups and wrap each group with in class heightMarker
	text =  "<span class='heightMarker'>" +
		text.replace(/\n/g, "<br>")
		.replace(/((<br>)+)/g, "$1<split!>")
		.split("<split!>")
		.join("</span><span class='heightMarker'>") +
		".</span>"; 
		// Last span includes '.', to prevent an empty span for a trailing line break.
		// Empty spans get no positioning. 

	// New Version Mirror is a HTML div whose contents mirror exactly the text area
	// It is shown to measure heights then hidden when done.
	sjs._$newVersionMirror.html(text).show();
	
	var heights = [];
	for (i = 0; i < verses; i++) {
		// Stop counting if there are less heightMarkers than $targets
		if (i > $('.heightMarker').length - 1) { 
			break; 
		}

		heights[i] = $(".heightMarker").eq(i).offset().top;
	}

	sjs._$newVersionMirror.hide();
	
	return heights;
}

stg = 0;
function syncTextGroups($target) {
	// Between $target (a set of elements) and textarea (fixed in code as sjs._$newVersion)
	// sync the height of groups by either adding margin-bottom to elements of $target
	// or adding adding \n between groups in newVersion.

	stg++;

	var verses = $target.length;
	var heights = groupHeights(verses);
	// cursorCount tracks the number of newlines added before the cursor
	// so that we can move the cursor to the correct place at the end
	// of the loop.
	var cursorCount = 0;
	var cursorPos = sjs._$newVersion.caret().start;

	for (var i = 1; i < verses; i++) {
		// top of the "verse", or label trying to match to
		var vTop = $target.eq(i).offset().top;

		// top of the text group
		var tTop = heights[i];

		var diff = vTop - tTop;

		if (!tTop) { break; }
		
		if (diff < 0) {
			// Label is above text group
			// Add margin-bottom to preceeding label to push it down

			var marginBottom = parseInt($target.eq(i-1).css("margin-bottom")) - diff;
			
			$target.eq(i-1).css("margin-bottom", marginBottom + "px");
			
		} else if (diff > 0) {
			// Text group is above label
			// First try to reset border above and try cycle again
			if (parseInt($target.eq(i-1).css("margin-bottom")) > 32) {
				$target.eq(i-1).css("margin-bottom", "32px");
				i--;
				continue;
			}
			// Else add extra new lines to push down text and try again
			var text = sjs._$newVersion.val();
			
			// search for new line groups i times to find the position of insertion
			var regex = new RegExp("\n+", "g");
			for (var k = 0; k < i; k++) {
				var m = regex.exec(text);
			}

			var nNewLines = Math.ceil(diff / 32); // divide by height of new line
			var newLines = Array(nNewLines+1).join("\n");
			text = text.substr(0, m.index) + newLines + text.substr(m.index);
			
			sjs._$newVersion.val(text);

			if (m.index < cursorPos) {
				cursorCount += nNewLines;
			}

			sjs._$newVersion.caret({start: cursorPos, end: cursorPos});
			heights = groupHeights(verses);
			i--;
		}	
	
	}
	if (cursorCount > 0) {
		cursorPos = cursorPos + cursorCount;
		sjs._$newVersion.caret({start: cursorPos, end: cursorPos});
	}

}

function readNewVersion() {
	
	var version = {};

	version.postUrl = sjs.editing.book.replace(/ /g, "_");
	for (var i= 0 ; i < sjs.editing.sectionNames.length - 1; i++) {
		version.postUrl += "." + sjs.editing.sections[i];
	}
	
	if ($("#originalRadio").prop("checked")) {
		version["versionTitle"] = "Sefaria Community Translation";
		version["versionSource"] = "http://www.sefaria.org";
	} else {
		version["versionTitle"] = $("#versionTitle").val();
		var source = $("#versionSource").val();
		if (source.indexOf(" ") == -1 && source.indexOf("http://") != 0) {
			source = source ? "http://" + source : source;
		} 
		version["versionSource"] = source;
	}

	var text = $("#newVersion").val();
	var verses = text.split(/\n\n+/g);
	for (var i=0; i < verses.length; i++) {
		// Treat "..." as empty
		verses[i] = (verses[i] === "..." ? "" : verses[i]);
	}
	if (sjs.editing.offset) {
		var filler = [];
		for (var i = 0; i < sjs.editing.offset -1; i++) {
			if (sjs.editing.versionTitle === version.versionTitle) {
				filler.push(sjs.editing.text[i]);
			} else {
				// TODO this may overwrite if i switch to a new version
				// which exists already.
				filler.push("");
			}
		}
		verses = filler.concat(verses);
	}
	version["text"] = verses;
	version["language"] = $("#language").val();

	return version;
	
}

	
function saveText(text) {
 	
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
				}
			} else {
				hardRefresh(ref);
				sjs.editing = {};
				sjs.alert.message("Text saved.");
			}


		}
	})
}


function lowlightOn(n, m) {
	// turn on lowlight, leaving verse n-m highlighted
	
	lowlightOff();
	m = m || n;
	n = parseInt(n);
	m = parseInt(m);
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
	sjs._$commentaryViewPort.find(".commentary").removeClass("lowlight");
	$(".verse").removeClass("lowlight");
	$(".verseControls").remove();
	sjs.selected = null;
}


function setVerseHeights() {
	// Store a list of the top height of each verse
	sjs._verseHeights = [];
	if (!sjs._$verses) return;
	sjs._$verses.each(function() {
		sjs._verseHeights.push($(this).offset().top);
	})	
}


function setScrollMap() {
	// Maps each commentary to a window scrollTop position, based on top positions of verses.
	// scrollMap[i] is the window scrollTop below which commentary i should be displayed at top.
	
	if(!sjs._verseHeights.length) setVerseHeights();
	sjs._scrollMap = [];
	var nVerses = sjs._$verses.length;

	// walk through all verses, split its space among its commentaries
	for (var i = 0; i < nVerses; i++) {
		
		// The top of the previous verse assigned:
		var prevTop = (i === 0 ?  0 : sjs._verseHeights[i-1]);
		// The number of commentaries this verse has:
		var nCommentaries = sjs._$commentaryViewPort.find(".commentary[data-vref="+ (i+1) + "]").length;
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


function clickEdit(e) {
	// Enable click editing on element e
	// when e is click a textarea will appear over it, change are put back into e
	
	var $text, top, left, width, height, pos, fontSize, dataNum;
	
	$text = $(this)
	pos = $text.offset()
	top = pos.top - 2
	left = pos.left - 2
	height = $text.height()
	width = $text.width()
	fontSize = $text.css("font-size");
	dataNum = $text.parent().attr('data-num');
	
	$(this).addClass("editing")
	
	var closeEdit = function (e) {
	
		var text = $(this).val();
		$(".editing").html(text);
		$(".editing").removeClass("editing");
		sjs.edits[dataNum] = true;
		
		$(this).remove() 
	}
	
	var text =  $text.text()
	
	$("<textarea id='" + dataNum + "' class='clickEdit'>" + text + "</textarea>")
		.appendTo("body")
		.css({"position": "absolute",
				"top": top,
				"left": left,
				"height": height,
				"width": width,
				"font-size": fontSize})
		.bind("focusout", closeEdit)
		.keypress(function(e) {
			if (e.keyCode == 13) $(this).trigger("focusout")
		}).focus()
}


function hardRefresh(ref) {	
	ref = ref || sjs.current.ref;
	sjs._direction = 0;
	sjs.cache.killAll();
	$(".screen").hide();
	actuallyGet(parseRef(ref));	
}


// -------- Special Case for IE ----------------
if ($.browser.msie) {
	$("#unsupported").show();
	$.isReady = true;
}
