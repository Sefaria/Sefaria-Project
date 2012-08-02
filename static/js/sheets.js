var halloInit = { 
		plugins: {
  		  'halloformat': {},
  		  'hallojustify': {},
  		  'halloreundo': {}
  		}
	};

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
		$("#closeAddSource").trigger("click");		
	});
	
	$("#addComment").click(function() {
		$("<div class='comment'></div>").appendTo("#sources").hallo(halloInit).focus();
	})

	$("#addOutside").click(function() {
		$("#sources").append("<li class='outside'></li>");
		$(".outside").last().hallo(halloInit).focus();
	})
	
	$("#closeAddSource").click(function() { 
		$("#addSourceModal, #underlay").hide(); 
		$("#add").val("");
		$("#error").empty();
		$("#textPreview").remove();
		$("#addDialogTitle").text("Enter a text or commentator name:")
	});
	
	$.getJSON("/api/index/titles/", function(data) {
		sjs.books = data.books;
		$("#add").autocomplete({ source: sjs.books, focus: function(event, ui) { return false; } });
	});

	// Wrapper function for checkRef for adding sources for sheets
	var checkAddSource = function(e) {
		checkRef($("#add"), $("#addDialogTitle"), $("#addOK"), 0, addSourcePreview, false);
	}

	$("#add").keyup(checkAddSource)
		.keyup(function(e) {
		if (e.keyCode == 13) {
			if ($("#addSourceOK").length) {
				$("#addSourceOK").trigger("click");
			} else if ($("#addDialogTitle").text() === "Unknown text. Would you like to add it?") {
				var path = parseURL(document.URL).path;
				window.location = "/add/new/" + $("#add").val().replace(/ /g, "_") + "?after=" + path;
			}
		}					
	});

	$("#options .optionItem").click(function() {
		$("#sheet").toggleClass($(this).attr("id"))
		$(".ui-icon-check", $(this)).toggleClass("hidden")
		if (this.id === "public") { autoSave(); }

	});
	
	$(".languageOption").unbind("click");
	$(".languageOption").click(function() {
		$(".languageOption").each(function() {
			$("#sheet").removeClass($(this).attr("id"))
			$("span", $(this)).addClass("hidden")
		})
		
		$("#sheet").addClass($(this).attr("id"))
		$("span", $(this)).removeClass("hidden")
	});
		
	// ------------- Editing -------------------

	$("#title, .comment, .outside, .customTitle, .en, .he").hallo(halloInit)
		.live("hallomodified", function() {
			$(this).addClass("modified");
			console.log("modified");
		}).live("hallodeactivated", function() {
			console.log("deactivated");
			var $mod = $(".modified");
			if ($mod.length) {
				if ($mod.text() === "") {
					if ($mod.prop("id") == "title") {
						$mod.html = "Untitled Source Sheet";
					} else if ($mod.hasClass("comment") || $mod.hasClass("outside")) {
						$mod.remove();
					}
				}
				autoSave();
				$mod.removeClass("modified");
			}

		});


	
	// ------------- Source Controls -------------------
		
	$("#sources").sortable({handle: ".title", stop: autoSave});
	$(".subsources").sortable({handle: ".title", stop: autoSave});

	$(".editTitle").live("click", function() {
		$(".customTitle", $(this).closest(".source")).eq(0).show().focus()
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
		$(".subsources", $(this).closest(".source")).eq(0).append("<div class='comment'></div>")
			.find(".comment").last().hallo(halloInit).focus();
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


function addSource(q, text) {
	// Initiate adding a Source to the page
	// Completed by loadSource on return of AJAX call
	// unless 'text' is present, then load with given text

	var $listTarget = $("#addSourceModal").data("target");
	
	$listTarget.append("<li class='source' data-ref='"+humanRef(q.ref)+"'>" +
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
		"<span class='customTitle'></span><span class='title'>"+humanRef(q.ref)+"</span>" +
		"<a class='openLink' href='/" + makeRef(q) + "' target='_blank'>open<span class='ui-icon ui-icon-extlink'></span></a>" +
		"<div class='text'>" + 
			(text ? "<span class='en'>" + text.en + "</span><span class='he'>" + text.he + "</span><div class='clear'></div>" : "") +
		"</div><ol class='subsources'></ol></li>")
	
	$("#empty").remove();
	var $target = $(".source", $listTarget).last();

	if (text) {
		$target.find(".controls").show();
		return;
	}

	var loadClosure = function(data) {loadSource(data, $target)}
	sjs.loading++;
	var getStr = "/api/texts/" + makeRef(q) + "?commentary=0&context=0";
	$.getJSON(getStr, loadClosure);	
	
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
	
	// If this is not a range, put text string in arrays
	if (typeof(data.text) === "string" || typeof(data.he) === "string") {
		data.text = data.text ? [data.text] : [];
		data.he = data.he ? [data.he] : [];
	}

	var enStr = "<span class='en'>";
	var heStr = "<span class='he'>";
	var end = Math.max(data.text.length, data.he.length);

	for (var i = 0; i < end; i++) {
		if (data.text.length > i) {
			enStr += data.text[i] + " "; 
		} else {
			enStr += "...";
		}
		if (data.he.length > i) {
			heStr += data.he[i];
		} else {
			heStr += "...";
		}
	}
	verseStr = enStr + "</span>" + heStr + "</span><div class='clear'></div>";
	$text.append(verseStr);
	$text.find(".en, .he").hallo(halloInit);
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
	

function readSheet() {
	// Create a JS Object representing the sheet as it stands in the DOM

	var sheet = {};
	if (sjs.current) {
		sheet["id"] = sjs.current.id;
	}

	sheet["title"] = $("#title").html();
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
	var sources = [];
	$target.children().each(function() {
		var source = {};
		if ($(this).hasClass("source")) {
			source["ref"] = $(this).attr("data-ref");
			source["text"] = {en: $(this).find(".text").find(".en").html(), 
							  he: $(this).find(".text").find(".he").html()};
			var title = $(".customTitle", $(this)).eq(0).html();
			if (title) source["title"] = title;
			if ($(".subsources", $(this)).eq(0).children().length) {
				source["subsources"] = readSources($(".subsources", $(this)).eq(0));
			}
		} else if ($(this).hasClass("comment")) {
			source["comment"] = $(this).html();
		} else if ($(this).hasClass("outside")) {
			source["outsideText"] = $(this).html();
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
			var text = sources[i].text || null;
			addSource(q, text);
			
			if (sources[i].title) {
				$(".customTitle").last().html(sources[i].title).show();
				$(".title").last().addClass("hasCustom");
			}
			
			if (sources[i].subsources) {
				buildSources($(".subsources", $(".source").last()), sources[i].subsources);
			}
			
		} else if (sources[i].comment) {
			var commentHtml = "<div class='comment'>" + sources[i].comment + "</div>";
			$target.append(commentHtml);

		} else if (sources[i].outsideText) {
			var outsideHtml = "<li class='outside'>" + sources[i].outsideText + "</li>";
			$target.append(outsideHtml);
		}

	}
}


function addSourcePreview(e) {
	$("#addDialogTitle").html("<span class='btn' id='addSourceOK'>Add This Source</span>");
	var ref = $("#add").val();
	if (!$("#textPreview").length) { $("body").append("<div id='textPreview'></div>") }
	
	textPreview(ref, $("#textPreview"), function() {
		if ($("#textPreview .previewNoText").length === 2) {
			$("#addDialogTitle").html("<i>No text available. Click below to add text.</i>");
		}
		if ($("#textPreview .error").length > 0) {
			$("#addDialogTitle").html("Uh-Oh");
		}
		$("#textPreview")
			.position({my: "left top", at: "left bottom", of: $("#add") }).width($("#add").width())
	});
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
