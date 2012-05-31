var sjs = sjs || {};

$.extend(sjs,  {
	Init: {},
	bind: {},
	current: null,
	depth: 0,
	thread: [],
	view: null,
	trail: [],
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
		saving: false
	},
	add: {
		source: null
	},
	timers: {
		hideMenu: null
	},
	palette: ["#5B1094", "#00681C", "#790619", "#CC0060", "#008391", "#001866", "#C88900", "#009486", "#935A10", "#9D2E2C"],
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

	// load and build view for text in _initJSON
	sjs.Init.load();
};

sjs.Init._$ = function() {
	// ----------- Init Stored Elements ---------------
	sjs._$screen = $(".screen").eq(0);
	sjs._$basetext = $(".basetext").eq(0);
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

sjs.Init.load = function () {
	if ("error" in _initJSON) {
		sjs.alert.message(_initJSON.error);
		$("#header").text("<-- Open another text here.");
	} else {
		sjs.cache.save(_initJSON);
		History.replaceState(parseRef(_initJSON.ref), _initJSON.ref + " | Sefaria.org", null);
		buildView(_initJSON);	
	}
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
		resetSources();
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
	
	$(document).on('touch', '#open, #about', toggleBox)
				.on('mouseenter', '#open, #about', openBoxWrpr)	
				.on('mouseleave', '#open, #about', closeBox)
				.on('click touch', 'body', closeBox)
				.on("click touch",'#open, #about', function(e) { e.stopPropagation(); });

	// ---------------- Sources List ---------------
	

	$(document).on("click", ".sourcesHeader", function(e) {
		if (sjs._$sourcesList.is(":visible")) {
			sjs._$sourcesList.hide();
		} else if (sjs._$commentaryBox.hasClass("noCommentary") && sjs.current.commentary.length) {		  
	  		sjs._$basetext.removeClass("noCommentary");
			sjs._$commentaryBox.removeClass("noCommentary");
			sjs._$commentaryViewPort.fadeIn();
			$(".hideCommentary").show();
		} else if (sjs.current.commentary.length) {
			sjs._$sourcesList.show();
		}
		e.stopPropagation();
	});
	
	
	$(document).on("click", ".hideCommentary", function(e) {
		sjs._$basetext.addClass("noCommentary");
		sjs._$commentaryBox.addClass("noCommentary");
		sjs._$commentaryViewPort.fadeOut();
		$(this).hide();
		e.stopPropagation();
	});
	
		
	$(document).on("click", ".showCommentary", function(e) {
		sjs._$basetext.removeClass("noCommentary");
		sjs._$commentaryBox.removeClass("noCommentary");
		sjs._$commentaryViewPort.fadeIn();
		$(this).addClass("hideCommentary ui-icon-triangle-1-e")
			.removeClass("showCommentary ui-icon-triangle-1-w");
		e.stopPropagation();
	});
	
	$(document).on("click", ".source", function() {
		// Commentary filtering by clicking on source name
		 
		var c = $(this).attr("data-category")
		
		// Handle "All"
		if (c === "all") {
			$(".source").removeClass("lowlight")
			sjs._$commentaryViewPort.find(".commentary").show()
			return false;
		}
		
		// If all are on, first turn all off 
		if (!$(".source.lowlight").length){
			$(".source").addClass("lowlight")
			sjs._$commentaryViewPort.find(".commentary").hide()
		}
		
		// turn this on, if it's off
		if ($(this).hasClass("lowlight")) {
			$(this).removeClass("lowlight")
			$(".commentary[data-category='" + c + "']").show()
		} 
		// turn this off
		else {
			$(this).addClass("lowlight")
			$(".commentary[data-category='" + c + "']").hide()
		}
		
		if (!$(".source").not(".lowlight").length) {
			$(".source").removeClass("lowlight")
			sjs._$commentaryViewPort.find(".commentary").show()
		}
		
		return false;
	});
		
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
			}

		});
	
	
	// ---------------- Layout Options ------------------
		
		// TODO -- Abstract these 6 blocks
		
		$("#block").live("click", function(){
			$("#layoutToggle .toggleOption").removeClass("active");
			$(this).addClass("active");
			sjs._$basetext.addClass("lines");
			setVerseHeights();
			updateVisible();
		});
		
		$("#inline").live("click", function(){
			$("#layoutToggle .toggleOption").removeClass("active");
			$(this).addClass("active");
			sjs._$basetext.removeClass("lines");
			setVerseHeights();
			updateVisible();
		});
	
	// ------------------ Language Options ---------------
	
		$("#hebrew").live("click", function(){
			sjs.current.langMode = 'he';
			$("#languageToggle .toggleOption").removeClass("active");
			$(this).addClass("active");
			sjs._$basetext.removeClass("english bilingual heLeft")
				.addClass("hebrew");
			$("body").removeClass("english").addClass("hebrew");
			$("#layoutToggle").show();
			$("#biLayoutToggle").hide();
			setVerseHeights();
			updateVisible();
	
			return false;
		});
		
		$("#english").live("click", function(){
			sjs.current.langMode = 'en';
			$("#languageToggle .toggleOption").removeClass("active");
			$(this).addClass("active");
			sjs._$basetext.removeClass("hebrew bilingual heLeft")
				.addClass("english");
			$("body").removeClass("hebrew").addClass("english");
			$("#layoutToggle").show();
			$("#biLayoutToggle").hide();
			setVerseHeights();
			updateVisible();
	
			return false;
	
		});
		
		$("#bilingual").live("click", function() {
			sjs.current.langMode = 'bi';
			$("#languageToggle .toggleOption").removeClass("active");
			$(this).addClass("active");
			sjs._$basetext.removeClass("english hebrew")
				.addClass("bilingual heLeft");
			$("body").removeClass("hebrew").addClass("english");
			$("#layoutToggle").hide();
			$("#biLayoutToggle").show();
			setVerseHeights();
			updateVisible();
	
			return false;
	
		});
		
		$("#heLeft").live("click", function() {
			$("#biLayoutToggle .toggleOption").removeClass("active")
			$(this).addClass("active")
			sjs._$basetext.removeClass("english hebrew")
				.addClass("bilingual heLeft");
			setVerseHeights();	
			updateVisible();
	
			return false;
		});
	
		$("#enLeft").live("click", function() {
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

	
	// ------------- Make Table of Contents ------------------

	$.getJSON("/index/", makeToc);


	
// -------------- Edit Text -------------------
	

sjs.editText = function(data) {
		if (!_user.length) {
			return sjs.loginPrompt();
		}
		sjs.editing.book = data.book;
		sjs.editing.sections = data.sections;
		sjs.editing.sectionNames = data.sectionNames;
		sjs.editing.smallSectionName = data.sectionNames[data.sectionNames.length-1];
		sjs.editing.bigSectionName = data.sectionNames[data.sectionNames.length-2];
		
		if (sjs.current.langMode === 'en') {
			sjs.editing.versionTitle = data.versionTitle;
			sjs.editing.versionSource = data.versionSource;
			sjs.editing.heVersionTitle = data.heVersionTitle;
			sjs.editing.heVersionSource = data.heVersionSource;
			sjs.editing.text = data.text;
			sjs.editing.he = data.he;
		} else {
			sjs.editing.versionTitle = data.heVersionTitle;
			sjs.editing.versionSource = data.heVersionSource;
			sjs.editing.text = data.he;
		}
		
		sjs.editing.msg = "Edit Text";
		
		sjs.showNewText();
		
		var text = sjs.editing.text.join('\n\n');
		$('#newVersion').val(text).trigger('keyup');
		$('#versionTitle').val(sjs.editing.versionTitle);
		$('#versionSource').val(sjs.editing.versionSource);

		// Set radio buttons for original/copy to appropriate state
		if ($("#versionTitle").val() in {"Sefaria Community Translation":1, "":1}) {
			$("#textTypeForm input#originalRadio").trigger("click");
		} else {
			$("#textTypeForm input#copyRadio").trigger("click");
		}
	};

sjs.editCurrent = function(e) {
	sjs.editText(sjs.current);
	e.stopPropagation();
};

	$("#editText").click(sjs.editCurrent);
	$(document).on("click", ".addThis", sjs.editCurrent);


// ---------------- Edit Text Info ----------------------------

sjs.editTextInfo = function(){
	if (!_user.length) {
		return sjs.loginPrompt();
	}
	sjs.showNewIndex();
	$("#newIndexMsg").hide();
	$("#header").text("Edit Text Information");
	$("#textTitle").val(sjs.current.book);
	$("#textTitleVariants").val(sjs.current.titleVariants.slice(1).join(", "));
	$("#textCategory").val(sjs.current.type);
	
	// Add additional section name boxes if needed
	for (var i = 2; i < sjs.current.sectionNames.length; i++) {
		$("#addSection").trigger("click");
	}
	
	// Fill each box with the name c
	$(".sectionType").each(function(){
		$(this).find("input").val(sjs.current.sectionNames[$(this).index()]);
	});
	
	for (var i = 1; i < sjs.current.maps.length; i++) {
		$("#addShorthand").trigger("click");
	}
	
	$(".shorthand").each(function(){
		if (!sjs.current.maps.length) return;
		$(this).find(".shorthandFrom").val(sjs.current.maps[$(this).index()].from);
		$(this).find(".shorthandTo").val(sjs.current.maps[$(this).index()].to);

	});
	
};

	$("#editTextInfo").click(sjs.editTextInfo);


// ------------- New Text --------------------------
	
	checkNewTextRef = function() {
		// Check ref function for new text UI
		checkRef($("#newTextName"), $("#newTextMsg"), $("#newTextOK"), 1, function(){}, false);
	};
	
	
	$("#newText").click(function(e) {
		if (!_user.length) {
			return sjs.loginPrompt();
		}
		$(".boxOpen").removeClass("boxOpen");
		$("#overlay").show();
		$("#newTextModal").show()
			.position({of: $(window)});
		$("#newTextName").focus();
		$("#newTextOK").addClass("inactive");
		
		$("input#newTextName").autocomplete({ source: sjs.books, minLength: 2, select: checkNewTextRef});
		$("#newTextName").blur(checkNewTextRef);
		$("#newTextName").bind("textchange", function(e) {
			if (sjs.timers.checkNewText) clearTimeout(sjs.timers.checkNewText);
			sjs.timers.checkNewText = setTimeout("checkNewTextRef();", 250);
		});
		sjs.ref.tests = null;
	
		// prevent about from unhiding itself
		e.stopPropagation()
	
	});
	
	$("#showOriginal").click(function(){
		$("body").toggleClass("newText");
		$("#newVersion").trigger("keyup");
		console.log("should have")
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
			sjs.editing.section = sjs.editing.index.sections;
			sjs.editing.sectionNames = sjs.editing.index.sectionNames;		
			sjs.editing.smallSectionName = sjs.editing.sectionNames[sjs.editing.sectionNames.length-1];
			sjs.editing.bigSectionName = sjs.editing.sectionNames[sjs.editing.sectionNames.length-2];
			sjs.editing.msg = "Add a New Text";
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
		sjs.clearNewIndex();
		$("#newIndex").hide();
		sjs._direction = 0;
		buildView(sjs.current);
	})


	
// --------------- Add Version  ------------------
	
	$("#addVersion").click(function(e) {
		if (!_user.length) {
			return sjs.loginPrompt();
		}

		// Edit the SCT if it exists rather than offering a box to write a new one
		// to avoid unintentionally overwriting 
		if (sjs.current.versionTitle === "Sefaria Community Translation") {
			$("#english").trigger("click");
			sjs.editText(sjs.current);
			$("#showOriginal").trigger("click");
			sjs._$newVersion.css("min-height", $("#newTextCompare").height()).show().focus().elastic()

		} else {
			if (sjs._$basetext.hasClass("bilingual")) {
				$("#hebrew").trigger("click");
			}
			sjs.editing = sjs.current;
			sjs.showNewVersion()
		}
		e.stopPropagation();
	});
	
	$("#addVersionCancel").click(function() { sjs.clearNewVersion() });
	
	$("#addVersionSave").click(function() {
		var version = readNewVersion();
		
		if (validateText(version)) {
			saveText(version);
		}
	})


sjs.showNewVersion = function() {
	
	sjs.editing.compareText = sjs.current.langMode == "en" ? sjs.editing.text : sjs.editing.he;
	sjs.editing.compareLang = sjs.current.langMode;

	sjs.editing.smallSectionName = sjs.editing.sectionNames[sjs.editing.sectionNames.length-1];
	sjs.editing.bigSectionName = sjs.editing.sectionNames[sjs.editing.sectionNames.length-2];

	sjs.showNewText();
	
	sjs._$newVersion.css("min-height", $("#newTextCompare").height()).show().focus().elastic()

	var title = sjs.current.langMode == "en" ? sjs.editing.versionTitle : sjs.editing.heVersionTitle;
	var source = sjs.current.langMode == "en" ? sjs.editing.versionSource : sjs.editing.heVersionSource;
	$(".compareTitle").text(title);
	$(".compareSource").text(source);

	$("#versionSource").val("");
	$("body").removeClass("newText");
}


sjs.makeCompareText = function() {
	// Create DOM elements for comparison text while editing (usually, original text)
	// Assumes sjs.editing.compareText and sjs.editing.compareLang

	var compareText = sjs.editing.compareText;
	if (!compareText.length) { 
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
	
	sjs.clearNewText();

	$(".open, .verseControls").remove();
	$("#viewButtons, #prev, #next, #about, #breadcrumbs").hide();
	$("#editButtons").show();
	
	$(window).scrollLeft(0)
		.unbind("scroll", updateVisible)
		.unbind("resize", updateVisible);
	$(".boxOpen").removeClass("boxOpen");

	$("#header").text(sjs.editing.msg);
		
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
	
	$("body").addClass("newText");
	sjs._$commentaryBox.hide();
	sjs._$basetext.hide();
	$("#addVersionHeader").show();
	
	var verse_num = sjs.editing.offset || 1;
	$("#newTextNumbers").append("<div class='verse'>" + 
		sjs.editing.smallSectionName + " " + verse_num + "</div>");

	$("#newVersion").bind("textchange", checkTextDirection)
		.bind("keyup", handleTextChange)
		.bind("click", handleTextChange)
		.elastic()
		.show()
		.focus();

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
				sjs._$newVersion.val(sjs.current.text.join("\n\n"))
					.trigger("keyup");
			}
			$("#textTypeForm").addClass("original");
		}
	});

	// Autocomplete version title with existing, autofill source for existing versions
	$.getJSON("/texts/versions/" + sjs.editing.book, function(data) {
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

	// Set radio buttons for original/copy to appropriate state
	if ($("#versionTitle").val() in {"Sefaria Community Translation":1, "":1}) {
		$("#textTypeForm input#originalRadio").trigger("click");
	} else {
		$("#textTypeForm input#copyRadio").trigger("click");
	}
	
	$("#newVersionBox").show();
};

	
sjs.clearNewText = function() {
	sjs.alert.clear();
	$("#newTextNumbers").empty();
	$("#versionTitle, #versionSource").val("");
	$("#newVersion").val("").unbind();
	$("#textTypeForm input").unbind();
	$("#newVersionBox").hide();

};	

	
sjs.showNewIndex = function() {
	$(".boxOpen").removeClass("boxOpen");
	$("#viewButtons, #prev, #next, #about, #breadcrumbs #overlay").hide();
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
	
	$("#addShorthand").unbind().click(function() {
		$(this).before('<div class="shorthand"><input class="shorthandFrom" /> ' + 
			'⇾ <input class="shorthandTo"/> <span class="remove">X</span>');
	});
	
	$(document).on("click", ".remove", function() {
		$(this).parent().remove();
	});
			
	$("#newIndex").show();
};
	

sjs.clearNewIndex = function() {
		$("#newIndexMsg").show();
		$("#newIndex input, #newIndex select").val("");
		$(".sectionType:gt(1)").remove();
		$(".shorthand:not(:first)").remove();
		$("#addShorthand").unbind();
		$("#addSection").unbind();

}	
	

sjs.validateIndex = function(index) {

		if (!index.title) {
			sjs.alert.message("Please give a text title or commentator name.")
			return false;
		}
		if ("categories" in index && (index.categories.length === 0 || index.categories[0] === "")) {
			sjs.alert.message("Please choose a text category.")
			return false;
		}
		if (index.sectionNames.length == 0 || index.sectionNames[0] === "") {
			if ( index.categories[0] !== "Commentary" ) {
				sjs.alert.message("Please describe at least one level of text structure.")
				return false;
			}
		}

		return true;
};
	
	
sjs.readNewIndex = function() {
		var index = {};
		
		index.title = $("#textTitle").val();
		var titleVariants = $("#textTitleVariants").val();
		index.titleVariants = titleVariants.length ? titleVariants.split(", ") : [];
		index.titleVariants.unshift(index.title);
		var cat = $("#textCategory").val();
		// Don't allow category updates to Tanach of Misna
		// HACK to deal with incomplete handling on subcategories 
		if (!(cat in {"Tanach": 1, "Mishna": 1})) {
			index.categories = (cat == "Other" ? [$("#otherCategories").val()] : [cat]);
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
		console.log(index)
		return index;
	
	}
	
sjs.saveNewIndex = function(index) {

		var postJSON = JSON.stringify(index);
		var title = index["title"].replace(/ /g, "_");

		sjs.alert.saving("Saving text information...")
		$.post("/index/" + title,  {"json": postJSON}, function(data) {
			if (data.error) {
				sjs.alert.message(data.error);
			} else {
				//sjs.alert.message("Text information saved.");
				$("#newIndex").hide();
				sjs.clearNewIndex();
				sjs.books.push.apply(sjs.books, data.titleVariants);
				for (var i = 0; i < data.maps.length; i++)
					sjs.books.push(data.maps[i].from);
				sjs.bind.gotoAutocomplete();
				buildView(sjs.current);
				sjs.alert.clear();
				$.getJSON("/index/", makeToc);
				$("#newText").trigger("click");
				$("#newTextName").val(data.title).trigger("textchange");
			}
		});			
		
	};


		
		
// ------ Text Syncing --------------
		
		function handleTextChange(e) {
			// Handle deleting border between segments 
			if (e.keyCode == 8 && sjs.charBeforeCursor == '\n') {
				var cursor = sjs._$newVersion.caret().start;
				
				if (cursor) {
					var text = sjs._$newVersion.val();
					
					while (text[cursor] == "\n") cursor++;
					
					var newLines = 0;
					while (text[cursor-newLines-1] == "\n") newLines++;
					
					if (newLines) {
						text = text.substr(0, cursor-newLines) + text.substr(cursor)
						sjs._$newVersion.val(text)
							.caret({start: cursor-newLines, end: cursor-newLines})
					}
				}
			}
		
			// replace any single newlines with a double newline
			var cursor = sjs._$newVersion.caret().start;
			single_newlines = /([^\n])\n([^\n])/g;
			var text = sjs._$newVersion.val();
			if (single_newlines.test(text)) {
				text = text.replace(single_newlines, "$1\n\n$2");
				sjs._$newVersion.val(text);
				// move the cursor to the position after the second newline
				if (cursor) {
					cursor++;
					sjs._$newVersion.caret({start: cursor, end: cursor});
				}
			}
				
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
				syncTextGroups(sjs._$newNumbers, e.keyCode)
	
			} else {
				syncTextGroups($("#newTextCompare .verse"), e.keyCode)
	
			}
			var cursor = sjs._$newVersion.caret().start;
			sjs.charBeforeCursor = sjs._$newVersion.val()[cursor-1];
	
		}
	
		
		function checkTextDirection() {
			// Look at first 20 charaters, count Hebrew and English
			// adjust text direction accordingly 
			
			var text = $(this).val()
			if (text == "") return
			
			var heCount = 0;
			var enCount = 0;
			
			for (var i = 0; i < 20; i++) {
				if (i >= text.length) break;
				if ((text.charCodeAt(i) > 0x590) && (text.charCodeAt(i) < 0x5FF)) {
					heCount++
				} else {
					enCount++
				}
			}
			
			if (heCount > enCount) {
				$(this).css("direction", "rtl")
				$("#language").val("he")
				
			} else {	
				$(this).css("direction", "ltr")
				$("#language").val("en")
	
			}
		}
	

	
	
	// ---------------------- Commentary Modal --------------------------
		
		$(document).on("click", ".commentary", function(e){
			if ($(this).hasClass("lowlight")) {
				lowlightOff();
			}
			buildOpen($(e.currentTarget))
			return false;
		});
		
	
	
	// ----------------------- Commentary Edit --------------------
	
		$(document).on("click", ".editLink", function () {
			if (!_user.length) {
				return sjs.loginPrompt();
			}
			var $o = $(this).parents(".open");
			var source = {};
			
			source["id"] = parseInt($o.attr("data-id"));
			source["ref"] =  sjs.current.commentary[source["id"]].anchorRef
			sjs.add.source = source;
			
			buildOpen(false, true);
		})

		
	// ------------------- Commentary Model Hide ----------------------
	
		$(document).on("click", ".open", function(){ return false; })
		
	
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
			if (!_user.length) {
				return sjs.loginPrompt();
			}
			
			var ref = $(this).attr("data-ref");
			var data = sjs.cache.get(ref);
			
			if (data) {
				sjs.translateText(data);
			} else {
				sjs.alert.saving("Looking up text...");
				$.getJSON("/texts/" + makeRef(pareseRef(ref)), sjs.translateText);
			}

		});
	
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
	
	// -------------- Highlight Commentary on Verse Click -------------- 
	
	$(document).on("click", ".verse", handleVerseClick );
	
	function handleVerseClick(e) {
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

		console.log(sjs.selected)

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
					'<span class="copyToClipboard">Copy to clipboard</span>' + 
				'</div>' +
				'</div>';
			$("body").append(verseControls);
			$(".verseControls").click(function(e){ return false; });
			$(".verseControls span").click(function() { $(".verseControls").remove(); });
			$(".verseControls .addSource").click(addToSelected);
			$(".verseControls .addNote").click(addNoteToSelected);
			$(".verseControls .addToSheet").click(addSelectedToSheet);
			$(".verseControls .copyToClipboard").click(copySelected);

		}
	
		// Scroll commentary view port
		var $comments = $();
		for (var i = v[0]; i <= v[1]; i++ ) {
			$more = sjs._$commentaryBox.find(".commentary[data-vref=" + i + "]");
			console.log($more);
			$comments = $comments.add($more);
		} 
		console.log($comments)

		var $fc = $comments.eq(0);
		if ($fc.length == 1) {	
			var top = $(window).scrollTop() - $(this).offset().top + 120 ;					
			sjs._$commentaryViewPort.clearQueue().scrollTo($fc, {duration: 600, offset: top, easing: "easeOutExpo"})
		
		}
		sjs._$sourcesCount.text($comments.length);
		sjs._$sourcesWrapper.html(sourcesHtml(sjs.current.commentary, v[0], v[1]));
		return false;
	}

	function addToSelected() {
		if (!_user.length) {
			return sjs.loginPrompt();
		}
		$("#overlay").show();
		sjs.flags.verseSelecting = false;
		sjs.add.source = {ref: sjs.selected};
		buildOpen();

		return false;
	}
	

	function addNoteToSelected() {
		if (!_user.length) {
			return sjs.loginPrompt();
		}
		addToSelected();
		$("#addSourceType select").val("note").trigger("change");
		$(".open").position({of: $(window)});
	}


	function copySelected(e) {
		sjs.alert.copy(sjs.selected +":\n\n" + 
			$(".verse").not(".lowlight").find(".en").text() + "\n\n" +
			$(".verse").not(".lowlight").find(".he").text());
	}

// --------------- Add to Sheet ----------------

	function addSelectedToSheet() {
		if (!_user.length) {
			return sjs.loginPrompt();
		}
		// Get sheet list if necessary
		if (!$("#sheets .sheet").length) {
			$("#sheets").html("Loading...");
			$.getJSON("/api/sheets/", function(data) {
				$("#sheets").empty();
				var sheets = "";
				for (i = 0; i < data.sheets.length; i++) {
					sheets += '<li class="sheet" data-id="'+data.sheets[i].id+'">'+
						data.sheets[i].title + "</li>";
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
		
	}

	$("#addToSheetModal .cancel").click(function() {
		$("#overlay, #addToSheetModal").hide();
	})

	$("#addToSheetModal .ok").click(function(){
		if (sjs.flags.saving === true) {
			return false;
		}

		var selected = $(".sheet.selected");
		if (!selected.length) {
			sjs.alert.message("Please selecte a source sheet.");
			return false;
		}

		var url = "/api/sheets/" + selected.attr("data-id") + "/add";
		sjs.flags.saving = true;
		$.post(url, {ref: sjs.selected}, function(data) {
			sjs.flags.saving = false;
			$("#addToSheetModal").hide();
			if ("error" in data) {
				sjs.alert.message(data.error)
			} else {
				sjs.alert.message(data.ref + " added to "+selected.html()+".<br><a target='_blank' href='/sheets/"+data.id+"'>View sheet.</a>")
			}
		})

	});

	// --------------- Add Source ------------------------
	
	$(document).on("click", ".addSource", function(){
		if (!_user.length) {
			return sjs.loginPrompt();
		}
		sjs._$commentaryBox.hide();
		$(".smallSectionName").text(sjs.current.sectionNames[sjs.current.sectionNames.length-1]);
		$("#verseSelectModal").show();
		$("#selectConfirm").hide();
		$("#selectInstructions").show();
		sjs.flags.verseSelecting = true;
		sjs.ref.tests = null;
		
		if ($(".lowlight").length) {
			$(".verse").not($(".lowlight")).trigger("click");
		}
		
		return false;
	})
	$(document).on("click", "#addSourceCancel", function() {
		$(".open").remove();
		$("#overlay") .hide();
		sjs.ref.tests = null;
		
	})
	
	$("#addModal").click(function() {
		return false;
	})
	
	// --------------- Verse Select ----------------
	
	$("#selectVerse").click(function() {
		$("#addModal, #overlay").hide();
		sjs._$commentaryBox.hide();
		sjs._$sourcesBox.hide();
		$("#verseSelectModal").show();
		sjs.flags.verseSelecting = true;
		
	})
	
	$("#verseSelectModal #selectOk").click(function() {
		$("#overlay").show();
		buildOpen();
		sjs._$commentaryBox.show();
		sjs._$sourcesBox.show();
		$("#verseSelectModal").hide();
		lowlightOff();
		sjs.flags.verseSelecting = false;
		return false;
		
	})
	
	$("#selectReset").click(function() {
		$("#selectInstructions").show();
		$("#selectConfirm").hide();
	
	})
	
	$("#verseSelectModal .cancel").click(function() {
		$("#verseSelectModal").hide();
		if (sjs.current.commentary) sjs._$commentaryBox.show();
		sjs.flags.verseSelecting = false;
	
	})
	
	// ------------- Nav Queries -----------------
	
			
	$("#goto").keypress(function(e) {
			if (e.keyCode == 13) {
				q = parseRef($("#goto").val());
				sjs._direction = 1;
				get(q);
			}
		})
		
	sjs.bind.gotoAutocomplete();
		
	
}); // ---------------- End DOM Ready --------------------------

sjs.bind = {
	// Beginning to pull all event bindings into one place here
	windowScroll: function() {
		$(window).unbind("scroll.update");
		$(window).bind("scroll.update", updateVisible);
	}, 
	gotoAutocomplete: function() {
		$("input#goto").autocomplete({ source: sjs.books });
	}
}

function get(q) {
	History.pushState(q, q.ref + " | Sefaria.org", "/" + makeRef(q));
}

function actuallyGet(q) {
	// take an object representing a query
	// get data from api or cache
	// prepare a new screen for the text to live in
	// callback on buildView
	
	var direction = (sjs._direction == null ? -1 : sjs._direction);
	sjs.depth += direction;
	sjs._direction = null;

	var ref = makeRef(q);
	var sliced = false;
	for (var i = 0; i < sjs.thread.length; i++) {
		if (sjs.thread[i] == ref) {
			sjs.thread = sjs.thread.slice(0, i+1);
			sliced = true;
		} 
	}
	
	if (!sliced ) sjs.thread.push(ref);
	
	sjs.updateBreadcrumbs();

	sjs.loading = true;
	$("#header").html(q.book.replace(/_/g, " ") + "...");

	$("#open, .boxOpen").removeClass("boxOpen");	
	$("#layoutToggle, #languageToggle, #overlay").hide();
	$("#goto").val("");
	$(".open").remove();
	$(".screen").addClass("goodbye");
	
	
	// Add a new screen for the new text to fill
	var screen = '<div class="screen">' +
						'<div class="basetext english"></div>' +
						'<div class="commentaryBox">' +
							'<div class="commentaryViewPort">' +
							'</div>'+
							'<div class="sourcesBox">'+
								'<div class="sourcesHeader">'+
									'<span class="hideCommentary ui-icon ui-icon-triangle-1-e"></span>'+
									'<b><span class="sourcesCount"></span> Sources</b>'+
									'<span class="ui-icon-triangle-1-s ui-icon"></span>'+
									'<span class="addSource">Add source <span class="textIcon">+</span></span>'+
									'<div class="clear"></div>'+
								'</div>' +	
								'<div class="sourcesList gradient"><div class="sourcesWrapper"></div></div>' +
							'</div>' +
						'</div>';
	
	$(".screen-container").append(screen);
	
	var $screen = $(".screen").last();
	
	// Copy old basetext classes (display, lang settings) to new basetext
	$screen.find(".basetext").attr("class", $(".goodbye").find(".basetext").attr("class")).removeClass("goodbye");
	$screen.attr("class", $(".goodbye").attr("class")).removeClass("goodbye");

	
	// Set screens far to the left to allow many backwards transitions
	$screen.css("left", 5000 + (sjs.depth * 100) + "%");
	
	var top = $(window).scrollTop() + ($(window).height() * .09);
	var height = $(window).height() * .9;
	sjs._$commentaryBox.css({"position": "absolute", "top": top + "px", "height": height, "bottom": "auto"});
	
	sjs._$screen = $screen;
	sjs._$basetext = $(".basetext").last();
	sjs._$commentaryBox = $(".commentaryBox").last();
	sjs._$commentaryViewPort = $(".commentaryViewPort").last();
	sjs._$sourcesBox = $(".sourcesBox").last();
	sjs._$sourcesWrapper = $(".sourcesWrapper").last();
	sjs._$sourcesCount = $(".sourcesCount").last();
	sjs._$sourcesList = $(".sourcesList").last();
	sjs._$sourcesHeader = $(".sourcesHeader").last();

	sjs._$commentaryBox.css({"position": "absolute", "top": top + "px", "bottom": "auto"}); 
	
	var ref = makeRef(q);
	if (sjs.cache.get(ref)) {
		buildView(sjs.cache.get(ref));
	} else {
		$.getJSON("/texts/" + ref, buildView)
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
		$("#about").appendTo("body"); // move about out of basetext so it isn't lost
		$basetext.empty().removeClass("noCommentary versionCompare").show();
		$("body").removeClass("newText");
		$commentaryBox.removeClass("noCommentary").hide(); 
		$commentaryBox.find(".commentary").remove();
		$("#addVersionHeader, #newVersion, #editButtons").hide();
		$("#viewButtons, #breadcrumbs").show();		
		
		sjs.cache.save(data);
		var langMode = sjs.current ? sjs.current.langMode : 'en';
		sjs.current = data;
		sjs.current.langMode = langMode;
		
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
		
		// Texts that default to lines view
		if (data.type in {Mishna:1, Commentary:1, Halacha:1, Midrash:1} || data.book in {Psalms:1}) {
			$("#block").trigger("click");
		}
		
		// Build basetext
		var emptyView = "<span class='btn addThis empty'>Add this Text</span>"+
			"<i>No text available.</i>";
		
		basetext = basetextHtml(data.text, data.he, "", data.sectionNames[data.sectionNames.length - 1]);
		if (!basetext) {
			basetext = emptyView;
			$("#english").trigger("click");
			$("#viewButtons").hide();
		} 
		
		if (data.title) 
			var basetextTitle = data.title;
		else {
			var basetextTitle = data.book.replace(/_/g, " ");
			for (var i = 0; i < data.sectionNames.length-1; i++) {
				basetextTitle += " : " + data.sectionNames[i] + " " + data.sections[i];
			}	
		}
		
			
		basetext = "<div class='sectionTitle'>" + basetextTitle + "</div>" + 
			"<span class='spacer'></span>" +
			basetext +
			"<div class='clear'></div>"; 
		$basetext.html(basetext);
		$("#about").appendTo($basetext.find(".sectionTitle"));

		sjs._$verses = $basetext.find(".verse");
	
		$("#about, #next, #prev").css("visibility", "visible").show();

	
		$("#aboutVersions").html(aboutHtml());	
		if (data.type == "Commentary")
			$("#editTextInfo").hide(); // Can't handle this case yet
		else
			$("#editTextInfo").show();
		if ("sources" in data) {
			$("#editText").hide(); // Can't handle editing a merged text
		} else {
			$("#editText").show();
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
		} else {
			$sourcesCount.text("0").show();
			$basetext.addClass("noCommentary");
			$sourcesBox.addClass("noCommentary");
			$commentaryBox.show().addClass("noCommentary");
			$(".hideCommentary").hide();
		}
		sjs._$commentary = $commentaryBox.find(".commentary");								

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
		var scrollXDur = sjs._direction == 0 ? 0 : 600;
		var scrollYDur = sjs._direction == 0 ? 0 : 200;

		// Animate horizonatally to new screen	
		$('.screen-container').css('position', 'fixed');
		$('.screen-container').animate({left: '-' + (5000 + (sjs.depth * 100)) + "%"}, {duration: scrollXDur, complete: function() {
			$('.goodbye').remove();
			$(this).css('position', 'relative');
			sjs._$commentaryBox.css({"position": "fixed", "bottom": "0px", "top": "auto"});
			sjs._verseHeights = [];
			setScrollMap();
			// Scroll vertically to the highlighted verse if any
			$highlight = sjs._$basetext.find(".verse").not(".lowlight").first();
		 	if ($highlight.length) {
				$.scrollTo($highlight, {offset: -200, axis: "y", duration: scrollYDur});
		 	}
		 	var header = sjs.current.book  + " " +
				sjs.current.sections.slice(0, sjs.current.sectionNames.length-1).join(":");
		 	$("#header").html(header);
		}});
		

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

			var enText = wrapRefLinks(en[i]) || "<div class='btn addThis'>Add English for "+sectionName+ " " +(i+1) + "</div>";
			var heText = he[i] || "<div class='btn addThis'>Add Hebrew for "+sectionName+ " " +(i+1) + "</div>";
			var n = prefix + (i+1);
			var verse =
				"<div class='verseNum'> " + n + " </div>" +
				'<span class="en">' + enText + "</span>" +
				'<span class="he">' + heText + '</span><div class="clear"></div>';

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
		var commentaryIndex = {};
		var commentaryHtml = "";
		var n = 0; // number of assiged color in pallette
		
		for (var i = 0; i < commentary.length; i++) {
			var c = commentary[i];
	
			if (c.error) {
				console.log(c.error);
				continue;
			}
			var key = c.type == "note" ? i : c.ref ;

			if (key in commentaryIndex) {
				com = commentaryIndex[key];
				c.anchorVerse = com.vref + " " + c.anchorVerse;
			}

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
			
			var enText = c.text || c.he || "[text not found]";
			var heText = c.he || c.text || "[text not found]";

			enText = (isArray(enText) ? enText.join(" ") : enText);
			heText = (isArray(heText) ? heText.join(" ") : heText);

			enText = wrapRefLinks(enText);

			var commentaryObject = {};			
			commentaryObject.vref = c.anchorVerse;
			commentaryObject.cnum = c.commentaryNum;
			commentaryObject.commentator = c.commentator;
			commentaryObject.html = "<span class='commentary " + classStr + 
				"' data-vref='" + c.anchorVerse + 
				"' data-id='" + i +
				"' data-category='" + c.category +
				"' data-type='" + c.type +
				"' data-ref='" + (c.ref || "") + "'>" + 
				"<span class='commentator" + (c.ref ? " refLink" : "") + "'" + 
					" style='color:" + sources[c.commentator].color + 
					"' data-ref='"+ (c.ref || "") +"'>" + c.commentator + 
							(c.category == "Talmud" ? " " + parseRef(c.ref).sections[0] : "") + 
				":</span><span class='anchorText'>" + c.anchorText + 
				"</span><span class='text'><span class='en'>" + enText + 
				"</span><span class='he'>" + heText + "</span></span></span>";
			
			commentaryIndex[key] = commentaryObject;		
		} 


		var commentaryObjects = []

		for (key in commentaryIndex) {
			commentaryObjects.push(commentaryIndex[key]);
		}

		// Sort commentary 
		commentaryObjects.sort(function (a,b) {
			if (a.vref != b.vref) {
				return (a.vref > b.vref) ? 1 : -1;
			}
			if (a.cnum != b.cnum) {
				return (a.cnum > b.cnum) ? 1 : -1; 
			} 
			if (a.commentator != b.commentator) {
				return (a.commentator > b.commentator) ? -1 : 1; 
			} 
			return 0;
		})
		
		for (var i = 0; i < commentaryObjects.length; i++) {
			commentaryHtml += commentaryObjects[i].html;
		}

		$commentaryViewPort.append(commentaryHtml)
		$sourcesWrapper.html(sourcesHtml(commentary));
		$sourcesCount.html(commentary.length);
		$commentaryBox.show();	
	
	
	}
	
	function sourcesHtml(commentary, selected, selectedEnd) {
		if (!selected) { var selected = selectedEnd = 0; }

		var sources = {};
		var sourceTotal = 0;
		var n = 0;
		var html = "<div class='source' data-category='all'>All <span class='count'>("; 

		for (var i = 0; i < commentary.length; i++) {
			var c = commentary[i];
	
			if (c.error) {
				console.log(c.error);
				continue;
			}

			if (selected && (c.anchorVerse < selected || c.anchorVerse > selectedEnd)) { continue; }
	
			// Give each Commentator a Color
			if (!(c.category in sources)) {
				var color = sjs.palette[n];
				var source = {count: 0, color: color, html: ""};

				n = (n+1) % sjs.palette.length;
				sources[c.category] = source;
			}
			sources[c.category].count++;
			sourceTotal++;
		}

		html += sourceTotal + ")</span></div>";
		// Build source counts
		for (category in sources) {
			sources[category].html += '<div class="source" data-category="' + category +
				'" style="color:'+ sources[category].color +
				'"><span class="cName">'+
				category+'</span><span class="count">('+ sources[category].count+')</div>';
		}
		// Sort sources count and add them
		var sortable = [];
		for (var source in sources) {
				sortable.push([source, sources[source].count, sources[source].html])
		}
		sortable.sort(function(a, b) {return b[1] - a[1]})
		for (var i = 0; i < sortable.length; i++) {
			html += sortable[i][2];
		}			
		html += "<div class='clear'></div>";

		return html;
	}

	function resetSources() {
		sjs._$sourcesWrapper.html(sourcesHtml(sjs.current.commentary));
		sjs._$sourcesCount.html(sjs.current.commentary.length);
		sjs._$commentaryBox.find(".commentary").show();
	}

	function aboutHtml(data) {
		data = data || sjs.current;

		var enTitle = data.versionTitle || "Source Unknown";
		var heTitle = data.heVersionTitle || "Source Unknown";
		var enSource = data.versionSource || ""; 
		var heSource = data.heVersionSource || "";
		var aboutTitle = "<span class='en'>" + enTitle +"</span><span class='he'>" + heTitle + "</span>"
		var aboutSourceEn =	enSource ? "<span class='en'>Source: <a target='_blank' href='" + enSource + "'>" + parseURL(enSource).host +"</a></span>" : "";
		var aboutSourceHe = heSource ? "<span class='he'>Source: <a target='_blank' href='" + heSource + "'>" + parseURL(heSource).host + "</a></span>": "";

		var html = '<div class="en">' + aboutThisHtml("sources", "en") + "</div>" +
						'<div class="he">' + aboutThisHtml("heSources", "he") + "</div>";

		function aboutThisHtml(sources, lang) {
			var html = '';
			if (sources in data) {
				uSources = data[sources].unique()
				html += '<i>This page includes sections from multiple text versions:</i>'
				for (i = 0; i < uSources.length; i++ ) {
					html += '<div class="mergeSource">' +
						'<a href="/' + makeRef(data) + '/'+lang+'/' + uSources[i].replace(/ /g, "_") + '">' + 
						uSources[i] + '</a></div>';
				}

			} else {
				html += '<i>About this text:</i>' + '<div id="aboutTitle">' + aboutTitle + '</div>' +
													'<div id="aboutSource">' + aboutSourceEn + aboutSourceHe + '</div>';
			}
			return html;
		}

		// Build a list of alternate versions
		var versionsHtml = '';
		var versionsLang = {};
		var mergeSources = [];
		if ("sources" in data) {mergeSources = mergeSources.concat(data.sources)}
		if ("heSources" in data) {mergeSources = mergeSources.concat(data.heSources)}
		console.log(mergeSources);
		for (i = 0; i < data.versions.length; i++ ) {
			v = data.versions[i];
			console.log("looking at " + v.versionTitle)
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

		html += '<div class="clear"></div>';
		return html;

	}


	function tocHtml(data) {

		var order = ["Tanach", "Mishna", "Talmud", "Midrash", "Halacha", "Kabbalah", "Chasidut", "Commentary", "Other"];
		var html = "";

		for (var i=0; i < order.length; i++) {
			if (!(order[i] in data)) continue;
			var sectionName = order[i];
			var section = data[sectionName];

			if (sectionName === "Tanach") {
				var tOrder = ["Torah", "Prophets", "Writings"];
				for (var k=0; k < tOrder.length; k++) {
					html += tocZipBoxHtml(tOrder[k], section[tOrder[k]], "col");
				}
				continue;
			}

			if (sectionName in {Mishna:1, Talmud:1, Commentary:1}) {
				html += tocZipBoxHtml(sectionName, section, "seder");
				continue;
			}

			html += tocZipBoxHtml(sectionName, section, "col");

		}
		return html;

	}

	function tocZipBoxHtml(name, list, type) {
			
			var html = '<div class="navBox">' +
						'<div class="name">' + name + '</div>' +
						'<div class="zipBox">' +
						(type === "col" ? tocColHtml(list) : tocSederHtml(list, name)) +
					'</div></div>'
			return html;
	}

	function tocColHtml(list) {

			var html = '<ul class="col ' + (list.length < 12 ? 'single' : '') + '">';

			for (var j=0; j < list.length; j++) {
				html += '<li class="refLink">' + list[j].title + '</li>'
				if (j > 7 && j == Math.ceil(list.length /2 )) {
					html += "</ul><ul class='col'>";
				}
			}

			html += '<div class="clear"></div></ul>';
			
			return html;
	}

	function tocSederHtml(list, type) {
		var html = "";

		order = (type == "Commentary" ? 
				["Geonim", "Rishonim", "Acharonim", "Other"] :
				["Seder Zeraim", "Seder Moed", "Seder Nashim", "Seder Nezikin", "Seder Kodashim", "Seder Tahorot"]);

		for (var k = 0; k < order.length; k++) {
			html += '<div class="sederBox"><span class="seder">' + order[k] + ': </span>';
			for (var i=0; i < list[order[k]].length; i++) {
				html += '<span class="refLink ' + type.toLowerCase() + 'Ref">' +
					(type == "Mishna" ? list[order[k]][i].title.slice(7) : list[order[k]][i].title) +
					'</span>, '
			}
			html = html.slice(0,-2) + '</div>';

		}
		return html;
	}

	function makeToc(data) {
		$("#toc").html(tocHtml(data));

		// ------------- Nav Box Bindings--------------------
	
		$(".navBox .name").toggle(function() {
			$(".navBox").hide();
			$(this).parent().show();
			$(this).next().show();
			$(this).parent().addClass("zipOpen");
			$(this).parent().find(".navBack").show();
		
		}, function() {
			$(".navBox").show();
			$(this).next().hide();
			$(this).parent().removeClass("zipOpen");
			$(this).parent().find(".navBack").hide();
		});
		
		$(".navBox").append("<div class='navBack'>&#0171; back</div>");
		$(".navBack").click(function() { $(this).parent().find(".name").trigger("click") });	

	}


//  -------------------- Update Visible (Verse Count, Commentary) --------------------------

	function updateVisible() {
		if (sjs.loading || !sjs._$verses) {
			return
		}
		
		var $v = sjs._$verses
		var $com = sjs._$commentary;
		var $w = $(window);
		var nVerses = $v.length;
		var wTop = $w.scrollTop() + 40;
		var wBottom = $w.scrollTop() + $w.height()
		
		// Look for first visible 
		for (var i = 0; i < sjs._verseHeights.length; i++) {
			if (sjs._verseHeights[i] > wTop) {
				sjs.visible.first = i + 1
				break
			}
		}
		
		// look for last visible
		for (var k=i+1; k < sjs._verseHeights.length; k++) {
			if (sjs._verseHeights[k] > wBottom) {
				sjs.visible.last = k - 1
				break
			}
		}
		
					
		// Scroll commentary according to scroll map
		if (!sjs._$commentaryBox.hasClass("noCommentary")) {
			// If something is highlighted, scroll commentary to track highlight in basetext
			if ($(".lowlight").length) {
			
				var $first = $v.not(".lowlight").eq(0);
				var top = ($first.length ? $w.scrollTop() - $first.offset().top + 120 : 0);
				var vref = $first.attr("data-num");
				
				var $firstCom = $com.not(".lowlight").eq(0);
				if ($firstCom.length) {
					sjs._$commentaryViewPort.clearQueue()
						.scrollTo($firstCom, {duration: 0, offset: top})				
				}
	
			} else {				
			// There is nothing highlighted, scroll commentary to match basetext
				for (var i = 0; i < sjs._scrollMap.length; i++) {
					if (wTop < sjs._scrollMap[i] && $com.eq(i).length) {
						if (isTouchDevice()) {
							//sjs._$commentaryViewPort.clearQueue().scrollTo($com.eq(i), {duration: 600, easing: "easeOutExpo"});
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
		

		//var header = sjs.current.book  + " " +
		//	sjs.current.sections.slice(0, sjs.current.sectionNames.length-1).join(":");
			//+ ":" + sjs.visible.first + "-" + sjs.visible.last;
		 
		//$("#header").html(header);
	
	}

// ---------------- Breadcrumbs ------------------

sjs.updateBreadcrumbs = function() {
	if (sjs.thread.length == 1) {
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
}

addSourceSuccess = function() {
			
	var ref = $("#addSourceCitation").val();
	if (sjs.ref.index.categories[0] == "Commentary") {
		$("#addSourceType select").val("commentary");
	}
	
	ref = makeRef(parseRef(ref));
	
	$("#addSourceText").text("Checking for text…");
	
	$.getJSON("/texts/" + ref, function(data) {
		if (data.error) {
			$("#addSourceText").html(data.error);
			return;
		}
		
		sjs.ref.bookData = data;
					
		var text = "";
		var en = "";
		var he = "";
		var controlsHtml = "";
		
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
			$(".btn").addClass("inactive");
			$("#addSourceThis").removeClass("inactive");
		}
				
		if (data.type == "Talmud") {
			var text = "<span id='editDaf' class='btn gradient'>Edit Daf</span><div class='addSourceMsg'>Talmud line numbers may not be correct.<br>Please check the line numbers and edit if necessary before adding a source.</div>" + text;
		}
		
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


function buildOpen($c, editMode) {
	// Build modal source view or modal edit view for source
	// if $c is present, create based on a .commentary
	// if editMode, copy existing .open for editing
	// if neither, build a modal for adding a new source
	// This is code a mess and shoud be rewritten from scratch. 
	
	
	if (editMode) {
		// We're editing an existing modal; grab data from it
		var commentator = $(".open .commentator").text().substr(0, $(".open .commentator").text().length - 1);
		var enText = $(".open .text .en").text();
		var heText = $(".open .text .he").text();
		var anchorText = $(".open .anchorText").text();
		var source = $(".open").attr("data-source");
		var type = $(".open").attr("data-type");
		var id = $(".open").attr("data-id");
		var text = (type === "note" ? enText : "")
		var title = (type === "note" ? commentator : "")

		$("#selectedVerse").text($(".open .openVerseTitle").text());
	}
	
	$(".open").remove();
	
	if ($c) {
		// building a new modal to read based on an existing comment
		$c.clone().hide().appendTo("body")
			.removeClass("commentary").addClass("open");
		
		var $o	= $(".open");
		var v = parseInt($o.attr("data-vref"));			
		
		// prefetch ref links 
		$o.find(".refLink").each(function() {
			prefetch($(this).attr("data-ref"))	
		})
		
	} else {
		// building an editing modal (either new or existing)
		var ref = sjs.add.source.ref;
		var sections = ref.split(":");
		var v = sections[sections.length - 1];
		
		var html = 	'<div class="open edit'+ (editMode && type === "note" ? " noteMode": "") + '">' +
			'<div class="formRow" id="anchorForm"><span class="label">Anchor Words:</span>' +
				'<input><span id="selectAnchor" class="btn">Select</span></div>' +
			'<div id="addSourceType" class="formRow">'+
				'<div class="label">Source Type:</div><select>'+
					'<option value="">Select type...</option>'+
					'<option value="commentary">Commentary</option>'+
					'<option value="quotation">Quotation</option>'+
					'<option value="quotationSource">Quotation Source</option>'+
					'<option value="allusion">Allusion</option>'+
					'<option value="allusionSource">Allusion Source</option>'+
					'<option value="midrash">Midrash</option>'+
					'<option value="context">Context</option>'+
					'<option value="comparison">Comparison</option>'+
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
													focus: function(){},
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
			if (!_user.length) {
				return sjs.loginPrompt();
			}

			var ref = $("#addSourceCitation").val();
			ref = makeRef(parseRef(ref));
			var that = this;
			if (!sjs.ref.bookData) {
				sjs.alert.saving("Looking up text...");
				$.getJSON("/texts/" + ref, function(data){
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
				sjs.editing.offset = data.toSections[data.toSections.length-1];
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
			if (!_user.length) {
				return sjs.loginPrompt();
			}
			sjs.alert.saving("Looking up text...");
			var text = $("#addSourceCitation").val().replace(/ /g, "_")
			if ($("#addSourceTextBox").hasClass("he")) {
				sjs.current.langMode = "he";
			} else {
				sjs.current.langMode = "en";
			}
			$.getJSON("/texts/" + text, sjs.editText)
				.error(function(){ sjs.alert.message("Sorry there was an error.")});
		});

	}
	
	if (editMode) {
		// Populate fields for editing view
		$o.css("direction", "ltr")
			.attr("data-id", id);
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

	var title = sjs.add.source ? sjs.add.source.ref : $("#header").html() + ":" + v;
	// Get at most 810 characters of the text
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
	if (editMode) titleHtml += "<div class='delete'>delete</div>";
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
			buttons +="<div class='translateThis btn' data-ref='"+$o.attr("data-ref")+"'>Add Translation +</div>";
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

sjs.loginPrompt = function(e) {

	$("#loginPrompt, #overlay").show();
	$("#loginPrompt").position({of: $(window)});

	var path = History.getShortUrl(History.getPageUrl());
	// The above sometimes adds trailing '/', remove it
	path = path[path.length - 1] === "/" ? path.slice(0,-1) : path; 
	$("#loginPrompt #loginLink").attr("href", "/login?next=" + path);
	$("#loginPrompt #registerLink").attr("href", "/register?next=" + path);

	$("#loginPrompt .cancel").unbind("click")
		.click(function() {
			$("#loginPrompt, #overlay").hide();
		})
}


function validateText(text) {
	if (text.versionTitle == "" || !text.versionTitle) {
		sjs.alert.message("Please give a version title.");
		return false;
	}
	
	if (text.source == "" ) {
	 	sjs.alert.message("Please give a source.");
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
	console.log(source);

	if (validateSource(source)) {
		console.log(source);
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
	if (source["type"] in {"quotationSource":1, "allusionSource": 1}) {
		source["refs"] = source["refs"].reverse()
		source["type"] = source["type"].slice(0,-6)		
	}
			
	return source
	
}

function handleDeleteSource(e) {
	if (!_user.length) {
		return sjs.loginPrompt();
	}		
	if (confirm("Are you sure you want to delete this source?")) {
		var link = {};
		var id = $(this).parents(".open").attr("data-id");
		var com = sjs.current.commentary[id];
		var url = ($(this).parents(".open").hasClass("noteMode") ? "/notes/" : "/links/") + com["_id"];
		$.ajax({
			type: "delete",
			url: url,
			success: function() { 
				hardRefresh()
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
	
	console.log(note);
	
	if (validateNote(note)) {
		console.log("saving note…");
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
	console.log(postJSON)
	sjs.alert.saving("Saving Source…");
	$.post("/links/", {"json": postJSON}, function(data) {
		if (data.error) {
			sjs.alert.message(data.error);
		} else if (data) {
			sjs.alert.message("Source Saved.");		
			// TODO add new commentary dynamically 
			hardRefresh(data.ref || data.refs[0]);
			
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


function groupHeights(verses) {
	// find the heights of text groups in #newVersion where groups are seprated by \n\n
	// look at up to the number 'verses' of groups 

	// get the text to measure
	var text = sjs._$newVersion.val();
	
	// Split text intro groups and wrap each group with in class heighMarker
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
	sjs._$newVersionMirror.html(text);
	sjs._$newVersionMirror.show();
	
	var heights = [];
	for (i = 0; i < verses; i++) {
		// Stop counting if there are less heighMarkers than $targets
		if (i > $('.heightMarker').length - 1) {
			sjs._$newVersionMirror.hide();
			return heights;
		}
		heights[i] = $(".heightMarker").eq(i).offset().top;
	}

	sjs._$newVersionMirror.hide();
	
	return heights;
}

function syncTextGroups($target, keyCode) {
	// Between $target (a set of elements) and textarea (fixed in code as sjs._$newVersion)
	// sync the heigh of groups by either adding margin-bottom to elements of $targer
	// or adding adding \n between groups ins newVersion.


	var verses = $target.length;
	var heights = groupHeights(verses);
	// cursorCount tracks the number of newlines added near the cursor
	// so that we can move the cursor to the correct place at the end
	// of the loop.
	var cursorCount = 0;

	for (var i = 1; i < verses; i++) {
		// top of the "verse", or label trying to match to
		vTop = $target.eq(i).offset().top;
		
		// top of the text group
		tTop = heights[i];

		if (!tTop) break;
		
		// Text is above matching line
		if (vTop < tTop) {
			var marginBottom = parseInt($target.eq(i-1).css("margin-bottom")) + (tTop-vTop);
			
			$target.eq(i-1).css("margin-bottom", marginBottom + "px");
			
		
		// Matching line is above text	
		} else if (tTop < vTop) {
			// Try to reset border above and try cycle again
			if (parseInt($target.eq(i-1).css("margin-bottom")) > 32) {
				$target.eq(i-1).css("margin-bottom", "32px");
				heights = groupHeights(verses);
				i--;
				continue;
			}
			// Else add an extra new line to push down text and try again
			var text = sjs._$newVersion.val();
			
			// search for new line groups i times to find the position of insertion
			var regex = new RegExp("\n+", "g");
			for (var k = 0; k < i; k++) {
				var m = regex.exec(text);
			}
			text = text.substr(0, m.index) + "\n" + text.substr(m.index);
			
			var cursorPos = sjs._$newVersion.caret().start;
			sjs._$newVersion.val(text);
			var cursorDistance = cursorPos - m.index;
			// I'm a little nervous about the fuzziness here... If there's
			// a weird cursor bug, check here first. :-)
			if (cursorDistance > 0 && cursorDistance < 10) {
				cursorCount += 1;
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
	
	var text = $("#newVersion").val();
	var verses = text.split(/\n\n+/g);
	if (sjs.editing.offset) {
		var filler = new Array(sjs.editing.offset - 1);
		verses = filler.concat(verses);
	}
	version["text"] = verses;
	version["language"] = $("#language").val();
	if ($("input[@name=newTextType]:checked").val() == "original") {
		version["versionTitle"] = "Sefaria Community Translation";
		version["versionSource"] = "http://www.sefaria.org";
	} else {
		version["versionTitle"] = $("#versionTitle").val() || sjs.editing.versionTitle;
		var source = $("#versionSource").val();
		if (source.indexOf(" ") == -1 && source.indexOf("http://") != 0) {
			source = "http://" + source;
		} 
		version["versionSource"] = source;
	}

	return version;
	
}

	
function saveText(text) {
 	
 	var ref = text.postUrl;
 	delete text["postUrl"];
 	
 	postJSON = JSON.stringify(text);
	
	sjs.alert.saving("Saving text...")
	$.post("/texts/" + ref, {json: postJSON}, function(data) {
		
		if ("error" in data) {
		 	sjs.alert.message(data.error);
		} else {
			sjs.clearNewText();
			hardRefresh(ref);
			sjs.editing = {};
			sjs.alert.message("Text saved.");

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
			sjs._scrollMap.push(prevTop + (k * (space / nCommentaries)) + 50);
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

sjs.alert = { 
	saving: function(msg) {
		alertHtml = '<div class="alert">' +
				'<div class="msg">' + msg +'</div>' +
				'<img id="loadingImg" src="/static/img/ajax-loader.gif"/>'
			'</div>';
		sjs.alert._show(alertHtml);
	}, 
	
	message: function(msg) {
		alertHtml = '<div class="alert">' +
				'<div class="msg">' + msg +'</div>' +
				'<div class="ok btn">OK</div>' +
			'</div>';
		
		sjs.alert._show(alertHtml);
	},
	copy: function(text) {
		alertHtml = '<div class="alert copy">' +
				'<div class="msg">Copy the text below:</div>' +
				'<textarea>' + text + '</textarea>' + 
				'<div class="ok btn">OK</div>' +
			'</div>';
		
		sjs.alert._show(alertHtml);
	},
	clear: function() {
		$(".alert").remove();
		$("#overlay").hide();
	},
	_show: function(html) {
		$(".alert").remove();		
		$("#overlay").show();
		$(html).appendTo("body").position({of: $(window)}).find("textarea").focus();
		sjs.alert._bindOk();	
	},
	_bindOk: function() {
		$(".alert .ok").click(function(e) {
			$(".alert").remove();
			$("#overlay").hide();
			e.stopPropagation();
		});
	},
}

// -------- Special Case for IE ----------------
if ($.browser.msie) {
	$("#unsupported").show();
	$("#header").html("");
	$.isReady = true;
}
