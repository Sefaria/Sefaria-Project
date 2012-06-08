$(function() {
	
	if (sjs.current) {
		buildSheet(sjs.current)
		sjs.initLoad = true;
	} else {
		$("#title").html("New Source Sheet <span class='titleSub'>click to add a title</span>")
		$("#empty").show();
		sjs.initLoad = false;
	}
	
	window.onbeforeunload = function() { 
		if (sjs.changes) {
			return "There are unsaved changes to your Source Sheet."
		}	
	}
	
	// ------------- Top Controls -------------------
	
	$("#addSource").click(function() { 
		$("#addSourceModal").data("target", $("#sources")).show(); 
		$("#add").focus() 
	})
	
	$("#addComment").click(function() {
		$("#sources").append("<div class='comment'></div>");
		$(".comment").last().trigger("click");
	})
	
	$("#closeAddSource").click(function() { $("#addSourceModal").hide(); $("#error").empty() });
	$.getJSON("/index/titles/", function(data) {
		sjs.books = data.books;
		$("#add").autocomplete({ source: sjs.books });
	});

	var checkAddSource = function(e) {
		checkRef($("#add"), $("#addDialogTitle"), $("#addOK"), 0, sheetAddSuccess, false);
	}

	var sheetAddSuccess = function() {	
		$("#addDialogTitle").html("Press [enter] to add this source.");
	}

	$("#add").keyup(checkAddSource)
		.keypress(function(e) {
		if (e.keyCode == 13) {
			var q = parseRef($("#add").val())
			addSource(q, true);	
		}					
	});

	$(".optionItem").click(function() {
		$("#sheet").toggleClass($(this).attr("id"))
		$("span", $(this)).toggleClass("hidden")
	});
	
	$(".languageOption").unbind("click")
	$(".languageOption").click(function() {
		$(".languageOption").each(function() {
			$("#sheet").removeClass($(this).attr("id"))
			$("span", $(this)).addClass("hidden")
		})
		
		$("#sheet").addClass($(this).attr("id"))
		$("span", $(this)).removeClass("hidden")
	})
		
	$("#title").live("click", clickEdit)

	
	// ------------- Source Controls -------------------
		
	$(".comment").live("click", clickEdit);
	$("#sources").sortable({handle: ".title"});
	$(".subsources").sortable({handle: ".title"});
	$(".customTitle").live("click", clickEdit);

	$(".editTitle").live("click", function() {
		$(".customTitle", $(this).closest(".source")).eq(0).show().trigger("click")
			.next().addClass("hasCustom");
	});
	
	$(".removeSource").live("click", function() { 
		if (confirm("Are you sure you want to remove this source?")) {
			$(this).closest(".source").remove();
		}
	 });
	 
	$(".addSub").live("click", function() { 
		$("#addSourceModal").data("target", $(".subsources", $(this).closest(".source")).eq(0))
			.show(); 
		$("#add").focus();
	});

	$(".addSubComment").live("click", function() {
		$(".subsources", $(this).closest(".source")).eq(0).append("<div class='comment'></div>");
		$(".comment", $(this).closest(".source")).last().trigger("click");
	});
	
	
	// ------------- Open Sheet -------------------
	 
	$("#open").click(function() {
		$("#openModal").show().position({of: $(window)})
		$("#underlay").show();
	});
	$("#closeOpen").click(function() {
		$("#openModal").hide()
		$("#underlay").hide();
	});		
	
	$("#sheetsTabs").tabs();

	$("#sheetsTabs a").click(function() {
		$("#openModal").position({of: $(window)});
	});

	// ------------- New Sheet -------------------

	
	$("#new").click(function() {
		window.location = "http://www.sefaria.org/sheets/"
	})
	
	// ---------- Save Sheet --------------
	
	$("#save").click(handleSave)

	
	// ------------- Open Passage -------------------

	
	$(".openPassage").live("click", function() {
		var ref = $(this).closest(".source").attr("data-ref");
		window.open("/" + makeRef(parseRef(ref)), "_newtab");

	})

	/*
	// ------------- See Context -------------------
	
	$(".seeContext").live("click", function() {
		var ref = $(this).closest(".source").attr("data-ref")
		var chapter = sjs.cache[ref]
		var $text = $(".text", $(this).closest(".source")).eq(0)
		
		$text.empty().addClass("open")
		
		for ( var i = 0; i < chapter.text.length; i++ ) {
			var classStr = "verse"
			if (chapter.verse <= i+1 && i+1 <= chapter.toVerse) {
				classStr += " highlight"
			}
			$text.append("<span class='" + classStr + "'>" + chapter.text[i] + "  </span>")
		}
		
		$text.scrollTop($(".highlight").eq(0).position().top - 47)
		
		$(this).text("Hide Context")
			.removeClass("seeContext").addClass("hideContext")

	})
	
	$(".hideContext").live("click", function() {
		var ref = $(this).closest(".source").attr("data-ref")
		var chapter = sjs.cache[ref]
		var $text = $(".text", $(this).closest(".source")).eq(0)
		
		$text.empty().removeClass("open")
		
		for ( var i = chapter.verse-1; i < chapter.toVerse; i++ ) {
			var classStr = "verse"

			$text.append("<span class='" + classStr + "'>" + chapter.text[i] + "  </span>")
		}
		
		$(this).text("Show Context")
			.removeClass("hideContext").addClass("seeContext")

	})
	*/
	
	 // Preload list of Public sheets
	 $.get("/api/sheets/", function(data) {
	 	if (data.error) {
	 		alert(data.error)
	 		return
	 	} else if (data.sheets) {
	 		$("#sheets").empty();
		 	for (var i = 0; i < data.sheets.length; i++) {
		 		$("#sheets").append("<a class='sheetLink' href='/sheets/" + data.sheets[i].id + "'>" + data.sheets[i].title + "</a>")
		 	}	
	 	}	 
	 })
	 // Preload list of private sheets
	 if (sjs._uid) {
		 $.get("/api/sheets/user/" + sjs._uid, function(data) {
		 	if (data.error) {
		 		alert(data.error)
		 		return
		 	} else if (data.sheets && data.sheets.length) {
		 		$("#privateSheets").empty();
			 	for (var i = 0; i < data.sheets.length; i++) {
			 		$("#privateSheets").append("<a class='sheetLink' href='/sheets/" + data.sheets[i].id + "'>" + data.sheets[i].title + "</a>")
			 	}	
		 	} else {
		 		$("#privateSheets").html("<i>You have no saved sheets.</i>");
		 	}
		 });
	}
})


function addSource(q, saveAfter) {
	
	var $listTarget = $("#addSourceModal").data("target");

	// TODO replace with makeRef
	var getStr = "/texts/" + makeRef(q) + "?commentary=0&context=0";
	
	$("#addSourceModal").hide();
	$("#add").val("");
	
	$listTarget.append("<li class='source'>" +
		'<div class="controls"><span class="ui-icon ui-icon-triangle-1-s"></span>' +
			'<div class="optionsMenu">' +
				"<div class='editTitle optionItem'>Edit Source Title</div>" +
				"<div class='addSub optionItem'>Add Sub-Source</div>" +
				"<div class='addSubComment optionItem'>Add Comment</div>" +
				'<div class="removeSource optionItem">Remove Source</div>'+
				//"<div class='seeContext optionItem'>See Context</div>" +
				"<div class='openPassage optionItem'>Open Passage</div>" +
			"</div>" +
		"</div>" + 
		"<span class='customTitle'></span><span class='title'></span><div class='text'></div><ol class='subsources'></ol></li>")
	
	var $target = $(".source", $listTarget).last();
	var loadClosure = function(data) {loadSource(data, $target)}
	
	sjs.loading++;
	
	$.getJSON(getStr, loadClosure);	
	
	$("#empty").remove();

	if (saveAfter) changes = true;
}


function loadSource(data, $target) {
	if (data.error) {
		$("#error").html(data.error);
		$target.remove();
		if (!--sjs.loading) doneLoading();
		return;
	}
	
	var $title = $(".title", $target).eq(0);
	var $text = $(".text", $target).eq(0);
	
	sjs.cache[data.ref] = data;
	
	$target.attr("data-ref", data.ref);	
	var title = data.book + " " + data.sections.join(":");
	if (data.toSections.length > 1 && data.toSections[1] != data.sections[1]) {
		title += "-" + data.toSections[1]; 
	}
	$title.html(title);
	var verseStr = "";
	var start = data.sections.length > 1 ? data.sections[1] - 1 : 0;
	var end = data.toSections.length > 1 ? data.toSections[1] : Math.max(data.text.length, data.he.length);
	
	// If this is not a range, put text string in arrays
	if (typeof(data.text) === "string" || typeof(data.he) === "string") {
		data.text = data.text ? [data.text] : [];
		data.he = data.he ? [data.he] : [];
		start = 0;
		end = 1;
	}

	for (var i = start; i < end; i++) {
		verseStr += "<span class='verse'>";
		if (data.text.length > i) {
			verseStr += "<span class='en'>" + data.text[i] + "</span>  "; 
		} else if (data.he.length > i) {
			verseStr += "<span class='en heOnly'>" + data.he[i] + "</span>  "; 
		}
		if (data.he.length > i) {
			verseStr += "<span class='he'>" + data.he[i] + "</span>";
		} else if (data.text.length > i ) {
			verseStr += "<span class='he enOnly'>" + data.text[i] + "</span>";
		}
		verseStr += "<div class='clear'></div></span>";
	}
	$text.append(verseStr);
	$(".controls", $target).show();

	if (sjs.autosave) {
		handleSave();
	}

	if (!--sjs.loading) doneLoading();
	$("#sources").sortable({handle: ".title"});
	$(".subsources").sortable({handle: ".text"});

	if (!sjs.loading && !sjs.initLoad) {
		$(window).scrollTop($target.position().top - 300);
	}

	if (!sjs.loading) sjs.initLoad = false;
}


function doneLoading() {
	$("#sheetLoading").hide();
	if (sjs.current) sjs.autosave = true;
}


function clickEdit(e) {
	
	var	$text = $(this),
		pos = $text.offset(),
		top = pos.top - 2,
		left = pos.left - 2,
		height = $text.height(),
		width = $text.width(),
		fontSize = $text.css("font-size");
	
	$(this).addClass("editing");
	
	var closeEdit = function (e) {
		
		if ($(this).val()) {
			var text = $(this).val().replace(/[\n\r]/g, "<br>")
			$(".editing").html(text).removeClass("editing")
		} else {
			if ($(".editing").attr("id") == "title") {
				var text = "New Source Sheet <span class='titleSub'>click to add a title</span>"
				$(".editing").html(text).removeClass("editing")
			} else if ($(".editing").hasClass("comment")) {
				$(".editing").remove()
			} else if ($(".editing").hasClass("customTitle")) {
				$(".editing").empty().removeClass("editing").hide()
					.next().removeClass("hasCustom")
			}
			
		}
		
		$(this).remove() 
	}
	
	// empty text for title.

	if ($("br", $text).length) {
		$("br", $text).after("\n").remove()	
	} 
	var text = $(".titleSub", $text).length ? "" : $text.text()
	
	$("<textarea class='clickEdit'>" + text + "</textarea>").appendTo("body")
		.css({"position": "absolute",
				"top": top,
				"left": left,
				"height": height,
				"width": width,
				"font-size": fontSize,
				"line-height": fontSize})
		.bind("focusout", closeEdit)
		.focus();
		
		if ($(".editing").attr("id") == "title") {
			$(".clickEdit").keypress(function(e) {
				if (e.keyCode == 13) $(this).trigger("focusout")
			})
		} else {
			$(".clickEdit").elastic();
		}

}
	

function readSheet() {
	var sheet = {};
	
	if ($("#title").children().length == 0 && $("#title").text() != "") sheet["title"] = $("#title").text();
	
	sheet["sources"] = readSources($("#sources"));
	
	if ($("#sheet").hasClass("numbered")) {
		sheet["options"] = {"numbered": 1};
	} else {
		sheet["options"] = {"numbered": 0};
	}

	sheet["status"] = ($("#public .ui-icon-check").hasClass("hidden") ? 0 : 3);
	
	return sheet;

}


function readSources($target) {
	var sources = []
	$target.children().each(function() {
		var source = {}
		if ($(this).hasClass("source")) {
			source["ref"] = $(this).attr("data-ref")
			var title = $(".customTitle", $(this)).eq(0).text()
			if (title) source["title"] = title
			if ($(".subsources", $(this)).eq(0).children().length) {
				source["subsources"] = readSources($(".subsources", $(this)).eq(0))
			}
		} else if ($(this).hasClass("comment")) {
			source["comment"] = $(this).text()
		}
		sources.push(source)
	})
	return sources
}


function handleSave() {
	if (sjs.loading) { return }
	if (!sjs._uid) { return alert("Sorry I can't save what you've got here: you need to be signed in to save."); }
	sjs.autosave = true
	$("#save").text("Saving...")
	var sheet = readSheet()
	if (sjs.current) {
		sheet["id"] = sjs.current.id
		sheet["dateCreated"] = sjs.current.dateCreated
	}
	saveSheet(sheet)

}


function saveSheet(sheet) {
 	postJSON= JSON.stringify(sheet);
		id = sheet.id || ""
	$.post("/api/sheets/", {"json": postJSON}, function(data) {
		if (data.id) {
			sjs.current = data
			$("#save").text("Saved")
			$(".sheetLink[data-id=" + data.id + "]").remove()
			if ($("#privateSheets .sheetLink").length === 0) {
				$("#privateSheets").empty();
			}
			$("#privateSheets").prepend("<div class='sheetLink' data-id='" + data.id + "'>" + data.title + "</div>")
		} else if ("error" in data) {
			$("#error").text(data.error)
			$("#save").text("Saved")
		}
		setTimeout("$('#error').empty()", 3000)
	})
}


function loadSheet(id) {
	$("#title").empty()
	$("#sources").empty()
	$("#sheetLoading").show()
	
	$.get("/api/sheets/" + id, buildSheet)	
}


function buildSheet(data){
		if (data.error) {
			alert(data.error);
			return;
		}
		
		sjs.current = data;
		
		if (data.title) $("#title").text(data.title);
		$("#sources").empty();
		$("#addSourceModal").data("target", $("#sources"));
		if (data.options && data.options.numbered) { 
			$("#sheet").addClass("numbered");
			$("#numbered .ui-icon-check").removeClass("hidden");
		}
		if (data.status === 3) {
			$("#public .ui-icon-check").removeClass("hidden");
		}
		buildSources($("#sources"), data.sources);
		
}
	

function buildSources($target, sources) {
	for (var i = 0; i < sources.length; i++) {
		if (sources[i].ref) {
			var q = parseRef(sources[i].ref)
			$("#addSourceModal").data("target", $target)
			addSource(q)
			
			if (sources[i].title) {
				$(".customTitle").last().text(sources[i].title).show()
				$(".title").last().addClass("hasCustom")
			}
			
			if (sources[i].subsources) {
				buildSources($(".subsources", $(".source").last()), sources[i].subsources)
			}
			
		} else if (sources[i].comment) {
			var commentHtml = "<div class='comment'>"+sources[i].comment.replace(/[\n\r]/g, "<br>")+"</div>"
			$target.append(commentHtml)
		}
		


	}
}