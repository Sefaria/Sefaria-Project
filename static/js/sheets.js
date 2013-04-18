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


$(window).on("beforeunload", function() { 
	if (sjs._uid && !(sjs.current) && $("#empty").length === 0) {
		return "Your Source Sheet has unsaved changes. Before leaving the page, click Save to keep your work.";
	}	
});

// Hide Missing images
$("img").error(function () { 
    $(this).hide();
});

$(function() {
	
	// ------------- Top Controls -------------------
	
	$("#addSource, #addButton").click(function() { 
		$("#addSourceModal").data("target", $("#sources")).show()
			.position({of: $(window)}); 
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
		afterAction();
		e.stopPropagation();

	})

	$("#addOutside").click(function(e) {
		$("#sources").append("<li class='outside'></li>");
		$(".outside").last().hallo(halloInit).focus();
		sjs.track.sheets("Add Outside Text");
		afterAction();
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
	
	$("#add").autocomplete({ source: sjs.books, focus: function(event, ui) { return false; } });

	// Wrapper function for checkRef for adding sources for sheets
	var checkAddSource = function(e) {
		checkRef($("#add"), $("#addDialogTitle"), $("#addOK"), 0, addSourcePreview, false);
	}

	// Adding unknown Texts from Add modal
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


	// Printing
	$("#print").click(function(){ 
		window.print() 
	});


	// General Options 
	$("#options .optionItem").click(function() {
		$("#sheet").toggleClass($(this).attr("id"))
		$(".ui-icon-check", $(this)).toggleClass("hidden")
	});


	// Language & Layout Options
	$(".languageOption, .layoutOption").unbind("click").click(function() {
		var optionType = $(this).hasClass("languageOption") ? ".languageOption" : ".layoutOption";
		$(optionType).each(function() {
			$("#sheet").removeClass($(this).attr("id"))
			$("span", $(this)).addClass("hidden")
		})
		$("#sheet").addClass($(this).attr("id"))
		$("span", $(this)).removeClass("hidden")
		autoSave();
	});


	// Sharing Options
	$(".sharingOption").unbind("click").click(function() {
		$(".sharingOption .ui-icon-check").addClass("hidden");
		$("span", $(this)).removeClass("hidden")
		if (this.id === "public") { 
			sjs.track.sheets("Make Public Click");
			autoSave(); 
		}
		autoSave();
	});


	// Group Options
	$(".groupOption").unbind("click").click(function() {
		$(".groupOption .ui-icon-check").addClass("hidden")
		$(".ui-icon-check", $(this)).removeClass("hidden")
		var group = $(this).attr("data-group");
		if (group != "None") {
			sjs.track.sheets("Share with Group: " + group);
			var groupUrl = group.replace(/ /g, "-");
			$("#partnerLogo").attr("src", "/static/partner/" + groupUrl + "/header.png");
			$("#sheetHeader").show();
		} else {
			sjs.track.sheets("Unshare Sheet with Group");
			$("#sheetHeader").hide();
		}
		autoSave(); 
	});
	
	

	// ------------ Empty Instructions ---------------------

	$("#empty .icon-remove").click(function() { $("#empty").remove(); });

	$("#readmore").toggle(function(e) { $("#howItWorks").show(); e.preventDefault(); }, function(e) {
		$("#howItWorks").hide(); e.preventDefault();
	});


	// ------------- Build the Sheet! -------------------

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
			if ($(this).hasClass("customTitle") && $(this).text() === "Source Title") {
				$(this).addClass("modified");
			} 
			var $mod = $(".modified");
			if ($mod.length) {
				console.log($mod.text());
				if ($mod.text() === "" || $mod.text() === "Source Title") {
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
		$("#sources, .subsources").sortable({ start: closeHallo,
											  stop: autoSave,
											  cancel: ':input, button, .inEditMode',
											  placeholder: 'sortPlaceholder',
											  revert: 100,
											  delay: 100,
											  opacity: 0.9});
	}

	// Prevent sortable from hijacking focus, which breaks hallo.js
	$(".text .en, .text .he, .comment, .outside").live("mousedown", function(e) {
  		console.log($(e.currentTarget));
  		$(e.currentTarget).focus();
	});


	// Custom Source Titles
	$(".editTitle").live("click", function() {
		var $customTitle = $(".customTitle", $(this).closest(".source")).eq(0);
		if ($customTitle.text() === "") {
			$customTitle.html("Source Title");
		}
		$customTitle.show().focus()
			.next().addClass("hasCustom");

		sjs.track.sheets("Edit Source Title");
	});
	

	// Remove Source
	$(".removeSource").live("click", function() { 
		if (confirm("Are you sure you want to remove this source?")) {
			$(this).closest(".source").remove();
			autoSave();
		}
		sjs.track.sheets("Remove Source");

	 });
	 

	// Add Sub-Source
	$(".addSub").live("click", function() { 
		$("#addSourceModal").data("target", $(".subsources", $(this).closest(".source")).eq(0))
			.show(); 
		$("#add").focus();
		$("#overlay").show();
		sjs.track.sheets("Add Sub-Source");

	});

	// Add comment below a Source
	$(".addSubComment").live("click", function() {
		$(".subsources", $(this).closest(".source")).eq(0).append("<div class='comment'></div>")
			.find(".comment").last().hallo(halloInit).focus();
		sjs.track.sheets("Add Sub Comment");
	});
	
	// Copy a Source
	$(".copySource").live("click", function() {
		var source = readSource($(this).parents(".source"));
		copyToSheet(source);
	});

	
	// ------------- Open Sheet -------------------
	 
	$("#open").click(function() {
		$("#openModal").show();
		$("#overlay").show();
		sjs.track.sheets("Open Open Sheet Modal");

	});
	$("#closeOpen").click(function() {
		$("#openModal").hide();
		$("#overlay").hide();
	});		
	
	$("#sheetsTabs").tabs();

	$("#publicSheets").load("/sheets/public?fragment=1", function() {
		 $("#publicSheets .sheetTable").tablesorter();
	});
	if (sjs._uid) {
		$("#userSheets").load("/sheets/private?fragment=1", function() {
			 $("#userSheets .sheetTable").tablesorter();
		});		
	}


	/*
	// Preload list of Public sheets
	$.get("/api/sheets/", function(data) {
		if (data.error) {
			alert(data.error);
		} else if (data.sheets) {
	 	$("#publicSheets tbody").html(sheetListHtml(data));
		}	 
	});

	// Preload list of private sheets
	if (sjs._uid) {
		$.get("/api/sheets/user/" + sjs._uid, function(data) {
			if (data.error) {
				alert(data.error);
			} else if (data.sheets && data.sheets.length) {
				$("#userSheets tbody").html(sheetListHtml(data));
			};
		});
	}

	function sheetListHtml(data) {
		var html = "";
	 	for (var i = 0; i < data.sheets.length; i++) {
	 		html += "<tr class='sheetRow'>" +
	 					"<td class='title'>" + data.sheets[i].title + "</td>" +
	 					"<td classs='author'>" + data.sheets[i].author + "</td>" +
	 					"<td class='size'>" + data.sheets[i].size + "</td>" +
	 					"<td class='modified'>" + data.sheets[i].modified + "</td>" +
	 				"</tr>";
	 	}
	 	return html;
	}
	*/

	// ------------- New Sheet -------------------
	
	$("#new").click(function() {
		window.location = "http://www.sefaria.org/sheets/";
	})
	

	// ---------- Save Sheet --------------
	
	$("#save").click(handleSave);


}); // ------------------ End DOM Ready  ------------------ 


function addSource(q, text) {
	// Initiate adding a Source to the page.
	// Completed by loadSource on return of AJAX call.
	// unless 'text' is present, then load with given text.

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
		"<span class='customTitle'></span>" + 
		"<span class='title'>" + 
			"<a href='/" + makeRef(q) + "' target='_blank'>"+humanRef(q.ref)+" <span class='ui-icon ui-icon-extlink'></a>" + 
		"</span>" +
		"<div class='text'>" + 
			(text ? "<span class='he'>" + text.he + "</span><span class='en'>" + text.en + "</span><div class='clear'></div>" : "") +
		"</div><ol class='subsources'></ol></li>")
	
	var $target = $(".source", $listTarget).last();

	if (text) {
		$target.find(".controls").show();
		return;
	}

	var loadClosure = function(data) {loadSource(data, $target)}
	var getStr = "/api/texts/" + makeRef(q) + "?commentary=0&context=0";
	$.getJSON(getStr, loadClosure);	
	afterAction();

}


function loadSource(data, $target) {
	if (data.error) {
		$("#error").html(data.error);
		$target.remove();
		return;
	}
	
	var $title = $(".title", $target).eq(0);
	var $text = $(".text", $target).eq(0);

	var end = Math.max(data.text.length, data.he.length);

	var requestedLength = (data.toSections[data.sectionNames.length-1] - data.sections[data.sectionNames.length-1]) + 1
	if (requestedLength > end) {
		data.toSections[data.sectionNames.length-1] = data.sections[data.sectionNames.length-1] + end -1;
		data.ref = makeRef(data);
	}

	$target.attr("data-ref", data.ref);	
	var title = "<a href='/" + normRef(data.ref) + "' target='_blank'>" +
					humanRef(data.ref) +
				" <span class='ui-icon ui-icon-extlink'></a>";
	$title.html(title);
	
	// If this is not a range, put text string in arrays
	if (typeof(data.text) === "string" || typeof(data.he) === "string") {
		data.text = data.text.length ? [data.text] : [];
		data.he = data.he.length ? [data.he] : [];
	}

	var enStr = "<span class='en'>";
	var heStr = "<span class='he'>";

	for (var i = 0; i < end; i++) {
		if (data.text.length > i) {
			enStr += data.text[i] + " "; 
		} else {
			enStr += "<i>Click to add English.</i> ";
		}
		if (data.he.length > i) {
			heStr += data.he[i] + " ";
		} else {
			heStr += "<i>Click to add Hebrew.</i> ";
		}
	}
	verseStr = heStr + "</span>" + enStr + "</span><div class='clear'></div>";
	$text.append(verseStr);
	$text.find(".en, .he").hallo(halloInit);
	$target.find(".customTitle").eq(0).hallo(halloInit);
	$(".controls", $target).show();

	if (sjs.can_edit) {
		//$("#sources, .subsources").sortable({handle: ".title", stop: autoSave, placeholder: 'ui-state-highlight'});
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
	sheet["status"] = 0;

	sheet.options.numbered = $("#sheet").hasClass("numbered") ? 1 : 0;
	sheet.options.language = $("#sheet").hasClass("hebrew") ? "hebrew" : $("#sheet").hasClass("bilingual") ? "bilingual" : "english";
	sheet.options.layout = $("#sheet").hasClass("stacked") ? "stacked" : "sideBySide";

	var $sharing = $(".sharingOption .ui-icon-check").not(".hidden").parent();
	var group = $(".groupOption .ui-icon-check").not(".hidden").parent().attr("data-group");
	
	if (sjs.current && sjs.current.status === 5) {
		// Topic sheet
		sheet["status"] = 5;
	} else if (group) {
		// Group Sheet
		sheet["group"] = group;
		var st = {"private": 6, "public": 7};
		sheet["status"] = st[$sharing[0].id];
	} else {
		// Individual Sheet
		var st = {"private": 0, "public": 3};
		sheet["status"] = st[$sharing[0].id];
	}

	return sheet;
}


function readSources($target) {
	// Create an array of objects representing sources found in $target
	// Used recursively to read sub-sources
	var sources = [];
	$target.children().each(function() {
		var source = readSource($(this));
		sources.push(source)
	})
	return sources
}


function readSource($target) {
	// Creates a object representing the source in $target
	var source = {};
	if ($target.hasClass("source")) {
		source["ref"] = $target.attr("data-ref");
		source["text"] = {en: $target.find(".text").find(".en").html(), 
						  he: $target.find(".text").find(".he").html()};
		var title = $(".customTitle", $target).eq(0).html();
		if (title) source["title"] = title;
		if ($(".subsources", $target).eq(0).children().length) {
			source["subsources"] = readSources($(".subsources", $target).eq(0));
		}
	} else if ($target.hasClass("comment")) {
		source["comment"] = $target.html();
	} else if ($target.hasClass("outside")) {
		source["outsideText"] = $target.html();
	} 
	return source;
}


function validateSheet(sheet) {
	// Srsly!	
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
	if (data.status === 3 || data.status === 7) {
		$("#public .ui-icon-check").removeClass("hidden");
	}
	if (data.status === 0 || data.status === 6) {
		$("#private .ui-icon-check").removeClass("hidden");
	}
	if (data.status === 6 || data.status === 7) {
		$(".groupOption[data-group='"+ data.group + "'] .ui-icon-check").removeClass("hidden");
		var groupUrl = data.group.replace(/ /g, "-");
		$("#partnerLogo").attr("src", "/static/partner/" + groupUrl + "/header.png".replace(/ /g, "-")).show();
	} else {
		$(".groupOption[data-group='None'] .ui-icon-check").removeClass("hidden");
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
	if (sjs.editing.index.categories[0] === "Talmud") {
		$("#addDialogTitle").html("Daf found. You may also specify numbered segments below.<span class='btn btn-primary' id='addSourceOK'>Add This Source</span>");
	} else if (sjs.editing.index.categories[0] === "Commentary") {
		$("#addDialogTitle").html("Commentary found. You may also specify numbered commentes below.<span class='btn btn-primary' id='addSourceOK'>Add This Source</span>");
	} else {
		$("#addDialogTitle").html("Source found. Specify a range with '-'.<span class='btn btn-primary' id='addSourceOK'>Add This Source</span>");
	}
	var ref = $("#add").val();
	if (!$("#textPreview").length) { $("body").append("<div id='textPreview'></div>") }
	
	textPreview(ref, $("#textPreview"), function() {
		if ($("#textPreview .previewNoText").length === 2) {
			$("#addDialogTitle").html("<i>No text available. Click below to add this text.</i>");
		}
		if ($("#textPreview .error").length > 0) {
			$("#addDialogTitle").html("Uh-Oh");
		}
		$("#textPreview")
			.position({my: "left top", at: "left bottom", of: $("#add"), collision: "none" }).width($("#add").width())
	});
}


// --------------- Add to Sheet ----------------

function copyToSheet(source) {
	if (!sjs._uid) { return sjs.loginPrompt(); }
	sjs.copySource = source;
	
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

	$("#addToSheetModal .sourceName").text(source.ref);

	$("#overlay").show();
	$("#addToSheetModal").show().position({ of: $(window) });
	
}

$("#addToSheetModal .cancel").click(function() {
	$("#overlay, #addToSheetModal").hide();
})

$("#addToSheetModal .ok").click(function(){
	// Protection against request getting sent multiple times (don't know why)
	if (sjs.flags.saving === true) { return false; }
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
			sources: [sjs.copySource]
		};
		var postJSON = JSON.stringify(sheet);
		sjs.flags.saving = true;
		$.post("/api/sheets/", {"json": postJSON}, addToSheetCallback);	
	} else {
		var title = selected.html();
		var url = "/api/sheets/" + selected.attr("data-id") + "/add";
		sjs.flags.saving = true;
		$.post(url, {source: JSON.stringify(sjs.copySource)}, addToSheetCallback);	
	}

	function addToSheetCallback(data) {
		sjs.flags.saving = false;
		$("#addToSheetModal").hide();
		if ("error" in data) {
			sjs.alert.message(data.error)
		} else {
			sjs.alert.message(data.ref + ' was added to "'+title+'".<br><br><a target="_blank" href="/sheets/'+data.id+'">View sheet.</a>')
		}
	}

});

// Call after sheet action to remove video and show save button
var afterAction = function() {
	$("#empty").remove();
	if (sjs._uid) {
		$("#save").show();
	}
};


var closeHallo = function(e) {
	console.log($(".inEditMode"));
	$(".inEditMode").trigger("hallodeactivated");
};
