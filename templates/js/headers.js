{% load sefaria_tags %}

<script src="/static/js/keyboard.js"></script>
<script type="text/javascript">
{% autoescape off %}
	var sjs = sjs || {};

	$.extend(sjs, {
		_email:        "{{ request.user.email|default:'' }}",
		_uid:          {{ request.user.id|default:"null" }},
		books:         {{ titlesJSON|default:"[]" }},
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
		navQuery: function(query) {
			window.location = "/" + normRef(query) + "?nav_query=" + query;
		}		
	});

	$(function() {

		// Search 
		sjs.handleSearch = function() {
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
		};

		// Open a text Box
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
			$(this).css({"width": "300px"});
			$(".keyboardInputInitiator").css({"opacity": 1});
		}).blur(function() {
			$(".keyboardInputInitiator").css({"opacity": 0});
		});
	
		$("#openText").mousedown(sjs.handleSearch);


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
		$(window).click(function(){
			$(".menuOpen").removeClass("menuOpen");
		});


	    // Fill text details in Text Menu with AJAX 
	    $("#textsList .title a").on("click", function(e) {
	        return;
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
			console.log("mr");
			var recipient = parseInt($(this).attr("data-recipient"));
			var name      = $(this).parent().find("a.userLink")[0].outerHTML;;
			sjs.composeMessage(recipient, name);
		});
		$("#notifications").on("click", ".messageView", function() {
			console.log("mv");
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
