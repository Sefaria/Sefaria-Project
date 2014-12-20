{% load sefaria_tags %}

<script src="/static/js/keyboard.js"></script>
<script type="text/javascript">
{% autoescape off %}
	var sjs = sjs || {};

	$.extend(sjs, {
		_email:        "{{ request.user.email|default:'' }}",
		_uid:          {{ request.user.id|default:"null" }},
		books:         {{ titlesJSON|default:"[]" }},
		toc:           {{ toc_json }},
		searchBaseUrl: '{{ SEARCH_URL|default:"http://localhost:9200" }}',
		searchIndex:   '{{ SEARCH_INDEX_NAME }}',
		loggedIn:      {% if user.is_authenticated %}true{% else %}false{% endif %},
		is_moderator:  {% if user.is_staff %}true{% else %}false{% endif %},
		help: {
			videos: {
				intro:       "TaUB0jd0dzI",
				tutorial:    "xXFkweBv7ws",
				sheets:      "iac0GoaH2lY",
				translate:   "rImt5SnNa-8",
				add:         "R4h439Iyk-o",
				edit:        "Go8uJJ9_6ug",
				connections: "Epx-Ou2O_2M",
				newtext:     "gcqsGAP4jfg"
			}
		},
		handleSearch: function() {
			$("#goto").focus();
			var query = $("#goto").val();
			if (query) {
				$("#goto").autocomplete("close");

				if (isRef(query)) {
					sjs.navQuery(query);
					sjs.track.ui("Nav Query");
				} else {
					if (sjs.currentPage !== 'search') {
						window.location="/search?q=" + query.replace(/ /g, "+"); 
					} else {
						History.pushState({q: query}, "Search Jewish Texts | Sefaria.org", "/search?q=" + query);
					}
				}
			}
		},
		navQuery: function(query) {
			window.location = "/" + normRef(query) + "?nav_query=" + query;
		},
		searchInsteadOfNav: function (query) {
			// Displays an option under the search box to search for 'query' rather
			// than treat it as a navigational query.
			var html = "<div id='searchInsteadOfNavPrompt'>" + 
							"Search for '<a href='/search?q=" + query + "'>" + query + "</a>' instead." +
						"</div>";
			$("#searchInsteadOfNavPrompt").remove();
			$(html).appendTo("body").css({left: $("#goto").offset().left});
			setTimeout('$("#searchInsteadOfNavPrompt").remove();', 4000);
		}
	});

	sjs.navPanel = {
		_path: [],
		_sections: [],
		_preview: null,
		init: function() {
			$("#navToc").on("click", ".tocCat", this._handleNavClick);
			$("#navToc").on("click", ".langToggle", function() {
				$("#navToc").removeClass("english hebrew")
					.addClass($(this).attr("data-lang"));
				$("#navToc .langToggle").removeClass("active");
				$(this).addClass("active");
			})
		},
		_handleNavClick: function(e) {
			e.preventDefault();
			$("#navPanelTexts").addClass("expanded");
			var dataPath = $(this).attr("data-path");
			sjs.navPanel._path = dataPath ? dataPath.split("/") : [];
			var dataSections = $(this).attr("data-sections");
			sjs.navPanel._sections = dataSections ? dataSections.split("/") : [];
			sjs.navPanel.setNavContent();
		},
		setNavContent: function() {
			var sections = this._sections;
			if (sections.length && (!sjs.navPanel._preview || sections[0] != sjs.navPanel._preview.title)) {
				var url = "/api/preview/" + sections[0];
				$.getJSON(url, function(data){
					if ("error" in data) {
						sjs.alert.message(data.error)
					} else {
						sjs.navPanel._preview = data;
						sjs.navPanel.setNavContent();
					}
				});
				return;
			}
			var html = this.makeNavContent();
			$("#navToc").html(html);
			if (this._path.length === 0) {
				$("#navPanelLinks, #navPanelFooter, .navLine").show();
			} else {
				$("#navPanelLinks, #navPanelFooter, .navLine").hide();
			}
			$(".navLine").eq(0).show();
		},
		makeNavContent: function() {
			var path         = this._path;
			var sections     = this._sections;
			var previewDepth = sections.length;
			var basePath     = path.join("/");
			var backPath     = path.slice(0, -1).join("/").replace(/\'/g, "&apos;");
			var backSections = sections.slice(0, -1).join("/").replace(/\'/g, "&apos;");

			// Language Toggle
			var html = "<div id='navTocLangToggleBox'><div id='navTocLangToggle' class='toggle'>" +
						"<div class='langToggle toggleOption " + ($("#navToc").hasClass("english") ? "active" : "") + "' data-lang='english'>" +
							"<img src='/static/img/english.png' /></div>" +
						"<div class='langToggle toggleOption " + ($("#navToc").hasClass("hebrew") ? "active" : "") + "' data-lang='hebrew'>" + 
							"<img src='/static/img/hebrew.png' /></div>" +
						"</div></div>"

			//  Header - Back Link & Breadcrumbs
			if (path.length === 0) {
				html += '<div id="navPanelTextsHeader">Browse Texts</div>';
			} else {
				// Back Link
				html += "<div class='tocCat backLink' data-path='" + (sections.length ? basePath : backPath) + "' " +
								"data-sections='" + backSections + "'><i class='fa fa-angle-left'></i> back</div>" ;
				// Breadcumbs
				var cats = [];
				for (var i = 0; i < path.length; i++) {
					var catPath = path.slice(0, i+1).join("/");
					cats.push("<div class='tocCat tocCatHeader' data-path='" + catPath + "'>" + path[i] + "</div>");
				}
				for (var i = 0; i < sections.length; i++) {
					var sectionPath = sections.slice(0, i+1).join("/");
					cats.push("<div class='tocCat tocCatHeader' data-path='" + catPath + "'" +
								"data-sections='" + sectionPath + "'>" + 
								(i > 0 ? this._preview.sectionNames[i-1] + " " : "") +
								sections[i] + 
							  "</div>");
				}
				html += "<div id='tocCatHeaders'>" + 
								cats.join(" &raquo; ") + 
								"<div class='clear'></div>" + 
							"</div>";

			}

			// List Content - Categories, Texts, Sections or Section Previews
			if (!sections.length) {
				// Categories & Texts
				var node = this.getTocNode(path);
				for (var i=0; i < node.length; i++) {
					var catPath = basePath ? (node[i].category ? basePath + "/" + node[i].category : basePath ) : node[i].category;

					if ("title" in node[i]) {
						// Text
						html += "<a class='tocCat sparse" + node[i].sparseness + "' href='/" + node[i].title.replace(/\'/g, "&apos;") + "'" +
									 "data-path='" + catPath + "'" +
									 "data-sections='" + node[i].title.replace(/\'/g, "&apos;") +"'>" + 
									 	"<i class='fa fa-angle-right'></i>" +
									 	"<span class='en'>" + node[i].title + "</span>" +
									 	"<span class='he'>" + node[i].heTitle + "</span>" +
								"</a>";
					} else {
						// Category
						html += "<div class='tocCat' data-path='" + catPath + "'>" + 
									"<i class='fa fa-angle-right'></i>" +
									"<span class='en'>" + node[i].category + "</span>" +
									"<span class='he'>" + node[i].heCategory + "</span>" +
								"</div>"
					}
				}				
			} else {
				// Sections & Section Previews
				var isTalmud       = $.inArray("Talmud", path) >- 1;
				var isCommentary   = $.inArray("Commentary", path) > -1;
				var previewSection = this._preview.preview;
				for (var i = 1; i < sections.length; i++) {
					// Zoom in to the right section of the preview
					var j = (isTalmud && isCommentary && i === 1) ? dafToInt(sections[1]) : sections[i] - 1;
					previewSection = previewSection[j];
				}
				if (previewDepth >= this._preview.sectionNames.length -1 ) {
					// Section Preview (terminal depth, preview text)
					for (var i=1; i <= previewSection.length; i++) {
						var num   = isTalmud && !isCommentary ? intToDaf(i-1) : i;
						var url   = ("/" + sections.join(".") + "." + num).replace(/\'/g, "&apos;");
						var he    = previewSection[i-1].he;
						var en    = previewSection[i-1].en;
						if (!en && !he) { continue; }
						var klass = (he ? "" : "enOnly") + " " + (en ? "" : "heOnly");
						html += "<a class='tocLink previewLink " + klass + "' href='" + url + "'>" +
									"<i class='fa fa-angle-right'></i>" +
									"<div class='en'><span class='segmentNumber'>" + num + ".</span>" + en + "</div>" +
									"<div class='he'><span class='segmentNumber'>" + num + ".</span>" + he + "</div>" +
								"</a>";
					}
					if (!previewSection.length) {
						html += "<br><center><i>No text available.</i></center>";
					}
				} else {
					// Sections List ("Chapter 1, Chapter 2")
					for (var i=0; i < previewSection.length; i++) {
						var ps = previewSection[i];
						console.log(ps);
						if (typeof ps == "object" && ps.en == "" && ps.he == "") {
							console.log("skip")
							continue; // Skip sections with no content
						}
						var num = isTalmud && isCommentary ? intToDaf(i) : (i+1);
						html += "<div class='tocCat' data-path='" + basePath + "'" +
									"data-sections='" + sections.join("/").replace(/\'/g, "&apos;") + "/" + num + "'>" +
										"<i class='fa fa-angle-right'></i>" +
										"<span class='en'>" + this._preview.sectionNames[previewDepth-1] + " " + num + "</span>" +
										"<span class='he'>" + this._preview.heSectionNames[previewDepth-1] + " " + num + "</span>" +
								"</div>";
					}
				}
			}
			return html;
		},
		getTocNode: function(path, toc) {
			toc = toc || sjs.toc;
			if (path.length === 0) {
				return toc;
			}
			for (var i=0; i < toc.length; i++) {
				if (toc[i].category === path[0]) {
					if (path.length == 1) {
						return toc[i].contents;
					} else {
						return this.getTocNode(path.slice(1), toc[i].contents);
					}
				}
			}
			return null;
		}
	};

	$(function() {

		// Search / Open a Text Box
		$("#goto").autocomplete({ source: function( request, response ) {
				var matches = $.map( sjs.books, function(tag) {
						if ( tag.toUpperCase().indexOf(request.term.toUpperCase()) === 0 ) {
							return tag;
						}
					});
				response(matches);
			}
		}).keypress(function(e) {
			if (e.keyCode == 13) {
				sjs.handleSearch();
			}
		}).focus(function() {
			//$(this).css({"width": "300px"});
			$(".keyboardInputInitiator").css({"opacity": 1});
		}).blur(function() {
			$(".keyboardInputInitiator").css({"opacity": 0});
		});
	
		$("#openText").mousedown(sjs.handleSearch);


		// NavPanel
		sjs.navPanel.init();
		$("#left").click(function(){
			$("#navPanel").toggleClass("navPanelOpen");
		});
		$("#navPanel, #left").click(function(e) {
			e.stopPropagation();
		});
		$("#aboutSefaria").click(function(e){
			$("#navPanelLinks").hide();
			$("#navPanelAboutLinks").show();
			e.preventDefault();
		});
		$("#aboutLinksBack").click(function(e){
			$("#navPanelLinks").show();
			$("#navPanelAboutLinks").hide();
			e.preventDefault();
		});
		$("#navPanelTextsMore #moreLink").click(function() {
			$("#navPanelTexts").addClass("expanded");
		});

		// Close menus on outside click
		$(window).click(function(){
			$(".menuOpen").removeClass("menuOpen");
			$("#navPanel.navPanelOpen").removeClass("navPanelOpen");
		});

		// Show the Search instead of query modal if it's in params
		var params = getUrlVars();
		if ("nav_query" in params) {
			sjs.searchInsteadOfNav(params.nav_query);
		}

		/*
		// Top Menus showing / hiding
		$("#sefaria, #textsMenu").on("click touch", function(e) {
			e.stopPropagation();
			$(".menuOpen").removeClass("menuOpen");
			$(this).addClass("menuOpen");
		});
		$("#textsMenu .category, #addTextRow").on("mouseenter touch", function(e) {
			if ($(this).hasClass("menuOpen")) { return; }
			
			$("#textsMenu .category.menuOpen").removeClass("menuOpen");
			$(this).addClass("menuOpen");
			$(this).parents(".category").addClass("menuOpen");
			
			$(this).find(".subBox").eq(0).position({my:"left top", at: "right top", of: $(this)});
			e.stopPropagation();
		});
		$("#textsMenu .category, #textsMenu .text").on("click touch", function(e) {
			e.stopPropagation();
		})

		*/



	    // Fill text details in Text Menu with AJAX 
	    /*$("#textsList .title a").on("click", function(e) {
	        e.preventDefault();
	        e.stopPropagation();

	        var $details = $(this).closest(".text").find(".details");
	        closing = $details.children().length

	        if (closing) {
	            $details.empty()
	            	.closest(".text").removeClass("hasDetails");
	        } else {
		        var url = "/api/counts" + $(this).attr("href");
		        $.getJSON(url, sjs.makeTextDetails);
		        $details.addClass("makeTarget");	        	
	        }

	    });
	    $("#textsList .text").on("click", function() {
	    	if (!$(this).hasClass("hasDetails")) {
	    		$(this).find(".title a").trigger("click");
	    	}
	    });
		*/
		// Allow clicks on full .text element to trigger link click 
		$("#textsList .text").on("click", function() {
    		window.location = $(this).find(".title a").attr("href");
		});

	    // Notifications - Mark as read
	    $("#notificationsButton").mouseenter(function() {
	    	if ($("#newNotificationsCount").length) {
				sjs.markNotificationsAsRead();
	    	}
	    });
	    sjs.markNotificationsAsRead = function() {
			var ids = []
			$(".notification.unread").each(function() {
				ids.push($(this).attr("data-id"));
			});
			if (ids.length) {
				$.post("/api/notifications/read", {notifications: JSON.stringify(ids)}, function(data) {
					console.log(data)
				});			
			}
			var unread = parseInt($("#newNotificationsCount").text()) - ids.length;
			if (unread == 0 ) {
				$("#newNotificationsCount").hide();
			}
			$("#newNotificationsCount").text(unread);
 			
	    };

	    // Notifications - Load more through scrolling
	    sjs.notificationsPage = 1;
	    $('#notifications').bind('scroll', function() {
        	if($(this).scrollTop() + $(this).innerHeight() >= this.scrollHeight) {
         	   sjs.loadMoreNotifications();
        	}
    	});
    	sjs.loadMoreNotifications = function() {
    		$.getJSON("/api/notifications?page=" + sjs.notificationsPage, function(data) {
    			if (data.count < data.page_size) {
    				$("#notifications").unbind("scroll");
    			} 
				$("#notifications").append(data.html);
				sjs.notificationsPage = data.page + 1;
    			sjs.markNotificationsAsRead();
    		})
    	};


    	// Messages
    	sjs.composeMessage = function(recipient, name) {
    		$("#viewMessage").remove();
    		var composerHTML = "<div id='messageComposer' class='modal'>" +
									"<div id='messageHeader'>Send a message to " + name + "</div>" +
									"<textarea id='messageTextarea'></textarea>" +
									"<div class='sendMessage btn btn-primary'>Send</div>" +
									"<div class='cancel btn'>Cancel</div>" +
								"</div>";

			$(composerHTML).appendTo("body").show()
				.position({of: window})
				.draggable({cancel: "textarea"});
			$("#overlay").show();
			$("#messageTextarea").focus();
			$(".sendMessage").click(function(e){
				sjs.postMessage(recipient, $("#messageTextarea").val());
			});
			$("#messageComposer .cancel").click(function(e){
				$("#messageComposer").remove();
				$("#overlay").hide();
			});
		};
		sjs.postMessage = function(recipient, message) {
			if (!message) { return; }
			var postJSON = JSON.stringify({ 
				recipient: recipient,
				message: message.escapeHtml()
			});
			$.post("/api/messages", {json: postJSON}, function(data) {
				$("#messageComposer").remove();
				sjs.alert.message("Message Sent");
				sjs.track.event("Messages", "Message Sent", "");
			});
		};
		sjs.viewMessage = function(sender, name, message) {
			var messageHtml = "<div id='viewMessage' class='modal'>" +
									"<div id='messageHeader'>Message from " + name + "</div>" +
									"<div id='messageText'>" + message + "</div>" +
									"<div class='messageReply btn btn-primary' data-recipient='" + sender +"'>Reply</div>" +
									"<div class='cancel btn'>Close</div>" +
								"</div>";				
			$(messageHtml).appendTo("body").show()
				.position({of: window})
				.draggable({cancel: "#messageText"});
			$("#overlay").show();
			$("#viewMessage .cancel").click(function(e){
				$("#viewMessage").remove();
				$("#overlay").hide();
			});

		};
		{% if profile %}
		$("#messageMe").click(function() {
			{% if request.user.is_authenticated %}
			sjs.composeMessage({{ profile.id }}, "{{ profile.first_name }} {{profile.last_name }}");
			{% else %}
			sjs.loginPrompt();
			{% endif %}
		});
		{% endif %}
		$("body, #notifications").on("click", ".messageReply", function() {
			var recipient = parseInt($(this).attr("data-recipient"));
			var name      = $(this).parent().find("a.userLink")[0].outerHTML;;
			sjs.composeMessage(recipient, name);
		});
		$("#notifications").on("click", ".messageView", function() {
			var recipient = parseInt($(this).attr("data-recipient"));
			var name      = $(this).parent().find("a.userLink")[0].outerHTML;
			var message   = $(this).parent().find(".messageText").html();
			sjs.viewMessage(recipient, name, message);			
		});


	    // Help modal - open/close
	    sjs.help.open = function(e){
	    	var vid = $("#helpVideoButtons .btn-success").attr("id").substring(5);
	    	sjs.help.makeVideo(vid);
	    	$("#overlay, #helpModal").show().position({of: window, collision: "fit"});
	    	$(".menuOpen").removeClass("menuOpen");
	    	if (e) {
	    		e.preventDefault();
	    		e.stopPropagation();
	    	}
	    	sjs.track.event("Help", "Open", "");
	    }
	    $(".helpLink").click(sjs.help.open);
	    $("#helpClose").click(function() {
	    	$("#overlay, #helpModal").hide();
    		$("#helpVideo").remove();
	    });

	    // Help modal - switch videos
	    sjs.help.openVideo = function(vid) {
	    	$("#helpVideoButtons .btn").removeClass("btn-success");
	    	$("#help-" + vid).addClass("btn-success");
	    	sjs.help.makeVideo(vid);
	    	sjs.track.event("Help", "Video", vid);
	    };
	    sjs.help.makeVideo = function(vid) {
	    	var url = "http://www.youtube.com/embed/" + 
	    					sjs.help.videos[vid] + 
	    					"?enablejsapi=1&rel=0&autoplay=1";
	    	var html = '<iframe id="helpVideo" src="' + url + '" frameborder="0" allowfullscreen></iframe>'
	    	$("#helpVideoBox").html(html);
	    }
	    $("#helpVideoButtons .btn").click(function(){
	    	var vid = this.id.substring(5); // remove 'help-' from id
	    	sjs.help.openVideo(vid);
	    });


	    // Move Goto box, controls into hidden menu for small screen size 
	    var mobileLayout = function() {
	    	var width = $(window).width();
	    	var $gotoBox = $("#gotoBox");
			var $controls = $("#controls");

			// gotoBox into options bar	    	
	    	if (width >= 500 && $gotoBox.parent().attr("id") === "rightButtons") {
	    		$("#breadcrumbs").before($gotoBox);
	    	} else if (width < 500 && $gotoBox.next().attr("id") === "breadcrumbs") {
	    		$gotoBox.appendTo("#rightButtons");
	    	}

	    	// Source Sheets controls into options bar
	    	if (width >= 800 && $controls.parent().attr("id") === "rightButtons") {
	    		$("#sheet").before($controls);
	    	} else if (width < 800 && $controls.next().attr("id") === "sheet") {
	    		$controls.prependTo("#rightButtons");
	    	}
	    };
	    $(window).resize(mobileLayout);
	    mobileLayout();


	    // Show Options Bar button 
	    var showOptionsBar = function() {
	    	$("#accountBox").appendTo("#rightButtons");
	    	$("#rightButtons").show();
	    };
	    var hideOptionsBar = function() {
	    	$("#accountBox").prependTo("#rightButtons");
	    	$("#rightButtons").css("display", "");
	    };
	    $("#showOptions").click(function(e){
	    	if ($("#rightButtons").is(":visible")) {
	    		hideOptionsBar();
	    	} else {
	    		showOptionsBar();
	    		e.stopPropagation();
	    	}
	    })
	    $("#rightButtons").click(function(e){e.stopPropagation();});
	    $(window).click(hideOptionsBar);
	});
{% endautoescape %}
</script>
