sjs.flags = {
		"saving": false,
		"sorting": false,
		"ckfocus": false,
	 };

sjs.current = sjs.current || {
	options: {
		bsd: 0,
		boxed: 0,
		divineNames: "noSub",
		language: "bilingual",
		layout: "sideBySide",
		numbered: 0
	}
};

$(window).on("beforeunload", function() { 
	if (sjs._uid && !(sjs.current.id) && $("#empty").length === 0) {
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
		$("<div class='comment'></div>").appendTo("#sources").trigger("mouseup").focus();
		sjs.track.sheets("Add Comment");
		afterAction();
		e.stopPropagation();

	})

	$("#addOutside").click(function(e) {
		$("#sources").append("<li class='outsideWrapper'><div class='outside'></div></li>");
		$(".outside").last().trigger("mouseup").focus();
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
	
	$("#add").autocomplete({ source: function( request, response ) {
				var matches = $.map( sjs.books, function(tag) {
						if ( tag.toUpperCase().indexOf(request.term.toUpperCase()) === 0 ) {
							return tag;
						}
					});
				response(matches);
			},
			focus: function(event, ui) { return false; } });

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
		autoSave();
	});

	// Language Options
	$("#hebrew, #english, #bilingual").click(function(){
		$("#languageToggle .toggleOption").removeClass("active");
		$(this).addClass("active");
		$("#sheet").removeClass("english bilingual hebrew")
			.addClass($(this).attr("id"))
		autoSave();
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
		$(".groupOption .ui-icon-check").addClass("hidden");
		$(".ui-icon-check", $(this)).removeClass("hidden");
		var group = $(this).attr("data-group");
		if (group != "None") {
			sjs.track.sheets("Share with Group: " + group);
			var groupUrl = group.replace(/ /g, "_");
			$("#partnerLogo").attr("src", "/static/partner/" + groupUrl + "/header.png").show()
				.closest("a").attr("href", "/partners/" + groupUrl );
			$("#sheetHeader").show();
		} else {
			sjs.track.sheets("Unshare Sheet with Group");
			$("#sheetHeader").hide();
		}
		autoSave(); 
	});
	
	// Divine Names substitution Options
	$(".divineNamesOption").unbind("click").click(function() {
		$(".divineNamesOption .ui-icon-check").addClass("hidden");
		$("span", $(this)).removeClass("hidden");

		if (sjs.current.options.divineNames !== this.id) {
			sjs.current.options.divineNames = this.id;			
			substituteAllExistingDivineNames();
			autoSave();			
		}

	});


	// ------------ Empty Instructions ---------------------

	$("#empty .icon-remove").click(function() { $("#empty").remove(); });

	$("#readmore").toggle(function(e) { $("#howItWorks").show(); e.preventDefault(); }, function(e) {
		$("#howItWorks").hide(); e.preventDefault();
	});




	// --------- CKEditor ------------

	if (sjs.can_edit) {
		CKEDITOR.disableAutoInline = true;
		CKEDITOR.config.startupFocus = true;
		CKEDITOR.config.extraAllowedContent = 'small';
		CKEDITOR.config.font_names =
			'Arial/Arial, Helvetica, sans-serif;' +
			'Comic Sans/Comic Sans MS, cursive;' +
			'Courier New/Courier New, Courier, monospace;' +
			'Georgia/Georgia, serif;' +
			'Lucida Sans/Lucida Sans Unicode, Lucida Grande, sans-serif;' +
			'Rashi Script/Rashi Script, serif;' +
			'Tahoma/Tahoma, Geneva, sans-serif;' +
			'Times New Roman/Times New Roman, Times, serif;' +
			'Verdana/Verdana, Geneva, sans-serif;';
		CKEDITOR.config.toolbar = [
			{name: 'removestyle', items: ['RemoveFormat']},
			{name: 'basicstyles', items: [ 'Bold', 'Italic', 'Underline', 'Strike', 'Subscript', 'Superscript' ] },
			{name: "justify", items: [ 'JustifyLeft', 'JustifyCenter', 'JustifyRight', 'JustifyBlock' ] },
			{ name: 'paragraph', items: [ 'NumberedList', 'BulletedList' ] }, 
			'/',
			{ name: 'styles', items: [ 'Font', 'FontSize' ] },
			{ name: 'colors', items: [ 'TextColor', 'BGColor' ] },
			{ name: 'links', items: [ 'Link', 'Unlink' ] },
			{ name: 'insert', items: [ 'Image', 'Table', 'HorizontalRule' ] }
		];

		sjs.removeCKEditor = function(e) {
			var editor = e.editor;
			var $el = $(editor.element.$);

			var modified = editor.checkDirty();
			// always check custom title, so we don't get stuck with init value of "Source Title"
			if ($el.hasClass("customTitle")) { modified = true; } 
			if (modified) {
				var text = $el.text();
				
				// Special cases for fields left empty
				if (!text.length) {
					if ($el.prop("id") === "title") {
						$el.text("Untitled Source Sheet");
					
					} else if ($el.hasClass("comment")) {
						$el.remove();
					
					} else if ($el.hasClass("outside")) {
						$el.parent().remove();
					}
				}
				if ($el.hasClass("customTitle") && (text === "" || text === "Source Title")) {
					$el.empty().hide().next().removeClass("hasCustom");
				}

				if ($el.hasClass("he") || $el.hasClass("outside")) {
					if (sjs.current.options.divineNames !== "noSub") {
						substituteDivineNamesInNode($el[0]);
					}					
				}

				autoSave(); 
			}

			editor.destroy();
			$("[contenteditable]").attr("contenteditable", "false");
		}

		sjs.removeCKEditorByElement = function(el) {
			var editor = $(el).ckeditorGet();
			sjs.removeCKEditor({editor: editor});
		}

		sjs.initCKEditor = function(e) {
			// Don't init again, or while sorting
			if ($(this).hasClass("cke_editable")) { return; }
			if (sjs.flags.sorting) { return; }


			// Remove any existing editors first
			$(".cke_editable").each(function() {
				var ed = $(this).ckeditorGet();
				sjs.removeCKEditor({editor: ed});
			})

			$(this).focus()
				.attr("contenteditable", "true")
				.ckeditor();
			
			// Close editor on enter for customTitle fields
			if ($(this).hasClass("customTitle")) {
				editor.on('key', function(e) {
					if (e.data.keyCode == 13) {
						sjs.removeCKEditor(e);
						e.cancel();						
					}

				});
			}
		};

		
		// Bind init of CKEditor to mouseup, so dragging can start first
		$("#title, .comment, .outside, .customTitle, .en, .he")
			.live("mouseup", sjs.initCKEditor)


		// So clicks on editor or editable area don't destroy editor
		$("#title, .comment, .outside, .customTitle, .en, .he, .cke, .cke_dialog, .cke_dialog_background_cover")
			.live("click", function(e) { 
				e.stopPropagation();
			 });

		// Destroy editor on outside clicks 
		// Without this, CKEeditor was not consistently closing itself
		$("html").live("click", function(e) {
			$('.cke_editable').each(function() {
				sjs.removeCKEditorByElement(this);
			});
		});

	}



	// ------------- Build the Sheet! -------------------

	if (sjs.current.id) {
		buildSheet(sjs.current)
	} else {
		$("#title").html("New Source Sheet");
		$("#empty").show();
	}


	// ----------- Sorting ---------------
		

	if (sjs.can_edit) {

		sjs.sortStart = function(e, ui) {
			sjs.flags.sorting = true;
		};

		sjs.sortStop = function(e, ui) {
			sjs.flags.sorting = false
			autoSave();
		}

		$("#sources, .subsources").sortable({ start: sjs.sortStart,
											  stop: sjs.sortStop,
											  cancel: ':input, button, .cke_editable',
											  placeholder: 'sortPlaceholder',
											  revert: 100,
											  delay: 100,
											  opacity: 0.9});
	}


	// ------------- Source Controls -------------------

	// Custom Source Titles
	$(".editTitle").live("click", function(e) {
		var $customTitle = $(".customTitle", $(this).closest(".source")).eq(0);
		if ($customTitle.text() === "") {
			$customTitle.text("Source Title");
		}
		$customTitle.css('display', 'inline-block')
			.focus()
			.trigger("mouseup")
			.next()
			.addClass("hasCustom");

		e.stopPropagation();
		sjs.track.sheets("Edit Source Title");
	});
	

	// Reset Source Text 
	$(".resetSource").live("click", function() { 
		options = {
			message: "Reset text of Hebrew, English or both?<br><small>Any edits you have made to this source will be lost.</small>",
			options: ["Hebrew", "English", "Both"]
		};
		var that = this;
		var resetSource = function(option) {
			$target = $(that).closest(".source");
			var loadClosure = function(data) { 
				loadSource(data, $target, option) 
			};
			var getStr = "/api/texts/" + normRef($target.attr("data-ref")) + "?commentary=0&context=0";
			$.getJSON(getStr, loadClosure);	
		}

		sjs.alert.options(options, resetSource)
		sjs.track.sheets("Reset Source");

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
			.find(".comment").last().attr("contenteditable", true).focus();
		sjs.track.sheets("Add Sub Comment");
	});
	
	// Copy a Source
	$(".copySource").live("click", function() {
		var source = readSource($(this).parents(".source"));
		copyToSheet(source);
	});


	// ---------- Save Sheet --------------
	$("#save").click(handleSave);


	// ---------- Copy Sheet ----------------
	$("#copySheet").click(copySheet);


	// ---------- Embed Sheet ----------------
	$("#embedSheet").click(showEmebed);


	// ---------- Delete Sheet ----------------
	$("#deleteSheet").click(deleteSheet);


	// Clicks on overlay should hide modals
	$("#overlay").click(function() {
		$(this).hide();
		$(".modal").hide();
		sjs.alert.clear();
	});

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
				"<div class='resetSource optionItem'>Reset Source Text</div>" +
				'<div class="removeSource optionItem">Remove Source</div>'+
				'<div class="copySource optionItem">Copy Source</div>'+				
			"</div>" +
		"</div>" : 
		'<div class="controls btn"><span class="ui-icon ui-icon-triangle-1-s"></span>' +
			'<div class="optionsMenu">' +
				'<div class="copySource optionItem">Copy Source</div>'+				
			"</div>" +
		"</div>") + 
		"<div class='customTitle'></div>" + 
		"<span class='title'>" + 
			"<a href='/" + makeRef(q) + "' target='_blank'>"+humanRef(q.ref)+" <span class='ui-icon ui-icon-extlink'></a>" + 
		"</span>" +
		"<div class='text'>" + 
			"<div class='he'>" + (text ? text.he : "") + "</div>" + 
			"<div class='en'>" + (text ? text.en : "") + "</div>" + 
			"<div class='clear'></div>" +
		"</div><ol class='subsources'></ol></li>")
	
	var $target = $(".source", $listTarget).last();
	if (text) {
		$target.find(".controls").show();
		return;
	}

	var loadClosure = function(data) { 
		loadSource(data, $target) 
	};
	var getStr = "/api/texts/" + makeRef(q) + "?commentary=0&context=0";
	$.getJSON(getStr, loadClosure);	

	afterAction();
}


function loadSource(data, $target, optionStr) {
	if (data.error) {
		$("#error").html(data.error);
		$target.remove();
		return;
	}
	console.log(data);
	// If text is not a range, put text string in arrays
	// to simplify processing below
	if (typeof(data.text) === "string") {
		data.text = data.text.length ? [data.text] : [];
	}
	if (typeof(data.he) === "string") {
		data.he = data.he.length ? [data.he] : [];
	}

	var $title = $(".title", $target).eq(0);
	var $text = $(".text", $target).eq(0);

	var end = Math.max(data.text.length, data.he.length);
	
	// If the requested end is beyond what's available, reset the ref to what we have
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


	var enStr = "";
	var heStr = "";
	if (data.sections.length < data.sectionNames.length) {
		var start = 1;
	} else {
		var start = data.sections[data.sectionNames.length-1];
	}


	for (var i = 0; i < end; i++) {
		enStr += "<span class='segment'><small>(" + (i+start) + ")</small> " + 
						(data.text.length > i ? data.text[i] : "...") + 
					"</span> "; 

		heStr += "<span class='segment'><small>(" + (encodeHebrewNumeral(i+start)) + ")</small> " +
						(data.he.length > i ? data.he[i] : "...") + 
					"</span> ";
	}

	// Populate the text, honoring options to only load Hebrew or English if present
	optionStr = optionStr || null;
	if (optionStr !== "Hebrew") {
		$text.find(".en").html(enStr);
	}
	if (optionStr !== "English") {
		heStr = substituteDivineNames(heStr);
		$text.find(".he").html(heStr);		
	}

	if (!(data.categories[0] in {"Tanach":1, "Talmud":1})) {
		$text.addClass("segmented");
	}

	$(".controls", $target).show();

	var top = $target.offset().top - 200;
	$("html, body").animate({scrollTop: top}, 300);
	autoSave();
}


function readSheet() {
	// Create a JS Object representing the sheet as it stands in the DOM
	// One day I will get my truth out of the DOM. 
	var sheet = {};
	if (sjs.current.id) {
		sheet["id"] = sjs.current.id;
	}

	sheet["title"]   = $("#title").html();
	sheet["sources"] = readSources($("#sources"));
	sheet["options"] = {};
	sheet["status"]  = 0;

	sheet.options.numbered = $("#sheet").hasClass("numbered") ? 1 : 0;
	sheet.options.boxed = $("#sheet").hasClass("boxed") ? 1 : 0;
	sheet.options.bsd = $("#sheet").hasClass("bsd") ? 1 : 0;
	sheet.options.language = $("#sheet").hasClass("hebrew") ? "hebrew" : $("#sheet").hasClass("bilingual") ? "bilingual" : "english";
	sheet.options.layout = $("#sheet").hasClass("stacked") ? "stacked" : "sideBySide";
	sheet.options.divineNames = $(".divineNamesOption .ui-icon-check").not(".hidden").parent().attr("id");

	var $sharing = $(".sharingOption .ui-icon-check").not(".hidden").parent();
	if (!$sharing.length) {
		$sharing = [{id: "private"}];
	}
	var group = $(".groupOption .ui-icon-check").not(".hidden").parent().attr("data-group");
	if (group === undefined && sjs.current && sjs.current.group) {
		// When working on someone else's group sheet
		group = sjs.current.group;
	}

	if ("status" in sjs.current && sjs.current.status === 5) {
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
		sources.push(source);
	})
	return sources;
}


function readSource($target) {
	// Creates a object representing the source in $target
	var source = {};
	if ($target.hasClass("source")) {
		source["ref"] = $target.attr("data-ref");
		source["text"] = {en: $target.find(".text").find(".en").html(), 
						  he: $target.find(".text").find(".he").html()};
		var title = $(".customTitle", $target).eq(0).html();
		if (title) { 
			source["title"] = title; 
		}
		if ($(".subsources", $target).eq(0).children().length) {
			source["subsources"] = readSources($(".subsources", $target).eq(0));
		}
	} else if ($target.hasClass("comment")) {
		source["comment"] = $target.html();
	} else if ($target.hasClass("outsideWrapper")) {
		source["outsideText"] = $target.find(".outside").html();
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
	if (sjs.can_edit && sjs.current.id && sjs.autoSave) {
		var sheet = readSheet();
		saveSheet(sheet);
	}
}


function saveSheet(sheet, reload) {
 	if (sheet.sources.length == 0) {
 		return;
 	}
 	var postJSON = JSON.stringify(sheet);
	$.post("/api/sheets/", {"json": postJSON}, function(data) {
		if (data.id) {
			sjs.current = data;
			if (reload) {
				window.location = "/sheets/" + data.id;
			}
		} else if ("error" in data) {
			$("#error").text(data.error);
			$("#save").text("Save");
			setTimeout("$('#error').empty()", 5000);
		}
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
	if (data.options && data.options.bsd) { 
		$("#bsd").trigger("click");
	} 
	if (data.options && data.options.boxed) { 
		$("#boxed").trigger("click");
	} 
	if (data.options && data.options.language) {
		$("#" + data.options.language).trigger("click");
	}
	if (data.options && data.options.layout) {
		$("#" + data.options.layout + ".layoutOption").trigger("click");
	}
	if (data.options && data.options.divineNames) {
		$("#" + data.options.divineNames).trigger("click");
	}
	if (data.status === 3 || data.status === 7) {
		$("#public .ui-icon-check").removeClass("hidden");
	}
	if (data.status === 0 || data.status === 6) {
		$("#private .ui-icon-check").removeClass("hidden");
	}
	if (data.status === 6 || data.status === 7) {
		$(".groupOption[data-group='"+ data.group + "'] .ui-icon-check").removeClass("hidden");
		var groupUrl = data.group.replace(/ /g, "_");
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
				$(".customTitle").last().html(sources[i].title).css('display', 'inline-block');;
				$(".title").last().addClass("hasCustom");
			}
			
			if (sources[i].subsources) {
				buildSources($(".subsources", $(".source").last()), sources[i].subsources);
			}
			
		} else if (sources[i].comment) {
			var commentHtml = "<div class='comment'>" + sources[i].comment + "</div>";
			$target.append(commentHtml);

		} else if (sources[i].outsideText) {
			var outsideHtml = "<li class='outsideWrapper'><div class='outside'>" + sources[i].outsideText + "</div></li>";
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


function copySheet() {
	var sheet = readSheet();
	sheet.status = 0;
	sheet.title = sheet.title + " (Copy)";
	delete sheet.group;
	delete sheet.id;

	if (sjs._uid != sjs.current.owner) {
		sheet.via = sjs.current.id;
		sheet.viaOwner = sjs.current.owner;
	}

 	var postJSON = JSON.stringify(sheet);
	$.post("/api/sheets/", {"json": postJSON}, function(data) {
		if (data.id) {
			sjs.alert.message('Source Sheet copied.<br><br><a href="/sheets/'+data.id+'">View copy &raquo;</a>');

		} else if ("error" in data) {
			sjs.alert.message(data.error);
		}
	})

}

function showEmebed() { 
	$("#embedSheetModal").show().position({of: window})
			.find("textarea").focus()
		.end()
			.find(".ok").unbind().click(function() {
				$("#embedSheetModal, #overlay").hide();
			});
	$("#overlay").show();
}

function deleteSheet() {
	if (confirm("Are you sure you want to delete this sheet? There is no way to undo this action.")) {
		$.post("/api/sheets/" + sjs.current.id + "/delete", function (data){
			if ("error" in data) {
				sjs.alert.message(data.error);
			} else {
				sjs.alert.messageOnly("Source Sheet deleted.<br><br><a href='/sheets'><div class='ok btn'>OK</div></a>");
			}
		})
	}
}


sjs.divineRE = /(^|[\s.,;:'"\-])(י[\u0591-\u05C7]*ה[\u0591-\u05C7]*ו[\u0591-\u05C7]*ה[\u0591-\u05C7]*|יי|יקוק)(?=[\s.,;:'"\-]|$)/g;
sjs.divineSubs = {
					"noSub": "יהוה", 
					"yy": "יי",
					"ykvk": "יקוק"
				};

function substituteDivineNames(text) {
	if (sjs.current.options.divineNames === "noSub") { 
		return text; 
	}
	var sub = sjs.divineSubs[sjs.current.options.divineNames];
	text = text.replace(sjs.divineRE, "$1" + sub);
	return text;
}

function substituteDivineNamesInNode(node) {
	findAndReplaceDOMText(node, {
		find: sjs.divineRE,
		replace: "$1" + sjs.divineSubs[sjs.current.options.divineNames]
	});
}

function substituteAllExistingDivineNames() {
	$(".he, .outside").each(function(index, node) {
		substituteDivineNamesInNode(node)
	});
}


// Call after sheet action to remove video and show save button
var afterAction = function() {
	$("#empty").remove();
	if (sjs._uid) {
		$("#save").show();
	}
};
