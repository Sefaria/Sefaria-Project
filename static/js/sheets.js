sjs.flags = {
		saving:  false,
		sorting: false,
		ckfocus: false,
	 };

sjs.can_save = (sjs.can_edit || sjs.can_add);

sjs.current = sjs.current || {
	options: {
		bsd: 0,
		boxed: 0,
		assignable:0,
		divineNames: "noSub",
		language: "bilingual",
		layout: "sideBySide",
		langLayout: "enLeft",
		numbered: 0,
		collaboration: "none"
	}
};

// whether or not the sheet is currently being loaded automatically
// at pageload or when reset content that has been edit server side
sjs.loading = false;

// number of open AJAX calls
sjs.openRequests = 0;

// Counter for giving ids to node
sjs.current.nextNode = sjs.current.nextNode || 1;

// Track last edits, in case they need to be reapplied after
// another user updates the currently loaded sheet.
sjs.lastEdit = null;

// Make sure that we're using the s2 Sefaria utils, and not the s1/utils
parseRef = Sefaria.parseRef.bind(Sefaria);
makeRef = Sefaria.makeRef.bind(Sefaria);
normRef = Sefaria.normRef.bind(Sefaria);
humanRef = Sefaria.humanRef.bind(Sefaria);
isHebrew = Sefaria.hebrew.isHebrew;


$(window).on("beforeunload", function() {
	if (!($("#save").data("mode") == "saving")) {
		if (Sefaria._uid && !(sjs.current.id) && $("#empty").length === 0) {
			return _("Your Source Sheet has unsaved changes. Before leaving the page, click Save to keep your work.");
		}
		else if ($("#lastSaved").text() == "Saving...") {
			return _("Your Source Sheet has unsaved changes. Please wait for the autosave to finish.");
		}
	}
});

//hide dixed bottom message when scrolled to the bottom of the page so footer is visible
$(window).scroll(function() {
  var fixedBottom = $("#fileControls");
  if ($('body').height() <= ($(window).height() + $(window).scrollTop())) {
    fixedBottom.css("display", "none");
  } else {
    fixedBottom.css("display", "block");
  }
})

var oldOnError = window.onerror || function(){};
function errorWarning(errorMsg, url, lineNumber) {
	if (sjs.can_edit || sjs.can_add) {
		sjs.alert.message(_("Unfortunately an error has occurred. If you've recently edited text on this page, you may want to copy your recent work out of this page and click reload to ensure" +
		" your work is properly saved."))
	}
}

window.onerror = function (errorMsg, url, lineNumber) {
 	oldOnError(errorMsg, url, lineNumber);
	errorWarning(errorMsg, url, lineNumber);
	return false;
};

$(function() {

	function makeMediaEmbedLink(mediaURL) {
    	let embedHTML;
	  	let youtubeRe = /https?:\/\/(www\.)?(youtu(?:\.be|be\.com)\/(?:.*v(?:\/|=)|(?:.*\/)?)([\w'-]+))/i;
    	let vimeoRe = /^.*(vimeo\.com\/)((channels\/[A-z]+\/)|(groups\/[A-z]+\/videos\/))?([0-9]+)/;
  		let m;

		if ((m = youtubeRe.exec(mediaURL)) !== null) {
			if (m.index === youtubeRe.lastIndex) {
				youtubeRe.lastIndex++;
			}
				if (m.length>0) {
					embedHTML = '<iframe width="560" height="315" src="https://www.youtube.com/embed/'+m[m.length-1]+'?rel=0&amp;showinfo=0" frameborder="0" allowfullscreen></iframe>';
				}
		}

		else if ((m = vimeoRe.exec(mediaURL)) !== null) {
			if (m.index === vimeoRe.lastIndex) {
				vimeoRe.lastIndex++;
			}
				if (m.length>0) {
					embedHTML = '<iframe width="560" height="315" src="https://player.vimeo.com/video/'+m[5]+'?title=0&amp;byline=0&amp;portrait=0" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>';
				}
		}


		else if ( (mediaURL).match(/https?:\/\/(www\.)?.+\.(jpeg|jpg|gif|png)$/i) != null ) {
					embedHTML = '<img class="addedMedia" src="'+mediaURL+'" />';
		}


		else if ( (mediaURL).match(/https?:\/\/(www\.)?.+\.(mp3)$/i) != null ) {
					embedHTML = '<audio src="'+mediaURL+'" type="audio/mpeg" controls>Your browser does not support the audio element.</audio>';
		}

		else if ( (mediaURL).match(/https?:\/\/.*clyp\.it\/.+/i) != null ) {
					embedHTML = '<audio src="'+mediaURL+'.mp3" type="audio/mpeg" controls>Your browser does not support the audio element.</audio>';
		}

		else if ( (mediaURL).match(/^https?:\/\/(www\.|m\.)?soundcloud\.com\/[\w\-\.]+\/[\w\-\.]+\/?/i) != null ) {
					embedHTML = '<iframe width="100%" height="166" scrolling="no" frameborder="no" src="https://w.soundcloud.com/player/?url='+ mediaURL + '&amp;color=ff5500&amp;auto_play=false&amp;hide_related=true&amp;show_comments=false&amp;show_user=true&amp;show_reposts=false"></iframe>';
		}

		else embedHTML = false;

		return embedHTML
	}

	function mediaCheck(target){
		var $target = target;
		$target.find('audio, img').last()
	    .on('error', function() {
	    	$target.parent().remove();
			sjs.alert.flash("There was an error adding your media.")
	     })
	}

	$("#inlineAddBrowse").click(function() {
		$("#closeAddSource").trigger("click");
		sjs.textBrowser.show({
			callback: function(ref) {
				if (!ref) { return; }
				var $target = $("#addInterface").prev(".sheetItem");
				var q = parseRef(ref);
				$("#closeAddSource").trigger("click");
				addSource(q, undefined, "insert", $target);
				Sefaria.track.sheets("Add Source", ref);
        cleanupActiveSource($target);

			}
		})
	});

	$("#inlineAddBrowse").keydown(function(e) {
		if (e.which == 13) {
			$("#inlineAddBrowse").click();
		}
    });

	$(document).on("click", "#inlineAddSourceOK", function() {
		var $target = $("#addInterface").prev(".sheetItem");
        var ref = $("#inlineAdd").val();
		Sefaria.getName(ref, true).then(function(q) {
            addSource(q, undefined, "insert", $target);
            $('#inlineAdd').val('');
            $("#inlineTextPreview").html("");
            $("#inlineTextPreview").hide();
            $("#inlineAddDialogTitle").text("Select a text");
            $("#inlineAddSourceOK").addClass("disabled");
            $(".ui-autocomplete").hide();
            $("#sheet").click();
        });
		Sefaria.track.sheets("Add Source", ref);
	});

	$(document).on("keydown", "#inlineAddSourceOK", function(e) {
		if (e.which == 13) {
			$("#inlineAddSourceOK").click();
		}
    });

	function toggleSheetsMenu(menu) {
		if ($(menu).parent().hasClass("open")) {
			$(menu).parent().removeClass("open");
		}
		else {
			$(".optionGroup.open").removeClass("open");
			if (!$(menu).hasClass("optionTitle")) {
				$(".sheetsMenuBarItem.open").removeClass("open");
			}
			$(menu).parent().toggleClass("open");
		}
	}

	$(".menuHeader").keydown(function(e) {
		if (e.which == 13) {
			toggleSheetsMenu($(this));
		}
		else if (e.which == 39) {
			if ($(this).hasClass("optionTitle")) { // in case of submenu open it if it's closed otherwise focus on the first element
				if (!$(this).parent().hasClass("open")) {
					toggleSheetsMenu($(this));
				}
				$(this).next(".subMenu").find(':focusable').first().focus();
      }
			else {
				$target = $(this).closest(".sheetsMenuBarItem").next(".sheetsMenuBarItem").find(':focusable').first();
				$target.focus();
				toggleSheetsMenu($target);
			}
		}
		else if (e.which == 37) {
				$target = $(this).closest(".sheetsMenuBarItem").prev(".sheetsMenuBarItem").find(':focusable').first();
				$target.focus();
				toggleSheetsMenu($target);
		}
		else if (e.which == 38) {
				e.preventDefault();
				if (!$(this).parent().hasClass("open")) {
					toggleSheetsMenu($(this));
				}
				$(this).parent().prev(":focusable").first().focus();
		}
		else if (e.which == 40) {
				e.preventDefault();
				if ($(this).parent().hasClass("sheetsMenuBarItem")) {
					if (!$(this).parent().hasClass("open")) {
						toggleSheetsMenu($(this));
					}
					$(this).parent().find(".optionsMenu").find(".optionItem, .optionGroup").find(":focusable").addBack(":focusable").first().focus();
				}
				else {
          $(this).closest(".optionItem,.optionGroup").nextAll(".optionItem,.optionGroup,#sheetLayoutLanguageMenuItems,#sourceLayoutLanguageMenuItems").find(":focusable").addBack(":focusable").first().focus();
        }
		}
    });

	$(".optionItem").keydown(function(e) {
		if (e.which == 40) {
				e.preventDefault();
				$(this).closest(".optionItem,.optionGroup").nextAll(".optionItem,.optionGroup,#sheetLayoutLanguageMenuItems,#sourceLayoutLanguageMenuItems").find(":focusable").addBack(":focusable").first().focus();
		}
		else if (e.which == 38) {
				e.preventDefault();
				$(this).closest(".optionItem,.optionGroup").prevAll(".optionItem,.optionGroup,#sheetLayoutLanguageMenuItems,#sourceLayoutLanguageMenuItems").find(":focusable").addBack(":focusable").last().focus();
		}
		else if (e.which == 39) {
				$target = $(this).closest(".sheetsMenuBarItem").next(".sheetsMenuBarItem").find(':focusable').first();
				$target.focus();
				toggleSheetsMenu($target);
		}
		else if (e.which == 37) {
      if ($(this).parent().hasClass("subMenu")) { // in case of submenu open it if it's closed otherwise focus on the first element
        $(this).parent().prev(".menuHeader").focus();
        $(this).closest(".optionGroup.open").removeClass("open");
      }
      else {
        $target = $(this).closest(".sheetsMenuBarItem").prev(".sheetsMenuBarItem").find(':focusable').first();
        $target.focus();
        toggleSheetsMenu($target);
      }
    }
		else if (e.which == 13) {
    		$(this).click();
				$(".optionGroup.open").removeClass("open");
				$(".sheetsMenuBarItem.open").removeClass("open");
    }
	});

	$(".sheetsMenuBarCommands").keydown(function(e) {
		if (e.keyCode === 27) { //27 is escape
        e.stopPropagation();
				$(".optionGroup.open").removeClass("open");
				$(".sheetsMenuBarItem.open").removeClass("open");
    	}
	});

    // This object is instantiated and sets up its own events.
    // It doesn't need to be interacted with from the outside.
    var validator = new Sefaria.util.RefValidator($("#inlineAdd"),
    	$("#inlineAddDialogTitle"),
    	$("#inlineAddSourceOK"),
    	$("#inlineTextPreview"),
    	{interfaceLang: sjs.interfaceLang});

	// Printing
	$("#print").click(function(){
		Sefaria.track.sheets("Print Sheet");
		window.print()
	});

	// General Options
	$("#options .optionItem,#formatMenu .optionItem, #assignmentsModal .optionItem").click(function() {
		if($(this).parent().hasClass('languageToggleOption')||
			$(this).parent().hasClass('layoutToggleOption') ||
			$(this).parent().hasClass('sideBySideToggleOption')){
			return;
		}
		var $check = $(".fa-check", $(this));
		if ($check.hasClass("hidden")) {
			$("#sheet").addClass($(this).attr("id"));
			$check.removeClass("hidden");
		} else {
			$("#sheet").removeClass($(this).attr("id"));
			$check.addClass("hidden");
		}
		if (sjs.can_edit) {
			autoSave(); // Don't bother sending options changes from adders
		}
	});

	$("#makeSheetAssignableButton").click(function(){
		$("#assignedSheetsShareURL").show();
		$(this).hide();
		$("#StopCollectingAssignmentsButton").show();
		$("#sheet").addClass('assignable');
		$("#assignmentDirections").html(_('Students can complete their assignment at this link:'));
		$("#assignmentURLLink").show();
		$("#assignedSheets").show();
		autoSave();
	});

	$("#StopCollectingAssignmentsButton").click(function(){
		$("#assignedSheetsShareURL").hide();
		$(this).hide();
		$("#makeSheetAssignableButton").show();
		$("#sheet").removeClass('assignable');
		$("#assignmentDirections").html(_('Assignments allow you to create a template that your students can fill out on their own.'));
		$("#assignmentURLLink").hide();
		if ( $("#assignedSheets a").length > 0) {
			$("#assignedSheets").show();
		}
		else {
			$("#assignedSheets").hide();
		}
		autoSave();
	});

	$(".languageToggleOption div").click(function(){
		if ($(".activeSource").length) {
			var $target = $(".activeSource");
			var $toggleTarget = $("#sourceLayoutLanguageMenuItems");
		}
		else {
			var $target = $("#sheet");
			var $toggleTarget = $("#sheetLayoutLanguageMenuItems");
		}

		$toggleTarget.find(".languageToggleOption div .fa-check").addClass("hidden");
		$target.removeClass("english bilingual hebrew");
		$(".fa-check", $(this)).removeClass("hidden");
		if ( $(this).hasClass("english") ) {
			$target.addClass("english");
			$target.addClass("stacked");
			$target.removeClass("sideBySide heLeft heRight");

			$toggleTarget.find("#layoutToggleGroup div .fa-check").addClass("hidden");
			$toggleTarget.find("#layoutToggleGroup .stacked .fa-check").removeClass("hidden");
			$toggleTarget.find("#layoutToggleGroup").addClass("disabled");

			$toggleTarget.find("#sideBySideToggleGroup div .fa-check").addClass("hidden");
			$toggleTarget.find("#sideBySideToggleGroup").addClass("disabled");

		}
		else if ( $(this).hasClass("hebrew") ) {
			$target.addClass("hebrew");
			$target.addClass("stacked");
			$target.removeClass("sideBySide heLeft heRight");

			$toggleTarget.find("#layoutToggleGroup div .fa-check").addClass("hidden");
			$toggleTarget.find("#layoutToggleGroup .stacked .fa-check").removeClass("hidden")
			$toggleTarget.find("#layoutToggleGroup").addClass("disabled");

			$toggleTarget.find("#sideBySideToggleGroup div .fa-check").addClass("hidden");
			$toggleTarget.find("#sideBySideToggleGroup").addClass("disabled");

		}
		else if ( $(this).hasClass("bilingual") ) {
			$target.addClass("bilingual");
			$toggleTarget.find("#layoutToggleGroup").removeClass("disabled");

			if ( $target.hasClass("sideBySide") ) {
				$toggleTarget.find("#sideBySideToggleGroup").removeClass("disabled");
				}
		}

		if (sjs.can_edit) {
			autoSave();
		}
	});

	$(".layoutToggleOption div").click(function(){
		if ($(".activeSource").length) {
			var $target = $(".activeSource");
			var $toggleTarget = $("#sourceLayoutLanguageMenuItems");
		}
		else {
			var $target = $("#sheet");
			var $toggleTarget = $("#sheetLayoutLanguageMenuItems");
		}


		$toggleTarget.find(".layoutToggleOption div .fa-check").addClass("hidden");
		$target.removeClass("stacked sideBySide");
		$(".fa-check", $(this)).removeClass("hidden");
		if ( $(this).hasClass("stacked") ) {
			$target.addClass("stacked");
			$target.removeClass("heLeft heRight");

			$toggleTarget.find("#sideBySideToggleGroup div .fa-check").addClass("hidden");
			$toggleTarget.find("#sideBySideToggleGroup .heRight .fa-check").removeClass("hidden")
			$toggleTarget.find("#sideBySideToggleGroup").addClass("disabled");


		}
		else if ( $(this).hasClass("sideBySide") ) {
			$target.addClass("sideBySide");
			if ($target.hasClass("bilingual")) {
				$toggleTarget.find("#sideBySideToggleGroup").removeClass("disabled");
				}
		}

		if (sjs.can_edit) {
			autoSave();
		}
	});

	$(".sideBySideToggleOption div").click(function(){
		if ($(".activeSource").length) {
			var $target = $(".activeSource");
			var $toggleTarget = $("#sourceLayoutLanguageMenuItems");
		}
		else {
			var $target = $("#sheet");
			var $toggleTarget = $("#sheetLayoutLanguageMenuItems");
		}

		$toggleTarget.find(".sideBySideToggleOption div .fa-check").addClass("hidden");
		$target.removeClass("heLeft heRight");
		$(".fa-check", $(this)).removeClass("hidden");
		if ( $(this).hasClass("heLeft") ) {
			$target.addClass("heLeft sideBySide");
		}
		else if ( $(this).hasClass("heRight") ) {
			$target.addClass("heRight sideBySide");
		}

		if (sjs.can_edit) {
			autoSave();
		}
	});

		$("#resetSourceTogglesToSheetGroup").click(function() {
			$(".activeSource").removeClass("bilingual english hebrew sideBySide heLeft heRight stacked");
			$("#sourceLayoutLanguageMenuItems").find(".fa-check").addClass("hidden");
			setLanguageLayoutCheckBoxes($(".activeSource"));
			if (sjs.can_edit) {
				autoSave();
			}
		});

	// Sheet Language Options
	$("#hebrew, #english, #bilingual").click(function(){
		var mode = this.id;
		var shortMode = this.id.substring(0,2);
		$.cookie("contentLang", mode);

		$("#languageToggle .toggleOption").removeClass("active");
		$(this).addClass("active");

		$("body, #content, #sheet").removeClass("english hebrew bilingual")
			.addClass(mode)
            .trigger("languageChange");

		if ($(this).attr("id") != "bilingual") {
			$("#biLayoutToggle, #sheetLayoutToggle").hide();
		} else {
			$("#sheetLayoutToggle").show();
			if ($("#sheet").hasClass("sideBySide")) {
				$("#biLayoutToggle").show();
			}
		}
		if (sjs.can_edit) {
			autoSave(); // Don't bother sending options changes from adders
		}
	});

	// Sheet Layout Options
	$("#sideBySide, #stacked").click(function(){
		$("#sheetLayoutToggle .toggleOption").removeClass("active");
		$(this).addClass("active");
		$("#sheet").removeClass("sideBySide stacked")
			.addClass($(this).attr("id"));
		if ($(this).attr("id") == "stacked") {
			$("#biLayoutToggle").hide();
		} else {
			$("#biLayoutToggle").show();
		}
		if (sjs.can_edit) {
			autoSave(); // Don't bother sending options changes from adders
		}
	});

	// Stacked Layout Options
	$("#heLeft, #heRight").click(function(){
		$("#biLayoutToggle .toggleOption").removeClass("active");
		$(this).addClass("active");
		$("#sheet").removeClass("heLeft heRight")
			.addClass($(this).attr("id"))
		if (sjs.can_edit) {
			autoSave(); // Don't bother sending options changes from adders
		}
	});

	// Divine Names substitution Options
	$(".divineNamesOption").unbind("click").click(function() {
		$(".divineNamesOption .fa-check").addClass("hidden");
		$(".fa-check", $(this)).removeClass("hidden");

		if (sjs.current.options.divineNames !== this.id) {
			sjs.current.options.divineNames = this.id;
			substituteAllExistingDivineNames();
			autoSave();
		}

	});

	// Reset Text
	$("#resetText").click(function() {
			options = {
			message: "Reset text of Hebrew, English or both?<br><small>Any edits you have made to this source will be lost.</small>",
			options: ["Hebrew", "English", "Both"]
		};
		var $target = $(".activeSource");
		var resetSource = function(option) {
			var loadClosure = function(data) {
				loadSource(data, $target, option);
        		Sefaria.track.sheets("Reset Source", data.ref);
			};
			var getStr = "/api/texts/" + normRef($target.attr("data-ref")) + "?commentary=0&context=0&pad=0";
			$.getJSON(getStr, loadClosure);
			sjs.openRequests += 1;
		};
		sjs.alert.options(options, resetSource);

	});

	$("#removeNikkudot").click(function() {
		var $target = $(".activeSource").find(".text").find(".he");
		$target.html(stripNikkud($target.html()));
		Sefaria.track.sheets("Remove Nikkudot");
		// autoSave();
	});

	$("#splitSourceToSegment").click(function() {
		var $target = $(".activeSource").find(".text");
		$($target.find(".segment")).replaceWith(function() { return '<p>'+$(this).html()+'</p>'; });
		Sefaria.track.sheets("Auto Split Segments");
	});

	$("#addSourceTitle").click(function() {
		var $target = $(".activeSource");
        var ref = normRef($target.attr("data-ref"));
		var $customTitle = $(".customTitle", $target);
		if ($customTitle.text() === "") {
			$customTitle.text("Source Title");
		}
		$customTitle.css('display', 'inline-block')
			.focus()
			.trigger("mouseup")
			.closest(".sheetItem")
			.addClass("hasCustom");

		Sefaria.track.sheets("Edit Source Title", ref);
	});



	// ------------ Empty Instructions ---------------------

	$("#empty .remove").click(function() { $("#empty").remove(); });

	$(".empty_readmore").toggle(function(e) { $("#howItWorks").show(); e.preventDefault(); }, function(e) {
		$("#howItWorks").hide(); e.preventDefault();
	});


	// --------- CKEditor ------------

	if (sjs.can_edit || sjs.can_add ) {
		CKEDITOR.config.language = sjs.interfaceLang;
		CKEDITOR.disableAutoInline = true;
		CKEDITOR.config.startupFocus = true;
		CKEDITOR.config.extraPlugins = 'bidi';
		CKEDITOR.config.extraAllowedContent = 'small; span(segment, gemarra-regular, gemarra-italic, it-text); div(oldComment)';
		CKEDITOR.config.removePlugins = 'magicline,resize';
		CKEDITOR.config.sharedSpaces = {top: 'ckeTopMenu' };
		CKEDITOR.config.colorButton_colors =
			'1ABC9C,2ECC71,3498DB,9B59B6,4E5F70,F1C40F,' +
			'16A085,27AE60,2980B9,8E44AD,2C3E50,F39C12,' +
			'bd9eb6,afcab8,e5dabd,bd9796,a4b7de,e8dde5,' +
			'E67E22,E74C3C,ECF0F1,95A5A6,DDD,FFF,' +
			'D35400,C0392B,BDC3C7,7F8C8D,999,000';
		CKEDITOR.on('instanceReady', function(ev) {
		  // replace &nbsp; from pasted text
		  ev.editor.on('paste', function(evt) {
		    evt.data.dataValue = evt.data.dataValue.replace(/&nbsp;/g,' ');
		  }, null, null, 9);
		});
		CKEDITOR.dtd.$removeEmpty.span = 0;
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
			{name: 'basicstyles', items: ['Bold', 'Italic', 'Underline', 'Strike', 'Subscript', 'Superscript']},
			{name: "justify", items: ['JustifyLeft', 'JustifyCenter', 'JustifyRight', 'JustifyBlock']},
			{name: 'paragraph', items: ['NumberedList', 'BulletedList']},
			// {name: 'styles', items: ['Font', 'FontSize']},
			{name: 'colors', items: ['TextColor', 'BGColor']},
			{name: 'links', items: ['Link', 'Unlink']},
			{name: 'insert', items: ['Image', 'Table', 'HorizontalRule']},
			{name: 'bidi', items: ['BidiLtr','BidiRtl']},
		];

		sjs.removeCKEditor = function(e) {

			stopCkEditorContinuous();
			var editor = e.editor;
			var $el = $(editor.element.$);

			var modified = editor.checkDirty();
			var text = $el.text();

			// always check when text is empty, to be sure we aren't stuck with empty fields
			if (!text.length) { modified = true; }
			// always check custom title, so we don't get stuck with init value of "Source Title"
			if ($el.hasClass("customTitle")) { modified = true; }

			if (modified) {

				// Special cases for fields left empty
				if (!text.length) {
					// Title
					if ($el.prop("id") === "title") {
						$el.text(_("Untitled Source Sheet"));

					// Comment
					} else if ($el.hasClass("comment")) {
						if ($el.find("img").length == 0) {
							// Don't remove a comment that just has an image
							$el.parent().remove();
						}

					// Outside (monolingual)
					} else if ($el.hasClass("outside")) {
						$el.parent().remove();

					// Outside (bilingual)
					} else if ($el.closest(".outsideBi").length) {
						var $outsideBi = $el.closest(".outsideBiWrapper");
						if ($outsideBi.find(".text .he").text() === "" &&
							$outsideBi.find(".text .en").text() === "") {
							$outsideBi.remove();
						}
					}
				}
				// Reset Custom Source Title
				if ($el.hasClass("customTitle") && (text === "" || text === "Source Title")) {
					$el.empty().hide().closest(".sheetItem").removeClass("hasCustom");
				}
				// Substitute Divine names in Hebrew (source of bilingual outside) and outside
				if ($el.hasClass("he") || $el.hasClass("en") || $el.hasClass("outside")) {
					if (sjs.current.options.divineNames !== "noSub") {
						substituteDivineNamesInNode($el[0]);
					}
				}
				// Update hebrew/english classes which are determined by content
				if ($el.hasClass("outside") || $el.hasClass("comment")) {
					if (isHebrew(text)) {
						$el.addClass("he").removeClass("en");
					} else {
						$el.addClass("en").removeClass("he");
					}
				}
				// Mark author as customized
				if ($el.attr("id") === "author") {
					$el.addClass("custom");
				}
				// Save the last edit in case it needs to be replayed
				if (text.length) {
					sjs.saveLastEdit($el);
				}

				if (!$el.hasClass('contentToAdd')) {
					autoSave();
				}
			}

			editor.destroy();
			$("[contenteditable]").attr("contenteditable", "false");
			$(".sheetsEditorControls").hide();
		};

		sjs.removeCKEditorByElement = function(el) {
			var editor = $(el).ckeditorGet();
			sjs.removeCKEditor({editor: editor});
		};

		sjs.initCKEditor = function(e) {
			$(".sheetsEditorControls").show();
			// Don't init again, or while sorting
			if ($(this).hasClass("cke_editable")) { return; }
			if (sjs.flags.sorting) { return; }
			// Don't init if the click began in another editable
			if ($(e.target).find(".cke_editable").length) { return; }
			// Don't init if element clicked is not on the source sheet (i.e. it's some other app element)
			if( !$("#sheet").has($(this)).length > 0  ) { return }
			// Don't init if on mobile
			if ($(".readerApp").length) {
				if (!$(".readerApp").hasClass("multiPanel")) {
					return
				}
			}
			// Remove any existing editors first
			$(".cke_editable").each(function() {
				var ed = $(this).ckeditorGet();
				sjs.removeCKEditor({editor: ed});
			});

			// Hide source controls
			$(".sourceControlsOpen").removeClass("sourceControlsOpen");

			$(this).focus()
				.attr("contenteditable", "true")
				.ckeditor();

			// Close editor on enter for customTitle fields
			if ($(this).hasClass("customTitle")) {
				$(this).on('key', function(e) {
					if (e.data.keyCode == 13) {
						sjs.removeCKEditor(e);
						e.cancel();
					}
				});
			}
		    var ed = $(this).ckeditorGet();

			if (!$(this).hasClass('contentToAdd')) {

				//saveCkEditorContinuous(ed);
				$(this).on('keydown', function (e) {
					$("#lastSaved").find(".saving").show().siblings().hide();
				});
			}
		};

		// So clicks on editor or editable area don't destroy editor
		$("#title, .comment, .outside, .customTitle, .en, .he, #author, .cke, .cke_dialog, .cke_dialog_background_cover")
			.on("mousedown", function(e) {
				e.stopPropagation();
			 });

		// Destroy editor on outside clicks
		// Without this, CKEeditor was not consistently closing itself
		$("html").on("mousedown", function(e) {
			if ($(e.target).closest(".cke_editable").length || $(e.target).closest(".cke").length || $(e.target).closest(".cke_dialog").length || $(e.target).closest(".cke_dialog_background_cover").length) {
				return; // If the click began inside an editable don't remove
			}
			$('.cke_editable').each(function() {
				sjs.removeCKEditorByElement(this);
			});

		});
	}

	function saveCkEditorContinuous(editor) {
		// Start a timer to poll server for changes to this sheet
		stopCkEditorContinuous();
		var ckeSaveChain = function() {

			if (editor.checkDirty() && !sjs.changesPending ) {
				autoSave();
				editor.resetDirty();
			}
			sjs.ckeSaveChain = setTimeout(ckeSaveChain , 10000)
		};
		sjs.ckeSaveChain = setTimeout(ckeSaveChain , 10000);
	}


	function stopCkEditorContinuous(){
		if (sjs.ckeSaveChain ) {
			clearTimeout(sjs.ckeSaveChain );
		}
	}

	// ---------- Save Sheet --------------
	$("#save").click(handleSave);
	$("#save").keydown(function(e){
		if (e.which == 13) {
			handleSave();
		}
	});

	// ---------- Share Sheet --------------
	$("#share").click(showShareModal);
	$("#share").keydown(function(e){
		if (e.which == 13) {
			showShareModal();
		}
	});
	$("#sheetMetadata span.editButton").click(showShareModal);

	// ---------- Copy Sheet ----------------
	$("#copySheet").click(copySheet);

	// ---------- Embed Sheet ----------------
	$("#embedSheet").click(showEmebed);

	// ---------- Delete Sheet ----------------
	$("#deleteSheet").click(deleteSheet);

	// ---------- Export Sheet to Google Drive ----------------
	$("#exportToDrive").click(exportToDrive);


	$("#highlightToggle").click(toggleHighlighter);

	// ------- Sheet Tags --------------
	sjs.sheetTagger.init();
	$("#editTags").click(showShareModal);


	// Prevent backspace from navigating backwards
	$(document).on("keydown", function (e) {
	    if (e.which === 8 && !$(e.target).is("input, textarea, [contenteditable]")) {
	        e.preventDefault();
	    }
	});

	// ------------- Likes -----------------------

	$("#likeButton").click(function(e) {
		e.preventDefault();
		if (!Sefaria._uid) { return sjs.loginPrompt(); }

		var likeCount = parseInt($("#likeCount").text());
		if ($(this).hasClass("liked")) {
			$(this).removeClass("liked").text(_("Like"));
			likeCount -= 1;
			$("#likeCount").text(likeCount);
			$.post("/api/sheets/" + sjs.current.id + "/unlike");
    		Sefaria.track.sheets("Unlike", sjs.current.id);
		} else {
			$(this).addClass("liked").text(_("Unlike"));
			$.post("/api/sheets/" + sjs.current.id + "/like");
			likeCount += 1;
			$("#likeCount").text(likeCount);
    		Sefaria.track.sheets("Like", sjs.current.id);
		}
	});
	$(".likes").click(function(e) {
		$.getJSON("/api/sheets/" + sjs.current.id + "/likers", function(data) {
			if (data.likers.length == 0) {
				var title = _("No one has liked this sheet yet. Will you be the first?");
			} else if (data.likers.length == 1) {
				var title = _("1 Person Likes This Sheet");
			} else {
				var title = data.likers.length + _(" People Like This Sheet");
			}
			sjs.peopleList(data.likers, title);
		});
	});


	// ------------- Build the Current Sheet! -------------------

	if (sjs.current.id) {
		buildSheet(sjs.current);
		if (sjs.can_edit) {
			$("#title, .comment, .outside, .customTitle, .text .en, .text .he, #author, .contentToAdd").off("mouseup")
				.on("mouseup", sjs.initCKEditor);
		}

	} else if (sjs.assignment_id) {
		if (!Sefaria._uid) {
			$("#fileControlMsg").hide();
			return sjs.loginPrompt();
		}
		buildSheet(sjs.current);
		afterAction();
	} else {
		$("#title").html(Sefaria._("New Source Sheet"));
		$("#bilingual, #enLeft, #sideBySide").trigger("click");
		$("#viewButtons").show();
		$("#empty").show();
		if (sjs.can_edit) {
			// Bind init of CKEditor to mouseup, so dragging can start first
			$("#title, .comment, .outside, .customTitle, .text .en, .text .he, #author, .contentToAdd").off("mouseup")
				.on("mouseup", sjs.initCKEditor);
		}

	}


	// ----------- Sorting ---------------

	if (sjs.can_edit || sjs.can_add) {

		sjs.sortStart = function(e, ui) {
			sjs.flags.sorting = true;
			$( this ).sortable( 'refreshPositions' );
			$(".inlineAddButton").hide();
		};

		sjs.sortStop = function(e, ui) {
			sjs.flags.sorting = false;
			sjs.scrollOn("stop");
			setSourceNumbers();
			$(".inlineAddButton").show();
			autoSave();
		};

		sjs.scrollOn = function(dir) {
			// Continuously scroll the page up or down
			var scroll = () => {
				if (this.timer) {clearTimeout (sjs.timer); }
				var top = $("html").scrollTop();
				$("html").scrollTop(top + this.increment);
				this.timer = setTimeout(scroll, 10);
			}
			switch (dir) {
				case "stop":
					if (this.timer) {clearTimeout (this.timer); }
					break;
				case "up":
					this.increment = -20;
					scroll();
					break;
				case "down":
					this.increment = 20;
					scroll();
					break;
			}
		}

		sjs.sortOptions = {
							start: sjs.sortStart,
							stop: sjs.sortStop,
							cancel: ':input, button, .cke_editable, #addInterface',
							placeholder: 'sortPlaceholder',
							cursorAt: false,
							revert: 100,
							delay: 300,
							scroll: false,
							helper: function(e,ui) {
								var helper = $(ui[0]).clone();
								helper.css({'maxHeight': '300px','overflow':'hidden',"background-color":"#FBFBFA","opacity":0.9});
								return helper;
							},
							sort: function(e,ui) {
								var top = $("html").scrollTop();
								if (e.clientY < 120) {
									sjs.scrollOn("up");
								}
								else if (e.clientY > $(window).height()-60) {
									sjs.scrollOn("down");
								}
								else {
									sjs.scrollOn("stop");
								}
							}
						};

		$("#sources").sortable(sjs.sortOptions);
		if ($("#sheet").hasClass("highlightMode")) {
			$("#sources").sortable("disable"); //disable dragging while in highlighter edit mode....
		}
	}


	// ------------- Source Controls -------------------

  var outdent_img = (sjs.interfaceLang == "en") ? '/static/img/outdent.png' : '/static/img/indent.png';
  var indent_img = (sjs.interfaceLang == "en") ? '/static/img/indent.png' : '/static/img/outdent.png';

  var ownerControls = "<div id='sourceControls' class='sideControls'>" +
              "<div class='copySource' title='"+_('Copy to Sheet')+"'><img src='/static/img/copy.png'></div>" +
              "<div class='removeSource' title='"+_('Remove')+"'><img src='/static/img/remove.png'></div>" +
              "<div class='moveSourceRight' title='"+_('Indent Source')+"'><img src='"+indent_img+"'></div>" +
              "<div class='moveSourceLeft' title='"+_('Outdent Source')+"'><img src='"+outdent_img+"'></div>" +
              "<div class='moveSourceUp' title='"+_('Move Source Up')+"'><img src='/static/img/triangle-up.svg'></div>" +
              "<div class='moveSourceDown' title='"+_('Move Source Down')+"'><img src='/static/img/triangle-down.svg'></div>" +
            "</div>";

  var adderControls = "<div id='sourceControls' class='sideControls'>" +
              "<div class='copySource' title='"+_('Copy to Sheet')+"'><img src='/static/img/copy.png'></div>" +
              "<div class='moveSourceRight' title='"+_('Indent Source')+"'><img src='"+indent_img+"'></div>" +
              "<div class='moveSourceLeft' title='"+_('Outdent Source')+"'><img src='"+outdent_img+"'></div>" +
            "</div>";
  var viewerControls = "<div id='sourceControls' class='sideControls'>" +
              "<div class='copySource' title='"+_('Copy to Sheet')+"'><img src='/static/img/copy.png'></div>" +
            "</div>";

  var ownerSimpleControls = "<div id='sourceControls' class='sideControls'>" +
              "<div class='copySource' title='"+_('Copy to Sheet')+"'><img src='/static/img/copy.png'></div>" +
              "<div class='removeSource' title='"+_('Remove')+"'><img src='/static/img/remove.png'></div>" +
              "<div class='moveSourceRight' title='"+_('Indent Source')+"'><img src='"+indent_img+"'></div>" +
              "<div class='moveSourceLeft' title='"+_('Outdent Source')+"'><img src='"+outdent_img+"'></div>" +
              "<div class='moveSourceUp' title='"+_('Move Source Up')+"'><img src='/static/img/triangle-up.svg'></div>" +
              "<div class='moveSourceDown' title='"+_('Move Source Down')+"'><img src='/static/img/triangle-down.svg'></div>" +
            "</div>";


  // Add Interface
  if (sjs.is_owner||sjs.can_edit||sjs.can_add) {

    function toggleAddInterface(e, target, trigger) {
      $("#addInterface .addInterfaceButton").removeClass('active');
      $("#inlineTextPreview").html("");
      $("#inlineTextPreview").hide();
      target.addClass('active');
      var divToShow = "#add" + (target.attr('id').replace('Button', '')) + "Div";
      $(".contentDiv > div").hide();
      $(divToShow).show();
      if (trigger == "keyboard") {
        var input = $(divToShow).find(':focusable').first();
        input.focus();
      }
    }

    $("#addInterface").on("click", ".buttonBar .addInterfaceButton", function(e) {
      toggleAddInterface(e, $(this), "click");
    });

    $("#addInterface").on("keydown", ".buttonBar .addInterfaceButton", function(e) {
      if (e.which == 13) {
        toggleAddInterface(e, $(this), "keyboard");
      }
    });

    $("#connectionsToAdd").on("click", ".sourceConnection", function(e) {
      $(this).hasClass("active") ? $(this).removeClass("active").attr("aria-checked", "false") : $(this).addClass("active").attr("aria-checked", "true");
    });

    $("#addconnectionDiv").on("keydown", ".sourceConnection", function(e) {
      if (e.which == 13) {
        $(this).hasClass("active") ? $(this).removeClass("active").attr("aria-checked", "false") : $(this).addClass("active").attr("aria-checked", "true");
      }
    });

    $("#addconnectionDiv").on("click", ".button", function(e) {

      var $target = $("#addInterface").prev(".sheetItem");

      $(".sourceConnection.active").each(function(index) {

        var refs = $(this).data("refs").split(";");
        refs = refs.reverse();

        for (var i = 0; i < refs.length; i++) {
          var source = {
            ref: refs[i]
          };
          buildSource($target, source, "insert");
        }
      });

      $("#addconnectionDiv").on("keydown", ".button", function(e) {
        if (e.which == 13) {
          $("#addconnectionDiv .button").click();
        }
      });

      autoSave();
      $(".sourceConnection").removeClass('active').attr("aria-checked", "false");
      $("#sheet").click();
      $("#sourceButton").click();
    });

    $("#addSourceMenu").click(function() {
      $("#sheet").click();
      $("#sourceButton").click();
      var top = $("#sourceButton").offset().top - 200;
      $("html, body").animate({scrollTop: top}, 300);
    });

    $("#addCustomMenu").click(function() {
      $("#sheet").click();
      $("#customTextButton").click();
      var top = $("#customTextButton").offset().top - 200;
      $("html, body").animate({scrollTop: top}, 300);
    });

    $("#addCommentMenu").click(function() {
      $("#sheet").click();
      $("#commentButton").click();
      var top = $("#commentButton").offset().top - 200;
      $("html, body").animate({scrollTop: top}, 300);
    });

    $("#addMediaMenu").click(function() {
      $("#sheet").click();
      $("#mediaButton").click();
      var top = $("#mediaButton").offset().top - 200;
      $("html, body").animate({scrollTop: top}, 300);
    });

    $("#addInterface").on("click", "#connectionButton", function(e) {

      var ref = $("#addInterface").prev(".source").attr("data-ref");
      $("#connectionsToAdd").text(_("Looking up Connections..."));

      $.getJSON("/api/texts/" + ref + "?context=0&commentary=1&pad=0", function(data) {
        sjs.alert.clear();
        if ("error" in data) {
          $("#connectionsToAdd").text(data.error)
        } else if (data.commentary.length == 0) {
          $("#connectionsToAdd").text(_("No connections known for this source."));
        } else {
          data.commentary = [].concat.apply([], data.commentary);

          data.commentary = data.commentary.sort(SortBySourceRef);

          var categorySum = {};
          for (var i = 0; i < data.commentary.length; i++) {
            var c = data.commentary[i];
            var key = (sjs.interfaceLang == "en" ? c.collectiveTitle['en'] : c.collectiveTitle['he']);
            if (categorySum[key]) {
              categorySum[key]++;
            } else {
              categorySum[key] = 1;
            }
          }
          var categories = [];
          for (var k in categorySum) {
            categories.push(k);
          }
          categories.sort();

          var labels = [];
          for (var k in categorySum) {
            labels.push(k + " (" + categorySum[k] + ")");
          }
          labels.sort();

          var connectionsToSource = '<div>';
          for (var j = 0; j < labels.length; j++) {
            var dataRefs = "";

            for (var i = 0; i < data.commentary.length; i++) {
              var c = data.commentary[i];
              var key = (sjs.interfaceLang == "en" ? c.collectiveTitle['en'] : c.collectiveTitle['he']);
              if (categories[j] == key) {
                dataRefs = dataRefs + c.sourceRef + ";";
                //continue;
              }
            }
            dataRefs = dataRefs.slice(0, -1); //remove trailing ";"
            connectionsToSource += '<div role="checkbox" aria-checked="false" tabindex="0" class="sourceConnection" data-refs="' + dataRefs + '">' + labels[j] + '</div>';
          }
          connectionsToSource += "</div>";

          $("#connectionsToAdd").html(connectionsToSource);
        }
      });
    });

    $("#addInterface").on("keydown", "#connectionButton", function(e) {
      if (e.which == 13) {
        $("#connectionButton").click()
      }
    });

    $("#addcommentDiv").on("click", ".button", function(e) {
      var $target = $("#addInterface").prev(".sheetItem");
      var source = {comment: $(this).prev(".contentToAdd").html(), isNew: true};
      if (sjs.can_add) {
        source.userLink = sjs._userLink;
      }
      $target.length == 0 ? buildSource($("#sources"), source, "append") : buildSource($target, source, "insert");
      autoSave();
      $("#addcommentDiv .contentToAdd").html('<br>');
      $("#sheet").click();
    });

    $("#addcommentDiv").on("keydown", ".button", function(e) {
      if (e.which == 13) {
        $("#addcommentDiv .button").click();
      }
    });

    $("#addcommentDiv .contentToAdd").keypress(function(e) {
      if (isHebrew($(this).text()) && $(this).text().length > 0) {
        $(this).addClass("he");
      }
      else {
        $(this).removeClass("he");
      }
    });

    $("#addmediaDiv").on("click", ".button:first", function(e) {
      var $target = $("#addInterface").prev(".sheetItem");
      var source = {media: "", isNew: true};
      if (sjs.can_add) {
        source.userLink = sjs._userLink;
      }
      $target.length == 0 ? buildSource($("#sources"), source, "append") : buildSource($target, source, "insert");

      var embedHTML = makeMediaEmbedLink($("#inlineAddMediaInput").val());

      if (embedHTML != false) {
        var $mediaDiv = $("#sources").find(".media.new:empty").first()
        $mediaDiv.html(embedHTML);
        mediaCheck($mediaDiv);
      }
      else {
        $target.next(".sheetItem").remove();
        sjs.alert.flash("We couldn't understand your link.<br/>No media added.")
      }

      autoSave();
    });

    $("#addmediaDiv").on("keydown", ".button", function(e) {
      if (e.which == 13) {
        $("#addmediaDiv .button").click();
      }
    });

    $("#addmediaDiv").on("keydown", "#addmediaFileSelector", function(e) {
      if (e.which == 13) {
        $("#addmediaDiv #addmediaFileSelector").click();
      }
    });

    $("#addcustomTextDiv").on("click", "#customTextLanguageToggle .toggleOption", function(e) {

      $("#customTextLanguageToggle .toggleOption").removeClass('active');
      $(this).addClass('active');
      if ($(this).attr('id') == 'bilingualCustomText') {
        $("#addcustomTextDiv").find(".contentToAdd").show();
      }
      else if ($(this).attr('id') == 'englishCustomText') {
        $("#addcustomTextDiv").find(".en").show();
        $("#addcustomTextDiv").find(".he").hide();
      }
      else if ($(this).attr('id') == 'hebrewCustomText') {
        $("#addcustomTextDiv").find(".he").show();
        $("#addcustomTextDiv").find(".en").hide();
      }
    });

    $("#addcustomTextDiv").on("click", ".button", function(e) {
      var $target = $("#addInterface").prev(".sheetItem");
      if ($(this).prev(".flexContainer").find(".contentToAdd:visible").length == 1) {
      	var text = $(this).prev(".flexContainer").find(".contentToAdd:visible").html();
      	text = text.stripHtml() == "English" || text == "עברית" ? "" : text;
        source = {
          outsideText: text,
          isNew: true
        };
      }
      else {
        var en = $(this).prev(".flexContainer").find(".en").html();
        var he = $(this).prev(".flexContainer").find(".he").html();
        en = en.stripHtml() == "English" ? "" : en;
        he = he.stripHtml() == "עברית" ? "" : he;
        source = {
          outsideBiText: {
            en: en,
            he: he,
          }, isNew: true
        };
      }

      if (sjs.can_add) {
        source.userLink = sjs._userLink;
      }
      $target.length == 0 ? buildSource($("#sources"), source, "append") : buildSource($target, source, "insert");
      autoSave();
      $("#customTextContainer .contentToAdd.en").html('English');
      $("#customTextContainer .contentToAdd.he").html('עברית');
      $("#sheet").click();
    });

    $("#addcustomTextDiv").on("focus", ".contentToAdd", function(e) {
    	if ($(this).html() == "English" || $(this).html() == "עברית") {
    		$(this).html("");
    	}
    });

    $("#addcustomTextDiv").on("keydown", ".button", function(e) {
      if (e.which == 13) {
        $("#addcustomTextDiv .button").click();
      }
    });

    $("html").on("click", "#content", function(e) {
      //clicked off of a sheetitem
      if ($(e.target).closest(".sheetItem").length || $(e.target).closest(".sheetsEditNavTop").length) {
        return;
      }
      if ($(e.target).closest("#addInterface").length) return
      $("#connectionButton").hide();

      if ($("#textBrowser").is(":visible")) {
      	return;
	  };

      cleanupActiveSource(e.target);
    });

    $(".sheetItem").on("click", ".inlineAddButtonIcon", function(e) {
      $("#addInterface").insertAfter($(this).parent().closest(".sheetItem"));
      $(this).parent().closest(".sheetItem").hasClass("source") ? $("#connectionButton").css('display', 'inline-block') : $("#connectionButton").hide();
      $(".inlineAddButtonIcon").removeClass("active");
      $(this).addClass("active");
      $("#sourceButton").click();
      e.stopImmediatePropagation();
    });

    function cleanupActiveSource(target) {
      $(".inlineAddButtonIcon").removeClass("active");
      $(".activeSource").removeClass("activeSource");
      $("#sheetLayoutLanguageMenuItems").show();
      $("#sourceLayoutLanguageMenuItems").hide();
      $("#resetText").hide();
      $("#removeNikkudot").hide();
      $(".resetHighlighter").hide();
      $("#splitSourceToSegment").hide();
      $("#addSourceTitle").hide();
      if (!$(target).hasClass('inlineAddButtonIcon')) {
        $(".inlineAddButtonIcon").last().click();
      }
      $(".sheetItem .inlineAddButtonIcon").off();
      $(".sheetItem").on("click", ".inlineAddButtonIcon", function(e) {
        $("#addInterface").insertAfter($(this).parent().closest(".sheetItem"));
        $(this).parent().closest(".sheetItem").hasClass("source") ? $("#connectionButton").css('display', 'inline-block') : $("#connectionButton").hide();
      });
      $("#sourceButton").click();
    }

    function setLanguageLayoutCheckBoxes(source) {
      if (!$(source).hasClass("hebrew") && !$(source).hasClass("bilingual") && !$(source).hasClass("english")) {
        if (sjs.current.options.language == "hebrew") {
          $("#sourceLayoutLanguageMenuItems").find(".hebrew .fa-check").removeClass("hidden");
        }
        else if (sjs.current.options.language == "bilingual") {
          $("#sourceLayoutLanguageMenuItems").find(".bilingual .fa-check").removeClass("hidden");
          $("#sourceLayoutLanguageMenuItems").find("#layoutToggleGroup").removeClass("disabled");
        }
        else if (sjs.current.options.language == "english") {
          $("#sourceLayoutLanguageMenuItems").find(".english .fa-check").removeClass("hidden");
        }

        if (sjs.current.options.layout == "stacked") {
          $("#sourceLayoutLanguageMenuItems").find(".stacked .fa-check").removeClass("hidden")
        }
        else if (sjs.current.options.layout == "sideBySide") {
          $("#sourceLayoutLanguageMenuItems").find(".sideBySide .fa-check").removeClass("hidden");
          $("#sourceLayoutLanguageMenuItems").find("#sideBySideToggleGroup").removeClass("disabled");
        }

        if (sjs.current.options.langLayout == "heLeft") {
          $("#sourceLayoutLanguageMenuItems").find(".heLeft .fa-check").removeClass("hidden")
        }
        else if (sjs.current.options.langLayout == "heRight") {
          $("#sourceLayoutLanguageMenuItems").find(".heRight .fa-check").removeClass("hidden")
        }
      }

      else {
        if ($(source).hasClass("hebrew")) {
          $("#sourceLayoutLanguageMenuItems").find(".hebrew .fa-check").removeClass("hidden");
        }
        else if ($(source).hasClass("bilingual")) {
          $("#sourceLayoutLanguageMenuItems").find(".bilingual .fa-check").removeClass("hidden");
          $("#sourceLayoutLanguageMenuItems").find("#layoutToggleGroup").removeClass("disabled");
        }
        else if ($(source).hasClass("english")) {
          $("#sourceLayoutLanguageMenuItems").find(".english .fa-check").removeClass("hidden");
        }

        if ($(source).hasClass("stacked")) {
          $("#sourceLayoutLanguageMenuItems").find(".stacked .fa-check").removeClass("hidden")
        }
        else if ($(source).hasClass("sideBySide")) {
          $("#sourceLayoutLanguageMenuItems").find(".sideBySide .fa-check").removeClass("hidden");
          $("#sourceLayoutLanguageMenuItems").find("#sideBySideToggleGroup").removeClass("disabled");
        }

        if ($(source).hasClass("heLeft")) {
          $("#sourceLayoutLanguageMenuItems").find(".heLeft .fa-check").removeClass("hidden")
        }
        else if ($(source).hasClass("heRight")) {
          $("#sourceLayoutLanguageMenuItems").find(".heRight .fa-check").removeClass("hidden")
        }
      }
    }

    $("#sheet").on("click", ".sheetItem", function(e) {
      //clicked on a sheet item
      if ($(e.target).hasClass("inlineAddButtonIcon")) return;
      if (!$(".readerApp").hasClass("multiPanel")) return; //prevent active source on mobile
      cleanupActiveSource(e.target);
      $(this).addClass("activeSource");
      $("#sheetLayoutLanguageMenuItems").hide();
      $("#sourceLayoutLanguageMenuItems").show();
      $("#resetText").show();
      $("#addSourceTitle").show();
      $("#removeNikkudot").show();
      $(".resetHighlighter").show();
      $("#splitSourceToSegment").show();
      //$(this).hasClass("source") ? $("#connectionButton").css('display', 'inline-block') : $("#connectionButton").hide();

      //set checkboxes for language/layout menus for active source
      setLanguageLayoutCheckBoxes(e.target);

      if (!($(this).hasClass("source"))) {
        $("#resetText").hide();
        $("#addSourceTitle").hide();
        $("#removeNikkudot").hide();
        $("#splitSourceToSegment").hide();
        $("#sourceLayoutLanguageMenuItems").hide();
      }
    });

    $("#sheet").click();
  } // End Setup for editors / adders


	$("#sheet").on( "mouseenter", ".sheetItem", function(e) {

	    if ($(".cke_editable").length) { return; }

		var isOwner = sjs.is_owner || $(this).attr("data-added-by") == String(Sefaria._uid);
		var controlsHtml = "";
		if (isOwner||sjs.can_edit) {
			if ($(this).hasClass("source")) {
				controlsHtml = ownerControls;
			} else {
				controlsHtml = ownerSimpleControls;
			}
		} else if (sjs.can_add) {
			if ($(this).hasClass("source")) {
				controlsHtml = adderControls;
			} else {
				controlsHtml = viewerControls;
			}
		} else {
			controlsHtml = viewerControls;
		}

		$(".sourceControlsOpen").removeClass("sourceControlsOpen");
		$(".sourceControlsTop").removeClass("sourceControlsTop");
		if (sjs.removeSourceControlsTimer) { clearTimeout(sjs.removeSourceControlsTimer); }
		$(this).addClass("sourceControlsOpen");
		$("#sourceControls").remove();
		$(this).append(controlsHtml);
		$("#sourceControls div").tooltipster({
			delay: 0,
			position: "bottom"
		});

		var sourceHeight = $(this).outerHeight();
		var sourceControlsHeight = 134;
		if (sourceHeight < sourceControlsHeight + 20) {
			$("#sourceControls").css({top: -(sourceControlsHeight - sourceHeight) / 2});
		}

		// Move Source Up
		$(".moveSourceUp").on("click", function() {
			$(this).closest(".sheetItem").insertBefore($(this).closest(".sheetItem").prev());

			var top = $(this).offset().top - 300;
			$("html, body").animate({scrollTop: top}, 750);
			setSourceNumbers();

			autoSave();
		});

		// Move Source Donw
		$(".moveSourceDown").on("click", function() {
			$(this).closest(".sheetItem").insertAfter($(this).closest(".sheetItem").next());

			var top = $(this).offset().top - 300;
			$("html, body").animate({scrollTop: top}, 750);
			setSourceNumbers();

			autoSave();
		});

		// Indent Source
		$(".moveSourceRight").on("click", function() {

			if ($(this).closest(".sheetItem").hasClass("indented-1")) {
				var toIndent = "indented-2";
			} else if ($(this).closest(".sheetItem").hasClass("indented-2")) {
				var toIndent = "indented-3";
			} else if ($(this).closest(".sheetItem").hasClass("indented-3")) {
				var toIndent = "indented-3";
			} else {
				var toIndent = "indented-1";
			}

			$(this).closest(".sheetItem").removeClass("indented-1 indented-2 indented-3")
			$(this).closest(".sheetItem").addClass(toIndent);

			autoSave();
		});

		// Outdent Source
		$(".moveSourceLeft").on("click", function() {

			if ($(this).closest(".sheetItem").hasClass("indented-1")) {
				var toIndent = "";
			} else if ($(this).closest(".sheetItem").hasClass("indented-2")) {
				var toIndent = "indented-1";
			} else if ($(this).closest(".sheetItem").hasClass("indented-3")) {
				var toIndent = "indented-2";
			} else {
				var toIndent = "";
			}

			$(this).closest(".sheetItem").removeClass("indented-1 indented-2 indented-3")
			$(this).closest(".sheetItem").addClass(toIndent);

			autoSave();
		});

		// Remove Source
		$(".removeSource").on("click", function() {
			var $item = $(this).closest(".sheetItem"); // Firefox triggers mouseout when opening confirm
			if (confirm(_("Are you sure you want to remove this?"))) {
				$item.remove();
				autoSave();
				setSourceNumbers();
			}
			Sefaria.track.sheets("Remove Source");
		 });

		// Copy a Source
		$(".copySource").on("click", function() {
			var source = readSource($(this).closest(".sheetItem"));
			copyToSheet(source);
		});
	});

	// $("#sheet").on("mouseleave", ".sheetItem", function(e) {
	// 	$(this).removeClass("sourceControlsOpen");
	// 	$("#sourceControls").remove();
	// 	var $to = $(e.toElement || e.relatedTarget).closest(".sheetItem");
	// 	if ($to.length) {
	// 		$to.trigger("mouseenter");
	// 	}
	// 	e.stopPropagation();
	//
	// 	$(".moveSourceLeft, .moveSourceRight, .moveSourceDown, .moveSourceUp, .copySource, .removeSource").off("click")
	// });

	// Custom Source Titles
	$(".editTitle").on("click", function(e) {
        var $target = $(this).closest(".source");
        var ref = normRef($target.attr("data-ref"));
		var $customTitle = $(".customTitle", $target).eq(0);
		if ($customTitle.text() === "") {
			$customTitle.text("Source Title");
		}
		$customTitle.css('display', 'inline-block')
			.focus()
			.trigger("mouseup")
			.closest(".sheetItem")
			.addClass("hasCustom");

		e.stopPropagation();
		Sefaria.track.sheets("Edit Source Title", ref);
	});

	// Reset Source Text
	$(".resetSource").on("click", function() {
		var options = {
			message: _("Reset text of Hebrew, English or both?")+"<br><small>"+_("Any edits you have made to this source will be lost")+".</small>",
			options: ["Hebrew", "English", "Both"]
		};
		var $target = $(this).closest(".source");
		var resetSource = function(option) {
			var loadClosure = function(data) {
				loadSource(data, $target, option);
        		Sefaria.track.sheets("Reset Source", data.ref);
			};
			var getStr = "/api/texts/" + normRef($target.attr("data-ref")) + "?commentary=0&context=0&pad=0";
			$.getJSON(getStr, loadClosure);
			sjs.openRequests += 1;
		};

		sjs.alert.options(options, resetSource);
	});

	$(".parshahToAdd").click(function(){
		$("#addParashaToSheetModal, #overlay").hide();
        var parasha = $(this).data("parsha");
		$.getJSON("/api/sheets/"+ parasha +"/get_aliyot", function(data) {
			if ("error" in data) {
				sjs.alert.flash(data.error);
			} else {
				for (var i = 0; i < data.ref.length; i++) {
					var source = {
						ref: data.ref[i]
					};
					buildSource($("#sources"), source);
				}
        		Sefaria.track.sheets("Add Parasha", parasha);
			}
		});

		}
	);

	$("#addParashaToSheetModalTrigger").on("click", function(e) {
		$("#addParashaToSheetModal").show().position({of: window});
		$("#overlay").show();
	});

	$("#assignmentsModalTrigger").on("click", function(e) {
		$("#assignmentsModal").hide();
		$("#assignmentsModal").show().position({of: window});
		$("#overlay").show();
	});

	$("#addParashaToSheetModal .cancel").click(function() {
		$("#addParashaToSheetModal, #overlay").hide();
	});

	$(".close-button").click(function() {
		$(".s2Modal, #overlay").hide();
	});

	$("#shareWithOthers .ok").click(function(){
		$("#shareWithOthers, #overlay").hide();
		$("#sheetSummary").text($("#sheetSummaryInput").val());

	    //save whole sheet if possible, otherwise, just save sheet tags:
	    if (sjs.can_save) {
				autoSave();
		} else {
	    	var topics = JSON.stringify(sjs.sheetTagger.topics());
	    	$.post("/api/sheets/" + sjs.current.id + "/topics", {"topics": topics});
	    }
	});

	$("#shareWithOthers").on("change keyup keydown paste cut", "#sheetSummaryInput", function (){
			$(this).height(0);
			var heightToSwitch = this.scrollHeight < 40 ? 40:this.scrollHeight;
			$(this).height(heightToSwitch);
	}).find("#sheetSummaryInput").change();

	$("#sourceSheetGroupSelect").change(function() {
		if (!!$(this).val()) {
			var $el = $("#sourceSheetGroupSelect option:selected");
			var collectionSlug = $el.attr("data-slug");
			var collectionHeader = $el.attr("data-image");
			$("#collectionHeader").attr("src", collectionHeader)
				.closest("a").attr("href", "/collections/" + collectionSlug);
			if (collectionHeader) {$("#sheetHeader").show();} else { $("#sheetHeader").hide();}
		}
		else {
			$("#sheetHeader").hide();
		}
	});


	$("#highlightMenu .optionsMenu").on('click', '.resetHighlighter', function() {
		var curHighlighter = $(".activeSource").find(".highlighter");
		var curText = $(".activeSource").find(".text");
		curHighlighter.find(".en").html("<div class='highlighterSegment'>"+curText.find(".en").html().stripHtml()+"</div>");
		curHighlighter.find(".he").html("<div class='highlighterSegment'>"+curText.find(".he").html().stripHtml()+"</div>");
		autoSave();
	});

	$("#highlightMenu .optionsMenu").on('click', '.segmentedContinuousToggle', function() {
		var $elem = $(this);
		if ($elem.data("mode") == "continuous") {
			$elem.find(".continuousActive").hide();
			$elem.find(".segmentedActive").show();
			$('.highlighterSegment').css({'display': 'block'});
			$elem.data("mode", "segmented");
		}
		else /*view mode */ {
			$elem.find(".segmentedActive").hide();
			$elem.find(".continuousActive").show();
			$('.highlighterSegment').css({'display': 'inline'});
			$elem.data("mode", "continuous");
		}
	});

	$(".highlighterTagWindow").on('click','.close-button', function() {closeHighlighterTagWindow()});

	function saveNewlyCreatedTag(newTagName,newTagColor) {
		if (newTagName !== _('Create New') && newTagName !== "") {
			$(".sheetHighlighterTags").append('<div class="splitHighlighterSegment" data-tagname="' + newTagName + '"><div class="colorSwatch active" style="background-color: ' + newTagColor + '"></div><div class="tagName">' + newTagName + '</div><div class="editCheckToggle">✎</div></div>');
			$(".highlighterFilterTags").append('<div class="optionItem highlightFilterSelection"><input type="checkbox" name="highlighterFilterTags" id ="'+newTagName+'_highlighterTag" value="' + newTagName + '" checked="checked"> <label for="'+newTagName+'_highlighterTag" style="background-color: ' + newTagColor + '">' + newTagName + '</label></div>');
			resetSplitHighlighterSegment();
			resetHighlighterFilterTags();
			autoSave();
		}

		$(".createNewHighlighterTag .tagName").text(_('Create New'))
	}

	function applyNewlyCreatedTag(newTagName,newTagColor) {
		if (newTagName !== _('Create New') && newTagName !== "") {
			$(".sheetHighlighterTags").append('<div class="splitHighlighterSegment active" data-tagname="' + newTagName + '"><div class="colorSwatch active" style="background-color: ' + newTagColor + '"></div><div class="tagName">' + newTagName + '</div><div class="editCheckToggle">✎</div></div>');
			$(".highlighterFilterTags").append('<div class="optionItem highlightFilterSelection"><input type="checkbox" name="highlighterFilterTags" id ="'+newTagName+'_highlighterTag" value="' + newTagName + '" checked="checked"> <label for="'+newTagName+'_highlighterTag" style="background-color: ' + newTagColor + '">' + newTagName + '</label></div>');
			resetSplitHighlighterSegment();
			resetHighlighterFilterTags();
			if (sjs.selection.startOffset !== sjs.selection.endOffset) {
        $(".highlighterTagWindow .save").click();
				$(".createNewHighlighterTag .tagName").text(_('Create New'))
      }
      else {
				$(".createNewHighlighterTag .tagName").text("")
			}
		}
	}

	$(".createNewHighlighterTag .tagName").keydown(function(e){
		if (e.which == 13) {
      e.preventDefault();
      applyNewlyCreatedTag($(e.target).text(),$(e.target).siblings('.colorSwatch.active').css('background-color'));
		}
	});

	$(".createNewHighlighterTag .tagName").focus(function(e){
		if ($(this).text()==_('Create New')) {
			$(this).text('');
		}
	});

	$(".createNewHighlighterTag .tagName").focusout(function(e){
      e.preventDefault();
			saveNewlyCreatedTag($(e.target).text(),$(e.target).siblings('.colorSwatch.active').css('background-color'));
			$('.createNewHighlighterTag .colorSwatch').removeClass('active');
			$('.createNewHighlighterTag .colorSwatch').css('display', '');
			$('.createNewHighlighterTag .colorSwatch').eq($('.splitHighlighterSegment').length % 7).addClass('active'); //select the next color in the list

	});

	$(".createNewHighlighterTag").on('mousedown', '.colorSwatch', function() {
		if ($('.createNewHighlighterTag .colorSwatch:visible').length > 1) {
			$(".createNewHighlighterTag .colorSwatch").removeClass('active');
			$(this).addClass('active');
			$(".createNewHighlighterTag .colorSwatch").hide();
			$(".createNewHighlighterTag .colorSwatch.active").css("display","inline-block");
			$(this).siblings('.tagName').eq(0).show();
		}
		else {
			$(".createNewHighlighterTag .colorSwatch").css("display","inline-block");
			$(this).siblings('.tagName').eq(0).hide();
		}
	});

	$(".highlighterTagWindow").on('click', '.save', function() {
		restoreSelection(sjs.selection);
		if ($(".splitHighlighterSegment.active").length == 0) {
				restoreSelectedText(window.getSelection());
			}
		else {
			splitSelectedText(window.getSelection(), $(".splitHighlighterSegment.active").find('.tagName').text(), $(".splitHighlighterSegment.active").find('.colorSwatch').css('background-color'));
		}
	closeHighlighterTagWindow();
	});


	function restoreSelectedText(selection) {
		if (selection.anchorOffset < 0) return;
		var curHighlighterSegment = $(selection.focusNode);
		if ($(curHighlighterSegment[0]).hasClass('highlighterSegment')) { //firefox returns this if selection object already contains a tag
			$(curHighlighterSegment[0]).css('background-color', '').removeAttr('data-tag','');
		}
		else {
			$(curHighlighterSegment.parent()).css('background-color', '').removeAttr('data-tag','');
		}
		mergeSameClassAdjacentHighlighterSegments();
	}

	function mergeSameClassAdjacentHighlighterSegments() {
		$( ".highlighterSegment" ).each(function( index ) {
			if (($(this).attr('data-tag')) == $(this).next().attr('data-tag') && $(this).next().text() != '')  {
				var textToPrepend = $(this).text();
				var nextText = $(this).next().text();
				textToPrepend = textToPrepend + nextText;
				$(this).next().text(textToPrepend);
				$(this).remove();
			}
		});
		$(".highlighterSegment:empty").remove();
		autoSave();
	}

	function splitSelectedText(selection, highlighterTag, tagBgColor) {
			var selectedRange = selection;
			var firstSelectedCharacter;
			var lastSelectedCharacter;
			if (selectedRange.anchorOffset < selectedRange.focusOffset) {
				firstSelectedCharacter = selectedRange.anchorOffset;
				lastSelectedCharacter = selectedRange.focusOffset;
			}
			else {
				firstSelectedCharacter = selectedRange.focusOffset;
				lastSelectedCharacter = selectedRange.anchorOffset;
			}


			var curHighlighterSegment = $(selectedRange.focusNode);

			if ($(curHighlighterSegment[0]).hasClass('highlighterSegment')) { //firefox returns this if selection object already contains a tag
				$(curHighlighterSegment[0]).css('background-color', tagBgColor).attr('data-tag', highlighterTag);
			}

			else {

				if (curHighlighterSegment.parent().hasClass('tagName')) return;
				var textBefore = curHighlighterSegment.text().slice(0, firstSelectedCharacter);
				var selectedText = curHighlighterSegment.text().slice(firstSelectedCharacter, lastSelectedCharacter);
				var textAfter = curHighlighterSegment.text().slice(lastSelectedCharacter);

				highlighterTag = highlighterTag.replace(/\'/g, '&#39;'); //prevents js errors from improperly escaped strings.
				$(curHighlighterSegment.parent()).after("<div class='highlighterSegment'>" + textAfter + "</div>");
				$(curHighlighterSegment.parent()).after("<div class='highlighterSegment' style='background-color: " + tagBgColor + "' data-tag='" + highlighterTag + "'>" + selectedText + "</div>");
				$(curHighlighterSegment.parent()).text(textBefore);
			}
			resetHighlighterInteractivity();
			closeHighlighterTagWindow();
			$(".highlighterSegment:empty").remove();
			mergeSameClassAdjacentHighlighterSegments();
	}

	resetSplitHighlighterSegment();

	resetHighlighterInteractivity();

	resetHighlighterFilterTags();

	$("#overrideLayoutModal .ok").click(function(){
		//check to see if current source layout matches sheet layout -- if so, remove classes & let the parent be in charge
		if (
		$("#sheetLayoutToggle").find(".active").attr("id") == $("#sheetLayoutToggleSource").find(".active").attr("id").replace("Source","")
		&& $("#languageToggle").find(".active").attr("id") == $("#languageToggleSource").find(".active").attr("id").replace("Source","")
		&& $("#biLayoutToggle").find(".active").attr("id").replace("he","heb") == $("#biLayoutToggleSource").find(".active").attr("id").replace("Source","")
		) {
			var $target = $("#overrideLayoutModal").data("target");
			$target.removeClass("bilingual english hebrew sideBySide heLeft heRight stacked");
		}

		$("#overrideLayoutModal, #overlay").hide();
		autoSave();
	});

	// Change Source Layout via modal
	$("#sideBySideSource, #stackedSource").click(function(){
		var $target = $("#overrideLayoutModal").data("target");
		$("#sheetLayoutToggleSource .toggleOption").removeClass("active");
		$(this).addClass("active");
		$target.removeClass("sideBySide stacked")
			.addClass($(this).attr("id").replace("Source",""));
		if ($(this).attr("id") == "stackedSource") {
			$("#biLayoutToggleSource").addClass("disabled");
			$target.removeClass("heLeft heRight")

		} else {
			$("#biLayoutToggleSource").removeClass("disabled");
		}
		Sefaria.track.sheets("Change Source Layout Button");
	});

	// Change Source Language via modal
	$("#hebrewSource, #englishSource, #bilingualSource").click(function(){
		var $target = $("#overrideLayoutModal").data("target");
		$target.removeClass("english bilingual hebrew")
			.addClass($(this).attr("id").replace("Source",""));
		$("#languageToggleSource .toggleOption").removeClass("active");
		$(this).addClass("active");
		if ($(this).attr("id") != "bilingualSource") {
			$("#stackedSource").click();
			$("#biLayoutToggleSource, #sheetLayoutToggleSource").addClass("disabled");
			$target.removeClass("sideBySide heLeft heRight").addClass("stacked");
		} else {
			$("#sheetLayoutToggleSource").removeClass("disabled");
			if ($target.hasClass("sideBySide")) {
				$("#biLayoutToggleSource").removeClass("disabled");
			}
		}
		Sefaria.track.sheets("Change Source Language Button");
	});

	// Change Language Layout via modal
		$("#hebLeftSource, #hebRightSource").click(function(){
		var $target = $("#overrideLayoutModal").data("target");
		$("#biLayoutToggleSource .toggleOption").removeClass("active");
		$(this).addClass("active");
		$target.removeClass("heLeft heRight")
			.addClass($(this).attr("id").replace("Source",""));
		Sefaria.track.sheets("Change Source Language Layout Button");
	});

	// Remove all custom source language/layout overrides:
	$("#resetToDefaults").on("click", function() {
		var $target = $("#overrideLayoutModal").data("target");
		$target.removeClass("bilingual english hebrew sideBySide heLeft heRight stacked");
		$("#overrideLayoutModal, #overlay").hide();
		autoSave();
		Sefaria.track.sheets("Reset Source Layout to Default");
	});

	// Add All Connections
    function SortBySourceRef(x,y) {
		  if (x.collectiveTitle['en'] < y.collectiveTitle['en']) return -1;
		  if (x.collectiveTitle['en'] > y.collectiveTitle['en']) return 1;
		  if (x.anchorVerse < y.anchorVerse) return -1;
		  if (x.anchorVerse > y.anchorVerse) return 1;
		  if (x.commentaryNum < y.commentaryNum) return -1;
		  if (x.commentaryNum > y.commentaryNum) return 1;
		  return 0;
    }

	var autoAddConnetions =  function() {
		var ref = $(this).parents(".source").attr("data-ref");
		var $target = $($(this).closest(".source")).eq(0);

		var type = $(this).hasClass("addCommentary") ? "Commentary": null;

		sjs.alert.saving("Looking up Connections...");

		$.getJSON("/api/texts/" + ref + "?context=0&pad=0", function(data) {
			sjs.alert.clear();
			if ("error" in data) {
				sjs.alert.message(data.error)
			} else if (data.commentary.length == 0) {
				sjs.alert.message("No connections known for this source.");
			} else {
                data.commentary = [].concat.apply([], data.commentary);

				data.commentary = data.commentary.sort(SortBySourceRef);

				var categorySum = {}
				for (var i = 0; i < data.commentary.length; i++) {
					var c = data.commentary[i];
					if (categorySum[c.collectiveTitle['en']]) {
						categorySum[c.collectiveTitle['en']]++;
					} else {
						categorySum[c.collectiveTitle['en']] = 1;
					}
				}
				var categories = [];
				for(var k in categorySum) { categories.push(k); }
				categories.sort();

				var labels = [];
				for(var k in categorySum) { labels.push(k + " (" + categorySum[k] + ")"); }
				labels.sort();

				sjs.alert.multi({message: "Add all connections from:",
									values: categories,
									labels: labels,
									default: false
								},
				 function(categoriesToAdd) {
					var count = 0;
					for (var i = 0; i < data.commentary.length; i++) {
						var c = data.commentary[i];
						if ($.inArray(c.collectiveTitle['en'], categoriesToAdd) == -1) {
							continue;
						}
						var source = {
							ref:   c.sourceRef,
							heRef: c.sourceHeRef,
							text: {
								en: c.text,
								he: c.he
							}
						};
						buildSource($target, source, "insert");
						count++;
					}
					var msg = count == 1 ? "1 Source Added." : count + " Sources Added.";
					sjs.alert.message(msg);
					autoSave();
				});


			}
		});
	};
	$(".addConnections").on("click", autoAddConnetions);


	// ---- Start Polling -----
	startPollingIfNeeded();


	// ------ Prompting to Publish -------------
	if (sjs.is_owner) {
		$("#publishPromptModal .publish").click(function(){
			$("#publishPromptModal #prompt").hide();
			$("#publishPromptModal #published").show();
			sjs.current.promptedToPublish = Date();
			$("#sourceSheetShareSelect").val('public');
			autoSave();
			Sefaria.track.sheets("Publish Prompt Accept");
		});
		$("#publishPromptModal .later").click(function(){
			$("#publishPromptModal #prompt").hide();
			$("#publishPromptModal #notPublished").show();
			sjs.current.promptedToPublish = Date();
			Sefaria.track.sheets("Publish Prompt Decline");

		});
		$("#publishPromptModal .ok").click(function(){
			$("#publishPromptModal, #overlay").hide();
			autoSave();
		});

		// For Sheets that were public before the publish prompt existed
		// (or are published without being prompted), mark them as though they had
		// already been prompted -- to avoid reprompting annoyingly if they make the sheet
		// private again.
		if (!sjs.current.promptedToPublish && sjs.current.status in {"public":true}) {
			sjs.current.promptedToPublish = Date();
		}

		promptToPublish();
	}

	// ------ Check fragment identifier for state re-init'ing -------------
	var fragIdent = (function(hash) {
		hash = hash.substring(hash.indexOf('#') + 1);

		if (hash.length === 0)
			return {};

		var fragments = hash.split('&');

		var obj = {};
		for (var i = 0; i < fragments.length; i++) {
			var keyVal = fragments[i].split('=');
			obj[keyVal[0]] = keyVal[1];
		}
		return obj;
	}(window.location.hash));

	switch (fragIdent.onload) {
		case "exportToDrive":
			exportToDrive();
			break;
	}

	// fix for touchscreens to access hover elements (in particular menubar)
    $('*').on('touchstart', function () {
		$(this).trigger('hover');
	}).on('touchend', function () {
		$(this).trigger('hover');
	});

// fix for menu/edit bar jumping on iOS when keyboard loads. A bit of a jerky effect but the best that seems possible now. There's definitely a way to optimize this more.
if( navigator.userAgent.match(/iPhone|iPad|iPod/i) ) {
	function updateSheetsEditNavTopPosOnScroll() {
		$('.sheetsEditNavTop').css('marginTop', $(window).scrollTop()-54 + 'px');
	}

	$(document)
		.on('focus', '.cke_editable_inline', function(e) {
			// Position sheetsEditNavTop absolute and bump it down to the scrollPosition
			$('.sheetsEditNavTop').css({
				marginTop: $(window).scrollTop()-54 + 'px'
			});
			$(document).scroll(updateSheetsEditNavTopPosOnScroll);
		})
		.on('touchstart', '*:not(.cke_editable_inline)', function(e) {
			if ($(".cke_editable").length == 0) {
				$('.sheetsEditNavTop').css({
					position: 'fixed',
					top: '54px',
					marginTop: 0
				});
				$(document).off('scroll', updateSheetsEditNavTopPosOnScroll);
			}
		});
}


}); // ------------------ End DOM Ready  ------------------


sjs.sheetTagger = {
	init: function() {
		$("#tags").tagit({ allowSpaces: true });
		$("#suggestedTags").on('click', '.tagButton', function() {
			$("#tags").tagit("createTag",$(this).text());
			$(this).hide();
		});
		const dropdownAnchorSide = "left";
		$("#addTag")
		.keydown(function(e) {
			if (e.shiftKey && (e.keyCode == 50 || e.keyCode == 51)) {
				// Don't allow # or @ in tags
				return false;
			}
			if (e.keyCode == 13 || e.key == ",") {
				// Let enter or , trigger enter
				sjs.sheetTagger.addTagFromInput($("#addTag").val());
				return false;
			}
		})
		.autocomplete({
			source: function(request, response) {
			Sefaria.getName(request.term, false, 0)
				.then(function(d) {
					var topics = [];
					d.completion_objects.map(function(obj) {
						if (obj.type == "Topic") {
							topics.push(obj.title);
							if (!(obj.title in sjs.sheetTagger.tagSlugs)) {
								// Cache slug / title pair, but don't overwrite so more popular slug is kept in case of collision
								sjs.sheetTagger.tagSlugs[obj.title] = obj.key;
							}
						}
					});
					return topics;
				})
				.then(response);
			},
			position: {my: dropdownAnchorSide + " top", at: dropdownAnchorSide + " bottom"},
			select: function(event, ui) {
				sjs.sheetTagger.addTagFromInput(ui.item.value);
				return false;
			},
			focus: ( event, ui ) => {
                $(".ui-menu-item.ui-state-focus").removeClass("ui-state-focus");
                $("a.ui-state-focus").parent().addClass("ui-state-focus");
            },
			minLength: 3
		});
	},
	tags: function() {
		return sjs.tagitTags("#tags");
	},
	topics: function() {
		return sjs.sheetTagger.tags().map(function(tag){
			return {
				slug: sjs.sheetTagger.tagSlugs[tag],
				asTyped: tag
			};
		})
	},
	setTags: function(topics) {
		$("#tags").tagit("removeAll");
		if (topics && topics.length) {
			for (var i=0; i < topics.length; i++) {
				sjs.sheetTagger.tagSlugs[topics[i].asTyped] = topics[i].slug;
				$("#tags").tagit("createTag", topics[i].asTyped);
			}
		}
		var html = "";
		for (var i = 0; i < topics.length; i++) {
			html = html + '<a class="button" role="button" href="/topics/'+topics[i].slug+'">'+topics[i].asTyped+'</a>';
	    }
		$("#sheetTags").html(html);
	},
	addTagFromInput: function(tag) {
		$("#tags").tagit("createTag", tag);
		$("#addTag").val("").autocomplete("close");
	},
	suggestTags: function() {
		var suggestedTagsLookup = [];
		var sources = readSources($("#sources"));
		for (var i = 0; i < sources.length; i++) {
			if (sources[i].ref) {
				suggestedTagsLookup.push(sources[i].ref);
			}
		}

		if (suggestedTagsLookup.length) {
			$.getJSON("/api/recommend/topics/" + suggestedTagsLookup.join("+"), function(data) {
				var suggestedTags = [];
				$("#suggestedTags").html('');
				for (var i = 0; i < data.topics.length; i++) {
					Object.keys(data.topics[i].titles).map(function(lang) {
						sjs.sheetTagger.tagSlugs[data.topics[i]["titles"][lang]] = data.topics[i].slug;
					});
					if (data.topics[i]["count"] > 1 ) { // only suggest tag if it has more than one topic link
						suggestedTags.push(data.topics[i]["titles"][sjs.interfaceLang]);
					}
				}
				suggestedTags = suggestedTags.filter(function(tag) { return sjs.sheetTagger.tags().indexOf(tag) == -1});
				suggestedTags = suggestedTags.slice(0,3);
				var placeholderText = sjs.interfaceLang == "he" ? "הוספת תיוגים... כמו " : "Add Tags... like ";
				if (suggestedTags.length) {
					placeholderText += '"' + suggestedTags.join('", "') + '".';
				}
				$("#addTag").attr("placeholder", placeholderText);
			});
		}
	},
	tagSlugs: {} /* cache mapping typed tags to their slugs */
};


function addSource(q, source, appendOrInsert, $target) {
	// Add a new source to the DOM.
	// Completed by loadSource on return of AJAX call.
	// unless 'source' is present, then load with given text.
	appendOrInsert = typeof appendOrInsert !== 'undefined' ? appendOrInsert : 'append';

	var badRef = q.ref == undefined;
	var $listTarget = $target || $("#sources");

	if ($listTarget.length == 0) appendOrInsert = "append";

	if ($listTarget.hasClass('sheetItem') ) {
		appendOrInsert = "insert";
	}


	// Save a last edit record only if this is a user action,
	// not while loading a sheet
	if (!sjs.loading) {
		sjs.lastEdit = {
			type: "add source",
			ref: humanRef(q.ref),
			parent: $listTarget.hasClass("subsources") ? $listTarget.closest(".source").attr("data-node") : null
		};
	}

	var addedByMe = (source && source.addedBy && source.addedBy == Sefaria._uid) ||
					(!source && sjs.can_add);

	var attributionLink = (source && "userLink" in source ?
		"<div class='addedBy'>" +
			"<span class='int-en'>Added by </span><span class='int-he'> נוסף בידי</span>"
			+ source.userLink +
		"</div>"
		:
		addedByMe && !source ?
			"<div class='addedBy'>" +
			"<span class='int-en'>Added by </span><span class='int-he'> נוסף בידי</span>"
			+ sjs._userLink +
			"</div>"
			:
			""
	);

	if (source && "node" in source) {
		var node = source.node;
	} else {
		var node = sjs.current.nextNode;
		sjs.current.nextNode++;
	}

	var attributionData = attributionDataString((source ? source.addedBy : null), !source, "source");

	var enRef = badRef == true ? source.ref : humanRef(q.ref);
	var heRef = source && source.text ? source.heRef : "";

	var refLink = badRef == true ? "#" : "/"+makeRef(q).replace(/'/g, "&apos;");

	var additionalRefData = ""

	if (source && ("options" in source) && ("sourcePrefix" in source["options"]) && (source["options"]["sourcePrefix"] != "")) {
		additionalRefData = additionalRefData + " data-sourceprefix='"+source["options"]["sourcePrefix"]+"'";
	}
	if ((source && ("options" in source) && "PrependRefWithEn" in source["options"]) && (source["options"]["PrependRefWithEn"] != "")) {
		additionalRefData = additionalRefData + " data-prependrefwithen='"+source["options"]["PrependRefWithEn"]+"'";
	}
	if ((source && ("options" in source) && "PrependRefWithHe" in source["options"]) && (source["options"]["PrependRefWithHe"] != "")) {
		additionalRefData = additionalRefData + " data-prependrefwithhe='"+source["options"]["PrependRefWithHe"]+"'";
	}

	var newsource = "<li " + attributionData + "data-ref='" + enRef.replace(/'/g, "&apos;") + "'" + " data-heRef='" + heRef.replace(/'/g, "&apos;") + "'" + " data-node='" + node + "'"+additionalRefData+">"
		+"<div class='sourceNumber he'></div><div class='sourceNumber en'></div>"
		+"<div class='customTitle'></div>"
		+"<div class='he'>" +
		"<span class='title'>"
		+"<a class='he' href='" + refLink + "' target='_blank'><span class='ref'></span>" + heRef.replace(/\d+(\-\d+)?/g, "").replace(/([0-9][b|a]| ב| א):.+/,"$1") + " </a>" + "</span>" +"<div class='text'>" +"<div class='he'>" + (source && source.text ? source.text.he : "") + "</div>" +"</div>" + "<div class='highlighter'><div class='he'></div></div>" + "</div>" + "<div class='en'>" +"<span class='title'>" +"<a class='en' href='" + refLink + "' target='_blank'><span class='ref'>" + enRef.replace(/([0-9][b|a]| ב| א):.+/,"$1") + "</span> </a>" +"</span>" +"<div class='text'>" +"<div class='en'>" + (source && source.text ? source.text.en : "") + "</div>" + "</div>" + "<div class='highlighter'><div class='en'></div></div>" +"</div>" + "<div class='clear'></div>" + attributionLink + appendInlineAddButton() + "</li>";

	if (appendOrInsert == "append") {
		$("#sources").append(newsource);
		var $target = $(".source", $("#sources")).last();
	}

	else if (appendOrInsert == "insert") {
		$listTarget.after(newsource);
		var $target = $listTarget.next(".sheetItem");
	}

	setSourceNumbers();
	if (source && source.text) {
		return;
	}

	var loadClosure = function(data) {
		loadSource(data, $target);
	};
	var getStr = "/api/texts/" + makeRef(q) + "?commentary=0&context=0&pad=0";
	$.getJSON(getStr, loadClosure);
	sjs.openRequests += 1;

	afterAction();

	if (sjs.can_edit) {
		// Bind init of CKEditor to mouseup, so dragging can start first
		$("#title, .comment, .outside, .customTitle, .text .en, .text .he, #author, .contentToAdd").off("mouseup")
			.on("mouseup", sjs.initCKEditor);
	}
	else if (sjs.can_add) {
		// For colloborative adders, only allow edits on their on content
		$(".addedByMe .comment, .addedByMe  .outside, .addedByMe .customTitle, .addedByMe .text .en, .addedByMe .text .he, .contentToAdd").off("mouseup")
			.on("mouseup", sjs.initCKEditor);
	}
}


function placed_segment_mapper(lang, segmented, includeNumbers, s) {
    if (!s[lang]) {return ""}

    var numStr = "";
    if (includeNumbers) {
        var num = (lang=="he") ? encodeHebrewNumeral(s.number) : s.number;
        numStr = "<small>(" + num + ")</small> ";
    }
    var str = "<span class='segment'>" + numStr + s[lang] + "</span> ";
    if (segmented) {
        str = "<p>" + str + "</p>";
    }
    return str;
}

function removeFootnotes(str) {
	//removes all i tags that are of class "footnote" as well as the preceding "sup" tag
	var $str = $("<span>" + str + "</span>");
	$str.find( "i[class='footnote']" ).each(function( index ) {
		if ($(this).prev().is("sup")) {
			$(this).prev().remove();
		}
  		$(this).remove();
	});

	return $str.html();
}


function loadSource(data, $target, optionStr) {

	sjs.openRequests -= 1;

	if (data.error) {
		$("#error").html(data.error);
		$target.remove();
		return;
	}

	$target.attr("data-ref", data.ref);
	$target.attr("data-heRef", data.heRef);
	var $enTitle = $target.find(".en .title a").eq(0);
	var $heTitle = $target.find(".he .title a").eq(0);
	$enTitle.html(humanRef(data.ref).replace(/([0-9][b|a]| ב| א):.+/,"$1") ).attr("href", "/" + normRef(data.ref));
	$heTitle.html(data.heRef.replace(/\d+(\-\d+)?/g, "").replace(/([0-9][b|a]| ב| א):.+/,"$1")).attr("href", "/" + normRef(data.ref));

    var includeNumbers = $.inArray("Talmud", data.categories) == -1;
    includeNumbers = data.indexTitle === "Pesach Haggadah" ? false : includeNumbers;
    var segmented = !(data.categories[0] in {"Tanakh": 1, "Talmud": 1});

    var segments = Sefaria.makeSegments(data);
	segments = Sefaria.stripImagesFromSegments(segments);
    var enStr = segments.map(placed_segment_mapper.bind(this, "en", segmented, includeNumbers))
        .filter(Boolean)
        .join("");
    var heStr = segments.map(placed_segment_mapper.bind(this, "he", segmented, includeNumbers))
        .filter(Boolean)
        .join("");

    heStr = removeFootnotes(heStr);
    enStr = removeFootnotes(enStr);

	enStr = enStr || "...";
	heStr = heStr || "...";

	// Populate the text, honoring options to only load Hebrew or English if present
	optionStr = optionStr || null;
	if (optionStr !== "Hebrew") {
		enStr = substituteDivineNames(enStr);
		$target.find(".text .en").first().html(enStr);
	}
	if (optionStr !== "English") {
		heStr = substituteDivineNames(heStr);
		$target.find(".text .he").first().html(heStr);
	}

	if (sjs.openRequests == 0) {
		var top = $target.offset().top - 200;
		$("html, body").animate({scrollTop: top}, 300);
	}

	if ($("#sheet").hasClass("highlightMode")) { fillEmptyHighlighterSegments() }

	autoSave();
}

function setSourceNumbers() {
	$("#sources > .sheetItem").each(function(index, value) {
		index += 1;
		$(this).find(".sourceNumber.en").html(index + ".");
		$(this).find(".sourceNumber.he").html(encodeHebrewNumeral(index) + ".");
	});
}


function readSheet() {
	// Create a JS Object representing the sheet as it stands in the DOM
	// One day I will get my truth out of the DOM.
	var sheet = {};
	if (sjs.current.id) {
		sheet.id = sjs.current.id;
		sheet.lastModified = sjs.current.dateModified;
		sheet.promptedToPublish = sjs.current.promptedToPublish || false;
	}

	sheet.title    = $("#title").html();
	sheet.sources  = readSources($("#sources"));
	sheet.options  = {};
	sheet.status   = "unlisted";
	sheet.nextNode = sjs.current.nextNode;
	sheet.topics   = sjs.sheetTagger.topics();
	sheet.summary  = $("#sheetSummaryInput").val();

	if ($("#author").hasClass("custom")) {
		sheet.attribution = $("#author").html();
	}

	if (sjs.assignment_id) sheet.assignment_id = sjs.assignment_id;
	if (sjs.assigner_id) sheet.assigner_id = sjs.assigner_id;

	if (sjs.can_add) {
		// Adders can't change saved options
		sheet.options = sjs.current.options;

	} else {
		sheet.options.numbered      = $("#sheet").hasClass("numbered") ? 1 : 0;
		sheet.options.boxed         = $("#sheet").hasClass("boxed") ? 1 : 0;
		sheet.options.assignable    = $("#sheet").hasClass("assignable") ? 1 : 0;
		sheet.options.bsd           = $("#sheet").hasClass("bsd") ? 1 : 0;
		sheet.options.language      = $("#sheet").hasClass("hebrew") ? "hebrew" : $("#sheet").hasClass("bilingual") ? "bilingual" : "english";
		sheet.options.layout        = $("#sheet").hasClass("stacked") ? "stacked" : "sideBySide";
		sheet.options.langLayout    = $("#sheet").hasClass("heLeft") ? "heLeft" : "heRight";
		sheet.options.divineNames   = $(".divineNamesOption .fa-check").not(".hidden").parent().attr("id");
		sheet.options.highlightMode = $("#sheet").hasClass("highlightMode") ? 1 : 0;
	}

	if (sjs.is_owner) {

		sheet["status"] = $("#sheetPublicToggle").is(':checked') ? "public" : "unlisted";

		if (sjs.current.status == "unlisted" && sheet["status"] == "public" ) {
				Sefaria.track.sheets("Sheet Published");
		}

		switch ($("#sourceSheetShareSelect").val()) {
			case 'view':
				sheet.options.collaboration = "none";
				break;
			case 'add':
				sheet.options.collaboration = "anyone-can-add";
				break;
			case 'edit':
				sheet.options.collaboration = "anyone-can-edit";
				break;
		}

		if ($(".sheetHighlighterTags").first().children()) {
			sheet.highlighterTags = [];
			$(".sheetHighlighterTags").first().children().each(function( i ) {
				sheet.highlighterTags[i] = {};
				var currentName = $(this).find('.tagName').text();
				var currentColor = $(this).find('.colorSwatch').css('background-color');
				sheet.highlighterTags[i].name = currentName;
				sheet.highlighterTags[i].color = currentColor;

			});
		}
	}

	else {
		sheet.options.collaboration = sjs.current.options.collaboration;
		sheet["status"] = sjs.current.status;
	}


	if (!sjs.is_owner) {
		// Only allow owner to change displayedCollection
		sheet["displayedCollection"] = sjs.current.displayedCollection;
	}
    else {
		var displayedCollection = $("#sourceSheetGroupSelect").val() || null;
		sheet["displayedCollection"] = displayedCollection;
	}


	return sheet;
} // end readSheet


function readSources($target) {
	// Returns an array of objects representing sources found in $target
	// Used recursively to read sub-sources
	var sources = [];
	$target.children().each(function() {
		if ($(this).hasClass("addInterface")) { return; }
		var source = readSource($(this));
		sources.push(source);
	});
	return sources;
}


function readSource($target) {
	// Returns an object representing the source in $target
	var source = {};
	if ($target.hasClass("source")) {
		source["ref"] = $target.attr("data-ref");
		source["heRef"] = $target.attr("data-heRef");
		source["text"] = {en: $target.find(".text").find(".en").html(),
						  he: $target.find(".text").find(".he").html()};

		if ($target.find(".highlighter").find(".en").html() != "" || $target.find(".highlighter").find(".he").html() != "") {
			source["highlighter"] = {en: [], he: []};
			$target.find(".highlighter").find(".en").find(".highlighterSegment").each(function(i){

				source.highlighter.en[i] = {};
				var currenttext = $(this).text();
				var currenttag = $(this).attr('data-tag');


				source.highlighter.en[i].text = currenttext;
				source.highlighter.en[i].tag = currenttag;
			});

			$target.find(".highlighter").find(".he").find(".highlighterSegment").each(function(i){
				source.highlighter.he[i] = {};
				var currenttext = $(this).text();
				var currenttag = $(this).attr('data-tag');
				source.highlighter.he[i].text = currenttext;
				source.highlighter.he[i].tag = currenttag;
			});
		}
		//Set source layout
		if ($target.hasClass("stacked")) {
			var sourceLayout = "stacked"
		} else if ($target.hasClass("sideBySide")) {
			var sourceLayout = "sideBySide"
		} else {
			var sourceLayout = ""
		}


		//Set source language layout
		if ($target.hasClass("heLeft")) {
			var sourceLangLayout = "heLeft"
		} else if ($target.hasClass("heRight")) {
			var sourceLangLayout = "heRight"
		} else {
			var sourceLangLayout = ""
		}


		//Set source language
		if ($target.hasClass("bilingual")) {
			var sourceLanguage = "bilingual"
		} else if ($target.hasClass("hebrew")) {
			var sourceLanguage = "hebrew"
		} else if ($target.hasClass("english")) {
			var sourceLanguage = "english"
		} else {
			var sourceLanguage = ""
		}

		//Set source indentation level
		if ($target.hasClass("indented-1")) {
			var sourceIndentLevel = "indented-1"
		} else if ($target.hasClass("indented-2")) {
			var sourceIndentLevel = "indented-2"
		} else if ($target.hasClass("indented-3")) {
			var sourceIndentLevel = "indented-3"
		} else {
			var sourceIndentLevel ="";
		}

		source["options"] = {
							 sourceLanguage: sourceLanguage,
							 sourceLayout: sourceLayout,
							 sourceLangLayout: sourceLangLayout,
							 indented: sourceIndentLevel,
							 PrependRefWithEn: $target.attr("data-prependrefwithen") ? $target.attr("data-prependrefwithen") : "",
							 PrependRefWithHe: $target.attr("data-prependrefwithhe") ? $target.attr("data-prependrefwithhe") : "",
							 sourcePrefix: $target.attr("data-sourceprefix") ? $target.attr("data-sourceprefix") : "",
		};


		var title = $(".customTitle", $target).eq(0).html();
		if (title) {
			source["title"] = title;
		}
	} else if ($target.hasClass("commentWrapper")) {
		source["comment"] = $target.find(".comment").html();

		//Set comment indentation level
		if ($target.hasClass("indented-1")) {
			var sourceIndentLevel = "indented-1"
		} else if ($target.hasClass("indented-2")) {
			var sourceIndentLevel = "indented-2"
		} else if ($target.hasClass("indented-3")) {
			var sourceIndentLevel = "indented-3"
		} else {
			var sourceIndentLevel ="";
		}

		source["options"] = {
							 indented: sourceIndentLevel,
							 sourcePrefix: $target.attr("data-sourceprefix") ? $target.attr("data-sourceprefix") : "",
		};
	} else if ($target.hasClass("outsideBiWrapper")) {
		source["outsideBiText"] = {
			en: $target.find(".text .en").html(),
			he: $target.find(".text .he").html()
		};
		//Set indentation level
		if ($target.hasClass("indented-1")) {
			var sourceIndentLevel = "indented-1"
		} else if ($target.hasClass("indented-2")) {
			var sourceIndentLevel = "indented-2"
		} else if ($target.hasClass("indented-3")) {
			var sourceIndentLevel = "indented-3"
		} else {
			var sourceIndentLevel ="";
		}

		source["options"] = {
							 indented: sourceIndentLevel,
							 sourcePrefix: $target.attr("data-sourceprefix") ? $target.attr("data-sourceprefix") : "",
		};

	} else if ($target.hasClass("outsideWrapper")) {
		source["outsideText"] = $target.find(".outside").html();

		//Set indentation level
		if ($target.hasClass("indented-1")) {
			var sourceIndentLevel = "indented-1"
		} else if ($target.hasClass("indented-2")) {
			var sourceIndentLevel = "indented-2"
		} else if ($target.hasClass("indented-3")) {
			var sourceIndentLevel = "indented-3"
		} else {
			var sourceIndentLevel ="";
		}

		source["options"] = {
							 indented: sourceIndentLevel,
							 sourcePrefix: $target.attr("data-sourceprefix") ? $target.attr("data-sourceprefix") : "",
		};
	}

	 else if ($target.hasClass("mediaWrapper")) {
		source["media"] = $target.find(".media iframe, .media img, .media audio").attr("src");

		//Set indentation level
		if ($target.hasClass("indented-1")) {
			var sourceIndentLevel = "indented-1"
		} else if ($target.hasClass("indented-2")) {
			var sourceIndentLevel = "indented-2"
		} else if ($target.hasClass("indented-3")) {
			var sourceIndentLevel = "indented-3"
		} else {
			var sourceIndentLevel ="";
		}

		source["options"] = {
            indented: sourceIndentLevel,
        	sourcePrefix: $target.attr("data-sourceprefix") ? $target.attr("data-sourceprefix") : "",
		};

		if ($target.find(".mediaCaption").length) {
			source["caption"] = {
				"en": $target.find(".mediaCaption .en").html(),
				"he": $target.find(".mediaCaption .he").html()
			}
		}
	}

	// Add attributions info if present
	var addedBy = $target.attr("data-added-by");
	if (addedBy) {
		source["addedBy"] = parseInt(addedBy);
	}
	source.node = parseInt($target.attr("data-node"));
	return source;
} // end readSource


function validateSheet(sheet) {
	// Srsly!
}


function handleSave() {
	if (!Sefaria._uid) {
		Sefaria.track.sheets("Logged out Save Attempt");
		return alert("Sorry I can't save what you've got here: you need to be signed in to save.");
	}
	sjs.loading = false;
	$("#save").data("mode", "saving").find("#inSave").show().siblings().hide();

	var sheet = readSheet();
	saveSheet(sheet, true);
	Sefaria.track.sheets("Save New Sheet");
}


function autoSave() {
	if (sjs.can_save && sjs.current.id && !sjs.loading && !sjs.openRequests) {
		$("#lastSaved").find(".saving").show().siblings().hide();
		var sheet = readSheet();
		saveSheet(sheet);
	} else if (sjs.can_save && !sjs.current.id && !sjs.promptedToSave) {
		var sheet = readSheet();
		if (sheet.sources.length > 2) {
			setTimeout(function() {
				var save = confirm(_("Would you like to save this sheet? You only need to save once, after that changes are saved automatically."));
				if (save) {
					handleSave();
				}
				sjs.promptedToSave = true;
			}, 500);
		}
	}
}


function saveSheet(sheet, reload) {
 	stopPolling();
 	var postJSON = JSON.stringify(sheet);
	$.post("/api/sheets/", {"json": postJSON}, function(data) {
		if (data.error && data.rebuild) {
			rebuildUpdatedSheet(data);
			return;
		} else if (data.id) {
			if (reload) {
				window.location = "/sheets/" + data.id+"?editor=1";
			}
			sjs.current = data;
			sjs.lastEdit = null;    // save was succesful, won't need to replay
			sjs.sheetTagger.setTags(data.topics);
			startPollingIfNeeded(); // Start or stop polling if collab/group status has changed
			promptToPublish();      // If conditions are right, prompt to publish
			var $lastSaved = $("#lastSaved");
			$lastSaved.find(".lastSavedConfirmed").show().siblings().hide();
		}

		if (!!data.error) {
			sjs.alert.flash(data.error);
			$("#save").data("mode", "editing").find("#doSave").show().siblings().hide();
			if (data.errorAction === 'loginRedirect') {
				// redirect to login page
				window.location.href = "/login?next=/sheets/" + sjs.current.id + "?editor=1";
			}
		}
	})
}


function buildSheet(data){
	if (data.error && !data.rebuild) {
		alert(data.error);
		return;
	}

	sjs.loading = true;

	if (data.title) {
		$("#title").html(data.title);
		if (isHebrew(data.title.stripHtml())) {
			$("#title").addClass("heTitle");
		}
	} else {
		$("#title").html(_("Untitled Source Sheet"));
	}
	$("#sources").css("min-height",($("#sources").css("height"))); //To prevent 'jumping' as the sheet is rebuilt when polling is triggered we temporarily set the min-height, and remove it at the end of the function.

	$("#sources").empty();

	// Set options with binary value
	$("#sheet").removeClass("numbered bsd boxed assignable");
	$("#numbered, #bsd, #boxed, #assignable").find(".fa-check").addClass("hidden");
	if (data.options.numbered) { $("#numbered").trigger("click"); }
	if (data.options.bsd)      { $("#bsd").trigger("click"); }
	if (data.options.boxed)    { $("#boxed").trigger("click"); }
	if (data.options.highlightMode)    { $("#highlightToggle").trigger("click"); }
	if (data.options.assignable)    { $("#makeSheetAssignableButton").trigger("click"); }
	else {$("#StopCollectingAssignmentsButton").trigger("click");}


	// Set options that always have a value
	$("#" + data.options.layout).trigger("click");
	$("#" + data.options.language).trigger("click");
	$("#" + data.options.divineNames).trigger("click");

	$("#sheetLayoutLanguageMenuItems .sideBySideToggleOption ." + data.options.langLayout).trigger("click");
	$("#sheetLayoutLanguageMenuItems .layoutToggleOption ." + data.options.layout).trigger("click");
	$("#sheetLayoutLanguageMenuItems .languageToggleOption ." + data.options.language).trigger("click");



	// Set Options that may not have value yet
	if (!("langLayout" in data.options)) { data.options.langLayout = "heRight"}
	$("#" + data.options.langLayout).trigger("click");

	if (!("collaboration" in data.options)) { data.options.collaboration = "none"}

	if (data.options.collaboration == "none")                 $("#sourceSheetShareSelect").val('view');
	else if (data.options.collaboration == "anyone-can-add")  $("#sourceSheetShareSelect").val('add');
	else if (data.options.collaboration == "anyone-can-edit") $("#sourceSheetShareSelect").val('edit');

	if (data.status == "public") { $('#sheetPublicToggle').attr('checked', true); }
	else { $('#sheetPublicToggle').attr('checked', false); }

	// Set Sheet Group
	if (data.displayedCollection) {
		$("#sourceSheetGroupSelect").val(data.displayedCollection);
		var $el = $("#sourceSheetGroupSelect option:selected");
		var collectionImage = $el.attr("data-image");
		$("#collectionHeader").attr("src", collectionImage);
		if (collectionImage) {$("#sheetHeader").show();} else { $("#sheetHeader").hide();}
	}

	if (sjs.is_owner) {
		$("#sourceSheetGroupOptions").show();
	} else {
		$("#sourceSheetGroupOptions").hide();
	}

	sjs.sheetTagger.setTags(data.topics);

	buildSources($("#sources"), data.sources);
	setSourceNumbers();
	$("#viewButtons").show();
	sjs.current = data;
	sjs.loading = false;

	$("#sources").css("min-height","");

	if ("highlighterTags" in data) {
		$(".sheetHighlighterTags").empty();
		for (var i = 0; i < data.highlighterTags.length; i++) {
			$(".sheetHighlighterTags").append('<div class="splitHighlighterSegment" data-tagname="'+data.highlighterTags[i].name+'"><div class="colorSwatch active" style="background-color: '+data.highlighterTags[i].color+'"></div>'
						+"<div class='colorSwatch' style='background-color: #bd9eb6'></div>"
						+"<div class='colorSwatch' style='background-color: #afcab8'></div>"
						+"<div class='colorSwatch' style='background-color: #e5dabd'></div>"
						+"<div class='colorSwatch' style='background-color: #bd9796'></div>"
						+"<div class='colorSwatch' style='background-color: #a4b7de'></div>"
						+"<div class='colorSwatch' style='background-color: #e8dde5'></div>"
						+"<div class='colorSwatch' style='background-color: #d2ddc9'></div>"
				+'<div class="tagName">'+data.highlighterTags[i].name+'</div><div class="editCheckToggle">✎</div></div>');
			$(".highlighterFilterTags").append('<div class="optionItem highlightFilterSelection"><input type="checkbox" name="highlighterFilterTags" id="'+data.highlighterTags[i].name+'_highlighterTag" value="'+data.highlighterTags[i].name+'" checked="checked"> <label for="'+ data.highlighterTags[i].name +'_highlighterTag" style="background-color: '+data.highlighterTags[i].color+'">'+data.highlighterTags[i].name+'</label></div>');
		}
	}
}


function buildSources($target, sources) {
	// Recursive function to build sources into target
	for (var i = 0; i < sources.length; i++) {
		buildSource($target, sources[i]);
	}
}


function buildSource($target, source, appendOrInsert) {
	appendOrInsert = typeof appendOrInsert !== 'undefined' ? appendOrInsert : 'append';

	// Build a single source in $target. May call buildSources recursively if sub-sources present.

	if (!("node" in source)) {
		source.node = sjs.current.nextNode;
		sjs.current.nextNode++;
	}

	else if (source.node == null) {
		source.node = sjs.current.nextNode;
		sjs.current.nextNode++;
	}

	if (("ref" in source) && (source.ref != null)  ) {
		var q = parseRef(source.ref);
		addSource(q, source, appendOrInsert, $target);

		if ("options" in source) {
			$(".sheetItem").last().addClass(source.options.sourceLayout+" "+source.options.sourceLanguage+" "+source.options.sourceLangLayout+" "+source.options.indented)
		}

		if (source.title) {
			$(".customTitle").last().html(source.title).css('display', 'inline-block');
			$(".sheetItem").last().addClass("hasCustom");
		}

		if (source.highlighter) {
			var enHighlighterHTML = '';
			var heHighlighterHTML = '';
			for (var i = 0; i < source.highlighter.en.length; i++) {
				var highlighterTagHTML = source.highlighter.en[i].tag ? ' data-tag="'+ source.highlighter.en[i].tag +'" ': '';
				var highlighterTagColorHTML = '';
				if (highlighterTagHTML != '') {
					var highlighterTagColor = sjs.current.highlighterTags.filter(function(tag) { return source.highlighter.en[i].tag == tag.name; })[0].color;
					highlighterTagColorHTML = 'style="background-color: '+highlighterTagColor+'"';
				}


				enHighlighterHTML = enHighlighterHTML + '<div class="highlighterSegment" '+ highlighterTagColorHTML + highlighterTagHTML  +'>'+source.highlighter.en[i].text+'</div>'
			}

			for (var i = 0; i < source.highlighter.he.length; i++) {
				var highlighterTagHTML = source.highlighter.he[i].tag ? ' data-tag="'+ source.highlighter.he[i].tag +'" ': '';
				var highlighterTagColorHTML = '';
				if (highlighterTagHTML != '') {
					var highlighterTagColor = sjs.current.highlighterTags.filter(function(tag) { return source.highlighter.he[i].tag == tag.name; })[0].color;
					highlighterTagColorHTML = 'style="background-color: '+highlighterTagColor+'"';
				}


				heHighlighterHTML = heHighlighterHTML + '<div class="highlighterSegment" '+ highlighterTagColorHTML + highlighterTagHTML  +'>'+source.highlighter.he[i].text+'</div>'
			}

			$(".highlighter .en").last().html(enHighlighterHTML);
			$(".highlighter .he").last().html(heHighlighterHTML);
		}


	} else if ("comment" in source) {
		var attributionData = attributionDataString(source.addedBy, source.isNew, "commentWrapper");

		additionalRefData = "";
		if (source && ("options" in source) && ("sourcePrefix" in source["options"]) && (source["options"]["sourcePrefix"] != "")) {
			additionalRefData = additionalRefData + " data-sourceprefix='"+source["options"]["sourcePrefix"]+"'";
		}

		var commentHtml = "<div " + attributionData + " data-node='" + source.node + "'" + additionalRefData + ">" +
			"<div class='sourceNumber he'></div><div class='sourceNumber en'></div>" +
			"<span class='commentIcon'><i class='fa fa-comment-o fa'></i></span>" +
			("userLink" in source ? "<div class='addedBy s2AddedBy'>" + source.userLink + "</div>" : "")	+
			"<div class='comment " + (isHebrew(source.comment) ? "he " : "") + (sjs.loading ? "" : "new") + " '>" + source.comment + "</div>" +
			appendInlineAddButton() + "</div>";

		if (appendOrInsert == "append") {
			$target.append(commentHtml);
		}
		else if (appendOrInsert == "insert") {
			$target.after(commentHtml);
		}
		if ("options" in source) {
			$(".sheetItem").last().addClass(source.options.indented);
		}
	} else if ("outsideBiText" in source) {
		additionalRefData = "";
		if (source && ("options" in source) && ("sourcePrefix" in source["options"]) && (source["options"]["sourcePrefix"] != "")) {
			additionalRefData = additionalRefData + " data-sourceprefix='"+source["options"]["sourcePrefix"]+"'";
		}
		var attributionData = attributionDataString(source.addedBy, source.isNew, "outsideBiWrapper");
		var outsideHtml = "<li " + attributionData + " data-node='" + source.node + "'"+additionalRefData+">"+
							"<div class='sourceNumber he'></div><div class='sourceNumber en'></div>" +
							"<div class='outsideBi " + (sjs.loading ? "" : "new") + "'><div class='text'>" +
								"<div class='he'>" + source.outsideBiText.he + "</div>" +
								"<div class='en'>" + source.outsideBiText.en + "</div>" +
								"<div class='clear'></div>" +
							"</div>" +
							("userLink" in source ? "<div class='addedBy'>Added by " + source.userLink + "</div>" : "") +
							appendInlineAddButton() +
						  "</li>";
		if (appendOrInsert == "append") {
			$target.append(outsideHtml);
		}
		else if (appendOrInsert == "insert") {
			$target.after(outsideHtml);
		}
		if ("options" in source) {
			$(".sheetItem").last().addClass(source.options.indented);
		}
	} else if ("outsideText" in source) {
		additionalRefData = "";
		if (source && ("options" in source) && ("sourcePrefix" in source["options"]) && (source["options"]["sourcePrefix"] != "")) {
			additionalRefData = additionalRefData + " data-sourceprefix='"+source["options"]["sourcePrefix"]+"'";
		}
		var attributionData = attributionDataString(source.addedBy, source.isNew, "outsideWrapper");
		var outsideHtml = "<li " + attributionData + " data-node='" + source.node + "'"+additionalRefData+">"+
							"<div class='sourceNumber he'></div><div class='sourceNumber en'></div>" +
							"<div class='outside " + (sjs.loading ? "" : "new ") + (isHebrew(source.outsideText.stripHtml()) ? "he" : "en") + "'>" + source.outsideText + "</div>" +
							("userLink" in source ? "<div class='addedBy'>Added by " + source.userLink + "</div>" : "") +
							appendInlineAddButton() +
						  "</li>";
		if (appendOrInsert == "append") {
			$target.append(outsideHtml);
		}
		else if (appendOrInsert == "insert") {
			$target.after(outsideHtml);
		}
		if ("options" in source) {
			$(".sheetItem").last().addClass(source.options.indented);
		}
	}
	else if ("media" in source) {
		var mediaLink;
		var mediaClass = "media";
		var wrapperClass = "mediaWrapper";

		if (source.media.match(/\.(jpeg|jpg|gif|png)$/i) != null) {
			mediaLink = '<img class="addedMedia" src="'+source.media+'" />';
			mediaClass = "media";
			wrapperClass += (!sjs.is_owner && sjs.current.hideImages ? " hidden" : "");
		}
		else if (source.media.match(/https?:\/\/www\.youtube\.com\/embed\/.+?rel=0(&amp;|&)showinfo=0$/i) != null) {
			mediaLink = '<iframe width="560" height="315" src='+source.media+' frameborder="0" allowfullscreen></iframe>'
		}
		else if (source.media.toLowerCase().match(/https?:\/\/w\.soundcloud\.com\/player\/\?url=.*/i) != null) {
			mediaLink = '<iframe width="100%" height="166" scrolling="no" frameborder="no" src="'+source.media+'"></iframe>'
			mediaClass = "media fullWidth";
		}
		else if (source.media.match(/https?:\/\/player\.vimeo\.com\/.*/i) != null) {
			mediaLink = '<iframe width="560" height="315" src='+source.media+' frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>'
		}
		else if (source.media.match(/\.(mp3)$/i) != null) {
			mediaLink = '<audio src="'+source.media+'" type="audio/mpeg" controls>Your browser does not support the audio element.</audio>';
			mediaClass = "media fullWidth";
		}
		else {
			mediaLink = '';
		}

		var additionalRefData = "";
		if (source && ("options" in source) && ("sourcePrefix" in source["options"])) {
			additionalRefData = additionalRefData + " data-sourceprefix='"+source["options"]["sourcePrefix"]+"'";
		}
		var mediaCaption = "";
		if (source.caption && (source.caption.en || source.caption.he) ) {
			var cls = source.caption.en && source.caption.he ? "" :
						source.caption.en ? "enOnly" : "heOnly";
			var mediaCaption = "<div class='mediaCaption " + cls + "'><div class='mediaCaptionInner'>" +
								"<div class='en'>" + (source.caption.en || "") + "</div>" +
								"<div class='he'>" + (source.caption.he || "") + "</div>" +
							   "</div></div>";
		}

		var attributionData = attributionDataString(source.addedBy, source.isNew, wrapperClass);
		var outsideHtml = "<li " + attributionData + " data-node='" + source.node + "'" + additionalRefData + ">" +
							"<div class='sourceNumber he'></div><div class='sourceNumber en'></div>" +
							"<div class='" + mediaClass + (sjs.loading ? "" : " new") + "'>" + mediaLink + mediaCaption + "</div>" +
							("userLink" in source ? "<div class='addedBy'>Added by " + source.userLink + "</div>" : "") +
							appendInlineAddButton() +
						  "</li>";
				if (appendOrInsert == "append") {
					$target.append(outsideHtml);
				}
				else if (appendOrInsert == "insert") {
					$target.after(outsideHtml);
				}

		if ("options" in source) {
			$(".sheetItem").last().addClass(source.options.indented);
		}
	}

	else if ("text" in source) {

		var attributionData = attributionDataString(source.addedBy, source.isNew, "outsideBiWrapper");
		var outsideHtml = "<li " + attributionData + " data-node='" + source.node + "'>"+
							"<div class='sourceNumber he'></div><div class='sourceNumber en'></div>" +
							"<div class='outsideBi " + (sjs.loading ? "" : "new") + "'><div class='text'>" +
								"<div class='he'>" + source.text.he + "</div>" +
								"<div class='en'>" + source.text.en + "</div>" +
								"<div class='clear'></div>" +
							"</div>" +
							("userLink" in source ? "<div class='addedBy'>Added by " + source.userLink + "</div>" : "") +
							appendInlineAddButton() +
						  "</li>";
				if (appendOrInsert == "append") {
					$target.append(outsideHtml);
				}


	}

	if (sjs.can_edit) {
		// Bind init of CKEditor to mouseup, so dragging can start first
		$("#title, .comment, .outside, .customTitle, .text .en, .text .he, #author, .contentToAdd").off("mouseup")
			.on("mouseup", sjs.initCKEditor);
	}
	else if (sjs.can_add) {
		// For colloborative adders, only allow edits on their on content
		$(".addedByMe .comment, .addedByMe  .outside, .addedByMe .customTitle, .addedByMe .text .en, .addedByMe .text .he, .contentToAdd").off("mouseup")
			.on("mouseup", sjs.initCKEditor);
	}
} // end buildSource


function appendInlineAddButton(source) {
		if (sjs.is_owner||sjs.can_edit||sjs.can_add) {
			button = "<div class='inlineAddButton'><i class='inlineAddButtonIcon'></i></div>";
		}
		else {
			button = "";
		}
	return button
}


function attributionDataString(uid, newItem, classStr) {
	// Returns string to be added inside a tag containing class attribute and data-added-by attribute
	// e.g., 'class="source addedByMe" data-added-by="54"'
	var addedBy = null;
	var addedByMe = false;

	if (newItem && sjs.can_add) {
		addedByMe = true;
		addedBy = Sefaria._uid;
	} else if (!newItem && uid) {
		addedBy = uid;
		addedByMe = (uid == Sefaria._uid && !sjs.can_edit);
	}

	var str = "class='" + classStr + " sheetItem" +
		      (addedByMe ? " addedByMe" : "") + "'" +
		      (addedBy ? " data-added-by='" + addedBy + "'" : "");

	return str;
}



sjs.saveLastEdit = function($el) {
	// Save a last edit record for replayable edits
	// $el is the element which was most recently edited
	var type = null;
	if ($el.hasClass("he"))                                       { type = "edit hebrew"; }
	if ($el.hasClass("en"))                                       { type = "edit english"; }
	if ($el.hasClass("outside"))                                  { type = "edit outside"; }
	if ($el.hasClass("he") && $el.closest(".new").length)         { type = "add hebrew outside"; }
	if ($el.hasClass("en") && $el.closest(".new").length)         { type = "add english outside"; }
	if ($el.hasClass("outside") && $el.hasClass("new"))           { type = "add outside"; }
	if ($el.hasClass("media") && $el.hasClass("new"))             { type = "add media"; }
	if ($el.hasClass("comment"))                                  { type = "edit comment"; }
	if ($el.hasClass("comment") && $el.hasClass("new"))           { type = "add comment"; }

	if (type) {
		sjs.lastEdit = {
			type: type,
			html: $el.html(),
			node: $el.closest("[data-node]").attr("data-node")
		}
	} else {
		sjs.lastEdit = null;
	}

	$el.removeClass("new");
};


sjs.replayLastEdit = function() {
	// Replay the last edit made, for cases where the sheet was edited
	// remotely and needed to be reloaded before applying edits.
	if (!sjs.lastEdit) { return; }

	var $target = sjs.lastEdit.parent ?
					$($(".source[data-node="+sjs.lastEdit.parent+"]")).eq(0) :
					$("#sources");

	var source = null;
	switch(sjs.lastEdit.type) {
		case "add source":
			addSource(parseRef(sjs.lastEdit.ref), undefined, undefined, $target);
			break;
		case "add comment":
			source = {comment: sjs.lastEdit.html, isNew: true};
			break;
		case "add outside":
			source = {outsideText: sjs.lastEdit.html, isNew: true};
			break;
		case "add media":
			source = {media: sjs.lastEdit.html, isNew: true};
			break;
		case "add english outside":
			source = {outsideBiText: {en: sjs.lastEdit.html, he: "<i>עברית</i>"}, isNew: true};
			break;
		case "add hebrew outside":
			source = {outsideBiText: {he: sjs.lastEdit.html, en: "<i>English</i>"}, isNew: true};
			break;
		case "edit hebrew":
			$("li[data-node='" + sjs.lastEdit.node + "']").find(".text > .he").first().html(sjs.lastEdit.html);
			break;
		case "edit english":

			$("li[data-node='" + sjs.lastEdit.node + "']").find(".text > .en").first().html(sjs.lastEdit.html);
			break;
		case "edit comment":
			$(".comment", ".commentWrapper[data-node='" + sjs.lastEdit.node + "']").eq(0).html(sjs.lastEdit.html);
			break;
		case "edit outside":
			$(".outside", ".outsideWrapper[data-node='" + sjs.lastEdit.node + "']").eq(0).html(sjs.lastEdit.html);
			break;
	}



	if (source) {
		if (sjs.can_add) {
			source.userLink = sjs._userLink;
			source.addedBy  = Sefaria._uid;
		}
		buildSource($target, source);
	}
	if (sjs.lastEdit.type != "add source") { autoSave(); } // addSource logic includes saving
};


// --------- Polling for Updates ----------------

function pollForUpdates() {
	// Ask the server if this sheet has been modified
	// Rebuild sheet if so, applying any edits that have been made locally afterwards
	var timestamp = sjs.current.dateModified;
	var id = sjs.current.id;
	$.getJSON("/api/sheets/modified/" + id + "/" + timestamp, function(data) {
		if (sjs.pollingStopped) {
			return;
		}
		if ("error" in data) {
			sjs.alert.flash(data.error);
		} else if (data.modified) {
				if ($(".sheetItem").find(".cke_editable").length) {
					sjs.changesPending = true;
				  	$("#lastSaved").find(".pending").show().siblings().hide();;
				}
				else {
					rebuildUpdatedSheet(data);
				}
		}
	})
}


function startPolling() {
	// Start a timer to poll server for changes to this sheet
	stopPolling();
	sjs.changesPending = false;
	sjs.pollingStopped = false;
	var pollChain = function() {
		pollForUpdates();
		sjs.pollTimer = setTimeout(pollChain, 3000)
	};
	sjs.pollTimer = setTimeout(pollChain, 3000);
}


function stopPolling(){
	// stop polling even for outstanding request, to avoid race conditions
	sjs.pollingStopped = true;
	if (sjs.pollTimer) {
		clearTimeout(sjs.pollTimer);
	}
}


function startPollingIfNeeded() {
	// Start polling for updates to this sheet, but only if this sheet
	// is saved and is either collaborative or part of a group.
	var needed = false;
	// Only poll for sheets that are saved
	if (sjs.current.id) {
		// Poll if sheet has collaboration
		if (sjs.current.options.collaboration && sjs.current.options.collaboration === "anyone-can-add") {
			needed = true;
		}
		else if  (sjs.current.options.collaboration && sjs.current.options.collaboration === "anyone-can-edit") {
			needed = true;
		}
	}
	if (needed) {
		startPolling();
	} else {
		stopPolling();
	}
}


function rebuildUpdatedSheet(data) {
	// When data is returned from the save API indicating an update has occurred
	// Rebuild the current sheet and
	if (data.dateModified < sjs.current.dateModified) {
		// If the update is older than the timestamp on the current sheet, ignore it
		Sefaria.track.event("Sheets", "Error", "Out of sequence update request.");
		return;
	}

	sjs.alert.flash("Sheet updated.");
	if ($(".sheetItem").find(".cke_editable").length) {
		// An editor is currently open -- save current changes as a lastEdit
		sjs.saveLastEdit($(".cke_editable").eq(0));
	}
	var topMostVisibleSheetItem = null;
	var relativeScrollTop = null;

	$(".sheetItem").each(function( ){
		if ( $('body').scrollTop() < $(this).offset().top + $(this).height() ) {
			topMostVisibleSheetItem = $(this).attr('data-node');
			relativeScrollTop = $(this).offset().top + $(this).height()-$('body').scrollTop();
			return false;
		}
	});

	if (sjs.can_edit || sjs.can_add) {
		$("#addInterface").insertAfter($("#sources"));
		var lastSelectedInterfaceButton = $(".addInterfaceButton.active"); //ensures that add interface remains on the same screen it was previously during a rebuild. So that text in progress can still be added....
	}


	buildSheet(data);
	sjs.replayLastEdit();
    var curTextLocation;

	if (topMostVisibleSheetItem == null) {
		curTextLocation = $("#sourceButton").offset().top - 200;
	} else {
		curTextLocation = $("[data-node='"+topMostVisibleSheetItem+"']").offset().top  + $("[data-node='"+topMostVisibleSheetItem+"']").height() - relativeScrollTop;
	}

	$("html, body").scrollTop(curTextLocation);


	if (sjs.can_edit || sjs.can_add) {
		$(".sheetItem").on("click", ".inlineAddButtonIcon", function(e) {
			$("#addInterface").insertAfter($(this).parent().closest(".sheetItem"));
			$(this).parent().closest(".sheetItem").hasClass("source") ? $("#connectionButton").css('display', 'inline-block') : $("#connectionButton").hide();
		});
	}

	if (sjs.can_edit || sjs.can_add) {
		$("[data-node='" + topMostVisibleSheetItem + "'] .inlineAddButtonIcon").click();
		lastSelectedInterfaceButton.click();
	}

	if (data.options.highlightMode)    { $("#highlightToggle").trigger("click"); }
	closeHighlighterTagWindow();
	resetSplitHighlighterSegment();
	resetHighlighterFilterTags();
	resetHighlighterInteractivity();

	sjs.changesPending = false;
}


// --------------- Copy to Sheet ----------------

function copyToSheet(source) {
	if (!Sefaria._uid) { return sjs.loginPrompt(); }
	sjs.copySource = source;

	// Get sheet list if necessary
	if (!$("#sheetList .sheet").length) {
		$("#sheetList").html(Sefaria._("Loading..."));
		$.getJSON("/api/sheets/user/" + Sefaria._uid, function(data) {
			$("#sheetList").empty();
			var sheets = "";
			sheets += '<li class="sheet new"><i>'+Sefaria._("Start a New Source Sheet")+'</i></li>';
			for (i = 0; i < data.sheets.length; i++) {
				sheets += '<li class="sheet" data-id="'+data.sheets[i].id+'">'+
					(data.sheets[i].title === null ? Sefaria._("Untitled Source Sheet"): data.sheets[i].title.stripHtml()) +
					"</li>";
			}
			$("#sheetList").html(sheets);
			$("#addToSheetModal").position({of:$(window)});
			$(".sheet").click(function(){
				$(".sheet").removeClass("selected");
				$(this).addClass("selected");
				return false;
			})
		})
	}
	var name = source.ref ? source.ref :
				(source.comment ? Sefaria._("this comment") : Sefaria._("this source"));

	$("#addToSheetModal .sourceName").text(name);

	$("#overlay").show();
	$("#addToSheetModal").show().position({ of: $(window) });
}

$("#addToSheetModal .cancel").click(function() {
	$("#overlay, #addToSheetModal").hide();
})

$("#assignmentsModal .ok").click(function() {
	$("#overlay, #assignmentsModal").hide();
});

$("#addToSheetModal .ok").click(function(){
	// Protection against request getting sent multiple times (don't know why)
	if (sjs.flags.saving === true) { return false; }
	var selected = $(".sheet.selected");
	if (!selected.length) {
		sjs.alert.message(Sefaria._("Please select a source sheet."));
		return false;
	}

	if (selected.hasClass("new")) {
		var title = prompt(Sefaria._("New Source Sheet Name:"), "");
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
		if(data["views"]){ //this is only passed on "new source sheet"
			//add the new sheet to the list
			$( "#sheetList .new" ).after( '<li class="sheet" data-id="'+data.id+'">'+data.title.stripHtml() + "</li>" );
			$(".sheet").click(function(){
				$(".sheet").removeClass("selected");
				$(this).addClass("selected");
				return false;
			})
		}
		sjs.flags.saving = false;
		$("#addToSheetModal").hide();
		if ("error" in data) {
			sjs.alert.message(data.error)
		} else {
			var name = data.ref ? data.ref :
				(data.comment ? Sefaria._("This comment") : Sefaria._("This source"));
			//sjs.alert.message(`${name} ${Sefaria._("was added to")} "${title}".<br><br><a target="_blank" href="/sheets/${data.id}">${Sefaria._("View sheet")}</a>`);
			sjs.alert.message(name + " " + Sefaria._("was added to") + " \"" + title + "\".<br><br><a target=\"_blank\" href=\"/sheets/" + data.id + "\">" + Sefaria._("View sheet") + "</a>");
			Sefaria.track.sheets("Source Copied");
		}
	}

});


function copySheet() {
	var sheet = readSheet();
	sheet.status = "unlisted";
	sheet.title = sheet.title + " (Copy)";
	delete sheet.group;
	delete sheet.id;

	if (Sefaria._uid != sjs.current.owner) {
		sheet.via = sjs.current.id;
		sheet.viaOwner = sjs.current.owner;
	}

 	var postJSON = JSON.stringify(sheet);
	$.post("/api/sheets/", {"json": postJSON}, function(data) {
		if (data.id) {
			sjs.alert.message('<span class="int-en">Source Sheet copied.</span><span class="int-he">דף המקורות הועתק.</span><br><br><a href="/sheets/'+data.id+'"><span class="int-en">View copy &raquo;</span><span' +
				' class="int-he">צפה בהעתק &raquo;</span> </a>');

		} else if ("error" in data) {
			sjs.alert.message(data.error);
		}
	})

}


function exportToDrive() {
	$("#overlay").show();
	sjs.alert.message('<span class="int-en">Syncing with Google Docs...</span><span class="int-he">מייצא לגוגל דרייב...</span>');
	Sefaria.track.sheets("Export to Google Drive");

	$.ajax({
	  type: "POST",
	  url: "/api/sheets/" + sjs.current.id + "/export_to_drive",
	  success: function(data) {
			if ("error" in data) {
				sjs.alert.message(data.error.message);
			} else {
				sjs.alert.message("" +
					'<span class="int-en">Source Sheet exported to Google Drive.</span><span class="int-he">ייצוא לגוגל דרייב הסתיים.</span>' +
					"<br><br>" +
					"<a href='" + data.webViewLink + "' target='_blank'>" +
					'<span class="int-en">Open in Google Drive &raquo;</span><span class="int-he">לפתיחה בגוגל דרייב</span>' +
					"</a>");
			}
		},
		statusCode: {
			401: function() {
				window.location.href = "/gauth?next=" + encodeURIComponent(window.location.protocol + '//' + window.location.host + window.location.pathname + "?editor=1#onload=exportToDrive");
			}
		}
	});
}


function fillEmptyHighlighterSegments() {
		$( ".highlighter" ).each(function( index ) {
			if ($(this).find(".en").html() == "") {
				$(this).find(".en").html("<div class='highlighterSegment'>"+$(this).siblings('.text').find('.en').html().stripHtml()+"</div>")
			}
			if ($(this).find(".he").html() == "") {
				$(this).find(".he").html("<div class='highlighterSegment'>"+$(this).siblings('.text').find('.he').html().stripHtml()+"</div>")
			}
		});
}


function toggleHighlighter() {
	if ($("#sheet").hasClass("highlightMode")) {
		$("#sheet").removeClass("highlightMode");
		$("#highlightModeDisplay").hide();
		$("#highlightToggleDeactivate").hide();
		$("#highlightToggleActivate").show();
		$("#highlightMenu").css('display','none');
		if ($("#sources").data('ui-sortable')) {
			$("#sources").sortable("enable"); //disable dragging while in highlighter edit mode....
		}
	}
	else {
		$("#sheet").addClass("highlightMode");
		$("#highlightModeDisplay").show();
		$("#highlightToggleActivate").hide();
		$("#highlightToggleDeactivate").show();
		$("#highlightMenu").css('display','inline-block');
		if ($("#sources").data('ui-sortable')) {
			$("#sources").sortable("disable"); //disable dragging while in highlighter edit mode....
		}
	}
	if ($(".sheetItem").length >0) {
		fillEmptyHighlighterSegments();
		autoSave();
		}
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


function showShareModal(){
	$("#shareWithOthers").show().position({of: window});
	if (parseInt(($("#shareWithOthers").css("top"))) < 100) {
		$("#shareWithOthers").css("top", "100px")
	}
	$("#overlay").show();

	sjs.sheetTagger.suggestTags();
}


function deleteSheet() {
	if (confirm(_("Are you sure you want to delete this sheet? There is no way to undo this action."))) {
		$.post("/api/sheets/" + sjs.current.id + "/delete", function (data){
			if ("error" in data) {
				sjs.alert.message(data.error);
			} else {
				sjs.alert.messageOnly(
					"<span class='int-en'>Source Sheet deleted.</span>" +
					"<span class='int-he'>דף המקורות נמחק בהצלחה.</span>" +
					"<br><br>" +
					"<a href='/my/profile'>" +
						"<div class='ok btn'>" +
							"<span class='int-en'>OK</span>" +
							"<span class='int-he'>המשך</span>" +
						"</div>" +
					"</a>"
				);
			}
		})
	}
}

// Regexes for identifying divine names with or without nikkud / trop
// Currently ignores אֵל & צְבָאוֹת & שדי
sjs.divineRE  = /([\s.,\u05BE;:'"\-]|^)([ו]?[\u0591-\u05C7]*[משהוכלב]?[\u0591-\u05C7]*)(י[\u0591-\u05C7]*ה[\u0591-\u05C7]*ו[\u0591-\u05C7]*ה[\u0591-\u05C2\u05C4-\u05C7]*|יְיָ|יי|יקוק|ה\')(?=[/(/[<//.,;:׃'"\-\s]|$)/g;

// don't match אֲדֹנִי
sjs.adoshemRE = /([\s.,\u05BE;:'"\-]|^)([ו]?[\u0591-\u05C7]*[משהוכלב]?[\u0591-\u05C7]*)(א[\u0591-\u05C7]*ד[\u0591-\u05C7]*נ[\u0591-\u05B3\u05B5-\u05C7]*י[\u0591-\u05B3\u05B5-\u05C2\u05C4-\u05C7]*|אדושם)(?=[<\[\(\s.,;:׃'"\-]|$)/g;

// only allow segol or tzere nikkud, so doesn't match אֲלֵהֶ֖ם or the like
sjs.elokaiRE  = /([\s.,\u05BE;:'"\-]|^)([ו]?[\u0591-\u05C7]*[משהוכלב]?[\u0591-\u05C7]*)(א[\u0591-\u05AF\u05B1\u05B5\u05B6\u05BC-\u05C7]*ל[\u0591-\u05C7]*ו?[\u0591-\u05C7]*)([הק])([\u0591-\u05C7]*)((י[\u0591-\u05C2\u05C4-\u05C7]*)?[ךיוהםן][\u0591-\u05C2\u05C4-\u05C7]*|(י[\u0591-\u05C7]*)?נ[\u0591-\u05C7]*ו[\u0591-\u05C7]*|(י[\u0591-\u05C7]*)?כ[[\u0591-\u05C2\u05C4-\u05C7]*[םן])(?=[\s<\[\(.,;׃:'"\-]|$)/g;

sjs.elokaRE   = /([\s.,\u05BE;:'"\-]|^)([ו]?[\u0591-\u05C7]*[משהוכלב]?[\u0591-\u05C7]*)(א[\u0591-\u05AF\u05B1\u05B5\u05B6\u05BC-\u05C7]*ל[\u0591-\u05C7]*ו[\u0591-\u05C7]*)([הק])([\u0591-\u05C2\u05C4-\u05C7]*)(?=[)(?=[\s<\[\(.,;:׃'"\-]|$)/g;

//sjs.shadaiRE  = /([\s.,\u05BE;:'"\-]|^)([משהוכלב]?[\u0591-\u05C7]*)(ש[\u0591-\u05C7]*[דק][\u0591-\u05C7]*י[\u0591-\u05C7]*)(?=[\s.,;׃:'"\-]|$)/g;


sjs.divineSubs = {
					"noSub": "יהוה",
					"yy": "יי",
					"ykvk": "יקוק",
					"h": "ה'"
				};

function substituteDivineNames(text) {
	// Returns 'text' with divine names substituted according to the current
	// setting in sjs.current.options.divineNames
	if (!sjs.current.options.divineNames || sjs.current.options.divineNames === "noSub") {
		return text;
	}
	var sub = sjs.divineSubs[sjs.current.options.divineNames];
	text = text.replace(sjs.divineRE, "$1$2"+sub);
	text = text.replace(sjs.adoshemRE, "$1$2"+"אדושם");
	text = text.replace(sjs.elokaiRE, "$1$2$3"+"ק"+"$5$6");
	text = text.replace(sjs.elokaRE, "$1$2$3"+"ק"+"$5");
	return text;
}


function substituteDivineNamesInNode(node) {
	if (sjs.current.options.divineNames=="noSub") {
		var adoshemSub = "אדני";
		var elokaiSub = "ה"
	}
	else {
		var adoshemSub = "אדושם";
		var elokaiSub = "ק";
	}
	findAndReplaceDOMText(node, {
		find: sjs.divineRE,
		replace:  "$1$2"+sjs.divineSubs[sjs.current.options.divineNames]
	});
	findAndReplaceDOMText(node, {
		find: sjs.adoshemRE,
		replace:  "$1$2"+adoshemSub
	});
	findAndReplaceDOMText(node, {
		find: sjs.elokaiRE,
		replace:  "$1$2$3"+elokaiSub+"$5$6"
	});
	findAndReplaceDOMText(node, {
		find: sjs.elokaRE,
		replace:  "$1$2$3"+elokaiSub+"$5"
	});
}


function substituteAllExistingDivineNames() {
	// Substitute divine names in every hebrew or English text field or outside text field.
	$(".he, .en, .outside").each(function(index, node) {
		substituteDivineNamesInNode(node)
	});
}


function promptToPublish() {
	// Show a prompt to publish this sheet, but only if the conditions are met

	if (!sjs.current.id) { return; }                        // Don't prompt for unsaved sheet
	if (!sjs.is_owner) { return; }                          // Only prompt the primary owner

	if (sjs.current.promptedToPublish) { return; }          // Don't prompt if we've prompted already
	if (sjs.current.assignment_id) {return;}			   // Don't prompt if this is an assignment sheet
	if (sjs.current.options.assignable == 1) {return;}	   // Don't prompt if sheet is currently assignable
	if (sjs.current.status in {"public":true}) { return; } // Don't prompt if sheet is already public
	if (sjs.current.views < 6) {return}						// Don't prompt if the sheet has been viewed less than six times
	if ($("body").hasClass("embedded")) { return; }         // Don't prompt while a sheet is embedded

	$("#publishPromptModal").show();
	$("#overlay").show();
	Sefaria.track.sheets("Publish Prompt");
}


var afterAction = function() {
	// Called after sheet action (adding sources, comments) to remove video, show save button
	$("#empty").remove();
	if (Sefaria._uid) {
		$("#save").show();
		$("#fileControlMsg").hide();
	}
	resetHighlighterInteractivity();
};


// ------------------ Upload locally stored images to Imgur ------------------

var imgurClientId = "cf90b7f2c19622e";

var addmediaChooseFile = function() {
  var file = this.files[0];

  if (file == null)
    return;

  if (/\.(jpe?g|png|gif)$/i.test(file.name)) {
    var reader = new FileReader();

    reader.addEventListener("load", function() {
      uploadImage(reader.result);
    }, false);

    reader.addEventListener("onerror", function() {
      sjs.alert.message(reader.error);
    }, false);

    reader.readAsDataURL(file);
  } else {
      sjs.alert.message("Could not add image. Please make sure that the file you attempted to upload is a JPEG, PNG, or GIF");
  }
};


var uploadImage = function(imageData) {
	const formData = new FormData();
	formData.append('file', imageData.replace(/data:image\/(jpe?g|png|gif);base64,/, ""));
	// formData.append('file', imageData);

	$.ajax({
		url: Sefaria.apiHost + "/api/sheets/upload-image",
		type: 'POST',
		data: formData,
		contentType: false,
		processData: false,
		success: function(data) {
	      $("#inlineAddMediaInput").val(data.url);
	      $("#addmediaDiv").find(".button").first().trigger("click");
				$("#inlineAddMediaInput").val("");
		},
		error: function(e) {
			console.log("photo upload ERROR", e);
		}
	});
};
$("#addmediaFileSelector").change(addmediaChooseFile);


function resetSplitHighlighterSegment() {
	$(".sheetHighlighterTags").off();
	$(".sheetHighlighterTags").on('click', '.splitHighlighterSegment', function() {
		if ($(this).hasClass("active")) {
			$(".splitHighlighterSegment").removeClass('active');
			injectSelectionColor("#D2DCFF");
		}
		else {
			$(".splitHighlighterSegment").removeClass('active');
			$(this).addClass('active');
			injectSelectionColor($(this).find('.colorSwatch.active').css('background-color'));
		}
		$(".highlighterTagWindow .save").click();
	});
  $('.createNewHighlighterTag .colorSwatch').removeClass('active');
	$('.createNewHighlighterTag .colorSwatch').eq($('.splitHighlighterSegment').length % 7).addClass('active'); //select the next color in the list

	$(".splitHighlighterSegment").off();
	$(".splitHighlighterSegment").on('click', '.editCheckToggle', function(e) {
		e.stopPropagation();
		var curTag = $(this).siblings('.tagName');
		curTagName = curTag.text();
		curTag.attr("contenteditable", "true");
		curTag.focus();
	});
	$(".splitHighlighterSegment").on('focusout', '.tagName', function(e) {
		$(this).attr("contenteditable", "false");
		$(".highlighterSegment[data-tag='" + curTagName + "']").attr('data-tag', $(this).text() );
		autoSave();
	});
}


function injectSelectionColor(color) {
	var sel = window.getSelection();
	sel.removeAllRanges();
	$("#tempSelectOverride").remove();
  var div = $("<div />", {
    html: '&shy;<style id="tempSelectOverride">*::selection { background: '+color+'; }</style>'
  }).appendTo("body");
	setTimeout(function(){ sel.addRange(sjs.selection); }, 20);
}


function resetHighlighterInteractivity() {
	if (sjs.is_owner) {

		$(".highlighter .he, .highlighter .en").off();

		$(".highlighter .he, .highlighter .en").on("mousedown", '.highlighterSegment', function() {
			$(".highlighterSegment").removeClass("noSelect");
			$(".highlighterSegment").not(this).addClass("noSelect");
		});

		$(".highlighter .he, .highlighter .en").on("mouseup", '.highlighterSegment', function(e) {
			if ($(".highlighterTagWindow").is(":hidden")) {


        if ($(e.target).attr('data-tag') && !$(e.target).hasClass("noSelect")) { //if clicking on a highlight that already is tagged, select whole highlight and open window.
          var range = document.createRange();
          range.selectNodeContents(e.currentTarget);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          var curTagName = $(e.target).attr('data-tag');
          $(".splitHighlighterSegment[data-tagname='" + curTagName + "']").addClass('active');

        }

        sjs.selection = saveSelection();
        $('.createNewHighlighterTag .colorSwatch').removeClass('active');
        $('.createNewHighlighterTag .colorSwatch').eq($('.splitHighlighterSegment').length % 7).addClass('active'); //select the next color in the list
        $("tagSelector").show();
        $(".highlighterTagWindow").show().css({
          "top": e.pageY,
          "left": $(".highlighterTagWindow").width() + e.pageX < window.innerWidth ? e.pageX : window.innerWidth - $(".highlighterTagWindow").width() - 40
        });
        $(".createNewHighlighterTag .tagName").attr("contenteditable", "true");
      }
      else {
				closeHighlighterTagWindow();
			}
		});
	}
}


function closeHighlighterTagWindow() {
	$("#tempSelectOverride").remove();
	$(".highlighterTagWindow").hide();
	$(".splitHighlighterSegment").removeClass('active');
}


function resetHighlighterFilterTags() {
	$(".highlighterFilterTags").off();
	$(".highlighterFilterTags").on("click", "input[type='checkbox'][name='highlighterFilterTags']", function(e) {
		if (!($(this)[0].checked)) {
			$(".highlighterSegment[data-tag='" + $(this)[0].value + "']").hide();
		}
		else {
			$(".highlighterSegment[data-tag='" + $(this)[0].value + "']").show();
		}
	});
}


function saveSelection() {
		if (window.getSelection) {
				var sel = window.getSelection();
				if (sel.getRangeAt && sel.rangeCount) {
						return sel.getRangeAt(0);
				}
		} else if (document.selection && document.selection.createRange) {
				return document.selection.createRange();
		}
		return null;
}


function restoreSelection(range) {
		if (range) {
				if (window.getSelection) {
						var sel = window.getSelection();
						sel.removeAllRanges();
						sel.addRange(range);
				} else if (document.selection && range.select) {
						range.select();
				}
		}
}


var _ = Sefaria._;
