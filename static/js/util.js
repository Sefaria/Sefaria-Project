var sjs = sjs || {};

sjs.cache = {
	// Caching of texts
	// Handles remaking opjects to match requests.
	// E.g, text for "Shemot 4:7" is the same as that for "Shemot 4:3" (since context is given)
	// save/get will trim data of "Shemot 4:7" to "Shemot 4" so it can be remade into "Shemot 4:3" if requested
	get: function(ref) {
		var pRef = parseRef(ref);
		var normRef = makeRef(pRef);

		if (normRef in this._cache) {
			var data = clone(this._cache[normRef]);
			
			if (!("remake" in data))
				return data;
		
			// If the ref has more than 1 section listed, try trimming the last section
			var normRef = normRef.replace(/:/g, ".").slice(0, normRef.lastIndexOf("."));

			var data = clone(this._cache[normRef]);
			var lastSection = parseInt(pRef.sections[pRef.sections.length -1]);
			var lastToSection = parseInt(pRef.toSections[pRef.toSections.length -1]);
			
			data.sections.push(lastSection);
			data.toSections.push(lastToSection);
			data.ref = ref;
			
			return data;
		}

		return false;
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
					  msg: "Unkown text. Would you like to add it?",
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
	console.log("Seeing: " + ref);
	console.log("Test Queue:");
	console.log(sjs.ref.tests)
	// Walk backwards through all tests, give the message and do the action of first match
	for (var i = tests.length -1;  i > -1;  i--) {
		if (ref.match(tests[i].test)) {
			action = tests[i].action;
			$msg.html("<i>"+tests[i].msg+"</i>");
			break;
		}
	}
	$msg.removeClass("he");
	
	console.log("Action: " + action);
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
						

					
					} else {
						$input.val(data.title + " ")
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
			});
			break;
		
		// get information about a book entered as the object of a commentator 
		//(e.g. the "Genesis" in "Rashi on Genesis")		
		case("getCommentaryBook"):
		console.log("gcb")
		console.log("ref: " + ref)
			
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
						
						console.log("level: " + level);
						console.log("length: " + data.sectionNames.length);

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
