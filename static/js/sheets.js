sjs.flags = {"saving": false };

var halloInit = sjs.can_edit ? { 
		floating: false,
		showAlways: true,
		toolbar: 'halloToolbarFixed',	
		plugins: {
  		  'halloformat': {},
  		  'hallojustify': {},
  		  'halloreundo': {}
  		} 
	} : {editable: false};

$(function() {
	
	window.onbeforeunload = function() { 
		if (sjs._uid && !(sjs.current) && $("#empty").length === 0) {
			return "There are unsaved changes to your Source Sheet."
		}	
	}
	
	// ------------- Top Controls -------------------
	
	$("#addSource, #addButton").click(function() { 
		$("#addSourceModal").data("target", $("#sources")).show()
			.position({of: $(window), offset: "0 -30"}); 
		$("#add").focus() 
		$("#overlay").show();
		sjs.track.sheets("Open Add Source Modal");
	})

	$(document).on("click", "#addSourceOK", function() {
		var q = parseRef($("#add").val())
		addSource(q);
		$("#closeAddSource").trigger("click");
		sjs.track.sheets("Add Source");
	
	});
	
	$("#addComment").click(function(e) {
		$("<div class='comment'></div>").appendTo("#sources").hallo(halloInit).focus();
		sjs.track.sheets("Add Comment");
		$("#empty").remove();
		e.stopPropagation();

	})

	$("#addOutside").click(function(e) {
		$("#sources").append("<li class='outside'></li>");
		$(".outside").last().hallo(halloInit).focus();
		sjs.track.sheets("Add Outside Text");
		$("#empty").remove();
		e.stopPropagation();
	})
	
	$("#closeAddSource").click(function() { 
		$("#addSourceModal, #overlay").hide(); 
		$("#add").val("");
		$("#error").empty();
		$("#textPreview").remove();
		$("#addDialogTitle").text("Enter a text or commentator name:")
		sjs.track.sheets("Close Add Source Modal");

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

	$("#print").click(function(){ 
		window.print() 
	});

	$("#options .optionItem").click(function() {
		$("#sheet").toggleClass($(this).attr("id"))
		$(".ui-icon-check", $(this)).toggleClass("hidden")
		if (this.id === "public") { 
			sjs.track.sheets("Make Public Click");
			autoSave(); 
		}
	});

	$(".sharingOption").unbind("click");
	$("#options .sharingOption").click(function() {
		$(".sharingOption .ui-icon-check").addClass("hidden")
		$(".ui-icon-check", $(this)).removeClass("hidden")
		if ($(this).hasClass("groupOption")) {
			var group = $(this).attr("data-group");
			sjs.track.sheets("Share with Group: " + group);
			$("#partnerLogo").attr("src", "/static/partner/" + group + ".png");
			$("#sheetHeader").show();
		} else {
			sjs.track.sheets("Make Sheet " + this.id);
			$("#sheetHeader").hide();
		}
		autoSave(); 
	});
	
	$(".languageOption, .layoutOption").unbind("click");
	$(".languageOption, .layoutOption").click(function() {
		var optionType = $(this).hasClass("languageOption") ? ".languageOption" : ".layoutOption";
		$(optionType).each(function() {
			$("#sheet").removeClass($(this).attr("id"))
			$("span", $(this)).addClass("hidden")
		})
		
		$("#sheet").addClass($(this).attr("id"))
		$("span", $(this)).removeClass("hidden")
		autoSave();
	});
	

	// ------------ Empty Instructions ---------------------

	$("#empty .icon-remove").click(function() { $("#empty").remove(); });

	$("#readmore").toggle(function(e) { $("#howItWorks").show(); e.preventDefault(); }, function(e) {
		$("#howItWorks").hide(); e.preventDefault();
	});


	// ------------- Build Sheet -------------------

	if (sjs.current) {
		buildSheet(sjs.current)
	} else {
		$("#title").html("New Source Sheet");
		$("#empty").show();
	}


	// ------------- Editing -------------------

	$(".customTitle").live("keydown", function(e) {
		if (e.keyCode == 13) {
			$(this).blur();
		}
	})

	$("#title, .comment, .outside, .customTitle, .en, .he").hallo(halloInit)
		.live("hallomodified", function() {
			$(this).addClass("modified");
		}).live("hallodeactivated", function() {
			var $mod = $(".modified");
			if ($mod.length) {
				if ($mod.text() === "") {
					if ($mod.prop("id") == "title") {
						$mod.html = "Untitled Source Sheet";
					} else if ($mod.hasClass("comment") || $mod.hasClass("outside")) {
						$mod.remove();
					} else if ($mod.hasClass("customTitle")) {
						$mod.hide().next().removeClass("hasCustom");
					}
				}
				autoSave();
				$mod.removeClass("modified");
			}

		});


	// ------------- Source Controls -------------------
		
	if (sjs.can_edit) {
		$("#sources, .subsources").sortable({handle: ".title", stop: autoSave, placeholder: 'ui-state-highlight'});
	}

	$(".editTitle").live("click", function() {
		var $customTitle = $(".customTitle", $(this).closest(".source")).eq(0);
		if ($customTitle.text() === "") {
			$customTitle.html("Source Title");
		}
		$customTitle.show().focus()
			.next().addClass("hasCustom");

		sjs.track.sheets("Edit Source Title");
	});
	
	$(".removeSource").live("click", function() { 
		if (confirm("Are you sure you want to remove this source?")) {
			$(this).closest(".source").remove();
			autoSave();
		}
		sjs.track.sheets("Remove Source");

	 });
	 
	$(".addSub").live("click", function() { 
		$("#addSourceModal").data("target", $(".subsources", $(this).closest(".source")).eq(0))
			.show(); 
		$("#add").focus();
		$("#overlay").show();
		sjs.track.sheets("Add Sub-Source");

	});

	$(".addSubComment").live("click", function() {
		$(".subsources", $(this).closest(".source")).eq(0).append("<div class='comment'></div>")
			.find(".comment").last().hallo(halloInit).focus();
		sjs.track.sheets("Add Sub Comment");
	});
	
	$(".copySource").live("click", function() {
		var ref = $(this).parents(".source").attr("data-ref");
		copyToSheet(ref);
	});

	
	// ------------- Open Sheet -------------------
	 
	$("#open").click(function() {
		$("#openModal").show().position({of: $(window)})
		$("#overlay").show();
		sjs.track.sheets("Open Open Sheet Modal");

	});
	$("#closeOpen").click(function() {
		$("#openModal").hide()
		$("#overlay").hide();
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
		 		var title = $("<div>" + data.sheets[i].title + "</div>").text();
		 		$("#sheets").append("<a class='sheetLink' href='/sheets/" + data.sheets[i].id + "'>" + title + "</a>")
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
			 		var title = $("<div>" + data.sheets[i].title + "</div>").text();
			 		$("#privateSheets").append("<a class='sheetLink' href='/sheets/" + data.sheets[i].id + "'>" + title + "</a>")
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
		'<div class="controls btn"><span class="ui-icon ui-icon-triangle-1-s"></span>' +
			'<div class="optionsMenu">' +
				"<div class='editTitle optionItem'>Edit Source Title</div>" +
				"<div class='addSub optionItem'>Add Sub-Source</div>" +
				"<div class='addSubComment optionItem'>Add Comment</div>" +
				'<div class="removeSource optionItem">Remove Source</div>'+
				'<div class="copySource optionItem">Copy Source</div>'+				
				//"<div class='seeContext optionItem'>See Context</div>" +
			"</div>" +
		"</div>" : 
		'<div class="controls btn"><span class="ui-icon ui-icon-triangle-1-s"></span>' +
			'<div class="optionsMenu">' +
				'<div class="copySource optionItem">Copy Source</div>'+				
				//"<div class='seeContext optionItem'>See Context</div>" +
			"</div>" +
		"</div>") + 
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
	var getStr = "/api/texts/" + makeRef(q) + "?commentary=0&context=0";
	$.getJSON(getStr, loadClosure);	
	
}


function loadSource(data, $target) {
	if (data.error) {
		$("#error").html(data.error);
		$target.remove();
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
		data.text = data.text.length ? [data.text] : [];
		data.he = data.he.length ? [data.he] : [];
	}

	var enStr = "<span class='en'>";
	var heStr = "<span class='he'>";
	var end = Math.max(data.text.length, data.he.length);

	for (var i = 0; i < end; i++) {
		if (data.text.length > i) {
			enStr += data.text[i] + " "; 
		} else {
			enStr += "<i>No English available</i> ";
		}
		if (data.he.length > i) {
			heStr += data.he[i] + " ";
		} else {
			heStr += "<i>No Hebrew available</i> ";
		}
	}
	verseStr = enStr + "</span>" + heStr + "</span><div class='clear'></div>";
	$text.append(verseStr);
	$text.find(".en, .he").hallo(halloInit);
	$target.find(".customTitle").eq(0).hallo(halloInit);
	$(".controls", $target).show();

	if (sjs.can_edit) {
		$("#sources, .subsources").sortable({handle: ".title", stop: autoSave, placeholder: 'ui-state-highlight'});
	}

	$.scrollTo($target, {offset: -200, duration: 300});
	autoSave();
}
	

function readSheet() {
	// Create a JS Object representing the sheet as it stands in the DOM
	// One day I will get my truth out of the DOM. 
	var sheet = {};
	if (sjs.current) {
		sheet["id"] = sjs.current.id;
	}

	sheet["title"] = $("#title").html();
	sheet["sources"] = readSources($("#sources"));
	sheet["options"] = {};

	sheet.options.numbered = $("#sheet").hasClass("numbered") ? 1 : 0;
	sheet.options.language = $("#sheet").hasClass("hebrew") ? "hebrew" : $("#sheet").hasClass("bilingual") ? "bilingual" : "english";
	sheet.options.layout = $("#sheet").hasClass("stacked") ? "stacked" : "sideBySide";

	var $status = $(".sharingOption .ui-icon-check").not(".hidden").parent();

	if (sjs.current.status === 5) {
		sheet["status"] = 5;
	} else if ($status.hasClass("groupOption")) {
		sheet["status"] = 6;
		sheet["group"] = $status.attr("data-group");
	} else {
		var st = {"private": 0, "public": 3};
		sheet["status"] = st[$status[0].id];
	}

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

function validateSheet(sheet) {
	
	
}

function handleSave() {
	if (!sjs._uid) {
		sjs.track.sheets("Logged out Save Attempt");
		return alert("Sorry I can't save what you've got here: you need to be signed in to save."); 
	}
	sjs.autosave = true;
	$("#save").text("Saving...");
	var sheet = readSheet();
	saveSheet(sheet, true);
	sjs.track.sheets("Save New Sheet");

}


function autoSave() {
	if (sjs.current && sjs.current.id && sjs.autoSave) {
		saveSheet(readSheet());
	}
}


function saveSheet(sheet, reload) {
 	if (sheet.sources.length == 0) {
 		alert("empty sheet!");
 		console.log(sheet);
 		return;
 	}
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
	sjs.autoSave = false;

	if (data.title) {
		$("#title").html(data.title);
	} else {
		$("#title").text("Untitled Source Sheet");
	}
	$("#sources").empty();
	$("#addSourceModal").data("target", $("#sources"));
	if (data.options && data.options.numbered) { 
		$("#numbered").trigger("click");
	} 
	if (data.options && data.options.language) {
		$("#" + data.options.language).trigger("click");
	}
	if (data.options && data.options.layout) {
		$("#" + data.options.layout).trigger("click");
	}
	if (data.status === 3) {
		$("#public .ui-icon-check").removeClass("hidden");
	}
	if (data.status === 0) {
		$("#private .ui-icon-check").removeClass("hidden");
	}
	if (data.status == 6) {
		$(".groupOption[data-group="+ data.group + "] .ui-icon-check").removeClass("hidden");
		$("#partnerLogo").attr("src", "/static/partner/" + data.group + ".png".replace(/ /g, "-")).show();
	}
	buildSources($("#sources"), data.sources);
	sjs.autoSave = true;
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
	$("#addDialogTitle").html("Source found. Specify a range with '-'.<span class='btn btn-primary' id='addSourceOK'>Add This Source</span>");
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
			.position({my: "left top", at: "left bottom", of: $("#add"), collision: "none" }).width($("#add").width())
	});
}

// --------------- Add to Sheet ----------------

function copyToSheet(ref) {
	if (!sjs._uid) { return sjs.loginPrompt(); }
	sjs.selected = ref;
	
	// Get sheet list if necessary
	if (!$("#sheetList .sheet").length) {
		$("#sheetList").html("Loading...");
		$.getJSON("/api/sheets/user/" + sjs._uid, function(data) {
			$("#sheetList").empty();
			var sheets = "";
			for (i = 0; i < data.sheets.length; i++) {
				sheets += '<li class="sheet" data-id="'+data.sheets[i].id+'">'+
					data.sheets[i].title + "</li>";
			}
			sheets += '<li class="sheet new"><i>Start a New Source Sheet</i></li>'
			$("#sheetList").html(sheets);
			$("#addToSheetModal").position({of:$(window)});
			$(".sheet").click(function(){
				$(".sheet").removeClass("selected");
				$(this).addClass("selected");
				return false;
			})
		})			
	}

	$("#addToSheetModal .sourceName").text(ref);

	$("#overlay").show();
	$("#addToSheetModal").show().position({ of: $(window) });
	
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
		var url = "/api/sheets/" + selected.attr("data-id") + "/add";
		sjs.flags.saving = true;
		$.post(url, {ref: sjs.selected}, addToSheetCallback);	
	}

	function addToSheetCallback(data) {
		sjs.flags.saving = false;
		$("#addToSheetModal").hide();
		if ("error" in data) {
			sjs.alert.message(data.error)
		} else {
			sjs.alert.message(selectedRef + ' was added to "'+title+'".<br><br><a target="_blank" href="/sheets/'+data.id+'">View sheet.</a>')
		}
	}

});


