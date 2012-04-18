var sjs = {
	Init: {},
	books: [],
	bind: {},
	cache: {},
	current: null,
	depth: 0,
	thread: [],
	view: null,
	trail: [],
	editing: {},
	eventHandlers: {},
	ref: {},
	loading: false,
	pages: {
		count: 0,
		current: 0
	},
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
	touch: {
		start: {x: null, y: null}
	},
	palette: ["#5B1094", "#00681C", "#790619", "#CC0060", "#008391", "#001866", "#C88900", "#009486", "#935A10"],
	_direction: 0,
	_verseHeights: null,
	_scrollMap: null
};

//  Initialize everything
sjs.Init.all = function() {

	// ----------- Init Stored Elements ---------------
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

	// list of known books (_books is set in reader.html)
	sjs.books = typeof(_books) === "undefined" ? [] : _books;
};


// -------------- DOM Ready ------------------------	
$(function() {
	sjs.Init.all();

	
	// TODO pull much of the code below into sjs.Init
	
	// ------------iPad Fixes ---------------------
		
	if (isTouchDevice()) {
		//$("body").bind("touchmove", function(e) { e.preventDefault(); });
		// document.addEventListener("orientationchange", rebuildPagedView);
		$(window).bind('touchmove', updateVisible);
	}
	
	
	// ---------------- Handle Hash Change ----------------
	
	$(window).hashchange(function(){
		if (location.hash === "") {
			$("#header").html("Genesis");
			get(parseQuery("Genesis"), 1);
		} else {
			get(parseQuery(location.hash.substr(2)), sjs._direction);
		}
	});
	
	if (sjs.cache.get("Genesis.1") && location.hash === "") {
		buildView(sjs.cache.get("Genesis.1"));
	} else {
		$(window).trigger("hashchange");
	}
	
	
	// ------------- Make Table of Contents ------------------

	$.getJSON("/index/", makeToc);


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
		$("#overlay").hide();
		$("#newTextModal").hide();
		$(".open").remove();
	
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
		$(el).find("input").focus();
		$(document).scrollTop(currentScrollPositionX);
		$(document).scrollLeft(currentScrollPositionY);
		e.stopPropagation();
	};
	var openBoxWrpr = function (e) {
		openBox($(this), e);
	}
	var closeBox = function() {
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
	

	$('#open, #about, #search').bind('touch', toggleBox);
	$('#open, #about, #search').bind('mouseleave', closeBox);
	$("#open, #about, #search").bind('mouseenter', openBoxWrpr)
	$('div.screen').bind('click touch', closeBox);


	// ------------- Search -----------------------
	
	$("#searchForm").keypress(function(e) {
		if (e.keyCode == 13) {
			window.location = "/search/" + this.value.replace(/ /g, "+");
		}
	});
		
			
	// ---------------- Sources List ---------------
	

	$(".sourcesHeader").live("click", function(e) {
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
	
	
	$(".hideCommentary").live("click", function(e) {
		sjs._$basetext.addClass("noCommentary");
		sjs._$commentaryBox.addClass("noCommentary");
		sjs._$commentaryViewPort.fadeOut();
		$(this).hide();
		e.stopPropagation();
	});
	
		
	$(".showCommentary").live("click", function(e) {
		sjs._$basetext.removeClass("noCommentary");
		sjs._$commentaryBox.removeClass("noCommentary");
		sjs._$commentaryViewPort.fadeIn();
		$(this).addClass("hideCommentary ui-icon-triangle-1-e")
			.removeClass("showCommentary ui-icon-triangle-1-w");
		e.stopPropagation();
	});
	
	$(".source").live("click", function() {
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
		
// --------------- Ref Links in Sources Text -------------------
	
sjs.eventHandlers.refLinkClick = function (e) {

		if ($(this).hasClass("commentaryRef")) {
			$("#goto").val($(this).text() + " on ").focus();
			e.stopPropagation();
			return false;
		}

		var ref =  $(this).attr("data-ref") || $(this).text();
		if (!ref) return;
		ref = $(this).hasClass("mishnaRef") ? "Mishna " + ref : ref;

		sjs._direction = 1;
		location.hash = refHash(parseQuery(ref));
		e.stopPropagation();

}	

	$(".refLink").live("click", sjs.eventHandlers.refLinkClick);


	
// -------------- Edit Text -------------------
	
	$("#editText").click(function(e) {
		sjs._$basetext.addClass("lines");

		sjs.editing.book = sjs.current.book;
		sjs.editing.sections = sjs.current.sections;
		sjs.editing.sectionNames = sjs.current.sectionNames;
		sjs.editing.smallSectionName = sjs.current.sectionNames[sjs.current.sectionNames.length-1];
		sjs.editing.bigSectionName = sjs.current.sectionNames[sjs.current.sectionNames.length-2];
		
		if (sjs.current.langMode === 'en') {
			sjs.editing.versionTitle = sjs.current.versionTitle;
			sjs.editing.versionSource = sjs.current.versionSource;
			sjs.editing.text = sjs.current.text;
		} else {
			sjs.editing.versionTitle = sjs.current.heVersionTitle;
			sjs.editing.versionSource = sjs.current.versionSource;
			sjs.editing.text = sjs.current.he;
		}
		
		sjs.editing.msg = "Edit Text";
		
		sjs.showNewText();
		
		var text = sjs.editing.text.join('\n\n');
		$('#newVersion').val(text);
		$('#newVersion').trigger('keyup');
		$('#versionTitle').val(sjs.editing.versionTitle);
		$('#versionSource').val(sjs.editing.versionSource);
		// prevent about from unhiding itself
		e.stopPropagation()
	});
	
	$(".addThis").live("click", function() {
		$("#editText").trigger("click");
	});


// ---------------- Edit Text Info ----------------------------

	$("#editTextInfo").click(function(){
		sjs.showNewIndex();
		$("#newIndexMsg").hide();
		$("#header").text("Edit Text Information");
		$("#textTitle").val(sjs.current.book);
		$("#textTitleVariants").val(sjs.current.titleVariants.slice(1).join(", "));
		$("#textCategory").val(sjs.current.type);
		
		for (var i = 2; i < sjs.current.sectionNames.length; i++) {
			$("#addSection").trigger("click");
		}
		
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
		
	});



// ------------- New Text --------------------------
	
	checkNewTextRef = function() {
		// Check ref function for new text UI
		checkRef($("#newTextName"), $("#newTextMsg"), $("#newTextOK"), 1, function(){}, false);
	};
	
	
	$("#newText").click(function(e) {
		$(".boxOpen").removeClass("boxOpen");
		$("#overlay").show();
		$("#newTextModal").show()
			.position({of: $(window)});
		$("#newTextName").focus();
		
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
	
	$("#newTextCancel").click(function() {
		$("#overlay").hide();
		$("#newTextMsg").text("Text or commentator name:");
		$("#newTextName").val("");
		$("#newTextModal").hide();
	
	});
	
	$("#newTextOK").click(function(){
		if ($(this).hasClass("inactive")) return;
		
		if (!sjs.editing.index) {
			var title = $("#newTextName").val()
			$("#textTitle").val(title);
			$(".textName").text(title);
			$("#newIndexMsg").show();
			$("#header").text("Add a New Text");
			sjs.showNewIndex();
		} else {
			$.extend(sjs.editing, parseQuery($("#newTextName").val()));
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
			if (sjs._$basetext.hasClass("bilingual")) {
				$("#hebrew").trigger("click");
			}
			sjs.showNewVersion()
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

		$(".screen, .screen-container").css("left", "0px");
		sjs._$newVersion.css("height", sjs._$basetext.height()).show().focus().elastic()
		
		var title = sjs.current.langMode == "en" ? sjs.current.versionTitle : sjs.current.heVersionTitle;
		var source = sjs.current.langMode == "en" ? sjs.current.versionSource : sjs.current.heVersionSource;
		
		$(".compareTitle").text(title);
		$(".compareSource").text(source);

		sjs.editing.book = sjs.current.book;
		sjs.editing.sections = sjs.current.sections;
		sjs.editing.sectionNames = sjs.current.sectionNames;
		sjs.editing.smallSectionName = sjs.current.sectionNames[sjs.current.sectionNames.length-1];
		sjs.editing.bigSectionName = sjs.current.sectionNames[sjs.current.sectionNames.length-2];

		sjs.showNewText();
		
		$("#versionSource").val("");
					
		sjs._$basetext.addClass("versionCompare lines").show();
		$("body").removeClass("newText");

		// prevent about from unhiding itself

}

sjs.clearNewVersion = function() {
		sjs.clearNewText();
		sjs._direction = 0;
		buildView(sjs.current);
		sjs.editing = {};
}

	
sjs.showNewText = function () {
		// Show interface for adding a new text
		// assumes sjs.editing is set with 
		// * msg -- displayed in header
		// * book, sections, toSections -- what is being edited
		// * smallSectionName, bigSectionName -- used line numbering and title respectively
		
		sjs.clearNewText();

		$(".open").remove();
		$("#viewButtons").hide();
		$("#editButtons").show();
		$("#prev, #next, #about").hide();
		
		$(window).scrollLeft(0)
			.unbind("scroll", updateVisible)
			.unbind("resize", updateVisible);
		$(".boxOpen").removeClass("boxOpen");

		$("#header").text(sjs.editing.msg);
			
		var title = sjs.editing.book.replace(/_/g, " ");
		for (var i = 0; i < sjs.editing.sectionNames.length-1; i++) {
			title += " : " + sjs.editing.sectionNames[i] + " " + sjs.editing.sections[i];
		}	
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
			.show(); //  let textarea grow with input

		$("#versionMethod").change(function(e) {
			if ($(this).val() === "original") {
				$("#versionTitle").val("Sefaria Crowd");
				$("#versionMethodFrom").hide();
			} else {
				if ($("#versionTitle").val() === "Sefaria Crowd") {
					$("#versionTitle").val("");
				}
				$("#versionMethodFrom").show();
			}
		})
	};

	
sjs.clearNewText = function() {
		$("#newTextNumbers").empty();
		$("#addVersionHeader input").val("");
		$("#newVersion").val("").unbind();
		$("#versionMethod").unbind();
	};	

	
sjs.showNewIndex = function() {
		$(".boxOpen").removeClass("boxOpen");
		$("#viewButtons").hide();
		$("#prev, #next, #about").hide();
		$(window).unbind("scroll.update resize.scrollLeft");
		sjs._$commentaryBox.hide();
		sjs._$basetext.hide();
		$(window).scrollLeft(0);
				
		
		$("#textCategory").change(function() {
			if ($(this).val() === "Other") $("#otherCategory").show();
			else $("#otherCategory").hide();

			if ($(this).val() === "Commentary") $("#textStructureFieldSet, #shorthandsFieldSet").hide();
			else $("#textStructureFieldSet, #shorthandsFieldSet").show();
		});
				
		$("#addSection").click(function() {
			$(this).before("<span class='sectionType'> > <input/> <span class='remove'>X</span></span>");
		});
		
		$("#addShorthand").click(function() {
			$(this).before('<div class="shorthand"><input class="shorthandFrom" /> ' + 
				'⇾ <input class="shorthandTo"/> <span class="remove">X</span>');
		});
		
		$(".remove").live("click", function() {
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
		if (index.categories.length === 0 || index.categories[0] === "") {
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
		index.categories = (cat == "Other" ? [$("#otherCategories").val()] : [cat]);
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
				//hardRefresh(data.title);
				sjs.alert.clear();
				$.getJSON("/index/", makeToc);
				$("#newText").trigger("click");
				$("#newTextName").val(data.title).trigger("textchange");
			}
		});			
		
	};


		
		
// ------ Text Syncing --------------
		
		function handleTextChange(e) {
			// Handle Backspace -- whah?
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
				syncTextGroups(sjs._$verses, e.keyCode)
	
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
	
// ------------- Next Link Url -----------------
		
		var event = isTouchDevice() ? 'touchstart' : 'click';
		$("#next, #prev").on(event, function() {
			if (this.id == "prev") 
				sjs._direction = -1;
			else
				sjs._direction = 1;
				
			var ref = $(this).attr("data-ref");
			location.hash = refHash(parseQuery(ref));
		});
		$('#next').on('touchend hover touchstart', function() {
			console.log('ho!');
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
	
	
	// ---------------------- Commentary Modal --------------------------
		
		$(".commentary").live("click", function(e){
			if ($(this).hasClass("lowlight")) {
				lowlightOff();
			}
			buildOpen($(e.currentTarget))
			return false;
		});
		
	
	
	// ----------------------- Commentary Edit --------------------
	
		$(".editLink").live("click", function () {
			var $o = $(this).parent();
			var source = {};
			
			source["id"] = parseInt($o.attr("data-id"));
			source["ref"] =  sjs.current.book + " " + 
				sjs.current.sections.slice(0, sjs.current.sectionNames.length -1).join(".") +
				"." + $o.attr("data-vref");
			sjs.add.source = source;
			
			buildOpen(false, true);
		})
	
		
	// ------------------- Commentary Model Hide ----------------------
	
		$(".open").live("click", function(e){
			return false;
		})
		
	
	// -------------------- Open Text Scrolling --------------------
	
		$(".openScrollCtl .up").live("click", function(e) {
			$b = $(".openBottom");
			var h = $b.height();
			var lh = parseInt($b.css("line-height"));
			h -= h % lh;
			$b.scrollTo("-=" + h + "px", 600, {easing: "easeOutExpo"});
			return false;
		});
		$(".openScrollCtl .down").live("click", function(e){
			$b = $(".openBottom");
			var h = $b.height();
			var lh = parseInt($b.css("line-height"));
			h -= h % lh;
			$b.scrollTo("+=" + h + "px", 600, {easing: "easeOutExpo"});
			return false;
		});
	
	
	
	
	// -------------- Highlight Commentary on Verse Click -------------- 
	
	$(".verse").live("click", handleVerseClick );
	
	function handleVerseClick(e) {
		lowlightOff();
		var v = $(this).attr("data-num");		
		lowlightOn(v);
	
		var selected = sjs.current.book + " ";
		for (var i = 0; i < sjs.current.sectionNames.length -1 ; i++) {
			selected += sjs.current.sections[i] + ":";
		}
		selected  += v;
		sjs.selected = selected;

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
			var verseControls = '<div class="verseControls" ' +
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
			$(".verseControls .addSource").click(addToSelected);
			$(".verseControls .addNote").click(addNoteToSelected);
			$(".verseControls .addToSheet").click(addSelectedToSheet);
		}
	
		// Scroll commentary view port
		var $comments = sjs._$commentaryBox.find(".commentary[data-vref=" + (v) + "]")
		var $fc = $comments.eq(0);
		if ($fc.length == 1) {	
			var top = $(window).scrollTop() - $(this).offset().top + 120 ;					
			sjs._$commentaryViewPort.clearQueue().scrollTo($fc, {duration: 600, offset: top, easing: "easeOutExpo"})
		
		}
		sjs._$sourcesCount.text($comments.length);
		sjs._$sourcesWrapper.html(sourcesHtml(sjs.current.commentary, v));
		return false;
	}

	function addToSelected() {
		$("#overlay").show();
		sjs.flags.verseSelecting = false;
		sjs.add.source = {ref: sjs.selected};
		buildOpen();

		return false;
	}
	

	function addNoteToSelected() {
		addToSelected();
		$("#addSourceType select").val("note").trigger("change");
		$(".open").position({of: $(window)});
	}


// --------------- Add to Sheet ----------------

	function addSelectedToSheet() {

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
	
	$(".addSource").live("click", function(){
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
	$("#addSourceCancel").live("click", function() {
		$(".open").remove();
		$("#overlay").hide();
		
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
				q = parseQuery($("#goto").val());
				ref = refHash(q);
				
				location.hash = ref;
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

function get(q, direction) {
	// take an object representing a query
	// get data from api or cache
	// prepare a new screen for the text to live in
	// callback on buildView
	
	var direction = direction || 1;
	sjs.depth += direction;

	if (direction == 1) {
		if (sjs.depth > sjs.thread.length) 
			sjs.thread.push(q.ref);
		else {
			sjs.thread[sjs.depth] = q.ref;	
			sjs.thread = sjs.thread.slice(0, sjs.depth);
		}	
	}

	sjs.loading = true;
	$("#header").html(q.book.replace(/_/g, " ") + " <img id='loadingImg' src='/img/ajax-loader.gif'/>");

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
	sjs._$commentaryBox.css({"position": "absolute", "top": top + "px", "bottom": "auto"});
	
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
		$.getJSON("/texts/" + ref, buildView);
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
	
		var $basetext = sjs._$basetext;
		var $commentaryBox = sjs._$commentaryBox;
		var $commentaryViewPort = sjs._$commentaryViewPort;
		var $sourcesWrapper = sjs._$sourcesWrapper;
		var $sourcesCount = sjs._$sourcesCount;
		var $sourcesBox = sjs._$sourcesBox;
	
	
		// Clear everything out 
		$basetext.empty().removeClass("noCommentary versionCompare").show();
		$("body").removeClass("newText");
		$commentaryBox.removeClass("noCommentary").hide(); 
		$commentaryBox.find(".commentary").remove();
		$("#addVersionHeader, #newVersion, #editButtons").hide();
		$("#viewButtons").show();		
		
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
		
		if (data.type == "Mishna" || data.type == "Commentary" || data.type == "Halacha" || data.book == "Psalms") {
			$("#block").trigger("click");
		}
		
		// Build basetext
		var emptyView = "<span class='btn addThis gradient'>Add this Text</span>"+
			"<i>No text available.</i>";
		
		basetext = basetextHtml(data.text, data.he, "")
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

		sjs._$verses = $basetext.find(".verse");
	
		$("#about, #next, #prev").css("visibility", "visible").show();

	
		// Populate About menu
		$("#aboutTitle").html(sjs.current.versionTitle || sjs.current.heVersionTitle || "Source Unknown");
		var source = sjs.current.versionSource || sjs.current.heVersionSource || ""; 
		$("#aboutSource").html("<a href='"+source+"'>"+source+"</a>");
		if (data.type == "Commentary")
			$("#editTextInfo").hide(); // Can't handle this case yet
		else
			$("#editTextInfo").show();
		
		
		// Prefetch Next and Prev
		if (data.next) {
			prefetch(data.next.ref);
			$("#next").attr("data-ref", data.next.ref)
				.css("display", "inline-block")
				.removeClass("inactive");
		} else {
			$("#next").addClass("inactive");
		}
		if (data.prev) {
			prefetch(data.prev.ref);
			$("#prev").attr("data-ref", data.prev.ref)
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
		$sourcesBox.show();	
		sjs.bind.windowScroll();
		sjs.loading = false;
		setScrollMap();
		
		// highlight verse (if indicated)
		if (data.sections.length == data.sectionNames.length) {
			var last = data.sections.length-1;
			lowlightOn(data.sections[last], data.toSections[last]);
			$("#header").html(data.book + " " + 
				data.sections.slice(0, -1).join(":") + "-" + 
				data.toSections[data.toSections.length-1]);
		} else {
			updateVisible();
		}
		
		// Forward / Back buttons
		//if (sjs.depth > 1) $screen.append("<div class='back'><</div>")
		//if (sjs.depth < sjs.thread.length) $screen.append("<div class='forward'>></div>")
		
		// Scroll horizontally to the new Screen
		var scrollXDur = sjs._direction == 0 ? 0 : 500;
		var scrollYDur = sjs._direction == 0 ? 0 : 200;
		
		// Animate horizonatally to new screen	
		$('.screen-container').css('position', 'fixed');
		$('.screen-container').animate({left: '-' + sjs._$screen.css('left')}, {duration: 600, complete: function() {
			$('.goodbye').remove();
			$(this).css('position', 'relative');
			sjs._$commentaryBox.css({"position": "fixed", "bottom": "0px", "top": "auto"});
			
			// Scroll vertically to the highlighted verse if any
			$highlight = sjs._$basetext.find(".verse").not(".lowlight").first();
		 	if ($highlight.length) {
				$.scrollTo($highlight, {offset: -250, axis: "y", duration: scrollYDur});
		 	}
		}});
		

	} // ------- END Build View---------------



	function basetextHtml(en, he, prefix) {
		var basetext = "";

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

			var enText = wrapRefLinks(en[i]) || "<i>No English available.</i>"//"…";
			var heText = he[i] || "<i>No Hebew available.</i>"//"…";
			var n = prefix + (i+1);
			var verse =
				"<div class='verseNum'>" + n + "</div>" +
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
		var commentaryObjects = [];
		var commentaryHtml = "";
		var n = 0; // number of assiged color in pallette
		
		for (var i = 0; i < commentary.length; i++) {
			var c = commentary[i];
	
			if (c.error) {
				console.log(c.error);
				continue;
			}
	
			// Give each Commentator a Color
			if (!(c.category in sources)) {
				var color = sjs.palette[n];
				var source = {color: color};
				sources[c.category] = source;

				n = (n+1) % sjs.palette.length;
			}
							
			sources[c.category].count++;
			
			if (typeof(c.anchorText) == "undefined") c.anchorText = "";
			if (typeof(c.text) == "undefined") c.text = "";
			if (typeof(c.he) == "undefined") c.he = "";

			
			var classStr = "";
			if (!c.text.length && c.he) classStr = "heOnly";
			if (!c.he.length && c.text) classStr = "enOnly";
			
			c.text = c.text || c.he || "[text not found]";
			c.he = c.he || c.text || "[text not found]";
			
			c.text = wrapRefLinks(c.text);						
			var commentaryObject = {};
			
			commentaryObject.vref = c.anchorVerse;
			commentaryObject.cnum = c.cNum;
			commentaryObject.commentator = c.commentator;
			commentaryObject.html = "<span class='commentary " + classStr + 
				"' data-vref='" + c.anchorVerse + 
				"' data-id='" + i +
				"' data-category='" + c.category +
				"' data-type='" + c.type +
				"' data-ref='" + (c.ref || "") + "'>" + 
				"<span class='commentator" + (c.ref ? " refLink" : "") + "'" + 
					" style='color:" + sources[c.category].color + 
					"' data-ref='"+ (c.ref || "") +"'>" + c.commentator + 
				":</span><span class='anchorText'>" + c.anchorText + 
				"</span><span class='text'><span class='en'>" + c.text + 
				"</span><span class='he'>" + c.he + "</span></span></span>";
			
			commentaryObjects.push(commentaryObject);		
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
	
	function sourcesHtml(commentary, selected) {
		if (!selected) { var selected = 0;}

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

			if (selected && c.anchorVerse != selected) { continue; }
	
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


	function tocHtml(data) {

		var order = ["Tanach", "Mishna", "Talmud", "Midrash", "Kabbalah", "Commentary", "Other"];
		var html = "";

		for (var i=0; i < order.length; i++) {
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

			var html = '<ul class="col">';

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

		console.log(list);
		order = (type == "Commentary" ? 
				["Geonim", "Rishonim", "Acharonim", "Other"] :
				["Seder Zeraim", "Seder Moed", "Seder Nashim", "Seder Nezikin", "Seder Kodashim", "Seder Tahorot"]);

		for (var k = 0; k < order.length; k++) {
			console.log(order[k]);
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
		if (sjs.loading) {
			return
		}
		
		var $v = sjs._$verses
		var $com = sjs._$commentaryViewPort.find(".commentary")
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
		
		if (sjs.current.type == "Talmud" || sjs.current.type == "Commentary")
			var header = sjs.current.title;
		else 
			var header = sjs.current.book  + " " +
			 sjs.current.sections.slice(0, sjs.current.sectionNames.length-1).join(":") + ":" +
			 sjs.visible.first + "-" + sjs.visible.last;
			 
		$("#header").html(header);
	
	}



function parseQuery(q) {
	var response = {book: false, 
					sections: [],
					toSections: []};
					
	if (!q) return response;
	
	var q = q.replace(/[.:]/g, " ").replace(/ +/, " ");
	var toSplit = q.split("-");
	var p = toSplit[0].split(" ");
	
	for (i = 0; i < p.length; i++) {
		if (p[i].match(/\d+[ab]?/)) {
			boundary = i;
			break;
		}
	}
	
	words = p.slice(0,i);
	nums = p.slice(i);
	
	response.book = words.join("_");
	response.sections = nums.slice();
	response.toSections = nums.slice();

	
	// Parse range end (if any)
	if (toSplit.length == 2) {
		var toSections = toSplit[1].replace(/[.:]/g, " ").split(" ");
		
		var diff = response.sections.length - toSections.length;
		
		for (var i = diff; i < toSections.length + diff; i++) {
			response.toSections[i] = toSections[i-diff];
		}
	}
	
	return response;
}

addSourceSuccess = function() {
			
	var ref = $("#addSourceCitation").val();
	if (sjs.ref.index.categories[0] == "Commentary") {
		$("#addSourceType select").val("commentary");
	}
	
	ref = makeRef(parseQuery(ref));
	
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
			
		
		controlsHtml = "";
		
		if (en && !he) {
			$("#addSourceHebrew, #addSourceVersion").removeClass("inactive");
			$("#addSourceEnglish, #addSourceThis").addClass("inactive");
			$("#addSourceText").removeClass("he");
			text = "<span class='en'>" + en + "</span>";

		} else if (!en && he) {
			$("#addSourceEnglish, #addSourceVersion").removeClass("inactive");
			$("#addSourceHebrew, #addSourceThis").addClass("inactive");
			text = "<span class='he'>" + he + "</span>";
			$("#addSourceText").addClass("he");

		} else if (he && en) {
			$("#addSourceHebrew, #addSourceEnglish, #addSourceThis").addClass("inactive");
			$("#addSourceVersion").removeClass("inactive");
			$("#addSourceText").removeClass("he");

			controlsHtml = "<div id='addSourceTextControls'>"+
				"<span class='addSourceTextAction en'>Show Hebrew</span>" +
				"<span class='addSourceTextAction he'>Show English</span>" +
				"</div>";
			text = "<span class='en'>"+en+"</span>"+"<span class='he'>"+he+"</span>"
		} else if (!en && !he) {
			text = "<i>No text available.</i>"
			$("#addSourceHebrew, #addSourceEnglish, #addSourceVersion, #addSourceComment, #addSourceSave").addClass("inactive");
			$("#addSourceThis").removeClass("inactive");
		}
				
		if (data.type == "Talmud") {
			var talmudMsg = "<span id='editDaf' class='btn gradient'>Edit Daf</span><div class='addSourceMsg'>Talmud line numbers may not be correct.<br>Please check the line numbers and edit if necessary before adding a source.</div>";
			controlsHtml = talmudMsg + controlsHtml;
		}
		
		$("#addSourceText").html(controlsHtml+text);
		$(".open").position({of: $(window)});
		
		i++;
		if (data.type == "Commentary" && i > 1) {
			$("#addSourceSave").addClass("inactive");
			
			$("#addSourceComment").removeClass("inactive")
				.find(".commentCount").html(i + (i == 2 ? "nd" : i == 3 ? "rd" : "th"));
			
		} else { 
			$("#addSourceComment").addClass("inactive");
		}				
		
		// Language toggles for addSourceText
		$(".addSourceTextAction.en").click(function() {
			$("#addSourceText").addClass("he")
		});
		$(".addSourceTextAction.he").click(function() {
			$("#addSourceText").removeClass("he")
		});
		
		// Add version links 
		$("#addSourceVersion, #addSourceHebrew, #addSourceEnglish, #addSourceThis").click(function() {
		
			sjs.editing = data;
			sjs.editing.smallSectionName = data.sectionNames[data.sectionNames.length - 1];
			sjs.editing.bigSectionName = data.sectionNames[data.sectionNames.length - 2];
			sjs.editing.versionSource = '';
			sjs.editing.offset = data.sections[data.sections.length-1];
			$.extend(sjs.editing, parseQuery(ref));
			$("#overlay").hide();
			
			if (this.id == "addSourceHebrew") {
				$("#language").val("he");
				$("#newVersion").css("direction", "rtl");
			}
			
			sjs.editing.msg = "Add a New Text";
			sjs.showNewText();
			
		})
		
		// Edit Daf Link
		$("#editDaf").click(function() {
			sjs.current = sjs.ref.bookData;
			sjs.current.langMode = 'he';
			$("#overlay").hide();
			$("#editText").trigger("click")	
		})
		
		
	});
	
}


function buildOpen($c, editMode) {
	// Build modal text view
	// if $c is present, create based on a .commentary
	// if editMode, copy existing .open for editing
	// if neither, build a modal for adding a new source
	// This is a mess and shoud be rewritten from scratch. 
	
	
	if (editMode) {
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
	// building a modal to read
		$c.clone().hide().appendTo("body")
			.removeClass("commentary").addClass("open");
		
		var $o	= $(".open");
		var v = parseInt($o.attr("data-vref"));			
		
		// prefetch ref links 
		$o.find(".refLink").each(function() {
			prefetch($(this).attr("data-ref"))	
		})
		
	} else {
	// building an editing modal
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
				'<div id="addSourceText">…</div></div>' +
			'<div id="addNoteTitleForm" class="formRow">'+
				'<div class="label">Note Title:</div>' +
				'<input id="addNoteTitle" value="'+(title || "")+'"></div>'+
			'<div class="formRow">' +
				'<textarea id="addNoteTextarea">'+(text || "")+'</textarea></div>' +
			'<div id="addSourceControls"><span id="addSourceSave" class="btn inactive">Save Source</span>'+
				"<span id='addNoteSave' class='btn'>Save Note</span>" +
				"<span id='addSourceThis' class='btn inactive'>Add this Text</span>" +
				"<span id='addSourceEnglish' class='btn inactive'>Add English</span>" +
				"<span id='addSourceHebrew' class='btn inactive'>Add Hebrew</span>" +
				"<span id='addSourceVersion' class='btn inactive'>Add Version</span>" +
				"<span id='addSourceComment' class='btn inactive'>Add	 <span class='commentCount'></span> Comment</span>" +
				'<span id="addSourceCancel" class="btn">Cancel</span></div>' +
			'</div>'
			

		$("body").append(html);
		
		var $o = $(".open");
		$("#addSourceCitation").val("");
		$o.css("max-height", "550px");
	
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

	}
	
	if (editMode) {
		$o.css("direction", "ltr")
			.attr("data-id", id);
		$("#addSourceCitation").val(commentator);
		$("#anchorForm input").val(anchorText);
		if (anchorText) $("#anchorForm input").show();
		$("#addSourceText").html("<span class='en'>"+enText+"</span><span class='he'>"+heText+"</span>");
		$("#sourceForm input").val(source);
		$("#addSourceType select").val(type);
		if (type !== "note") $("#addSourceSave").removeClass("inactive");
	}

	var title = sjs.add.source ? sjs.add.source.ref : $("#header").html().slice(0, $("#header").html().lastIndexOf(":")) + ":" + v;
	
	var enText = $(".verse").eq(v-1).find(".en").text().slice(0,810);
	var heText = $(".verse").eq(v-1).find(".he").text().slice(0,810);
	
	var openVerseHtml = "<div class='openVerse'>" +
							"<span class='en'>" + enText + "</span>" +
							"<span class='he'>" + heText + "</span>" +
						"</div>";

	$o.prepend(openVerseHtml + "<br>");
	if ($o.hasClass("edit") && !editMode) title = "Add a source to " + title;
	var titleHtml = "<div class='openVerseTitle'>" + title + "</div>";
	if (editMode) titleHtml += "<div class='delete'>delete</div>";
	$o.prepend(titleHtml);

	$(".open .delete").click(function(e) {
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

	});
		
	// Positioning of Open Modal
	var h = $o.height();
	var w = $o.width();
	var mh = parseInt($o.css("max-height"));
	var p = parseInt($o.css("padding-top"));
	var pl = parseInt($o.css("padding-left"));
	var wh = $(window).height();
	var ww = $(window).width();

	// Add scrolling controls if text is too long
	if (h + (2*p) >= mh) {
		$o.wrapInner("<div class='openBottom' />");
		$o.children().eq(0).height(h - p)
		$o.append('<div class="openScrollCtl"> \
			<img src="/img/up.png" class="up"/> \
			<img src="/img/down.png" class="down"/> \
		</div>');
	} 
	
	$o.position({
		my: "center center",
		at: "center center",
		of: $(window)
	});
	//$o.css("top",  (wh - (h+(2*p))) / 2.2 + "px");
	//$o.css("left", (ww - (w+(2*pl))) / 2 + "px");
	
	if ($c) {
		$o.append("<div class='editLink'>Edit</div>")
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
		
		return false;

	}

	$o.show();
	$("#overlay").show();
	return false;
}


function wrapRefLinks(text) {
	
	text = text || "";
	
	var refReStr = "(" + sjs.books.join("|") + ") (\\d+[ab]?)(:(\\d+)([\\-–]\\d+(:\\d+)?)?)?";
	var refRe = new RegExp(refReStr, "g");
	try {
		var refText = text.replace(refRe, '<span class="refLink" data-ref="$1.$2$3">$1 $2$3</span>');
	} catch (TypeError) {
		// this catches an error caused by some bad data
		var refText = "Error: bad data";
	}
	return refText;
	
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
	
	if (!source.type) {
		sjs.alert.message("Please select a source type.");
		return false; 
	}
	
	return true; 
}

function handleSaveSource() {
	if ($("#addSourceSave").hasClass("inactive")) return;
	
	var source = readSource();
	
	console.log(source);
	
	if (validateSource(source)) {
		console.log("saving…");
		saveSource(source);
	} 
}


function readSource() {
	
	var source = {}
	var ref1 = sjs.add.source.ref.replace(/:/g, ".") 
	var ref2 = $("#addSourceCitation").val().replace(/:/g, ".");
	ref2 = makeRef(parseQuery(ref2));
	
	source["refs"] = [ref1, ref2]
	delete source.ref
	source["anchorText"] = $("#anchorForm input").val()
	source["type"] = $("#addSourceType select").val()
	if (source["type"] == "other") source["type"] = $("#otherType").val()
	if (source["type"] == "quotationSource" || source["type"] == "allusionSource" ) {
		source["refs"] = source["refs"].reverse()
		source["type"] = source["type"].slice(0,-6)		
	}

	// source["text"] = $("#textForm textarea").val()
	// source["source"] = $("#sourceForm input").val()
	// TODO language detection
	// source["language"] = "en"
			
	return source
	
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
 	postJSON= JSON.stringify(source);
	
	sjs.alert.saving("Saving Source…");
	$.post("/links", {"json": postJSON}, function(data) {
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


function makeRef(q) {
	var ref = q.book.replace(/ /g, "_");

	if (q.sections.length)
		ref += "." + q.sections.join(".");
	
	if (!q.sections.compare(q.toSections)) {
		
		for (var i = 0; i < q.toSections.length; i ++)
			if (q.sections[i] != q.toSections[i]) break;
		ref += "-" + q.toSections.slice(i).join(".");
	}
	
	return ref;
}

function refHash(q) {
	return "/" + makeRef(q);
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
	// Between $target and textarea (fixed in code as sjs._$newVersion)
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
				console.log("border reset")
				console.log(heights)
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
			console.log("new line added");
			console.log(heights);
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
	for (var i= 0 ; i < sjs.editing.sectionNames.length -1; i++) {
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
	version["versionTitle"] = $("#versionTitle").val() || sjs.editing.versionTitle;
	version["method"] = $("#versionMethod").val();
	version["versionSource"] = $("#versionSource").val();
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
			hardRefresh(ref);
			sjs.editing = {};
			sjs.alert.message("Text saved.");

		}
	})
}


function checkRef($input, $msg, $ok, level, success, commentatorOnly) {
	
	/* check the user inputed text ref
	   give fedback to make it corret to a certain level of specificity 
	   talk to the server when needed to find section names
		* level -- how deep the ref should go - (0: to the end, 1: one level above)
		* success -- a function to call when a valid ref has been found
		* commentatorOnly --- whether to stop at only a commentatory name
	*/
	
	// sort books by length so longest matches first in regex
	var sortedBooks = sjs.books.sort(function(a,b){
		if (a.length == b.length) return 0;
		return (a.length < b.length ? 1 : -1); 
	})
	
	var booksReStr = "^(" + sortedBooks.join("\\b|") + ")";
	var booksRe = new RegExp(booksReStr, "i");
	var baseTests = [{test: /^/,
					  msg: "Enter a text or commentator name",
					  action: "allow"},
					 {test: /^$/,
					  msg: "Enter a text or commentator name",
					  action: "reset"},
					 {test: booksRe,
					  msg: "...",
					  action: "getBook"}];
	
	
	// An array of objects with properites 'test', 'msg', 'action' which are tested with each change
	sjs.ref.tests = sjs.ref.tests || baseTests;
	var tests = sjs.ref.tests;
	
	var ref = $input.val();
	console.log("Seeing: " + ref);
	console.log("Test Queue:");
	console.log(sjs.ref.tests)
	// Walk backwards through all tests, give the message and do the action of first match
	for (var i = tests.length -1;  i > -1;  i--) {
		if (ref.match(tests[i].test)) {
			action = tests[i].action;
			$msg.html("<i>"+tests[i].msg+"</i>");
			break;
		}
	}
	$msg.removeClass("he");
	
	
	console.log("Action: " + action);
	switch(action){
	
		// Back to square 1
		case("reset"):
			sjs.ref.tests = baseTests;
			sjs.ref.index = {};
			sjs.editing.index = null;
			$input.val("");
			$("#addSourceControls .btn").addClass("inactive");
			$("#addSourceCancel").removeClass("inactive");
			break;
		
		// Don't change anything	
		case("pass"):
			sjs.editing.index = null;
			$ok.addClass("inactive");
			
			// this reaches in to logic specific to add source
			$("#addSourceControls .btn").addClass("inactive");
			$("#addSourceCancel").removeClass("inactive")
			
			break;
		
		case("allow"):
			$ok.removeClass("inactive");
			//so does this 
			$("#addSourceControls .btn").addClass("inactive");
			$("#addSourceCancel").removeClass("inactive")

			break;
		
		case("insertRef"):
			$input.val($input.val() + " on " + sjs.add.source.ref)
				.autocomplete("close");
			checkRef($input, $msg, $ok, level, success, commentatorOnly);
			break;
		
		// get information about an entered book (e.g., "Genesis", "Rashi", "Brachot") 
		// add appropriate tests and prompts	
		case("getBook"):
		
			match = ref.match(booksRe);
			if (!match) return;
			else ref = match[0];
			// Don't look up info we already have
			if (sjs.ref.index && sjs.ref.index.title == ref) break;
			
			$.getJSON("/index/" + ref, function(data){
				if ("error" in data) {
					$msg.html(data.error);
					$ok.addClass("inactive");

				} else {
					sjs.ref.index = data;
					$ok.addClass("inactive");

					if (data.categories[0] == "Commentary") {
						$input.val(data.title);
						if (commentatorOnly) {
							sjs.ref.tests.push(
								{test: new RegExp("^" + data.title + "$"), 
								 msg: "", 
								 action: "insertRef"});
							sjs.ref.tests.push(
								{test: new RegExp("^" + data.title + " on " + sjs.add.source.ref + "$"), 
								 msg: "", 
								 action: "ok"});
							
						} else {
							$input.val(data.title + " on ");
							var commentatorRe = new RegExp("^" + data.title)
							sjs.ref.tests.push(
								{test: commentatorRe, 
								 msg: "Enter a <b>Text</b> that " + data.title + " comments on", 
								 action: "pass"});
							
							var commentaryReStr = "^" + data.title + " on (" + sjs.books.join("|") + ")$";
							var commentaryRe = new RegExp(commentaryReStr, "i");
							sjs.ref.tests.push(
								{test: commentaryRe,
								 msg: "...",
								 action: "getCommentaryBook"});
					
						}
					} else if (data.categories[0] == "Talmud") {
						$input.val(data.title)
							.autocomplete("close");
						
						
						sjs.ref.tests.push(
							{test: RegExp("^" + data.title),
							 msg: "Enter a <b>Daf</b> of Tractate " + data.title + " to add",
							 action: "pass"});
						if (level == 1) {
							sjs.ref.tests.push(
								{test:  RegExp("^" + data.title + " \\d+[ab]$", "i"),
								 msg: "OK. Click <b>add</b> to continue.",
								 action: "ok"});
						} else {
							sjs.ref.tests.push(
								{test:  RegExp("^" + data.title + " \\d+[ab]", "i"),
								 msg: "Enter a starting <b>line number</b>",
								 action: "pass"});
							sjs.ref.tests.push(
								{test:  RegExp("^" + data.title + " \\d+[ab][ .:]\\d+", "i"),
								 msg: "Enter an ending <b>line number</b>",
								 action: "pass"});	
							sjs.ref.tests.push(
								{test:  RegExp("^" + data.title + " \\d+[ab][ .:]\\d+-\\d+$", "i"),
								 msg: "",
								 action: "ok"});
						}
						

					
					} else {
						$input.val(data.title + " ")
							.autocomplete("close");
						var bookRe = new RegExp("^" + data.title + " ?$");
						sjs.ref.tests.push(
									{test: bookRe,
									 msg: "Enter a <b>" + data.sectionNames[0] + "</b> of " + data.title + " to add",
									 action: "pass"});
						
						var reStr = "^" + data.title + " \\d+"
						for (var i = 0; i < data.sectionNames.length - level - 1; i++) {
							sjs.ref.tests.push(
									{test: RegExp(reStr),
									msg: "Enter a <b>" + data.sectionNames[i+1] + "</b> of " + data.title + " to add",
									action: "pass"});
							reStr += "[ .:]\\d+";
						}

						sjs.ref.tests.push(
							{test: RegExp(reStr + "$"),
							 msg: "OK. Click <b>add</b> to continue.",
							 action: "ok"});
							 
						sjs.ref.tests.push(
							{test: RegExp(reStr + "-"),
							 msg: "Enter an ending <b>" + data.sectionNames[i] + "</b>",
							 action: "pass"});
							 
						sjs.ref.tests.push(
							{test: RegExp(reStr + "-\\d+$"),
							 msg: "OK. Click <b>add</b> to continue.",
							 action: "ok"});
						
					}
					
					checkRef($input, $msg, $ok, level, success, commentatorOnly);
				}	
			});
			break;
		
		// get information about a book entered as the object of a commentator 
		//(e.g. the "Genesis" in "Rashi on Genesis")		
		case("getCommentaryBook"):
		console.log("gcb")
		console.log("ref: " + ref)
			
			// reset stored title to commentator name only
			sjs.ref.index.title = ref.slice(0, ref.indexOf(" on "));
			var book = ref.slice((sjs.ref.index.title + " on ").length) 
			
			$.getJSON("/index/" + book, function(data){
				if ("error" in data) {
					$msg.html(data.error);
				} else {
					sjs.ref.index.title += " on " + data.title;
					data.sectionNames.push("Comment");
					sjs.ref.index.sectionNames = data.sectionNames;
					$ok.addClass("inactive");

					if (data.categories[0] == "Commentary") {
						var commentaryRe = new RegExp(sjs.ref.index.title, "i");
						sjs.ref.tests.push(
							{test: commentaryRe,
							 msg: "No commentary on commentary action.",
							 action: "pass"});
					
					} else if (data.categories[0] == "Talmud") {
						$input.val(sjs.ref.index.title);
						var tractateRe = new RegExp("^" + sjs.ref.index.title);
						sjs.ref.tests.push(
							{test: tractateRe,
							 msg: "Enter a Daf of tractate " + data.title,
							 action: "pass"});
						
						var talmudReStr = "^" + sjs.ref.index.title + " \\d+[ab]$";
						var talmudRe = new RegExp(talmudReStr, "i");
						sjs.ref.tests.push(
							{test: talmudRe,
							 msg: "OK. Click <b>add</b> to conitnue.",
							 action: "ok"});
					
					} else {
						$input.val(sjs.ref.index.title);
						var bookRe = new RegExp("^" + sjs.ref.index.title);
						sjs.ref.tests.push(
							{test: bookRe,
							 msg: "Enter a " + data.sectionNames[0] + " of " + data.title,
							 action: "pass"});
						
						var reStr = "^" + sjs.ref.index.title + " \\d+";
						
						console.log("level: " + level);
						console.log("length: " + data.sectionNames.length);

						// Cycle through sections, add tests and msg for each
						for (var i = 1; i < data.sectionNames.length - level; i++) {
							var re = new RegExp(reStr)
							sjs.ref.tests.push(
								{test: re,
								 msg: "Enter a " + data.sectionNames[i] + " of " + data.title,
								 action: "pass"});
							reStr += "[ .:]\\d+";
						}
						reStr += "$"
						var re = new RegExp(reStr);
						sjs.ref.tests.push(
							{test: re,
							 msg: "OK. Click <b>add</b> to conitnue.",
							 action: "ok"});				
					
					}
					
					checkRef($input, $msg, $ok, level, success, false);
				}
			});
			break;
			
		case("ok"):
			sjs.editing.index = sjs.ref.index;
			$ok.removeClass("inactive");
			success();
			break;
	}
		
}	




function prefetch(ref) {
	// grab a text from the server and put it in the cache
	if (!ref) return;
	
	ref = makeRef(parseQuery(ref));
	if (sjs.cache.get(ref)) return;	

	$.getJSON("/texts/" + ref, function(data) {
		if (data.error) return;
		sjs.cache.save(data);
	})
}


function lowlightOn(n, m) {
	// turn on lowlight, leaving verse n-m highlighted
	
	m = m || n;
	n = parseInt(n);
	m = parseInt(m);
	$c = sjs._$commentaryViewPort.find(".commentary[data-vref="+ (n) + "]");
	sjs._$commentaryViewPort.find(".commentary").addClass("lowlight");
	$c.removeClass("lowlight");
	$(".verse").addClass("lowlight" );
	$(".verse").each(function() {
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
	
	if(!sjs._verseHeights) setVerseHeights();
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



function isTouchDevice() {  
	return "ontouchstart" in document.documentElement;
}

function hardRefresh(ref) {
	console.log("attempting hard refresh");
	sjs._direction = 0;
	
	ref = ref || location.hash.substr(2);

	sjs.cache.kill(ref);
		
	if (location.hash === "#" + refHash(parseQuery(ref)))
		get(parseQuery(ref));
	else
		window.location = "/#/" + makeRef(parseQuery(ref));
	
}

sjs.alert = { 
	saving: function(msg) {
		$(".alert").remove();
		
		alertHtml = '<div class="alert">' +
				'<div class="msg">' + msg +'</div>' +
				'<img id="loadingImg" src="/img/ajax-loader.gif"/>'
			'</div>';
		
		$("#overlay").show();
		$("body").append(alertHtml);
		sjs.alert.bindOk();		
	}, 
	
	message: function(msg) {
		
		$(".alert").remove();
		
		alertHtml = '<div class="alert">' +
				'<div class="msg">' + msg +'</div>' +
				'<div class="ok btn">OK</div>' +
			'</div>';
		
		$("#overlay").show();
		$("body").append(alertHtml);
		sjs.alert.bindOk();		
	},
	
	bindOk: function() {
		$(".alert .ok").click(function(e) {
			$(".alert").remove();
			$("#overlay").hide();
			e.stopPropagation();
		});
	},
	clear: function() {
		$(".alert").remove();
		$("#overlay").hide();
	}
}


sjs.cache = {
// Caching of texts
	get: function(ref) {
		var pRef = parseQuery(ref);
		var normRef = makeRef(pRef);

		if (normRef in this._cache) {
			var data = clone(this._cache[normRef]);
			
			if (!("remake" in data))
				return data;
		
			// If the ref has more than 1 section listed, try trimming the last section
			var normRef = normRef.replace(/:/g, ".").slice(0, normRef.lastIndexOf("."));

			var data = clone(this._cache[normRef]);
			console.log(data)
			var lastSection = parseInt(pRef.sections[pRef.sections.length -1]);
			var lastToSection = parseInt(pRef.toSections[pRef.toSections.length -1]);
			
			data.sections.push(lastSection);
			data.toSections.push(lastToSection);
			data.ref = ref;
			
			return data;
		}

		return false;
	},
	
	save: function(origData) {
		var data = {};
		$.extend(data, origData);
		
		// Store data for book name alone (eg "Genesis") immediatley
		// normalizing below will render this "Genesis.1" which we also store
		if (data.ref.indexOf(".") == -1) {
			this._cache[data.ref] = data;
		}
		
		// Trim the data to "chapter" level
		if (data.sections.length == data.sectionNames.length) {
			data.sections = data.sections.slice(0, data.sections.length - 1);
		}
		if (data.toSections.length == data.sectionNames.length) {
			data.toSections = data.toSections.slice(0, data.toSections.length - 1);
		}
		
		var ref = makeRef(data);
		this._cache[ref] = data;
	
		
		// Leave links for each lower level (e.g. "verse") request
		for (var i = 1; i <= Math.max(data.text.length, data.he.length); i++)
			this._cache[ref+"."+i] = {"remake": 1};	
	},
	
	kill: function(ref) {
		ref = makeRef(parseQuery(ref));
		if (ref in this._cache) delete this._cache[ref];
		else if (ref.indexOf(".") != ref.lastIndexOf(".")) {
			ref = ref.slice(0, ref.lastIndexOf("."));
			delete this._cache[ref];
		}
	},
	_cache: {}
}

function isInt(x) {
		var y=parseInt(x);
		if (isNaN(y)) return false;
		return x==y && x.toString()==y.toString();
	}

function clone(obj) {
    // Handle the 3 simple types, and null or undefined
    if (null == obj || "object" != typeof obj) return obj;

    // Handle Date
    if (obj instanceof Date) {
        var copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
        var copy = [];
        var len = obj.length;
        for (var i = 0; i < len; ++i) {
            copy[i] = clone(obj[i]);
        }
        return copy;
    }

    // Handle Object
    if (obj instanceof Object) {
        var copy = {};
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
        }
        return copy;
    }

    throw new Error("Unable to copy obj! Its type isn't supported.");
}

Array.prototype.compare = function(testArr) {
    if (this.length != testArr.length) return false;
    for (var i = 0; i < testArr.length; i++) {
        if (this[i].compare) { 
            if (!this[i].compare(testArr[i])) return false;
        }
        if (this[i] !== testArr[i]) return false;
    }
    return true;
}

Array.prototype.pad =
  function(s,v) {
    var l = Math.abs(s) - this.length;
    var a = [].concat(this);
    if (l <= 0)
      return a;
    for(var i=0; i<l; i++)
      s < 0 ? a.unshift(v) : a.push(v);
    return a;
};

if(typeof(console) === 'undefined') {
    var console = {}
    console.log = function() {};
}

// -------- Special Case for IE ----------------
if ($.browser.msie) {
	$("#unsupported").show();
	$("#header").html("");
	$.isReady = true;
}