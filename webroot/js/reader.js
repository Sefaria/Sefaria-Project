sjs = {
	Init: {},
	books: [],
	cache: {},
	current: null,
	depth: 0,
	thread: [],
	view: null,
	trail: [],
	editing: {},
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
		verseSelecting: false
	},
	add: {
		source: null
	},
	touch: {
		start: {x: null, y: null}
	},
	palette: ["#5B1094", "#00681C", "#790619", "#CC0060", "#008391", "#C88900", "#009486"],
	_direction: 1,
	_verseHeights: null,
	_scrollMap: null
}



sjs.Init.all = function() {
//  Initialize everything

// ----------- Init Stored Elements ---------------
	
	sjs._$basetext = $(".basetext").eq(0)
	sjs._$commentaryViewPort = $(".commentaryViewPort").eq(0)
	sjs._$commentaryBox = $(".commentaryBox").eq(0)		
	sjs._$sourcesBox = $(".sourcesBox").eq(0)
	sjs._$sourcesCount = $(".sourcesCount").eq(0)
	sjs._$sourcesList = $(".sourcesList").eq(0)
	sjs._$sourcesHeader = $(".sourcesHeader").eq(0)
	sjs._$sourcesWrapper = $(".sourcesWrapper").eq(0)
	sjs._$newVersion = $("#newVersion")
	sjs._$newVersionMirror = $("#newVersionMirror")

	sjs.books = _books
		
}


// -------------- DOM Ready ------------------------	
$(function() {
	sjs.Init.all()

	
	// ------------iPad Fixes ---------------------
		
	if (isTouchDevice()) {
		$("body").bind("touchmove", function(e) { e.preventDefault() })
		// document.addEventListener("orientationchange", rebuildPagedView);

	}
	
	
	
	// -------------- localStorage ----------------------
	// TODO Broken	
	try {
		localStorage.clear()
		if ("sjs.cache" in localStorage)
			sjs.cache = JSON.parse(localStorage["sjs.cache"])
	} catch (e) {
		
	}
	
	
	// ---------------- Handle Hash Change ----------------
	
	$(window).hashchange( function(){
		if (location.hash == "") {
			$("#header").html("Genesis")
			get(parseQuery("Genesis"), 1);
		} else {
			get(parseQuery(location.hash.substr(2)), sjs._direction)
		}
	})
	
	if ("Genesis.1" in sjs.cache && location.hash == "") 
		buildView(sjs.cache["Genesis.1"])
	else
		$(window).trigger("hashchange")
	
	
	
	// ------------- Hide Modals on outside Click -----------
	
	$(window).click(function() {
		$(".boxOpen").removeClass("boxOpen")
		$(".zipOpen").removeClass("zipOpen")
		$(".zipBox").hide()
		$(".navBox").show()
		lowlightOff();
	})
	
	// -------------- Hide Modals on Overlay click ----------
	
	$("#overlay").click(function() {
		$("#overlay").hide()
		$("#newTextModal").hide()
		$(".open").remove()
	
	})
	
	
	// ------------- Top Button Handlers -------------
		
	$("#open, #about, #search").bind("mouseenter click touch", function(e) {
		$(this).addClass("boxOpen")
		//if (!isTouchDevice()) $("#goto").focus();
		//$("#searchForm").focus()
		e.stopPropagation();
	
	
	})
	
	$("#open, #about, #search").mouseleave(function(){
		$(this).removeClass("boxOpen")
	})
	
	
	$("#top").click(function(e) {
	})
		
	
	
	// ------------- Search -----------------------
	
	
	$("#searchForm").keypress(function(e) {
	
		if (e.keyCode == 13) {
			window.location = "/search/" + this.value.replace(" ", "+")
		}
	})
	
	
	// ------------- Nav Box --------------------
	
	$(".navBox .name").toggle(function() {
		$(".navBox").hide()
		$(this).parent().show()
		$(this).next().show()
		$(this).parent().addClass("zipOpen")
	
	}, function() {
		$(".navBox").show()
		$(this).next().hide()
		$(this).parent().removeClass("zipOpen")
	
	})
				
	// ---------------- Sources List ---------------
	

	$(".sourcesHeader").live("click", function() {
		if (sjs._$sourcesList.is(":visible")) {
			sjs._$sourcesList.hide()
		} else if (sjs._$sourcesWrapper.children() != []) {
			sjs._$sourcesList.show()
		}
	})
	
	$(".source").live("click", function() {
		// Commentary filtering by clicking on source name
		 
		var c = $(this).attr("data-category")
		
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
		
		return false
	})
		
	// --------------- Ref Links in Sources Text -------------------
	
	$(".refLink").live("click", function() {
		var ref = $(this).attr("data-ref");
		if (!ref) retutrn
		location.hash = refHash(parseQuery(ref));
	})
	
	$("li.refLink, .sederBox .refLink").click(function() {
		var ref = ($(this).hasClass("mishna") ? "Mishna " + $(this).text() : $(this).text())
		if (!ref) retutrn
		location.hash = refHash(parseQuery(ref))
	})
	

	// -------------- Paged View Swiping ---------------------
	// UNUSED
	
	if (isTouchDevice() && false) {		
		
		var b = document.getElementById("basetext")
		b.addEventListener("touchstart", function(e) {
			var touch = e.touches[0]
			sjs.touch.start.x = touch.pageX 
			sjs.touch.start.y = touch.pageY
		}, false);
		
		b.addEventListener("touchmove", function(e) {
			var touch = e.touches[0]
			if (sjs.touch.start.x - touch.pageX > 80 && sjs.pages.current < sjs.pages.count-1) {
				sjs.pages.current++
				sjs.touch.start.x = touch.pageX
				updatePage()
	
			} else if (sjs.touch.start.x - touch.pageX < -80 && sjs.pages.current != 0) {
				sjs.pages.current--	
				sjs.touch.start.x = touch.pageX
				updatePage()
			}
		})
		
	}
	
	
	// -------------- Edit Text -------------------
	
	$("#editText").click(function(e) {
		sjs._$basetext.addClass("lines")
		$(".boxOpen").removeClass("boxOpen")
		$("#header").text("Editing " + sjs.current.book + " chapter " + sjs.current.chapter)
		$("#viewButtons").hide()
		$("#editButtons").show()
		$("#prev, #next, #about").hide()
		$(".verse").die()
		$(window).unbind("scroll")
		$(".verse .en").click(clickEdit)
		
		// prevent about from unhiding itself
		e.stopPropagation()
	
	})
	
	
	// ------------- New Text -- TODO Merge with below-------------------------
	
	$("#newText").click(function(e) {
		$(".boxOpen").removeClass("boxOpen")
		$("#overlay").show()
		$("#newTextModal").show()
		$("#newTextOK").hide()
		$("#newTextName").focus()
		
		$("input#newTextName").autocomplete({ source: sjs.books, select: function() {
				
			$("#newTextName").blur()
	
		}});
		
		function getBookSections() {
			$("#newBottom").show()
			$("#newTextOK").hide()
			$("#section").html("Loading…")
	
			if ($("#newTextName").val()) {
				$.getJSON("/index/" + $("#newTextName").val(), function(data){
					
					if ("error" in data) {
						$("#section").html(data.error)
					} else {
						sjs.editing["index"] = data
						$("#newTextName").val(data.title)
						$("#section").html(data.sections[0] + ": <input>")
						$("#newTextOK").show()
						$("#section input").focus()
					}
					
				})
			}
		
		}
		$("#newTextName").blur(getBookSections)
		$("#newTextName").keypress(function(e) {
			if (e.keyCode == 13) getBookSections()
		})
	
		// prevent about from unhiding itself
		e.stopPropagation()
	
	})
	
	$("#newTextCancel").click(function() {
		$("#overlay").hide()
		$("#section").html("")
		$("#newTextName").val("")
		$("#newTextModal").hide()
	
	})
	
	$("#newTextOK").click(function(){
		sjs.editing["book"] = $("#newTextName").val()
		sjs.editing["chapter"] = $("#section input").val()
		
		showNewText()		
		$("#newTextCancel").trigger("click")	
	})
	
	function showNewText() {
		$(".boxOpen").removeClass("boxOpen")
		$("#header").text("Add Text: " + sjs.editing.book + " " + 
			sjs.editing.index.sections[0] +
			" " + sjs.editing.chapter)
		$("#viewButtons").hide()
		$("#editButtons").show()
		$("#prev, #next, #about").hide()
		$(window).unbind("scroll")
			.unbind("resize")
		$("body").addClass("newText")
		sjs._$commentaryBox.hide()
		sjs._$basetext.hide()
		$("#newVersion").show()
		$("#addVersionHeader").show()
		
		$("#newTextNumbers").append("<div class='verse'>1</div>")
		
		$("#newVersion").bind("textchange", checkTextDirection)
			.bind("keyup", handleTextChange)
			.focus()
	
	}
	
	
	// --------------- Add Version  TODO Merge with above ------------------
	
		$("#addVersion").click(function(e) {
			$("#commentaryBox").hide()
			$("#sourcesBox").hide()
			$(".boxOpen").removeClass("boxOpen")
			$("#prev, #next").hide()
			sjs._$basetext.addClass("versionCompare lines")
			$(".verse").unbind("click")
			
			$("#newVersion").css("min-height", sjs._$basetext.height()).show().focus()
			
			$(".compareTitle").text($("#aboutTitle").text())
			
			sjs.editing["book"] = sjs.current.book
			sjs.editing["chapter"] = sjs.current.chapter
			
			$("#header").text("Add a version of " + sjs.editing.book + " chapter " + sjs.editing.chapter)
			$(window).unbind("scroll")
			
			$("#viewButtons").hide()
			$("#editButtons").show()
			$("#addVersionHeader").show()
			
			$("#newVersion").bind("textchange", checkTextDirection)
			$("#newVersion").bind("keyup", handleTextChange)
	
			// prevent about from unhiding itself
			e.stopPropagation()
	
		})
		
	// ------------- Add / Edit Cancel -----------
		
		$("#addVersionCancel").click(function() {
			$("#newTextNumbers .verse").remove()
			buildView(sjs.current)		
		})
		
	// ------------- Add / Edit Save --------------	
		
		$("#addVersionSave").click(function() {
		
			var version = readNewVersion()	
			
			if (version.versionTitle == "" ) {
				alert("Please give a version title.")
				return
			}
			
			if (version.source == "" ) {
				alert("Please give a source.")
				return
			}
			
			saveText(version)
		
		})
		
		
	// ------ Text Syncing --------------
		
		function handleTextChange(e) {
			// Handle Backspace -- whah?
			if (e.keyCode == 8) {
				var cursor = sjs._$newVersion.caret().start
				
				if (cursor) {
					var text = sjs._$newVersion.val()
					
					while (text[cursor] == "\n") cursor++
					
					var newLines = 0;
					while (text[cursor-newLines-1] == "\n") newLines++
					
					if (newLines) {
						text = text.substr(0, cursor-newLines) + text.substr(cursor)
						sjs._$newVersion.val(text)
							.caret({start: cursor-newLines, end: cursor-newLines})
					}
				}
			}
		
			var cursor = sjs._$newVersion.caret().start
			var text = sjs._$newVersion.val().replace(/([^\n])\n([^\n])/g, "$1\n\n$2")
			sjs._$newVersion.val(text)
	
			if (cursor) {
				if (e.keyCode == 13) cursor++
				sjs._$newVersion.caret({start: cursor, end: cursor})
			}
				
		
			if ($("body").hasClass("newText")) {
				var matches = sjs._$newVersion.val().match(/\n+/g)
				var groups = matches ? matches.length + 1 : 1
				numStr = ""
				for (var i = 1; i <= groups; i++) {
					numStr += "<div class='verse'>"+i+"</div>"
				}
				$("#newTextNumbers").empty().append(numStr)
	
				sjs._$newNumbers = $("#newTextNumbers .verse")
				syncTextGroups(sjs._$newNumbers)
	
			} else {
				syncTextGroups(sjs._$verses)
	
			}
	
		}
	
		
		function checkTextDirection() {
			// Look at first 20 charaters, count if Hebrew of English
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
	
		$("#next, #prev").live("click", function() {
			if (this.id == "prev") 
				sjs._direction = -1
			else
				sjs._direction = 1
				
			var ref = $(this).attr("data-ref");
			location.hash = refHash(parseQuery(ref));
		})
	
	
	// ---------------- Layout Options ------------------
		
		// TODO -- Abstract these 6 blocks
		
		$("#block").live("click", function(){
			$("#layoutToggle .toggleOption").removeClass("active")
			$(this).addClass("active")
			sjs._$basetext.addClass("lines")
			setVerseHeights()
			if (sjs.view == "paged") rebuildPagedView()
			else updateVisible()
			
		})
		
		$("#inline").live("click", function(){
			$("#layoutToggle .toggleOption").removeClass("active")
			$(this).addClass("active")
			sjs._$basetext.removeClass("lines")
			setVerseHeights()
			if (sjs.view == "paged") rebuildPagedView()
			else updateVisible()
	
		})
	
	// ------------------ Language Options ---------------
	
		$("#hebrew").live("click", function(){
			$("#languageToggle .toggleOption").removeClass("active")
			$(this).addClass("active")
			sjs._$basetext.removeClass("english bilingual heLeft")
				.addClass("hebrew")
			$("#layoutToggle").show()
			$("#biLayoutToggle").hide()
			setVerseHeights()
			if (sjs.view == "paged") rebuildPagedView()
			else updateVisible()
	
			return false
		})
		
		$("#english").live("click", function(){
			$("#languageToggle .toggleOption").removeClass("active")
			$(this).addClass("active")
			sjs._$basetext.removeClass("hebrew bilingual heLeft")
				.addClass("english")
			$("#layoutToggle").show()
			$("#biLayoutToggle").hide()
			setVerseHeights()
			if (sjs.view == "paged") rebuildPagedView()
			else updateVisible()
	
			return false
	
		})
		
		$("#bilingual").live("click", function() {
			$("#languageToggle .toggleOption").removeClass("active")
			$(this).addClass("active")
			sjs._$basetext.removeClass("english hebrew")
				.addClass("bilingual heLeft")
			$("#layoutToggle").hide()
			$("#biLayoutToggle").show()
			setVerseHeights()
			if (sjs.view == "paged") rebuildPagedView()
			else updateVisible()
	
			return false
	
		})
		
		$("#heLeft").live("click", function() {
			$("#biLayoutToggle .toggleOption").removeClass("active")
			$(this).addClass("active")
			sjs._$basetext.removeClass("english hebrew")
				.addClass("bilingual heLeft")
			setVerseHeights()	
			if (sjs.view == "paged") rebuildPagedView()
			else updateVisible()
	
			return false
	
		})
	
		$("#enLeft").live("click", function() {
			$("#biLayoutToggle .toggleOption").removeClass("active")
			$(this).addClass("active")
			sjs._$basetext.removeClass("english hebrew heLeft")
				.addClass("bilingual")
			setVerseHeights()
			if (sjs.view == "paged") rebuildPagedView()
			else updateVisible()
	
			return false
	
		})
	
	
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
			var source = {}
			
			source["id"] = parseInt($(this).parent().attr("data-id"))
			source["ref"] = sjs.current.book + " " + sjs.current.chapter + ":" + $(this).parent().attr("data-vref")
			
			sjs.add.source = source
			buildOpen(false, true)
		})
	
		
	// ------------------- Commentary Model Hide ----------------------
	
		$(".open").live("click", function(e){
			//$(".open").remove()
			//$("#overlay").hide()
			return false
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
	
	$(".verse").live("click", function (e) {
		lowlightOff();
		var v = $(this).attr("data-num")		
		lowlightOn(v)
	
		if (sjs.flags.verseSelecting) {
			var verse = sjs.current.book + " " + sjs.current.chapter + ":" + (v)
			sjs.add.source = {ref: verse}
			$("#selectedVerse").text(verse)
			$("#selectConfirm").show()
			$("#selectInstructions").hide()
		}
	
		// Scroll commentary view port
		var $comments = sjs._$commentaryBox.find(".commentary[data-vref=" + (v) + "]")
		var $fc = $comments.eq(0);
		if ($fc.length == 1) {	
			var top = $(window).scrollTop() - $(this).offset().top + 120 ;					
			sjs._$commentaryViewPort.clearQueue().scrollTo($fc, {duration: 600, offset: top, easing: "easeOutExpo"})
		
		}
		return false;
	})
	
	
	// --------------- Verse View --------------------
	
	$(".verseNum").live("click", toggleVerseView)
	
	function toggleVerseView() {
	
		if ($("body").hasClass("verseView")) {	
			$(this).parent().removeClass("bigVerse")
			$("body").removeClass("verseView")
			$.scrollTo(this, {offset: -200})
		} else {
			$(this).parent().addClass("bigVerse")
			$("body").addClass("verseView")
			$.scrollTo(0)
		}
	
	}
	
	// --------------- Add Source ------------------------
	
	$(".addSource").live("click", function(){
		sjs._$commentaryBox.hide()
		sjs._$sourcesBox.hide()
		$("#verseSelectModal").show()
		$("#selectConfirm").hide()
		$("#selectInstructions").show()
		sjs.flags.verseSelecting = true
		
		if ($(".lowlight").length) {
			$(".verse").not($(".lowlight")).trigger("click")
		}
		
		return false
	})
	$("#addSourceCancel").live("click", function() {
		$(".open").remove()
		$("#overlay").hide()
		
	})
	
	$("#addModal").click(function() {
		return false;
	})
	
	// --------------- Verse Select ----------------
	
	$("#selectVerse").click(function() {
		$("#addModal, #overlay").hide()
		sjs._$commentaryBox.hide()
		sjs._$sourcesBox.hide()
		$("#verseSelectModal").show()
		sjs.flags.verseSelecting = true
		
	})
	
	$("#verseSelectModal #selectOk").click(function() {
		$("#overlay").show()
		buildOpen()
		sjs._$commentaryBox.show()
		sjs._$sourcesBox.show()
		$("#verseSelectModal").hide()
		lowlightOff()
		sjs.flags.verseSelecting = false
		return false
		
	})
	
	$("#selectReset").click(function() {
		$("#selectInstructions").show()
		$("#selectConfirm").hide()
	
	})
	
	$("#verseSelectModal .cancel").click(function() {
		$("#verseSelectModal").hide()
		$("#sourcesBox").show()
		if (sjs.current.commentary) sjs._$commentaryBox.show()
	
	})
	
	// ------------- Nav Queries -----------------
	
	
			
	$("#goto").keypress(function(e) {
			if (e.keyCode == 13) {
				q = parseQuery($("#goto").val());
				var ref = "/" + q.book;
				if (q.chapter) {
					ref += "." + q.chapter;
				}
				if (q.verse) {
					ref += "." + q.verse;
				}
				location.hash = ref;
			}
		})
		
	$("input#goto").autocomplete({ source: sjs.books });
		
	
}); // ---------------- End DOM Ready --------------------------

function get(q, direction) {
	// take an object representing a query
	// get data from api or cache
	// callback on buildView
	
	direction = direction || 1
	
	sjs.depth += direction
	
	
	if (direction == 1) {
		if (sjs.depth > sjs.thread.length)
			sjs.thread.push(q.ref)
		else {
			sjs.thread[sjs.depth] = q.ref	
			sjs.thread = sjs.thread.slice(0, sjs.depth)
		}	
	}

	sjs.loading = true
	$("#header").html(q.book.replace("_", " ") + " <img id='loadingImg' src='/img/ajax-loader.gif'/>")

	$("#open").removeClass("boxOpen")
	var getStr = "/texts/" + q.book
	if (q.chapter) {
		getStr += "." + q.chapter
	}
	if (q.verse) {
		getStr += "." + q.verse
	} // TODO handle toVerse only
	if (q.toChapter) {
		getStr += "-" + q.toChapter
	}
	if (q.toVerse) {
		getStr += "." + q.toVerse
	}
	
	$(".boxOpen").removeClass("boxOpen")
	$("#layoutToggle, #languageToggle, #overlay").hide()
	$("#goto").val("")
	$(".open").remove()
	$("#next, #prev").hide()
	$(".screen").addClass("goodbye")
	
	var screen = '<div class="screen">' +
						'<div class="basetext english"></div>' +
						'<div class="commentaryBox">' +
							'<div class="commentaryViewPort">' +
							'</div>'+
							'<div class="sourcesBox">'+
								'<div class="sourcesHeader">'+
									'<b><span class="sourcesCount"></span> Sources</b>'+
									'<span class="addSource">Add source <span class="textIcon">+</span></span>'+
									'<div class="clear"></div>'+
								'</div>' +	
								'<div class="sourcesList gradient"><div class="sourcesWrapper"></div></div>' +
							'</div>' +
						'</div>'
	
	$("body").append(screen)
	
	var $screen = $(".screen").last()
	$screen.css("left", (sjs.depth * 100) + "%")
	
	var top = $(window).scrollTop() + ($(window).height() * .09)
	sjs._$commentaryBox.css({"position": "absolute", "top": top + "px", "bottom": "auto"})
	
	sjs._$basetext = $(".basetext").last()
	sjs._$commentaryBox = $(".commentaryBox").last()
	sjs._$commentaryViewPort = $(".commentaryViewPort").last()
	sjs._$sourcesBox = $(".sourcesBox").last()
	sjs._$sourcesWrapper = $(".sourcesWrapper").last()
	sjs._$sourcesList = $(".sourcesList").last()
	sjs._$sourcesHeader = $(".sourcesHeader").last()

	sjs._$commentaryBox.css({"position": "absolute", "top": top + "px", "bottom": "auto"}) 
	
	sjs.pages.current = 0
	sjs.pages.count = 1

	var ref = q.book + "." + q.chapter
	if (ref in sjs.cache) {
		buildView(sjs.cache[ref])
	} else {
		$.getJSON(getStr, buildView)	

	}
		
}


function buildView(data) {
	// take data returned from api and build it into the DOM
	// assumes sjs._$basetext and sjs._$commentaryViewPort are set
	
		if (data.error) {
			$("#header").html(data.error);
			return;
		}
	
		var $basetext = sjs._$basetext
		var $commentaryBox = sjs._$commentaryBox
		var $commentaryViewPort = sjs._$commentaryViewPort
		var $sourcesWrapper = sjs._$sourcesWrapper
		var $sourcesCount = sjs._$sourcesCount
		var $sourcesBox = sjs._$sourcesBox
	
	
		// Clear everything out 
		$basetext.empty().removeClass("noCommentary versionCompare").show()
		$("body").removeClass("newText")
		$commentaryBox.removeClass("noCommentary").hide() // rmv
		$commentaryBox.find(".commentary").remove() // rmv
		$("#addVersionHeader").hide()
		$("#newVersion").hide()
		$("#editButtons").hide()
		$("#viewButtons").show()
		$("#next, #prev").hide()
		
		
		sjs.cache[data.book + "." + data.chapter] = data
		sjs.current = data
		
		book = data.book;
		chapter = data.chapter;
		$("#header").html(data.title)
		
		if (data.he) {
			$("#languageToggle").show()
		} else {
			$("#languageToggle").hide()
			$("#english").trigger("click")
		}
		
		if (!sjs._$basetext.hasClass("bilingual")) $("#layoutToggle").show()
		
		if (data.type == "Mishna") $("#block").trigger("click")
		
		
		// Build basetext
		basetext = basetextHtml(data.text, data.he, "") || "No text for " + data.ref + "."
		var basetextTitle = data.type == "Talmud" ? data.title : [data.book, data.sectionNames[0], data.sections[0]].join(" ")
		basetext = "<div class='sectionTitle'>" + basetextTitle + "</div>" + basetext +
			"<div class='clear'></div>" 
		$basetext.html(basetext)

		sjs._$verses = $(".verse") 
	
		// Populate About menu
		$("#about").css("display", "inline-block")
		$("#aboutTitle").html(sjs.current.versionTitle || sjs.current.heVersionTitle)
		var source = sjs.current.versionSource || sjs.current.heVersionSource
		$("#aboutSource").html("<a href='"+source+"'>"+source+"</a>")
		
		
		// Prefetch Next and Prev
		if (data.next) {
			prefetch(data.next.ref)
			$("#next").attr("data-ref", data.next.ref).show()
		}
		
		if (data.prev) {
			prefetch(data.prev.ref)
			$("#prev").attr("data-ref", data.prev.ref).show()
		}
		
	
		// Parse Commentary into CommentaryBox
		if (data.commentary.length) {
			$sourcesWrapper.empty()
			var colorAssignments = {}
			var sourceCounts = {}	
			var commentaryHtml = ""
			var sourcesHtml = ""
			var n = 0; // number of assiged color in pallette
			
			for (var i = 0; i < data.commentary.length; i++) {
				c = data.commentary[i]
				console.log(c.category)
				// Give each Commentator a Color
				var color;
				console.log("test " + c.category)

				if (!(c.category in colorAssignments)) {
					console.log("new " + c.category)
					colorAssignments[c.category] = n
					sourceCounts[c.category] = 0
					color = sjs.palette[colorAssignments[c.category]];
					sourcesHtml += '<div class="source" data-category="' + c.category +
						'" style="color:'+ color +
						'"><span class="cName">'+
						c.category+'</span><span class="count"></div>'
					n++
				}
								
				sourceCounts[c.category]++
				
				if (typeof(c.anchorText) == "undefined") {c.anchorText = ""}
				c.text = wrapRefLinks(c.text)						
				
				commentaryHtml += "<span class='commentary' data-vref='" + c.anchorVerse + 
					"' data-id='" + c.id +
					"' data-source='" + c.source +
					"' data-category='" + c.category +
					"' data-ref='" + (c.ref || "") +
					"'><span class='commentator refLink' style='color:" + color + "' data-ref='"+ c.ref +"'>" + 								c.commentator + 
					":</span><span class='anchorText'>" + c.anchorText + 
					"</span><span class='text'>" + c.text + "</span></span>"
			} 

			$commentaryViewPort.append(commentaryHtml)
			console.log(sourcesHtml)
			$sourcesWrapper.append(sourcesHtml + "<div class='clear'></div>")
			
			// Build source counts
			// TOOD Broken
			var sourceTotal = 0
			for (category in sourceCounts) {
				$(".count", '.source[data-category="'+category+'"]').text("("+sourceCounts[category]+")")
				sourceTotal += sourceCounts[category]
			}
			
			$sourcesCount.text(sourceTotal)
			
			// Sort by data-ref
			var $comments = $commentaryViewPort.children(".commentary").get();
			$comments.sort(function(a, b) {

			   var compA = parseInt($(a).attr("data-vref"))
			   var compB = parseInt($(b).attr("data-vref"))
			   return (compA < compB) ? -1 : (compA > compB) ? 1 : 0;
			})
			$.each($comments, function(idx, itm) { $commentaryViewPort.append(itm); });
			$commentaryBox.show();										
		
		} else { // No Commentary
			$sourcesCount.text("0")
			$basetext.addClass("noCommentary")
			$sourcesBox.addClass("noCommentary")
			$commentaryBox.show().addClass("noCommentary")
		}
		$sourcesBox.show()	
		$(window).bind("resize scroll", updateVisible)
		sjs.loading = false
		sjs.view = "scroll"
		setScrollMap()
		
		if (isTouchDevice()) {
			//buildPagedView()
			

			
			var btid = "BT" + sjs.depth
			var cbid = "CB" + sjs.depth
			
			$basetext.wrap('<div id="'+ btid +'" />')
				.css({height: "100%"})
			
			$commentaryBox.attr("id", cbid)
		
			scrollBase = new iScroll(btid);
			scrollCommentary = new iScroll(cbid);
			
			sjs._$verses.addClass("touchVerse")
			// iScroll to highlight verse
			updateVisible();

		} else {

			// highlight verse (if indicated)
			if (data.sections.length > 1) {
				lowlightOn(data.sections[1], data.toSections[1]);
				$("#header").html(data.title + ":" + data.sections[1] + "-" + data.toSections[1])
			} else {
				updateVisible();

			}
		
			
		}

		var $screen = $(".screen").last()
		
		if (sjs.depth > 1) $screen.append("<div class='back'><</div>")
		if (sjs.depth < sjs.thread.length) $screen.append("<div class='forward'>></div>")
		
		$(window).scrollTo($screen, {axis: "x", duration: 500, onAfter: function() {
			sjs._$commentaryBox.css({"position": "fixed", "bottom": "0px", "top": "auto"})
			$(window).scrollTo(sjs._$basetext.find(".verse").not(".lowlight").first(), {offset: -200, axis: "y", duration: 200});
			$(".goodbye").remove()
		}})

		

	} // ------- END Build View---------------



	function basetextHtml(en, he, prefix) {
		var basetext = ""
		
		// Step through English Text first
		for (var i = 0; i < en.length; i++) {
            if (en[i] instanceof Array) {
                en[i] = en[i][0]
            }
			var verseText = en[i] || "..."
			if (i == 0 && verseText !== "…") {
				var words = verseText.split(" ")
				if (words.length > 2) {
					verseText = "<span class='lfc'>" + words.slice(0,3).join(" ") + 
						" </span>" + words.slice(3).join(" ")
				} else {
					verseText = "<span class=lfc'>" + words.join(" ") + "</span>"
				}
			}
			var n = prefix + (i+1)

			
			if (typeof(verseText) == "object") {
				var subHe = he.length > i ? he[i] : []
				basetext += basetextHtml(verseText, subHe, n + ".")
				continue
			}
			
			verseText = wrapRefLinks(verseText)
			var verse = '<span class="en">' + verseText + "</span>"
			
			if (he.length > i) {
				verse += '<span class="he">' + he[i] + '</span><div class="clear"></div>'
			}
			
			var verseNum = "<div class='verseNum'>" + n + "</div>"
			
			
			basetext +=	'<span class="verse" data-num="'+ (prefix+n).split(".")[0] +'">' +
				verseNum + verse + '</span>'

		}
		
		// If English was empty, step throug Hebrew Text
		if (!basetext && he.length) {
			//TODO this shouldn't be here
			$("#hebrew").trigger("click")
			$("#languageToggle").hide()

			for (var i = 0; i < he.length; i++) {
				var n = prefix + (i+1)
				var verseText =  "..."
				var verse = '<span class="en">' + verseText + "</span>"
				var heText = he[i] || "…"
					
				if (typeof(heText) == "object") {
					var subHe = he.length > i ? he[i] : []
					basetext += basetextHtml(verseText, suBhe, n + ".")
					continue
				}
				
				var verseNum = "<div class='verseNum'>" + n + "</div>"
				
				verse += '<span class="he">' + verseNum + heText + '</span><div class="clear"></div>'

				basetext +=	'<span class="verse" data-num="'+ (prefix+n).split(".")[0]  +'">' + verse + '</span>'

			}
		
		}
		
	
		return basetext
	
	}

	
// ---------- Paged View --------------------
	
	function buildPagedView()  {
		return
		sjs.view = "paged"
		var height = $(window).height() - 132;		
		sjs._$basetext.css({"top": "112px", "height": height, "overflow": "hidden"})
		$(".lfc").css("padding-top", "20px")	
		$("#pages").remove()
		sjs._$basetext.append("<div id='pages'><div class='page' style='left: 0px'></div></div>")
		sjs.pages.count = 1
		sjs.pages.current = sjs.pages.current || 0
		sjs._$pages = $("#pages")
		var nVerses = $(".verse").length
		for (var i = 0; i < nVerses; i++) {
			$basetext.find(".verse:first").appendTo(".page:last")
			if (overflows($(".page").last())) {
				$("#pages").append("<div class='page'></div>")
				sjs.pages.count++
				$(".page").last().css("left", (sjs._$basetext.width() + 50) * ($(".page").length - 1))
				$(".page").eq(-2).find(".verse:last").appendTo(".page:last")
			}
		
		}
		$(".verse").addClass("touchVerse")
		if (sjs.pages.current) updatePage()
		else updateVisible()	
		sjs.loading = false

	}
	
	function rebuildPagedView() {
	
		$(".verse").appendTo($basetext)
		buildPagedView()
	
	}
	
//  -------------------- Update Visible (Verse Count, Commentary) --------------------------

	function updateVisible() {
		if (sjs.loading) {
			return
		}
		
		if (sjs.view == "scroll") { // Scroll View -- look for verse in view port
			var $v = sjs._$verses
			var $com = sjs._$commentaryViewPort.find(".commentary")
			var $w = $(window);
			var nVerses = $v.length;
			var wTop = $w.scrollTop() + 50
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
			
			if ($(".lowlight").length) {
			
				var $first = $v.not(".lowlight").eq(0)
				var top = $w.scrollTop() - $first.offset().top + 120 ;
				var vref = $first.attr("data-num")
				
				sjs._$commentaryViewPort.clearQueue()
					.scrollTo($com.not(".lowlight").eq(0), {duration: 0, offset: top})
			} else {				
				for (var i = 0; i < sjs._scrollMap.length; i++) {
					if (wTop < sjs._scrollMap[i]) {
						sjs._$commentaryViewPort.clearQueue()
							.scrollTo($com.eq(i), 300)
						break
					}
				}
			}
		
		} else if (sjs.view == "paged") { // Page View -- look for verse in current page
			sjs.visible.first = parseInt($(".page").eq(sjs.pages.current).find(".verse").first().attr("data-num"))
			sjs.visible.last = parseInt($(".page").eq(sjs.pages.current).find(".verse").last().attr("data-num"))		
		
			// Fade commentary out and in)	
			if (!sjs.loading) {
				$commentaryBox.fadeOut(500)
				$commentaryBox.find(".commentary").hide()
				for ( i = sjs.visible.first; i <= sjs.visible.last; i++) {
					$commentaryBox.find(".commentary[data-ref='" + i + "']").show()
				}
				$commentaryBox.fadeIn(500)	
			}
		}

		// sjs.drawLines()
		
		/*for (var i = 0; i < nVerses; i++) {
			var top = parseInt($v.eq(i).offset().top);
			var wtop = parseInt($w.scrollTop());
			if (top - wtop >= 80) {
				if (firstVisible.verse != i) {
					firstVisible.verse = i+1;
					var $comments = $("#commentaryViewPort .commentary[data-ref=" + i + "]")
					if ($comments.eq(0).length == 1) {
						$("#commentaryViewPort").clearQueue();
						$("#commentaryViewPort").scrollTo($comments.eq(0), 600)
					}
				}
				break;
			}
		}

		for (i = i; i < nVerses; i++) {
			var bottom = $v.eq(i).offset().top + $v.eq(i).outerHeight();
			var wbottom = $w.height() + $w.scrollTop(); 
			if (bottom > wbottom) {
				if (lastVisible.verse != i) {
					lastVisible.verse = i + 1;					
				}
				break;	

			}
		}*/
		
		if (sjs.current.type == "Talmud") return
		
		$("#header").html(sjs.current.title  + ":" + sjs.visible.first + "-" + sjs.visible.last)
	
	}




function parseQuery(q) {
	var response = {book: false, chapter: false, verse: false, to: false, toChapter: false, toVerse: false}
	if (!q) return response
	
	var q = q.replace(/[.:]/g, " ").replace(/ +/, " ")
	var toSplit = q.split("-")
	var p = toSplit[0].split(" ")
	
	for (i = 0; i < p.length; i++) {
		if (p[i].match(/\d+[ab]?/)) {
			boundary = i;
			break
		}
	}
	
	words = p.slice(0,i)
	nums = p.slice(i)
	
	response.book = words.join("_")

	if (nums.length) response.chapter = nums[0]
	if (nums.length > 1) response.verse = nums[1]
	
	if (toSplit.length == 2) {
		var cv = toSplit[1].split(" ")
		if (cv.length == 2) {
			response.toChapter = cv[0]
			response.toVerse = cv[1]
		} else if (cv.length == 1) {
			response.toVerse = cv[0]
			response.toChaptere = response.chapter
		}
	}
	
	return response;
}


function buildOpen($c, editMode) {
	// Build modal text view
	// if $c is present, create based on a .commentary
	// if editMode, copy existing .open for editing
	// if neither, build a modal for adding a new source
	// This is a mess. 
	
	
	if (editMode) {
		var commentator = $(".open .commentator").text().substr(0, $(".open .commentator").text().length - 1)
		var text = $(".open .text").text()
		var anchorText = $(".open .anchorText").text()
		var source = $(".open").attr("data-source")
		$("#selectedVerse").text($(".open .openVerseTitle").text())
	}
	
	$(".open").remove()
	
	
	if ($c) {
	// building a modal to read
		$c.clone().hide().appendTo("body")
			.removeClass("commentary").addClass("open")

		
		var $o	= $(".open");
		var v = parseInt($o.attr("data-vref"))			
		
		
		// prefetch ref links 
		$o.find(".refLink").each(function() {
			prefetch($(this).attr("data-ref"))	
		})
		
	} else {
	// building an editing modal
		var ref = $("#selectedVerse").text()
		var v = ref.split(":")[1]
		
		var html = 	'<div class="open edit"><div class="formRow" id="anchorForm"><span class="label">Anchor Words:</span>' +
			'<input><span id="selectAnchor" class="button">Select</span></div>' +
			'<div id="commentatorForm" class="formRow"><div class="label">Commentator or Text Title:</div>' +
			'<input placeholder="e.g., Rashi, Brachot 32a, Bereshit Rabbah 3:4">'+
			'<span class="section"></span><div class="msg"></div></div>' +
			'<div id="addSourceText"></div>' +
			'<div id="addSourceNewText"><div id="textForm" class="formRow"><div class="label">Text:</div><textarea></textarea></div>' +
			'<div id="sourceForm" class="formRow">'+
			'<div class="label">Source:</div><input placeholder="The book or website this text was copied from"></div></div>' +
			'<div id="addSourceType" class="formRow">'+
				'<div class="label">Source Type:</div><select>'+
					'<option value="">Select type...</option>'+
					'<option value="commentary">Commentary</option>'+
					'<option value="quotation">Quotation</option>'+
					'<option value="quotationSource">Quotation Source</option>'+
					'<option value="allusion">Allusion</option>'+
					'<option value="allusionSource">Allusion Source</option>'+
					'<option value="context">Context</option>'+
					'<option value="comparison">Comparison</option>'+
					'<option value="other">Other...</option>'+
				'</select><input id="otherType" placeholder=""></div>' +
			'<div id="addSourceControls"><span id="addSourceSave" class="button">Add</span>'+
			'<span id="addSourceCancel" class="button">Cancel</span></div>' +
			'</div>'
			

		$("body").append(html)
		
		var $o = $(".open")
		$o.css("max-height", "550px")
		if (editMode) $o.removeClass("edit")

		$("#commentatorForm input").autocomplete({ source: sjs.books, select: function() {
			$("#commentatorForm input").blur()
		}});
		
		$("#addSourceSave").click(handleSaveSource)
		$("#addSourceType select").change(function() {
			if ($(this).val() == "other") $("#otherType").show()
			else $("#otherType").hide()
		})
		
		function getBookSectionsSource() {

			if ($("#commentatorForm input").val() && ! find(" on ", $("#commentatorForm input").val())) {
				$("#addSourceText").text("")
				$("#addSourceNewText").hide()
				$("#addSourceSave").hide()
				$.getJSON("/index/" + $("#commentatorForm input").eq(0).val(), function(data) {
					
					if ("error" in data) {
						$("#commentatorForm .section").html(data.error)
					} else {
						sjs.editing["index"] = data
						$("#textForm textarea").val("")
						$("#commentatorForm input").eq(0).val(data.title)
						if (data.categories[0] == "Commentary") {
							$("#commentatorForm input").eq(0).val(data.title + " on " + sjs.add.source.ref)
							$("#addSourceNewText").show()
							$("#commentatorForm .section").html()
							$("#commentatorForm input").eq(0).css("width", "350px")


						} else {
							sectionsHtml = ""	
							for (var i = 0 ; i < data.sections.length; i++) {
								sectionsHtml += data.sections[i] + ": <input>"
							}
							$("#commentatorForm .section").html(sectionsHtml)

							$("#commentatorForm input").eq(0).css("width", "120px")
							$("#commentatorForm .section input").eq(0).focus()

						}


					
						$("#commentatorForm .section input").blur(function() {
							var vals = []
							for (i = 0 ; i < $("#commentatorForm input").length ; i++) {
								var  v = $("#commentatorForm input").eq(i).val()
								if (v) vals.push(v)
								else return
							}
							ref = vals.join(".")
							$("#commentatorForm .msg").text("Looking for " + ref)
							$("#addSourceText").text()
							$.getJSON("/texts/"+makeRef(parseQuery(ref)), function(data) {
								// See if we have this text
								if (data.error) {
									// error from server
									$("#commentatorForm .msg").text(data.error)
									return
								}
								if (!data.text || !data.text[data["sections"][1]]) {
									// know about it, but don't have it
									$("#addSourceNewText").show()
									$("#addSourceSave").hide()
									$("#addSourceText").text("")
									$("#commentatorForm .msg").text("Sefaria doesn't have this text. Please enter it below.")
								} else {
									// here it is
									$("#addSourceText").text(data.text[data["sections"][1]])
									$("#commentatorForm .msg").text("")
									$("#addSourceSave").show()
									$("#addSourceType").show()
								}

			
								
							})
							
						})
					
					}
				})
			}
		
		}
		$("#commentatorForm input").blur(getBookSectionsSource)
		$("#commentatorForm input").live("keypress", function(e) {
			if (e.keyCode == 13) $(this).trigger("blur")
		})			
		

			
		$("#selectAnchor").toggle(function() {
			$o.addClass("selectingAnchor")
			$(this).text("OK")
		}, function() {
			$o.removeClass("selectingAnchor")
			if ($("#anchorForm input").val()) {
				$(this).text("Change")
				$("#anchorForm input").show()
			} else {
				$(this).text("Select")
			}

		})

	}
	
	if (editMode) {
		$("#commentatorForm input").val(commentator)
		$("#anchorForm input").val(anchorText)
		if (anchorText) $("#anchorForm input").show()
		$("#textForm textarea").val(text)
		$("#sourceForm input").val(source)
		$("#addSourceSave").text("Save")

	}
	var verse = $(".verse").eq(v-1).find(".en").text();
	var title = $("#header").html()
	title = title.split(":")
	title = title[0] + ":" + v
	
	$o.prepend("<br>")
		.prepend("<div class='openVerse'>" + (verse.length > 810 ? verse.slice(0,810) + "..." : verse) + "</div>");
	if ($o.hasClass("edit")) title = "Add a source to " + title
	$o.prepend("<div class='openVerseTitle'>"+title+"</div>");

	
	var h = $o.height();
	var w = $o.width();
	var mh = parseInt($o.css("max-height"));
	var p = parseInt($o.css("padding-top"));
	var pl = parseInt($o.css("padding-left"));
	var wh = $(window).height();
	var ww = $(window).width();

	if (h + (2*p) >= mh) {
		$o.wrapInner("<div class='openBottom' />");
		$o.children().eq(0).height(h - p)
		$o.append('<div class="openScrollCtl"> \
			<img src="/img/up.png" class="up"/> \
			<img src="/img/down.png" class="down"/> \
		</div>');
	} else {
		
	}
	
	$o.css("top",  (wh - (h+(2*p))) / 2.2 + "px");
	$o.css("left", (ww - (w+(2*pl))) / 2 + "px");
	
	if ($c) {
		$o.append("<div class='editLink'>Edit</div>")	
	} else {
		//select anchor words	
	 	var words = verse.split(" ")
	 	// wrap each word in verse 
	 	var html = ""
	 	for (var i = 0; i < words.length; i++) {
	 		html += '<span class="selectWord">' + words[i] + "</span> "
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
			
			$("#anchorForm input").val(anchorWords)
			})
			
			return false

	}
	
	$o.show();
	$("#overlay").show()
	return false
}


function wrapRefLinks(text) {
	
	var refReStr = "(" + sjs.books.join("|") + ") (\\d+):(\\d+)([\\-–]\\d+(:\\d+)?)?"
	var refRe = new RegExp(refReStr, "g")
	var refText = text.replace(refRe, '<span class="refLink" data-ref="$1.$2.$3$4">$1 $2:$3$4</span>')
	return refText
	
}

function readSource() {
	
	
	var source = {}
	var ref1 = sjs.add.source.ref.replace(":", ".") 
	var vals = []
	for (i = 0 ; i < $("#commentatorForm  input").length ; i++) {
		var  v = $("#commentatorForm  input").eq(i).val()
		if (v) vals.push(v)
		else return
	}
	var ref2 = vals.join(".")
	
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

function handleSaveSource() {
	var source = readSource()
	
	console.log(source)
	
	// TODO validaite source (or should that be in readSource?)
	
	saveSource(source)

	// TODO save text if new
}

function saveSource(source) {
 	postJSON= JSON.stringify(source);
	
	$.post("/links", {"json": postJSON}, function(data) {
		if (data.error) {
			alert(data.error)
		} else if (data) {
			$(".open").remove()
			$("#overlay").hide()
			
			if (!sjs.current.commentary) {
				sjs.current.commentary = [data]
			} else {
				
				for (var i = 0; i < sjs.current.commentary.length; i++) {
					if (sjs.current.commentary[i].id == data.id) {
						sjs.current.commentary.splice(i, 1)
					}
				}
				sjs.current.commentary.push(data)

			}
			buildView(sjs.current)
		} else {
			alert("Sorry, there was a problem saving your source")
		}
	})
}


function makeRef(q) {
	var ref = q.book.replace(" ", "_");
	if (q.chapter) {
		ref += "." + q.chapter;
	}
	if (q.verse) {
		ref += "." + q.verse;
	}
	if (q.toChapter) {
		ref += "-" + q.toChapter + "." + q.toVerse
	} else if (q.toVerse) {
		ref += "-" + q.toVerse
	}
	
	return ref
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


function heightAtChar(n) {
// Not fully working
	n++
	var text = $("#newVersion").val()
	text = text.substr(0,n) + "<span id='heightMarker'/>" + text.substr(n)
	text = text.replace(/\n/g, "<br>")
	sjs._$newVersionMirror.html(text).show()
	
	var top = $("#heightMarker").offset().top
	
	$("#newVersionMirror").hide()
	
	$("#dot").remove()
	
	$("<div id='dot'/>").appendTo("body")
		.css({"position": "absolute", 
			"height": "10px",
			"width": "10px",
			"left": "50%",
			"background": "red",
			"top": top})
	return top;
	
	
	
}

function heightAtGroup(n) {


	var text = sjs._$newVersion.val()
			
	text = "<span class='heightMarker'>" + text
	text = text.replace(/(\n+)([^\n])/g, "</span>$1<span class='heightMarker'>$2")
	text = text.replace(/\n/g, "<br>")
	text = text + "</span>"


	sjs._$newVersionMirror.html(text)
	
	if (n >= $(".heightMarker").length) return false;

	
	sjs._$newVersionMirror.show()
	
	var top = $(".heightMarker").eq(n).offset().top
	
	sjs._$newVersionMirror.hide()
	
	return top;
	
	
	
}

function syncTextGroups($target) {
	
	
	var verses = $target.length

	for (var i = 1; i < verses; i++) {

	
		vTop = $target.eq(i).offset().top
		
		tTop = heightAtGroup(i)

		if (!tTop) return
		
		// Text is above matching line
		if (vTop < tTop) {
			
			var marginBottom = parseInt($target.eq(i-1).css("margin-bottom")) + (tTop-vTop)
			
			$target.eq(i-1).css("margin-bottom", marginBottom + "px")
			
		
		// Matching line is above text	
		} else if (tTop < vTop) {
			// Try to reset border above and try cycle again
			if (parseInt($target.eq(i-1).css("margin-bottom")) > 32) {
				$target.eq(i-1).css("margin-bottom", "32px")
				i--
				continue
			}
			// Else add an extra new line to push down text and try again
			var text = sjs._$newVersion.val()
			
			var regex = new RegExp("\n+", "g")
				
			for (var k = 0; k < i; k++) {
				var m = regex.exec(text)
			}
			
			text = text.substr(0, m.index) + "\n" + text.substr(m.index)
			
			var cursorPos = sjs._$newVersion.caret().start
			sjs._$newVersion.val(text)
				.caret({start: cursorPos+1, end: cursorPos+1})
			
			i--
			
		}
	
	
	}


}

function readNewVersion() {
	
	var version = {}

	version["title"] = sjs.editing.book
	version["chapter"] = sjs.editing.chapter

	var text = $("#newVersion").val();
	var verses = text.split(/\n\n+/g)
	
	version["text"] = verses
	version["language"] = $("#language").val()
	version["versionTitle"] = $("#versionTitle").val()
	version["method"] = $("#versionMethod").val()
	version["versionSource"] = $("#versionSource").val()
	
	return version
	
}

	
function saveText(text) {
 	
 	var ref = text.title.replace(" ", "_") + "." + text.chapter
 	
 	delete text["title"]
 	delete text["chapter"]
 	
 	postJSON= JSON.stringify(text);
	
	$.post("/texts/" + ref, {json: postJSON}, function(data) {
		
		data = JSON.parse(data)
		if ("error" in data) {
		 	alert(data.error)
		} else {
			alert("It seems to have worked.")
			location.hash = refHash(parseQuery(ref));

		}
	})
}

function cache(ref, data) {
	sjs.cache[ref] = data
	
	try {
		localStorage.setItem("sjs.cache", JSON.stringify(sjs.cache))
	} catch (e) {
		return
	}

}

function prefetch(ref) {

	ref = makeRef(parseQuery(ref))
	if (ref in sjs.cache) return	

	$.getJSON("/texts/" + ref, function(data) {
	
		if (data.error) return
		
		cache(data.book + "." + data.chapter, data)
	})
}

function lowlightOn(n, m) {
	
	m = m || n
	n = parseInt(n)
	m = parseInt(m)
	$c = sjs._$commentaryViewPort.find(".commentary[data-vref="+ (n) + "]")
	sjs._$commentaryViewPort.find(".commentary").addClass("lowlight")
	$c.removeClass("lowlight")
	$(".verse").addClass("lowlight" )
	$(".verse").each(function() {
		if (n <= parseInt($(this).attr("data-num")) && parseInt($(this).attr("data-num"))  <= m) {
			$(this).removeClass("lowlight")
		}
	});
}


function lowlightOff() {
	sjs._$commentaryViewPort.find(".commentary").removeClass("lowlight")
	$(".verse").removeClass("lowlight")
}

function updatePage() {
	var left = -sjs.pages.current * (sjs._$basetext.width() + 50)
	sjs._$pages.css("left", left)
	lowlightOff()
	updateVisible()
}

function setVerseHeights() {
	sjs._verseHeights = []
	if (!sjs._$verses) return
	sjs._$verses.each(function() {
		sjs._verseHeights.push($(this).offset().top)
	})	
}

function setScrollMap() {
	// Maps each commentary to a window scrollTop position, based on top positions of verses.
	
	if(!sjs._verseHeights) setVerseHeights()
	sjs._scrollMap = []
	
	// walk through each verse, split among it's commentaries
	for (var i = 0; i < sjs._$verses.length; i++) {
		var prevTop = (i == 0 ?  0 : sjs._verseHeights[i-1])
		var space = sjs._verseHeights[i] - prevTop
		
		var nCommentaries = sjs._$commentaryViewPort.find(".commentary[data-vref="+ (i+1) + "]").length
		for (k = 0; k < nCommentaries; k++) {
			var prevCTop = (sjs._scrollMap.length == 0 ?  0 : sjs._scrollMap[sjs._scrollMap.length-1])
			sjs._scrollMap.push(prevCTop + ( space / nCommentaries) )
		}
	
	}
	
	return sjs._scrollMap
		
}

function clickEdit(e) {
	// Enable click editing on element e
	
	var $text, top, left, width, height, pos, fontSize
	
	$text = $(this)
	pos = $text.offset()
	top = pos.top - 2
	left = pos.left - 2
	height = $text.height()
	width = $text.width()
	fontSize = $text.css("font-size")
	
	$(this).addClass("editing")
	
	var closeEdit = function (e) {
	
		var text = $(this).val()
		$(".editing").html(text)
		$(".editing").removeClass("editing")
		
		$(this).remove() 
	}
	
	var text =  $text.text()
	
	$("<textarea class='clickEdit'>" + text + "</textarea>").appendTo("body")
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

// -------------- Canvas Lines (Unused) --------------------------

sjs.drawLines = function() {
	ctx = document.getElementById("canvas").getContext("2d");
	var $cb = $("#canvasBox")
	var	width = $cb.width()
	var height = $cb.height()
	ctx.canvas.width = width
	ctx.canvas.height = height
			
	var $com = sjs._$commentaryViewPort.find(".commentary")
	var k = 0
	
	
	for (var i = 0; i < sjs._$verses.length; i++) {
		var num = sjs._$verses.eq(i).attr("data-num")
		var o = 14
		
		while ($com.length > k && $com.eq(k).attr("data-vref") == num ) {
			var left = sjs._$verses.eq(i).offset().top - $(window).scrollTop()
			var right = $com.eq(k).offset().top
			
			if (right > 80 && right < $(window).height()) {
			
				ctx.moveTo(0, left+o)
				ctx.lineTo(width, right+o)
				//o += 8
			}
						
			k++
		} 		
		
	}
	
	ctx.strokeStyle = "#aaa"
	ctx.stroke()

}


function isTouchDevice() {  
	return true;
  try {  
    document.createEvent("TouchEvent");  
    return true;  
  } catch (e) {  
    return false;  
  }  
}

function isInt(x) {
		var y=parseInt(x);
		if (isNaN(y)) return false;
		return x==y && x.toString()==y.toString();
	}
