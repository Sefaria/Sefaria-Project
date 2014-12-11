var sjs = sjs || {};

sjs.cache = {
	// Caching of texts
	// Handles remaking opjects to match requests.
	// E.g, text for "Shemot 4:7" is the same as that for "Shemot 4:3" (since context is given)
	// save/get will trim data of "Shemot 4:7" to "Shemot 4" so it can be remade into "Shemot 4:3" if requested
	get: function(ref, callback) {
		// Take a ref and return data if available else false
		if (callback) {
			// Allow get to standin for getOrRequest if callback is passed
			sjs.cache.getOrRequest(ref, callback);
			return;
		}

		var pRef = parseRef(ref);
		var nRef = normRef(ref);

		if (nRef in this._cache) {
			var data = clone(this._cache[nRef]);
			
			if (!("remake" in data))
				return data;
		
			// If the ref has more than 1 section listed, try trimming the last section
			var nRef = nRef.replace(/:/g, ".").slice(0, nRef.lastIndexOf("."));

			var data = clone(this._cache[nRef]);
			var lastSection = parseInt(pRef.sections[pRef.sections.length -1]);
			var lastToSection = parseInt(pRef.toSections[pRef.toSections.length -1]);
			
			data.sections.push(lastSection);
			data.toSections.push(lastToSection);
			data.ref = ref;
			
			return data;
		}

		return false;
	},
	getOrRequest: function(ref, callback) {
		// Call function callback on the data for ref
		// Immediately if ref is in cache, otherwise after return from server
		var data = sjs.cache.get(ref);
		if (data) {
			callback(data);
		} else {
			$.getJSON("/api/texts/" + normRef(ref) + this.paramString(), callback);
		}
	},
	save: function(origData) {
		var data = clone(origData);
		var ref  = normRef(data.ref);

		// Store data for book name alone (eg "Genesis") immediatley
		// normalizing below will render this "Genesis.1" which we also store
		if (ref.indexOf(".") == -1) {
			this._cache[ref] = data;
		}
		
		// Trim the data to "chapter" level
		if (data.sections.length == data.sectionNames.length) {
			data.sections = data.sections.slice(0, data.sections.length - 1);
		}
		if (data.toSections.length == data.sectionNames.length) {
			data.toSections = data.toSections.slice(0, data.toSections.length - 1);
		}
		
		this._cache[ref] = data;
		
		// Leave links for each lower level (e.g. "verse") request
		for (var i = 1; i <= Math.max(data.text.length, data.he.length); i++)
			this._cache[ref+"."+i] = {"remake": 1};	
	},
	update: function(newData) {

	},
 	prefetch: function(ref) {
		// grab a text from the server and put it in the cache
		if (!ref) return;

		ref = normRef(ref);
		if (sjs.cache.get(ref)) return;	

		this.get(ref, function(data) {
			if (data.error) return;
			sjs.cache.save(data);
		});
	},
	params: function(params) {
		// Set params dictionary to be used on text GET requests
		params = params || {};
		this._params = params;
	},
	paramString: function() {
		// Returns the params string according to value in _params
		var str = "";
		for (p in this._params) {
			str += "&" + p + "=" + this._params[p];
		}
		if (str.length) {
			str = "?" + str.substr(1);
		}
		return str;
	},
	kill: function(ref) {
		ref = makeRef(parseRef(ref));
		if (ref in this._cache) delete this._cache[ref];
		else if (ref.indexOf(".") != ref.lastIndexOf(".")) {
			ref = ref.slice(0, ref.lastIndexOf("."));
			delete this._cache[ref];
		}
	},
	killAll: function() {
		this._cache = {};
	},
	_cache: {},
	_params: {}
};


sjs.track = {
	// Helper functions for Google Analytics event tracking
	event: function(category, action, label) {
		// Generic event tracker
		_gaq.push(['_trackEvent', category, action, label]);
	},
	pageview: function(url) {
        _gaq.push(['_trackPageview', url]);
	},
	exploreUrl: function(url) {
	    sjs.track.event("Explorer", "Open", url);
	    sjs.track.pageview(url);
	},
	exploreBook: function(book) {
	    sjs.track.event("Explorer", "Book", book);
	},
    exploreBrush: function(book) {
	    sjs.track.event("Explorer", "Brush", book);
    },
	open: function(ref) {
		// Track opening a specific text ref
		sjs.track.event("Reader", "Open", ref);
	},
	ui: function(label) {
		// Track some action in the Reader UI
		sjs.track.event("Reader", "UI", label);
	},
	action: function(label) {
		// Track an action from the Reader
		sjs.track.event("Reader", "Action", label);		
	},
	sheets: function(label) {
		sjs.track.event("Sheets", "UI", label);
	},
	search: function(query) {
		sjs.track.event("Search", "Search", query);
	}
};


sjs.loginPrompt = function(e) {

	$("#loginPrompt, #overlay").show();
	$("#loginPrompt").position({of: $(window)});

	var path = window.location.pathname + window.location.search;
	$("#loginPrompt #loginLink").attr("href", "/login?next=" + path);
	$("#loginPrompt #registerLink").attr("href", "/register?next=" + path);

	$("#loginPrompt .cancel").unbind("click").click(function() {
		$("#loginPrompt, #overlay").hide();
	});
	sjs.track.ui("Login Prompt");
};


sjs.alert = { 
	saving: function(msg) {
		var alertHtml = '<div class="alertBox gradient">' +
				'<div class="msg">' + msg +'</div>' +
				'<img id="loadingImg" src="/static/img/ajax-loader.gif"/>'
			'</div>';
		sjs.alert._show(alertHtml);
	}, 
	message: function(msg, keepOverlay) {
		var classStr = msg.length > 120 ? "wide" : "";
		var alertHtml = '<div class="alertBox gradient ' + classStr + '">' +
				'<div class="msg">' + msg +'</div>' +
				'<div class="ok btn">OK</div>' +
			'</div>';
		if (keepOverlay) {
			this._removeOverlayAfter = false;
		} else {
			this._removeOverlayAfter = true;
		}
		sjs.alert._show(alertHtml);
	},
	messageOnly: function(msg) {
		var alertHtml = '<div class="alertBox gradient">' +
				'<div class="msg">' + msg +'</div>' +
			'</div>';		
		sjs.alert._show(alertHtml);
	},
	loading: function() {
		var alertHtml = '<div class="alertBox gradient loading"><img src="/static/img/loading.gif" /></div>';
		sjs.alert._show(alertHtml);
	},
	loadingSidebar: function() {
		sjs._$commentaryViewPort.removeClass("noCommenatary")
				.html('<div class="loadingSidebar"><img src="/static/img/loading.gif" /></div>');
	},
	copy: function(text) {
		var alertHtml = '<div class="alertBox gradient copy">' +
				'<div class="msg">Copy the text below:</div>' +
				'<textarea>' + text + '</textarea>' + 
				'<div class="ok btn">OK</div>' +
			'</div>';
		
		sjs.alert._show(alertHtml);
	},
	options: function(options, callback) {
		// Present a series of options
		// 'options' is an object that contains
		// -- 'message' - to be displayed above the options
		// -- 'options' - an array of strings with button labels of each option
		// 'callback' is called with the string label of the selected button
		this._removeOverlayAfter = true;
		var optionsButtonsHtml = "";
		for (var i = 0; i < options.options.length; i++) {
			optionsButtonsHtml += "<div class='btn option'>" + options.options[i] + "</div>";
		}
		var alertHtml = '<div class="alertBox gradient wide">' +
							'<div class="msg">' + options.message + '</div>' +
							optionsButtonsHtml + 
							'<div class="ok btn">Cancel</div>' +
						'</div>';
		sjs.alert._show(alertHtml);
		$(".alertBox .option").click(function() {
			callback($(this).text());
			sjs.alert.clear();
		});
	},
	multi: function(options, callback) {
		// Present a series of options
		// 'options' is an object that contains
		// -- 'message' - to be displayed above the options
		// -- 'values' - an array of strings with name of each option
		// -- 'labels' - an array of strings with the visible labels for each option
		// 'callback' is called with an array of strings matching the values of the checked boxes
		this._removeOverlayAfter = true;
		var multiOptionsHtml = "<div class='multiOptions'>";
		for (var i = 0; i < options.values.length; i++) {
			multiOptionsHtml += '<input type="checkbox" name="' + options.values[i] + '"' + 
										( options.default ? 'checked="checked"' : '') + '> ' + 
										options.labels[i] + '<br>';
		}
		multiOptionsHtml += "</div>";
		var alertHtml = '<div class="alertBox gradient">' +
							'<div class="smallHeader">' + options.message + '</div>' +
								multiOptionsHtml + 
							'<div class="add btn">Add</div>' +
							'<div class="cancel btn">Cancel</div>' +
						'</div>';
		sjs.alert._show(alertHtml);
		$(".alertBox .add").click(function() {
			var checked = [];
			$(".multiOptions input:checked").each(function(){
				checked.push($(this).attr("name"));
			});
			sjs.alert.clear();
			callback(checked);
		});
		$(".alertBox .cancel").click(sjs.alert.clear);
	},
	clear: function() {
		$(".alertBox").remove();
		if (this._removeOverlayAfter) { $("#overlay").hide(); }
	},
	_show: function(html) {
		$(".alertBox").remove();		
		$("#overlay").show();
		$(html).appendTo("body").position({of: $(window)}).find("textarea").focus();
		sjs.alert._bindOk();	
	},
	_bindOk: function() {
		$(".alertBox .ok").click(function(e) {
			sjs.alert.clear();
			e.stopPropagation();
		});
	},
	_removeOverlayAfter: true
};

sjs.peopleList = function(list, title) {
	// Show a list of users in a modal window
	var peopleHtml = ""
	for (var i=0; i < list.length; i++) {
		peopleHtml += "<div class='person'>" + 
							"<img src='" + list[i].imageUrl + "' />" +
							list[i].userLink +
						"</div>";
	}

	var modalHtml = "<div id='peopleListModal' class='modal'>" +
						"<div id='peopleListTitle'>" + title + "</div>" +
						"<div id='peopleList'>" + peopleHtml + "</div>" +
						"<div class='btn closePeople'>Close</div>" +
					"</div>";

	$(modalHtml).appendTo("body").show().position({of: window});
	$("#overlay").show();
	$("#peopleListModal .btn.closePeople").click(function() {
		$("#peopleListModal").remove();
		$("#overlay").hide();
	});

};

sjs.availableTextLength = function(counts, depth) {
	// Returns the number of sections available 
	// in any language for a given counts doc
	// 'depth' optionally counts nested sections instead of top level
	depth = depth || 0;
	var en = counts.availableTexts.en;
	var he = counts.availableTexts.he;
	if (!counts.length) {
		counts.length = 0; // So Math.max below will always return a number		
	}
	// Pad the shorter of en, he and length with 0s
	var max = Math.max(en.length, he.length, counts.length, 1);
	return max;
}

sjs.makeTextDetails = function(data) {
	if ("error" in data) {
		sjs.alert.message(data["error"]);
		return;
	}
	var html = "<td class='sections' colspan='2'>" +
				"<div class='sectionName'>" + data.sectionNames[0] + "s:</div><div class='sectionsBox'>";
	var url = data.title.replace(/ /g, "_");

	var max = sjs.availableTextLength(data);
	en = data.availableTexts.en.pad(max, 0);
	he = data.availableTexts.he.pad(max, 0);
    if(data.textDepth > 1){
       url += ".";
       if ($.inArray("Talmud", data.categories) > -1 ) {
            var start = $.inArray("Bavli", data.categories) > -1 ? 2 : 1;
            for (var i = start; i <= (Math.ceil(max / 2) || 2); i++) {

                var clsA = sjs.makeHasStr(en[(i-1)*2], he[(i-1)*2]);
                var clsB = sjs.makeHasStr(en[(i*2)-1], he[(i*2)-1]);

                //we want the first existing segment in the text this box represents (e.g. chapter)
                var firstAvail_a = sjs.getFirstExistingTextSection(data.allVersionCounts[(i-1)*2]);
                //we link to the section above the lowest. for display reasons. (a page shows a whole chapter, not a single verse)
                if(firstAvail_a && firstAvail_a.slice(0, -1).length){
                    firstAvail_a = i + 'a' + "." + firstAvail_a.slice(0, -1).join(".");
                }else{
                    firstAvail_a = i + 'a'
                }

                var firstAvail_b = sjs.getFirstExistingTextSection(data.allVersionCounts[(i*2)-1]);
                if(firstAvail_b && firstAvail_b.slice(0, -1).length){
                    firstAvail_b = i + 'b' + "." + firstAvail_b.slice(0, -1).join(".");
                }else{
                    firstAvail_b = i + 'b'
                }

                html += '<a href="/' + url + firstAvail_a + '" class="sectionLink ' + clsA + '">' + i + 'a</a>';
                html += '<a href="/' + url + firstAvail_b + '" class="sectionLink ' + clsB + '">' + i + 'b</a>';
            }
       } else {
            for (var i = 1; i <= max; i++) {
                var cls = sjs.makeHasStr(en[i-1], he[i-1]);
                var firstAvail = sjs.getFirstExistingTextSection(data.allVersionCounts[i-1]);

                if(firstAvail && firstAvail.slice(0, -1).length){
                    firstAvail =  i + "." + firstAvail.slice(0, -1).join(".");
                }else{
                    firstAvail = i
                }

                //console.log(firstAvail);
                html += '<a href="/' + url + firstAvail + '" class="sectionLink ' + cls + '">' + i + '</a>';
            }
        }
        html += "<div class='colorCodes'>" +
				"<span class='heAll enAll'>Bilingual</span>" +
				"<span class='heAll enNone'>Hebrew</span>" +
				"<span class='enAll heNone'>English</span>" +
                "</div>";

        html += "<div class='detailsRight'>"	+
                    "<div class='titleVariants'><b>Title Variants</b>: " + data.titleVariants.join(", ") + "</div>" +
                    "<div class='textStructure'><b>Structure</b>: " + data.sectionNames.join(", ") + "</div>" +
                "</div>";

        html += "</td>";

        if ($(".makeTarget").length) {
            $(".makeTarget").html(html);
            $(".makeTarget").removeClass("makeTarget")
                .closest(".text").addClass("hasDetails");
        }

        return html;
    }else{
        //html += '<a href="/' + url + '" class="sectionLink">' + data.title +  '</a>';
        window.location = "/" + url;
    }
};


// Text Sync -- module to allow visual marking of segments inside a textarea
sjs.textSync = {
	init: function($text, options) {
		if (!$text.closest(".textSyncBox").length) { 
			$text.wrap("<div class='textSyncBox'></div>");
			$text.closest(".textSyncBox").append("<div class='textSyncNumbers'></div><div class='textSyncMirror'></div>");
		
			// Make sure numbers have same padding as text
			var $numbers = $text.closest(".textSyncBox").find(".textSyncNumbers");
			$numbers.css("padding-top", $text.css("padding-top"));
			// Copy all CSS Styles to mirror
			var p = $text[0];
			var mirror = $text.closest(".textSyncBox").find(".textSyncMirror")[0];
			mirror.style.cssText = document.defaultView.getComputedStyle(p, "").cssText;
			$(mirror).css("position", "absolute").hide();
		}

		options = options || {};
		if (options.syncTarget) {
			$text.attr("data-sync", options.syncTarget);
		} else {
			$text.attr("data-sync", "");
		}
		$text.bind("keyup", sjs.textSync.handleTextChange);
		$text.trigger("keyup");
	},
	handleTextChange: function(e) {
		// Event handler for special considerations every time the text area changes
		var $text  = $(this);
		var text   = $text.val();
		var cursor = $text.caret().start;

		// Ignore arrow keys, but capture new char before cursor
		if (e.keyCode in {37:1, 38:1, 39:1, 40:1}) { 
			sjs.charBeforeCursor = text[cursor-1];
			return; 
		}

		// [BACKSPACE]
		// Handle deleting border between segments 
		if (e.keyCode == 8 && sjs.charBeforeCursor == '\n') {		
			if (cursor) {
				
				// Advance cursor to end of \n seqeuence
				while (text[cursor] == "\n") cursor++;
				
				// Count back to beginning for total number of new lines
				var newLines = 0;
				while (text[cursor-newLines-1] == "\n") newLines++;
				
				// Remove the new lines
				if (newLines) {
					text = text.substr(0, cursor-newLines) + text.substr(cursor)
					$text.val(text).caret({start: cursor-newLines, end: cursor-newLines})
				}
			}
		}

		// [ENTER]
		// Insert placeholder "..." when hitting enter mutliple times to allow
		// skipping ahead to a further segment
		if (e.keyCode === 13 && (sjs.charBeforeCursor === '\n' || sjs.charBeforeCursor === undefined)) {
			text = text.substr(0, cursor-1) + "...\n\n" + text.substr(cursor);
			$text.val(text);
			cursor += 4;
			$text.caret({start: cursor, end: cursor});

		}

		// Replace any single newlines with a double newline
		var singleNewlines = /([^\n])\n([^\n])/g;
		if (singleNewlines.test(text)) {
			text = text.replace(singleNewlines, "$1\n\n$2");
			$text.val(text);
			// move the cursor to the position after the second newline
			if (cursor) {
				cursor++;
				$text.caret({start: cursor, end: cursor});
			}
		}

		// Triggering syncing on stored target,
		// or add numbers labels and sync with them.
		var syncTarget = $(this).attr("data-sync");
		if (syncTarget) {
			// Sync Text with Existing Divs
			$text.closest(".textSyncBox").find(".textSyncNumbers").empty();
			sjs.textSync.syncTextGroups($text, $(syncTarget));
		} else {
			// Sync Text with Numbered Labels	`
			var matches = $text.val().match(/\n+/g);
			var groups = matches ? matches.length + 1 : 1;
			numStr = "";
			for (var i = 1; i < groups + 1; i++) {
				numStr += "<div class='segmentLabel'>" +
					sjs.editing.sectionNames[sjs.editing.textDepth -1] + " " + i + "</div>";
			}
			var $numbers = $text.closest(".textSyncBox").find(".textSyncNumbers");
			$numbers.html(numStr);
			sjs.textSync.syncTextGroups($text, $numbers.find(".segmentLabel"));
		}
		var cursor = $text.caret().start;
		sjs.charBeforeCursor = $text.val()[cursor-1];
	},
	syncTextGroups: function ($text, $target) {
		// Between $target (a set of elements) and textarea $text
		// sync the height of groups by either adding margin-bottom to elements of $target
		// or adding adding \n between groups in newVersion.

		var nTarget     = $target.length;
		var heights     = sjs.textSync.groupHeights($text, nTarget);
		var lineHeight  = parseInt($text.css("line-height"));
		// cursorCount tracks the number of newlines added before the cursor
		// so that we can move the cursor to the correct place at the end
		// of the loop.
		var cursorCount = 0;
		var cursorPos   = $text.caret().start;


		// Step through each element in $target and see if its position needs updating
		// If the label is lower than the text, insert \n into text so they can align
		for (var i = 1; i < nTarget; i++) {
			// top of the "verse", or label trying to match to
			var vTop = $target.eq(i).position().top;
			// top of the text group
			var tTop = heights[i];
			if (!tTop) { break; }

			var currentMarginBottom = parseInt($target.eq(i-1).css("margin-bottom"));

			var diff = vTop - tTop;
			if (diff < 0) {
				// Label is above text group
				// Add margin-top to to push it down
				var marginBottom = currentMarginBottom - diff;
				$target.eq(i-1).css("margin-bottom", marginBottom + "px");
				
			} else if (diff > 0) {
				// Text group is above label
				// First try to reset margin above and try cycle again
				if (currentMarginBottom > 32) {
					$target.eq(i-1).css("margin-bottom", "32px");
					i--;
					continue;
				} 
				// Else add extra new lines to push down text and try again
				var text = $text.val();
				
				// search for new line groups i times to find the position of insertion
				var regex = new RegExp("\n+", "g");
				for (var k = 0; k < i; k++) {
					var m = regex.exec(text);
				}

				var nNewLines = Math.ceil(diff / lineHeight); // divide by height of new line
				var newLines = Array(nNewLines+1).join("\n");
				text = text.substr(0, m.index) + newLines + text.substr(m.index);
				
				$text.val(text);

				if (m.index < cursorPos) {
					cursorCount += nNewLines;
				}

				$text.caret({start: cursorPos, end: cursorPos});
				heights = sjs.textSync.groupHeights($text, nTarget);
				i--;
			}			
		}
		if (cursorCount > 0) {
			cursorPos = cursorPos + cursorCount;
			$text.caret({start: cursorPos, end: cursorPos});
		}

	},
	groupHeights: function($text, nVerses) {
		// Returns an array of the heights (offset top) of text groups in #newVersion
		// where groups are seprated by '\n\n'
		// 'nVerses' is the maximum number of groups to look at
		var text = $text.val();
		
		// Split text intro groups and wrap each group with in class heightMarker
		text = $("<div></div>").text(text).html(); // Escape HTML
		text = "<span class='heightMarker'>" +
			text.replace(/\n/g, "<br>")
			.replace(/((<br>)+)/g, "$1<split!>")
			.split("<split!>")
			.join("</span><span class='heightMarker'>") +
			".</span>"; 
			// Last span includes '.', to prevent an empty span for a trailing line break.
			// Empty spans get no positioning. 

		// textSyncMirror is an HTML div whose contents mirror $text exactly
		// It is shown to measure heights then hidden when done.
		var $mirror = $text.closest(".textSyncBox").find(".textSyncMirror");
		$mirror.html(text).show();
		
		var heights = [];
		for (i = 0; i < nVerses; i++) {
			// Stop counting if there are less heightMarkers than $targets
			if (i > $('.heightMarker').length - 1) { 
				break; 
			}

			heights[i] = $(".heightMarker").eq(i).position().top;
		}

		$mirror.empty().hide();
		return heights;
	}
};


// Text Browser -- UI widgether to allow users to visual browse through TOC to select a Ref
sjs.textBrowser = {
	loadTOC: function(callback) {
		if (sjs.toc) {
			callback(sjs.toc);
		} else {
			if (this.options.absolute) {
				sjs.alert.loading();
			} else {
				//$(this.options.target).html('<img src="/static/img/loading.gif" />');
			}
			$.getJSON("/api/index", function(data) {
				sjs.toc = data;
				callback(data);
			});
		}
	},
	options: {
		callback: function(ref) {}
	},
	init: function() {
		// Init event handlers
		$("#textBrowser").on("click",      ".browserNavItem",  this._handleNavClick);
		$("#textBrowser").on("click",      ".browserPathItem", this._handlePathClick);
		$("#textBrowser").on("mousedown",  ".segment",         this._handleSegmentMouseDown);
		$("#textBrowser").on("mouseup",    ".segment",         this._handleSegmentMouseUp);
		$("#textBrowser").on("mouseenter", ".segment",         this._handleSegmentMouseEnter);
		$("#textBrowser").on("mouseleave", ".segment",         this._handleSegmentMouseLeave);

		// Prevent scrolling within divs from scrolling the whole window
		$("#browserNav, #browserPreviewContent").bind( 'mousewheel DOMMouseScroll', function ( e ) {
			var e0 = e.originalEvent,
			    delta = e0.wheelDelta || -e0.detail;

			this.scrollTop += ( delta < 0 ? 1 : -1 ) * 30;
			e.preventDefault();
		});

		// OK & Cancel 
		$("#browserOK").click(function() {
			if (!$(this).hasClass("inactive")) {
				sjs.textBrowser.options.callback(sjs.textBrowser.ref());
				if (sjs.textBrowser.options.absolute) {
					sjs.textBrowser.destroy();
				}
			}
		});
		$("#browserCancel").click(sjs.textBrowser.destroy);
		this._init = true;
	},
	show: function(options) {
		if ($("#textBrowser").length) { return; }
		this.options = options || this.options;
		var target = options.target || "body";
		var position  = options.position || "absolute";
		var abs = (position === "absolute");
		this.options.absolute = abs;
		if (!sjs.toc) { 
			var that = this;
			this.loadTOC(function() { 
				that.show(that.options);
			});
			return;
		}
		sjs.alert.clear();
		var html = "<div id='textBrowser'" +
					  (abs ? " class='absolute'" : "") + ">" +
						"<div id='browserPath' class='gradient'></div>" +
						"<div id='browserPreview'>" +
							"<div id='browserNav'></div>" +
							"<div id='browserPreviewContent'></div>" +
						"</div>" +
						"<div id='browserActions' class='gradient'>" +
							"<div id='browserMessage'></div><br>" +
							"<div id='browserOK' class='btn'>OK</div>" +
							(abs ? "<div id='browserCancel' class='btn'>Cancel</div>" : "") +
						"</div>" +
				   "</div>";
		$(html).appendTo(target);
		sjs.textBrowser.init();
		sjs.textBrowser.home();
		if (abs) {
			$("#overlay").show();
			$("#textBrowser").position({of: window});
		}
	},
	destroy: function() {
		this._init = false;
		$("#textBrowser").remove();
		$("#overlay").hide();
	},
	home: function() {
		// Return to the home state
		this.buildCategoryNav(sjs.toc);
		this._path = [];
		this._currentText = null;
		this._currentCategories = sjs.toc;
		this._previewing = false;
		this.updatePath();
		this._setPreview("<div class='empty'>Browse texts with the menu on the left.</div>");

	},
	forward: function(to) {
		// navigate forward to "to", a string naming a text, category or section
		// as it appears in the nav or path
		var next = null;
		this._path.push(to);
		this.updatePath();	
		if (this._currentCategories) {
			for (var i = 0; i < this._currentCategories.length; i++) {
				if (this._currentCategories[i].category === to || this._currentCategories[i].title === to) {
					next = this._currentCategories[i];
					if (next.category) { // Click on a Category
						this._currentCategories = next.contents;
						this.buildCategoryNav(next.contents);
						break;
					} else if (next.title) { // Click on a Text Name
						this._currentCategories = null;
						this._currentDepth = 0;
						if (this._currentText && this._currentText.title === next.title) {
							this.buildTextNav(next.title, 0);
						} else {
							this.getTextInfo(next.title);
						}
						break;
					}
				}
			}			 
		} else { // Click on a Section
			var isCommentary = ($.inArray("Commentary", this._currentText.categories) > -1);
			var maxDepth = this._currentText.textDepth - (isCommentary ? 3 : 2);
			if (this._currentDepth >= maxDepth ) {
				// We're at section level, preview the text
				if (this._previewing) {
					this._path = this._path.slice(0, -2);
					this._path.push(to);
					this.updatePath();
				}
				this.previewText(this.ref());
			} else {
				// We're not at section level, build another level of section navs
				this._currentDepth += 1;
				this.buildTextNav(this._currentText.title, this._currentDepth);
			}
		}		
	},
	buildCategoryNav: function(contents) {
		// Build the side nav for category contents
		var html = "";
		for (var i = 0; i < contents.length; i++) {
			var name  = contents[i].category ? contents[i].category : contents[i].title;
			var klass = contents[i].category ? "browserCategory" : "browserText";
			html += "<div class='browserNavItem " + klass + "'><i class='ui-icon ui-icon-carat-1-e'></i>" + name + "</div>";
		}
		$("#browserNav").html(html);
	},
	buildTextNav: function(title, depth) {
		// Build the side nav for an individual texts's contents
		// at 'depth', how deep into the textDepth
		var html = "";
		var isTalmud = $.inArray("Talmud", this._currentText.categories) > -1 && depth == 0;
		var isBavli  = $.inArray("Bavli", this._currentText.categories) > -1;

		var start = isBavli ? 2 : 0;
		var max = sjs.availableTextLength(this._currentText, depth);
		function intToDaf(i) {
			i += 1;
			daf = Math.ceil(i/2);
			return daf + (i%2 ? "a" : "b");
		}
		for (var i = start; i < max; i++) {
			var name  = this._currentText.sectionNames[depth] + " " + (isTalmud ? intToDaf(i) : i+1);
			html += "<div class='browserNavItem section'><i class='ui-icon ui-icon-carat-1-e'></i>" + name + "</div>";
		}
		$("#browserNav").html(html);
	},
	getTextInfo: function(title) {
		// Lookup counts from the API for 'title', then build a text nav
		$.getJSON("/api/counts/" + title, function(data) {
			sjs.textBrowser._currentText = data;
			sjs.textBrowser.buildTextNav(title, 0);
		});
	},
	updatePath: function() {
		// Update the top path UI per the _path list. 
		var html = "<span class='browserNavHome browserPathItem' data-index='0'>All Texts</span>";
		for (var i = 0; i < this._path.length; i++) {
			html += " > <span class='browserPathItem' data-index='" + (i+1) + "'>" + this._path[i] + "</span>";
		}
		$("#browserPath").html(html);
		this.updateMessage();
	},
	updateMessage: function() {
		// Update the bottom message content with the current ref
		var ref = this.ref();
		$("#browserMessage").html(ref);
		if (ref) {
			$("#browserOK").removeClass("inactive");
		} else {
			$("#browserOK").addClass("inactive");
		}
	},
	previewText: function(ref) {
		// Ask the API for text of ref, then build a preview
		this._previewing = true;
		$.getJSON("/api/texts/" + ref + "?commentary=0&pad=0", this.buildPreviewText);
	},
	buildPreviewText: function(data) {
		function segmentString(he, en, section) {
			var sectionLabel = isCommentary ? section.split(":")[0] : section;
			if (!he && !en) { return ""; }
			var html = "<div class='segment' data-section='" + section + "'>" +
							(he ? "<span class='he'>" +
									(isTalmud ? "" : "<span class='segmentNumber'>(" + sectionLabel + ")</span> ") +
									he + 
								   "</span>" : "") +
							(en ? "<span class='en'>" +
									(isTalmud ? "" : "<span class='segmentNumber'>(" + sectionLabel + ")</span> ") +
									en + 
								   "</span>" : "") +
						"</div>";	
			return html;
		}
		var html = "";
		var longer = data.text.length > data.he.length ? data.text : data.he;
		if (longer.length == 0) {
			html = "<div class='empty'>No text available.</div>";
		}
		var isCommentary = ($.inArray("Commentary", sjs.textBrowser._currentText.categories) > -1);
		var isTalmud = ($.inArray("Talmud", sjs.textBrowser._currentText.categories) > -1);
		for (var i = 0; i < longer.length; i++) {
			if (isCommentary) {
				var heLength = data.he[i] ? data.he[i].length : 0;
				var enLength = data.text[i] ? data.text[i].length : 0
				var innerLonger = Math.max(heLength, enLength);
				for (var k = 0; k < innerLonger; k++) {
					var he = data.he[i] ? data.he[i][k] : "";
					var en = data.text[i] ? data.text[i][k] : "";
					html += segmentString(he, en, (i+1) + ":" + (k+1));
				}
			} else {
				html += segmentString(data.he[i], data.text[i], (i+1));	
			}

		}
		sjs.textBrowser._setPreview(html);
	},
	ref: function() {
		// Return the ref currently represented by the Browser
		if (!this._currentText) {
			return null;
		}
		sections = this._path.slice(this._currentText.categories.length + 1);
		sections = sections.map(function(section) {
			return section.slice(section.lastIndexOf(" ")+1);
		});
		var ref = this._currentText.title + " " + sections.join(":");
		
		var selected = $(".segment.selected");
		if (selected.length > 0) {
			ref += ":" + (selected.first().attr("data-section"));
		}
		if (selected.length > 1) {
			ref += "-" + (selected.last().attr("data-section"));
		}
		return ref;
	},
	selectInBetween: function() {
		// Add selected class to every segment between the first and last
		// selected segements
		var $selected = $(".segment.selected");
		if ($selected.length > 1) {
			$selected.first()
				.nextUntil($selected.last())
				.addClass("selected");			
		}
	},
	_setPreview: function(html) {
		$("#browserPreviewContent").html(html);
	},
	_handleNavClick: function() {
		// Move forward on nav click
		var to = $(this).text();
		sjs.textBrowser.forward(to);
	},
	_handlePathClick: function() {
		// Move backward to a particular point on path click
		var index = parseInt($(this).attr("data-index"));
		var path = sjs.textBrowser._path;
		// save the current text data, in case we come back to it. 
		var saveText = sjs.textBrowser._currentText;
		sjs.textBrowser.home();
		sjs.textBrowser._currentText = saveText;
		for (var i = 0; i < index; i++) {
			sjs.textBrowser.forward(path[i]);
		}
	},
	_handleSegmentClick: function() {
		// High segments on click, including ranges
		var $selected = $(".segment.selected");
		if ($(this).hasClass("selected") && $selected.length > 1) {
			$selected.removeClass("selected");
			$(this).addClass("selected");
			sjs.textBrowser.selectInBetween();
		} else {
			$(this).toggleClass("selected");
		}
		sjs.textBrowser.updateMessage();
	},
	_handleSegmentMouseDown: function(e) {
		$(".selected").removeClass("selected");
		$(e.currentTarget).addClass("selected");
		sjs.textBrowser._selecting = true;
		sjs.textBrowser.updateMessage();
	},
	_handleSegmentMouseUp: function(e) {
		$(e.currentTarget).addClass("selected");
		sjs.textBrowser._selecting = false;
		sjs.textBrowser.updateMessage();

	},
	_handleSegmentMouseEnter: function(e) {
		if (sjs.textBrowser._selecting) {
			$(e.currentTarget).addClass("selected");
			sjs.textBrowser.selectInBetween();
			sjs.textBrowser.updateMessage();
		}
	},
	_handleSegmentMouseLeave: function(e) {
		if (sjs.textBrowser._selecting && $(e.toElement || e.relatedTarget).hasClass("selected")) {
			$(e.currentTarget).removeClass("selected");
			sjs.textBrowser.updateMessage();
		}
	},
 	_path: [],
	_currentCategories: [],
	_currentText: null,
	_currentDepth: 0,
	_init: false,
	_previewing: false,
	_selecting: false
};


sjs.makeHasStr = function(en, he) {
	var classes = {en: ["enNone", "enSome", "enAll"], he: ["heNone", "heSome", "heAll"] };
	var str = classes["en"][sjs.arrayHas(en)] + " " + classes["he"][sjs.arrayHas(he)];
	return str;
};


sjs.arrayHas = function(arr) {
	// Returns 0 for none, 1 for some, 2 for all
	if (arr == undefined) {
		return 0;
	}

	if (typeof(arr) == 'number') {
		return (arr > 0 ? 2 : 0);
	}
	var count = 0;
	for (var i=0; i < arr.length; i++) {
		count += sjs.arrayHas(arr[i])
	}

	if (count === arr.length * 2 && count > 0) {
		return 2;
	} else if (count > 0) {
		return 1;
	} else {
		return 0;
	}
};

sjs.getFirstExistingTextSection = function(counts){
    //finds the first available text in a chapter element.
    return sjs.findFirst(counts);

}

sjs.findFirst = function(arr){
    //iterates and recures until finds non empty text elem.
    //then returns the path of text segment numbers leading to it
    if (arr == undefined) {
		return false;
	}

	if (typeof(arr) == 'number') {
		return arr > 0;
	}
	for (var i=1; i <= arr.length; i++) {
		result = sjs.findFirst(arr[i-1]);
        if(result){
            if(isArray(result)){
                return indices = [i].concat(result);
            }else{
               return [i]
            }
        }
	}
    return false;
}

sjs.deleteTextButtonHandler = function(e) {
	// handle a click to a deleteVersionButton

	var title = $(this).attr("data-title");
	var isCommentator = $(this).attr("data-is-commentator");

	var confirm = prompt("Are you sure you want to delete this text version? Doing so will completely delete this text from Sefaria, including all existing versions and links. This action CANNOT be undone. Type DELETE to confirm.", "");
	if (confirm !== "DELETE") {
		alert("Delete canceled.")
		return;
	}

	if (isCommentator) {
		var commentaryText = $(this).attr("data-commentary-text");
		var confirm = prompt("If you proceeed, all commentaries by " + title + " will be deleted, not only " + commentaryText + ". Type DELETE to confirm.", "");
		if (confirm !== "DELETE") {
			alert("Delete canceled.")
			return;
		}			
	}

	sjs.alert.saving("Deleting...<br>(this may take a while)");
	var url = "/api/index/" + title;

	$.ajax({
		url: url,
		type: "DELETE",
		success: function(data) {
			if ("error" in data) {
				sjs.alert.message(data.error)
			} else {
				sjs.alert.message("Text Deleted.");
				window.location = "/";
			}
		}
	}).fail(function() {
		sjs.alert.message("Something went wrong. Sorry!");
	});

};

function parseRef(q) {
	var response = {book: false, 
					sections: [],
					toSections: [],
					ref: ""};
					
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
	response.ref = q;
	
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


function normRef(ref) {
	return makeRef(parseRef(ref));
}


function humanRef(ref) {
	var pRef = parseRef(ref);
	var book = pRef.book.replace(/_/g, " ") + " ";
	var nRef = pRef.ref;
	var hRef = nRef.replace(/ /g, ":");
	return book + hRef.slice(book.length);
}


function isRef(ref) {
	// Returns true if ref appears to be a ref 
	// relative to known books in sjs.books

	// BANDAID -- only allow English Refs
	if (isHebrew(ref)) {
		return false;
	}

	q = parseRef(ref);

	// Capitalize first letter for better match against stored titles
	var potentialBook = q.book.charAt(0).toUpperCase() + q.book.slice(1)
	potentialBook = potentialBook.replace(/_/g, " ");
	if ($.inArray(potentialBook, sjs.books) > 0) { 
		return true;
	}

	// Approximation for "[Commentator] on [Book]", match any case of 
	// "[Book] on [Book]". This catches "Rashi on Genesis" but also generates
	// false positives for "Genesis on Exodus" (acceptable for now).
	if (ref.indexOf(" on ") > 0) {
		titles = ref.split(" on ");
		if (titles.length == 2 && isRef(titles[0]) && isRef(titles[1])) {
			return true;
		}
	}

	return false;
}


sjs.makeRefRe = function() {
	// Construct and store a Regular Expression for matching citations
	// based on known books.
	var books = "(" + sjs.books.map(RegExp.escape).join("|")+ ")";
	var refReStr = books + " (\\d+[ab]?)(:(\\d+)([\\-–]\\d+(:\\d+)?)?)?";
	sjs.refRe = new RegExp(refReStr, "gi");	
}

function wrapRefLinks(text) {
	if (typeof text !== "string") { 
		return text;
	}
	
	if (!sjs.refRe) { sjs.makeRefRe(); }
	// Reset lastIndex, since we use the same RE object multple times
	sjs.refRe.lastIndex = 0; 

	var refText = text.replace(sjs.refRe, '<span class="refLink" data-ref="$1.$2$3">$1 $2$3</span>');

	//var refText = text.replace(sjs.refRe, '1: $1, 2: $2, 3: $3, 4: $4, 5: $5');
	return refText;
	
}


function checkRef($input, $msg, $ok, level, success, commentatorOnly) {
	
	/* check the user inputed text ref
	   give fedback to make it corret to a certain level of specificity 
	   talk to the server when needed to find section names
		* level -- how deep the ref should go - (0: segment, 1: section, etc)
		* success -- a function to call when a valid ref has been found
		* commentatorOnly --- whether to stop at only a commentatory name
	*/
	
	// Specfic to sheets for now, remove preview text
	$("#textPreview").remove();

	// sort books by length so longest matches first in regex
	if (!sjs.sortedBooks) {
		sjs.sortedBooks = sjs.books.sort(function(a,b){
			if (a.length == b.length) return 0;
			return (a.length < b.length ? 1 : -1); 
		});
	} 
	
	var booksReStr = "(" + sjs.sortedBooks.join("\\b|") + ")";
	var booksRe = new RegExp("^" + booksReStr, "i");
	var baseTests = [{test: /^/,
					  msg: "Enter a text or commentator name",
					  action: "pass"},
					 {test: /^$/,
					  msg: "Enter a text or commentator name",
					  action: "reset"},
					 {test: /^.{3,}/,
					  msg: "Unknown text. Would you like to add it?",
					  action: "allow"},
					 {test: booksRe,
					  msg: "Looking up text information...",
					  action: "getBook"}];
	
	
	// An array of objects with properites 'test', 'msg', 'action' which are tested with each change
	// Test are tried backwards from the last. If 'test' matched, then 'msg' is displayed to the user
	// and 'action' is carried out (according to the switch in this code).
	sjs.ref.tests = sjs.ref.tests || baseTests;
	var tests = sjs.ref.tests;
	
	var ref = $input.val();
	//console.log("Seeing: " + ref);
	//console.log("Test Queue:");
	//console.log(sjs.ref.tests)
	// Walk backwards through all tests, give the message and do the action of first match
	for (var i = tests.length -1;  i > -1;  i--) {
		if (ref.match(tests[i].test)) {
			action = tests[i].action;
			$msg.html("<i>"+tests[i].msg+"</i>");
			break;
		}
	}
	$msg.removeClass("he");
	
	//console.log("Action: " + action);
	switch(action){
	
		// Go back to square 1
		case("reset"):
			sjs.ref.tests = baseTests;
			sjs.ref.index = {};
			sjs.editing.index = null;
			$input.val("");
			$ok.addClass("inactive");
			$("#addSourceTextControls .btn").addClass("inactive");
			$("#addSourceCancel").removeClass("inactive");
			break;
		
		// Don't change anything	
		case("pass"):
			sjs.editing.index = null;
			$ok.addClass("inactive");
			// this reaches in to logic specific to add source
			$("#addSourceTextControls .btn").addClass("inactive");
			$("#addSourceCancel").removeClass("inactive")
			break;

		// The current value of the ref is acceptable, allow is to be accepted
		// Don't understand this anymore -- is it only to allow New (unknown) Texts?
		case("allow"):
			$ok.removeClass("inactive").text("Add Text");
			// also reaches into specific source sheet logic
			$("#addSourceTextControls .btn").addClass("inactive");
			$("#addSourceCancel").removeClass("inactive")
			break;

		// When a commentator's name is entered, insert a text reference, 
		// e.g., "Rashi" -> "Rashi on Genesis 2:5"
		case("insertRef"):
			$input.val($input.val() + " on " + sjs.add.source.ref)
				.autocomplete("close");
			checkRef($input, $msg, $ok, level, success, commentatorOnly);
			break;
		
		// Get information about an entered book (e.g., "Genesis", "Rashi", "Brachot") from server
		// then add appropriate tests and prompts	
		case("getBook"):
			match = ref.match(booksRe);
			if (!match) return;
			else ref = match[0];
			// Don't look up info we already have
			if (sjs.ref.index && sjs.ref.index.title == ref) break;
			
			$.getJSON("/api/index/" + ref, function(data){
				if ("error" in data) {
					$msg.html(data.error);
					$ok.addClass("inactive");

				} else {
					sjs.ref.index = data;
					var variantsRe = "(" + data.titleVariants.join("|") + ")";
					$ok.addClass("inactive");

					// ------- Commetator Name Entered -------------
					if (data.categories[0] == "Commentary") {
						if (commentatorOnly) {
							// Only looking for a Commtator name, will insert current ref
							sjs.ref.tests.push(
								{test: new RegExp("^" + variantsRe + "$", "i"), 
								 msg: "", 
								 action: "insertRef"});
							sjs.ref.tests.push(
								{test: new RegExp("^" + variantsRe + " on " + sjs.add.source.ref + "$", "i"), 
								 msg: "", 
								 action: "ok"});
							
						} else {
							// Commentator entered, need a text name to Look up
							var commentatorRe = new RegExp("^" + variantsRe, "i")
							sjs.ref.tests.push(
								{test: commentatorRe, 
								 msg: "Enter a <b>Text</b> that " + data.title + " comments on, e.g. <b>" + data.title + " on Genesis</b>.", 
								 action: "pass"});
							
							var commentaryReStr = "^" + variantsRe + " on " + booksReStr + "$";
							var commentaryRe = new RegExp(commentaryReStr, "i");
							sjs.ref.tests.push(
								{test: commentaryRe,
								 msg: "Looking up text information...",
								 action: "getCommentaryBook"});
					
						}

					// ------- Talmud Mesechet Entered -------------
					} else if (data.categories[0] == "Talmud") {						
						sjs.ref.tests.push(
							{test: RegExp("^" + variantsRe, "i"),
							 msg: "Enter a <b>Daf</b> of Tractate " + data.title + " to add, e.g. " +
							 	data.title + " 4b",
							 action: "pass"});
				
						sjs.ref.tests.push(
							{test:  RegExp("^" + variantsRe + " \\d+[ab]$", "i"),
							 msg: "OK. Click <b>add</b> to continue.",
							 action: "ok"});
						
						sjs.ref.tests.push(
							{test:  RegExp("^" + variantsRe + " \\d+a-b$", "i"),
							 msg: "OK. Click <b>add</b> to continue.",
							 action: "ok"});
						
						sjs.ref.tests.push(
							{test:  RegExp("^" + variantsRe + " \\d+[ab]-\\d+[ab]$", "i"),
							 msg: "OK. Click <b>add</b> to continue.",
							 action: "ok"});				

						sjs.ref.tests.push(
							{test:  RegExp("^" + variantsRe + " \\d+[ab][ .:]$", "i"),
							 msg: "Enter a starting <b>segment</b>, e.g. " + 
							 	data.title + " 4b:1",
							 action: "pass"});

						sjs.ref.tests.push(
							{test:  RegExp("^" + variantsRe + " \\d+[ab][ .:]\\d+$", "i"),
							 msg: "OK, or use '-' to select  range, e.g. " +
							 	data.title + " 4b:1-5",
							 action: "ok"});	

						sjs.ref.tests.push(
							{test:  RegExp("^" + variantsRe + " \\d+[ab][ .:]\\d+-$", "i"),
							 msg: "Enter an ending <b>segment</b>, e.g. " +
							 	data.title + " 4b:1-5",
							 action: "pass"});	

						sjs.ref.tests.push(
							{test:  RegExp("^" + variantsRe + " \\d+[ab][ .:]\\d+-\\d+$", "i"),
							 msg: "",
							 action: "ok"});
						
						
					// -------- All Other Texts ------------
					} else {
						var bookRe = new RegExp("^" + variantsRe + " ?$", "i");
						sjs.ref.tests.push(
									{test: bookRe,
									 msg: "Enter a <b>" + data.sectionNames[0] + "</b> of " + data.title + 
									 	" to add, e.g., " + data.title + " 5",
									 action: "pass"});
						
						var reStr = "^" + variantsRe + " \\d+"
						for (var i = 0; i < data.sectionNames.length - level - 1; i++) {
							sjs.ref.tests.push(
									{test: RegExp(reStr, "i"),
									msg: "Enter a <b>" + data.sectionNames[i+1] + "</b> of " + data.title + 
										" to add, e.g., " + data.title + " 5:7",
									action: "pass"});
							reStr += "[ .:]\\d+";
						}

						sjs.ref.tests.push(
							{test: RegExp(reStr + "$", "i"),
							 msg: "OK. Click <b>add</b> to continue.",
							 action: "ok"});
							 
						sjs.ref.tests.push(
							{test: RegExp(reStr + "-", "i"),
							 msg: "Enter an ending <b>" + data.sectionNames[i] + "</b>",
							 action: "pass"});
							 
						sjs.ref.tests.push(
							{test: RegExp(reStr + "-\\d+$", "i"),
							 msg: "OK. Click <b>add</b> to continue.",
							 action: "ok"});
						
					}
					// Call self again to check against latest test added
					checkRef($input, $msg, $ok, level, success, commentatorOnly);
				}	
			}); // End getBook case
			break;
		
		// get information about a book entered as the object of a commentator 
		//(e.g. the "Genesis" in "Rashi on Genesis")		
		case("getCommentaryBook"):
		//console.log("gcb")
		//console.log("ref: " + ref)
			
			// reset stored title to commentator name only
			sjs.ref.index.commentator = ref.slice(0, ref.indexOf(" on "));
			var book = ref.slice((sjs.ref.index.commentator + " on ").length) 
			
			// Don't look up info we already have
			if (sjs.ref.index && sjs.ref.index.title == ref) break;

			$.getJSON("/api/index/" + book, function(data){
				if ("error" in data) {
					$msg.html(data.error);
				} else {
					sjs.ref.index.title = sjs.ref.index.commentator + " on " + book;
					data.sectionNames.push("Comment");
					sjs.ref.index.sectionNames = data.sectionNames;
					$ok.addClass("inactive");

					// Don't allow Commentator on Commentator
					if (data.categories[0] == "Commentary") {
						var commentaryRe = new RegExp(sjs.ref.index.title, "i");
						sjs.ref.tests.push(
							{test: commentaryRe,
							 msg: "Sorry, no commentator on commentator action.",
							 action: "pass"});
					
					// Commentary on Talmud
					} else if (data.categories[0] == "Talmud") {
						var tractateRe = new RegExp("^" + sjs.ref.index.title, "i");
						sjs.ref.tests.push(
							{test: tractateRe,
							 msg: "Enter a Daf of tractate " + data.title + ", e.g, " +
							 	data.title + " 4b",
							 action: "pass"});
						
						var talmudReStr = "^" + sjs.ref.index.title + " \\d+[ab]";
						sjs.ref.tests.push(
							{test: RegExp(talmudReStr + "$", "i"),
							 msg: "OK. Click <b>add</b> to conitnue.",
							 action: "ok"});

						sjs.ref.tests.push(
							{test:  RegExp(talmudReStr + "[ .:]", "i"),
							 msg: "Enter a starting <b>segment</b>.",
							 action: "pass"});

						sjs.ref.tests.push(
							{test:  RegExp(talmudReStr + "[ .:]\\d+$", "i"),
							 msg: "OK, or use '-' to select a range",
							 action: "ok"});								 

						sjs.ref.tests.push(
							{test:  RegExp(talmudReStr + "[ .:]\\d+-$", "i"),
							 msg: "Enter an ending <b>segment</b>.",
							 action: "pass"});	

						sjs.ref.tests.push(
							{test:  RegExp(talmudReStr + "[ .:]\\d+-\\d+$", "i"),
							 msg: "",
							 action: "ok"});	
					
					// Commentary on all other Texts
					} else {
						var bookRe = new RegExp("^" + sjs.ref.index.title, "i");
						sjs.ref.tests.push(
							{test: bookRe,
							 msg: "Enter a " + data.sectionNames[0] + " of " + data.title,
							 action: "pass"});
						
						var reStr = "^" + sjs.ref.index.title + " \\d+";

						// Cycle through sections, add tests and msg for each
						if (level == 0) { level++; }
						for (var i = 1; i < data.sectionNames.length - level; i++) {
							var re = new RegExp(reStr)
							sjs.ref.tests.push(
								{test: re,
								 msg: "Enter a " + data.sectionNames[i] + " of " + data.title,
								 action: "pass"});
							reStr += "[ .:]\\d+";
						}
						sjs.ref.tests.push(
							{test: RegExp(reStr + "$"),
							 msg: "OK. Click <b>add</b> to conitnue.",
							 action: "ok"});

						sjs.ref.tests.push(
							{test:  RegExp(reStr + "[ .:]", "i"),
							 msg: "Enter a starting <b>" + data.sectionNames[i] + "</b>.",
							 action: "pass"});

						sjs.ref.tests.push(
							{test:  RegExp(reStr + "[ .:]\\d+$", "i"),
							 msg: "OK, or use '-' to select a range." + data.sectionNames[i] + "</b>.",
							 action: "ok"});	

						sjs.ref.tests.push(
							{test:  RegExp(reStr + "[ .:]\\d+-$", "i"),
							 msg: "Enter an ending <b>" + data.sectionNames[i] + "</b>.",
							 action: "pass"});	

						sjs.ref.tests.push(
							{test:  RegExp(reStr + "[ .:]\\d+-\\d+$", "i"),
							 msg: "",
							 action: "ok"});			
					
					}
					// Add the basic test of "[Commentator] on [Text]" again
					// so that if you pass through the name of one text on the way to 
					// another, you still look up the final text.
					// e.g. "Rashi on Ber" triggers lookup of Genesis which would otherwise
					// block looking up "Rashi on Berakhot". 
					var commentaryReStr = "^" + sjs.ref.index.commentator + " on (?!" + book + "$)" + booksReStr + "$";
					var commentaryRe = new RegExp(commentaryReStr, "i");
					sjs.ref.tests.push(
						{test: commentaryRe,
						 msg: "Looking up text information...",
						 action: "getCommentaryBook"});
					

					// Now that we have the text info an new tests,
					// call again with the same value.
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


function textPreview(ref, $target, callback) {
	// Given ref, create a preview of its text in $target
	// Include links to add or edit text as necessary
	callback = callback || function(){};

	var urlRef = normRef(ref);
	var getUrl = "/api/texts/" + urlRef + "?commentary=0";
	$target.html("Loading text...");

	var data = sjs.cache.get(ref);
	if (data) {
		makePreview(data);
	} else {
		$.getJSON(getUrl, makePreview)
			.error(function() {
				var msg = "<span class='error'>There was an error retrieving this text.</span>";
				$target.html(msg);
				callback();
			});
	}

	function makePreview(data) {
		sjs.cache.save(data);
		if (data.error) {
			var msg = "<span class='error'>" + data.error + "</span>";
			$target.html(msg);
			callback();
			return;
		}
		var text = en = he = controlsHtml = "";
		
		if (data.sections.length < data.sectionNames.length) {
			data.sections.push(1);
			data.toSections.push(Math.max(data.text.length, data.he.length));
		}
		for (var i = data.sections[data.sections.length-1]-1; i < data.toSections[data.toSections.length-1]; i++) {
			if (data.text.length > i) { en += "<div class='previewLine'><span class='previewNumber'>(" + (i+1) + ")</span> " + data.text[i] + "</div> "; }
			if (data.he.length > i) { he += "<div class='previewLine'><span class='previewNumber'>(" + (i+1) + ")</span> " + data.he[i] + "</div> "; }
		}

		var path = parseURL(document.URL).path;
		if (!en) { en += "<div class='previewNoText'><a href='/add/" + urlRef + "?after=" + path + "' class='btn'>Add English for "+ref+"</a></div>"; }
		if (!he) { he += "<div class='previewNoText'><a href='/add/" + urlRef + "?after=" + path + "' class='btn'>Add Hebrew for "+ref+"</a></div>"; }

		text = "<div class='en'>" + en + "</div>" + "<div class='he'>" + he + "</div>";

		$target.html(controlsHtml + text);
		callback();
	};

}


sjs.hebrewNumerals = { 
	"\u05D0": 1,
	"\u05D1": 2,
	"\u05D2": 3,
	"\u05D3": 4,
	"\u05D4": 5,
	"\u05D5": 6,
	"\u05D6": 7,
	"\u05D7": 8,
	"\u05D8": 9,
	"\u05D9": 10,
	"\u05D8\u05D5": 15,
	"\u05D8\u05D6": 16,
	"\u05DB": 20,
	"\u05DC": 30,
	"\u05DE": 40,
	"\u05E0": 50,
	"\u05E1": 60,
	"\u05E2": 70,
	"\u05E4": 80,
	"\u05E6": 90,
	"\u05E7": 100,
	"\u05E8": 200,
	"\u05E9": 300,
	"\u05EA": 400,
	"\u05EA\u05E7": 500,
	"\u05EA\u05E8": 600,
	"\u05EA\u05E9": 700,
	"\u05EA\u05EA": 800,
	1: "\u05D0",
	2: "\u05D1",
	3: "\u05D2",
	4: "\u05D3",
	5: "\u05D4",
	6: "\u05D5",
	7: "\u05D6",
	8: "\u05D7",
	9: "\u05D8",
	10: "\u05D9",
	15: "\u05D8\u05D5",
	16: "\u05D8\u05D6",
	20: "\u05DB",
	30: "\u05DC",
	40: "\u05DE",
	50: "\u05E0",
	60: "\u05E1",
	70: "\u05E2",
	80: "\u05E4",
	90: "\u05E6",
	100: "\u05E7",
	200: "\u05E8",
	300: "\u05E9",
	400: "\u05EA",
	500: "\u05EA\u05E7",
	600: "\u05EA\u05E8",
	700: "\u05EA\u05E9",
	800: "\u05EA\u05EA"
}


function decodeHebrewNumeral(h) {
	// Takes a string representing a Hebrew numeral and returns it integer value. 
	var values = sjs.hebrewNumerals;

	if (h === values[15] || h === values[16]) {
		return values[h];
	} 
	
	var n = 0
	for (c in h) {
		n += values[h[c]];
	}

	return n;
}
	

function encodeHebrewNumeral(n) {
	// Takes an integer and returns a string encoding it as a Hebrew numeral. 
	
	if (n >= 900) {
		return n;
	}

	var values = sjs.hebrewNumerals;

	if (n === 15 || n === 16) {
		return values[n];
	}
	
	var heb = ""
	if (n >= 100) { 
		var hundreds = n - (n % 100);
		heb += values[hundreds];
		n -= hundreds;
	} 
	if (n >= 10) {
		var tens = n - (n % 10);
		heb += values[tens];
		n -= tens;
	}
	
	if (n > 0) {
		heb += values[n];	
	} 
	
	return heb;
}

function stripNikkud(rawString) {
	return rawString.replace(/[\u0591-\u05C7]/g,"");
}


function isTouchDevice() {  
	return "ontouchstart" in document.documentElement;
}


function parseURL(url) {
    var a =  document.createElement('a');
    a.href = url;
    return {
        source: url,
        protocol: a.protocol.replace(':',''),
        host: a.hostname,
        port: a.port,
        query: a.search,
        params: (function(){
            var ret = {},
                seg = a.search.replace(/^\?/,'').split('&'),
                len = seg.length, i = 0, s;
            for (;i<len;i++) {
                if (!seg[i]) { continue; }
                s = seg[i].split('=');
                ret[s[0]] = s[1];
            }
            return ret;
        })(),
        file: (a.pathname.match(/\/([^\/?#]+)$/i) || [,''])[1],
        hash: a.hash.replace('#',''),
        path: a.pathname.replace(/^([^\/])/,'/$1'),
        relative: (a.href.match(/tps?:\/\/[^\/]+(.+)/) || [,''])[1],
        segments: a.pathname.replace(/^\//,'').split('/')
    };
}


function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = decodeURI(value);
    });
    return vars;
}


function updateQueryString(key, value, url) {
    if (!url) url = window.location.href;
    var re = new RegExp("([?|&])" + key + "=.*?(&|#|$)(.*)", "gi");

    if (re.test(url)) {
        if (value)
            return url.replace(re, '$1' + key + "=" + value + '$2$3');
        else {
            return url.replace(re, '$1$3').replace(/(&|\?)$/, '');
        }
    }
    else {
        if (value) {
            var separator = url.indexOf('?') !== -1 ? '&' : '?',
                hash = url.split('#');
            url = hash[0] + separator + key + '=' + value;
            if (hash[1]) url += '#' + hash[1];
            return url;
        }
        else
            return url;
    }
}


function isValidEmailAddress(emailAddress) {
    var pattern = new RegExp(/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?$/i);
    return pattern.test(emailAddress);
};


function isInt(x) {
		var y=parseInt(x);
		if (isNaN(y)) return false;
		return x==y && x.toString()==y.toString();
	}


function isArray(a) {
	return ( Object.prototype.toString.call( a ) === '[object Array]' );
}


function isHebrew(text) {
	// Returns true if text is (mostly) Hebrew
	// Examines up to the first 40 characters, ignoring punctuation and numbers

	var heCount = 0;
	var enCount = 0;
	var punctuationRE = /[0-9 .,'"?!;:\-=@#$%^&*()]/

	for (var i = 0; i < Math.min(40, text.length); i++) {
		if (punctuationRE.test(text[i])) { continue; }
		if ((text.charCodeAt(i) > 0x590) && (text.charCodeAt(i) < 0x5FF)) {
			heCount++;
		} else {
			enCount++;
		}
	}

	return (heCount >= enCount);
}

function containsHebrew(text) {
	// Returns true if there are any Hebrew characters in text
	for (var i = 0; i < text.length; i++) {
		if ((text.charCodeAt(i) > 0x590) && (text.charCodeAt(i) < 0x5FF)) {
			return true;
		}
	}
	return false;
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


String.prototype.toProperCase = function () {
    return this.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
};


String.prototype.stripHtml = function() {
   var tmp = document.createElement("div");
   tmp.innerHTML = this;
   return tmp.textContent||tmp.innerText;
};


String.prototype.escapeHtml = function() {
    return this.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    			.replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br />$2');
};


Array.prototype.compare = function(testArr) {
    if (this.length != testArr.length) return false;
    for (var i = 0; i < testArr.length; i++) {
        if (this[i].compare) { 
            if (!this[i].compare(testArr[i])) return false;
        }
        if (this[i] !== testArr[i]) return false;
    }
    return true;
};


Array.prototype.pad = function(s,v) {
    var l = Math.abs(s) - this.length;
    var a = [].concat(this);
    if (l <= 0)
      return a;
    for(var i=0; i<l; i++)
      s < 0 ? a.unshift(v) : a.push(v);
    return a;
};


Array.prototype.unique = function() {
    var a = [];
    var l = this.length;
    for(var i=0; i<l; i++) {
      for(var j=i+1; j<l; j++) {
        // If this[i] is found later in the array
        if (this[i] === this[j])
          j = ++i;
      }
      a.push(this[i]);
    }
    return a;
 };


RegExp.escape= function(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};


$.fn.serializeObject = function()
{
    var o = {};
    var a = this.serializeArray();
    $.each(a, function() {
        if (o[this.name] !== undefined) {
            if (!o[this.name].push) {
                o[this.name] = [o[this.name]];
            }
            o[this.name].push(this.value || '');
        } else {
            o[this.name] = this.value || '';
        }
    });
    return o;
};


// Protect against browsers without consoles and forgotten console statements
if(typeof(console) === 'undefined') {
    var console = {}
    console.log = function() {};
}

/*!
 * jQuery Cookie Plugin v1.3
 * https://github.com/carhartl/jquery-cookie
 *
 * Copyright 2011, Klaus Hartl
 * Dual licensed under the MIT or GPL Version 2 licenses.
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.opensource.org/licenses/GPL-2.0
 */
(function ($, document, undefined) {

	var pluses = /\+/g;

	function raw(s) {
		return s;
	}

	function decoded(s) {
		return decodeURIComponent(s.replace(pluses, ' '));
	}

	var config = $.cookie = function (key, value, options) {

		// write
		if (value !== undefined) {
			options = $.extend({}, config.defaults, options);

			if (value === null) {
				options.expires = -1;
			}

			if (typeof options.expires === 'number') {
				var days = options.expires, t = options.expires = new Date();
				t.setDate(t.getDate() + days);
			}

			value = config.json ? JSON.stringify(value) : String(value);

			return (document.cookie = [
				encodeURIComponent(key), '=', config.raw ? value : encodeURIComponent(value),
				options.expires ? '; expires=' + options.expires.toUTCString() : '', // use expires attribute, max-age is not supported by IE
				options.path    ? '; path=' + options.path : '',
				options.domain  ? '; domain=' + options.domain : '',
				options.secure  ? '; secure' : ''
			].join(''));
		}

		// read
		var decode = config.raw ? raw : decoded;
		var cookies = document.cookie.split('; ');
		for (var i = 0, l = cookies.length; i < l; i++) {
			var parts = cookies[i].split('=');
			if (decode(parts.shift()) === key) {
				var cookie = decode(parts.join('='));
				return config.json ? JSON.parse(cookie) : cookie;
			}
		}

		return null;
	};

	config.defaults = {};

	$.removeCookie = function (key, options) {
		if ($.cookie(key) !== null) {
			$.cookie(key, null, options);
			return true;
		}
		return false;
	};

})(jQuery, document);

/**
 * findAndReplaceDOMText v 0.4.0
 * @author James Padolsey http://james.padolsey.com
 * @license http://unlicense.org/UNLICENSE
 *
 * Matches the text of a DOM node against a regular expression
 * and replaces each match (or node-separated portions of the match)
 * in the specified element.
 */
window.findAndReplaceDOMText = (function() {

	var PORTION_MODE_RETAIN = 'retain';
	var PORTION_MODE_FIRST = 'first';

	var doc = document;
	var toString = {}.toString;

	function isArray(a) {
		return toString.call(a) == '[object Array]';
	}

	function escapeRegExp(s) {
		return String(s).replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1');
	}

	function exposed() {
		// Try deprecated arg signature first:
		return deprecated.apply(null, arguments) || findAndReplaceDOMText.apply(null, arguments);
	}

	function deprecated(regex, node, replacement, captureGroup, elFilter) {
		if ((node && !node.nodeType) && arguments.length <= 2) {
			return false;
		}
		var isReplacementFunction = typeof replacement == 'function';

		if (isReplacementFunction) {
			replacement = (function(original) {
				return function(portion, match) {
					return original(portion.text, match.startIndex);
				};
			}(replacement));
		}

		// Awkward support for deprecated argument signature (<0.4.0)
		var instance = findAndReplaceDOMText(node, {

			find: regex,

			wrap: isReplacementFunction ? null : replacement,
			replace: isReplacementFunction ? replacement : '$' + (captureGroup || '&'),

			prepMatch: function(m, mi) {

				// Support captureGroup (a deprecated feature)

				if (!m[0]) throw 'findAndReplaceDOMText cannot handle zero-length matches';

				if (captureGroup > 0) {
					var cg = m[captureGroup];
					m.index += m[0].indexOf(cg);
					m[0] = cg;
				}
		 
				m.endIndex = m.index + m[0].length;
				m.startIndex = m.index;
				m.index = mi;

				return m;
			},
			filterElements: elFilter
		});

		exposed.revert = function() {
			return instance.revert();
		};

		return true;
	}

	/** 
	 * findAndReplaceDOMText
	 * 
	 * Locates matches and replaces with replacementNode
	 *
	 * @param {Node} node Element or Text node to search within
	 * @param {RegExp} options.find The regular expression to match
	 * @param {String|Element} [options.wrap] A NodeName, or a Node to clone
	 * @param {String|Function} [options.replace='$&'] What to replace each match with
	 * @param {Function} [options.filterElements] A Function to be called to check whether to
	 *	process an element. (returning true = process element,
	 *	returning false = avoid element)
	 */
	function findAndReplaceDOMText(node, options) {
		return new Finder(node, options);
	}

	exposed.Finder = Finder;

	/**
	 * Finder -- encapsulates logic to find and replace.
	 */
	function Finder(node, options) {

		options.portionMode = options.portionMode || PORTION_MODE_RETAIN;

		this.node = node;
		this.options = options;

		// ENable match-preparation method to be passed as option:
		this.prepMatch = options.prepMatch || this.prepMatch;

		this.reverts = [];

		this.matches = this.search();

		if (this.matches.length) {
			this.processMatches();
		}

	}

	Finder.prototype = {

		/**
		 * Searches for all matches that comply with the instance's 'match' option
		 */
		search: function() {

			var match;
			var matchIndex = 0;
			var regex = this.options.find;
			var text = this.getAggregateText();
			var matches = [];

			regex = typeof regex === 'string' ? RegExp(escapeRegExp(regex), 'g') : regex;

			if (regex.global) {
				while (match = regex.exec(text)) {
					matches.push(this.prepMatch(match, matchIndex++));
				}
			} else {
				if (match = text.match(regex)) {
					matches.push(this.prepMatch(match, 0));
				}
			}

			return matches;

		},

		/**
		 * Prepares a single match with useful meta info:
		 */
		prepMatch: function(match, matchIndex) {

			if (!match[0]) {
				throw new Error('findAndReplaceDOMText cannot handle zero-length matches');
			}
	 
			match.endIndex = match.index + match[0].length;
			match.startIndex = match.index;
			match.index = matchIndex;

			return match;
		},

		/**
		 * Gets aggregate text within subject node
		 */
		getAggregateText: function() {

			var elementFilter = this.options.filterElements;

			return getText(this.node);

			/**
			 * Gets aggregate text of a node without resorting
			 * to broken innerText/textContent
			 */
			function getText(node) {

				if (node.nodeType === 3) {
					return node.data;
				}

				if (elementFilter && !elementFilter(node)) {
					return '';
				}

				var txt = '';

				if (node = node.firstChild) do {
					txt += getText(node);
				} while (node = node.nextSibling);

				return txt;

			}

		},

		/** 
		 * Steps through the target node, looking for matches, and
		 * calling replaceFn when a match is found.
		 */
		processMatches: function() {

			var matches = this.matches;
			var node = this.node;
			var elementFilter = this.options.filterElements;

			var startPortion,
				endPortion,
				innerPortions = [],
				curNode = node,
				match = matches.shift(),
				atIndex = 0, // i.e. nodeAtIndex
				matchIndex = 0,
				portionIndex = 0,
				doAvoidNode;

			out: while (true) {

				if (curNode.nodeType === 3) {

					if (!endPortion && curNode.length + atIndex >= match.endIndex) {

						// We've found the ending
						endPortion = {
							node: curNode,
							index: portionIndex++,
							text: curNode.data.substring(match.startIndex - atIndex, match.endIndex - atIndex),
							indexInMatch: atIndex - match.startIndex,
							indexInNode: match.startIndex - atIndex, // always zero for end-portions
							endIndexInNode: match.endIndex - atIndex,
							isEnd: true
						};

					} else if (startPortion) {
						// Intersecting node
						innerPortions.push({
							node: curNode,
							index: portionIndex++,
							text: curNode.data,
							indexInMatch: atIndex - match.startIndex,
							indexInNode: 0 // always zero for inner-portions
						});
					}

					if (!startPortion && curNode.length + atIndex > match.startIndex) {
						// We've found the match start
						startPortion = {
							node: curNode,
							index: portionIndex++,
							indexInMatch: 0,
							indexInNode: match.startIndex - atIndex,
							endIndexInNode: match.endIndex - atIndex,
							text: curNode.data.substring(match.startIndex - atIndex, match.endIndex - atIndex)
						};
					}

					atIndex += curNode.data.length;

				}

				doAvoidNode = curNode.nodeType === 1 && elementFilter && !elementFilter(curNode);

				if (startPortion && endPortion) {

					curNode = this.replaceMatch(match, startPortion, innerPortions, endPortion);

					// processMatches has to return the node that replaced the endNode
					// and then we step back so we can continue from the end of the 
					// match:

					atIndex -= (endPortion.node.data.length - endPortion.endIndexInNode);

					startPortion = null;
					endPortion = null;
					innerPortions = [];
					match = matches.shift();
					portionIndex = 0;
					matchIndex++;

					if (!match) {
						break; // no more matches
					}

				} else if (
					!doAvoidNode &&
					(curNode.firstChild || curNode.nextSibling)
				) {
					// Move down or forward:
					curNode = curNode.firstChild || curNode.nextSibling;
					continue;
				}

				// Move forward or up:
				while (true) {
					if (curNode.nextSibling) {
						curNode = curNode.nextSibling;
						break;
					} else if (curNode.parentNode !== node) {
						curNode = curNode.parentNode;
					} else {
						break out;
					}
				}

			}

		},

		/**
		 * Reverts ... TODO
		 */
		revert: function() {
			// Reversion occurs backwards so as to avoid nodes subsequently
			// replaced during the matching phase (a forward process):
			for (var l = this.reverts.length; l--;) {
				this.reverts[l]();
			}
			this.reverts = [];
		},

		prepareReplacementString: function(string, portion, match, matchIndex) {
			var portionMode = this.options.portionMode;
			if (
				portionMode === PORTION_MODE_FIRST &&
				portion.indexInMatch > 0
			) {
				return '';
			}
			string = string.replace(/\$(\d+|&|`|')/g, function($0, t) {
				var replacement;
				switch(t) {
					case '&':
						replacement = match[0];
						break;
					case '`':
						replacement = match.input.substring(0, match.startIndex);
						break;
					case '\'':
						replacement = match.input.substring(match.endIndex);
						break;
					default:
						replacement = match[+t];
				}
				return replacement;
			});

			if (portionMode === PORTION_MODE_FIRST) {
				return string;
			}

			if (portion.isEnd) {
				return string.substring(portion.indexInMatch);
			}

			return string.substring(portion.indexInMatch, portion.indexInMatch + portion.text.length);
		},

		getPortionReplacementNode: function(portion, match, matchIndex) {

			var replacement = this.options.replace || '$&';
			var wrapper = this.options.wrap;

			if (wrapper && wrapper.nodeType) {
				// Wrapper has been provided as a stencil-node for us to clone:
				var clone = doc.createElement('div');
				clone.innerHTML = wrapper.outerHTML || new XMLSerializer().serializeToString(wrapper);
				wrapper = clone.firstChild;
			}

			if (typeof replacement == 'function') {
				replacement = replacement(portion, match, matchIndex);
				if (replacement && replacement.nodeType) {
					return replacement;
				}
				return doc.createTextNode(String(replacement));
			}

			var el = typeof wrapper == 'string' ? doc.createElement(wrapper) : wrapper;

			replacement = doc.createTextNode(
				this.prepareReplacementString(
					replacement, portion, match, matchIndex
				)
			);

			if (!el) {
				return replacement;
			}

			el.appendChild(replacement);

			return el;
		},

		replaceMatch: function(match, startPortion, innerPortions, endPortion) {

			var matchStartNode = startPortion.node;
			var matchEndNode = endPortion.node;

			var preceedingTextNode;
			var followingTextNode;

			if (matchStartNode === matchEndNode) {

				var node = matchStartNode;

				if (startPortion.indexInNode > 0) {
					// Add `before` text node (before the match)
					preceedingTextNode = doc.createTextNode(node.data.substring(0, startPortion.indexInNode));
					node.parentNode.insertBefore(preceedingTextNode, node);
				}

				// Create the replacement node:
				var newNode = this.getPortionReplacementNode(
					endPortion,
					match
				);

				node.parentNode.insertBefore(newNode, node);

				if (endPortion.endIndexInNode < node.length) { // ?????
					// Add `after` text node (after the match)
					followingTextNode = doc.createTextNode(node.data.substring(endPortion.endIndexInNode));
					node.parentNode.insertBefore(followingTextNode, node);
				}

				node.parentNode.removeChild(node);

				this.reverts.push(function() {
					if (preceedingTextNode === newNode.previousSibling) {
						preceedingTextNode.parentNode.removeChild(preceedingTextNode);
					}
					if (followingTextNode === newNode.nextSibling) {
						followingTextNode.parentNode.removeChild(followingTextNode);
					}
					newNode.parentNode.replaceChild(node, newNode);
				});

				return newNode;

			} else {
				// Replace matchStartNode -> [innerMatchNodes...] -> matchEndNode (in that order)


				preceedingTextNode = doc.createTextNode(
					matchStartNode.data.substring(0, startPortion.indexInNode)
				);

				followingTextNode = doc.createTextNode(
					matchEndNode.data.substring(endPortion.endIndexInNode)
				);

				var firstNode = this.getPortionReplacementNode(
					startPortion,
					match
				);

				var innerNodes = [];

				for (var i = 0, l = innerPortions.length; i < l; ++i) {
					var portion = innerPortions[i];
					var innerNode = this.getPortionReplacementNode(
						portion,
						match
					);
					portion.node.parentNode.replaceChild(innerNode, portion.node);
					this.reverts.push((function(portion, innerNode) {
						return function() {
							innerNode.parentNode.replaceChild(portion.node, innerNode);
						};
					}(portion, innerNode)));
					innerNodes.push(innerNode);
				}

				var lastNode = this.getPortionReplacementNode(
					endPortion,
					match
				);

				matchStartNode.parentNode.insertBefore(preceedingTextNode, matchStartNode);
				matchStartNode.parentNode.insertBefore(firstNode, matchStartNode);
				matchStartNode.parentNode.removeChild(matchStartNode);

				matchEndNode.parentNode.insertBefore(lastNode, matchEndNode);
				matchEndNode.parentNode.insertBefore(followingTextNode, matchEndNode);
				matchEndNode.parentNode.removeChild(matchEndNode);

				this.reverts.push(function() {
					preceedingTextNode.parentNode.removeChild(preceedingTextNode);
					firstNode.parentNode.replaceChild(matchStartNode, firstNode);
					followingTextNode.parentNode.removeChild(followingTextNode);
					lastNode.parentNode.replaceChild(matchEndNode, lastNode);
				});

				return lastNode;
			}
		}

	};

	return exposed;

}());
