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
		data = sjs.cache.get(ref);
		if (data) {
			callback(data);
		} else {
			$.getJSON("/api/texts/" + normRef(ref), callback);
		}
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
	_cache: {}
}

sjs.track = {
	// Helper functions for Google Analytics event tracking
	event: function(category, action, label) {
		// Generic event tracker
		_gaq.push(['_trackEvent', category, action, label]);
	},
	open: function(ref) {
		// Track opening a specific text ref
		sjs.track.event("Reader", "Open", ref);
	},
	ui: function(label) {
		// Track some action in the Reader UI
		sjs.track.event("Reader", "UI", label);
	},
	sheets: function(label) {
		sjs.track.event("Sheets", "UI", label);
	}
}


function prefetch(ref) {
	// grab a text from the server and put it in the cache
	if (!ref) return;
	
	ref = makeRef(parseRef(ref));
	if (sjs.cache.get(ref)) return;	

	$.getJSON("/api/texts/" + ref, function(data) {
		if (data.error) return;
		sjs.cache.save(data);
	})
}


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



function checkRef($input, $msg, $ok, level, success, commentatorOnly) {
	
	/* check the user inputed text ref
	   give fedback to make it corret to a certain level of specificity 
	   talk to the server when needed to find section names
		* level -- how deep the ref should go - (0: to the end, 1: one level above)
		* success -- a function to call when a valid ref has been found
		* commentatorOnly --- whether to stop at only a commentatory name
	*/
	
	// Specfic to sheets for now, remove preview text
	$("#textPreview").remove();

	// sort books by length so longest matches first in regex
	var sortedBooks = sjs.books.sort(function(a,b){
		if (a.length == b.length) return 0;
		return (a.length < b.length ? 1 : -1); 
	})
	
	var booksReStr = "^(" + sortedBooks.join("\\b|") + ")";
	var booksRe = new RegExp(booksReStr, "i");
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
					  msg: "...",
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
			// also reaches into specific logic
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
					$ok.addClass("inactive");

					// ------- Commetator Name Entered -------------
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

					// ------- Talmud Mesechet Entered -------------
					} else if (data.categories[0] == "Talmud") {
						$input.val(data.title)
							.autocomplete("close");
						
						sjs.ref.tests.push(
							{test: RegExp("^" + data.title),
							 msg: "Enter a <b>Daf</b> of Tractate " + data.title + " to add, e.g. " +
							 	data.title + " 4b",
							 action: "pass"});
						if (level == 1) {
							sjs.ref.tests.push(
								{test:  RegExp("^" + data.title + " \\d+[ab]$", "i"),
								 msg: "OK. Click <b>add</b> to continue.",
								 action: "ok"});
						} else {
							sjs.ref.tests.push(
								{test:  RegExp("^" + data.title + " \\d+[ab]", "i"),
								 msg: "Enter a starting <b>line number</b>, e.g. " + 
								 	data.title + " 4b:1",
								 action: "pass"});
							sjs.ref.tests.push(
								{test:  RegExp("^" + data.title + " \\d+[ab][ .:]\\d+", "i"),
								 msg: "Enter an ending <b>line number</b>, e.g. " +
								 	data.title + " 4b:1-5",
								 action: "pass"});	
							sjs.ref.tests.push(
								{test:  RegExp("^" + data.title + " \\d+[ab][ .:]\\d+-\\d+$", "i"),
								 msg: "",
								 action: "ok"});
						}
						
					// -------- All Other Texts ------------
					} else {
						$input.val(data.title)
							.autocomplete("close");
						var bookRe = new RegExp("^" + data.title + " ?$");
						sjs.ref.tests.push(
									{test: bookRe,
									 msg: "Enter a <b>" + data.sectionNames[0] + "</b> of " + data.title + 
									 	" to add, e.g., " + data.title + " 5",
									 action: "pass"});
						
						var reStr = "^" + data.title + " \\d+"
						for (var i = 0; i < data.sectionNames.length - level - 1; i++) {
							sjs.ref.tests.push(
									{test: RegExp(reStr),
									msg: "Enter a <b>" + data.sectionNames[i+1] + "</b> of " + data.title + 
										" to add, e.g., " + data.title + " 5:7",
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
			}); // End getBook case
			break;
		
		// get information about a book entered as the object of a commentator 
		//(e.g. the "Genesis" in "Rashi on Genesis")		
		case("getCommentaryBook"):
		//console.log("gcb")
		//console.log("ref: " + ref)
			
			// reset stored title to commentator name only
			sjs.ref.index.title = ref.slice(0, ref.indexOf(" on "));
			var book = ref.slice((sjs.ref.index.title + " on ").length) 
			
			$.getJSON("/api/index/" + book, function(data){
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
							 msg: "Enter a Daf of tractate " + data.title + ", e.g, " +
							 	data.title + " 4b",
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
						
						//console.log("level: " + level);
						//console.log("length: " + data.sectionNames.length);

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
			.error(function(data) {
				var msg = "<span class='error'>There was an error retrieving this text.</span>";
				if (data && data.responseText) {
				 	var err = JSON.parse(data.responseText);
				 	if ('error' in err) {
				 		msg = "<span class='error'>" + err["error"] + "</span>";
				 	}
				 } 
				$target.html(msg);
				callback();
			});
	}

	function makePreview(data) {
		sjs.cache.save(data);
		var text = en = he = controlsHtml = "";
		
		if (data.sections.length < data.sectionNames.length) {
			data.sections.push(1);
			data.toSections.push(Math.max(data.text.length, data.he.length));
		}
		for (var i = data.sections[data.sections.length-1]-1; i < data.toSections[data.toSections.length-1]; i++) {
			if (data.text.length > i) { en += "<div class='previewLine'>" + data.text[i] + "</div> "; }
			if (data.he.length > i) { he += "<div class='previewLine'>" + data.he[i] + "</div> "; }
		}

		var path = parseURL(document.URL).path;
		if (!en) { en += "<div class='previewNoText'><a href='/add/" + urlRef + "?after=" + path + "' class='btn'>Add English for "+ref+"</a></div>"; }
		if (!he) { he += "<div class='previewNoText'><a href='/add/" + urlRef + "?after=" + path + "' class='btn'>Add Hebrew for "+ref+"</a></div>"; }

		text = "<div class='en'>" + en + "</div>" + "<div class='he'>" + he + "</div>";

		if (data.type == "Talmud") {
			var controlsHtml = "<div class='previewWarn'>" +
				"<a href='/edit/" + [urlRef, 'he', data.heVersionTitle.replace(/ /g, "_")].join("/") + "'class='btn'>Edit Daf</a>" + 
				"Talmud line numbers may not be correct. " + 
				"Please check the line numbers and edit if necessary before adding a source.</div>" + controlsHtml;
		}	

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
	400: "\u05EA"
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
        vars[key] = value;
    });
    return vars;
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
