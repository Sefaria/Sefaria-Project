$(function() {
	
	if (sjs.current) {
		sjs.initLoad = true;
		buildSheet(sjs.current)
	} else {
		$("#title").html("New Source Sheet <span class='titleSub'>click to add a title</span>")
		$("#empty").show();
		sjs.initLoad = false;
	}
	
	window.onbeforeunload = function() { 
		if (sjs._uid && !(sjs.current) && $("#empty").length === 0) {
			return "There are unsaved changes to your Source Sheet."
		}	
	}
	
	// ------------- Top Controls -------------------
	
	$("#addSource").click(function() { 
		$("#addSourceModal").data("target", $("#sources")).show()
			.position({of: $(window), offset: "0 -30"}); 
		$("#add").focus() 
		$("#underlay").show();
	})

	$(document).on("click", "#addSourceOK", function() {
		var q = parseRef($("#add").val())
		addSource(q);	
	});
	
	$("#addComment").click(function() {
		$("#sources").append("<div class='comment'></div>");
		$(".comment").last().trigger("click");
	})

	$("#addOutside").click(function() {
		$("#sources").append("<div class='outside'></div>");
		$(".outside").last().trigger("click");
	})
	
	$("#closeAddSource").click(function() { 
		$("#addSourceModal, #underlay").hide(); 
		$("#error").empty();
		$("#textPreview").remove();
	});
	
	$.getJSON("/api/index/titles/", function(data) {
		sjs.books = data.books;
		$("#add").autocomplete({ source: sjs.books, focus: function(event, ui) { return false; } });
	});

	var checkAddSource = function(e) {
		checkRef($("#add"), $("#addDialogTitle"), $("#addOK"), 0, addSourcePreview, false);
	}

	$("#add").keyup(checkAddSource)
		.keypress(function(e) {
		if (e.keyCode == 13) {
			if ($("#addSourceOK").length) {
				$("#addSourceOK").trigger("click");
			} else if ($("#addDialogTitle").text() === "Unkown text. Would you like to add it?") {
				var path = parseURL(document.URL).path;
				window.location = "/add/new/" + $("#add").val().replace(/ /g, "_") + "?after=" + path;
			}
		}					
	});

	$("#options .optionItem").click(function() {
		$("#sheet").toggleClass($(this).attr("id"))
		$(".ui-icon-check", $(this)).toggleClass("hidden")
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
		
	$(".comment, .outside").live("click", clickEdit);
	$("#sources").sortable({handle: ".title", stop: autoSave});
	$(".subsources").sortable({handle: ".title", stop: autoSave});
	$(".customTitle").live("click", clickEdit);

	$(".editTitle").live("click", function() {
		$(".customTitle", $(this).closest(".source")).eq(0).show().trigger("click")
			.next().addClass("hasCustom");
	});
	
	$(".removeSource").live("click", function() { 
		if (confirm("Are you sure you want to remove this source?")) {
			$(this).closest(".source").remove();
			autoSave();
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

}) // ------------------ End DOM Ready  ------------------ 


function addSource(q) {
	// Initiate adding a Source to the page
	// Completed by loadSource on return of AJAX call

	var $listTarget = $("#addSourceModal").data("target");

	// TODO replace with makeRef
	var getStr = "/api/texts/" + makeRef(q) + "?commentary=0&context=0";
	
	$("#addSourceModal, #underlay").hide();
	$("#textPreview").remove();
	$("#add").val("");
	
	$listTarget.append("<li class='source'>" +
		(sjs.can_edit ? 
		'<div class="controls"><span class="ui-icon ui-icon-triangle-1-s"></span>' +
			'<div class="optionsMenu">' +
				"<div class='editTitle optionItem'>Edit Source Title</div>" +
				"<div class='addSub optionItem'>Add Sub-Source</div>" +
				"<div class='addSubComment optionItem'>Add Comment</div>" +
				'<div class="removeSource optionItem">Remove Source</div>'+
				//"<div class='seeContext optionItem'>See Context</div>" +
			"</div>" +
		"</div>" : "") + 
		"<span class='customTitle'></span><span class='title'></span>" +
		"<a class='openLink' href='/" + makeRef(q) + "' target='_blank'>open <span class='ui-icon ui-icon-extlink'></span></a>" +
		"<div class='text'></div><ol class='subsources'></ol></li>")
	
	var $target = $(".source", $listTarget).last();
	var loadClosure = function(data) {loadSource(data, $target)}
	
	sjs.loading++;
	
	$.getJSON(getStr, loadClosure);	
	
	$("#empty").remove();
}


function loadSource(data, $target) {
	if (data.error) {
		$("#error").html(data.error);
		$target.remove();
		sjs.loading--;
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

	$("#sources").sortable({handle: ".title"});
	$(".subsources").sortable({handle: ".text"});

	if (!sjs.initLoad) {
		$(window).scrollTop($target.position().top - 300);
		autoSave();
	}

	sjs.loading--;
	if (!sjs.loading) {
		sjs.initLoad = false;
	}
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
		var newText = $(this).val();
		if (newText) {
			var html = $(this).val().replace(/[\n\r]/g, "<br>")
			if ($(".editing").hasClass("outside")) {
				html = makeOutsideHtml(html);
			}
			$(".editing").html(html).removeClass("editing")
		} else {
			// Text is empty - restore defaults or removing depending on type
			if ($(".editing").attr("id") == "title") {
				var html = "New Source Sheet <span class='titleSub'>click to add a title</span>"
				$(".editing").html(html).removeClass("editing")
			} else if ($(".editing").hasClass("comment") || $(".editing").hasClass("outside"))  {
				$(".editing").remove()
			} else if ($(".editing").hasClass("customTitle")) {
				$(".editing").empty().removeClass("editing").hide()
					.next().removeClass("hasCustom")
			}
			
		}
		$(this).remove() 
		if (newText != text) {
			autoSave();
		}
	}
	
	// Conver <br> to \n
	if ($("br", $text).length) {
		$("br", $text).after("\n").remove()	
	} 
	// ignore default text in title
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
		
		if ($(".editing").attr("id") == "title" || $(".editing").hasClass("customTitle")) {
			$(".clickEdit").keypress(function(e) {
				if (e.keyCode == 13) $(this).trigger("focusout")
			})
		} else {
			$(".clickEdit").elastic();
		}

}
	

function readSheet() {
	// Create a JS Object representing the sheet as it stands in the DOM

	var sheet = {};
	if (sjs.current) {
		sheet["id"] = sjs.current.id;
	}

	sheet["title"] = ($("#title").children().length == 0) ? $("#title").text() : "";
	
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
	// Create an array of objects representing sources found in $target
	// Used recursively to read sub-sources
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
			source["comment"] = readText($(this));
		} else if ($(this).hasClass("outside")) {
			source["outsideText"] = readText($(this));
		} 
		sources.push(source)
	})
	return sources
}


function handleSave() {
	if (sjs.loading) { return }
	if (!sjs._uid) { return alert("Sorry I can't save what you've got here: you need to be signed in to save."); }
	sjs.autosave = true;
	$("#save").text("Saving...");
	var sheet = readSheet();
	saveSheet(sheet, true);
}


function autoSave() {
	if (sjs.current && sjs.current.id) {
		saveSheet(readSheet());
	}
}


function saveSheet(sheet, reload) {
 	var postJSON = JSON.stringify(sheet);
	var id = sheet.id || "";
	$.post("/api/sheets/", {"json": postJSON}, function(data) {
		if (data.id) {
			sjs.current = data
			if (reload) {
				window.location = "/sheets/" + data.id;
			}
		} else if ("error" in data) {
			$("#error").text(data.error)
			$("#save").text("Save")
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
	
	if (data.title) {
		$("#title").text(data.title);
	} else {
		$("#title").text("Untitled Source Sheet");
	}
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
	// Recursive function to build sources into target, subsources will call this functon again
	// with a subsource target. 
	for (var i = 0; i < sources.length; i++) {
		if (sources[i].ref) {
			var q = parseRef(sources[i].ref);
			$("#addSourceModal").data("target", $target);
			addSource(q);
			
			if (sources[i].title) {
				$(".customTitle").last().text(sources[i].title).show();
				$(".title").last().addClass("hasCustom");
			}
			
			if (sources[i].subsources) {
				buildSources($(".subsources", $(".source").last()), sources[i].subsources);
			}
			
		} else if (sources[i].comment) {
			var commentHtml = "<div class='comment'>" + sources[i].comment.replace(/[\n\r]/g, "<br>") + "</div>";
			$target.append(commentHtml);

		} else if (sources[i].outsideText) {
			var outsideHtml = "<div class='outside'>" + makeOutsideHtml(sources[i].outsideText) + "</div>";
			$target.append(outsideHtml);
		}

	}
}


function addSourcePreview(e) {
	$("#addDialogTitle").html("<span class='btn' id='addSourceOK'>Add This Source</span>");
	var ref = $("#add").val();
	if (!$("#textPreview").lenght) { $("body").append("<div id='textPreview'></div>") }
	$("#textPreview").position({my: "left top", at: "left bottom", of: $("#add") })
		.width($("#add").width());
	textPreview(ref, $("#textPreview"));
}


function makeOutsideHtml(text) {
	// Create html for an 'outside text' out of text
	// inserts line breaks and makes the first line bold
	var html = text.replace(/[\n\r]/g, "<br>");
	var spot = html.indexOf("<br>");
	spot = spot == -1 ? html.length : spot;
	html = "<span class='title'>" + html.substr(0,spot) + "</span>" + html.substr(spot);
	return html;
}


function readText($el) {
	// convert html in $el to text, n particular convert <br> to \n

	var $clone = $el.clone();
	if ($("br", $clone).length) {
		$("br", $clone).after("\n").remove();
	}
	return $clone.text();
}